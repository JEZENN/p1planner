/* ============================================================
   P1PLANNER — Tests PARRAINAGE : VRAI code de functions/index.js
   (referralInit / referralEnsureCode / referralCheckCode /
   referralMarkActive / referralApplyCode), via fns.<nom>.run(), contre
   l'ÉMULATEUR Firestore réel, Stripe SIMULÉ (voir test/lib/referral-harness.mjs).
   Nécessite l'émulateur Firestore + Auth démarré (npm run emulators, ou
   `firebase emulators:start --only auth,firestore` — l'émulateur Functions
   n'est PAS nécessaire ici, .run() appelle le code directement).
   ============================================================ */
import assert from "node:assert/strict";
import {
  S, resetStripe, db, clearFirestore,
  seedEntitlement, seedBillingPrivate, getEntitlement, getReferral,
  callReferralInit, callReferralEnsureCode, callReferralCheckCode,
  callReferralMarkActive, callReferralApplyCode, errorCode
} from "./lib/referral-harness.mjs";

const MONTH_MS = 30 * 86400000;
const future = (days = 20) => new Date(Date.now() + days * 86400000);
const past = (days = 5) => new Date(Date.now() - days * 86400000);

/* Crée un filleul lié à `referrerCode` et le marque actif — raccourci
   utilisé par les tests de paliers (3e, 6e, 7e filleul...). */
async function addActiveReferral(uid, referrerCode) {
  await seedEntitlement(uid);
  await callReferralInit(uid, { referredBy: referrerCode });
  return callReferralMarkActive(uid);
}

