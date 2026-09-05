/* ═══════════════════════════════════════════════════════════════════════
   Cloud Functions — P1Planner
   ───────────────────────────────────────────────────────────────────────
   Deux volets :
     1. BOOTSTRAP utilisateur (essai gratuit 15 jours, source de vérité
        serveur) — onUserCreated, resendVerificationEmail,
        sendVerificationEmailOnCreate.
     2. STRIPE (paiement unique / abonnement mensuel Premium) —
        createCheckoutSession, createCustomerPortalSession, stripeWebhook,
        saveExamDate. Adapté de la référence TypixClin fournie par
        l'utilisateur (functions/index.js, functions/premiumPlans.js),
        avec les différences documentées dans premiumPlans.js (formule
        unique à durée libre au lieu de 5 formules fixes, schéma
        entitlements/billingPrivate au lieu d'un users/{uid} plat,
        formules mutuellement exclusives).

   ⚠ NON DÉPLOYÉ, NON TESTÉ EN CONDITIONS RÉELLES : le projet Stripe
   P1Planner n'existe pas encore (secrets STRIPE_* absents), donc ce code
   n'a pu être vérifié que par relecture + `node --check` (syntaxe), pas
   par un vrai appel Stripe/émulateur. Ne jamais annoncer ce volet comme
   testé tant qu'aucune session Checkout réelle n'a été exécutée. Attendre
   le GO explicite de l'utilisateur avant tout déploiement (CLAUDE.md).

   Isolation P0 : ce fichier n'utilise QUE le projet Firebase P1Planner
   (déduit automatiquement de l'environnement de déploiement / émulateur).
   Aucun secret, Price ID ou config TypixClin ici.
   ═══════════════════════════════════════════════════════════════════════ */

const functionsV1 = require("firebase-functions/v1");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const Stripe = require("stripe");
const {
  computeOneTimePriceCents, computeOneTimeAccessEnd,
  computeMaxMonthsFromExamDate, checkPurchaseConflict, MAX_MONTHS_CAP,
  paymentsEnabledFor
} = require("./premiumPlans");

// Clé API Brevo — jamais dans le code ni le repository (dépôt PUBLIC, voir
// CLAUDE.md). Définie via `firebase functions:secrets:set BREVO_API_KEY`,
// injectée par la plateforme à l'exécution uniquement. Compte Brevo P1Planner
// SÉPARÉ de celui de TypixClin (isolation P0), même fournisseur toléré.
const BREVO_API_KEY = defineSecret("BREVO_API_KEY");
const MAIL_FROM = { name: "P1Planner", email: "noreply@p1planner.fr" };

// Secrets Stripe — projet P1Planner, jamais TypixClin (isolation P0).
// Définis via `firebase functions:secrets:set STRIPE_SECRET_KEY` etc.
// N'existent pas encore : le projet Stripe P1Planner reste à créer (voir
// docs/TODO.md). Tant qu'ils sont absents, tout appel réel à
// createCheckoutSession/stripeWebhook échoue proprement au chargement du
// secret — aucun risque de facturer avec une config à moitié posée.
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const STRIPE_PRICE_MONTHLY = defineSecret("STRIPE_PRICE_MONTHLY");

// Initialisation PARESSEUSE, pas au chargement du module : l'étape
// d'analyse de `firebase deploy` importe ce fichier localement pour
// déterminer les triggers, et un initializeApp() au top-level peut s'y
// bloquer en essayant de joindre les identifiants par défaut (ADC) —
// voir https://firebase.google.com/docs/functions/tips#avoid_deployment_timeouts_during_initialization
let _db = null;
function db_() {
  if (!_db) { initializeApp(); _db = getFirestore(); }
  return _db;
}
let _auth = null;
function auth_() {
  if (!_auth) { initializeApp(); _auth = getAuth(); }
  return _auth;
}

const REGION = "europe-west1";
const TRIAL_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ═══════════════════════════════════════════════════════════════════════
   Envoi d'email transactionnel — Brevo
   ───────────────────────────────────────────────────────────────────────
   Remplace le mailer par défaut de Firebase Auth (peu fiable en
   délivrabilité, cf. audit) : on génère nous-mêmes le lien d'action via
   l'Admin SDK (ça, ça marche toujours — c'est juste une génération de
   lien, aucun envoi réel) et on l'envoie via Brevo, sous un expéditeur
   personnalisé noreply@p1planner.fr.
   ═══════════════════════════════════════════════════════════════════════ */
