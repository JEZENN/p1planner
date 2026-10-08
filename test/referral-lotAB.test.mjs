/* ============================================================
   PARRAINAGE — LOT A/B (2026-09-26) : Cloud Functions réelles via .run()
   contre l'émulateur Firestore, Stripe simulé.
   A5 journalisation Stripe, A6 cas d'abonnement, A7 fin de bonus d'un
   ex-abonné, A8 referralInit transactionnel, A9 nom du filleul,
   B2 nouveaux filleuls + accusé, B3 liste des filleuls, réciprocité.
   ============================================================ */
import assert from "node:assert/strict";
import {
  S, resetStripe, db, clearFirestore, fns,
  seedEntitlement, seedBillingPrivate, getEntitlement, getReferral, conflicts,
  callReferralInit, callReferralEnsureCode, callReferralMarkActive,
  callReferralApplyCode, callReferralMarkSeen, callReferralListReferrals, errorCode
} from "./lib/referral-harness.mjs";

const MONTH_MS = 30 * 86400000;
const future = (days = 20) => new Date(Date.now() + days * 86400000);
const past = (days = 5) => new Date(Date.now() - days * 86400000);

async function makeParrain(uid, ent) {
  const p = await callReferralInit(uid);
  await seedEntitlement(uid, ent);
  return p.referralCode;
}
async function activate(uid, code, tokenOver) {
  await seedEntitlement(uid);
  await callReferralInit(uid, { referredBy: code });
  return callReferralMarkActive(uid, tokenOver);
}
async function twoActive(code) {
  for (const u of ["F1", "F2"]) await activate(u, code);
}

