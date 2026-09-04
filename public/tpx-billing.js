/* ============================================================
   P1Planner — tpx-billing.js
   ============================================================
   Adaptation P1 du tpx-billing.js TypixClin. Source unique de vérité
   "Premium" côté frontend pour tableur.html : lit entitlements/{uid}
   (jamais écrit par le client — voir firestore.rules) et expose le
   statut réel d'accès en écriture.

   P1Planner n'a pas encore de projet Stripe propre (voir CLAUDE.md :
   "pas Stripe maintenant sauf besoin bloquant"). Ce fichier ne propose
   donc PAS de parcours de paiement — il donne juste le VRAI statut
   (essai / actif / lecture seule) à partir d'entitlements/{uid}, déjà
   créé côté serveur par la Cloud Function onUserCreated. Le paiement
   réel reste dans comptepremium.html, à construire plus tard.

   Contrat attendu par tableur.html (section "MODE PREMIUM — lecture
   seule") — ne pas renommer ces fonctions sans mettre à jour tableur.html :
     tpxBillingActive()        -> bool, false = aucune restriction (jamais
                                  le cas pour P1 : l'essai/Premium existe
                                  toujours, contrairement à une éventuelle
                                  phase "tout gratuit" chez TypixClin)
     tpxBillingSetUser(user)   -> démarre/arrête l'écoute entitlements
     tpxHasPremiumAccess(u)    -> bool, écriture actuellement autorisée
     tpxIsSubscribed(u)        -> bool, formule payante active (pas l'essai)
     tpxIsFixedPlan(u)         -> bool, paiement unique (pas un abonnement
                                  qui se renouvelle tout seul)
     tpxToDate(v)              -> Date | null, accepte Timestamp Firestore,
                                  ISO string ou Date
     tpxCreatedDate(u)         -> Date | null
     tpxIsLegacyAccount(u)     -> bool (toujours false : pas d'historique
                                  TypixClin à porter pour un compte P1)
     tpxTrialEnd(u)            -> Date | null (échéance affichée)
     tpxScheduleRecheck(date, cb) -> programme cb à `date`, avec
                                  troncature (setTimeout plafonne à
                                  ~24,8 jours)
   ============================================================ */
(function () {
  'use strict';

  /* P1 a toujours une notion d'essai/Premium — jamais de "tout gratuit,
     rien à vérifier" comme une éventuelle phase promo TypixClin. */
  window.tpxBillingActive = function () { return true; };

  window.tpxToDate = function (v) {
    if (!v) return null;
    try {
      if (typeof v.toDate === 'function') return v.toDate();               // Timestamp Firestore
      if (typeof v.seconds === 'number') return new Date(v.seconds * 1000); // {seconds,nanoseconds} brut
      if (v instanceof Date) return v;
      if (typeof v === 'string') { var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
    } catch (e) {}
    return null;
  };

  window.tpxCreatedDate = function (userInfo) {
    return window.tpxToDate(userInfo && userInfo.createdAt) || null;
  };

  // Pas de compte "hérité" possible pour P1 : isolation totale de TypixClin.
  window.tpxIsLegacyAccount = function () { return false; };

  window.tpxTrialEnd = function (userInfo) {
    if (!userInfo) return null;
    return window.tpxToDate(userInfo.trialEndsAt || userInfo.writeAccessUntil);
  };

  window.tpxIsSubscribed = function (userInfo) {
    return !!(userInfo && userInfo.status === 'active');
  };

  window.tpxIsFixedPlan = function (userInfo) {
    return !!(userInfo && userInfo.planType === 'onetime');
  };

  // La SEULE vraie source de vérité : writeAccessUntil, calculée et
  // écrite côté serveur (Cloud Functions / Admin SDK), jamais par le
  // client — voir firestore.rules, fonction canWrite().
  window.tpxHasPremiumAccess = function (userInfo) {
    var until = window.tpxToDate(userInfo && userInfo.writeAccessUntil);
    return !!(until && until.getTime() > Date.now());
  };

  // setTimeout plafonne à 2^31-1 ms (~24,8 jours) : au-delà, undefined
  // behavior selon les moteurs (déclenchement immédiat le plus souvent).
  // On tranche en attendant que l'échéance réelle soit assez proche.
  window.tpxScheduleRecheck = function (date, cb) {
    var MAX_DELAY = 2147000000;
    var target = (date instanceof Date) ? date.getTime() : date;
    var timerId = null;
    function tick() {
      var remaining = target - Date.now();
      if (remaining <= 0) { cb(); return; }
      timerId = setTimeout(remaining > MAX_DELAY ? tick : cb, Math.min(remaining, MAX_DELAY));
    }
    tick();
    return { clear: function () { if (timerId) clearTimeout(timerId); } };
  };

  var _unsub = null;

  /* Démarre l'écoute temps réel d'entitlements/{uid} pour l'utilisateur
     connecté. Le document passé à tpxApplyPremiumState (déjà défini dans
     tableur.html) est enrichi d'alias (subscriptionEndDate/subscriptionStatus)
     pour rester compatible avec la logique existante sans la réécrire. */
  window.tpxBillingSetUser = function (user) {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }

    if (!user) {
      if (window.tpxResetPremiumState) window.tpxResetPremiumState();
      return;
    }

    var db = window._fsDb, doc = window._fsDoc, onSnap = window._fsOnSnapshot;
    if (!db || !doc || !onSnap) {
      console.warn('[P1 billing] Pont Firestore indisponible (window._fsDb/_fsDoc/_fsOnSnapshot) — statut Premium inconnu.');
      if (window.tpxSetUnknownState) window.tpxSetUnknownState();
      return;
    }

    _unsub = onSnap(
      doc(db, 'entitlements', user.uid),
      function (snap) {
        var data = snap.exists() ? snap.data() : null;
        if (!data) {
          // Cloud Function onUserCreated pas encore passée (compte tout
          // juste créé) ou pas encore déployée : statut inconnu, jamais
          // fail-open — voir tpxSetUnknownState() dans tableur.html.
          if (window.tpxSetUnknownState) window.tpxSetUnknownState();
          return;
        }
        var normalized = Object.assign({}, data, {
          subscriptionEndDate: data.premiumUntil || data.writeAccessUntil,
          subscriptionStatus: data.status,
          cancelAtPeriodEnd: !!data.cancelAtPeriodEnd
        });
        if (window.tpxApplyPremiumState) window.tpxApplyPremiumState(normalized);
      },
      function (err) {
        console.warn('[P1 billing] Lecture entitlements impossible :', err);
        if (window.tpxSetUnknownState) window.tpxSetUnknownState();
      }
    );
  };
})();
