/* ═══════════════════════════════════════════════════════════════════════
   Harnais des tests PARRAINAGE — exécute le VRAI code de functions/index.js
   (onCall.run(), sans passer par l'émulateur Functions — connu peu fiable
   dans cet environnement, voir docs/QA.md/test/bootstrap.test.mjs) contre
   l'ÉMULATEUR Firestore réel, avec un Stripe SIMULÉ (aucun appel réseau,
   aucune clé réelle). Même principe que le harnais le produit frère de référence
   (emulator-tests/lib/billing-harness.js) : patcher require.cache pour que
   `require("stripe")` dans functions/index.js renvoie notre FakeStripe.
   Module chargé une seule fois par processus mocha (cache require) : tous
   les fichiers de test qui l'importent partagent le même Stripe simulé (S).
   ═══════════════════════════════════════════════════════════════════════ */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "p1planner-referral-test";
// ⚠️ Ports décalés (2026-09-30, voir test/e2e/env-e2e.mjs) : évite toute collision avec les
// émulateurs TypixClin de Jean tournant en parallèle sur 8080/9099.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8280";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9198";
process.env.STRIPE_SECRET_KEY = "sk_test_AUDIT_FAKE";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_AUDIT_FAKE";
process.env.STRIPE_PRICE_MONTHLY = "price_AUDIT_MONTHLY";
process.env.BREVO_API_KEY = "AUDIT_FAKE";
process.env.P1_TEST_EXPORTS = "1"; // expose fns.__test (fonctions internes de facturation à tester)

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = path.resolve(__dirname, "..", "..", "functions");
const require = createRequire(import.meta.url);

// ── Stripe SIMULÉ (aucun héritage du vrai Stripe : les fonctions de
//    parrainage n'utilisent que subscriptions.retrieve/update) ──────────
const stripePath = require.resolve("stripe", { paths: [FUNCTIONS_DIR] });
export const S = { subs: {}, updated: [], retrieved: [], failRetrieve: null };
export function resetStripe() { S.subs = {}; S.updated = []; S.retrieved = []; S.failRetrieve = null; }
function stripeErr(msg, code, status) {
  return Object.assign(new Error(msg), { type: "StripeInvalidRequestError", code, statusCode: status });
}
class FakeStripe {
  constructor() {
    this.subscriptions = {
      retrieve: async (id) => {
        S.retrieved.push(id);
        if (S.failRetrieve) throw S.failRetrieve;
        if (!S.subs[id]) throw stripeErr("No such subscription: " + id, "resource_missing", 404);
        return JSON.parse(JSON.stringify(S.subs[id]));
      },
      // Mute S.subs[id] EN PLACE (comme le ferait vraiment Stripe) : un
      // retrieve() suivant voit la mise à jour.
      update: async (id, patch) => {
        S.updated.push({ id, patch });
        if (S.failRetrieve) throw S.failRetrieve;
        if (!S.subs[id]) throw stripeErr("No such subscription: " + id, "resource_missing", 404);
        Object.assign(S.subs[id], patch);
        return JSON.parse(JSON.stringify(S.subs[id]));
      }
    };
  }
}
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: FakeStripe };

// ── Fonctions réelles (require APRÈS le patch Stripe et les env vars ci-dessus) ──
export const fns = require(path.join(FUNCTIONS_DIR, "index.js"));

// ── Firestore émulateur (même projet que functions/index.js, via GCLOUD_PROJECT) ──
const app = admin.apps.find((a) => a.name === "referral-harness")
  || admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT }, "referral-harness");
export const db = admin.firestore(app);
export const auth = admin.auth(app);

export async function clearFirestore() {
  const collections = ["users", "entitlements", "billingPrivate", "referralCodes", "referrals", "billingConflicts"];
  for (const name of collections) {
    const snap = await db.collection(name).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

const future = (days = 20) => admin.firestore.Timestamp.fromDate(new Date(Date.now() + days * 86400000));

/* Pose un entitlement de test pour `uid` avec un état choisi. */
export async function seedEntitlement(uid, overrides = {}) {
  await db.doc(`users/${uid}`).set({ email: uid + "@test.fr", displayName: uid, createdAt: new Date() }, { merge: true });
  await db.doc(`entitlements/${uid}`).set(Object.assign({
    status: "trial",
    trialStartedAt: admin.firestore.Timestamp.now(),
    trialEndsAt: future(),
    writeAccessUntil: future(),
    premiumUntil: null,
    planType: null
  }, overrides));
}

export async function seedBillingPrivate(uid, data) {
  await db.doc(`billingPrivate/${uid}`).set(data || {}, { merge: true });
}

export async function getEntitlement(uid) {
  const snap = await db.doc(`entitlements/${uid}`).get();
  return snap.exists ? snap.data() : null;
}

export async function getReferral(uid) {
  const snap = await db.doc(`referrals/${uid}`).get();
  return snap.exists ? snap.data() : null;
}

/* fns.<name>.run({...}) renvoie DIRECTEMENT ce que la fonction retourne
   (ex. {referralCode}), PAS enveloppé dans {data: ...} comme le fait le
   vrai SDK client httpsCallable. */
const tokenFor = (uid, verified, tokenOver) => Object.assign({ email: uid + "@test.fr", email_verified: verified, name: uid }, tokenOver || {});

export const callReferralInit = (uid, data, tokenOver) => fns.referralInit.run({
  data: data || {},
  auth: uid ? { uid, token: tokenFor(uid, false, tokenOver) } : undefined,
  rawRequest: {}
});
export const callReferralEnsureCode = (uid, tokenOver) => fns.referralEnsureCode.run({
  data: {},
  auth: uid ? { uid, token: tokenFor(uid, true, tokenOver) } : undefined,
  rawRequest: {}
});
export const callReferralCheckCode = (code) => fns.referralCheckCode.run({ data: { code }, auth: undefined, rawRequest: {} });
export const callReferralMarkActive = (uid, tokenOver) => fns.referralMarkActive.run({
  data: {},
  auth: uid ? { uid, token: tokenFor(uid, true, tokenOver) } : undefined,
  rawRequest: {}
});
export const callReferralApplyCode = (uid, code, tokenOver) => fns.referralApplyCode.run({
  data: { code },
  auth: uid ? { uid, token: tokenFor(uid, true, tokenOver) } : undefined,
  rawRequest: {}
});

export const callReferralMarkSeen = (uid, tokenOver) => fns.referralMarkSeen.run({
  data: {},
  auth: uid ? { uid, token: tokenFor(uid, true, tokenOver) } : undefined,
  rawRequest: {}
});
export const callReferralListReferrals = (uid, tokenOver) => fns.referralListReferrals.run({
  data: {},
  auth: uid ? { uid, token: tokenFor(uid, true, tokenOver) } : undefined,
  rawRequest: {}
});
export async function conflicts() {
  const snap = await db.collection("billingConflicts").get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

export async function errorCode(promise) {
  try { await promise; return null; } catch (e) { return e.code || e.message; }
}
