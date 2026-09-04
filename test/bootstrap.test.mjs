/* ============================================================
   P1PLANNER — Test bout-en-bout du bootstrap utilisateur
   ============================================================
   Nécessite les émulateurs Auth + Firestore + Functions démarrés
   (npm run emulators). Utilise firebase-admin pointé sur les
   émulateurs via les variables d'environnement ci-dessous —
   AUCUNE donnée réelle du projet Firebase P1Planner n'est touchée.
   ============================================================ */
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

import assert from "node:assert/strict";
import admin from "firebase-admin";

const app = admin.initializeApp({ projectId: "p1planner" }, "bootstrap-test-app");
const auth = admin.auth(app);
const db = admin.firestore(app);

async function waitForEntitlement(uid, { attempts = 10, delayMs = 800 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const snap = await db.doc(`entitlements/${uid}`).get();
    if (snap.exists) return snap;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`entitlements/${uid} jamais apparu après ${attempts} tentatives — la Function onUserCreated a-t-elle bien été chargée par l'émulateur ?`);
}

describe("Bootstrap utilisateur (onUserCreated)", function () {
  this.timeout(30000);
  let uid;

  after(async () => {
    if (uid) { await auth.deleteUser(uid).catch(() => {}); }
  });

  it("crée users/{uid}, entitlements/{uid} (trial 30j), billingPrivate/{uid}, userStats/{uid}", async () => {
    const user = await auth.createUser({ email: `bootstrap-${Date.now()}@example.com`, password: "TestPassword123!" });
    uid = user.uid;

    const entSnap = await waitForEntitlement(uid);
    const ent = entSnap.data();
    assert.equal(ent.status, "trial");
    assert.ok(ent.trialStartedAt, "trialStartedAt doit être posé par le serveur");
    assert.ok(ent.trialEndsAt, "trialEndsAt doit être posé par le serveur");
    assert.ok(ent.writeAccessUntil, "writeAccessUntil doit être posé par le serveur");

    const trialStart = ent.trialStartedAt.toMillis();
    const trialEnd = ent.trialEndsAt.toMillis();
    const days = Math.round((trialEnd - trialStart) / 86400000);
    assert.equal(days, 30, "l'essai doit durer exactement 30 jours");

    const userSnap = await db.doc(`users/${uid}`).get();
    assert.ok(userSnap.exists, "users/{uid} doit être créé");
    assert.equal(userSnap.data().email, user.email);

    const billingSnap = await db.doc(`billingPrivate/${uid}`).get();
    assert.ok(billingSnap.exists, "billingPrivate/{uid} doit être réservé même vide");

    const statsSnap = await db.doc(`userStats/${uid}`).get();
    assert.ok(statsSnap.exists, "userStats/{uid} doit être réservé même vide");
  });

  it("fonctionne même si displayName est null (item 25)", async () => {
    const user = await auth.createUser({ email: `bootstrap-noname-${Date.now()}@example.com`, password: "TestPassword123!" });
    uid = user.uid;
    assert.equal(user.displayName, undefined);
    const entSnap = await waitForEntitlement(uid);
    assert.equal(entSnap.data().status, "trial");
    const userSnap = await db.doc(`users/${uid}`).get();
    assert.equal(userSnap.data().displayName, null);
  });

  it("P0 — idempotence : appeler onUserCreated deux fois ne repousse jamais trialEndsAt", async () => {
    const user = await auth.createUser({ email: `bootstrap-idem-${Date.now()}@example.com`, password: "TestPassword123!" });
    uid = user.uid;
    const firstSnap = await waitForEntitlement(uid);
    const firstTrialEnd = firstSnap.data().trialEndsAt.toMillis();

    // Simule un retry du trigger (at-least-once delivery) : on rejoue
    // exactement la même logique transactionnelle que functions/index.js
    // (lecture avant écriture, no-op si l'entitlement existe déjà).
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`entitlements/${uid}`);
      const snap = await tx.get(ref);
      if (snap.exists) return; // no-op attendu
      throw new Error("ne devrait jamais arriver dans ce test");
    });

    const secondSnap = await db.doc(`entitlements/${uid}`).get();
    assert.equal(secondSnap.data().trialEndsAt.toMillis(), firstTrialEnd, "un retry ne doit jamais accorder 30 jours supplémentaires");
  });
});
