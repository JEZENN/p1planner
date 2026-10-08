/* ============================================================
   Recopie du nom d'authentification dans users/{uid}.displayName (retour de Jean, 08/10 :
   « je ne vois pas le nom de certains utilisateurs » dans le panneau admin).
   Cause : auth.html fait createUser PUIS updateProfile ; onUserCreated s'exécute avant que le nom
   existe et écrit displayName:null ; seul updateDisplayName (Paramètres) l'écrivait ensuite.
   Vrai code de functions/index.js via .run() contre l'émulateur Firestore + Auth (Stripe simulé).
   ============================================================ */
import assert from "node:assert/strict";
import { db, auth, fns, clearFirestore, seedEntitlement, callReferralInit, callReferralEnsureCode, callReferralMarkActive } from "./lib/referral-harness.mjs";

let seq = 0;
async function mkAuthUser(displayName) {
  const uid = "NM" + Date.now().toString(36) + (seq++);
  await auth.createUser({ uid, email: `${uid.toLowerCase()}@test.fr`, emailVerified: true, ...(displayName ? { displayName } : {}) });
  return uid;
}
const profileName = async (uid) => { const s = await db.doc(`users/${uid}`).get(); return s.exists ? s.get("displayName") : undefined; };
// Fiche telle que la laisse onUserCreated quand le nom n'existe pas encore.
const seedProfile = (uid, displayName) => db.doc(`users/${uid}`).set({ email: uid + "@test.fr", displayName }, { merge: true });

describe("Recopie du nom Auth -> users/{uid}.displayName", function () {
  this.timeout(30000);
  before(async () => { await clearFirestore(); });

  it("referralEnsureCode (ouverture du tableur) : un compte dont la fiche est à null récupère le nom d'inscription", async () => {
    const uid = await mkAuthUser("Camille Durand");
    await seedProfile(uid, null);
    await callReferralEnsureCode(uid);
    assert.equal(await profileName(uid), "Camille Durand");
  });

  it("referralInit (inscription, compte NON vérifié, fiche pas encore créée par onUserCreated) : le nom est recopié", async () => {
    const uid = "NMinit" + Date.now().toString(36);
    await auth.createUser({ uid, email: uid.toLowerCase() + "@test.fr", emailVerified: false, displayName: "Léa Martin" });
    await callReferralInit(uid);
    assert.equal(await profileName(uid), "Léa Martin");
  });

  it("referralMarkActive (connexion vérifiée) : recopie AVANT le retour anticipé des comptes sans parrain", async () => {
    const uid = await mkAuthUser("Sam Phounsouk");
    await seedEntitlement(uid);
    await seedProfile(uid, null);
    const r = await callReferralMarkActive(uid); // aucun referrals/{uid} -> retour anticipé
    assert.equal(r.activated, false);
    assert.equal(await profileName(uid), "Sam Phounsouk");
  });

  it("n'écrase JAMAIS un nom déjà présent (ex. modifié dans les Paramètres)", async () => {
    const uid = await mkAuthUser("Nom Inscription");
    await seedProfile(uid, "Nom Choisi Dans Paramètres");
    await callReferralEnsureCode(uid);
    assert.equal(await profileName(uid), "Nom Choisi Dans Paramètres");
  });

  it("compte sans nom d'authentification (ex. e-mail seul) : rien n'est écrit, aucune erreur", async () => {
    const uid = await mkAuthUser(null);
    await seedProfile(uid, null);
    await callReferralEnsureCode(uid);
    assert.equal(await profileName(uid), null);
  });

  it("le nom est nettoyé (balises retirées, espaces compactés, 60 caractères max)", async () => {
    const uid = await mkAuthUser("  <b>Zoé</b>    Petit  " + "x".repeat(80));
    await seedProfile(uid, null);
    await callReferralEnsureCode(uid);
    const n = await profileName(uid);
    assert.ok(!/[<>]/.test(n), "chevrons conservés : " + n);
    assert.ok(!/\s{2,}/.test(n), "espaces multiples conservés : " + JSON.stringify(n));
    assert.ok(n.length <= 60 && n.length > 10, "longueur hors bornes : " + n.length);
    assert.ok(n.startsWith("bZoé/b Petit"), "début inattendu : " + n);
  });

  it("idempotent : un 2e appel ne réécrit rien (updatedAt inchangé)", async () => {
    const uid = await mkAuthUser("Idem Potent");
    await seedProfile(uid, null);
    await callReferralEnsureCode(uid);
    const t1 = (await db.doc(`users/${uid}`).get()).get("updatedAt");
    await new Promise((r) => setTimeout(r, 50));
    await callReferralEnsureCode(uid);
    const t2 = (await db.doc(`users/${uid}`).get()).get("updatedAt");
    assert.deepEqual(t2, t1);
  });

  it("onUserCreated ne remet JAMAIS à null un nom déjà recopié (course : recopie AVANT le trigger)", async () => {
    const uid = await mkAuthUser(null); // le trigger voit un utilisateur sans nom
    await db.doc(`users/${uid}`).set({ displayName: "Déjà Recopié" }, { merge: true });
    await fns.onUserCreated.run({ uid, email: uid.toLowerCase() + "@test.fr", displayName: null }, {});
    assert.equal(await profileName(uid), "Déjà Recopié");
    const ent = await db.doc(`entitlements/${uid}`).get();
    assert.ok(ent.exists, "le bootstrap (entitlement) doit quand même avoir lieu");
  });

  it("onUserCreated sans nom ni fiche : displayName reste null (comportement d'origine, bootstrap.test.mjs)", async () => {
    const uid = await mkAuthUser(null);
    await fns.onUserCreated.run({ uid, email: uid.toLowerCase() + "@test.fr", displayName: null }, {});
    assert.equal(await profileName(uid), null);
  });
});
