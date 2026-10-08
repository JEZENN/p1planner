/* Audit perte de données (2026-09-30, demande explicite de Jean, voir le prompt "protection des
   données" collé en session). Couvre ici D6 (une restauration admin ne gagnait que sur courses,
   pas les autres collections, pour un onglet resté ouvert), D7 (cache Firestore mémoire, jamais
   persistant), D9 (compteur d'écritures non confirmées incomplet), D10 (deletedDefaultIds ne
   vivait que dans un blob localStorage jamais purgé), D11 (showCustomAlert n'acceptait qu'un
   objet) et D12 (recherche bloquée après pageshow bfcache). D8 est dans train-durability.mjs
   (cas à part : runTransaction ne fonctionne pas hors ligne même avec un cache persistant). */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, proxyMode, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

try {
  const u = await mkUser({ courses: 1 });
  const { page } = await openPage(browser, u);

  await S("D6", "restoreEpoch (users/{uid}) : un onglet déjà ouvert recharge réellement quand un admin restaure une sauvegarde — pas seulement pour les cours", async () => {
    // Laisse le temps au listener users/{uid} (startUserSettingsListener) de recevoir sa PREMIÈRE
    // valeur (même absente) et de la mémoriser comme référence — sans ça, la toute première
    // restauration serait à tort prise pour un changement et déclencherait un rechargement inutile.
    await sleep(500);
    const marker = await page.evaluate(() => { window.__D6_MARKER__ = "present"; return window.__D6_MARKER__; });
    assert(marker === "present", "impossible de poser le marqueur de test");

    // Simule ce que fait réellement adminRestoreBackup() (functions/index.js) : poser un NOUVEAU
    // restoreEpoch sur users/{uid}. On écrit directement via l'admin SDK plutôt que d'appeler la
    // vraie Cloud Function ici (déjà exercée par D1-D5) — ce scénario cible spécifiquement la
        // réaction CÔTÉ CLIENT à ce champ, indépendamment de son émetteur.
    await adb.doc(`users/${u.uid}`).set({ restoreEpoch: new Date() }, { merge: true });

    // Un rechargement RÉEL de page efface tout état JS en mémoire, y compris ce marqueur — c'est
    // la preuve la plus directe qu'un vrai rechargement a eu lieu (pas juste un re-rendu partiel).
    await page.waitForFunction(() => window.__D6_MARKER__ !== "present", { timeout: 15000 });
    await sleep(500);
    const afterReload = await page.evaluate(() => window.__D6_MARKER__);
    assert(afterReload === undefined, "le marqueur a survécu : la page n'a pas réellement rechargé après un nouveau restoreEpoch");
  });

  await S("D9a", "compteur d'écritures non confirmées : une transaction (p1WriteTourSlot) est bien comptée", async () => {
    const before = await page.evaluate(() => window._p1UnconfirmedWrites);
    assert(before === 0, "compteur non nul avant le test : " + before);
    // On ne peut pas capturer une valeur STRICTEMENT positive de façon fiable pendant un aller-retour
    // aussi rapide contre l'émulateur local (souvent < 1 tick) : on vérifie donc que le compteur
    // retombe bien à 0 une fois l'écriture confirmée (preuve qu'il a été incrémenté PUIS décrémenté
    // — un compteur jamais touché resterait à 0 tout du long de façon indiscernable, mais un
    // compteur cassé qui ne décrémente jamais resterait bloqué au-dessus de 0, ce qui est bien ce
    // que ce test détecte).
    await page.evaluate((fc) => window.p1WriteTourSlot("c1", fc, 0, { confidence: 4 }), "c1");
    await sleep(300);
    const after = await page.evaluate(() => window._p1UnconfirmedWrites);
    assert(after === 0, "compteur non retombé à 0 après la transaction confirmée : " + after);
    // Vérification positive directe : on intercepte l'appel pour observer un pic > 0 pendant le vol.
    const peaked = await page.evaluate((fc) => {
      return new Promise((resolve) => {
        const orig = window._fsRunTransaction;
        window._fsRunTransaction = function () {
          const p = orig.apply(null, arguments);
          resolve(window._p1UnconfirmedWrites > 0);
          return p;
        };
        window.p1WriteTourSlot("c1", fc, 1, { confidence: 3 });
      });
    }, "c1");
    assert(peaked === true, "le compteur n'est jamais passé au-dessus de 0 pendant la transaction (runTransaction non comptée)");
  });

  await S("D9b", "compteur d'écritures non confirmées : un updateDoc brut (TPXPerso) est bien compté", async () => {
    await sleep(200);
    const peaked = await page.evaluate(() => {
      return new Promise((resolve) => {
        const orig = window._fsUpdateDoc;
        window._fsUpdateDoc = function () {
          const p = orig.apply(null, arguments);
          resolve(window._p1UnconfirmedWrites > 0);
          return p;
        };
        // Déclenche une VRAIE écriture updateDoc via le module TPXPerso (archivage de matière).
        window.TPXPerso.setContentMode(window.TPXPerso.MODE_CUSTOM);
        window.TPXPerso.openSpecialtyModal(null);
        setTimeout(() => {
          document.getElementById("tpx-mat-name").value = "Matière D9";
          document.getElementById("tpx-mat-ok").click();
          setTimeout(() => {
            const specs = window.TPXPerso._state.specialties;
            const s = specs.find((x) => x.name === "Matière D9");
            window.TPXPerso._deleteSpecialty(s.id); // updateDoc brut (archivedAt), voir functions D9
          }, 300);
        }, 200);
      });
    });
    assert(peaked === true, "updateDoc brut (deleteSpecialty) jamais compté dans _p1UnconfirmedWrites");
  });

  await S("D10", "suppression d'un entraînement PAR DÉFAUT : deletedDefaultIds survit à la perte du localStorage (vraie persistance Firestore, pas le blob planning_pending_<uid>)", async () => {
    await adb.doc(`users/${u.uid}/trainingItems/5001`).set({
      id: 5001, titre: "QCM officiel 5001", isDefault: true, type: "colle", matiere: "s1", plat: "edni",
      statut: "a-faire", archivedAt: null, updatedAt: new Date(),
    });
    await page.evaluate(() => window.p1StartTrainingsListener(window.currentUser.uid));
    await page.waitForFunction(() => (window.userData.trainings || []).some((t) => t.id === 5001), { timeout: 15000 });
    await page.evaluate(() => window.renderTrainTable());
    await sleep(150);

    await page.evaluate(() => { window._deleteTraining(5001); window.trainConfirmDelete(); });
    await sleep(400);

    // Preuve n°1 : deletedDefaultIds est réellement écrit sur Firestore (settings/preferences),
    // pas seulement gardé en mémoire/localStorage — c'est le cœur du correctif D10.
    const prefsSnap = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const persisted = prefsSnap.exists ? (prefsSnap.data().deletedDefaultIds || []) : [];
    assert(persisted.includes(5001), "deletedDefaultIds(5001) jamais écrit sur users/{uid}/settings/preferences : " + JSON.stringify(persisted));

    // Preuve n°2 : la suppression survit même en effaçant tout le localStorage AVANT de recharger
    // — élimine toute dépendance résiduelle au blob planning_pending_<uid> hérité de TypixClin
    // (qui, avant ce correctif, était la SEULE trace de cette suppression).
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await page.evaluate(() => window.p1StartTrainingsListener(window.currentUser.uid));
    await sleep(1500);
    const stillDeleted = await page.evaluate(() => !(window.userData.trainings || []).some((t) => t.id === 5001));
    assert(stillDeleted, "l'entraînement par défaut 5001 est RÉAPPARU après effacement du localStorage + rechargement (deletedDefaultIds non persisté réellement)");

    // Preuve n°3 (D10, volet "faux filet neutralisé") : plus rien n'est jamais écrit dans le blob
    // planning_pending_<uid> — vérifié via une VRAIE modification suivie d'un vrai évènement pagehide.
    await page.evaluate(() => { window.hasUnsavedChanges = true; window.currentUser = window.currentUser || { uid: "x" }; });
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await sleep(200);
    const pendingKeyStillAbsent = await page.evaluate((uid) => localStorage.getItem("planning_pending_" + uid) === null, u.uid);
    assert(pendingKeyStillAbsent, "planning_pending_<uid> a été réécrit dans localStorage alors que ce mécanisme doit être neutralisé (D10)");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("D11", "showCustomAlert('message', 'error') affiche le VRAI message avec l'icône d'erreur (pas 'Information' vide + coche verte)", async () => {
    // ⚠️ showCustomAlert() renvoie une Promise qui ne se résout qu'au clic sur OK — il ne faut
    // JAMAIS la retourner (donc l'attendre) depuis page.evaluate() avant d'avoir cliqué OK dans un
    // AUTRE evaluate, sous peine de bloquer indéfiniment (piège trouvé en écrivant ce test).
    await page.evaluate(() => { window.showCustomAlert("Impossible d'enregistrer ce tour.", "error"); });
    await sleep(150);
    const state = await page.evaluate(() => ({
      title: document.getElementById("alert-modal-title").textContent,
      message: document.getElementById("alert-modal-message").textContent,
      iconClass: document.getElementById("alert-modal-icon").className,
    }));
    assert(state.message.includes("Impossible d'enregistrer ce tour"), "message vide ou incorrect : " + JSON.stringify(state));
    assert(state.iconClass.includes("error"), "icône incorrecte (devrait être 'error', pas 'success') : " + state.iconClass);
    await page.evaluate(() => document.getElementById("alert-modal-ok").click());
    await sleep(300);

    // Forme à 3 arguments positionnels (titre, message, type), également utilisée dans le fichier.
    await page.evaluate(() => { window.showCustomAlert("Erreur", "Vous devez être connecté.", "error"); });
    await sleep(150);
    const state2 = await page.evaluate(() => ({
      title: document.getElementById("alert-modal-title").textContent,
      message: document.getElementById("alert-modal-message").textContent,
      iconClass: document.getElementById("alert-modal-icon").className,
    }));
    assert(state2.title === "Erreur", "titre incorrect (forme à 3 arguments) : " + JSON.stringify(state2));
    assert(state2.message.includes("Vous devez être connecté"), "message incorrect (forme à 3 arguments) : " + JSON.stringify(state2));
    assert(state2.iconClass.includes("error"), "icône incorrecte (forme à 3 arguments) : " + state2.iconClass);
    await page.evaluate(() => document.getElementById("alert-modal-ok").click());
  });

  await S("D12", "recherche : un DEUXIÈME retour bfcache (pageshow persisted) laisse encore le champ déverrouillable", async () => {
    await page.evaluate(() => document.querySelector('[data-page="items"]').click());
    await sleep(300);
    const id = "search-item";
    // 1er cycle : déverrouiller normalement (clic réel), reverrouiller via un retour bfcache.
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      el.dispatchEvent(new PointerEvent("pointerdown"));
    }, id);
    await sleep(50);
    const afterFirstUnlock = await page.evaluate((id) => document.getElementById(id).readOnly, id);
    assert(afterFirstUnlock === false, "le champ ne s'est pas déverrouillé au premier geste réel");

    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await sleep(50);
    const afterPlainPageshow = await page.evaluate((id) => document.getElementById(id).readOnly, id);
    assert(afterPlainPageshow === false, "un pageshow SANS persisted a reverrouillé le champ (ne devrait pas)");

    const ev = await page.evaluate(() => {
      try {
        const e = new Event("pageshow");
        Object.defineProperty(e, "persisted", { value: true });
        window.dispatchEvent(e);
        return true;
      } catch (err) { return String(err); }
    });
    assert(ev === true, "impossible de simuler pageshow persisted : " + ev);
    await sleep(50);
    const afterBfcacheReshow = await page.evaluate((id) => document.getElementById(id).readOnly, id);
    assert(afterBfcacheReshow === true, "un retour bfcache (persisted=true) n'a pas reverrouillé le champ");

    // 2e cycle : le champ doit ENCORE pouvoir être déverrouillé — c'est le cœur du bug D12
    // (avant correctif, les écouteurs {once:true} étaient déjà consommés et jamais reposés).
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      el.dispatchEvent(new PointerEvent("pointerdown"));
    }, id);
    await sleep(50);
    const afterSecondUnlock = await page.evaluate((id) => document.getElementById(id).readOnly, id);
    assert(afterSecondUnlock === false, "le champ reste bloqué en lecture seule après un 2e cycle verrouillage/retour bfcache (bug D12)");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("D7a", "cache Firestore persistant (IndexedDB) activé au chargement, pas le cache mémoire par défaut", async () => {
    const usingPersistent = await page.evaluate(() => window._p1UsingPersistentCache);
    assert(usingPersistent === true, "le cache persistant n'est pas actif (repli mémoire silencieux ou régression) : " + usingPersistent);
  });

  await S("D7b", "une écriture émise pendant une coupure Firestore SURVIT à un rechargement de page pendant la coupure, puis atteint le serveur au retour du réseau", async () => {
    // ⚠️ Piège trouvé en écrivant ce test : couper le réseau au niveau CDP (Network.
    // emulateNetworkConditions offline:true) bloque AUSSI le rechargement de la page lui-même
    // (le document HTML vient de e2e-server, sur une origine différente du seul port Firestore
    // qu'on veut couper) — le reload échoue silencieusement, et le test ne prouve alors plus
    // rien. Même schéma que N2/P2 (déjà éprouvé) : uniquement proxyMode("down"), qui coupe
    // SPÉCIFIQUEMENT le port Firestore relayé par flaky-proxy.mjs, laissant le reste du réseau
    // (dont le rechargement de la page) fonctionner normalement.
    await proxyMode("down");
    await sleep(300);

    // Écriture directe (setDoc via window._fsSetDoc) pendant la coupure Firestore : sans cache
    // persistant, cette mutation ne vivrait QUE dans la mémoire de l'onglet — perdue au moindre
    // rechargement.
    await page.evaluate(() => {
      window._fsSetDoc(window._fsDoc(window._fsDb, "users", window.currentUser.uid, "courses", "c1"), { resources: { d7test: true } }, { merge: true });
    });
    await sleep(300);
    // Rechargement PENDANT la coupure Firestore (toujours "down" à cet instant).
    await page.reload({ waitUntil: "load" });
    await sleep(1500);

    await proxyMode("up");

    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      await sleep(1000);
      const snap = await adb.doc(`users/${u.uid}/courses/c1`).get();
      ok = !!(snap.exists && snap.data().resources && snap.data().resources.d7test === true);
    }
    assert(ok, "l'écriture émise pendant la coupure Firestore n'a JAMAIS atteint le serveur après le retour du réseau — elle n'a pas survécu au rechargement pendant la coupure (cache non persistant)");
  });

  await S("D8", "un TOUR validé pendant une coupure Firestore, avec l'onglet FERMÉ/rechargé pendant la coupure, arrive quand même au serveur au retour du réseau (file locale durable, runTransaction ne survit pas hors ligne même avec le cache persistant)", async () => {
    await proxyMode("down");
    await sleep(300);

    // Valide le tour DIRECTEMENT (pas via l'UI, pour ne pas dépendre du verrouillage visuel hors
    // ligne) : p1WriteTourSlot pose la case en file locale AVANT même d'essayer le réseau.
    page.evaluate(() => { window.p1WriteTourSlot("s1", "c1", 2, { confidence: 5 }); }); // pas d'await : la promesse ne se règle pas avant le retour du réseau (boucle de réessai)
    await sleep(300);
    const queuedWhileOffline = await page.evaluate(() => window._p1TourQueuePeek().some((e) => e.courseId === "c1" && e.tourIndex === 2));
    assert(queuedWhileOffline, "la case n'a jamais été posée dans la file locale avant la tentative réseau");

    // Rechargement PENDANT la coupure (l'onglet aurait très bien pu être FERMÉ à cet instant :
    // la file vit en localStorage, indépendante de tout état JS en mémoire).
    await page.reload({ waitUntil: "load" });
    await sleep(500);
    const survivedReload = await page.evaluate(() => window._p1TourQueuePeek().some((e) => e.courseId === "c1" && e.tourIndex === 2));
    assert(survivedReload, "la case a disparu de la file locale après le rechargement pendant la coupure — c'est exactement la perte que D8 doit empêcher");

    await proxyMode("up");
    // Le rejeu automatique se déclenche au chargement (voir le point d'accroche après
    // _checkSelectedResources()) — on ne le redéclenche pas manuellement ici, pour prouver qu'il
    // se produit bien tout seul.
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      await sleep(1000);
      const snap = await adb.doc(`users/${u.uid}/courses/c1`).get();
      ok = !!(snap.exists && Array.isArray(snap.data().tourConfidences) && snap.data().tourConfidences[2] === 5);
    }
    assert(ok, "le tour validé pendant la coupure (onglet rechargé entretemps) n'a JAMAIS atteint le serveur après le retour du réseau — perte de données (régression D8)");

    const clearedAfterSuccess = await page.evaluate(() => window._p1TourQueuePeek().some((e) => e.courseId === "c1" && e.tourIndex === 2));
    assert(!clearedAfterSuccess, "l'entrée reste dans la file locale alors que le serveur a bien confirmé l'écriture (ne sera jamais nettoyée)");
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