describe("PARRAINAGE LOT A/B", function () {
  this.timeout(40000);
  beforeEach(async () => { await clearFirestore(); resetStripe(); });

  describe("A5 — échecs Stripe journalisés dans billingConflicts", () => {
    async function subscriberSetup() {
      const code = await makeParrain("P", { status: "active", planType: "monthly", premiumUntil: future(10), writeAccessUntil: future(10), trialEndsAt: null, cancelAtPeriodEnd: false });
      await seedBillingPrivate("P", { stripeSubscriptionId: "sub_1" });
      await twoActive(code);
      return code;
    }
    it("abonnement introuvable chez Stripe (resource_missing) : le filleul est compté, aucune erreur, échec journalisé", async () => {
      const code = await subscriberSetup(); // S.subs vide => retrieve échoue
      const res = await activate("F3", code);
      assert.equal(res.activated, true);
      const ent = await getEntitlement("P");
      assert.equal(ent.referralMonthsGranted, 1, "le compteur est déjà écrit dans la transaction");
      const c = await conflicts();
      assert.equal(c.length, 1);
      assert.match(c[0].id, /^referral_P_\d+$/);
      assert.equal(c[0].reason, "referral_stripe_sync_failed");
      assert.equal(c[0].monthsDue, 1);
      assert.equal(c[0].stripeSubscriptionId, "sub_1");
      assert.ok(c[0].error.length > 0 && c[0].error.length <= 300);
    });
    it("Stripe indisponible (erreur réseau) : pareil, jamais d'erreur pour le filleul", async () => {
      const code = await subscriberSetup();
      S.subs["sub_1"] = { id: "sub_1", status: "active", current_period_end: Math.floor(future(10).getTime() / 1000) };
      S.failRetrieve = new Error("connexion Stripe coupée");
      const res = await activate("F3", code);
      assert.equal(res.activated, true);
      const c = await conflicts();
      assert.equal(c.length, 1);
      assert.match(c[0].error, /connexion Stripe coupée/);
    });
    it("3e filleul par saisie rétroactive + Stripe en panne : journalisé", async () => {
      const code = await subscriberSetup();
      await seedEntitlement("E3");
      assert.deepEqual(await callReferralApplyCode("E3", code), { ok: true });
      assert.equal((await conflicts()).length, 1);
    });
    it("succès Stripe : aucune entrée de journal", async () => {
      const code = await subscriberSetup();
      S.subs["sub_1"] = { id: "sub_1", status: "active", current_period_end: Math.floor(future(10).getTime() / 1000) };
      await activate("F3", code);
      assert.equal((await conflicts()).length, 0);
      assert.equal(S.updated.length, 1);
    });
  });

  describe("A6 — abonnement mensuel : cas par cas", () => {
    it("cancelAtPeriodEnd:true : aucun appel Stripe, aucune date touchée, journal 'subscription_cancelling'", async () => {
      const end = future(10);
      const code = await makeParrain("P", { status: "active", planType: "monthly", premiumUntil: end, writeAccessUntil: end, trialEndsAt: null, cancelAtPeriodEnd: true });
      await seedBillingPrivate("P", { stripeSubscriptionId: "sub_1" });
      S.subs["sub_1"] = { id: "sub_1", status: "active", current_period_end: Math.floor(end.getTime() / 1000) };
      await twoActive(code);
      await activate("F3", code);
      assert.equal(S.updated.length, 0);
      assert.equal(S.retrieved.length, 0);
      const ent = await getEntitlement("P");
      assert.equal(ent.premiumUntil.toMillis(), end.getTime());
      assert.equal(ent.writeAccessUntil.toMillis(), end.getTime());
      const c = await conflicts();
      assert.equal(c.length, 1);
      assert.equal(c[0].reason, "referral_bonus_subscription_cancelling");
      assert.equal(c[0].monthsDue, 1);
    });
    it("abonnement annulé côté Stripe (webhook : status 'expired', stripeSubscriptionId encore posé) : accès autonome, jamais de branche Stripe", async () => {
      const code = await makeParrain("P", { status: "expired", planType: "monthly", premiumUntil: past(3), writeAccessUntil: past(3), trialEndsAt: past(30) });
      await seedBillingPrivate("P", { stripeSubscriptionId: "sub_dead" });
      await twoActive(code);
      await activate("F3", code);
      assert.equal(S.retrieved.length, 0);
      const ent = await getEntitlement("P");
      assert.equal(ent.status, "active");
      assert.equal(ent.planType, "referral");
      assert.ok(ent.writeAccessUntil.toMillis() > Date.now() + MONTH_MS - 60000);
    });
    it("impayé (status 'payment_issue') : aucune date écrasée, journal 'payment_issue', pas d'appel Stripe", async () => {
      const wa = future(3);
      const code = await makeParrain("P", { status: "payment_issue", planType: "monthly", premiumUntil: past(1), writeAccessUntil: wa, trialEndsAt: null });
      await seedBillingPrivate("P", { stripeSubscriptionId: "sub_1" });
      await twoActive(code);
      await activate("F3", code);
      assert.equal(S.updated.length, 0);
      const ent = await getEntitlement("P");
      assert.equal(ent.writeAccessUntil.toMillis(), wa.getTime());
      const c = await conflicts();
      assert.equal(c.length, 1);
      assert.equal(c[0].reason, "referral_bonus_payment_issue");
    });
    it("mensuel actif SANS stripeSubscriptionId : extension Firestore directe, aucun journal", async () => {
      const end = future(10);
      const code = await makeParrain("P", { status: "active", planType: "monthly", premiumUntil: end, writeAccessUntil: end, trialEndsAt: null });
      await twoActive(code);
      await activate("F3", code);
      const ent = await getEntitlement("P");
      assert.equal(ent.premiumUntil.toMillis(), end.getTime() + MONTH_MS);
      assert.equal((await conflicts()).length, 0);
    });
  });

  describe("A7 — la fin du bonus d'un parrain expiré ex-abonné", () => {
    it("après le bonus : statut 'active'/planType 'referral' ; une fois la date dépassée, sweepExpiredTrials le repasse en 'expired' (sans jamais toucher writeAccessUntil)", async () => {
      const code = await makeParrain("P", { status: "expired", planType: "monthly", premiumUntil: past(60), writeAccessUntil: past(60), trialEndsAt: past(90), cancelAtPeriodEnd: false });
      await twoActive(code);
      await activate("F3", code);
      let ent = await getEntitlement("P");
      assert.equal(ent.status, "active");
      assert.equal(ent.planType, "referral");
      // le bonus arrive à son terme : dates reculées dans le passé
      const endPast = past(1);
      await db.doc("entitlements/P").update({ premiumUntil: endPast, writeAccessUntil: endPast });
      await fns.sweepExpiredTrials.run({});
      ent = await getEntitlement("P");
      assert.equal(ent.status, "expired", "sans le correctif, ce compte resterait 'actif' pour toujours");
      assert.equal(ent.writeAccessUntil.toMillis(), endPast.getTime(), "les droits réels ne sont jamais modifiés par le balayage");
    });
    it("un abonné mensuel actif (planType 'monthly') n'est JAMAIS rebasculé par le balayage (statut = webhook)", async () => {
      await seedEntitlement("M", { status: "active", planType: "monthly", premiumUntil: past(1), writeAccessUntil: past(1), trialEndsAt: null });
      await fns.sweepExpiredTrials.run({});
      assert.equal((await getEntitlement("M")).status, "active");
    });
  });

  describe("A8 — referralInit : un seul parrain à vie, même en concurrence", () => {
    it("deux appels concurrents avec deux codes différents : un seul lien, jamais écrasé", async () => {
      const a = await callReferralInit("PA");
      const b = await callReferralInit("PB");
      for (let i = 0; i < 4; i++) {
        await clearReferralsOf("X" + i);
        const [r1, r2] = await Promise.all([
          callReferralInit("X" + i, { referredBy: a.referralCode }),
          callReferralInit("X" + i, { referredBy: b.referralCode })
        ]);
        assert.ok(r1.referralCode && r2.referralCode);
        const link = await getReferral("X" + i);
        assert.ok(["PA", "PB"].includes(link.referrerUid));
        assert.equal(r1.referralCode, r2.referralCode, "un seul code propre par compte");
      }
    });
    it("referralInit puis referralApplyCode : le second échoue, parrain d'origine intact", async () => {
      const a = await callReferralInit("PA"); await seedEntitlement("PA");
      const b = await callReferralInit("PB"); await seedEntitlement("PB");
      await seedEntitlement("F");
      await callReferralInit("F", { referredBy: a.referralCode });
      assert.equal(await errorCode(callReferralApplyCode("F", b.referralCode)), "failed-precondition");
      assert.equal((await getReferral("F")).referrerUid, "PA");
    });
    it("referralApplyCode concurrent (double clic) : un seul crédit", async () => {
      const code = await makeParrain("P");
      await seedEntitlement("E");
      const results = await Promise.allSettled([callReferralApplyCode("E", code), callReferralApplyCode("E", code)]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((await getEntitlement("P")).referralActiveCount, 1);
    });
  });

  describe("A9 — nom du filleul", () => {
    it("jeton d'abord, nettoyé (balises, contrôle, espaces, 60 car.)", async () => {
      const code = await makeParrain("P");
      await seedEntitlement("F");
      await callReferralInit("F", { referredBy: code });
      await callReferralMarkActive("F", { name: "  <b>Alice</b>\u0000   Dupont " + "x".repeat(100) });
      const r = await getReferral("F");
      assert.ok(r.filleulName.startsWith("bAlice/b Dupont x"));
      assert.ok(!/[<>\u0000]/.test(r.filleulName));
      assert.ok(r.filleulName.length <= 60);
    });
    it("repli : sans nom dans le jeton, utilise users/{uid}.displayName", async () => {
      const code = await makeParrain("P");
      await seedEntitlement("F", {});
      await db.doc("users/F").set({ displayName: "Prénom Nom" }, { merge: true });
      await callReferralInit("F", { referredBy: code });
      await callReferralMarkActive("F", { name: "" });
      assert.equal((await getReferral("F")).filleulName, "Prénom Nom");
    });
    it("aucun nom disponible : filleulName absent, l'activation réussit quand même", async () => {
      const code = await makeParrain("P");
      await seedEntitlement("F");
      await db.doc("users/F").set({ displayName: null }, { merge: true });
      await callReferralInit("F", { referredBy: code });
      const res = await callReferralMarkActive("F", { name: "" });
      assert.equal(res.activated, true);
      assert.equal((await getReferral("F")).filleulName, undefined);
    });
    it("saisie rétroactive : le nom du filleul est enregistré aussi", async () => {
      const code = await makeParrain("P");
      await seedEntitlement("E");
      await callReferralApplyCode("E", code, { name: "Emma Martin" });
      assert.equal((await getReferral("E")).filleulName, "Emma Martin");
    });
  });

  describe("B2 — nouveaux filleuls (notification) et accusé de réception", () => {
    it("aucun filleul : newReferrals vide, referralSeenCount 0", async () => {
      await makeParrain("P");
      const r = await callReferralEnsureCode("P");
      assert.deepEqual(r.newReferrals, []);
      assert.equal(r.referralSeenCount, 0);
    });
    it("un filleul actif : 1 nouveau avec son nom ; après referralMarkSeen : plus rien", async () => {
      const code = await makeParrain("P");
      await activate("F1", code, { name: "Alice Dupont" });
      let r = await callReferralEnsureCode("P");
      assert.equal(r.referralActiveCount, 1);
      assert.equal(r.newReferrals.length, 1);
      assert.equal(r.newReferrals[0].name, "Alice Dupont");
      assert.ok(typeof r.newReferrals[0].at === "number");
      assert.deepEqual(await callReferralMarkSeen("P"), { referralSeenCount: 1 });
      r = await callReferralEnsureCode("P");
      assert.deepEqual(r.newReferrals, []);
      assert.equal(r.referralSeenCount, 1);
    });
    it("plus récents d'abord, uniquement les non vus", async () => {
      const code = await makeParrain("P");
      await activate("F1", code, { name: "Un" });
      await callReferralMarkSeen("P");
      await new Promise((r) => setTimeout(r, 30));
      await activate("F2", code, { name: "Deux" });
      await new Promise((r) => setTimeout(r, 30));
      await activate("F3", code, { name: "Trois" });
      const r = await callReferralEnsureCode("P");
      assert.deepEqual(r.newReferrals.map((x) => x.name), ["Trois", "Deux"]);
    });
    it("plafond de 5 noms", async () => {
      const code = await makeParrain("P");
      for (let i = 1; i <= 8; i++) { await activate("F" + i, code, { name: "N" + i }); await new Promise((r) => setTimeout(r, 15)); }
      const r = await callReferralEnsureCode("P");
      assert.equal(r.referralActiveCount, 8);
      assert.equal(r.newReferrals.length, 5);
      assert.equal(r.newReferrals[0].name, "N8");
    });
    it("ancien filleul sans nom : name null", async () => {
      const code = await makeParrain("P");
      await seedEntitlement("F"); await db.doc("users/F").set({ displayName: null }, { merge: true });
      await callReferralInit("F", { referredBy: code });
      await callReferralMarkActive("F", { name: "" });
      const r = await callReferralEnsureCode("P");
      assert.equal(r.newReferrals[0].name, null);
    });
    it("referralSeenCount falsifié (supérieur au compteur, négatif) : borné à [0, activeCount]", async () => {
      const code = await makeParrain("P");
      await activate("F1", code, { name: "Un" });
      await db.doc("entitlements/P").update({ referralSeenCount: 99 });
      assert.equal((await callReferralEnsureCode("P")).referralSeenCount, 1);
      await db.doc("entitlements/P").update({ referralSeenCount: -4 });
      const r = await callReferralEnsureCode("P");
      assert.equal(r.referralSeenCount, 0);
      assert.equal(r.newReferrals.length, 1);
    });
    it("referralMarkSeen : email non vérifié refusé, non authentifié refusé, ignore tout paramètre client", async () => {
      await makeParrain("P");
      assert.equal(await errorCode(callReferralMarkSeen("P", { email_verified: false })), "failed-precondition");
      assert.equal(await errorCode(callReferralMarkSeen(null)), "unauthenticated");
      const r = await fns.referralMarkSeen.run({ data: { referralSeenCount: 999 }, auth: { uid: "P", token: { email_verified: true } }, rawRequest: {} });
      assert.equal(r.referralSeenCount, 0);
    });
    it("un filleul non actif (lien créé, jamais connecté) n'est jamais notifié", async () => {
      const code = await makeParrain("P");
      await seedEntitlement("F"); await callReferralInit("F", { referredBy: code });
      const r = await callReferralEnsureCode("P");
      assert.equal(r.referralActiveCount, 0);
      assert.deepEqual(r.newReferrals, []);
    });
  });

  describe("B3 — referralListReferrals", () => {
    it("liste vide", async () => {
      await makeParrain("P");
      assert.deepEqual(await callReferralListReferrals("P"), { total: 0, referrals: [] });
    });
    it("actifs seulement, plus récents d'abord, {name, code, at} sans uid ni e-mail", async () => {
      const code = await makeParrain("P");
      await activate("F1", code, { name: "Alice" }); await new Promise((r) => setTimeout(r, 20));
      await activate("F2", code, { name: "Bob" });
      await seedEntitlement("F3"); await callReferralInit("F3", { referredBy: code }); // inactif
      const res = await callReferralListReferrals("P");
      assert.equal(res.total, 2);
      assert.deepEqual(res.referrals.map((r) => r.name), ["Bob", "Alice"]);
      for (const r of res.referrals) {
        assert.deepEqual(Object.keys(r).sort(), ["at", "code", "name"]);
        assert.match(r.code, /^[A-Z2-9]{6}$/);
      }
      const json = JSON.stringify(res);
      assert.ok(!json.includes("F1") && !json.includes("F2") && !json.includes("@test.fr"), "aucun uid ni e-mail dans la réponse");
      assert.equal(res.total, (await getEntitlement("P")).referralActiveCount, "liste = compteur");
    });
    it("isolement entre parrains", async () => {
      const a = await makeParrain("PA"); const b = await makeParrain("PB");
      await activate("FA", a, { name: "Chez A" }); await activate("FB", b, { name: "Chez B" });
      assert.deepEqual((await callReferralListReferrals("PA")).referrals.map((r) => r.name), ["Chez A"]);
      assert.deepEqual((await callReferralListReferrals("PB")).referrals.map((r) => r.name), ["Chez B"]);
    });
    it("code corrompu jamais renvoyé ; nom manquant -> displayName du profil ; sinon null", async () => {
      const code = await makeParrain("P");
      await activate("F1", code, { name: "Alice" });
      await db.doc("users/F1").set({ referralCode: "<script>" }, { merge: true });
      await seedEntitlement("F2"); await db.doc("users/F2").set({ displayName: "Profil Nom" }, { merge: true });
      await callReferralInit("F2", { referredBy: code });
      await callReferralMarkActive("F2", { name: "" });
      await db.doc("referrals/F2").update({ filleulName: null });
      const res = await callReferralListReferrals("P");
      const alice = res.referrals.find((r) => r.name === "Alice");
      assert.equal(alice.code, null);
      assert.ok(res.referrals.some((r) => r.name === "Profil Nom"));
    });
    it("plafond de 100 lignes avec le total réel", async () => {
      const code = await makeParrain("P");
      const batch = db.batch();
      for (let i = 0; i < 130; i++) {
        batch.set(db.doc(`referrals/Z${i}`), { referrerUid: "P", code, active: true, activatedAt: new Date(Date.now() - i * 1000), filleulName: "Z" + i });
      }
      await batch.commit();
      const res = await callReferralListReferrals("P");
      assert.equal(res.total, 130);
      assert.equal(res.referrals.length, 100);
      assert.equal(res.referrals[0].name, "Z0");
    });
    it("email non vérifié / non authentifié refusés", async () => {
      await makeParrain("P");
      assert.equal(await errorCode(callReferralListReferrals("P", { email_verified: false })), "failed-precondition");
      assert.equal(await errorCode(callReferralListReferrals(null)), "unauthenticated");
    });
  });

  describe("Réciprocité de bout en bout", () => {
    it("un filleul copie le code d'un autre filleul de son parrain et le saisit à son tour : ce compte est crédité", async () => {
      const codeP = await makeParrain("P");
      await activate("F1", codeP, { name: "Alice" });
      const listed = (await callReferralListReferrals("P")).referrals[0];
      assert.equal(listed.name, "Alice");
      await seedEntitlement("G"); // compte existant sans parrain
      assert.deepEqual(await callReferralApplyCode("G", listed.code, { name: "Gaëlle" }), { ok: true });
      assert.equal((await getEntitlement("F1")).referralActiveCount, 1, "F1 (propriétaire du code) est crédité, jamais G");
      assert.equal((await getEntitlement("G")).referralActiveCount || 0, 0);
    });
  });

  describe("Concurrence (piège n°1) — maintenu après les changements", () => {
    it("3e ET 4e filleul en Promise.all : un seul mois", async () => {
      const trialEnd = future(5);
      const code = await makeParrain("P", { status: "trial", trialEndsAt: trialEnd, writeAccessUntil: trialEnd, premiumUntil: null, planType: null });
      await twoActive(code);
      for (const u of ["F3", "F4"]) { await seedEntitlement(u); await callReferralInit(u, { referredBy: code }); }
      const [a, b] = await Promise.all([callReferralMarkActive("F3"), callReferralMarkActive("F4")]);
      assert.equal(a.bonusMonths + b.bonusMonths, 1);
      const ent = await getEntitlement("P");
      assert.equal(ent.referralMonthsGranted, 1);
      assert.equal(ent.writeAccessUntil.toMillis(), trialEnd.getTime() + MONTH_MS);
    });
  });
});

async function clearReferralsOf(uid) {
  await db.doc(`referrals/${uid}`).delete();
  const u = await db.doc(`users/${uid}`).get();
  if (u.exists && u.get("referralCode")) { await db.doc(`referralCodes/${u.get("referralCode")}`).delete(); }
  await db.doc(`users/${uid}`).delete();
}
