/* ═══════════════════════════════════════════════════════════════════════
   premiumPlans.js — Barème Premium P1Planner (paiement unique + mensuel)
   ───────────────────────────────────────────────────────────────────────
   Adapté de la référence TypixClin (functions/premiumPlans.js) fournie par
   l'utilisateur, avec une différence structurelle majeure :

     TypixClin : 5 formules FIXES nommées (ecos2027, edn2027, ...), chacune
     avec une accessEnd absolue codée en dur, et un barème basé sur le
     nombre de mois RESTANTS jusqu'à cette échéance fixe.

     P1Planner : UNE SEULE formule paiement-unique, à durée LIBREMENT
     choisie par l'utilisateur (1 à maxMonths), où maxMonths dépend de la
     date de concours/examens qu'il a lui-même indiquée (voir
     computeMaxMonthsFromExamDate). Le barème dégressif s'applique au
     nombre de mois ACHETÉS, pas à un nombre de mois restants avant une
     date figée. accessEnd est donc calculée dynamiquement (fin du Nᵉ mois
     calendaire à partir de maintenant), jamais une constante.

   RATE_TIERS et le calcul de maxMonths DOIVENT rester identiques à
   public/p1-billing.js et à comptepremium.html (simulateur de prix
   indicatif) — toute modification se fait aux DEUX endroits, sous peine
   d'annoncer un prix différent de celui réellement facturé par Stripe.

   Voir docs/DECISIONS.md (§ Premium) : barème changé en session de
   2,50/2,25/2,00 à 3,00/2,50/2,25 (1 mois / 2-4 mois / 5+ mois), et les
   deux formules (paiement unique / abonnement mensuel) sont MUTUELLEMENT
   EXCLUSIVES — jamais actives toutes les deux en même temps (correction
   explicite de l'utilisateur en session, cf. checkPurchaseConflict).
   ═══════════════════════════════════════════════════════════════════════ */

/* Barème dégressif du paiement unique, appliqué au nombre de mois ACHETÉS
   (pas restants). Triés par minMonths décroissant : on prend le premier
   palier dont le seuil est atteint. */
const ONE_TIME_RATE_TIERS = [
    { minMonths: 5, ratePerMonth: 2.25 },  // 5 mois et plus
    { minMonths: 2, ratePerMonth: 2.50 },  // 2 à 4 mois
    { minMonths: 1, ratePerMonth: 3.00 }   // 1 mois
];

/* Abonnement mensuel : tarif fixe, sans engagement. Informatif ici (le
   montant réel facturé vient du Stripe Price ID STRIPE_PRICE_MONTHLY,
   secret défini côté index.js) — gardé pour cohérence d'affichage avec
   public/p1-billing.js. */
const MONTHLY_RATE_EUROS = 3.00;

/* Garde-fou de sécurité : aucune durée de paiement unique ne doit jamais
   dépasser 3 ans, quelle que soit la date de concours indiquée (protège
   contre une date fantaisiste ou lointaine saisie par erreur). */
const MAX_MONTHS_CAP = 36;

function ratePerMonthForOneTime(months) {
    for (let i = 0; i < ONE_TIME_RATE_TIERS.length; i++) {
        if (months >= ONE_TIME_RATE_TIERS[i].minMonths) return ONE_TIME_RATE_TIERS[i].ratePerMonth;
    }
    return ONE_TIME_RATE_TIERS[ONE_TIME_RATE_TIERS.length - 1].ratePerMonth;
}

/* Montant RÉELLEMENT à facturer, en centimes, pour un paiement unique de
   `months` mois — jamais une valeur reçue du navigateur. C'est cette
   fonction qui alimente price_data.unit_amount dans createCheckoutSession.
   Les taux (3,00 / 2,50 / 2,25 €) n'ont que 2 décimales et `months` est un
   entier : months * rate * 100 est toujours un entier exact, Math.round
   est une simple protection défensive (jamais un arrondi réel attendu). */
