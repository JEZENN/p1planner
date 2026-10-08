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
  paymentsEnabledFor, computeSubscriptionAccess
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
// Bug réel corrigé (remonté par l'utilisateur : nom jamais enregistré côté
// Firestore, e-mail de réinitialisation jamais envoyé) : `db_()` et `auth_()`
// appelaient chacune `initializeApp()` derrière leur PROPRE variable de cache
// (`_db`/`_auth`) — la première fonction appelée dans une invocation
// initialisait l'app avec succès, mais la SECONDE (ex. `updateDisplayName`
// appelle `auth_()` puis `db_()` ; `sendPasswordResetEmail` appelle `db_()`
// puis `auth_()`) tombait alors sur `initializeApp()` une deuxième fois et
// plantait avec `app/duplicate-app` — confirmé dans les logs Cloud Functions
// (100% des appels de `updateDisplayName` et `sendPasswordResetEmail`
// échouaient ainsi). Aucune fonction existante n'avait jusqu'ici besoin des
// deux à la fois dans un même appel, d'où un bug resté invisible. Corrigé en
// partageant UN SEUL verrou d'initialisation entre les deux fonctions.
let _appInitialized = false;
function ensureApp_() {
  if (!_appInitialized) { initializeApp(); _appInitialized = true; }
}
let _db = null;
function db_() {
  ensureApp_();
  if (!_db) { _db = getFirestore(); }
  return _db;
}
let _auth = null;
function auth_() {
  ensureApp_();
  if (!_auth) { _auth = getAuth(); }
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

function passwordResetEmailHtml(link) {
  return `<!doctype html><html><body style="font-family:sans-serif;background:#f5f3ff;padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
      <h1 style="color:#6d28d9;font-size:20px;margin:0 0 16px;">Réinitialise ton mot de passe</h1>
      <p style="color:#374151;line-height:1.6;">Tu as demandé à réinitialiser le mot de passe de ton compte P1Planner. Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
      <p style="margin:28px 0;">
        <a href="${link}" style="background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Choisir un nouveau mot de passe</a>
      </p>
      <p style="color:#9ca3af;font-size:13px;word-break:break-all;overflow-wrap:anywhere;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br><a href="${link}" style="color:#6d28d9;">${link}</a></p>
      <p style="color:#9ca3af;font-size:13px;">Si tu n'es pas à l'origine de cette demande, ignore simplement cet email : ton mot de passe ne changera pas.</p>
    </div>
  </body></html>`;
}

function emailChangeVerificationHtml(link, newEmail) {
  return `<!doctype html><html><body style="font-family:sans-serif;background:#f5f3ff;padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
      <h1 style="color:#6d28d9;font-size:20px;margin:0 0 16px;">Confirme ta nouvelle adresse e-mail</h1>
      <p style="color:#374151;line-height:1.6;">Tu as demandé à faire de <strong>${newEmail}</strong> la nouvelle adresse de connexion de ton compte P1Planner. Clique sur le bouton ci-dessous pour confirmer — ton adresse actuelle reste active tant que ce lien n'est pas ouvert.</p>
      <p style="margin:28px 0;">
        <a href="${link}" style="background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Confirmer cette adresse</a>
      </p>
      <p style="color:#9ca3af;font-size:13px;word-break:break-all;overflow-wrap:anywhere;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br><a href="${link}" style="color:#6d28d9;">${link}</a></p>
      <p style="color:#9ca3af;font-size:13px;">Si tu n'es pas à l'origine de cette demande, ignore simplement cet email.</p>
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

   Throttle 60s (verificationEmailThrottle/{uid}) ajouté pour pouvoir être
   appelée AUTOMATIQUEMENT (voir auth.html, à chaque tentative de connexion
   bloquée par email non vérifié) sans jamais spammer Brevo/le mailer de
   secours si l'utilisateur retente sa connexion plusieurs fois de suite.
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
    const throttleRef = db_().doc(`verificationEmailThrottle/${uid}`);
    const nowMs = Date.now();
    const throttleSnap = await throttleRef.get();
    const lastSentMs = throttleSnap.exists ? throttleSnap.get("lastSentAtMs") : 0;
    if (typeof lastSentMs === "number" && nowMs - lastSentMs < 60000) {
      return { sent: true };
    }
    await throttleRef.set({ lastSentAtMs: nowMs }, { merge: true });
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
   sendPasswordResetEmail — callable (v2), PUBLIC (pas d'auth requise —
   c'est justement pour un utilisateur qui ne peut plus se connecter).
   Remplace sendPasswordResetEmail() du SDK client (bug signalé : "ne
   fonctionne pas" — même cause que la vérification d'email, le mailer par
   défaut Firebase peu fiable, déjà contourné ailleurs via Brevo).

   Ne révèle JAMAIS si le compte existe (réponse identique dans tous les
   cas) — et un throttle par adresse (Firestore, 60s) empêche qu'un appel
   répété ne spamme la boîte mail d'un tiers dont on connaîtrait l'adresse.
   ═══════════════════════════════════════════════════════════════════════ */
exports.sendPasswordResetEmail = onCall(
  { region: REGION, secrets: [BREVO_API_KEY] },
  async (request) => {
    const email = request.data && typeof request.data.email === "string" ? request.data.email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "Adresse email invalide.");
    }
    const throttleRef = db_().doc(`passwordResetThrottle/${encodeURIComponent(email.toLowerCase())}`);
    const nowMs = Date.now();
    const throttleSnap = await throttleRef.get();
    const lastSentMs = throttleSnap.exists ? throttleSnap.get("lastSentAtMs") : 0;
    if (typeof lastSentMs === "number" && nowMs - lastSentMs < 60000) {
      // Silencieux : ni erreur ni renvoi, pour ne jamais révéler l'existence
      // du compte ni permettre à un tiers de sonder le throttle.
      return { sent: true };
    }
    await throttleRef.set({ lastSentAtMs: nowMs }, { merge: true });
    try {
      const link = await auth_().generatePasswordResetLink(email);
      await sendBrevoEmail(BREVO_API_KEY.value(), {
        to: email,
        subject: "Réinitialise ton mot de passe — P1Planner",
        html: passwordResetEmailHtml(link)
      });
      logger.info(`sendPasswordResetEmail: envoyé à ${email}.`);
    } catch (e) {
      // auth/user-not-found notamment : jamais révélé au client, juste loggé.
      logger.info(`sendPasswordResetEmail: pas d'envoi pour ${email} (${e.code || e.message}).`);
    }
    return { sent: true };
  }
);

/* ═══════════════════════════════════════════════════════════════════════
   updateDisplayName — callable (v2), authentifié + vérifié.
   Met à jour le profil Auth ET users/{uid}.displayName (backend-only en
   écriture, voir firestore.rules — jamais depuis le client, contrairement
   à la référence TypixClin qui y écrit directement). Les DEUX sont
   maintenus synchronisés ici pour que tableur.html (qui lit
   userInfo.displayName en priorité) ET comptepremium.html/auth.html (qui
   lisent user.displayName) affichent la même valeur immédiatement.
   ═══════════════════════════════════════════════════════════════════════ */
exports.updateDisplayName = onCall({ region: REGION }, async (request) => {
  const auth = requireVerifiedUser(request);
  const raw = request.data && typeof request.data.displayName === "string" ? request.data.displayName.trim().replace(/\s+/g, " ") : "";
  if (raw.length < 2 || raw.length > 60) {
    throw new HttpsError("invalid-argument", "Le nom doit contenir entre 2 et 60 caractères.");
  }
  await auth_().updateUser(auth.uid, { displayName: raw });
  await db_().doc(`users/${auth.uid}`).set({ displayName: raw, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  logger.info(`updateDisplayName: ${auth.uid} → "${raw}".`);
  return { displayName: raw };
});

/* ═══════════════════════════════════════════════════════════════════════
   requestEmailChange — callable (v2), authentifié + vérifié.
   L'appelant doit s'être RÉAUTHENTIFIÉ côté client juste avant (mot de
   passe actuel confirmé via reauthenticateWithCredential) — cette Function
   ne vérifie pas le mot de passe elle-même (l'Admin SDK ne le peut pas),
   elle s'appuie sur la fraîcheur du jeton apportée par cette
   réauthentification. Génère le lien de confirmation nous-mêmes
   (generateVerifyAndChangeEmailLink, Admin SDK) plutôt que d'utiliser
   verifyBeforeUpdateEmail() du SDK client, qui enverrait via le mailer par
   défaut Firebase (même contournement Brevo que le reste). L'adresse
   actuelle ne change qu'une fois ce lien ouvert par l'utilisateur.
   ═══════════════════════════════════════════════════════════════════════ */
exports.requestEmailChange = onCall(
  { region: REGION, secrets: [BREVO_API_KEY] },
  async (request) => {
    const auth = requireVerifiedUser(request);
    const newEmail = request.data && typeof request.data.newEmail === "string" ? request.data.newEmail.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      throw new HttpsError("invalid-argument", "Adresse email invalide.");
    }
    const userRecord = await auth_().getUser(auth.uid);
    if (newEmail.toLowerCase() === (userRecord.email || "").toLowerCase()) {
      throw new HttpsError("invalid-argument", "C'est déjà ton adresse actuelle.");
    }
    // La fraîcheur du jeton (auth_time récent) confirme la réauthentification
    // faite juste avant côté client — sans ça, n'importe quel jeton valide
    // (même ancien) suffirait à déclencher un changement d'adresse.
    const authTimeSec = request.auth.token && request.auth.token.auth_time;
    if (!authTimeSec || Date.now() / 1000 - authTimeSec > 300) {
      throw new HttpsError("failed-precondition", "Reconnecte-toi puis réessaie (session trop ancienne pour cette opération sensible).");
    }
    let link;
    try {
      link = await auth_().generateVerifyAndChangeEmailLink(userRecord.email, newEmail);
    } catch (e) {
      if (e && e.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "Cette adresse est déjà utilisée par un autre compte.");
      }
      logger.error(`requestEmailChange: échec de génération du lien pour ${auth.uid} :`, e);
      throw new HttpsError("internal", "Impossible de préparer ce changement pour le moment.");
    }
    await sendBrevoEmail(BREVO_API_KEY.value(), {
      to: newEmail,
      subject: "Confirme ta nouvelle adresse e-mail — P1Planner",
      html: emailChangeVerificationHtml(link, newEmail)
    });
    logger.info(`requestEmailChange: lien envoyé à ${newEmail} pour ${auth.uid}.`);
    return { sent: true };
  }
);

