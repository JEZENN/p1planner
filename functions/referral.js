/* ═══════════════════════════════════════════════════════════════════════
   referral.js — Système de parrainage P1Planner (2026-09-25)
   ───────────────────────────────────────────────────────────────────────
   Port du système de parrainage le produit frère (functions/referral.js,
   validé/testé/corrigé côté le produit frère le 2026-09-24), adapté au schéma
   P1Planner. Ne contient QUE de la logique pure / des constantes,
   testable sans émulateur — les Cloud Functions callables
   (referralInit / referralEnsureCode / referralCheckCode /
   referralMarkActive / referralApplyCode) sont définies dans index.js,
   qui importe ce module. Isolation P0 : aucune dépendance vers le produit frère,
   aucun identifiant/collection/secret partagé — uniquement la LOGIQUE
   (alphabet, paliers, calcul) reprise à l'identique par choix explicite
   de l'utilisateur.

   Règle métier (grille confirmée par l'utilisateur, identique à
   le produit frère) :
     • Un « filleul actif » = un compte créé avec le code d'un parrain,
       ET qui s'est connecté au moins une fois avec son email vérifié
       (auth.html exige déjà l'un pour l'autre — se connecter = actif).
     • 3 filleuls actifs -> 1 mois offert ; 6 -> 3 mois au TOTAL (donc +2
       de plus que le palier précédent) ; 6 est le PLAFOND — un 7e, 10e...
       filleul ne rapporte plus rien. Voir REFERRAL_TIERS ci-dessous :
       une seule ligne à ajouter, triée à sa place, pour un futur palier.
     • Les mois se SURAJOUTENT à ce que le parrain a déjà (essai, formule
       payée, abonnement récurrent) — jamais un remplacement. Pour un
       abonnement Stripe RÉCURRENT (planType:'monthly') déjà actif, le
       bonus ne peut pas être un simple champ Firestore (le prochain
       webhook Stripe l'écraserait au prochain renouvellement) : il doit
       décaler la date de prélèvement elle-même côté Stripe (trial_end) —
       cf. grantReferralBonus() dans index.js, qui appelle
       stripe.subscriptions.update().
   ═══════════════════════════════════════════════════════════════════════ */

const crypto = require("crypto");

/* Alphabet sans caractères ambigus à l'oral/à l'écrit : pas de 0/O ni 1/I. */
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 6;

/* Paliers CUMULATIFS et PLAFONNÉS — triés par seuil DÉCROISSANT pour que
   monthsEarnedForCount() s'arrête au premier palier atteint. Le plus haut
   seuil EST le plafond — aucun palier au-delà. Pour ajouter un palier plus
   tard, une seule ligne à ajouter ici, triée à sa place (rien d'autre à
   changer dans ce fichier). */
const REFERRAL_TIERS = [
  { threshold: 6, months: 3 },
  { threshold: 3, months: 1 }
];

/* Nombre max de tentatives pour réserver un code (collision sur
   referralCodes/{CODE}) avant d'abandonner — 32^6 ≈ 1,07 milliard de
   combinaisons : une collision dès la 1re tentative est déjà très
   improbable, 8 tentatives est une marge très large. */
const REFERRAL_CODE_MAX_ATTEMPTS = 8;

/* Un seul code aléatoire (ne vérifie PAS l'unicité : voir
   reserveReferralCode dans index.js, qui boucle sur cette fonction jusqu'à
   une réservation Firestore réussie). */