function computeOneTimePriceCents(months) {
    if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS_CAP) return null;
    const rate = ratePerMonthForOneTime(months);
    const euros = Math.round(months * rate * 100) / 100;
    return { months, ratePerMonth: rate, priceEuros: euros, unitAmountCents: Math.round(euros * 100) };
}

/* Fin du Nᵉ mois calendaire à partir de `now`, à 23:59:59.999 UTC, où le
   mois EN COURS compte comme le mois n°1 (même convention que
   computeMaxMonthsFromExamDate ci-dessous, qui compte aussi le mois en
   cours comme 1) : N=1 → fin du mois en cours, N=2 → fin du mois suivant,
   etc. `Date.UTC(y, m+n, 0)` = jour 0 du mois (m+n) = dernier jour du mois
   (m+n-1), donc pour N=1 ça donne bien le dernier jour du mois EN COURS
   (m+1-1 = m). C'est ce qui garantit qu'acheter exactement maxMonths mois
   atterrit EXACTEMENT sur la fin du mois du concours indiqué, sans marge
   ajoutée (cf. docs/DECISIONS.md) — vérifié par un cas concret : essai en
   septembre 2026, concours en novembre 2026 → maxMonths = 3, et
   endOfMonthsFromNow(now, 3) tombe bien le 30 novembre 2026, pas le 31
   décembre (bug initial détecté et corrigé avant tout déploiement — un
   `+ n + 1` erroné ajoutait un mois de trop). */
function endOfMonthsFromNow(now, n) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + n, 0, 23, 59, 59, 999));
}

/* accessEnd pour un achat de `months` mois à l'instant `now` — jamais une
   date envoyée par le client, toujours recalculée ici au moment du
   paiement confirmé (webhook). */
function computeOneTimeAccessEnd(now, months) {
    return endOfMonthsFromNow(now, months);
}

/* Durée maximale utile calculée depuis la date de concours/examens
   indiquée par l'utilisateur : nombre de mois calendaires jusqu'à la FIN
   du mois du concours, sans marge post-concours (confiance faite à la
   date fournie). Clampée à [1, MAX_MONTHS_CAP]. Reproduit fidèlement le
   calcul indicatif déjà présent côté client (comptepremium.html) — cette
   version-ci, côté serveur, est la seule qui compte réellement. */
function computeMaxMonthsFromExamDate(examDate, now) {
    const endOfExamMonth = new Date(Date.UTC(examDate.getUTCFullYear(), examDate.getUTCMonth() + 1, 0));
    let months = (endOfExamMonth.getUTCFullYear() - now.getUTCFullYear()) * 12
        + (endOfExamMonth.getUTCMonth() - now.getUTCMonth());
    months = Math.max(1, Math.min(months + 1, MAX_MONTHS_CAP));
    return months;
}

/* ═══════════════════════════════════════════════════════════════════════
   ANTI-CONFLIT ENTRE FORMULES — MUTUELLEMENT EXCLUSIVES
   ───────────────────────────────────────────────────────────────────────
   Correction explicite de l'utilisateur en session : contrairement à
   l'ancienne doc (docs/DECISIONS.md, "accessEnd = max(...)"), les deux
   formules ne coexistent JAMAIS. Adapté du modèle TypixClin
   (checkPurchaseConflict dans functions/index.js), qui applique déjà
   exactement cette règle pour ses propres formules fixes/mensuel — la
   même mécanique est reprise ici avec le schéma entitlements/{uid} de
   P1Planner (status/planType/premiumUntil/cancelAtPeriodEnd) au lieu du
   schéma plat users/{uid} de TypixClin.

   EXCEPTION reprise de TypixClin (option A) : un abonnement mensuel déjà
   résilié (cancelAtPeriodEnd === true) n'empêche PAS l'achat immédiat
   d'un paiement unique — l'utilisateur a explicitement signalé vouloir
   partir. Bascule immédiate et volontaire, le reliquat déjà payé du
   mensuel est perdu au profit de la nouvelle formule (assumé, pas un bug,
   cohérent avec la réponse FAQ "tu peux changer de formule à tout
   moment").

   Renvoie un message d'erreur (string) s'il faut bloquer l'achat, ou null
   si tout va bien. */
