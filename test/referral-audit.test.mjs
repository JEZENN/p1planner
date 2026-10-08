/* ============================================================
   AUDIT SÉCURITÉ PARRAINAGE ↔ FACTURATION (2026-09-27)
   Vrai code de functions/index.js (.run() + fns.__test), émulateur
   Firestore, Stripe simulé. Chaque test correspond à un défaut trouvé
   ou à une garantie à ne jamais perdre.
   ============================================================ */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import admin from "firebase-admin";
import {
  resetStripe, db, clearFirestore, fns,
  seedEntitlement, getEntitlement, getReferral,
  callReferralInit, callReferralMarkActive, callReferralApplyCode, errorCode
} from "./lib/referral-harness.mjs";

const require = createRequire(import.meta.url);
const { checkPurchaseConflict } = require("../functions/premiumPlans.js");
const Timestamp = admin.firestore.Timestamp;

const DAY = 86400000;
const future = (d) => new Date(Date.now() + d * DAY);
const past = (d) => new Date(Date.now() - d * DAY);

async function parrain(uid, email, ent) {
  const { referralCode } = await callReferralInit(uid);
  await seedEntitlement(uid, ent);
  await db.doc(`users/${uid}`).set({ email }, { merge: true });
  return referralCode;
}
async function filleul(uid, code, email) {
  await seedEntitlement(uid);
  await callReferralInit(uid, { referredBy: code }, { email });
  return callReferralMarkActive(uid, { email });
}