/* Resynchronise users/{uid}.email sur l'adresse réelle Firebase Auth.
   Bug réel corrigé (remonté par l'utilisateur) : un changement d'adresse
   confirmé via le lien de requestEmailChange est appliqué par Firebase Auth
   lui-même (le client ouvre le lien, Firebase bascule l'adresse) — rien ne
   repasse alors par notre code, et le client ne peut de toute façon jamais
   écrire users/{uid} lui-même (`allow write: if false` inconditionnel, voir
   firestore.rules). Utilise `request.auth.token.email`, l'adresse VÉRIFIÉE
   par la signature du jeton Firebase — jamais une valeur transmise par le
   client — donc pas de risque qu'un appelant s'attribue une adresse
   arbitraire dans son propre document. Appelée par tableur.html dès qu'un
   écart est détecté entre users/{uid}.email et l'e-mail Auth courant. */
exports.syncEmailMirror = onCall({ region: REGION }, async (request) => {
  const auth = requireVerifiedUser(request);
  const email = (request.auth.token && request.auth.token.email) || null;
  await db_().doc(`users/${auth.uid}`).set(
    { email, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  logger.info(`syncEmailMirror: users/${auth.uid}.email resynchronisé sur ${email}.`);
  return { synced: true };
});

/* ═══════════════════════════════════════════════════════════════════════
   onUserCreated — trigger Auth (v1, background trigger "at-least-once")
   ───────────────────────────────────────────────────────────────────────
   À la création d'un compte Firebase Authentication, crée côté SERVEUR :
     - users/{uid}            profil d'identité (jamais écrit par le client)
     - entitlements/{uid}     essai gratuit 15 jours, source de vérité
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
      // Bug réel remonté par l'utilisateur : la date de concours ne devrait
      // pas être obligatoire pour acheter un paiement unique — l'utilisateur
      // doit pouvoir choisir de l'indiquer ou non. Or le serveur bloquait
      // quand même tout achat tant qu'elle n'était pas enregistrée, alors
      // que le curseur de durée côté client propose déjà, lui, un défaut de
      // 12 mois en son absence (voir updateMaxMonths(p.maxMonths || 12)).
      // Sans date, le serveur applique désormais ce même défaut de 12 mois
      // au lieu de refuser l'achat — la date reste utile (elle affine/étend
      // la durée max disponible jusqu'à MAX_MONTHS_CAP), mais n'est plus
      // obligatoire (label mis à jour en "(optionnel)" côté front).
      const maxMonths = (entitlement && entitlement.maxMonths) || 12;
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
    // AUDIT PAIEMENTS : Stripe Checkout exige que trial_end soit au moins
    // 48 h dans le futur (sinon la création de la session échoue et
    // l'utilisateur voit une erreur générique). En deçà, on n'envoie pas
    // trial_end : le premier prélèvement a lieu tout de suite (le reliquat
    // d'essai de moins de 2 jours est perdu, cas assumé et rare) plutôt que
    // de bloquer toute souscription pendant les 2 derniers jours d'essai.
    const minTrialEndSec = Math.floor(Date.now() / 1000) + 48 * 3600 + 300;
    const trialEndSec = Math.floor(trialEndsAtMs / 1000);
    if (trialEndSec > minTrialEndSec) {
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
          // API Stripe récente : la référence d'abonnement a migré de
          // invoice.subscription vers invoice.parent.subscription_details.
          const rawSub = inv.subscription
            || (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription);
          const subId = typeof rawSub === "string" ? rawSub : (rawSub && rawSub.id);
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            await syncSubscription(stripe, sub);
          }
          break;
        }
        // AUDIT PAIEMENTS : remboursement total ou litige (chargeback) d'un
        // paiement UNIQUE = accès retiré. Nécessite d'activer ces deux
        // événements sur le point de terminaison webhook dans le Dashboard
        // Stripe (sans effet tant qu'ils ne sont pas envoyés).
        case "charge.refunded": {
          const ch = event.data.object;
          if (ch.refunded === true) await revokeOneTimeForPaymentIntent(ch.payment_intent, "refunded");
          break;
        }
        case "charge.dispute.created": {
          const dp = event.data.object;
          await revokeOneTimeForPaymentIntent(dp.payment_intent, "dispute");
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

    // AUDIT PARRAINAGE (2026-09-27) : un essai PROLONGÉ par le parrainage
    // (trialEndsAt/writeAccessUntil > fin de la durée achetée) ne doit jamais
    // être RACCOURCI par un achat : writeAccessUntil ne baisse jamais.
    const existingWriteMs = current.writeAccessUntil && current.writeAccessUntil.toMillis ? current.writeAccessUntil.toMillis() : 0;
    const finalWriteAccess = existingWriteMs > finalEnd.toMillis() ? current.writeAccessUntil : finalEnd;
    tx.set(entRef, {
      status: "active",
      planType: "onetime",
      premiumUntil: finalEnd,
      writeAccessUntil: finalWriteAccess,
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

/* Retire l'accès d'un paiement UNIQUE remboursé en totalité ou contesté
   (litige). Retrouve l'utilisateur via billingPrivate.stripePaymentIntentId
   (dernier paiement unique enregistré) : un paiement plus ancien, déjà
   remplacé, ne correspond à rien et est simplement journalisé. Ne touche
   jamais aux données utilisateur — seulement writeAccessUntil/status ; le
   reliquat d'essai gratuit éventuel est conservé. */
async function revokeOneTimeForPaymentIntent(rawPaymentIntent, reason) {
  const pi = typeof rawPaymentIntent === "string" ? rawPaymentIntent : (rawPaymentIntent && rawPaymentIntent.id);
  if (!pi) { logger.info(`revokeOneTime(${reason}) : pas de payment_intent, ignoré.`); return; }
  const q = await db_().collection("billingPrivate").where("stripePaymentIntentId", "==", pi).limit(1).get();
  if (q.empty) { logger.info(`revokeOneTime(${reason}) : aucun compte pour ${pi} (paiement ancien ou abonnement), ignoré.`); return; }
  const uid = q.docs[0].id;
  const entRef = db_().doc(`entitlements/${uid}`);
  await db_().runTransaction(async (tx) => {
    const snap = await tx.get(entRef);
    const current = snap.exists ? snap.data() : {};
    if (current.planType !== "onetime" || current.status !== "active") return;
    const nowMs = Date.now();
    const trialEndMs = current.trialEndsAt && current.trialEndsAt.toMillis ? current.trialEndsAt.toMillis() : 0;
    tx.set(entRef, {
      status: "expired",
      premiumUntil: Timestamp.fromMillis(nowMs),
      writeAccessUntil: Timestamp.fromMillis(Math.max(nowMs, trialEndMs)),
      revokedReason: reason,
      revokedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
  logger.warn(`entitlements/${uid} : accès paiement unique retiré (${reason}, ${pi}).`);
}

/* Écrit l'abonnement mensuel dans entitlements/{uid} + billingPrivate/{uid}. */
async function syncSubscription(stripe, sub, fallbackUid) {
  // AUDIT PAIEMENTS : Stripe ne garantit pas l'ordre de livraison des
  // événements. Se fier à l'objet embarqué dans l'événement pouvait faire
  // "ressusciter" un abonnement (un customer.subscription.updated tardif
  // écrasant un .deleted déjà traité). On relit donc TOUJOURS l'état
  // courant chez Stripe ; repli sur l'objet reçu seulement si la relecture
  // échoue (l'erreur est journalisée, jamais silencieuse).
  try {
    sub = await stripe.subscriptions.retrieve(sub.id);
  } catch (e) {
    logger.warn(`syncSubscription: relecture de ${sub.id} impossible, objet d'événement utilisé :`, e.message);
  }
  let uid = (sub.metadata && sub.metadata.firebaseUID) || fallbackUid;

  if (!uid) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const q = await db_().collection("billingPrivate").where("stripeCustomerId", "==", customerId).limit(1).get();
    if (!q.empty) uid = q.docs[0].id;
  }
  if (!uid) { logger.warn("Abonnement sans uid identifiable :", sub.id); return; }

  // API Stripe récente : current_period_end vit dans items.data[0], pas à
  // la racine de l'abonnement (cf. référence TypixClin, même piège évité).
  const rawPeriodEnd = sub.items && sub.items.data && sub.items.data[0]
    ? sub.items.data[0].current_period_end : sub.current_period_end;
  const periodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : null;

  const entRef = db_().doc(`entitlements/${uid}`);
  const billingRef = db_().doc(`billingPrivate/${uid}`);

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

    // Accès déduit du statut par une fonction pure et testée
    // (premiumPlans.computeSubscriptionAccess) : pas de prolongation offerte
    // sur impayé, pas de reliquat après résiliation immédiate.
    const access = computeSubscriptionAccess({
      status: sub.status,
      periodEndMs: periodEnd ? periodEnd.getTime() : 0,
      endedAtMs: sub.ended_at ? sub.ended_at * 1000 : 0
    }, current, Date.now());
    const toTs = (ms) => (ms ? Timestamp.fromMillis(ms) : null);

    tx.set(entRef, {
      status: access.status,
      planType: "monthly",
      premiumUntil: toTs(access.premiumUntilMs),
      writeAccessUntil: toTs(access.writeAccessMs),
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      paymentIssueGraceUntil: access.graceUntilMs ? Timestamp.fromMillis(access.graceUntilMs) : FieldValue.delete(),
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
    if (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.set(doc.ref, { status: "expired", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      logger.info(`sweepExpiredTrials: ${snap.size} essai(s) basculé(s) en 'expired'.`);
    }

    // AUDIT PAIEMENTS : un paiement UNIQUE dont la date de fin est passée
    // restait indéfiniment en status:'active' (affichage "Premium actif"
    // trompeur, jamais d'accès réel — les Rules se basent sur
    // writeAccessUntil). Même filet d'affichage que pour les essais. Les
    // abonnements mensuels ne sont volontairement PAS touchés ici : leur
    // statut vient uniquement du webhook (un retard de webhook ne doit
    // jamais couper un abonné qui paie).
    try {
      const paid = await db.collection("entitlements")
        .where("status", "==", "active")
        .where("premiumUntil", "<=", nowTs)
        .limit(500)
        .get();
      // 'referral' = accès offert par le parrainage à un parrain qui n'avait
      // plus rien (voir computeReferralCredit) : sans lui, un ex-abonné
      // mensuel resterait « actif » pour toujours à la fin du bonus.
      const oneTime = paid.docs.filter((d) => d.get("planType") === "onetime" || d.get("planType") === "referral");
      if (oneTime.length) {
        const batch2 = db.batch();
        oneTime.forEach((doc) => {
          batch2.set(doc.ref, { status: "expired", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
        await batch2.commit();
        logger.info(`sweepExpiredTrials: ${oneTime.length} paiement(s) unique(s) échu(s) basculé(s) en 'expired'.`);
      }
    } catch (e) {
      logger.error("sweepExpiredTrials (paiements uniques échus) :", e);
    }
  }
);

/* ═══════════════════════════════════════════════════════════════════════
   PARRAINAGE (2026-09-25) — voir functions/referral.js pour la logique
   pure (alphabet, paliers, calcul de crédit) et les règles Firestore
   associées (referralCodes/{code}, referrals/{filleulUid}).
   ───────────────────────────────────────────────────────────────────────
   Port du système de parrainage le produit frère (conçu/testé/corrigé le
   2026-09-24 côté le produit frère), adapté au schéma P1Planner : le parrain est
   crédité sur `entitlements/{uid}` (writeAccessUntil/premiumUntil, pas un
   sous-champ `premium.*` sur `users/{uid}` comme chez le produit frère) ; son
   code partageable vit sur `users/{uid}.referralCode` (profil, jamais un
   droit d'accès). `users/{uid}` et `entitlements/{uid}` ont déjà
   `allow write: if false` dans firestore.rules — ces nouveaux champs sont
   donc protégés sans règle supplémentaire.

   Fonctions exportées (5, mêmes rôles que le produit frère) :
     • referralInit({referredBy?})   — juste après l'inscription, AVANT
       email vérifié (fenêtre createUser -> signOut de auth.html).
     • referralEnsureCode()          — rattrapage paresseux (compte créé
       avant cette fonctionnalité), appelée par comptepremium.html.
     • referralCheckCode({code})     — SANS authentification, {valid}
       uniquement, jamais l'identité du parrain.
     • referralMarkActive()          — après une connexion réussie avec
       email vérifié : compte le filleul, crédite le parrain.
     • referralApplyCode({code})     — saisie rétroactive (compte déjà
       existant, champ laissé vide à l'inscription).
   ═══════════════════════════════════════════════════════════════════════ */
const {
  REFERRAL_CODE_MAX_ATTEMPTS,
  generateReferralCode, normalizeReferralCode, computeReferralCredit, sanitizeReferralName, referralEmailKey
} = require("./referral");

/* Réserve un code de parrainage pour `uid` et le renvoie. Idempotent : si
   l'utilisateur a déjà un code, le renvoie tel quel sans rien écrire.
   Unicité GARANTIE par Firestore lui-même (tx.get + tx.set échoue de façon
   cohérente si `referralCodes/{CODE}` existe déjà entre-temps — pas de
   vérification manuelle hors transaction). */
async function reserveReferralCode(uid) {
  const db = db_();
  const userRef = db.doc(`users/${uid}`);
  const existing = await userRef.get();
  const already = existing.exists ? existing.get("referralCode") : null;
  if (already) return already;

  for (let attempt = 0; attempt < REFERRAL_CODE_MAX_ATTEMPTS; attempt++) {
    const code = generateReferralCode();
    const codeRef = db.doc(`referralCodes/${code}`);
    try {
      // Deux appels concurrents pour le MÊME compte (inscription + ouverture de
      // Compte Premium) : la relecture du code DANS la transaction évite qu'un
      // second code écrase le premier (le code d'un compte ne change jamais).
      const final = await db.runTransaction(async (tx) => {
        const codeSnap = await tx.get(codeRef);
        const userSnap = await tx.get(userRef);
        const nowHas = userSnap.exists ? userSnap.get("referralCode") : null;
        if (nowHas) return nowHas;
        if (codeSnap.exists) throw new Error("REFERRAL_CODE_TAKEN");
        tx.set(codeRef, { uid, createdAt: FieldValue.serverTimestamp() });
        tx.set(userRef, { referralCode: code }, { merge: true });
        return code;
      });
      return final;
    } catch (e) {
      if (e.message === "REFERRAL_CODE_TAKEN") continue; // collision : on retire un autre code
      throw e;
    }
  }
  throw new HttpsError("resource-exhausted", "Impossible de générer un code de parrainage, réessayez.");
}

/* Firestore impose que TOUTES les lectures d'une transaction précèdent
   TOUTES ses écritures — le crédit est donc scindé en deux :
   lireEtatParrainPourCredit() (lecture pure, appelée AVANT tout tx.update()
   dans l'appelant) puis appliquerCreditParrain() (calcul + écriture pure,
   plus aucune lecture). Voir referralMarkActive/referralApplyCode pour
   l'ordre exact (lecture referrals -> lecture parrain -> écritures). */
async function lireEtatParrainPourCredit(tx, referrerUid) {
  const db = db_();
  const entitlementsRef = db.doc(`entitlements/${referrerUid}`);
  const entSnap = await tx.get(entitlementsRef);
  if (!entSnap.exists) return null; // parrain sans entitlement (ne devrait pas arriver) : rien à créditer

  const billingSnap = await tx.get(db.doc(`billingPrivate/${referrerUid}`));
  const stripeSubscriptionId = billingSnap.exists ? billingSnap.get("stripeSubscriptionId") : null;
  return { entitlementsRef, entSnap, stripeSubscriptionId };
}

/* CORRECTIF SÉCURITÉ appliqué dès l'écriture (même bug trouvé et corrigé
   sur le produit frère le 2026-09-24, voir functions/referral.js) : le compteur
   `referralActiveCount` ET `referralMonthsGranted`/les dates d'accès
   étendues sont calculés PUIS écrits ENSEMBLE, dans le MÊME tx.update(),
   sur le MÊME document (`entitlements/{referrerUid}`) — jamais un
   FieldValue.increment() séparé après coup. Deux filleuls du MÊME parrain
   devenant actifs EN CONCURRENCE relisent alors FORCÉMENT, l'un après
   l'autre, la valeur déjà mise à jour par le premier (sérialisation
   native des transactions Firestore, avec retry automatique) : le second
   calcule un delta de 0, jamais un double-crédit. Seul l'appel réseau
   Stripe (cas abonnement récurrent) reste hors transaction, cf.
   grantReferralBonus ci-dessous.
   Pure écriture : aucune lecture ici (voir lireEtatParrainPourCredit).
   Quand le bonus ne peut PAS être appliqué automatiquement (abonnement
   déjà résilié, prélèvement en échec), aucune date n'est touchée et un
   document billingConflicts/referral_<uid>_<ts> est écrit DANS la même
   transaction, pour rattrapage manuel. */
function appliquerCreditParrain(tx, referrerUid, etat) {
  const { entitlementsRef, entSnap, stripeSubscriptionId } = etat;
  const toMs = (v) => (v && typeof v.toMillis === "function") ? v.toMillis() : 0;
  const result = computeReferralCredit({
    referralActiveCount: entSnap.get("referralActiveCount") || 0,
    referralMonthsGranted: entSnap.get("referralMonthsGranted") || 0,
    status: entSnap.get("status") || null,
    planType: entSnap.get("planType") || null,
    premiumUntilMs: toMs(entSnap.get("premiumUntil")),
    writeAccessUntilMs: toMs(entSnap.get("writeAccessUntil")),
    trialEndsAtMs: toMs(entSnap.get("trialEndsAt")),
    hasExploitableSubscription: !!stripeSubscriptionId,
    cancelAtPeriodEnd: entSnap.get("cancelAtPeriodEnd") === true,
    nowMs: Date.now()
  });

  const patch = {
    referralActiveCount: result.newCount,
    updatedAt: FieldValue.serverTimestamp()
  };
  if (result.delta > 0) {
    patch.referralMonthsGranted = result.newEarned;
    if (result.patch.writeAccessUntilMs != null) patch.writeAccessUntil = Timestamp.fromMillis(result.patch.writeAccessUntilMs);
    if (result.patch.premiumUntilMs != null) patch.premiumUntil = Timestamp.fromMillis(result.patch.premiumUntilMs);
    if (result.patch.trialEndsAtMs != null) patch.trialEndsAt = Timestamp.fromMillis(result.patch.trialEndsAtMs);
    if (result.patch.status) patch.status = result.patch.status;
    if (result.patch.planType) patch.planType = result.patch.planType;
  }
  tx.update(entitlementsRef, patch);

  if (result.manualCatchUp) {
    tx.set(db_().doc(`billingConflicts/referral_${referrerUid}_${Date.now()}`), {
      uid: referrerUid,
      reason: `referral_bonus_${result.manualCatchUp}`,
      monthsDue: result.delta,
      stripeSubscriptionId: stripeSubscriptionId || null,
      createdAt: FieldValue.serverTimestamp()
    });
    logger.warn(`[referral] bonus de ${result.delta} mois NON appliqué automatiquement pour ${referrerUid} (${result.manualCatchUp}) — journalisé dans billingConflicts.`);
  }

  return {
    delta: result.delta,
    manualCatchUp: result.manualCatchUp,
    stripeSync: result.useStripe ? { referrerUid, delta: result.delta, stripeSubscriptionId } : null
  };
}

/* Applique le bonus Stripe RÉCURRENT `delta` (en mois) — la SEULE partie
   qui ne peut pas vivre dans la transaction Firestore (appel réseau
   externe). referralActiveCount/referralMonthsGranted sont DÉJÀ écrits,
   de façon atomique, par appliquerCreditParrain ci-dessus : cette
   fonction ne touche plus à ces deux champs. Jamais de trial_end réécrit
   directement en Firestore : le webhook stripeWebhook (déjà en place)
   resynchronise writeAccessUntil/premiumUntil depuis Stripe à l'événement
   `customer.subscription.updated` suivant. */
async function grantReferralBonus(stripe, info) {
  const { referrerUid, delta, stripeSubscriptionId } = info;
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const rawPeriodEnd = sub.items && sub.items.data && sub.items.data[0] ? sub.items.data[0].current_period_end : sub.current_period_end;
  const baseSec = Math.max(rawPeriodEnd || 0, Math.floor(Date.now() / 1000));
  await stripe.subscriptions.update(stripeSubscriptionId, {
    trial_end: baseSec + delta * 30 * 86400,
    proration_behavior: "none"
  });
  await db_().doc(`entitlements/${referrerUid}`).update({ updatedAt: FieldValue.serverTimestamp() });
}

/* Journalise dans billingConflicts (même collection que le webhook) un
   bonus de parrainage qui n'a PAS pu être appliqué côté Stripe : sans cela
   le parrain verrait « N mois gagnés » (déjà écrit dans la transaction)
   sans aucun effet réel, et rien ne le signalerait. Ne lève JAMAIS. */
async function journalReferralBonusIssue(referrerUid, reason, delta, extra) {
  try {
    await db_().doc(`billingConflicts/referral_${referrerUid}_${Date.now()}`).set(Object.assign({
      uid: referrerUid, reason, monthsDue: delta, createdAt: FieldValue.serverTimestamp()
    }, extra || {}));
  } catch (e) {
    logger.error(`[referral] journalisation impossible pour ${referrerUid} :`, e);
  }
}

/* Bonus Stripe hors transaction : un échec (Stripe indisponible, abonnement
   introuvable côté Stripe...) ne fait JAMAIS échouer l'appel du filleul —
   il est journalisé pour rattrapage manuel (billingConflicts). */
async function applyStripeBonusOrJournal(info) {
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value(), { maxNetworkRetries: 2 });
    await grantReferralBonus(stripe, info);
  } catch (e) {
    logger.error(`[referral] échec grantReferralBonus pour ${info.referrerUid} :`, e);
    await journalReferralBonusIssue(info.referrerUid, "referral_stripe_sync_failed", info.delta, {
      stripeSubscriptionId: info.stripeSubscriptionId || null,
      error: String((e && e.message) || e).slice(0, 300)
    });
  }
}

/* Nom du filleul pour la notification/la liste du parrain. users/{uid}
   .displayName est souvent null à ce stade (onUserCreated s'exécute avant
   updateProfile d'auth.html) : jeton, puis compte Auth, puis profil.
   Calculé HORS transaction, jamais bloquant, toujours nettoyé. */
async function resolveReferralDisplayName(request) {
  const uid = request.auth.uid;
  let name = sanitizeReferralName(request.auth.token && request.auth.token.name);
  if (name) return name;
  try {
    const u = await auth_().getUser(uid);
    name = sanitizeReferralName(u.displayName);
    if (name) return name;
  } catch (e) { /* repli suivant */ }
  try {
    const s = await db_().doc(`users/${uid}`).get();
    if (s.exists) name = sanitizeReferralName(s.get("displayName"));
  } catch (e) { /* aucun nom : la notification restera sans nom */ }
  return name || null;
}

/* Clé d'e-mail (voir referralEmailKey) d'un compte : Auth d'abord, profil ensuite.
   Hors transaction, jamais bloquant (null si introuvable : la garde est alors sautée). */
async function emailKeyOfUser(uid) {
  try { const u = await auth_().getUser(uid); const k = referralEmailKey(u.email); if (k) return k; } catch (e) { /* repli */ }
  try { const d = await db_().doc(`users/${uid}`).get(); if (d.exists) return referralEmailKey(d.get("email")); } catch (e) { /* aucune garde */ }
  return null;
}
/* null = OK ; sinon 'same_inbox' (même boîte que le parrain) ou 'duplicate_inbox'
   (même boîte qu'un autre filleul déjà compté de ce parrain). Lecture DANS la transaction. */
async function inboxBlockReason(tx, referrerUid, filleulUid, filleulKey, parrainKey) {
  if (!filleulKey) return null;
  if (parrainKey && parrainKey === filleulKey) return "same_inbox";
  const dup = await tx.get(db_().collection("referrals").where("referrerUid", "==", referrerUid).where("emailKey", "==", filleulKey).limit(2));
  return dup.docs.some((d) => d.id !== filleulUid) ? "duplicate_inbox" : null;
}

const toMsSafe = (v) => (v && typeof v.toMillis === "function") ? v.toMillis() : 0;
const NEW_REFERRALS_MAX = 5;
const LIST_REFERRALS_MAX = 100;

/* Filleuls ACTIFS d'un parrain, plus récents d'abord. Requête sur un seul
   champ (index automatique, aucun index composite à déployer) ; le filtre
   `active` et le tri se font en mémoire (borné à 500 documents). */
async function listActiveReferralsOf(referrerUid) {
  const snap = await db_().collection("referrals").where("referrerUid", "==", referrerUid).limit(500).get();
  return snap.docs
    .filter((d) => d.get("active") === true)
    .map((d) => ({ uid: d.id, name: sanitizeReferralName(d.get("filleulName")), atMs: toMsSafe(d.get("activatedAt")) }))
    .sort((a, b) => b.atMs - a.atMs);
}

/* Appelée par auth.html juste après la création du compte (avant le
   signOut() qui suit la vérification email) — request.auth existe donc
   déjà, mais SANS email vérifié. PAS de requireVerifiedUser() ici,
   volontairement : ce serait toujours refusé à cet instant précis et
   aucun code ne serait jamais réservé. Réserve le code du NOUVEAU compte,
   et si un code de parrain a été saisi et validé côté client (blocage
   strict, voir auth.html), enregistre la relation (encore inactive :
   referralMarkActive s'occupe de compter le filleul). Ne lève JAMAIS
   d'erreur pour un code invalide/inconnu — l'inscription ne doit jamais
   échouer à cause du parrainage.
   « Un seul parrain à vie » : la lecture de referrals/{uid} ET l'écriture
   se font DANS la même transaction (deux appels concurrents avec deux
   codes différents ne peuvent plus s'écraser). */
exports.referralInit = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connexion requise.");
  const uid = request.auth.uid;
  const code = await reserveReferralCode(uid);

  const rawReferredBy = request.data && typeof request.data.referredBy === "string" ? request.data.referredBy : null;
  const enteredCode = normalizeReferralCode(rawReferredBy);
  if (enteredCode) {
    const db = db_();
    const codeSnap = await db.doc(`referralCodes/${enteredCode}`).get(); // immuable une fois créé
    const referrerUid = codeSnap.exists ? codeSnap.get("uid") : null;
    // referrerUid === uid : normalement impossible (le code de CE compte
    // vient d'être généré ci-dessus, après la saisie) — gardé par sécurité.
    if (referrerUid && referrerUid !== uid) {
      const referralRef = db.doc(`referrals/${uid}`);
      await db.runTransaction(async (tx) => {
        const already = await tx.get(referralRef);
        if (already.exists) return; // déjà lié : jamais de second parrain
        tx.set(referralRef, {
          referrerUid, code: enteredCode,
          createdAt: FieldValue.serverTimestamp(),
          active: false, activatedAt: null
        });
      });
    }
  }
  return { referralCode: code };
});

/* Appelée par comptepremium.html / tableur.html : garantit que le compte a
   un code (compte créé avant ce déploiement, jamais passé par referralInit)
   et renvoie code + compteurs en un seul aller-retour, plus les nouveaux
   filleuls non encore « vus » (notification). Les champs ajoutés ne sont
   JAMAIS requis par les pages (une ancienne réponse doit rester correcte). */
exports.referralEnsureCode = onCall({ region: REGION }, async (request) => {
  const auth = requireVerifiedUser(request);
  const code = await reserveReferralCode(auth.uid);
  const db = db_();
  const entSnap = await db.doc(`entitlements/${auth.uid}`).get();
  // alreadyReferred : le client ne peut PAS lire referrals/{uid} lui-même
  // (Rules : lecture réservée à isAdminUser()) — c'est donc ici, côté
  // serveur, qu'on le lui indique, pour savoir s'il faut encore lui
  // proposer le champ "code d'une autre personne" (cf. referralApplyCode).
  const refSnap = await db.doc(`referrals/${auth.uid}`).get();
  const activeCount = (entSnap.exists && entSnap.get("referralActiveCount")) || 0;
  const rawSeen = (entSnap.exists && entSnap.get("referralSeenCount")) || 0;
  const seenCount = Math.max(0, Math.min(Number.isFinite(rawSeen) ? Math.floor(rawSeen) : 0, activeCount));

  let newReferrals = [];
  if (activeCount > seenCount) {
    try {
      const rows = await listActiveReferralsOf(auth.uid);
      newReferrals = rows.slice(0, Math.min(activeCount - seenCount, NEW_REFERRALS_MAX))
        .map((r) => ({ name: r.name, at: r.atMs || null }));
    } catch (e) {
      logger.warn("referralEnsureCode : liste des nouveaux filleuls indisponible :", e);
    }
  }
  return {
    referralCode: code,
    referralActiveCount: activeCount,
    referralMonthsGranted: (entSnap.exists && entSnap.get("referralMonthsGranted")) || 0,
    alreadyReferred: refSnap.exists,
    referralSeenCount: seenCount,
    newReferrals
  };
});

/* Vérification en direct depuis le formulaire d'inscription (validation
   pendant la frappe, ~400ms de debounce côté auth.html). Appelable SANS
   authentification (l'inscription n'a pas encore eu lieu à ce stade) :
   c'est pourquoi elle ne renvoie QUE {valid}, jamais l'identité du parrain
   (uid, nom...), pour limiter ce qu'un appel non authentifié peut
   apprendre. */
exports.referralCheckCode = onCall({ region: REGION }, async (request) => {
  const raw = request.data && typeof request.data.code === "string" ? request.data.code : "";
  const normalized = normalizeReferralCode(raw);
  if (!normalized) return { valid: false };
  const snap = await db_().doc(`referralCodes/${normalized}`).get();
  return { valid: snap.exists };
});

/* Accusé de réception de la notification « nouveau filleul » :
   referralSeenCount = referralActiveCount, écrit CÔTÉ SERVEUR (users et
   entitlements sont write:false côté client, et settings/preferences exige
   canWrite — un compte expiré ne pourrait pas écrire). Aucun paramètre :
   la valeur ne peut jamais être falsifiée par le client. */
exports.referralMarkSeen = onCall({ region: REGION }, async (request) => {
  const auth = requireVerifiedUser(request);
  const entRef = db_().doc(`entitlements/${auth.uid}`);
  let seen = 0;
  await db_().runTransaction(async (tx) => {
    const snap = await tx.get(entRef);
    if (!snap.exists) return;
    seen = snap.get("referralActiveCount") || 0;
    if ((snap.get("referralSeenCount") || 0) !== seen) tx.update(entRef, { referralSeenCount: seen });
  });
  return { referralSeenCount: seen };
});

/* Liste des filleuls ACTIFS du parrain (tuile cliquable + modal) : uid pris
   dans le jeton, aucun paramètre. Ne renvoie JAMAIS d'uid ni d'e-mail :
   {name, code, at} seulement — le code (re-validé en sortie) permet de le
   saisir à son tour dans le champ rétroactif. 100 lignes max + total réel. */
exports.referralListReferrals = onCall({ region: REGION }, async (request) => {
  const auth = requireVerifiedUser(request);
  const rows = await listActiveReferralsOf(auth.uid);
  const page = rows.slice(0, LIST_REFERRALS_MAX);
  const db = db_();
  let userSnaps = [];
  if (page.length) {
    userSnaps = await db.getAll(...page.map((r) => db.doc(`users/${r.uid}`)));
  }
  const referrals = page.map((r, i) => {
    const u = userSnaps[i];
    const name = r.name || (u && u.exists ? sanitizeReferralName(u.get("displayName")) : null);
    const code = u && u.exists ? normalizeReferralCode(u.get("referralCode")) : null;
    return { name: name || null, code: code || null, at: r.atMs || null };
  });
  return { total: rows.length, referrals };
});

/* Appelée par auth.html juste après une connexion RÉUSSIE avec email
   vérifié (avant la redirection). Idempotente et silencieuse : sans
   parrain, ou filleul déjà comptabilisé, ne fait rien (aucune erreur,
   aucun impact sur la connexion en cours). C'est ce passage à active:true
   qui compte le filleul et déclenche la récompense du parrain dès que son
   compteur atteint un nouveau palier (cf. REFERRAL_TIERS dans
   referral.js). */
exports.referralMarkActive = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const auth = requireVerifiedUser(request);
  const uid = auth.uid;
  const db = db_();
  const referralRef = db.doc(`referrals/${uid}`);
  const snap = await referralRef.get();
  if (!snap.exists || snap.get("active") === true || snap.get("blocked")) { // blocked : déjà écarté (boîte mail en double), inutile de recommencer à chaque connexion
    return { activated: false, bonusMonths: 0 };
  }
  const referrerUid = snap.get("referrerUid");
  const filleulName = await resolveReferralDisplayName(request); // hors transaction, jamais bloquant
  const filleulKey = referralEmailKey(auth.token && auth.token.email);
  const parrainKey = filleulKey ? await emailKeyOfUser(referrerUid) : null;

  // Bascule active:true + crédite le parrain (appliquerCreditParrain,
  // compteur ET dates/statut ENSEMBLE) dans UNE transaction — protège
  // contre deux appels qui se chevauchent. Le calcul Stripe éventuel ne
  // peut PAS vivre dans cette transaction (appel réseau externe) : il est
  // fait juste après, à partir de credit.stripeSync.
  let credit = null;
  await db.runTransaction(async (tx) => {
    // ── Lectures d'abord (règle Firestore : toutes les lectures d'une
    //    transaction précèdent toutes ses écritures) ──
    const freshSnap = await tx.get(referralRef);
    if (!freshSnap.exists || freshSnap.get("active") === true) return; // déjà traité entre-temps
    const etatParrain = await lireEtatParrainPourCredit(tx, referrerUid);
    const blocked = await inboxBlockReason(tx, referrerUid, uid, filleulKey, parrainKey);

    // ── Puis écritures ──
    // Le filleul est marqué actif dans TOUS les cas dès qu'on dépasse la
    // garde ci-dessus — y compris si le parrain est introuvable (compte
    // supprimé), sinon ce même filleul serait retenté à CHAQUE connexion.
    const patch = { active: true, activatedAt: FieldValue.serverTimestamp() };
    if (filleulName) patch.filleulName = filleulName;
    if (filleulKey) patch.emailKey = filleulKey;
    if (blocked) { patch.active = false; patch.blocked = blocked; patch.blockedAt = FieldValue.serverTimestamp(); }
    tx.update(referralRef, patch);
    if (blocked) { logger.warn(`[referral] filleul ${uid} non compté pour ${referrerUid} (${blocked}).`); return; }
    if (etatParrain) credit = appliquerCreditParrain(tx, referrerUid, etatParrain);
  });

  if (credit && credit.stripeSync) await applyStripeBonusOrJournal(credit.stripeSync);
  return { activated: true, bonusMonths: credit ? credit.delta : 0 };
});

/* Un compte DÉJÀ existant (créé avant le parrainage, ou qui a simplement
   laissé le champ vide à l'inscription) peut renseigner après-coup le
   code de la personne qui l'a fait découvrir P1Planner. Appelée par
   comptepremium.html. C'est le PROPRIÉTAIRE du code (le parrain) qui est
   crédité — jamais celui qui le saisit ici.
   SÉCURITÉ : une fois qu'un compte a un document referrals/{uid} — qu'il
   vienne de referralInit (inscription) OU d'ICI — il ne peut plus JAMAIS
   en obtenir un second. referralInit et referralApplyCode écrivent dans
   le MÊME document et vérifient TOUS LES DEUX son existence À L'INTÉRIEUR
   d'une transaction avant d'écrire quoi que ce soit : impossible de
   changer ou dupliquer son parrain, y compris en cas de double-clic. */
exports.referralApplyCode = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const auth = requireVerifiedUser(request);
  const uid = auth.uid;
  const raw = request.data && typeof request.data.code === "string" ? request.data.code : "";
  const normalized = normalizeReferralCode(raw);
  if (!normalized) throw new HttpsError("invalid-argument", "Code de parrainage invalide.");

  const db = db_();
  const codeSnap = await db.doc(`referralCodes/${normalized}`).get();
  if (!codeSnap.exists) throw new HttpsError("not-found", "Ce code de parrainage n'existe pas.");
  const referrerUid = codeSnap.get("uid");
  if (referrerUid === uid) throw new HttpsError("failed-precondition", "Vous ne pouvez pas utiliser votre propre code.");

  const filleulName = await resolveReferralDisplayName(request); // hors transaction, jamais bloquant
  const filleulKey = referralEmailKey(auth.token && auth.token.email);
  const parrainKey = filleulKey ? await emailKeyOfUser(referrerUid) : null;
  const referralRef = db.doc(`referrals/${uid}`);
  let credit = null;
  let outcome = "ok"; // 'ok' | 'already_linked' | 'referrer_missing' | 'blocked'
  await db.runTransaction(async (tx) => {
    // ── Lectures d'abord ──
    // Relecture FRAÎCHE de referrals/{uid} (jamais la valeur lue avant) :
    // c'est elle, pas un `if` en dehors, qui protège contre un parrainage
    // déjà établi (par referralInit ou par un appel précédent ici même).
    const freshSnap = await tx.get(referralRef);
    if (freshSnap.exists) { outcome = "already_linked"; return; }
    const etatParrain = await lireEtatParrainPourCredit(tx, referrerUid);
    if (!etatParrain) { outcome = "referrer_missing"; return; }
    if (await inboxBlockReason(tx, referrerUid, uid, filleulKey, parrainKey)) { outcome = "blocked"; return; } // rien n'est écrit : un autre code reste possible

    // ── Puis écritures ──
    const doc = {
      referrerUid, code: normalized,
      createdAt: FieldValue.serverTimestamp(),
      active: true, activatedAt: FieldValue.serverTimestamp(),
      retroactive: true
    };
    if (filleulName) doc.filleulName = filleulName;
    if (filleulKey) doc.emailKey = filleulKey;
    tx.set(referralRef, doc);
    credit = appliquerCreditParrain(tx, referrerUid, etatParrain);
  });

  if (outcome === "already_linked") throw new HttpsError("failed-precondition", "Vous avez déjà renseigné un code de parrainage : impossible d'en changer.");
  if (outcome === "referrer_missing") throw new HttpsError("not-found", "Ce code de parrainage n'est plus valide.");
  if (outcome === "blocked") throw new HttpsError("failed-precondition", "Ce code ne peut pas être utilisé avec ce compte.");

  if (credit && credit.stripeSync) await applyStripeBonusOrJournal(credit.stripeSync);
  return { ok: true };
});

// Tests uniquement (jamais posé en production) : expose des fonctions internes au harnais test/lib/referral-harness.mjs.
if (process.env.P1_TEST_EXPORTS === "1") exports.__test = { handleOneTimePurchase };

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
  "trainingItems", "tasks", "calendarDays", "dailyStats",
  // D2 (audit sauvegardes/pertes, 2026-09-30) : cahier d'erreurs des ENTRAÎNEMENTS
  // (notesEntrainements) manquait ici — jamais sauvegardé ni restaurable jusqu'ici.
  "notesEntrainements"
];

// D2 : `tourLogs`/`reviews`/`attempts` (journaux append-only imbriqués sous chaque cours/
// flashcard/entraînement — voir firestore.rules) sont volontairement EXCLUS de la sauvegarde.
// Justification : ce sont des journaux d'audit DÉRIVÉS (jamais modifiés ni supprimés par
// l'application elle-même, contrairement aux documents primaires ci-dessus qui PEUVENT être
// archivés/écrasés par erreur) — le risque P0 qu'une sauvegarde couvre (écrasement accidentel
// d'un état encore utile) ne les concerne pas de la même façon. Les inclure exigerait de lister
// EXHAUSTIVEMENT chaque cours/flashcard/entraînement pour en lire les sous-collections (N+1
// lectures, potentiellement des milliers pour un utilisateur très actif) pour un bénéfice de
// protection marginal. Choix à documenter/reconsidérer avec Jean si le besoin se confirme.

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
  // D2 : users/{uid}/settings/preferences (catalogues personnalisés de ressources/supports/
  // types/plateformes, deletedDefaultIds, barème...) est un DOCUMENT UNIQUE, pas une sous-
  // collection — absent de ADMIN_BACKUP_SUBCOLLECTIONS (qui ne sait itérer que des collections),
  // donc jamais sauvegardé ni restauré jusqu'ici. Snapshoté séparément, sous une clé dédiée.
  const prefsSnap = await db.doc(`users/${uid}/settings/preferences`).get();
  snapshot.settingsPreferences = prefsSnap.exists ? prefsSnap.data() : null;
  return snapshot;
}

function _tpxByteSize(obj) {
  try { return Buffer.byteLength(JSON.stringify(obj), "utf8"); }
  catch (e) { return Infinity; } // objet non serialisable : traiter comme "trop gros", jamais comme "OK"
}

// D3 (audit sauvegardes/pertes, 2026-09-30) : Firestore refuse tout document dépassant 1 Mo.
// L'ancienne protection (_buildSafeBackupSnapshot) RETIRAIT "notes" au-delà de 750 Ko pour
// rester sous cette limite — une vraie perte dans la sauvegarde elle-même (jamais dans le
// planning primaire de l'utilisateur, mais le filet de sécurité devenait silencieusement
// incomplet, sans que personne ne puisse le savoir avant d'en avoir besoin). Remplacé par un
// découpage en plusieurs documents `backups/{id}/parts/{n}` d'environ 600 Ko chacun : plus RIEN
// n'est jamais retiré, quelle que soit la taille réelle. Découpage par CARACTÈRES (pas par
// octets) : une chaîne JS se tranche toujours à une limite de code unit UTF-16 valide, donc
// jamais en plein milieu d'un caractère — avec 150 000 caractères/partie, même le pire cas
// (caractères astraux à 4 octets) reste à ~600 Ko, tandis qu'un JSON très majoritairement ASCII
// (le cas réel ici) reste très en-dessous. BACKUP_MAX_PARTS est un garde-fou pour un cas
// pathologique (des dizaines de Mo de JSON), jamais atteint en usage normal — contrairement à
// l'ancien seuil de 750 Ko, franchissable par un utilisateur actif avec quelques images en note.
const BACKUP_PART_CHARS = 150000;
const BACKUP_MAX_PARTS = 500;

function _splitJsonIntoParts(jsonString) {
  const parts = [];
  for (let i = 0; i < jsonString.length; i += BACKUP_PART_CHARS) parts.push(jsonString.slice(i, i + BACKUP_PART_CHARS));
  return parts.length ? parts : [""];
}

// Retourne { parts, docCount } ou { docCount, tooLarge: true } (cas pathologique uniquement,
// voir BACKUP_MAX_PARTS ci-dessus). Ne lève jamais d'exception.
async function _buildBackupSnapshot(uid) {
  const snapshot = await snapshotUserSubcollections(uid);
  const docCount = Object.keys(snapshot).reduce((n, k) => n + (Array.isArray(snapshot[k]) ? snapshot[k].length : 0), 0);
  const parts = _splitJsonIntoParts(JSON.stringify(snapshot));
  if (parts.length > BACKUP_MAX_PARTS) {
    logger.error(`_buildBackupSnapshot: snapshot de ${uid} beaucoup trop volumineux (${parts.length} parties, plafond ${BACKUP_MAX_PARTS}) -- sauvegarde abandonnee.`);
    return { docCount, tooLarge: true };
  }
  return { parts, docCount };
}

// Écrit le document de tête (métadonnées, format v2) puis ses parties par lots de 400 (marge
// sous la limite Firestore de 500 écritures/batch). `meta` : createdAt/createdBy/createdByUid/
// label — jamais docCount/format/partCount, calculés ici.
async function _writeBackupDocument(uid, meta, built) {
  const backupRef = db_().collection(`users/${uid}/backups`).doc();
  await backupRef.set(Object.assign({}, meta, { format: "v2", partCount: built.parts.length, docCount: built.docCount }));
  const CHUNK = 400;
  for (let i = 0; i < built.parts.length; i += CHUNK) {
    const batch = db_().batch();
    for (let j = i; j < Math.min(i + CHUNK, built.parts.length); j++) {
      batch.set(backupRef.collection("parts").doc(String(j)), { chunk: built.parts[j] });
    }
    await batch.commit();
  }
  return backupRef;
}

// Reconstruit le snapshot complet d'une sauvegarde, quel que soit son format :
// - v2 (ce correctif) : parties reassemblées dans l'ordre NUMÉRIQUE des ids ("0","1",...,"10" —
//   un tri lexicographique échouerait, "10" < "2" en chaîne) ;
// - v1 (avant ce correctif) : `snapshot` inline sur le document de tête, jamais de
//   notesEntrainements ni settingsPreferences (n'existaient pas encore).
async function _readBackupSnapshot(backupSnap) {
  const backup = backupSnap.data();
  if (backup.format === "v2") {
    const partsSnap = await backupSnap.ref.collection("parts").get();
    if (partsSnap.size !== backup.partCount) {
      throw new HttpsError("data-loss", `Sauvegarde corrompue : ${partsSnap.size}/${backup.partCount} partie(s) trouvée(s).`);
    }
    const ordered = partsSnap.docs.slice().sort((a, b) => Number(a.id) - Number(b.id));
    return JSON.parse(ordered.map((d) => d.data().chunk).join(""));
  }
  return backup.snapshot || null;
}

// `extraFields`, optionnel : fusionne des champs supplementaires (ex.
// restoredAt) dans CHAQUE document ecrit -- voir adminRestoreBackup, qui
// l'utilise pour tamponner les cours restaures et permettre au client de
// detecter qu'une restauration a eu lieu (protection anti-course avec un
// onglet reste ouvert, voir p1WriteTourSlot/p1JCheckpointAction cote client).
// Mode "replace" (historique) : réécrit purement et simplement CHAQUE document de la sauvegarde.
async function writeBatchedDocs(uid, subcollection, entries, extraFields) {
  const db = db_();
  const CHUNK = 400; // marge sous la limite Firestore de 500 écritures/batch
  for (let i = 0; i < entries.length; i += CHUNK) {
    const batch = db.batch();
    for (const entry of entries.slice(i, i + CHUNK)) {
      const data = extraFields ? Object.assign({}, entry.data, extraFields) : entry.data;
      batch.set(db.doc(`users/${uid}/${subcollection}/${entry.id}`), data);
    }
    await batch.commit();
  }
}

// D5 (audit sauvegardes/pertes, 2026-09-30) : mode "compléter" (par défaut, demande explicite de
// Jean) — ne réécrit QUE ce qui manque réellement dans l'état actuel :
//   - document absent de l'état actuel -> recréé tel quel ;
//   - document archivé depuis la sauvegarde (backup non archivé) -> désarchivé ET son contenu
//     restauré (un document archivé est gelé depuis son archivage côté application, donc aucun
//     risque d'écraser une édition récente) ;
//   - pour les collections à contenu textuel (BACKUP_CONTENT_FIELD) : un contenu ACTUELLEMENT
//     VIDE alors que la sauvegarde en avait un -> rempli.
// Tout document déjà présent, non archivé et non vide n'est JAMAIS touché — c'est la différence
// avec le mode "replace" (historique, réécrit indistinctement tout ce que contient la
// sauvegarde), toujours disponible explicitement pour "revenir à l'état de la sauvegarde".
// A6/L6 (audit 02/10, comparaison au modèle EDN TableurEnLigne.html, tpx-catalogs-core) : même
// logique de fusion que côté client (p1MergeCatalogArrays/p1MergeIdList, voir
// public/tableur.html) -- union par id, le plus grand horodatage `u` gagne pour les 4
// catalogues personnalisables ; union simple (jamais un id retiré) pour deletedDefaultIds. Sert
// à la restauration "compléter" des settings/preferences, voir plus bas : avant ce correctif,
// settingsPreferences n'était restauré QUE si le document était totalement ABSENT, donc une
// entrée de catalogue perdue (bug client, voir L1) ne revenait jamais dès que le compte avait
// ne serait-ce qu'UN SEUL réglage enregistré (quasi toujours le cas en pratique).
const SETTINGS_CATALOG_FIELDS = ["customResources", "customSupports", "customTrainTypes", "customTrainPlateformes"];
function _mergeCatalogArraysServer(a, b) {
  const byId = {}; const order = [];
  [].concat(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []).forEach((e) => {
    if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id) return;
    if (!Object.prototype.hasOwnProperty.call(byId, e.id)) { order.push(e.id); byId[e.id] = e; }
    else if ((e.u || 0) >= (byId[e.id].u || 0)) byId[e.id] = e;
  });
  return order.map((id) => byId[id]);
}
function _mergeIdListServer(a, b) {
  const seen = {}; const out = [];
  [].concat(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []).forEach((id) => {
    if (typeof id !== "string" && typeof id !== "number") return;
    const k = String(id);
    if (!seen[k]) { seen[k] = true; out.push(id); }
  });
  return out;
}
const BACKUP_CONTENT_FIELD = { notes: "html", notesEntrainements: "html", errorEntries: "html" };
function _isEmptyContent(v) {
  return v === undefined || v === null || (typeof v === "string" && (v.trim() === "" || v.trim() === "<br>"));
}
async function _restoreEntriesComplete(uid, name, entries, extraFields) {
  const db = db_();
  const contentField = BACKUP_CONTENT_FIELD[name];
  const CHUNK = 300; // lectures (getAll) + écritures par lot, marge sous les limites Firestore
  let restored = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const refs = slice.map((e) => db.doc(`users/${uid}/${name}/${e.id}`));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    const batch = db.batch();
    let any = false;
    slice.forEach((entry, idx) => {
      const snap = snaps[idx];
      const currentlyMissing = !snap.exists;
      const currentlyArchived = snap.exists && !!snap.data().archivedAt;
      const backupIsArchived = !!entry.data.archivedAt;
      const currentlyEmpty = !!contentField && snap.exists && !currentlyArchived && _isEmptyContent(snap.data()[contentField]);
      const backupHasContent = !!contentField && !_isEmptyContent(entry.data[contentField]);
      const shouldRestore = currentlyMissing || (currentlyArchived && !backupIsArchived) || (currentlyEmpty && backupHasContent);
      if (!shouldRestore) return;
      const data = extraFields ? Object.assign({}, entry.data, extraFields) : entry.data;
      batch.set(refs[idx], data, { merge: true });
      any = true; restored++;
    });
    if (any) await batch.commit();
  }
  return restored;
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

  const built = await _buildBackupSnapshot(targetUid);
  if (built.tooLarge) {
    throw new HttpsError("resource-exhausted", "Cette sauvegarde est beaucoup trop volumineuse pour être enregistrée. Le planning de l'utilisateur n'est pas affecté ; contacter le support technique.");
  }
  const backupRef = await _writeBackupDocument(targetUid, {
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "admin",
    createdByUid: admin.uid,
    label: (typeof label === "string" && label.trim()) ? label.trim().slice(0, 200) : `Sauvegarde manuelle (${built.docCount} document(s))`
  }, built);

  logger.info(`adminCreateBackup: ${admin.uid} → sauvegarde ${backupRef.id} pour ${targetUid} (${built.docCount} docs, ${built.parts.length} partie(s)).`);
  return { backupId: backupRef.id, docCount: built.docCount };
});

