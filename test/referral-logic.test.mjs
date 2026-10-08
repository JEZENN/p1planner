/* ============================================================
   P1PLANNER — Tests logique pure du parrainage (functions/referral.js)
   ============================================================
   Aucun émulateur nécessaire : pure logique (alphabet, paliers, calcul).
   ============================================================ */
import assert from "node:assert/strict";
import {
  REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH, REFERRAL_TIERS, REFERRAL_MONTH_MS,
  generateReferralCode, normalizeReferralCode,
  monthsEarnedForCount, isRecurringPremiumType, computeReferralCredit, sanitizeReferralName
} from "../functions/referral.js";

describe("referral.js — logique pure", () => {
  it("generateReferralCode() : longueur 6, alphabet sans caractères ambigus", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      assert.equal(code.length, REFERRAL_CODE_LENGTH);
      for (const ch of code) assert.ok(REFERRAL_CODE_ALPHABET.includes(ch), `caractère hors alphabet : ${ch}`);
      assert.ok(!/[01OI]/.test(code), `caractère ambigu généré : ${code}`);
    }
  });

  it("normalizeReferralCode() : normalise espaces/minuscules, rejette longueur/caractères invalides", () => {
    assert.equal(normalizeReferralCode("  ab23de  "), "AB23DE");
    assert.equal(normalizeReferralCode("AB23DE"), "AB23DE");
    assert.equal(normalizeReferralCode("AB23D"), null); // trop court
    assert.equal(normalizeReferralCode("AB23DEF"), null); // trop long
    assert.equal(normalizeReferralCode("AB23D0"), null); // '0' hors alphabet
    assert.equal(normalizeReferralCode("AB23D1"), null); // '1' hors alphabet
    assert.equal(normalizeReferralCode("AB23DO"), null); // 'O' hors alphabet
    assert.equal(normalizeReferralCode("AB23DI"), null); // 'I' hors alphabet
    assert.equal(normalizeReferralCode(null), null);
    assert.equal(normalizeReferralCode(42), null);
    assert.equal(normalizeReferralCode(""), null);
  });

  it("monthsEarnedForCount() : paliers cumulatifs et plafonnés (grille validée)", () => {
    assert.equal(monthsEarnedForCount(0), 0);
    assert.equal(monthsEarnedForCount(1), 0);
    assert.equal(monthsEarnedForCount(2), 0);
    assert.equal(monthsEarnedForCount(3), 1); // 1er palier
    assert.equal(monthsEarnedForCount(4), 1);
    assert.equal(monthsEarnedForCount(5), 1);
    assert.equal(monthsEarnedForCount(6), 3); // 2e palier (plafond)
    assert.equal(monthsEarnedForCount(7), 3); // au-delà du plafond : jamais plus
    assert.equal(monthsEarnedForCount(10), 3);
    assert.equal(monthsEarnedForCount(1000), 3);
  });

  it("monthsEarnedForCount() : entrées non valides traitées comme 0", () => {
    assert.equal(monthsEarnedForCount(-5), 0);
    assert.equal(monthsEarnedForCount(NaN), 0);
    assert.equal(monthsEarnedForCount(undefined), 0);
    assert.equal(monthsEarnedForCount(2.9), 0); // tronqué à 2, sous le 1er palier
    assert.equal(monthsEarnedForCount(3.9), 1); // tronqué à 3, atteint le 1er palier
  });

  it("REFERRAL_TIERS reste trié par seuil décroissant (contrat requis par monthsEarnedForCount)", () => {
    for (let i = 1; i < REFERRAL_TIERS.length; i++) {
      assert.ok(REFERRAL_TIERS[i - 1].threshold > REFERRAL_TIERS[i].threshold, "REFERRAL_TIERS doit être trié par seuil décroissant");
    }
  });

  it("isRecurringPremiumType() : uniquement 'monthly' côté P1Planner (pas de formule 'annual')", () => {
    assert.equal(isRecurringPremiumType("monthly"), true);
    assert.equal(isRecurringPremiumType("onetime"), false);
    assert.equal(isRecurringPremiumType("annual"), false);
    assert.equal(isRecurringPremiumType(null), false);
    assert.equal(isRecurringPremiumType(undefined), false);
  });
});

