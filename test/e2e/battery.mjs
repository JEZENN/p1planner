/* Batterie E2E « vraie page » P1Planner (émulateurs). Arguments = préfixes de
   scénarios à jouer (ex. `node battery.mjs T1 T3`). PAGE_FILE=<autre version> pour
   le contrôle de sensibilité. Code de sortie 0 = tout OK (hors « échec connu »). */
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, course, doc, adb, tours, validateTour, resetTour, waitFor, scenario, report, assert, sleep, proxyMode } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => want(id) ? scenario(`${id} ${title}`, fn, opts) : null;

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();
const ok = async (u, i, v) => (await waitFor(async () => tours(await course(u.uid))[i] === v, { timeout: 20000 }));
try {
  // ── Tours : réseau normal ────────────────────────────────────────────────
  await S("T1", "ajout puis suppression d'un tour, réseau normal", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    await validateTour(page, "c1", 0, 4);
    assert(await ok(u, 0, 4), "tour 0 absent du serveur");
    await resetTour(page, "c1", 0);
    assert(await ok(u, 0, null), "suppression non persistée");
    assert(page.__errors.length === 0, "erreurs JS: " + page.__errors.join(" | "));
  });

  await S("T2", "réseau lent : 2e modification PENDANT l'écriture", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    await proxyMode("slow", 400);
    await validateTour(page, "c1", 0, 3);
    await sleep(600);
    await validateTour(page, "c1", 0, 5);                 // MÊME case, valeur différente, pendant que la 1re est en vol
    await sleep(9000);
    await proxyMode("up");
    assert(await ok(u, 0, 5), "dernière modification perdue : " + JSON.stringify(tours(await course(u.uid))));
  });

  await S("T3", "suppression dans la ½ s qui suit la fin d'une écriture", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    await validateTour(page, "c1", 0, 3);
    assert(await ok(u, 0, 3), "tour 0 absent");
    await sleep(150);
    await resetTour(page, "c1", 0);
    await sleep(6000);
    assert(tours(await course(u.uid))[0] === null, "la suppression est revenue : " + JSON.stringify(tours(await course(u.uid))));
    const local = await page.evaluate(() => (window._p1GetCoursesById().c1.tourConfidences || [])[0]);
    assert(local == null, "l'état local a ressuscité le tour : " + local);
  });

  // ── Tours : coupure du réseau ────────────────────────────────────────────
  await S("N1", "coupure TOTALE pendant la validation, retour du réseau", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    await proxyMode("down");
    await sleep(500);
    await validateTour(page, "c1", 0, 4);
    await sleep(20000);                                    // la panne dure
    await proxyMode("up");
    const arrived = await ok(u, 0, 4);
    const info = await page.evaluate(() => ({ alerts: [...document.querySelectorAll('.custom-modal-message, .toast-notification')].map(e => e.textContent.trim().slice(0, 90)) }));
    assert(arrived, "tour JAMAIS arrivé après retour du réseau (perdu). Messages : " + JSON.stringify(info.alerts));
  });

  await S("N2", "vrai mode hors ligne (CDP) puis retour", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await proxyMode("down");
    await sleep(14000);                                    // le détecteur bascule hors ligne (2 sondes ratées)
    await validateTour(page, "c1", 0, 2).catch(() => {});
    await sleep(3000);
    const lockedWhileOffline = await page.evaluate(() => !!window.isOfflineMode && !!window.offlineActionsBlocked);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await proxyMode("up");
    await sleep(15000);
    const st = tours(await course(u.uid))[0];
    // Hors ligne l'édition est VOLONTAIREMENT verrouillée : on exige soit la saisie renvoyée, soit un verrouillage explicite…
    assert(st === 2 || lockedWhileOffline, "hors ligne : ni saisie renvoyée ni verrouillage explicite (tour=" + st + ")");
    // …et, le réseau revenu, l'application doit redevenir éditable et enregistrer normalement.
    await validateTour(page, "c1", st === 2 ? 1 : 0, 3);
    assert(await waitFor(async () => tours(await course(u.uid))[st === 2 ? 1 : 0] === 3), "après retour du réseau, une nouvelle validation n'arrive pas au serveur");
  });

  // ── Programme de la journée / planning ───────────────────────────────────
  await S("P1", "tâche créée pendant une coupure, retour du réseau", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    const before = (await adb.collection(`users/${u.uid}/tasks`).get()).size;
    await proxyMode("down"); await sleep(500);
    await page.evaluate(() => { const i = document.getElementById("checklist-new-item"); i.value = "Tâche coupure"; document.getElementById("checklist-add-btn").click(); });
    await sleep(6000); await proxyMode("up"); await sleep(15000);
    const after = (await adb.collection(`users/${u.uid}/tasks`).get()).size;
    assert(after === before + 1, `tâche perdue (${before}→${after})`);
  });


  await S("D10", "history.scrollRestoration = manual dès le chargement", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    assert(await page.evaluate(() => history.scrollRestoration) === "manual", "scrollRestoration=" + await page.evaluate(() => history.scrollRestoration));
  });

  await S("D11", "fermeture avec une note d'entraînement non sauvegardée : pas d'erreur JS, copie locale posée", async () => {
    const u = await mkUser(); await adb.doc(`users/${u.uid}/trainingItems/7001`).set({ id: 7001, titre: "QCM 7001", type: "colle", matiere: "s1", plat: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() });
    const { page } = await openPage(browser, u);
    await page.evaluate(() => window.p1StartTrainingsListener(window.currentUser.uid));
    await waitFor(() => page.evaluate(() => (window.userData.trainings || []).length === 1), { timeout: 15000 });
    await page.evaluate(() => { window._openTrainNotes(7001); });
    await sleep(800);
    await page.evaluate(() => { const e = document.getElementById("trainNotesEditor"); e.innerHTML = "<p>frappe juste avant fermeture</p>"; window._p1TrainNotesStateForceDirty && 0; e.dispatchEvent(new Event("input", { bubbles: true })); });
    const st = await page.evaluate(() => window._p1TrainNotesState());
    assert(st.dirty && st.id === 7001, "état note non marqué modifié : " + JSON.stringify(st));
    page.__errors.length = 0;
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    assert(page.__errors.length === 0, "erreur JS au pagehide : " + page.__errors.join(" | "));
    const stored = await page.evaluate((uid) => { try { return Object.keys(localStorage).filter(k => k.indexOf("trainnotes_pending_" + uid) === 0).length; } catch (e) { return -1; } }, u.uid);
    assert(stored >= 1, "aucune copie locale de la note posée au pagehide (" + stored + ")");
  });

  await S("P2", "tâche créée pendant une coupure puis RECHARGEMENT de la page", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    const before = (await adb.collection(`users/${u.uid}/tasks`).get()).size;
    await proxyMode("down"); await sleep(500);
    await page.evaluate(() => { const i = document.getElementById("checklist-new-item"); i.value = "Tâche avant rechargement"; document.getElementById("checklist-add-btn").click(); });
    await sleep(1500);
    await proxyMode("up");
    await page.reload({ waitUntil: "load" });              // l'écriture en file mémoire du SDK est perdue si rien ne l'a envoyée
    await sleep(8000);
    const after = (await adb.collection(`users/${u.uid}/tasks`).get()).size;
    assert(after === before + 1, `tâche perdue au rechargement (${before}→${after})`);
  }); // ⚠️ N'est plus un échec connu depuis le cache Firestore persistant (D7, audit sauvegardes/pertes, 2026-09-30) — voir DECISIONS.md.

  await S("M1", "deux onglets, même cours : tours différents, les deux conservés", async () => {
    const u = await mkUser(); const A = (await openPage(browser, u)).page, B = (await openPage(browser, u)).page;
    await validateTour(A, "c1", 0, 3);
    assert(await waitFor(async () => tours(await course(u.uid))[0] === 3), "tour A absent");
    await B.bringToFront(); await sleep(2500);
    await validateTour(B, "c1", 1, 4);
    assert(await waitFor(async () => tours(await course(u.uid))[1] === 4), "tour B absent");
    const t = tours(await course(u.uid));
    assert(t[0] === 3 && t[1] === 4, "un des deux tours a été écrasé : " + JSON.stringify(t));
  });

  await S("D9", "restauration admin pendant qu'un onglet reste ouvert : l'onglet périmé n'écrase pas l'état restauré", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    await sleep(1500);
    await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: [5, null, null, null, null, null, null, null], tourCount: 1, restoredAt: new Date(Date.now() + 1000), updatedAt: new Date() }, { merge: true });
    await sleep(2000);
    await validateTour(page, "c1", 1, 2).catch(() => {});
    await sleep(5000);
    const t = tours(await course(u.uid));
    assert(t[0] === 5 && t[1] == null, "l'onglet resté ouvert a écrasé la restauration admin : " + JSON.stringify(t));
  });

  await S("P3", "écriture en attente pendant une coupure : la page le sait (avertissement avant de quitter)", async () => {
    const u = await mkUser(); const { page } = await openPage(browser, u);
    await proxyMode("down"); await sleep(500);
    await page.evaluate(() => { const i = document.getElementById("checklist-new-item"); i.value = "Tâche en attente"; document.getElementById("checklist-add-btn").click(); });
    await sleep(1500);
    const n = await page.evaluate(() => window._p1UnconfirmedWrites);
    assert(n > 0, "aucune écriture non confirmée signalée (" + n + ")");
    await proxyMode("up");
    assert(await waitFor(() => page.evaluate(() => window._p1UnconfirmedWrites === 0), { timeout: 30000 }), "le compteur ne retombe pas à 0 après retour du réseau");
  });

  await S("R1", "sélection d'une ressource : passe au vert et se retrouve sur le serveur", async () => {
    const u = await mkUser();
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ selectedResources: ["annale"] }, { merge: true }); // le tableur n'affiche les cases qu'une fois les ressources configurées
    const { page } = await openPage(browser, u);
    const before = await doc(`users/${u.uid}/courses/c1`);
    assert(!before.resources || !before.resources.tuto, "précondition : ressource déjà validée");
    const clicked = await page.evaluate(() => {
      const box = document.querySelector(".resource-box");
      if (!box) return "aucune case ressource trouvée dans le DOM";
      box.click();
      // Ressources personnalisables (2026-09-27) : la couleur/le libellé viennent du catalogue
      // (AVAILABLE_RESOURCES), la case n'a donc plus de classe CSS fixe par ressource (.annale) —
      // identification par data-resource-id. Le tableau est redessiné : relire le nouvel élément
      // (l'ancien est détaché).
      const fresh = document.querySelector('.resource-box[data-resource-id="annale"]');
      return fresh && fresh.classList.contains("validated") ? "vert" : "pas-vert";
    });
    assert(clicked === "vert", "case non colorée immédiatement après le clic (optimiste) : " + clicked);
    assert(await waitFor(async () => { const c = await doc(`users/${u.uid}/courses/c1`); return c && c.resources && Object.values(c.resources).some(v => v === true); }, { timeout: 15000 }), "ressource jamais enregistrée sur le serveur");
    const server = await doc(`users/${u.uid}/courses/c1`);
    assert(!Object.keys(server).some(k => k.indexOf(".") !== -1), "champ à point littéral créé par erreur : " + JSON.stringify(Object.keys(server)));
  });

  // ── Entraînements ────────────────────────────────────────────────────────
  const mkTraining = (uid, id, extra = {}) => adb.doc(`users/${uid}/trainingItems/${id}`).set(Object.assign(
    { id, titre: "QCM " + id, type: "colle", matiere: "s1", plat: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() }, extra));
  const tstat = async (uid, id) => ((await doc(`users/${uid}/trainingItems/${id}`)) || {}).statut;
  const fakeEv = () => ({ target: document.body, stopPropagation() {}, preventDefault() {} });
  const loadTr = async (page, n) => { await page.evaluate(() => window.p1StartTrainingsListener(window.currentUser.uid)); await waitFor(() => page.evaluate((n) => (window.userData.trainings || []).length === n, n), { timeout: 15000 }); };

  await S("E1", "valider un entraînement depuis le Programme de la journée => statut enregistré", async () => {
    const u = await mkUser(); await mkTraining(u.uid, 1001);
    await adb.doc(`users/${u.uid}/tasks/tk1`).set({ text: "Faire QCM 1001", itemKey: "train-1001", completed: false, archivedAt: null, createdAt: new Date(), updatedAt: new Date() });
    const { page } = await openPage(browser, u);
    await loadTr(page, 1);
    await waitFor(() => page.evaluate(() => window.checklistData && window.checklistData.some && true), { timeout: 5000 });
    const r = await page.evaluate(() => { PlanningModule.toggleChecklistItem('tk1', { target: document.body, stopPropagation(){}, preventDefault(){} }); window.handleTrainCLStatut('fait'); return true; });
    await sleep(6000);
    assert(await tstat(u.uid, 1001) === "fait", "statut jamais enregistré : serveur=" + (await tstat(u.uid, 1001)));
  });

  await S("E4", "chargement : les entraînements du serveur sont présents en mémoire (course au chargement)", async () => {
    const u = await mkUser(); await mkTraining(u.uid, 4001); await mkTraining(u.uid, 4002); await mkTraining(u.uid, 4003);
    const { page } = await openPage(browser, u);
    await sleep(6000);
    const n = await page.evaluate(() => (window.userData.trainings || []).length);
    assert(n === 3, 'entraînements du serveur absents de la mémoire après chargement (' + n + '/3)');
  });

  await S("E5", "ajout d'un entraînement juste après le chargement : les autres ne sont PAS archivés", async () => {
    const u = await mkUser(); await mkTraining(u.uid, 5001); await mkTraining(u.uid, 5002);
    const { page } = await openPage(browser, u);
    await sleep(4000);
    await page.evaluate(() => { window.openTrainModal && window.openTrainModal(); document.querySelector('#train-type-btns .train-modal-type-btn').click(); document.getElementById('train-title-input').value = 'Nouveau QCM'; window.saveTrainModal(); });
    await sleep(6000);
    const a = await doc(`users/${u.uid}/trainingItems/5001`), b = await doc(`users/${u.uid}/trainingItems/5002`);
    assert(a && !a.archivedAt && b && !b.archivedAt, 'entraînements existants ARCHIVÉS par la sauvegarde : 5001=' + JSON.stringify(a && a.archivedAt) + ' 5002=' + JSON.stringify(b && b.archivedAt));
  });

  await S("E0", "témoin : changer le statut d'un entraînement, réseau normal", async () => {
    const u = await mkUser(); await mkTraining(u.uid, 2101);
    const { page } = await openPage(browser, u);
    await loadTr(page, 1);
    await page.evaluate(() => { window._openTrainStatutPopup(2101, { target: document.body, stopPropagation(){} }); window._setTrainStatut('fait'); });
    await sleep(4000);
    assert(await tstat(u.uid, 2101) === 'fait', 'témoin : statut non enregistré (serveur=' + (await tstat(u.uid, 2101)) + ')');
  });

  await S("E2", "modification d'un entraînement par un AUTRE appareil pendant la sauvegarde d'un autre : conservée", async () => {
    const u = await mkUser(); await mkTraining(u.uid, 2001); await mkTraining(u.uid, 2002);
    const { page } = await openPage(browser, u);
    await loadTr(page, 2);
    await proxyMode("slow", 400);
    await adb.doc(`users/${u.uid}/trainingItems/2002`).set({ statut: "relu", updatedAt: new Date() }, { merge: true });   // autre appareil
    await sleep(300);
    await page.evaluate((ev) => { window._openTrainStatutPopup(2001, { target: document.body, stopPropagation(){} }); window._setTrainStatut("fait"); });
    await waitFor(async () => (await tstat(u.uid, 2001)) === "fait", { timeout: 60000, every: 500 });
    await proxyMode("up"); await sleep(4000);
    const s1 = await tstat(u.uid, 2001), s2 = await tstat(u.uid, 2002);
    assert(s1 === "fait", "modification locale perdue : " + s1);
    assert(s2 === "relu", "modification de l'autre appareil ÉCRASÉE par une copie périmée : " + s2);
  });

  await S("E3", "suppression puis 2e action rapide (réseau lent) : l'entraînement supprimé ne revient pas", async () => {
    const u = await mkUser(); await mkTraining(u.uid, 3001); await mkTraining(u.uid, 3002);
    const { page } = await openPage(browser, u);
    await loadTr(page, 2);
    await proxyMode("slow", 400);
    await page.evaluate(() => { window._deleteTraining(3002); window.trainConfirmDelete(); });
    await sleep(1500);
    await page.evaluate(() => { window._openTrainStatutPopup(3001, { target: document.body, stopPropagation(){} }); window._setTrainStatut("fait"); });
    await waitFor(async () => { const x = await doc(`users/${u.uid}/trainingItems/3002`); return x && x.archivedAt; }, { timeout: 60000, every: 500 });
    await waitFor(async () => (await tstat(u.uid, 3001)) === "fait", { timeout: 60000, every: 500 });
    await proxyMode("up"); await sleep(4000);
    const d = await doc(`users/${u.uid}/trainingItems/3002`);
    assert(d && d.archivedAt, "3002 non archivé (revenu) : " + JSON.stringify(d && d.archivedAt));
    const inMem = await page.evaluate(() => (window.userData.trainings || []).map(t => t.id));
    assert(!inMem.includes(3002), "3002 est revenu en mémoire : " + JSON.stringify(inMem));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