exports.adminRestoreBackup = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(request);
  const targetUid = request.data && request.data.targetUid;
  const backupId = request.data && request.data.backupId;
  // D5 : "merge" (compléter, par défaut) ou "replace" (revenir à l'état de la sauvegarde).
  const mode = (request.data && request.data.mode === "replace") ? "replace" : "merge";
  if (!targetUid || !backupId) {
    throw new HttpsError("invalid-argument", "targetUid et backupId requis.");
  }

  const backupSnap = await db_().doc(`users/${targetUid}/backups/${backupId}`).get();
  if (!backupSnap.exists) {
    throw new HttpsError("not-found", "Sauvegarde introuvable.");
  }
  const snapshot = await _readBackupSnapshot(backupSnap);
  if (!snapshot || typeof snapshot !== "object") {
    throw new HttpsError("failed-precondition", "Cette sauvegarde n'a pas de contenu exploitable (vide).");
  }

  // Filet de sécurité anti-écrasement accidentel : l'état ACTUEL est
  // sauvegardé avant toute restauration, même sans demande explicite —
  // une restauration reste ainsi toujours réversible depuis cet onglet.
  // Bug de robustesse corrigé : si ce filet lui-même ne peut pas être écrit
  // (snapshot beaucoup trop volumineux), on abandonne la restauration
  // PLUTÔT QUE de la rendre irréversible sans le dire — mieux vaut un admin
  // qui réessaie que perdre la seule trace de l'état d'avant restauration.
  const preRestoreBuilt = await _buildBackupSnapshot(targetUid);
  if (preRestoreBuilt.tooLarge) {
    throw new HttpsError("resource-exhausted", "Restauration annulée : la sauvegarde de sécurité de l'état actuel (avant restauration) est beaucoup trop volumineuse à créer. Aucune donnée n'a été modifiée.");
  }
  await _writeBackupDocument(targetUid, {
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "admin_auto_pre_restore",
    createdByUid: admin.uid,
    label: `Auto — juste avant restauration (${mode === "replace" ? "remplacement" : "complétion"}) de la sauvegarde ${backupId}`
  }, preRestoreBuilt);

  // Bug de perte de donnees corrige (protection anti-course multi-onglets) :
  // un onglet utilisateur reste ouvert AVANT cette restauration continue de
  // croire a son etat local (potentiellement plus recent) -- sans marqueur,
  // sa prochaine ecriture sur un cours restaure (p1WriteTourSlot/
  // p1JCheckpointAction, transaction cote client) fusionnerait son edition
  // par-dessus l'etat restaure, reintroduisant exactement ce que la
  // restauration voulait effacer, en silence. `restoredAt` sur chaque cours
  // restaure permet au client de detecter ce cas precis et d'abandonner
  // son edition locale au lieu de la fusionner.
  const restoredAtStamp = FieldValue.serverTimestamp();
  let restoredDocs = 0;
  const perCollectionCounts = {};
  for (const name of ADMIN_BACKUP_SUBCOLLECTIONS) {
    const entries = Array.isArray(snapshot[name]) ? snapshot[name] : [];
    if (!entries.length) continue;
    const extra = name === "courses" ? { restoredAt: restoredAtStamp } : undefined;
    let n;
    if (mode === "replace") { await writeBatchedDocs(targetUid, name, entries, extra); n = entries.length; }
    else { n = await _restoreEntriesComplete(targetUid, name, entries, extra); }
    perCollectionCounts[name] = n;
    restoredDocs += n;
  }

  // D2/D5 : settings/preferences (document unique, voir snapshotUserSubcollections ci-dessus) —
  // en mode "compléter", uniquement s'il est actuellement absent (jamais d'écrasement d'un
  // catalogue personnalisé plus récent que la sauvegarde) ; en mode "replace", toujours réécrit.
  if (snapshot.settingsPreferences && typeof snapshot.settingsPreferences === "object") {
    const prefRef = db_().doc(`users/${targetUid}/settings/preferences`);
    if (mode === "replace") {
      await prefRef.set(snapshot.settingsPreferences);
      perCollectionCounts.settingsPreferences = 1;
    } else {
      const curPrefSnap = await prefRef.get();
      if (!curPrefSnap.exists) {
        await prefRef.set(snapshot.settingsPreferences);
        perCollectionCounts.settingsPreferences = 1;
      } else {
        // A6/L6 : le document existe déjà (cas quasi systématique en pratique) -- fusionne les 4
        // catalogues + deletedDefaultIds au lieu de ne rien restaurer du tout. Les AUTRES
        // réglages (thème, pagination, barème de confiance...) restent hors périmètre de ce
        // correctif, comportement inchangé pour eux (non écrasés en mode compléter).
        const cur = curPrefSnap.data() || {};
        const patch = {};
        let changed = false;
        SETTINGS_CATALOG_FIELDS.forEach((f) => {
          if (!Array.isArray(snapshot.settingsPreferences[f])) return;
          const merged = _mergeCatalogArraysServer(cur[f], snapshot.settingsPreferences[f]);
          if (JSON.stringify(merged) !== JSON.stringify(cur[f] || [])) { patch[f] = merged; changed = true; }
        });
        if (Array.isArray(snapshot.settingsPreferences.deletedDefaultIds)) {
          const mergedIds = _mergeIdListServer(cur.deletedDefaultIds, snapshot.settingsPreferences.deletedDefaultIds);
          if (JSON.stringify(mergedIds) !== JSON.stringify(cur.deletedDefaultIds || [])) { patch.deletedDefaultIds = mergedIds; changed = true; }
        }
        if (changed) {
          await prefRef.set(patch, { merge: true });
          perCollectionCounts.settingsPreferences = 1;
        }
      }
    }
  }

  // D6 (audit sauvegardes/pertes, 2026-09-30) : restoredAt (ci-dessus) ne protégeait QUE
  // courses/{fc} (via p1WriteTourSlot/p1JCheckpointAction côté client) — un onglet resté ouvert
  // AVANT cette restauration pouvait réécrire par-dessus l'état restauré pour n'importe quelle
  // AUTRE collection (matières, tâches, planning, entraînements, notes...), en silence. Ce champ
  // sur le document users/{uid} lui-même est lu par un listener déjà actif côté client
  // (applyUserSettings) : sa valeur change à chaque restauration, déclenchant un simple
  // rechargement de page qui couvre TOUTES les collections d'un coup, sans avoir à ajouter la
  // même protection restoredAt/pageLoadedAt à chaque fonction d'écriture une par une.
  await db_().doc(`users/${targetUid}`).set({ restoreEpoch: restoredAtStamp }, { merge: true });

  logger.warn(`adminRestoreBackup: ${admin.uid} a restauré (${mode}) la sauvegarde ${backupId} pour ${targetUid} (${restoredDocs} documents). État précédent conservé automatiquement.`);
  return { restoredDocs, mode, perCollectionCounts };
});