describe("computeReferralCredit() — décision de crédit du parrain (sans Firestore)", () => {
  const NOW = Date.parse("2026-09-25T00:00:00Z");
  const base = { referralActiveCount: 0, referralMonthsGranted: 0, status: "trial", planType: null, premiumUntilMs: 0, writeAccessUntilMs: 0, trialEndsAtMs: 0, hasExploitableSubscription: false, nowMs: NOW };

  it("1er et 2e filleul (< 3) : compteur avance, AUCUN bonus (sous le 1er palier)", () => {
    let r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 0 }));
    assert.equal(r.newCount, 1); assert.equal(r.delta, 0); assert.deepEqual(r.patch, {}); assert.equal(r.useStripe, false);
    r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 1 }));
    assert.equal(r.newCount, 2); assert.equal(r.delta, 0); assert.deepEqual(r.patch, {});
  });

  it("3e filleul, parrain en ESSAI : prolonge writeAccessUntil ET trialEndsAt ensemble, jamais premiumUntil, statut reste 'trial'", () => {
    const trialEnd = NOW + 5 * 86400000; // essai encore actif, finit dans 5 jours
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 2, status: "trial", trialEndsAtMs: trialEnd, writeAccessUntilMs: trialEnd }));
    assert.equal(r.newCount, 3); assert.equal(r.delta, 1);
    assert.equal(r.patch.writeAccessUntilMs, trialEnd + REFERRAL_MONTH_MS);
    assert.equal(r.patch.trialEndsAtMs, trialEnd + REFERRAL_MONTH_MS);
    assert.equal(r.patch.premiumUntilMs, undefined, "premiumUntil ne doit jamais être posé pour un essai — la personne n'a rien payé");
    assert.equal(r.patch.status, undefined, "le statut ne doit pas changer pour un essai déjà 'trial'");
  });

  it("3e filleul, essai déjà expiré au moment du crédit : base = maintenant, pas l'ancienne date passée", () => {
    const trialEnd = NOW - 10 * 86400000; // essai déjà fini depuis 10 jours
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 2, status: "trial", trialEndsAtMs: trialEnd }));
    assert.equal(r.patch.writeAccessUntilMs, NOW + REFERRAL_MONTH_MS);
    assert.equal(r.patch.trialEndsAtMs, NOW + REFERRAL_MONTH_MS);
  });

  it("3e filleul, parrain FORMULE PAYÉE active (onetime) : prolonge writeAccessUntil ET premiumUntil ensemble, statut inchangé", () => {
    const end = NOW + 40 * 86400000;
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 2, status: "active", planType: "onetime", premiumUntilMs: end, writeAccessUntilMs: end }));
    assert.equal(r.delta, 1);
    assert.equal(r.patch.premiumUntilMs, end + REFERRAL_MONTH_MS);
    assert.equal(r.patch.writeAccessUntilMs, end + REFERRAL_MONTH_MS);
    assert.equal(r.patch.status, undefined);
  });

  it("3e filleul, parrain EXPIRÉ (plus aucun accès en cours) : bonus autonome à partir de MAINTENANT, statut redevient 'active'", () => {
    const pastEnd = NOW - 60 * 86400000;
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 2, status: "expired", planType: "onetime", premiumUntilMs: pastEnd, writeAccessUntilMs: pastEnd }));
    assert.equal(r.patch.premiumUntilMs, NOW + REFERRAL_MONTH_MS);
    assert.equal(r.patch.writeAccessUntilMs, NOW + REFERRAL_MONTH_MS);
    assert.equal(r.patch.status, "active");
  });

  it("3e filleul, parrain avec abonnement Stripe RÉCURRENT actif et exploitable : useStripe=true, AUCUNE date touchée ici", () => {
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 2, status: "active", planType: "monthly", hasExploitableSubscription: true }));
    assert.equal(r.useStripe, true);
    assert.deepEqual(r.patch, {}, "aucune date ne doit être écrite ici pour le cas Stripe — le webhook écraserait tout au prochain renouvellement");
  });

  it("mensuel actif MAIS sans souscription Stripe exploitable (ex. résilié) : traité comme une formule payée classique (extension directe)", () => {
    const end = NOW + 10 * 86400000;
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 2, status: "active", planType: "monthly", hasExploitableSubscription: false, premiumUntilMs: end, writeAccessUntilMs: end }));
    assert.equal(r.useStripe, false);
    assert.equal(r.patch.premiumUntilMs, end + REFERRAL_MONTH_MS);
  });

  it("6e filleul : 2e palier (plafond), delta = +2 (3 cumulés - 1 déjà accordé)", () => {
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 5, referralMonthsGranted: 1, status: "trial", trialEndsAtMs: NOW, writeAccessUntilMs: NOW }));
    assert.equal(r.newCount, 6); assert.equal(r.newEarned, 3); assert.equal(r.delta, 2);
    assert.equal(r.patch.writeAccessUntilMs, NOW + 2 * REFERRAL_MONTH_MS);
  });

  it("7e filleul et au-delà : PLAFOND — delta toujours 0, jamais de nouveau bonus", () => {
    let r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 6, referralMonthsGranted: 3, status: "trial" }));
    assert.equal(r.delta, 0); assert.deepEqual(r.patch, {});
    r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 99, referralMonthsGranted: 3, status: "trial" }));
    assert.equal(r.delta, 0); assert.deepEqual(r.patch, {});
  });

  it("A6 : mensuel actif résilié (cancelAtPeriodEnd) -> aucune date, manualCatchUp 'subscription_cancelling', jamais de branche Stripe", () => {
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 2, status: "active", planType: "monthly", hasExploitableSubscription: true, cancelAtPeriodEnd: true }));
    assert.equal(r.useStripe, false); assert.deepEqual(r.patch, {}); assert.equal(r.manualCatchUp, "subscription_cancelling");
  });
  it("A6 : impayé (payment_issue) -> aucune date, manualCatchUp 'payment_issue'", () => {
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 2, status: "payment_issue", planType: "monthly", hasExploitableSubscription: true }));
    assert.equal(r.useStripe, false); assert.deepEqual(r.patch, {}); assert.equal(r.manualCatchUp, "payment_issue");
  });
  it("A7 : parrain expiré -> planType neutre 'referral' (balayé à la fin du bonus)", () => {
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 2, status: "expired", planType: "monthly" }));
    assert.equal(r.patch.planType, "referral"); assert.equal(r.patch.status, "active");
  });
  it("aucun bonus dû : jamais de manualCatchUp", () => {
    const r = computeReferralCredit(Object.assign({}, base, { referralActiveCount: 0, status: "active", planType: "monthly", cancelAtPeriodEnd: true }));
    assert.equal(r.manualCatchUp, null);
  });
  it("A9 : sanitizeReferralName — balises, contrôle, espaces, 60 car., vide -> null", () => {
    assert.equal(sanitizeReferralName("  A<b>l" + String.fromCharCode(0) + "ice" + String.fromCharCode(10) + "  Dupont  "), "Abl ice Dupont");
    assert.equal(sanitizeReferralName("<>"), null);
    assert.equal(sanitizeReferralName(null), null);
    assert.equal(sanitizeReferralName("x".repeat(100)).length, 60);
  });
});