async function sendBrevoEmail(apiKey, { to, subject, html }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify({
      sender: MAIL_FROM,
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo a refusé l'envoi (${res.status}) : ${body.slice(0, 300)}`);
  }
}

function verificationEmailHtml(link) {
  return `<!doctype html><html><body style="font-family:sans-serif;background:#f5f3ff;padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
      <h1 style="color:#6d28d9;font-size:20px;margin:0 0 16px;">Confirme ton adresse e-mail</h1>
      <p style="color:#374151;line-height:1.6;">Un clic suffit pour activer ton compte P1Planner et démarrer ton essai gratuit de 15 jours.</p>
      <p style="margin:28px 0;">
        <a href="${link}" style="background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Confirmer mon adresse</a>
      </p>
      <p style="color:#9ca3af;font-size:13px;word-break:break-all;overflow-wrap:anywhere;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br><a href="${link}" style="color:#6d28d9;">${link}</a></p>
      <p style="color:#9ca3af;font-size:13px;">Si tu n'es pas à l'origine de cette inscription, ignore simplement cet email.</p>
    </div>
  </body></html>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   sendVerificationEmailOnCreate — trigger Auth (v1), séparé de
   onUserCreated exprès : l'envoi d'email ne doit jamais faire échouer ni
   retarder la création du profil/essai gratuit (fonction indépendante,
   un échec ici n'affecte pas l'autre trigger).
   ═══════════════════════════════════════════════════════════════════════ */
exports.sendVerificationEmailOnCreate = functionsV1
  .region(REGION)
  .runWith({ secrets: [BREVO_API_KEY] })
  .auth.user()
  .onCreate(async (user) => {
    if (!user.email) return;
    try {
      const link = await auth_().generateEmailVerificationLink(user.email);
      await sendBrevoEmail(BREVO_API_KEY.value(), {
        to: user.email,
        subject: "Confirme ton adresse email — P1Planner",
        html: verificationEmailHtml(link)
      });
      logger.info(`sendVerificationEmailOnCreate: envoyé à ${user.uid}.`);
    } catch (e) {
      // Ne jamais faire planter la création de compte pour un échec d'envoi
      // d'email — l'utilisateur peut toujours redemander l'envoi (voir
      // resendVerificationEmail) une fois le souci résolu côté Brevo/DNS.
      logger.error(`sendVerificationEmailOnCreate: échec pour ${user.uid} :`, e);
    }
  });

/* ═══════════════════════════════════════════════════════════════════════
   resendVerificationEmail — callable (v2), appelée depuis auth.html à la
   place de sendEmailVerification() du SDK client (mailer par défaut peu
   fiable). Exige un appelant authentifié, non encore vérifié, qui demande
   l'envoi pour SA PROPRE adresse — jamais un email arbitraire.
   ═══════════════════════════════════════════════════════════════════════ */
exports.resendVerificationEmail = onCall(
  { region: REGION, secrets: [BREVO_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");
    }
    const uid = request.auth.uid;
    const userRecord = await auth_().getUser(uid);
    if (!userRecord.email) {
      throw new HttpsError("failed-precondition", "Aucune adresse email sur ce compte.");
    }
    if (userRecord.emailVerified) {
      // Rien à faire, mais pas une erreur — évite un message confus côté UI.
      return { alreadyVerified: true };
    }
    try {
      const link = await auth_().generateEmailVerificationLink(userRecord.email);
      await sendBrevoEmail(BREVO_API_KEY.value(), {
        to: userRecord.email,
        subject: "Confirme ton adresse email — P1Planner",
        html: verificationEmailHtml(link)
      });
    } catch (e) {
      logger.error(`resendVerificationEmail: échec pour ${uid} :`, e);
      throw new HttpsError("internal", "Envoi impossible pour le moment, réessaie dans un instant.");
    }
    return { sent: true };
  }
);

/* ═══════════════════════════════════════════════════════════════════════
   onUserCreated — trigger Auth (v1, background trigger "at-least-once")
   ───────────────────────────────────────────────────────────────────────
   À la création d'un compte Firebase Authentication, crée côté SERVEUR :
     - users/{uid}            profil d'identité (jamais écrit par le client)
     - entitlements/{uid}     essai gratuit 30 jours, source de vérité
     - billingPrivate/{uid}   réservé (Stripe), vide pour l'instant
     - userStats/{uid}        réservé (agrégats), vide pour l'instant

   P0 — Idempotence : un trigger "at-least-once" peut se redéclencher
   (retry réseau, crash mi-exécution). On lit l'entitlement dans une
   transaction avant d'écrire : s'il existe déjà, on NE le touche PAS —
   un retry ne doit jamais repousser trialEndsAt/writeAccessUntil.

   Ne dépend jamais de user.displayName (peut être null : le flux
   auth.html fait createUser PUIS updateProfile, ce trigger peut donc
   s'exécuter avant que le displayName soit posé).
   ═══════════════════════════════════════════════════════════════════════ */
exports.onUserCreated = functionsV1
  .region(REGION)
  .auth.user()
  .onCreate(async (user) => {
    const uid = user.uid;
    const db = db_();
    const now = Timestamp.now();
    const trialEnd = Timestamp.fromMillis(now.toMillis() + TRIAL_DAYS * DAY_MS);
    const serverNow = FieldValue.serverTimestamp();

    const userRef = db.doc(`users/${uid}`);
    const entitlementRef = db.doc(`entitlements/${uid}`);
    const billingRef = db.doc(`billingPrivate/${uid}`);
    const statsRef = db.doc(`userStats/${uid}`);

    await db.runTransaction(async (tx) => {
      const entitlementSnap = await tx.get(entitlementRef);

      // Profil : toujours (re)posé avec les valeurs Auth actuelles — pas
      // de risque d'écraser un état applicatif puisque users/{uid} ne
      // contient que des champs d'identité, jamais de données utilisateur.
      tx.set(
        userRef,
        {
          email: user.email || null,
          displayName: user.displayName || null,
          createdAt: serverNow,
          updatedAt: serverNow
        },
        { merge: true }
      );

      if (entitlementSnap.exists) {
        // Retry du trigger : l'entitlement existe déjà, on ne le repousse
        // jamais (P0 anti double-essai). On s'arrête là.
        logger.info(`onUserCreated: entitlement déjà présent pour ${uid}, no-op.`);
        return;
      }

      tx.set(entitlementRef, {
        status: "trial",
        trialStartedAt: now,
        trialEndsAt: trialEnd,
        writeAccessUntil: trialEnd,
        premiumUntil: null,
        planType: null,
        createdAt: serverNow,
        updatedAt: serverNow
      });

      tx.set(billingRef, { createdAt: serverNow }, { merge: true });
      tx.set(statsRef, { createdAt: serverNow }, { merge: true });
    });

    logger.info(`onUserCreated: bootstrap terminé pour ${uid}.`);
  });

/* ═══════════════════════════════════════════════════════════════════════
   STRIPE — helpers communs
   ═══════════════════════════════════════════════════════════════════════ */

const ORIGIN_ALLOWLIST = [
  "https://p1planner.fr",
  "https://www.p1planner.fr",
  "https://p1planner.web.app",
  "https://p1planner.firebaseapp.com"
];
function safeUrl(raw, fallbackPath) {
  try {
    const u = new URL(raw);
    if (ORIGIN_ALLOWLIST.includes(u.origin)) return u.toString();
  } catch (e) { /* URL invalide : repli ci-dessous */ }
  return ORIGIN_ALLOWLIST[0] + fallbackPath;
}

function requireVerifiedUser(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Connexion requise.");
  }
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Adresse e-mail non vérifiée.");
  }
  return request.auth;
}

// stripeCustomerId vit dans billingPrivate/{uid} (jamais users/{uid} ni
// entitlements/{uid} — séparation identité / accès / identifiants Stripe).
async function getOrCreateCustomer(stripe, uid, email, name) {
  const db = db_();
  const billingRef = db.doc(`billingPrivate/${uid}`);
  const snap = await billingRef.get();
  const existing = snap.exists ? snap.get("stripeCustomerId") : null;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: { firebaseUID: uid }
  });

  // Écriture "premier arrivé, premier servi" : si un appel concurrent a
  // déjà posé un stripeCustomerId entre notre lecture et maintenant, on
  // garde CELUI-LÀ et on supprime le client Stripe qu'on vient de créer.
  const finalId = await db.runTransaction(async (tx) => {
    const freshSnap = await tx.get(billingRef);
    const already = freshSnap.exists ? freshSnap.get("stripeCustomerId") : null;
    if (already) return already;
    tx.set(billingRef, { stripeCustomerId: customer.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return customer.id;
  });

  if (finalId !== customer.id) {
    try { await stripe.customers.del(customer.id); }
    catch (e) { logger.warn(`Nettoyage du client Stripe en double (${customer.id}) impossible :`, e.message); }
  }
  return finalId;
}

// Un abonnement Stripe dans un de ces statuts compte comme "en cours",
// même s'il n'est pas encore/plus 'active' au sens strict (trialing,
// impayé, etc.) — filet contre un second Checkout créé avant que le
// webhook n'ait mis Firestore à jour. `ignoreCanceling` : un abonnement
// déjà résilié (cancel_at_period_end) ne bloque pas un paiement unique —
// bascule volontaire, cf. premiumPlans.js.
const BLOCKING_STRIPE_STATUSES = ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"];
async function hasBlockingStripeSubscription(stripe, customerId, { ignoreCanceling = false } = {}) {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  return subs.data.some((s) => {
    if (!BLOCKING_STRIPE_STATUSES.includes(s.status)) return false;
    if (ignoreCanceling && s.cancel_at_period_end) return false;
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   VERROU DE CHECKOUT PERSISTANT — billingLocks/{uid}
   ───────────────────────────────────────────────────────────────────────
   Repris tel quel du modèle TypixClin (voir tpx functions/index.js pour
   le détail des commentaires d'origine) : survit à la fin de
   createCheckoutSession, n'est relâché QUE par le webhook (paiement
   confirmé, refusé, ou session expirée) — jamais par un simple retour de
   fonction. Empêche un second Checkout payable pendant que le premier est
   encore potentiellement en cours de paiement.
   ═══════════════════════════════════════════════════════════════════════ */
const CREATING_LOCK_TTL_MS = 2 * 60 * 1000;

async function decideBillingLock(uid, planType) {
  const db = db_();
  const lockRef = db.doc(`billingLocks/${uid}`);
  const nowMs = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (snap.exists) {
      const data = snap.data();
      if (data.state === "creating") {
        const createdAtMs = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0;
        if (nowMs - createdAtMs < CREATING_LOCK_TTL_MS) return { action: "blocked" };
        // 'creating' périmé (crash probable) : remplacé ci-dessous.
      } else if (data.state === "open" || data.state === "pending_payment") {
        const expiresAtMs = data.expiresAt && data.expiresAt.toMillis ? data.expiresAt.toMillis() : 0;
        if (expiresAtMs > nowMs) {
          return {
            action: "check_existing",
            existingPlanType: data.planType,
            existingSessionId: data.checkoutSessionId
          };
        }
      }
    }
    tx.set(lockRef, {
      state: "creating", planType, checkoutSessionId: null,
      createdAt: FieldValue.serverTimestamp(), expiresAt: null
    });
    return { action: "proceed" };
  });
}

async function markBillingLockOpen(uid, planType, checkoutSessionId, expiresAtUnixSeconds) {
  await db_().doc(`billingLocks/${uid}`).set({
    state: "open", planType, checkoutSessionId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAtUnixSeconds * 1000)
  }, { merge: true });
}

async function markBillingLockPendingPayment(uid, checkoutSessionId) {
  const lockRef = db_().doc(`billingLocks/${uid}`);
  await db_().runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists || snap.get("checkoutSessionId") !== checkoutSessionId) return;
    tx.update(lockRef, { state: "pending_payment" });
  });
}

async function releaseBillingLockForSession(uid, checkoutSessionId) {
  if (!uid || !checkoutSessionId) return;
  const lockRef = db_().doc(`billingLocks/${uid}`);
  await db_().runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists) return;
    if (snap.get("checkoutSessionId") === checkoutSessionId) tx.delete(lockRef);
  });
}

async function releaseCreatingLock(uid) {
  const lockRef = db_().doc(`billingLocks/${uid}`);
  await db_().runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists) return;
    if (snap.get("state") === "creating") tx.delete(lockRef);
  });
}

async function claimStaleLockForCreating(uid, planType, expectedStaleSessionId) {
  const lockRef = db_().doc(`billingLocks/${uid}`);
  return db_().runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (snap.exists && snap.get("checkoutSessionId") !== expectedStaleSessionId) return false;
    tx.set(lockRef, {
      state: "creating", planType, checkoutSessionId: null,
      createdAt: FieldValue.serverTimestamp(), expiresAt: null
    });
    return true;
  });
}

async function createOrReuseCheckoutSession(stripe, uid, planType, buildParams) {
  const decision = await decideBillingLock(uid, planType);

  if (decision.action === "blocked") {
    throw new HttpsError("already-exists", "Une opération de paiement est déjà en cours pour ce compte. Patiente quelques instants puis réessaie.");
  }

  if (decision.action === "check_existing") {
    let liveSession = null;
    try { liveSession = await stripe.checkout.sessions.retrieve(decision.existingSessionId); }
    catch (e) { liveSession = null; }

    if (liveSession && liveSession.status === "open") {
      if (decision.existingPlanType === planType) {
        return { url: liveSession.url, id: liveSession.id, reused: true };
      }
      throw new HttpsError("already-exists", "Tu as déjà un paiement en cours pour une autre formule. Termine-le ou attends son expiration avant d'en choisir une autre.");
    }

    const claimed = await claimStaleLockForCreating(uid, planType, decision.existingSessionId);
    if (!claimed) {
      throw new HttpsError("already-exists", "Une opération de paiement est déjà en cours pour ce compte. Patiente quelques instants puis réessaie.");
    }
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create(buildParams());
  } catch (e) {
    await releaseCreatingLock(uid);
    throw e;
  }

  await markBillingLockOpen(uid, planType, session.id, session.expires_at);
  return { url: session.url, id: session.id, reused: false };
}

/* ═══════════════════════════════════════════════════════════════════════
   saveExamDate — callable, spécifique P1Planner (n'existe pas côté
   TypixClin). Calcule et enregistre côté SERVEUR la durée maximale utile
   du paiement unique, à partir de la date de concours/examens indiquée
   par l'utilisateur. Le navigateur n'est jamais la source de vérité de
   cette durée (comptepremium.html n'affiche qu'une estimation locale en
   attendant la réponse de cette fonction).
   ═══════════════════════════════════════════════════════════════════════ */
exports.saveExamDate = onCall({ region: REGION }, async (request) => {
  const auth = requireVerifiedUser(request);
  const raw = request.data && request.data.examDate;
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || isNaN(parsed.getTime())) {
    throw new HttpsError("invalid-argument", "Date invalide.");
  }
  const now = new Date();
  // Refuse une date antérieure au 1er du mois en cours (une date passée ne
  // veut rien dire ici) — le mois en cours reste accepté (maxMonths >= 1).
  const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (parsed < startOfThisMonth) {
    throw new HttpsError("invalid-argument", "Cette date est déjà passée.");
  }

  const maxMonths = computeMaxMonthsFromExamDate(parsed, now);
  await db_().doc(`entitlements/${auth.uid}`).set({
    examDate: Timestamp.fromDate(parsed),
    maxMonths,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  logger.info(`saveExamDate: ${auth.uid} → maxMonths=${maxMonths}.`);
  return { maxMonths };
});

/* ═══════════════════════════════════════════════════════════════════════
   createCheckoutSession — callable
   ═══════════════════════════════════════════════════════════════════════ */
exports.createCheckoutSession = onCall(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY] },
  async (request) => {
    const auth = requireVerifiedUser(request);

    if (!paymentsEnabledFor(auth.uid)) {
      throw new HttpsError("failed-precondition", "Les paiements ne sont pas encore ouverts.");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const planType = request.data && request.data.planType;
    if (planType !== "onetime" && planType !== "monthly") {
      throw new HttpsError("invalid-argument", "Formule inconnue.");
    }

    const customerId = await getOrCreateCustomer(stripe, auth.uid, auth.token.email, auth.token.name);

    const entRef = db_().doc(`entitlements/${auth.uid}`);
    const entSnap = await entRef.get();
    const entitlement = entSnap.exists ? entSnap.data() : null;

    if (planType === "onetime") {
      const months = parseInt(request.data && request.data.months, 10);
      const maxMonths = (entitlement && entitlement.maxMonths) || null;
      if (!maxMonths) {
        throw new HttpsError("failed-precondition", "Indique d'abord ta date de concours/examens pour connaître la durée disponible.");
      }
      if (!Number.isInteger(months) || months < 1 || months > maxMonths) {
        throw new HttpsError("invalid-argument", `Durée invalide (1 à ${maxMonths} mois).`);
      }
      const pricing = computeOneTimePriceCents(months);
      if (!pricing) {
        throw new HttpsError("invalid-argument", "Durée invalide.");
      }

      const conflict = checkPurchaseConflict(entitlement, "onetime");
      if (conflict) throw new HttpsError("already-exists", conflict);

      if (await hasBlockingStripeSubscription(stripe, customerId, { ignoreCanceling: true })) {
        throw new HttpsError("already-exists", "Tu as déjà un abonnement mensuel en cours. Résilie-le d'abord depuis le portail de facturation.");
      }

      return await createOrReuseCheckoutSession(stripe, auth.uid, "onetime", () => ({
        mode: "payment",
        customer: customerId,
        client_reference_id: auth.uid,
        line_items: [{
          price_data: {
            currency: "eur",
            unit_amount: pricing.unitAmountCents,
            product_data: { name: `P1Planner — Accès Premium (${months} mois)` }
          },
          quantity: 1
        }],
        locale: "fr",
        automatic_tax: { enabled: false }, // franchise en base, art. 293 B du CGI
        payment_intent_data: { metadata: { firebaseUID: auth.uid, planType, months: String(months) } },
        metadata: { firebaseUID: auth.uid, planType, months: String(months) },
        success_url: safeUrl(request.data.successUrl, "/comptepremium.html?success=true"),
        cancel_url: safeUrl(request.data.cancelUrl, "/comptepremium.html?canceled=true")
      }));
    }

    // planType === "monthly"
    const price = STRIPE_PRICE_MONTHLY.value();

    const conflict = checkPurchaseConflict(entitlement, "monthly");
    if (conflict) throw new HttpsError("already-exists", conflict);

    if (await hasBlockingStripeSubscription(stripe, customerId)) {
      throw new HttpsError("already-exists", "Tu as déjà un abonnement en cours.");
    }

    // Souscription pendant l'essai gratuit : Stripe ne prélève qu'à la fin
    // de l'essai, jamais avant, calculé côté serveur depuis trialEndsAt —
    // jamais une valeur reçue du navigateur. Marge de 60s pour ne jamais
    // envoyer à Stripe une date tout juste passée (trial_end doit être
    // strictement dans le futur).
    const subscriptionData = { metadata: { firebaseUID: auth.uid, planType } };
    const trialEndsAtMs = entitlement && entitlement.trialEndsAt && entitlement.trialEndsAt.toMillis
      ? entitlement.trialEndsAt.toMillis() : 0;
    const nowSecPlusMargin = Math.floor(Date.now() / 1000) + 60;
    const trialEndSec = Math.floor(trialEndsAtMs / 1000);
    if (trialEndSec > nowSecPlusMargin) {
      subscriptionData.trial_end = trialEndSec;
    }

    return await createOrReuseCheckoutSession(stripe, auth.uid, "monthly", () => ({
      mode: "subscription",
      customer: customerId,
      client_reference_id: auth.uid,
      line_items: [{ price, quantity: 1 }],
      locale: "fr",
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },
      subscription_data: subscriptionData,
      metadata: { firebaseUID: auth.uid, planType },
      success_url: safeUrl(request.data.successUrl, "/comptepremium.html?success=true"),
      cancel_url: safeUrl(request.data.cancelUrl, "/comptepremium.html?canceled=true")
    }));
  }
);

/* ═══════════════════════════════════════════════════════════════════════
   createCustomerPortalSession — callable
   ═══════════════════════════════════════════════════════════════════════ */
exports.createCustomerPortalSession = onCall(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const auth = requireVerifiedUser(request);
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    const snap = await db_().doc(`billingPrivate/${auth.uid}`).get();
    const customerId = snap.exists ? snap.get("stripeCustomerId") : null;
    if (!customerId) {
      throw new HttpsError("not-found", "Aucun abonnement rattaché à ce compte.");
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: safeUrl(request.data && request.data.returnUrl, "/comptepremium.html?portal=return"),
      locale: "fr"
    });
    return { url: portal.url };
  }
);

/* ═══════════════════════════════════════════════════════════════════════
   stripeWebhook — seule source de vérité de l'accès Premium
   ═══════════════════════════════════════════════════════════════════════ */
exports.stripeWebhook = onRequest(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET.value());
    } catch (e) {
      logger.error("Signature webhook invalide :", e.message);
      return res.status(400).send("invalid_signature");
    }

    const seen = db_().doc(`stripeEvents/${event.id}`);
    if ((await seen.get()).exists) {
      logger.info(`Événement déjà traité, ignoré : ${event.type} (${event.id})`);
      return res.json({ received: true, duplicate: true });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const s = event.data.object;
          if (s.mode === "subscription" && s.subscription) {
            const sub = await stripe.subscriptions.retrieve(s.subscription);
            await syncSubscription(stripe, sub, s.client_reference_id);
            await releaseBillingLockForSession(s.client_reference_id, s.id);
          } else if (s.mode === "payment") {
            await handleOneTimePurchase(s);
          }
          break;
        }
        case "checkout.session.async_payment_succeeded": {
          const s = event.data.object;
          if (s.mode === "payment") await handleOneTimePurchase(s);
          break;
        }
        case "checkout.session.async_payment_failed": {
          const s = event.data.object;
          const failedUid = (s.metadata && s.metadata.firebaseUID) || s.client_reference_id || null;
          logger.warn(`checkout.session.async_payment_failed : session ${s.id}, uid ${failedUid || "inconnu"} — paiement différé refusé.`);
          if (failedUid) await releaseBillingLockForSession(failedUid, s.id);
          break;
        }
        case "checkout.session.expired": {
          const s = event.data.object;
          const expiredUid = (s.metadata && s.metadata.firebaseUID) || s.client_reference_id || null;
          if (expiredUid) await releaseBillingLockForSession(expiredUid, s.id);
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await syncSubscription(stripe, event.data.object);
          break;
        case "invoice.paid":
        case "invoice.payment_failed": {
          const inv = event.data.object;
          if (inv.subscription) {
            const sub = await stripe.subscriptions.retrieve(inv.subscription);
            await syncSubscription(stripe, sub);
          }
          break;
        }
      }

      await seen.set({ type: event.type, at: FieldValue.serverTimestamp() });
      return res.json({ received: true });
    } catch (e) {
      logger.error("Erreur webhook", event.type, e);
      return res.status(500).send("handler_error");
    }
  }
);

/* Paiement unique confirmé — écrit entitlements/{uid}. Ne fait JAMAIS
   confiance à un montant/durée venant de la session Stripe pour DÉCIDER
   de l'accès accordé : `months` est relu depuis metadata (posées par
   NOUS à la création), accessEnd est recalculée ici via premiumPlans.js,
   jamais transmise par le navigateur ni conservée depuis la création de
   la session (elle est calculée À LA CONFIRMATION du paiement, pas à la
   création du Checkout — cohérent avec "tu paies pour X mois à partir de
   maintenant"). */
async function handleOneTimePurchase(session) {
  const uid = (session.metadata && session.metadata.firebaseUID) || session.client_reference_id;

  if (session.payment_status !== "paid") {
    logger.info(`checkout.session.completed (payment) ${session.id} : payment_status=${session.payment_status}, pas encore confirmé.`);
    if (uid) await markBillingLockPendingPayment(uid, session.id);
    return;
  }

  const months = parseInt(session.metadata && session.metadata.months, 10);
  if (!uid || !Number.isInteger(months) || months < 1) {
    logger.error("checkout.session.completed (payment) sans uid/months valides :", session.id, uid, session.metadata && session.metadata.months);
    if (uid) await releaseBillingLockForSession(uid, session.id);
    return;
  }

  const now = new Date();
  const newEnd = Timestamp.fromDate(computeOneTimeAccessEnd(now, months));
  const customerId = typeof session.customer === "string" ? session.customer : (session.customer && session.customer.id);
  const entRef = db_().doc(`entitlements/${uid}`);
  const billingRef = db_().doc(`billingPrivate/${uid}`);

  await db_().runTransaction(async (tx) => {
    const snap = await tx.get(entRef);
    const current = snap.exists ? snap.data() : {};

    // Idempotence : cette session précise a déjà été appliquée.
    if (current.stripeCheckoutSessionId === session.id) {
      logger.info(`checkout.session ${session.id} déjà appliquée à entitlements/${uid} — rien à refaire.`);
      return;
    }

    // Revalider le conflit AU MOMENT D'ÉCRIRE (course rare malgré les
    // gardes précédentes) : ne jamais écraser un abonnement mensuel
    // devenu actif entre la création du Checkout et la confirmation.
    const currentlyActiveMonthly = current.planType === "monthly"
      && current.status === "active" && current.cancelAtPeriodEnd !== true;
    if (currentlyActiveMonthly) {
      tx.set(db_().doc(`billingConflicts/${session.id}`), {
        uid, checkoutSessionId: session.id, months,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        reason: "onetime_blocked_by_active_monthly",
        createdAt: FieldValue.serverTimestamp()
      });
      logger.warn(`⚠ CONFLIT : achat paiement unique pour entitlements/${uid} bloqué par un abonnement mensuel actif (session ${session.id}). Le client A PAYÉ sans que l'accès soit appliqué — vérifier un remboursement manuel.`);
      return;
    }

    // Ne jamais raccourcir un accès déjà valide.
    const existingEndMs = current.premiumUntil && current.premiumUntil.toMillis ? current.premiumUntil.toMillis() : 0;
    const finalEnd = existingEndMs > newEnd.toMillis() ? current.premiumUntil : newEnd;
    if (existingEndMs > newEnd.toMillis()) {
      logger.warn(`⚠ Paiement sans bénéfice pour entitlements/${uid} : accès déjà valide au-delà de la durée achetée (session ${session.id}). Vérifier si un remboursement est dû.`);
    }

    tx.set(entRef, {
      status: "active",
      planType: "onetime",
      premiumUntil: finalEnd,
      writeAccessUntil: finalEnd,
      cancelAtPeriodEnd: FieldValue.delete(),
      stripeCheckoutSessionId: session.id,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    tx.set(billingRef, {
      stripeCustomerId: customerId || FieldValue.delete(),
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  await releaseBillingLockForSession(uid, session.id);
  logger.info(`entitlements/${uid} ← paiement unique ${months} mois (session ${session.id}).`);
}

/* Écrit l'abonnement mensuel dans entitlements/{uid} + billingPrivate/{uid}. */
async function syncSubscription(stripe, sub, fallbackUid) {
  let uid = (sub.metadata && sub.metadata.firebaseUID) || fallbackUid;

  if (!uid) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const q = await db_().collection("billingPrivate").where("stripeCustomerId", "==", customerId).limit(1).get();
    if (!q.empty) uid = q.docs[0].id;
  }
  if (!uid) { logger.warn("Abonnement sans uid identifiable :", sub.id); return; }

  const isActive = ["active", "trialing"].includes(sub.status);
  const isPaymentIssue = ["past_due", "unpaid", "incomplete"].includes(sub.status);

  // API Stripe récente : current_period_end vit dans items.data[0], pas à
  // la racine de l'abonnement (cf. référence TypixClin, même piège évité).
  const rawPeriodEnd = sub.items && sub.items.data && sub.items.data[0]
    ? sub.items.data[0].current_period_end : sub.current_period_end;
  const periodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : null;

  const entRef = db_().doc(`entitlements/${uid}`);
  const billingRef = db_().doc(`billingPrivate/${uid}`);
  const status = isActive ? "active" : (isPaymentIssue ? "payment_issue" : "expired");

  const applied = await db_().runTransaction(async (tx) => {
    const snap = await tx.get(entRef);
    const current = snap.exists ? snap.data() : {};

    // Miroir symétrique : ne pas écraser un paiement unique encore VALIDE
    // avec ce webhook mensuel (course rare, déjà bloquée en amont).
    const currentPremiumUntilMs = current.premiumUntil && current.premiumUntil.toMillis ? current.premiumUntil.toMillis() : 0;
    const currentlyActiveOneTime = current.planType === "onetime" && currentPremiumUntilMs > Date.now();
    if (currentlyActiveOneTime) {
      tx.set(db_().doc(`billingConflicts/sub_${sub.id}_${Date.now()}`), {
        uid, stripeSubscriptionId: sub.id, subStatus: sub.status,
        reason: "monthly_blocked_by_active_onetime",
        createdAt: FieldValue.serverTimestamp()
      });
      logger.warn(`⚠ CONFLIT : abonnement ${sub.status} pour entitlements/${uid} bloqué par un paiement unique encore valide. Journalisé, vérifier manuellement.`);
      return false;
    }

    tx.set(entRef, {
      status,
      planType: "monthly",
      premiumUntil: periodEnd ? Timestamp.fromDate(periodEnd) : null,
      writeAccessUntil: periodEnd ? Timestamp.fromDate(periodEnd) : null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    tx.set(billingRef, {
      stripeSubscriptionId: sub.id,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return true;
  });

  if (!applied) return;
  logger.info(`entitlements/${uid} ← ${sub.status} (mensuel) jusqu'au ${periodEnd ? periodEnd.toISOString() : "N/A"}.`);
}

/* ═══════════════════════════════════════════════════════════════════════
   sweepExpiredTrials — planifiée, quotidienne
   ───────────────────────────────────────────────────────────────────────
   Filet de sécurité d'AFFICHAGE : sans cette fonction, un entitlement créé
   avec status:'trial' resterait littéralement à 'trial' pour toujours,
   même après que trialEndsAt soit passé — comptepremium.html afficherait
   alors indéfiniment "essai en cours" à un compte dont l'essai est en
   réalité terminé. N'affecte AUCUN droit d'accès réel (les Rules
   Firestore doivent se baser sur writeAccessUntil/premiumUntil, jamais sur
   ce `status` textuel) — uniquement la justesse du texte affiché.
   ═══════════════════════════════════════════════════════════════════════ */
const { onSchedule } = require("firebase-functions/v2/scheduler");
exports.sweepExpiredTrials = onSchedule(
  { region: REGION, schedule: "every 24 hours" },
  async () => {
    const db = db_();
    const nowTs = Timestamp.now();
    const snap = await db.collection("entitlements")
      .where("status", "==", "trial")
      .where("trialEndsAt", "<=", nowTs)
      .limit(500)
      .get();
    if (snap.empty) return;

    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.set(doc.ref, { status: "expired", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    await batch.commit();
    logger.info(`sweepExpiredTrials: ${snap.size} essai(s) basculé(s) en 'expired'.`);
  }
);

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN — sauvegarde / restauration pour un utilisateur (admin.html)
   ───────────────────────────────────────────────────────────────────────
   P0 : "utilisateur A pouvant modifier les données de B" et "écrasement
   accidentel" (CLAUDE.md). Ces deux callables sont donc les SEULES portes
   d'entrée qui écrivent des données applicatives d'un utilisateur tiers —
   volontairement PAS un assouplissement des Firestore Rules (qui
   laisserait n'importe quel client authentifié isAdmin=true écrire
   directement dans les sous-collections d'un autre utilisateur, sans
   journalisation ni filet de sécurité). isAdmin est revérifié ICI, côté
   serveur (Admin SDK, ne fait jamais confiance à un claim client).

   ⚠ Le tableur (public/tableur.html) n'écrit encore RIEN dans
   users/{uid}/backups à ce jour (vérifié par grep, aucune occurrence) —
   la création automatique de sauvegardes reste une tâche séparée, non
   fait ici. adminCreateBackup existe pour que cet onglet admin soit
   réellement testable de bout en bout (créer → lister → restaurer) en
   attendant, pas comme un système de sauvegarde automatique.

   Restauration = fusion/écrasement des documents présents dans la
   sauvegarde, JAMAIS de suppression des documents créés depuis (cohérent
   avec le principe déjà en tête de firestore.rules : pas de suppression
   physique de données utilisateur). Une restauration n'est donc pas un
   retour exact à un instant T si des documents ont été créés entre-temps
   — seuls ceux présents dans la sauvegarde sont réécrits.
   ═══════════════════════════════════════════════════════════════════════ */
const ADMIN_BACKUP_SUBCOLLECTIONS = [
  "subjects", "courses", "notes", "flashcards", "errorEntries",
  "trainingItems", "tasks", "calendarDays", "dailyStats"
];

async function requireAdmin(request) {
  const auth = requireVerifiedUser(request);
  const snap = await db_().doc(`users/${auth.uid}`).get();
  if (!snap.exists || snap.data().isAdmin !== true) {
    throw new HttpsError("permission-denied", "Réservé aux administrateurs.");
  }
  return auth;
}

async function snapshotUserSubcollections(uid) {
  const db = db_();
  const snapshot = {};
  for (const name of ADMIN_BACKUP_SUBCOLLECTIONS) {
    const col = await db.collection(`users/${uid}/${name}`).get();
    snapshot[name] = col.docs.map((d) => ({ id: d.id, data: d.data() }));
  }
  return snapshot;
}

async function writeBatchedDocs(uid, subcollection, entries) {
  const db = db_();
  const CHUNK = 400; // marge sous la limite Firestore de 500 écritures/batch
  for (let i = 0; i < entries.length; i += CHUNK) {
    const batch = db.batch();
    for (const entry of entries.slice(i, i + CHUNK)) {
      batch.set(db.doc(`users/${uid}/${subcollection}/${entry.id}`), entry.data);
    }
    await batch.commit();
  }
}

exports.adminCreateBackup = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(request);
  const targetUid = request.data && request.data.targetUid;
  const label = request.data && request.data.label;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "targetUid manquant.");
  }
  const targetSnap = await db_().doc(`users/${targetUid}`).get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "Utilisateur introuvable.");
  }

  const snapshot = await snapshotUserSubcollections(targetUid);
  const docCount = Object.values(snapshot).reduce((n, arr) => n + arr.length, 0);
  const backupRef = db_().collection(`users/${targetUid}/backups`).doc();
  await backupRef.set({
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "admin",
    createdByUid: admin.uid,
    label: (typeof label === "string" && label.trim()) ? label.trim().slice(0, 200) : `Sauvegarde manuelle (${docCount} document(s))`,
    docCount,
    snapshot
  });

  logger.info(`adminCreateBackup: ${admin.uid} → sauvegarde ${backupRef.id} pour ${targetUid} (${docCount} docs).`);
  return { backupId: backupRef.id, docCount };
});

exports.adminRestoreBackup = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(request);
  const targetUid = request.data && request.data.targetUid;
  const backupId = request.data && request.data.backupId;
  if (!targetUid || !backupId) {
    throw new HttpsError("invalid-argument", "targetUid et backupId requis.");
  }

  const backupSnap = await db_().doc(`users/${targetUid}/backups/${backupId}`).get();
  if (!backupSnap.exists) {
    throw new HttpsError("not-found", "Sauvegarde introuvable.");
  }
  const backup = backupSnap.data();
  const snapshot = backup && backup.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    throw new HttpsError("failed-precondition", "Cette sauvegarde n'a pas de contenu exploitable (ancien format ou vide).");
  }

  // Filet de sécurité anti-écrasement accidentel : l'état ACTUEL est
  // sauvegardé avant toute restauration, même sans demande explicite —
  // une restauration reste ainsi toujours réversible depuis cet onglet.
  const preRestoreSnapshot = await snapshotUserSubcollections(targetUid);
  const preRestoreDocCount = Object.values(preRestoreSnapshot).reduce((n, arr) => n + arr.length, 0);
  await db_().collection(`users/${targetUid}/backups`).doc().set({
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "admin_auto_pre_restore",
    createdByUid: admin.uid,
    label: `Auto — juste avant restauration de la sauvegarde ${backupId}`,
    docCount: preRestoreDocCount,
    snapshot: preRestoreSnapshot
  });

  let restoredDocs = 0;
  for (const name of ADMIN_BACKUP_SUBCOLLECTIONS) {
    const entries = Array.isArray(snapshot[name]) ? snapshot[name] : [];
    if (entries.length) {
      await writeBatchedDocs(targetUid, name, entries);
      restoredDocs += entries.length;
    }
  }

  logger.warn(`adminRestoreBackup: ${admin.uid} a restauré la sauvegarde ${backupId} pour ${targetUid} (${restoredDocs} documents réécrits). État précédent conservé automatiquement.`);
  return { restoredDocs };
});