describe("AUDIT parrainage — facturation et abonnements", function () {
  this.timeout(40000);
  beforeEach(async () => { await clearFirestore(); resetStripe(); });

  describe("F1 — un achat ne raccourcit jamais un essai prolongé par le parrainage", () => {
    it("paiement unique de 1 mois pendant un essai prolongé de 90 jours : writeAccessUntil ne baisse pas", async () => {
      const end = future(90);
      await seedEntitlement("U", { status: "trial", trialEndsAt: end, writeAccessUntil: end, premiumUntil: null, planType: null });
      await fns.__test.handleOneTimePurchase({
        id: "cs_audit_1", payment_status: "paid", mode: "payment", customer: "cus_x", payment_intent: "pi_x",
        metadata: { firebaseUID: "U", planType: "onetime", months: "1" }
      });
      const ent = await getEntitlement("U");
      assert.equal(ent.planType, "onetime");
      assert.ok(ent.premiumUntil.toMillis() < end.getTime(), "l'achat de 1 mois se termine avant l'essai prolongé");
      assert.ok(ent.writeAccessUntil.toMillis() >= end.getTime(), "writeAccessUntil a été RACCOURCI par l'achat : " + ent.writeAccessUntil.toDate().toISOString());
    });
    it("cas courant inchangé : essai court, achat plus long -> l'accès suit l'achat", async () => {
      const end = future(5);
      await seedEntitlement("U", { status: "trial", trialEndsAt: end, writeAccessUntil: end, premiumUntil: null, planType: null });
      await fns.__test.handleOneTimePurchase({
        id: "cs_audit_2", payment_status: "paid", mode: "payment", customer: "cus_x", payment_intent: "pi_y",
        metadata: { firebaseUID: "U", planType: "onetime", months: "3" }
      });
      const ent = await getEntitlement("U");
      assert.equal(ent.writeAccessUntil.toMillis(), ent.premiumUntil.toMillis());
      assert.ok(ent.premiumUntil.toMillis() > Date.now() + 60 * DAY);
    });
  });

  describe("F2 — accès OFFERT par le parrainage (planType 'referral') : pas de paiement sans bénéfice", () => {
    const active = { planType: "referral", status: "active", premiumUntil: Timestamp.fromMillis(Date.now() + 60 * DAY) };
    it("paiement unique refusé pendant les mois offerts", () => {
      assert.match(checkPurchaseConflict(active, "onetime") || "", /accès valide/);
    });
    it("abonnement mensuel refusé pendant les mois offerts (il écraserait les mois offerts)", () => {
      assert.match(checkPurchaseConflict(active, "monthly") || "", /accès valide/);
    });
    it("mois offerts terminés (premiumUntil passé) : achat de nouveau autorisé", () => {
      const done = { planType: "referral", status: "active", premiumUntil: Timestamp.fromMillis(Date.now() - DAY) };
      assert.equal(checkPurchaseConflict(done, "onetime"), null);
      assert.equal(checkPurchaseConflict(done, "monthly"), null);
    });
    it("essai (status trial) : tout reste autorisé", () => {
      assert.equal(checkPurchaseConflict({ status: "trial", planType: null }, "onetime"), null);
    });
  });

  describe("F3 — une seule boîte mail = un seul filleul compté (alias +tag, points Gmail)", () => {
    it("filleul = même boîte que le parrain (alias +tag) : non compté, aucun bonus", async () => {
      const code = await parrain("P", "jean.dupont@gmail.com");
      const res = await filleul("A1", code, "jeandupont+promo@googlemail.com");
      assert.equal(res.bonusMonths, 0);
      const ent = await getEntitlement("P");
      assert.equal(ent.referralActiveCount || 0, 0);
      const ref = await getReferral("A1");
      assert.equal(ref.active, false);
      assert.equal(ref.blocked, "same_inbox");
      assert.ok(!JSON.stringify(ref).includes("@"), "aucune adresse en clair dans referrals/{uid}");
    });
    it("6 alias d'une même boîte : UN seul compté, jamais 3 mois offerts", async () => {
      const code = await parrain("P", "parrain@ex.fr");
      const mails = ["farm@gmail.com", "f.arm@gmail.com", "farm+1@gmail.com", "fa.rm+2@googlemail.com", "farm+3@gmail.com", "FARM+4@gmail.com"];
      for (let i = 0; i < mails.length; i++) await filleul("A" + i, code, mails[i]);
      const ent = await getEntitlement("P");
      assert.equal(ent.referralActiveCount, 1);
      assert.equal(ent.referralMonthsGranted || 0, 0);
      assert.equal((await getReferral("A1")).blocked, "duplicate_inbox");
    });
    it("boîtes réellement distinctes : comptées normalement (3 -> 1 mois)", async () => {
      const code = await parrain("P", "parrain@ex.fr", { status: "trial", trialEndsAt: future(5), writeAccessUntil: future(5), premiumUntil: null, planType: null });
      for (const m of ["a@ex.fr", "b@ex.fr", "c@ex.fr"]) await filleul(m.split("@")[0].toUpperCase(), code, m);
      const ent = await getEntitlement("P");
      assert.equal(ent.referralActiveCount, 3);
      assert.equal(ent.referralMonthsGranted, 1);
    });
    it("saisie rétroactive avec un alias du parrain : refusée, rien n'est écrit, un autre code reste possible", async () => {
      const code = await parrain("P", "jean@gmail.com");
      const other = await parrain("Q", "autre@ex.fr");
      await seedEntitlement("E");
      assert.equal(await errorCode(callReferralApplyCode("E", code, { email: "j.e.a.n+x@gmail.com" })), "failed-precondition");
      assert.equal(await getReferral("E"), null);
      assert.deepEqual(await callReferralApplyCode("E", other, { email: "j.e.a.n+x@gmail.com" }), { ok: true });
    });
    it("saisie rétroactive : deuxième alias du même filleul chez un même parrain : refusée", async () => {
      const code = await parrain("P", "parrain@ex.fr");
      await seedEntitlement("E1"); await seedEntitlement("E2");
      await callReferralApplyCode("E1", code, { email: "z@gmail.com" });
      assert.equal(await errorCode(callReferralApplyCode("E2", code, { email: "z+2@gmail.com" })), "failed-precondition");
      assert.equal((await getEntitlement("P")).referralActiveCount, 1);
    });
    it("concurrence : deux alias activés en Promise.all -> un seul compté", async () => {
      const code = await parrain("P", "parrain@ex.fr");
      for (const u of ["A", "B"]) { await seedEntitlement(u); }
      await callReferralInit("A", { referredBy: code }); await callReferralInit("B", { referredBy: code });
      await Promise.all([callReferralMarkActive("A", { email: "x@gmail.com" }), callReferralMarkActive("B", { email: "x+1@gmail.com" })]);
      assert.equal((await getEntitlement("P")).referralActiveCount, 1);
    });
  });

  describe("F4 — le client ne peut écrire aucun champ de facturation via le parrainage", () => {
    it("les appels sans authentification sont refusés (sauf le contrôle de code)", async () => {
      for (const n of ["referralInit", "referralEnsureCode", "referralMarkActive", "referralApplyCode", "referralMarkSeen", "referralListReferrals"]) {
        const code = await errorCode(fns[n].run({ data: { code: "AAAAAA", referredBy: "AAAAAA" }, auth: undefined, rawRequest: {} }));
        assert.equal(code, "unauthenticated", n + " doit exiger une connexion");
      }
    });
    it("referralInit ignore tout champ de droits envoyé par le client", async () => {
      await seedEntitlement("U");
      await fns.referralInit.run({ data: { referredBy: null, premium: true, writeAccessUntil: "2099-01-01", status: "active", referralMonthsGranted: 99 }, auth: { uid: "U", token: { email: "u@test.fr" } }, rawRequest: {} });
      const ent = await getEntitlement("U");
      assert.equal(ent.status, "trial");
      assert.equal(ent.referralMonthsGranted, undefined);
    });
    it("referralApplyCode : les données du client autres que 'code' sont ignorées ; aucun uid parrain accepté", async () => {
      const code = await parrain("P", "p@ex.fr");
      await parrain("Q", "q@ex.fr");
      await seedEntitlement("E");
      await fns.referralApplyCode.run({ data: { code, referrerUid: "Q", uid: "Q", delta: 99 }, auth: { uid: "E", token: { email: "e@ex.fr", email_verified: true } }, rawRequest: {} });
      assert.equal((await getReferral("E")).referrerUid, "P");
      assert.equal((await getEntitlement("Q")).referralActiveCount || 0, 0);
    });
  });
});
