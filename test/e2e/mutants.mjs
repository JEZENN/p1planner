/* Contrôles de sensibilité : chaque mutant retire UN correctif ; les scénarios visés doivent ÉCHOUER.
   Usage : node test/e2e/mutants.mjs   (lance referral-ui.mjs sur des copies mutantes de public/) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ONLY = process.argv[2]; // ex. « X » : ne rejouer que les mutants dont l'id commence par ce préfixe
const MUTANTS = [
  { id: "X1 sans le correctif 1 (placeholders ≤ 480)", file: "tableur.html", script: "layout-tours.mjs", scen: ["L1"], from: "    .tour-duration.ti-placeholder { font-size: 0.5rem; }\n    .tour-support.ti-placeholder { font-size: 0.5rem; padding: 0px 3px; }\n", to: "" },
  { id: "X2 cases rétrécies ≤ 768 restaurées", file: "tableur.html", script: "layout-tours.mjs", scen: ["L2"], from: "    /* Cases de tour / dates : taille naturelle (comme le bureau)", to: "    .tour-badge { width: 28px; height: 26px; font-size: 0.6rem; }\n    /* Cases de tour / dates : taille naturelle (comme le bureau)" },
  { id: "X3 tableau comprimé 900-1100 restauré", file: "tableur.html", script: "layout-tours.mjs", scen: ["L2"], from: "    /* Règles de rétrécissement supprimées", to: "    .tour-badge { width: 19px; height: 17px; font-size: 0.52rem; border-width: 1px; }\n    /* Règles de rétrécissement supprimées" },
  { id: "M1 blocage strict supprimé", file: "auth.html", scen: ["R1", "R2"], from: "if (verdict === false) {", to: "if (verdict === false && false) {" },
  { id: "M2 double-clic non gardé", file: "auth.html", scen: ["R3"], from: "    if (signupInFlight) return; // double clic / Entrée répétée : une seule inscription\n    signupInFlight = true;\n", to: "" , also: [["    setLoading(btn, true);            // désactivé AVANT le premier await\n", ""]] },
  { id: "M3 connexion attend le parrainage", file: "auth.html", scen: ["R6"], from: "window.setTimeout(function () { window.location.href = getRedirectTarget(); }, 1500);", to: "void 0;", also: [["httpsCallable(functionsInstance, \"referralMarkActive\")().catch(function (err) {", "httpsCallable(functionsInstance, \"referralMarkActive\")().finally(function () { window.location.href = getRedirectTarget(); }).catch(function (err) {"]] },
  { id: "M4 échec réseau du contrôle bloquant", file: "auth.html", scen: ["R4"], from: ".catch(function () { return null; });", to: ".catch(function () { return false; });" },
  { id: "M6 pastille éteinte par l'écrivain des avis", file: "tableur.html", scen: ["T1"], from: "avatarDot.classList.toggle('show', hasFriends || count > 0 || window._p1ReferralUnseen === true);", to: "avatarDot.classList.toggle('show', hasFriends || count > 0);" },
  { id: "M7 code récupéré jamais à l'ouverture du menu", file: "tableur.html", scen: ["T2"], from: "if (dd && dd.classList.contains('active')) ensureCodeOnMenuOpen();", to: "" },
  { id: "M5 mémoire locale non écrite avant l'annonce", file: "comptepremium.html", scen: ["N1", "N2"], from: "writeLocalSeen(active); // AVANT d'afficher", to: "" },
  // ── Audit sauvegardes/pertes de données (2026-09-30, demande explicite de Jean) ──
  { id: "D9a runTransaction non comptée dans _p1UnconfirmedWrites", file: "tableur.html", script: "data-durability.mjs", scen: ["D9a"],
    from: "window._fsRunTransaction = function () { return _p1CountWrite(runTransaction, null, arguments); };",
    to: "window._fsRunTransaction = runTransaction;" },
  { id: "D9b updateDoc brut non compté dans _p1UnconfirmedWrites", file: "tableur.html", script: "data-durability.mjs", scen: ["D9b"],
    from: "window._fsUpdateDoc = function () { return _p1CountWrite(updateDoc, null, arguments); };",
    to: "window._fsUpdateDoc = updateDoc;" },
  { id: "D6 restoreEpoch jamais comparé à pageLoadedAt (rechargement jamais déclenché)", file: "tableur.html", script: "data-durability.mjs", scen: ["D6"],
    from: "if (_epochMs !== null && _epochMs > (window._p1PageLoadedAt || 0) && !window._p1RestoreEpochReloading) {",
    to: "if (false) {" },
  { id: "D8 file locale de tours jamais posée avant la tentative réseau", file: "tableur.html", script: "data-durability.mjs", scen: ["D8"],
    from: "if (uid && sId !== null) _p1TourQueuePut(uid, { courseId: fc, tourIndex: tourIndex, patchArrays: patchArrays, queuedAt: Date.now() });",
    to: "if (false) {}" },
  { id: "D10 deletedDefaultIds jamais persisté sur Firestore", file: "tableur.html", script: "data-durability.mjs", scen: ["D10"],
    from: "      window.userData.deletedDefaultIds.push(deletedId);\n      // D10 : persistance réelle (users/{uid}/settings/preferences), voir p1SaveDeletedDefaultIds\n      // — sans ça, cette suppression ne survivait qu'en mémoire + un blob localStorage jamais\n      // réellement resynchronisé (saveUserData() est un no-op), et l'entraînement par défaut\n      // supprimé pouvait réapparaître (autre appareil, nettoyage du navigateur, etc.).\n      if (typeof window.p1SaveDeletedDefaultIds === 'function') window.p1SaveDeletedDefaultIds(window.userData.deletedDefaultIds);",
    to: "      window.userData.deletedDefaultIds.push(deletedId);" },
  { id: "D11 showCustomAlert n'accepte plus qu'un objet", file: "tableur.html", script: "data-durability.mjs", scen: ["D11"],
    from: "function showCustomAlert(a, b, c) {\n    var options;\n    if (a && typeof a === 'object') {\n        options = a; // forme historique, déjà correcte : showCustomAlert({title, message, type, ...})\n    } else if (typeof a === 'string' && typeof b === 'string' && c !== undefined) {\n        options = { title: a, message: b, type: c }; // showCustomAlert(titre, message, type)\n    } else if (typeof a === 'string') {\n        options = { message: a, type: (typeof b === 'string' ? b : 'error') }; // showCustomAlert(message[, type]) — toujours une erreur en pratique\n    } else {\n        options = a || {};\n    }\n    return new Promise((resolve) => {",
    to: "function showCustomAlert(options) {\n    return new Promise((resolve) => {" },
  { id: "D12 recherche reverrouillée sans jamais pouvoir se redéverrouiller (bfcache)", file: "tableur.html", script: "data-durability.mjs", scen: ["D12"],
    from: "    function unlockSearch() {\n        input.readOnly = false;\n        if (input.value) {\n            input.value = '';\n            // Le champ peut avoir un écouteur 'input' dépendant de sa valeur (ex. bouton d'effacement,\n            // voir plus haut) : une remise à vide programmatique ne déclenche pas cet évènement toute\n            // seule, contrairement à une saisie utilisateur — il faut l'émettre explicitement.\n            input.dispatchEvent(new Event('input', { bubbles: true }));\n        }\n    }\n\n    function armUnlock() {\n        input.addEventListener('pointerdown', unlockSearch, { once: true });\n        input.addEventListener('keydown', unlockSearch, { once: true });\n    }\n\n    function lockAndClear() {\n        input.readOnly = true;\n        clearBadAutofill();\n        setTimeout(clearBadAutofill, 50);\n        setTimeout(clearBadAutofill, 250);\n        setTimeout(clearBadAutofill, 800);\n        armUnlock();\n    }\n\n    lockAndClear();\n\n    window.addEventListener('pageshow', function (e) {\n        if (e.persisted) lockAndClear();\n    });\n}",
    to: "    clearBadAutofill();\n    setTimeout(clearBadAutofill, 50);\n    setTimeout(clearBadAutofill, 250);\n    setTimeout(clearBadAutofill, 800);\n\n    window.addEventListener('pageshow', function () {\n        input.readOnly = true;\n        input.value = '';\n\n        setTimeout(clearBadAutofill, 50);\n        setTimeout(clearBadAutofill, 250);\n        setTimeout(clearBadAutofill, 800);\n    });\n\n    function unlockSearch() {\n        input.readOnly = false;\n        input.value = '';\n    }\n\n    input.addEventListener('pointerdown', unlockSearch, { once: true });\n\n    input.addEventListener('keydown', function () {\n        if (input.readOnly) {\n            input.readOnly = false;\n            input.value = '';\n        }\n    }, { once: true });\n}" },
  // ── Audit « listes/tours/iPad/banque » (2026-10-02, comparaison au modèle EDN) ──
  { id: "C1 maxTours() compact redevient Math.max(stocké, réglage)", file: "tableur.html", script: "tours-lock.mjs", scen: ["TL9", "TL11"],
    from: "  function maxTours(d) {\n    return (typeof window.tpxMaxToursAllowed === 'function') ? window.tpxMaxToursAllowed() : 8;\n  }",
    to: "  function maxTours(d) {\n    var real = (d && d.tours) ? d.tours.length : 8;\n    var allowed = (typeof window.tpxMaxToursAllowed === 'function') ? window.tpxMaxToursAllowed() : 8;\n    return Math.max(real, allowed);\n  }" },
  { id: "C2 verrou de retour à 8 tours supprimé", file: "tableur.html", script: "tours-lock.mjs", scen: ["TL1"],
    from: "        if (!want && typeof window._p1ExtendedToursLockCount === 'function' && window._p1ExtendedToursLockCount() > 0) {\n          etSw.classList.remove('shake'); void etSw.offsetWidth; etSw.classList.add('shake');\n          return;\n        }\n",
    to: "" },
  { id: "A1 fusion des catalogues redevient un écrasement (ignore la valeur serveur)", file: "tableur.html", script: "catalog-safety.mjs", scen: ["CAT1"],
    from: "        await runTx(dbF, async function (tx) {\n            var snap = await tx.get(ref);\n            var serverVal = snap.exists() ? snap.data()[field] : null;\n            merged = mergeFn(serverVal, list);\n            var patch = {}; patch[field] = merged;\n            tx.set(ref, patch, { merge: true });\n        });",
    to: "        await runTx(dbF, async function (tx) {\n            await tx.get(ref);\n            merged = list;\n            var patch = {}; patch[field] = merged;\n            tx.set(ref, patch, { merge: true });\n        });" },
  { id: "A3 garde _p1CatalogCanEdit supprimée de l'ouverture du gestionnaire", file: "tableur.html", script: "catalog-safety.mjs", scen: ["CAT3"],
    from: "window._p1OpenCatalogModal = function (kind) {\n    if (!_p1CatalogCanEdit()) return; // A3/A5 : chargement en cours / hors ligne / lecture seule premium\n",
    to: "window._p1OpenCatalogModal = function (kind) {\n" },
  { id: "A4 échec d'écriture jamais vérifié (res.ok ignoré à l'ajout)", file: "tableur.html", script: "catalog-safety.mjs", scen: ["CAT4"],
    from: "    var res = await cfg.save(cfg.getFull());\n    if (!res.ok) { _p1CatalogRevertAndShowError(previousFull, res.msg); return; }\n    _p1CatalogCommit(res.merged);\n    _p1CatalogRenderList();\n    // Confirmation visuelle",
    to: "    await cfg.save(cfg.getFull());\n    // Confirmation visuelle" },
  { id: "B1 Entrée dans le champ d'ajout ne fait plus que quitter le champ", file: "tableur.html", script: "catalog-keyboard.mjs", scen: ["KB1"],
    from: "    var isAddField = (e.target.id === 'p1-catalog-new-label' || e.target.id === 'p1-catalog-new-abbr');\n    e.target.blur();\n    if (isAddField) window._p1CatalogAdd();\n};",
    to: "    e.target.blur();\n};" },
  { id: "B3 vérification de doublon supprimée (ajout direct sans contrôle)", file: "tableur.html", script: "catalog-keyboard.mjs", scen: ["KB5"],
    from: "    var foldedNew = p1FoldCatalogLabel(clean.label);\n    if (active.some(function (e) { return p1FoldCatalogLabel(e.label) === foldedNew; })) {\n        _p1CatalogShowAddError('Ce nom existe déjà dans la liste.');\n        labelInput.focus();\n        return;\n    }\n    _p1CatalogHideAddError();\n",
    to: "" },
  { id: "B4 carte Listes personnalisables retirée des Paramètres", file: "tableur.html", script: "catalog-keyboard.mjs", scen: ["KB7"],
    from: "'<div class=\"settings-card\" data-setting=\"p1-catalogs\">' +",
    to: "'<div class=\"settings-card\" data-setting=\"p1-catalogs-removed\">' +" },
  { id: "AUDITX1 saveUserSettings redevient une écriture sur users/{uid} (backend-only)", file: "tableur.html", script: "settings-persist.mjs", scen: ["X1"],
    from: "    var ref = doc(db, 'users', currentUser.uid, 'settings', 'preferences');",
    to: "    var ref = doc(db, 'users', currentUser.uid);" },
  { id: "I1 règle iPad (pointer:coarse) retirée", file: "tableur.html", script: "ipad-img-bar.mjs", scen: ["IB1", "IB1B"],
    from: "@media (pointer: coarse) and (min-width: 769px) {\n    .notes-img-ctrl-panel {\n        max-width: calc(100% - 24px);\n        gap: 6px;\n    }\n    .notes-img-ctrl-panel .img-popup-btn {\n        min-width: 44px;\n        min-height: 44px;\n        font-size: 0.95rem;\n    }",
    to: "@media (pointer: coarse) and (min-width: 9999px) {\n    .notes-img-ctrl-panel {\n        max-width: calc(100% - 24px);\n        gap: 6px;\n    }\n    .notes-img-ctrl-panel .img-popup-btn {\n        min-width: 44px;\n        min-height: 44px;\n        font-size: 0.95rem;\n    }" },
  { id: "I1 _notesImgBarFit ne pose plus jamais is-tight", file: "tableur.html", script: "ipad-img-bar.mjs", scen: ["IBTIGHT"],
    from: "    if (popup.scrollWidth > available) popup.classList.add('is-tight');",
    to: "    if (false) popup.classList.add('is-tight');" },
  { id: "E1 déduplication de la banque de matières supprimée", file: "tableur.html", script: "subject-bank.mjs", scen: ["SB3"],
    from: "function p1BankIsDuplicate(bankItem, activeSpecialties) {\n    var bFull = p1BankFold(bankItem.name), bBare = p1BankStripUePrefix(bFull);\n    return (activeSpecialties || []).some(function (s) {\n        var f = p1BankFold(s.name);\n        return f === bFull || f === bBare || p1BankStripUePrefix(f) === bBare;\n    });\n}",
    to: "function p1BankIsDuplicate(bankItem, activeSpecialties) { return false; }" },
  { id: "E2 verrou de réentrance de la banque de matières supprimé", file: "tableur.html", script: "subject-bank.mjs", scen: ["SB2"],
    from: "window._p1MaybeApplySubjectBank = async function () {\n    if (!p1BankHasPending() || _p1BankApplying) return;\n    _p1BankApplying = true;\n    var res;\n    try { res = await p1ApplySubjectBank(); } finally { _p1BankApplying = false; }",
    to: "window._p1MaybeApplySubjectBank = async function () {\n    if (!p1BankHasPending()) return;\n    var res = await p1ApplySubjectBank();" },
  { id: "E3 banque de matières retirée de l'assistant de présentation", file: "tableur.html", script: "subject-bank.mjs", scen: ["SB-ONB"],
    from: "(page.id === 'specialites' && typeof window.P1_SUBJECT_BANK !== 'undefined'",
    to: "(page.id === 'specialites-DESACTIVE' && typeof window.P1_SUBJECT_BANK !== 'undefined'" },
  { id: "E4 abréviations explicites de la banque supprimées (collision shortOf)", file: "tableur.html", script: "subject-bank.mjs", scen: ["SB2"],
    from: "{ id: 'bank-ue2-bio-cell',        name: 'UE2 - Biologie cellulaire',group: 's1', color: '#22c55e', short: 'U2B' },",
    to: "{ id: 'bank-ue2-bio-cell',        name: 'UE2 - Biologie cellulaire',group: 's1', color: '#22c55e', short: null },"
  },
  // ── Retour de Jean (02/10) : flashcards orphelines après suppression d'une matière + tiret UEx rétroactif ──
  { id: "F1 filtrage des matières actives retiré de loadAllFlashCards/loadAllDueFlashCards", file: "tableur.html", script: "flash-orphan-subject.mjs", scen: ["FC1"],
    from: "  function loadAllDueFlashCards() { var b=fb(); if(!b) return Promise.resolve([]); return b.getDocs(b.query(_col(b), b.where('nextReview','<=',nowISO()))).then(_all).then(_flashFilterActiveSpe).catch(function(e){console.warn(e);return[];}); }\n  function loadAllFlashCards() { var b=fb(); if(!b) return Promise.resolve([]); return b.getDocs(_col(b)).then(_all).then(_flashFilterActiveSpe).catch(function(e){console.warn(e);return[];}); }",
    to: "  function loadAllDueFlashCards() { var b=fb(); if(!b) return Promise.resolve([]); return b.getDocs(b.query(_col(b), b.where('nextReview','<=',nowISO()))).then(_all).catch(function(e){console.warn(e);return[];}); }\n  function loadAllFlashCards() { var b=fb(); if(!b) return Promise.resolve([]); return b.getDocs(_col(b)).then(_all).catch(function(e){console.warn(e);return[];}); }" },
  { id: "F2 correctif rétroactif du tiret UEx désactivé", file: "tableur.html", script: "subject-bank.mjs", scen: ["SB-DASH"],
    from: "window._p1FixBankSubjectNames = async function () {\n    var TP = window.TPXPerso;",
    to: "window._p1FixBankSubjectNames = async function () {\n    return;\n    var TP = window.TPXPerso;" },
  { id: "F3 icônes par défaut retirées de la création des matières de banque", file: "tableur.html", script: "subject-bank.mjs", scen: ["SB2"],
    from: "await TP._upsertSpecialty({ id: toAdd[i].id, name: toAdd[i].name, color: toAdd[i].color, icon: toAdd[i].icon || null, short: toAdd[i].short || null });",
    to: "await TP._upsertSpecialty({ id: toAdd[i].id, name: toAdd[i].name, color: toAdd[i].color, icon: null, short: toAdd[i].short || null });" },
  { id: "F4 ligne « Banque de matières P1 » retirée du récapitulatif de l'assistant", file: "tableur.html", script: "subject-bank.mjs", scen: ["SB-ONB"],
    from: "if (pages.some(function (p) { return p.id === 'banque-matieres'; })) {\n                rows.push(",
    to: "if (false) {\n                rows.push(" },
  { id: "G1 réouverture du gestionnaire après une fiche (mgrPendingReturn) désactivée", file: "tableur.html", script: "delete-animation.mjs", scen: ["D4"],
    from: "var returnTo = opts.isManager ? null : (mgrPendingReturn || (old && old._tpxReturnTo) || null);",
    to: "var returnTo = null;" },
  // ── Retour de Jean (03/10) : scrollbar visible pendant le check de validation, séparation/animation des groupes-jour « Révisions J » ──
  { id: "SB1 masquage visuel de la scrollbar <html> retiré du verrou de scroll", file: "tableur.html", script: "scrollbar-lock-visual.mjs", scen: ["SB1"],
    from: "document.documentElement.classList.add('p1-scrollbar-hidden');",
    to: "void 0;" },
  { id: "J1 bordure/ombre de séparation des groupes-jour retirée", file: "tableur.html", script: "j-day-groups.mjs", scen: ["J1"],
    from: "    border: 1px solid var(--gray-200);\n    box-shadow: 0 1px 2px rgba(0,0,0,0.03);\n}\n.j-day-group + .j-day-group { margin-top: 0.75rem; }",
    to: "}\n.j-day-group + .j-day-group { }" },
  { id: "J4 délai avant retrait de `open` à la fermeture d'un groupe-jour supprimé (animation instantanée)", file: "tableur.html", script: "j-day-groups.mjs", scen: ["J4"],
    from: "        details._p1JCollapseTimer = setTimeout(function () {\n            details.removeAttribute('open');\n        }, 230);",
    to: "        details.removeAttribute('open');" },
  // ── 3 retouches reprises de TypixClin (03/10 soir, demande explicite de Jean) ──
  { id: "KBV1 _p1CatalogKeepFieldVisible neutralisée (clavier virtuel, listes personnalisables)", file: "tableur.html", script: "pop-legend-keyboard.mjs", scen: ["A1"],
    from: "function _p1CatalogKeepFieldVisible() {\n    var modal = document.getElementById('p1-catalog-modal');",
    to: "function _p1CatalogKeepFieldVisible() {\n    return;\n    var modal = document.getElementById('p1-catalog-modal');" },
  { id: "LEG1 _p1RenderSupportLegend neutralisée (légende Supports disponibles figée)", file: "tableur.html", script: "pop-legend-keyboard.mjs", scen: ["B2"],
    from: "function _p1RenderSupportLegend() {\n    var box = document.querySelector('#legendModal .legend-items');",
    to: "function _p1RenderSupportLegend() {\n    return;\n    var box = document.querySelector('#legendModal .legend-items');" },
  { id: "POP1 synchronisation p1-pop-open désactivée (bouton jamais bleu fenêtre ouverte)", file: "tableur.html", script: "pop-legend-keyboard.mjs", scen: ["C1"],
    from: "        var open = m.classList.contains('show') && !m.classList.contains('closing');",
    to: "        var open = false;" },
  // ── Popovers du modal « Organisation de la journée » (05/10, retour de Jean) ──
  { id: "PDD1 transition de fermeture du popover Matières supprimée (disparition instantanée)", file: "tableur.html", script: "pdd-popovers.mjs", scen: ["P1"],
    from: "transform-origin: top right; transition: opacity .18s ease, transform .18s cubic-bezier(.2,.8,.2,1), visibility 0s linear .18s; }",
    to: "transform-origin: top right; transition: none; }" },
  { id: "PDD2 rotation de la flèche du Statut supprimée", file: "tableur.html", script: "pdd-popovers.mjs", scen: ["P2"],
    from: ".pdd-status-btn.is-open .pdd-caret { transform: rotate(180deg); opacity: 1; }",
    to: ".pdd-status-btn.is-open .pdd-caret { opacity: 1; }" },
  { id: "PDD3 bouton Matières plus marqué « ouvert »", file: "tableur.html", script: "pdd-popovers.mjs", scen: ["P1"],
    from: "pop.classList.add('active'); setPopBtnOpen('pdd-spec-btn', true);",
    to: "pop.classList.add('active');" },
  { id: "PDD4 main au survol du bouton Matières ouvert supprimée (backdrop qui recouvre le bouton)", file: "tableur.html", script: "pdd-popovers.mjs", scen: ["P4"],
    from: "this.style.cursor = over ? 'pointer' : '';",
    to: "this.style.cursor = '';" },
  { id: "PDD5 main sur TOUT le backdrop (pas seulement sur le bouton)", file: "tableur.html", script: "pdd-popovers.mjs", scen: ["P4"],
    from: "this.style.cursor = over ? 'pointer' : '';",
    to: "this.style.cursor = 'pointer';" }
];
let bad = 0;
for (const m of MUTANTS.filter((x) => !ONLY || x.id.startsWith(ONLY))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1mut-"));
  fs.cpSync("public", dir, { recursive: true });
  const f = path.join(dir, m.file);
  let s = fs.readFileSync(f, "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)); // fichiers CRLF (tableur.html) : motifs écrits en LF
  for (const [a, b] of [[m.from, m.to], ...(m.also || [])]) {
    if (!s.includes(a)) { console.log(`✘ ${m.id} : motif introuvable (mutant invalide)`); bad++; continue; }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(f, s);
  const r = spawnSync(process.execPath, ["test/e2e/" + (m.script || "referral-ui.mjs"), ...m.scen], { env: Object.assign({}, process.env, { PUBLIC_DIR: dir, PAGE_FILE: m.file === "tableur.html" ? f : "" }), encoding: "utf8", timeout: 240000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const lines = out.split("\n").filter((l) => /✔|✘/.test(l)).map((l) => l.trim().slice(0, 110));
  const failed = lines.some((l) => l.startsWith("✘"));
  console.log(`${failed ? "OK (le mutant est DÉTECTÉ)" : "✘ MUTANT NON DÉTECTÉ"} — ${m.id}`);
  lines.forEach((l) => console.log("     " + l));
  if (!failed) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(bad ? 1 : 0);