/* ═══════════════════════════════════════════════════════════════════════
   D1 (audit sauvegardes/pertes, 2026-09-30) — sauvegarde automatique nocturne.
   Avant ce correctif : AUCUNE sauvegarde automatique n'existait, adminCreateBackup n'étant
   déclenchable que manuellement depuis admin.html. Tâche planifiée : pour chaque utilisateur
   authentifié actif dans les 3 derniers jours (Auth listUsers, paginé — metadata.lastRefreshTime/
   lastSignInTime comme source d'activité, Auth étant la seule source fiable d'un "dernier accès"
   sans avoir à instrumenter chaque page), crée une sauvegarde automatique si la dernière
   automatique a plus de 72h, puis ne garde que les 5 dernières automatiques (jamais les
   manuelles ni les "avant restauration", filtrées par createdBy).
   Limite connue (documentée, pas silencieuse) : la purge des sauvegardes "avant restauration"
   de plus de 90 jours mentionnée dans la mission n'est PAS implémentée ici (nécessiterait son
   propre balayage périodique) — seule la rétention des 5 dernières automatiques l'est.
   ═══════════════════════════════════════════════════════════════════════ */
const AUTO_BACKUP_MIN_INTERVAL_MS = 72 * 3600 * 1000;
const AUTO_BACKUP_ACTIVE_WINDOW_MS = 3 * 24 * 3600 * 1000;
const AUTO_BACKUP_KEEP = 5;