function checkPurchaseConflict(entitlement, planType) {
    if (!entitlement) return null;
    const nowMs = Date.now();
    const premiumUntilMs = entitlement.premiumUntil && entitlement.premiumUntil.toMillis
        ? entitlement.premiumUntil.toMillis() : 0;

    const currentlyActiveMonthly = entitlement.planType === "monthly"
        && entitlement.status === "active"
        && entitlement.cancelAtPeriodEnd !== true;

    // AUDIT PARRAINAGE (2026-09-27) : un accès OFFERT par le parrainage
    // (planType 'referral', posé quand le parrain n'avait plus rien) se
    // comporte comme un accès unique encore valide : sans ce garde-fou, un
    // achat pendant les mois offerts serait payé sans aucun bénéfice (le
    // paiement unique ne s'additionne pas, l'abonnement mensuel écraserait
    // les mois offerts).
    const currentlyActiveOneTime = (entitlement.planType === "onetime" || entitlement.planType === "referral")
        && entitlement.status === "active"
        && premiumUntilMs > nowMs;

    const fmtDate = (ms) => new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    if (planType === "onetime") {
        if (currentlyActiveMonthly) {
            return "Tu as déjà un abonnement mensuel actif. Résilie-le d'abord depuis le portail de facturation pour passer à un paiement unique.";
        }
        // AUDIT PAIEMENTS : un second paiement unique pendant qu'un accès
        // unique est encore valide ne prolonge rien (handleOneTimePurchase
        // ne raccourcit jamais un accès, mais n'additionne pas non plus) —
        // le client aurait payé sans aucun bénéfice. L'interface masque déjà
        // ce cas ; ce garde-fou le refuse aussi côté serveur (appel direct).
        if (currentlyActiveOneTime) {
            return `Tu as déjà un accès valide jusqu'au ${fmtDate(premiumUntilMs)}. Tu pourras prendre une nouvelle formule à son terme.`;
        }
    } else if (planType === "monthly") {
        if (currentlyActiveOneTime) {
            return `Tu as déjà un accès valide jusqu'au ${fmtDate(premiumUntilMs)}. Attends son terme, ou contacte-nous pour basculer plus tôt.`;
        }
    }
    return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   ACCÈS DÉDUIT D'UN ABONNEMENT STRIPE (fonction PURE, testée)
   ───────────────────────────────────────────────────────────────────────
   AUDIT PAIEMENTS : l'ancien code écrivait writeAccessUntil = fin de
   période Stripe quel que soit le statut. Or (1) sur un renouvellement
   IMPAYÉ (past_due/unpaid) Stripe a déjà avancé la période d'un mois :
   l'utilisateur gardait un mois d'écriture sans payer ; (2) sur une
   résiliation IMMÉDIATE (canceled), current_period_end restait dans le
   futur : accès conservé jusqu'à l'ancienne échéance.
   Règles maintenant :
     - active/trialing         : accès jusqu'à la fin de période.
     - past_due/unpaid/incomplete : JAMAIS de prolongation — on garde l'accès
       déjà acquis, avec un délai de grâce de 3 jours (posé une seule fois,
       paymentIssueGraceUntil) pour laisser jouer les relances Stripe.
     - canceled/autres         : accès borné à la date réelle de fin
       (ended_at), sans jamais retirer le reliquat d'essai gratuit.
   `sub` = { status, periodEndMs, endedAtMs } ; `current` = entitlement
   Firestore actuel ({} si absent) ; renvoie des millisecondes (null =
   aucune date). */
const PAYMENT_ISSUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
function computeSubscriptionAccess(sub, current, nowMs) {
    const toMs = (v) => (v && v.toMillis ? v.toMillis() : 0);
    const cur = current || {};
    const periodEndMs = sub.periodEndMs || 0;

    if (sub.status === "active" || sub.status === "trialing") {
        return {
            status: "active",
            premiumUntilMs: periodEndMs || null,
            writeAccessMs: periodEndMs || null,
            graceUntilMs: null
        };
    }

    if (sub.status === "incomplete") {
        // Premier paiement jamais abouti : rien n'a été acquis, aucune grâce.
        return {
            status: "payment_issue",
            premiumUntilMs: toMs(cur.premiumUntil) || null,
            writeAccessMs: toMs(cur.writeAccessUntil) || null,
            graceUntilMs: null
        };
    }

    if (sub.status === "past_due" || sub.status === "unpaid") {
        const graceMs = toMs(cur.paymentIssueGraceUntil) || (nowMs + PAYMENT_ISSUE_GRACE_MS);
        return {
            status: "payment_issue",
            premiumUntilMs: toMs(cur.premiumUntil) || null,
            writeAccessMs: Math.max(toMs(cur.writeAccessUntil), graceMs),
            graceUntilMs: graceMs
        };
    }

    // canceled, incomplete_expired, paused, ... : plus d'abonnement en cours.
    let baseMs;
    if (sub.endedAtMs) baseMs = Math.min(periodEndMs || sub.endedAtMs, sub.endedAtMs);
    else baseMs = Math.min(periodEndMs || nowMs, nowMs);
    return {
        status: "expired",
        premiumUntilMs: baseMs,
        writeAccessMs: Math.max(baseMs, toMs(cur.trialEndsAt)),
        graceUntilMs: null
    };
}

/* ═══════════════════════════════════════════════════════════════════════
   VERROU SERVEUR DES PAIEMENTS — repris de TypixClin (premiumPlans.js).
   Le frontend n'affiche que ce que le serveur autorise, mais un appel
   direct à createCheckoutSession (console, script) contournerait un
   simple verrou d'UI — CE verrou-ci, vérifié dans la Cloud Function
   elle-même, est la vraie sécurité.

   OUVERT (GO explicite de l'utilisateur) — projet Stripe P1Planner créé,
   isolé de TypixClin (comptes Stripe séparés, vérifié), descripteur de
   relevé bancaire corrigé (affichait à tort "Typixclin"), secrets Live
   posés (STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/STRIPE_PRICE_MONTHLY),
   et tests réels effectués avec une vraie carte en mode Live : paiement
   unique confirmé (webhook reçu, entitlements mis à jour, UI correcte) ET
   abonnement mensuel confirmé (idem). PAYMENTS_TESTER_UIDS n'a plus d'effet
   une fois ce verrou ouvert (il ne servait qu'à restreindre l'accès tant
   que ce verrou était fermé) — laissé tel quel, inoffensif. ═══════════ */
const PAYMENTS_ENABLED = true;

/* UIDs autorisés à payer malgré PAYMENTS_ENABLED = false, pour tester en
   Stripe Test Mode avant l'ouverture générale. Vide par défaut. */
const PAYMENTS_TESTER_UIDS = ["caaKOz5TAgMb4DT8SvCgTHnQ1W32", "inaX9UABIYVikuQ92qh28k0zOpQ2"];

function paymentsEnabledFor(uid) {
    if (PAYMENTS_ENABLED) return true;
    return !!(uid && PAYMENTS_TESTER_UIDS.indexOf(uid) !== -1);
}

module.exports = {
    ONE_TIME_RATE_TIERS, MONTHLY_RATE_EUROS, MAX_MONTHS_CAP,
    ratePerMonthForOneTime, computeOneTimePriceCents,
    endOfMonthsFromNow, computeOneTimeAccessEnd, computeMaxMonthsFromExamDate,
    checkPurchaseConflict, computeSubscriptionAccess, PAYMENT_ISSUE_GRACE_MS,
    PAYMENTS_ENABLED, PAYMENTS_TESTER_UIDS, paymentsEnabledFor
};
