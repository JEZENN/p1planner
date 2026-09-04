/* ═══════════════════════════════════════════════════════════════════════
   P1-BILLING — source unique du barème Premium côté frontend
   ───────────────────────────────────────────────────────────────────────
   À charger dans le <head> (ou avant le script principal) de toute page
   qui affiche un prix ou une durée Premium : index.html, comptepremium.html.

       <script src="p1-billing.js"></script>

   Équivalent P1Planner du tpx-billing.js de TypixClin (fourni par
   l'utilisateur comme référence), avec une différence structurelle
   majeure : P1Planner n'a PAS 5 formules fixes nommées, mais UNE formule
   paiement-unique à durée LIBREMENT choisie (1 à maxMonths mois). Voir
   functions/premiumPlans.js pour le détail — CE fichier-ci doit rester
   NUMÉRIQUEMENT IDENTIQUE à functions/premiumPlans.js (mêmes barèmes,
   même arithmétique de dates) : toute modification se fait aux DEUX
   endroits, sous peine d'afficher un prix différent de celui réellement
   facturé par Stripe.

   Tout ce que ce fichier calcule est INDICATIF (affichage/simulateur) :
   le serveur (Cloud Functions) recalcule tout indépendamment et ne fait
   jamais confiance à une valeur transmise par le navigateur.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  window.P1_BILLING = {
    TRIAL_DAYS: 15,

    // Barème dégressif du paiement unique, appliqué au nombre de mois
    // ACHETÉS (pas restants). Triés par minMonths décroissant.
    ONE_TIME_RATE_TIERS: [
      { minMonths: 5, ratePerMonth: 2.25 },
      { minMonths: 2, ratePerMonth: 2.50 },
      { minMonths: 1, ratePerMonth: 3.00 }
    ],

    MONTHLY_RATE_EUROS: 3.00,
    MAX_MONTHS_CAP: 36
  };

  window.p1RatePerMonthForOneTime = function (months) {
    var tiers = window.P1_BILLING.ONE_TIME_RATE_TIERS;
    for (var i = 0; i < tiers.length; i++) {
      if (months >= tiers[i].minMonths) return tiers[i].ratePerMonth;
    }
    return tiers[tiers.length - 1].ratePerMonth;
  };

  // Estimation d'affichage uniquement — le montant réel est toujours
  // recalculé et confirmé par le serveur au moment du paiement.
  window.p1ComputeOneTimePrice = function (months) {
    if (!Number.isInteger(months) || months < 1 || months > window.P1_BILLING.MAX_MONTHS_CAP) return null;
    var rate = window.p1RatePerMonthForOneTime(months);
    var total = Math.round(months * rate * 100) / 100;
    return { months: months, ratePerMonth: rate, totalEuros: total };
  };

  // Fin du Nᵉ mois calendaire à partir de `now` (le mois en cours compte
  // comme le mois n°1) — même convention que functions/premiumPlans.js.
  window.p1EndOfMonthsFromNow = function (now, n) {
    return new Date(now.getFullYear(), now.getMonth() + n, 0, 23, 59, 59, 999);
  };

  // Durée maximale utile indicative depuis une date de concours/examens —
  // la valeur qui compte réellement vient de la Cloud Function
  // `saveExamDate` (jamais calculée uniquement côté client).
  window.p1ComputeMaxMonthsFromExamDate = function (examDate, now) {
    var endOfExamMonth = new Date(examDate.getFullYear(), examDate.getMonth() + 1, 0);
    var months = (endOfExamMonth.getFullYear() - now.getFullYear()) * 12
      + (endOfExamMonth.getMonth() - now.getMonth());
    months = Math.max(1, Math.min(months + 1, window.P1_BILLING.MAX_MONTHS_CAP));
    return months;
  };

  // Convertit iso/Date/Timestamp Firestore ({seconds,...} ou avec
  // .toDate()) en Date JS valide, ou null. Utilisé partout où une date
  // Premium (trialEndsAt, premiumUntil...) doit être affichée sans risque
  // du bug "Invalid Date" observé avec un Timestamp Firestore brut.
  window.p1ToDate = function (value) {
    if (!value) return null;
    var d;
    if (value instanceof Date) { d = value; }
    else if (typeof value === "object" && typeof value.toDate === "function") { d = value.toDate(); }
    else if (typeof value === "object" && typeof value.seconds === "number") { d = new Date(value.seconds * 1000); }
    else { d = new Date(value); }
    return isNaN(d.getTime()) ? null : d;
  };
})();