async function _shouldCreateAutoBackup(uid) {
  const snap = await db_().collection(`users/${uid}/backups`)
    .where("createdBy", "==", "auto").orderBy("createdAt", "desc").limit(1).get();
  if (snap.empty) return true;
  const last = snap.docs[0].data().createdAt;
  const lastMs = (last && typeof last.toMillis === "function") ? last.toMillis() : 0;
  return (Date.now() - lastMs) > AUTO_BACKUP_MIN_INTERVAL_MS;
}

async function _pruneAutoBackups(uid) {
  const snap = await db_().collection(`users/${uid}/backups`)
    .where("createdBy", "==", "auto").orderBy("createdAt", "desc").get();
  const toDelete = snap.docs.slice(AUTO_BACKUP_KEEP);
  for (const d of toDelete) {
    const partsSnap = await d.ref.collection("parts").get();
    const batch = db_().batch();
    partsSnap.docs.forEach((p) => batch.delete(p.ref));
    batch.delete(d.ref);
    await batch.commit();
  }
  return toDelete.length;
}

async function _runScheduledBackups() {
  const authApi = getAuth();
  const cutoff = Date.now() - AUTO_BACKUP_ACTIVE_WINDOW_MS;
  let nextPageToken, checked = 0, created = 0, pruned = 0, errors = 0;
  do {
    const page = await authApi.listUsers(1000, nextPageToken);
    nextPageToken = page.pageToken;
    for (const u of page.users) {
      const lastRefresh = u.metadata.lastRefreshTime ? new Date(u.metadata.lastRefreshTime).getTime() : 0;
      const lastSignIn = u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).getTime() : 0;
      if (Math.max(lastRefresh, lastSignIn) < cutoff) continue;
      checked++;
      try {
        if (!(await _shouldCreateAutoBackup(u.uid))) continue;
        const built = await _buildBackupSnapshot(u.uid);
        if (built.tooLarge) {
          errors++;
          logger.error(`scheduledUserBackup: sauvegarde auto de ${u.uid} abandonnee (trop volumineuse).`);
          continue;
        }
        await _writeBackupDocument(u.uid, {
          createdAt: FieldValue.serverTimestamp(), createdBy: "auto", createdByUid: null,
          label: `Sauvegarde automatique (${built.docCount} document(s))`
        }, built);
        created++;
        pruned += await _pruneAutoBackups(u.uid);
      } catch (e) {
        errors++;
        logger.error(`scheduledUserBackup: echec pour ${u.uid} :`, e);
      }
    }
  } while (nextPageToken);
  logger.info(`scheduledUserBackup: ${checked} utilisateur(s) actif(s) examine(s), ${created} sauvegarde(s) creee(s), ${pruned} ancienne(s) purgee(s), ${errors} erreur(s).`);
  return { checked, created, pruned, errors };
}

exports.scheduledUserBackup = onSchedule({ schedule: "0 3 * * *", timeZone: "Europe/Paris", region: REGION }, _runScheduledBackups);

// Tests uniquement (jamais posé en production) : même mécanisme que P1_TEST_EXPORTS plus haut —
// expose la logique interne pour un déclenchement direct depuis les tests, sans dépendre de
// l'émulateur Cloud Scheduler (jugé peu fiable dans cet environnement, voir fn-bridge.mjs).
if (process.env.P1_TEST_EXPORTS === "1") {
  exports.__backupTest = { _runScheduledBackups, _buildBackupSnapshot, _readBackupSnapshot, _shouldCreateAutoBackup, _pruneAutoBackups };
}
