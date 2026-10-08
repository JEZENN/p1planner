/* Tests purs (sans émulateur) de la logique d'accès/paiement —
   functions/premiumPlans.js. Exécution : npx mocha test/premium-plans.test.mjs */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../functions/premiumPlans.js");

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);
const ts = (ms) => ({ toMillis: () => ms }); // imite un Timestamp Firestore

describe("computeSubscriptionAccess", () => {
  it("active : accès jusqu'à la fin de période", () => {
    const r = P.computeSubscriptionAccess({ status: "active", periodEndMs: NOW + 20 * DAY }, {}, NOW);
    assert.equal(r.status, "active");
    assert.equal(r.writeAccessMs, NOW + 20 * DAY);
    assert.equal(r.graceUntilMs, null);
  });

  it("trialing (essai Stripe) : accès jusqu'à la fin d'essai", () => {
    const r = P.computeSubscriptionAccess({ status: "trialing", periodEndMs: NOW + 5 * DAY }, {}, NOW);
    assert.equal(r.status, "active");
    assert.equal(r.writeAccessMs, NOW + 5 * DAY);
  });

  it("past_due : AUCUNE prolongation d'un mois, grâce de 3 jours seulement", () => {
    const current = { writeAccessUntil: ts(NOW - 1 * DAY), premiumUntil: ts(NOW - 1 * DAY) };
    // Stripe a déjà avancé la période d'un mois — ne doit PAS être utilisé.
    const r = P.computeSubscriptionAccess({ status: "past_due", periodEndMs: NOW + 30 * DAY }, current, NOW);
    assert.equal(r.status, "payment_issue");
    assert.equal(r.writeAccessMs, NOW + P.PAYMENT_ISSUE_GRACE_MS);
    assert.ok(r.writeAccessMs < NOW + 4 * DAY, "jamais un mois offert");
    assert.equal(r.premiumUntilMs, NOW - 1 * DAY, "premiumUntil non prolongé");
  });

  it("past_due répété : la grâce n'est posée qu'UNE fois (pas de glissement)", () => {
    const grace = NOW + 1 * DAY;
    const current = { writeAccessUntil: ts(grace), paymentIssueGraceUntil: ts(grace), premiumUntil: ts(NOW - DAY) };
    const r = P.computeSubscriptionAccess({ status: "unpaid", periodEndMs: NOW + 30 * DAY }, current, NOW + 2 * DAY);
    assert.equal(r.graceUntilMs, grace);
    assert.equal(r.writeAccessMs, grace);
  });

  it("incomplete : garde l'accès déjà acquis (essai) sans l'étendre", () => {
    const current = { writeAccessUntil: ts(NOW + 2 * DAY) };
    const r = P.computeSubscriptionAccess({ status: "incomplete", periodEndMs: NOW + 30 * DAY }, current, NOW);
    assert.equal(r.status, "payment_issue");
    assert.equal(r.writeAccessMs, NOW + 2 * DAY);
  });

  it("canceled immédiat : accès coupé à ended_at, pas à l'ancienne fin de période", () => {
    const r = P.computeSubscriptionAccess(
      { status: "canceled", periodEndMs: NOW + 20 * DAY, endedAtMs: NOW - 1000 }, {}, NOW);
    assert.equal(r.status, "expired");
    assert.equal(r.writeAccessMs, NOW - 1000);
  });

  it("canceled en fin de période : accès = fin de période (inchangé)", () => {
    const end = NOW - 1000;
    const r = P.computeSubscriptionAccess({ status: "canceled", periodEndMs: end, endedAtMs: end }, {}, NOW);
    assert.equal(r.writeAccessMs, end);
  });

  it("canceled pendant l'essai gratuit : le reliquat d'essai est conservé", () => {
    const current = { trialEndsAt: ts(NOW + 6 * DAY) };
    const r = P.computeSubscriptionAccess({ status: "canceled", periodEndMs: NOW + 6 * DAY, endedAtMs: NOW }, current, NOW);
    assert.equal(r.writeAccessMs, NOW + 6 * DAY);
  });

  it("incomplete_expired sans ended_at : jamais d'accès futur", () => {
    const r = P.computeSubscriptionAccess({ status: "incomplete_expired", periodEndMs: NOW + 30 * DAY }, {}, NOW);
    assert.equal(r.status, "expired");
    assert.ok(r.writeAccessMs <= NOW);
  });
});

describe("checkPurchaseConflict", () => {
  const activeOneTime = { planType: "onetime", status: "active", premiumUntil: ts(Date.now() + 30 * DAY) };
  const activeMonthly = { planType: "monthly", status: "active", cancelAtPeriodEnd: false };

  it("paiement unique refusé pendant un accès unique encore valide (payer sans bénéfice)", () => {
    assert.match(P.checkPurchaseConflict(activeOneTime, "onetime"), /accès valide jusqu'au/);
  });
  it("paiement unique refusé pendant un abonnement mensuel actif", () => {
    assert.ok(P.checkPurchaseConflict(activeMonthly, "onetime"));
  });
  it("paiement unique autorisé si le mensuel est déjà résilié", () => {
    assert.equal(P.checkPurchaseConflict({ ...activeMonthly, cancelAtPeriodEnd: true }, "onetime"), null);
  });
  it("paiement unique autorisé après expiration d'un précédent accès unique", () => {
    const expired = { planType: "onetime", status: "active", premiumUntil: ts(Date.now() - DAY) };
    assert.equal(P.checkPurchaseConflict(expired, "onetime"), null);
  });
  it("mensuel refusé pendant un accès unique valide", () => {
    assert.ok(P.checkPurchaseConflict(activeOneTime, "monthly"));
  });
  it("essai gratuit : tout est autorisé", () => {
    assert.equal(P.checkPurchaseConflict({ status: "trial" }, "onetime"), null);
    assert.equal(P.checkPurchaseConflict({ status: "trial" }, "monthly"), null);
  });
});

describe("prix et dates du paiement unique (serveur = seule autorité)", () => {
  it("barème 3,00 / 2,50 / 2,25 €", () => {
    assert.equal(P.computeOneTimePriceCents(1).unitAmountCents, 300);
    assert.equal(P.computeOneTimePriceCents(2).unitAmountCents, 500);
    assert.equal(P.computeOneTimePriceCents(4).unitAmountCents, 1000);
    assert.equal(P.computeOneTimePriceCents(5).unitAmountCents, 1125);
    assert.equal(P.computeOneTimePriceCents(12).unitAmountCents, 2700);
  });
  it("durées invalides refusées (0, négatif, décimal, > 36)", () => {
    [0, -1, 1.5, 37, NaN, "3"].forEach((m) => assert.equal(P.computeOneTimePriceCents(m), null));
  });
  it("fin du 3e mois depuis septembre = 30 novembre 23:59:59.999 UTC", () => {
    const end = P.computeOneTimeAccessEnd(new Date(Date.UTC(2026, 8, 20)), 3);
    assert.equal(end.toISOString(), "2026-11-30T23:59:59.999Z");
  });
  it("durée max plafonnée à 36 mois", () => {
    const m = P.computeMaxMonthsFromExamDate(new Date(Date.UTC(2035, 5, 1)), new Date(Date.UTC(2026, 8, 20)));
    assert.equal(m, 36);
  });
});