function generateReferralCode() {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[crypto.randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/* Un code saisi par un utilisateur peut contenir des espaces ou des
   minuscules (copier-coller, dictée vocale...) : normalise avant toute
   comparaison / recherche Firestore. Retourne null si la forme est
   invalide (longueur, caractères hors alphabet) plutôt que de chercher un
   code qui ne peut de toute façon jamais exister. */
function normalizeReferralCode(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== REFERRAL_CODE_LENGTH) return null;
  for (let i = 0; i < code.length; i++) {
    if (REFERRAL_CODE_ALPHABET.indexOf(code[i]) === -1) return null;
  }
  return code;
}

/* Total de mois gagnés (cumulé, jamais décroissant, PLAFONNÉ) pour un
   nombre de filleuls actifs donné. Paliers : voir REFERRAL_TIERS ci-dessus. */
function monthsEarnedForCount(activeCount) {
  const n = Number.isFinite(activeCount) && activeCount > 0 ? Math.floor(activeCount) : 0;
  for (const tier of REFERRAL_TIERS) {
    if (n >= tier.threshold) return tier.months;
  }
  return 0;
}

/* P1Planner n'a qu'un seul type d'abonnement récurrent ('monthly', voir
   createCheckoutSession dans index.js) — pas d'équivalent 'annual' comme
   le produit frère. Isolé dans une fonction pour rester cohérent avec l'original
   et rendre un futur ajout (ex. annuel) trivial à un seul endroit. */
function isRecurringPremiumType(planType) {
  return planType === "monthly";
}

const REFERRAL_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/* ═══════════════════════════════════════════════════════════════════════
   computeReferralCredit — calcule (SANS toucher Firestore) le nouveau
   compteur, le delta de mois et la mise à jour de dates/statut à appliquer
   à l'entitlement du PARRAIN, à partir de son état actuel. Isolée ici
   (logique pure, testable sans émulateur) pour que index.js n'ait plus
   qu'à lire l'entitlement, appeler cette fonction, et écrire le résultat
   dans LE MÊME tx.update() (voir creditReferrerInTransaction) — jamais de
   FieldValue.increment() séparé après coup (piège n°1, double-crédit en
   cas de filleuls concurrents).

   Décisions d'adaptation P1Planner (pas de champ `status` dans les Rules,
   contrairement à le produit frère où 'active' vaut accès illimité sans date —
   ici canWrite() ne regarde JAMAIS `status`, uniquement writeAccessUntil,
   donc aucun risque de sécurité quel que soit le statut choisi ci-dessous ;
   mais `status`/`trialEndsAt` pilotent l'AFFICHAGE de comptepremium.html
   ET le balayage quotidien sweepExpiredTrials — il faut donc les garder
   cohérents avec le nouvel accès réel, pas seulement writeAccessUntil) :
     - status 'trial'   : le bonus prolonge l'ESSAI (writeAccessUntil ET
       trialEndsAt ensemble, jamais premiumUntil qui resterait à tort à
       null->une date alors que la personne n'a toujours rien payé) ;
       reste 'trial'.
     - status 'active'  : le bonus prolonge l'accès payant déjà en cours
       (writeAccessUntil ET premiumUntil ensemble, jamais raccourci —
       Math.max(actuel, maintenant) + delta mois) ; reste 'active'.
     - status 'expired' : plus aucun accès en cours à prolonger — le bonus
       devient un accès autonome de `delta` mois à partir de MAINTENANT
       (writeAccessUntil ET premiumUntil), et le statut redevient 'active'
       (sinon l'affichage resterait à tort "expiré" malgré un accès réel
       dans le futur — même logique de cohérence que sweepExpiredTrials,
       en sens inverse).
     - Abonnement Stripe RÉCURRENT ('monthly') actuellement 'active' avec
       une souscription Stripe exploitable : AUCUNE date n'est touchée ici
       (le webhook écraserait toute extension au prochain renouvellement) —
       useStripe:true signale à l'appelant qu'un décalage de trial_end côté
       Stripe est nécessaire (hors transaction, voir grantReferralBonus
       dans index.js).
   ═══════════════════════════════════════════════════════════════════════ */
function computeReferralCredit({
  referralActiveCount, referralMonthsGranted, status, planType,
  premiumUntilMs, writeAccessUntilMs, trialEndsAtMs,
  hasExploitableSubscription, cancelAtPeriodEnd, nowMs
}) {
  const newCount = (Number.isFinite(referralActiveCount) && referralActiveCount > 0 ? Math.floor(referralActiveCount) : 0) + 1;
  const prevGranted = Number.isFinite(referralMonthsGranted) && referralMonthsGranted > 0 ? Math.floor(referralMonthsGranted) : 0;
  const newEarned = monthsEarnedForCount(newCount);
  const delta = newEarned - prevGranted;

  const patch = {};
  let useStripe = false;
  let manualCatchUp = null; // raison si le bonus ne peut PAS être appliqué automatiquement (journalisé, rattrapage manuel)

  if (delta > 0) {
    if (isRecurringPremiumType(planType) && status === "active" && cancelAtPeriodEnd === true) {
      // Abonnement mensuel déjà résilié (actif jusqu'à la fin de la période) :
      // décaler trial_end côté Stripe n'a pas de comportement garanti avec
      // cancel_at_period_end, et une extension Firestore serait écrasée par
      // le webhook de fin d'abonnement. Aucune date touchée : journalisé.
      manualCatchUp = "subscription_cancelling";
    } else if (isRecurringPremiumType(planType) && status === "active" && hasExploitableSubscription) {
      useStripe = true;
    } else if (status === "payment_issue") {
      // Prélèvement en échec : le webhook réécrit les dates (grâce) — ne rien
      // étendre ici, journaliser pour rattrapage manuel.
      manualCatchUp = "payment_issue";
    } else if (status === "trial") {
      const base = Math.max(Number(trialEndsAtMs) || 0, nowMs);
      const newEnd = base + delta * REFERRAL_MONTH_MS;
      patch.writeAccessUntilMs = newEnd;
      patch.trialEndsAtMs = newEnd;
    } else if (status === "expired") {
      const newEnd = nowMs + delta * REFERRAL_MONTH_MS;
      patch.writeAccessUntilMs = newEnd;
      patch.premiumUntilMs = newEnd;
      patch.status = "active";
      // planType NEUTRE 'referral' : sweepExpiredTrials ne rebascule en 'expired'
      // que les 'onetime' (jamais les 'monthly', dont le statut vient du
      // webhook) — un ex-abonné mensuel resterait sinon 'actif' pour toujours
      // à la fin du bonus. Tout paiement réel réécrit planType (webhook).
      patch.planType = "referral";
    } else {
      // 'active' : formule payée en cours (paiement unique, ou abonnement
      // mensuel sans souscription Stripe exploitable — ex. déjà résilié).
      const base = Math.max(Number(premiumUntilMs) || 0, nowMs);
      const newEnd = base + delta * REFERRAL_MONTH_MS;
      patch.writeAccessUntilMs = newEnd;
      patch.premiumUntilMs = newEnd;
    }
  }

  return { newCount, newEarned, delta, patch, useStripe, manualCatchUp };
}

/* Nom affiché d'un filleul (notification / liste du parrain) : jamais de
   balise ni de caractère de contrôle, espaces normalisés, 60 caractères max.
   Retourne null si rien d'exploitable. Toujours RE-appliqué en sortie (les
   pages l'insèrent en textContent, jamais en HTML — défense en profondeur). */
function sanitizeReferralName(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned || null;
}

/* AUDIT PARRAINAGE (2026-09-27) — anti « boîte mail unique » : une même boîte
   (alias +tag, points Gmail, googlemail.com) permet de créer autant de comptes
   vérifiés qu'on veut. On compare donc une CLÉ d'e-mail normalisée (SHA-256,
   jamais l'adresse en clair) : un filleul dont la clé égale celle du parrain,
   ou celle d'un autre filleul déjà compté du même parrain, ne crédite pas. Ne
   stoppe pas deux vraies boîtes distinctes (limite assumée). */
function normalizeEmailForReferral(email) {
  if (typeof email !== "string") return null;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return null;
  let local = e.slice(0, at), domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com") local = local.split(".").join("");
  return local + "@" + domain;
}
function referralEmailKey(email) {
  const n = normalizeEmailForReferral(email);
  return n ? crypto.createHash("sha256").update(n).digest("hex") : null;
}

module.exports = {
  normalizeEmailForReferral, referralEmailKey,
  sanitizeReferralName,
  REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH,
  REFERRAL_TIERS, REFERRAL_CODE_MAX_ATTEMPTS, REFERRAL_MONTH_MS,
  generateReferralCode, normalizeReferralCode,
  monthsEarnedForCount, isRecurringPremiumType, computeReferralCredit
};