describe("PARRAINAGE — Cloud Functions (vrai code) via harnais Stripe simulé", function () {
  this.timeout(30000);
  beforeEach(async () => { await clearFirestore(); resetStripe(); });

  describe("referralInit", () => {
    it("réserve un code de 6 caractères pour un nouveau compte", async () => {
      const res = await callReferralInit("U1");
      assert.equal(res.referralCode.length, 6);
    });

    it("idempotent : un 2e appel renvoie le MÊME code, sans erreur", async () => {
      const r1 = await callReferralInit("U1");
      const r2 = await callReferralInit("U1");
      assert.equal(r1.referralCode, r2.referralCode);
    });

    it("refuse un appel non authentifié", async () => {
      assert.equal(await errorCode(callReferralInit(null)), "unauthenticated");
    });

    it("fonctionne SANS email vérifié (fenêtre inscription -> signOut)", async () => {
      const res = await callReferralInit("U1"); // token par défaut : email_verified:false
      assert.equal(res.referralCode.length, 6);
    });

    it("code de parrain valide -> crée referrals/{filleul} inactif", async () => {
      const p = await callReferralInit("PARRAIN");
      await callReferralInit("FILLEUL", { referredBy: p.referralCode });
      const ref = await getReferral("FILLEUL");
      assert.equal(ref.referrerUid, "PARRAIN");
      assert.equal(ref.active, false);
    });

    it("code inconnu -> aucune erreur, aucun document referrals créé (l'inscription ne doit jamais échouer)", async () => {
      const res = await callReferralInit("FILLEUL", { referredBy: "ZZZZZZ" });
      assert.equal(res.referralCode.length, 6);
      assert.equal(await getReferral("FILLEUL"), null);
    });

    it("code minuscule / espaces -> normalisé avant recherche", async () => {
      const p = await callReferralInit("PARRAIN");
      await callReferralInit("FILLEUL", { referredBy: "  " + p.referralCode.toLowerCase() + "  " });
      const ref = await getReferral("FILLEUL");
      assert.equal(ref.referrerUid, "PARRAIN");
    });

    it("son propre code (cas normalement impossible) -> aucun lien créé, gardé par sécurité", async () => {
      // referralInit génère le code du compte APRÈS avoir lu referredBy : un
      // appel normal ne peut jamais atteindre ce cas, testé par sécurité.
      const p = await callReferralInit("SOLO");
      await callReferralInit("SOLO", { referredBy: p.referralCode });
      assert.equal(await getReferral("SOLO"), null);
    });
  });

  describe("referralEnsureCode", () => {
    it("génère un code pour un compte jamais passé par referralInit (rattrapage compte créé avant ce déploiement)", async () => {
      await seedEntitlement("U1");
      const res = await callReferralEnsureCode("U1");
      assert.equal(res.referralCode.length, 6);
      assert.equal(res.referralActiveCount, 0);
      assert.equal(res.referralMonthsGranted, 0);
      assert.equal(res.alreadyReferred, false);
    });

    it("refuse un email non vérifié", async () => {
      await seedEntitlement("U1");
      assert.equal(await errorCode(callReferralEnsureCode("U1", { email_verified: false })), "failed-precondition");
    });

    it("alreadyReferred:true si un lien existe déjà (referralInit à l'inscription)", async () => {
      const p = await callReferralInit("PARRAIN");
      await seedEntitlement("FILLEUL");
      await callReferralInit("FILLEUL", { referredBy: p.referralCode });
      const res = await callReferralEnsureCode("FILLEUL");
      assert.equal(res.alreadyReferred, true);
    });
  });

  describe("referralCheckCode (sans authentification)", () => {
    it("code existant -> {valid:true}", async () => {
      const p = await callReferralInit("PARRAIN");
      assert.deepEqual(await callReferralCheckCode(p.referralCode), { valid: true });
    });
    it("code inconnu -> {valid:false}, aucune erreur", async () => {
      assert.deepEqual(await callReferralCheckCode("ZZZZZZ"), { valid: false });
    });
    it("code mal formé (longueur, caractères interdits) -> {valid:false}, aucune erreur", async () => {
      assert.deepEqual(await callReferralCheckCode("A"), { valid: false });
      assert.deepEqual(await callReferralCheckCode("AAAA0O"), { valid: false });
      assert.deepEqual(await callReferralCheckCode(""), { valid: false });
    });
    it("minuscules / espaces -> normalisé avant recherche", async () => {
      const p = await callReferralInit("PARRAIN2");
      assert.deepEqual(await callReferralCheckCode("  " + p.referralCode.toLowerCase() + "  "), { valid: true });
    });
  });

  describe("referralMarkActive — comptage + récompense", () => {
    async function setupFilleul(uid, referrerCode) {
      await seedEntitlement(uid);
      await callReferralInit(uid, { referredBy: referrerCode });
    }

    it("sans code de parrain -> {activated:false}, rien ne change", async () => {
      await seedEntitlement("SOLO");
      const res = await callReferralMarkActive("SOLO");
      assert.deepEqual(res, { activated: false, bonusMonths: 0 });
    });

    it("1er filleul actif -> compteur à 1, PAS de bonus (< 3)", async () => {
      const p = await callReferralInit("PARRAIN");
      await seedEntitlement("PARRAIN");
      await setupFilleul("F1", p.referralCode);
      const res = await callReferralMarkActive("F1");
      assert.equal(res.activated, true);
      assert.equal(res.bonusMonths, 0);
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.referralActiveCount, 1);
      assert.equal(ent.referralMonthsGranted || 0, 0);
    });

    it("rappeler referralMarkActive pour le MÊME filleul ne recompte pas (idempotent)", async () => {
      const p = await callReferralInit("PARRAIN");
      await seedEntitlement("PARRAIN");
      await setupFilleul("F1", p.referralCode);
      await callReferralMarkActive("F1");
      const res2 = await callReferralMarkActive("F1");
      assert.deepEqual(res2, { activated: false, bonusMonths: 0 });
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.referralActiveCount, 1);
    });

    it("3e filleul actif, parrain en ESSAI -> 1er palier (+1 mois), writeAccessUntil ET trialEndsAt prolongés, statut reste 'trial'", async () => {
      const p = await callReferralInit("PARRAIN");
      const trialEnd = future(5);
      await seedEntitlement("PARRAIN", { status: "trial", trialEndsAt: trialEnd, writeAccessUntil: trialEnd, premiumUntil: null, planType: null });
      for (const uid of ["F1", "F2"]) { await setupFilleul(uid, p.referralCode); await callReferralMarkActive(uid); }
      await setupFilleul("F3", p.referralCode);
      const res = await callReferralMarkActive("F3");
      assert.equal(res.bonusMonths, 1);
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.referralActiveCount, 3);
      assert.equal(ent.referralMonthsGranted, 1);
      assert.equal(ent.status, "trial");
      assert.equal(ent.premiumUntil, null, "premiumUntil ne doit jamais être posé pour un bonus sur essai");
      assert.equal(ent.writeAccessUntil.toMillis(), trialEnd.getTime() + MONTH_MS);
      assert.equal(ent.trialEndsAt.toMillis(), trialEnd.getTime() + MONTH_MS);
    });

    it("4e et 5e filleul (entre les deux paliers) -> aucun bonus supplémentaire", async () => {
      const p = await callReferralInit("PARRAIN");
      await seedEntitlement("PARRAIN");
      for (const uid of ["F1", "F2", "F3"]) { await setupFilleul(uid, p.referralCode); await callReferralMarkActive(uid); }
      for (const uid of ["F4", "F5"]) {
        await setupFilleul(uid, p.referralCode);
        const res = await callReferralMarkActive(uid);
        assert.equal(res.bonusMonths, 0);
      }
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.referralActiveCount, 5);
      assert.equal(ent.referralMonthsGranted, 1);
    });

    it("6e filleul -> 2e palier (le plafond), +2 mois de plus (3 cumulés), additif sur la date déjà accordée", async () => {
      const p = await callReferralInit("PARRAIN");
      const trialEnd = future(5);
      await seedEntitlement("PARRAIN", { status: "trial", trialEndsAt: trialEnd, writeAccessUntil: trialEnd, premiumUntil: null, planType: null });
      for (const uid of ["F1", "F2", "F3", "F4", "F5"]) { await setupFilleul(uid, p.referralCode); await callReferralMarkActive(uid); }
      await setupFilleul("F6", p.referralCode);
      const res = await callReferralMarkActive("F6");
      assert.equal(res.bonusMonths, 2);
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.referralMonthsGranted, 3);
      assert.equal(ent.writeAccessUntil.toMillis(), trialEnd.getTime() + 3 * MONTH_MS);
    });

    it("7e, 10e... filleul -> PLAFOND atteint : plus aucun bonus, jamais", async () => {
      const p = await callReferralInit("PARRAIN");
      await seedEntitlement("PARRAIN");
      for (const uid of ["F1", "F2", "F3", "F4", "F5", "F6"]) { await setupFilleul(uid, p.referralCode); await callReferralMarkActive(uid); }
      for (const uid of ["F7", "F8", "F9", "F10"]) {
        await setupFilleul(uid, p.referralCode);
        const res = await callReferralMarkActive(uid);
        assert.equal(res.bonusMonths, 0);
      }
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.referralActiveCount, 10);
      assert.equal(ent.referralMonthsGranted, 3);
    });

    it("parrain sur FORMULE PAYÉE active (onetime) : writeAccessUntil ET premiumUntil s'allongent ensemble, le statut n'est PAS touché", async () => {
      const p = await callReferralInit("PARRAIN");
      const end = future(40);
      await seedEntitlement("PARRAIN", { status: "active", planType: "onetime", premiumUntil: end, writeAccessUntil: end, trialEndsAt: null });
      for (const uid of ["F1", "F2"]) { await setupFilleul(uid, p.referralCode); await callReferralMarkActive(uid); }
      await setupFilleul("F3", p.referralCode);
      await callReferralMarkActive("F3");
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.status, "active");
      assert.equal(ent.premiumUntil.toMillis(), end.getTime() + MONTH_MS);
      assert.equal(ent.writeAccessUntil.toMillis(), end.getTime() + MONTH_MS);
    });

    it("parrain avec abonnement Stripe RÉCURRENT actif et exploitable : décale trial_end côté Stripe, NE réécrit PAS writeAccessUntil/premiumUntil côté Firestore", async () => {
      const p = await callReferralInit("PARRAIN");
      await seedEntitlement("PARRAIN", { status: "active", planType: "monthly", premiumUntil: future(10), writeAccessUntil: future(10), trialEndsAt: null });
      await seedBillingPrivate("PARRAIN", { stripeSubscriptionId: "sub_123" });
      const periodEnd = Math.floor(future(10).getTime() / 1000);
      S.subs["sub_123"] = { id: "sub_123", status: "active", current_period_end: periodEnd };
      for (const uid of ["F1", "F2"]) { await setupFilleul(uid, p.referralCode); await callReferralMarkActive(uid); }
      const entBefore = await getEntitlement("PARRAIN");
      await setupFilleul("F3", p.referralCode);
      const res = await callReferralMarkActive("F3");
      assert.equal(res.bonusMonths, 1);
      const entAfter = await getEntitlement("PARRAIN");
      assert.equal(entAfter.referralMonthsGranted, 1);
      // writeAccessUntil/premiumUntil INCHANGÉS côté Firestore (le webhook resynchronisera) :
      assert.equal(entAfter.writeAccessUntil.toMillis(), entBefore.writeAccessUntil.toMillis());
      assert.equal(entAfter.premiumUntil.toMillis(), entBefore.premiumUntil.toMillis());
      // …mais Stripe A REÇU le décalage de trial_end :
      assert.equal(S.updated.length, 1);
      assert.equal(S.updated[0].id, "sub_123");
      assert.equal(S.updated[0].patch.trial_end, periodEnd + MONTH_MS / 1000);
      assert.equal(S.updated[0].patch.proration_behavior, "none");
    });

    it("parrain introuvable (compte supprimé, aucun entitlement) : le filleul est quand même marqué actif, sans planter, sans récompense", async () => {
      const p = await callReferralInit("PARRAIN");
      await seedEntitlement("FILLEUL");
      await callReferralInit("FILLEUL", { referredBy: p.referralCode });
      await db.doc("entitlements/PARRAIN").delete(); // parrain "supprimé"
      const res = await callReferralMarkActive("FILLEUL");
      assert.equal(res.activated, true);
      assert.equal(res.bonusMonths, 0);
      const ref = await getReferral("FILLEUL");
      assert.equal(ref.active, true);
    });

    it("CORRECTIF SÉCURITÉ : 2 filleuls du MÊME parrain activés EN CONCURRENCE ne double-créditent JAMAIS le bonus", async () => {
      const p = await callReferralInit("PARRAIN");
      const trialEnd = future(5);
      await seedEntitlement("PARRAIN", { status: "trial", trialEndsAt: trialEnd, writeAccessUntil: trialEnd, premiumUntil: null, planType: null });
      for (const uid of ["F1", "F2"]) { await setupFilleul(uid, p.referralCode); await callReferralMarkActive(uid); }
      await setupFilleul("F3", p.referralCode);
      await setupFilleul("F4", p.referralCode);

      // 3e ET 4e EN VRAIE CONCURRENCE (Promise.all, pas de await entre les deux
      // appels) : les deux liront potentiellement le MÊME état de départ si la
      // sérialisation transactionnelle ne protège pas correctement.
      const [res3, res4] = await Promise.all([
        callReferralMarkActive("F3"),
        callReferralMarkActive("F4")
      ]);
      const totalBonus = res3.bonusMonths + res4.bonusMonths;
      assert.equal(totalBonus, 1, `total des bonus accordés doit être EXACTEMENT 1 (1er palier atteint une seule fois), obtenu ${totalBonus} (res3=${res3.bonusMonths}, res4=${res4.bonusMonths})`);
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.referralActiveCount, 4);
      assert.equal(ent.referralMonthsGranted, 1, "referralMonthsGranted ne doit JAMAIS dépasser le palier réellement atteint");
      assert.equal(ent.writeAccessUntil.toMillis(), trialEnd.getTime() + MONTH_MS, "un seul mois doit avoir été ajouté, pas deux");
    });
  });

  describe("referralApplyCode — saisie rétroactive (compte déjà existant)", () => {
    it("code valide -> crédite le PROPRIÉTAIRE du code, jamais celui qui le saisit", async () => {
      const p = await callReferralInit("PARRAIN");
      await seedEntitlement("PARRAIN");
      await seedEntitlement("EXISTANT");
      const res = await callReferralApplyCode("EXISTANT", p.referralCode);
      assert.deepEqual(res, { ok: true });
      const ref = await getReferral("EXISTANT");
      assert.equal(ref.referrerUid, "PARRAIN");
      assert.equal(ref.active, true);
      assert.equal(ref.retroactive, true);
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.referralActiveCount, 1);
    });

    it("3e saisie rétroactive -> 1er palier, même récompense que referralMarkActive", async () => {
      const p = await callReferralInit("PARRAIN");
      const trialEnd = future(5);
      await seedEntitlement("PARRAIN", { status: "trial", trialEndsAt: trialEnd, writeAccessUntil: trialEnd, premiumUntil: null, planType: null });
      for (const uid of ["E1", "E2"]) { await seedEntitlement(uid); await callReferralApplyCode(uid, p.referralCode); }
      await seedEntitlement("E3");
      await callReferralApplyCode("E3", p.referralCode);
      const ent = await getEntitlement("PARRAIN");
      assert.equal(ent.referralActiveCount, 3);
      assert.equal(ent.referralMonthsGranted, 1);
    });

    it("auto-parrainage (son propre code) -> failed-precondition, rien ne change", async () => {
      const p = await callReferralInit("SOLO");
      await seedEntitlement("SOLO");
      assert.equal(await errorCode(callReferralApplyCode("SOLO", p.referralCode)), "failed-precondition");
      assert.equal(await getReferral("SOLO"), null);
    });

    it("code invalide (mal formé) -> invalid-argument", async () => {
      await seedEntitlement("U1");
      assert.equal(await errorCode(callReferralApplyCode("U1", "XX")), "invalid-argument");
    });

    it("code inconnu -> not-found", async () => {
      await seedEntitlement("U1");
      assert.equal(await errorCode(callReferralApplyCode("U1", "ZZZ999")), "not-found");
    });

    it("SÉCURITÉ : déjà lié via referralInit à l'inscription -> impossible d'en saisir un second", async () => {
      const p1 = await callReferralInit("PARRAIN1");
      await seedEntitlement("PARRAIN1");
      const p2 = await callReferralInit("PARRAIN2");
      await seedEntitlement("PARRAIN2");
      await seedEntitlement("FILLEUL");
      await callReferralInit("FILLEUL", { referredBy: p1.referralCode }); // lien pris dès l'inscription
      assert.equal(await errorCode(callReferralApplyCode("FILLEUL", p2.referralCode)), "failed-precondition");
      const ref = await getReferral("FILLEUL");
      assert.equal(ref.referrerUid, "PARRAIN1", "le parrain d'origine ne doit jamais être remplacé");
      const ent2 = await getEntitlement("PARRAIN2");
      assert.equal(ent2.referralActiveCount || 0, 0, "PARRAIN2 ne doit recevoir aucun crédit pour un lien refusé");
    });

    it("SÉCURITÉ : déjà lié via un précédent referralApplyCode -> un 2e appel échoue, ne recrédite jamais", async () => {
      const p1 = await callReferralInit("PARRAIN1");
      await seedEntitlement("PARRAIN1");
      const p2 = await callReferralInit("PARRAIN2");
      await seedEntitlement("PARRAIN2");
      await seedEntitlement("EXISTANT");
      await callReferralApplyCode("EXISTANT", p1.referralCode);
      assert.equal(await errorCode(callReferralApplyCode("EXISTANT", p2.referralCode)), "failed-precondition");
      const ent1 = await getEntitlement("PARRAIN1");
      const ent2 = await getEntitlement("PARRAIN2");
      assert.equal(ent1.referralActiveCount, 1);
      assert.equal(ent2.referralActiveCount || 0, 0);
    });
  });
});
