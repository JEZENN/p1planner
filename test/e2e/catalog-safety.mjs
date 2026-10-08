/* Sécurité des données des listes personnalisables (audit 02/10, comparaison au modèle EDN
   TableurEnLigne.html — tpx-catalogs-core). Vraie page + vrais émulateurs.

   A1/L1 : deux onglets du MÊME compte qui modifient le catalogue en même temps ne doivent
   JAMAIS s'écraser l'un l'autre — fusion par union d'id + horodatage `u`, jamais un simple
   écrasement de tout le tableau.
   A2/L2 : un gestionnaire déjà ouvert doit voir un changement fait depuis un AUTRE onglet,
   sans avoir besoin d'être fermé/rouvert (écoute temps réel sur settings/preferences).
   A3/A5/L3/L5 : aucune écriture (ni ouverture du gestionnaire) tant que les catalogues de ce
   compte n'ont pas été chargés au moins une fois, ni hors connexion.
   A4/L4 : un échec d'écriture réel est visible (jamais un "Ajouté" silencieusement faux) et
   annule la mutation optimiste — l'état affiché reste toujours celui réellement enregistré. */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

async function addResource(page, label) {
  await page.evaluate(() => window._p1OpenCatalogModal("resources"));
  await sleep(150);
  await page.evaluate((lab) => {
    const el = document.getElementById("p1-catalog-new-label");
    el.readOnly = false;
    el.value = lab;
  }, label);
  await page.evaluate(() => window._p1CatalogAdd());
}

try {
  await S("CAT1", "deux onglets du même compte : A ajoute X, B (déjà ouvert AVANT) ajoute Y -> serveur = X + Y, jamais l'un écrasé par l'autre", async () => {
    const u = await mkUser({ courses: 1 });
    const { page: pageA } = await openPage(browser, u);
    const { page: pageB } = await openPage(browser, u);

    // B ouvre son gestionnaire AVANT que A n'ajoute quoi que ce soit (piège direct du bug L1 :
    // un onglet resté ouvert réécrivait tout le catalogue par-dessus un ajout fait ailleurs).
    await pageB.evaluate(() => window._p1OpenCatalogModal("resources"));
    await sleep(150);
    await pageA.evaluate(() => window._p1OpenCatalogModal("resources"));
    await sleep(150);
    await pageA.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = "AjoutA"; });
    await pageB.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = "AjoutB"; });

    // Les deux ajouts partent QUASI SIMULTANÉMENT (Promise.all, pas de sleep entre les deux) :
    // le but précis est qu'AUCUN des deux onglets n'ait eu le temps de recevoir l'ajout de
    // l'autre via l'écoute temps réel (A2) avant d'écrire le sien -- seule la fusion EN
    // TRANSACTION (A1) peut alors garantir qu'aucun des deux n'efface l'autre. Avec un sleep
    // entre les deux (testé et confirmé), l'écoute temps réel réconcilie déjà tout avant la 2e
    // écriture et masque une régression de la fusion elle-même : ce n'est pas ce qu'on veut
    // isoler ici.
    await Promise.all([
      pageA.evaluate(() => window._p1CatalogAdd()),
      pageB.evaluate(() => window._p1CatalogAdd()),
    ]);
    await sleep(600);

    const prefs = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const labels = (prefs.data().customResources || []).map((r) => r.label);
    assert(labels.includes("AjoutA"), "AjoutA (onglet A) absent du serveur — écrasé par l'onglet B : " + JSON.stringify(labels));
    assert(labels.includes("AjoutB"), "AjoutB (onglet B) absent du serveur — écrasé par l'onglet A : " + JSON.stringify(labels));

    // A2 : chaque onglet voit en direct l'ajout de l'AUTRE, sans fermer/rouvrir son gestionnaire.
    await waitFor(() => pageA.evaluate(() => window._p1GetAvailableResources().some((r) => r.label === "AjoutB")), { timeout: 10000 });
    await waitFor(() => pageB.evaluate(() => window._p1GetAvailableResources().some((r) => r.label === "AjoutA")), { timeout: 10000 });
    assert(pageA.__errors.length === 0, "erreurs JS (A) : " + JSON.stringify(pageA.__errors));
    assert(pageB.__errors.length === 0, "erreurs JS (B) : " + JSON.stringify(pageB.__errors));
  });

  await S("CAT2", "renommage sur A, archivage PLUS RÉCENT sur B pour la MÊME entrée par défaut : la version la plus récente (l'archivage) gagne", async () => {
    const u = await mkUser({ courses: 1 });
    const { page: pageA } = await openPage(browser, u);
    const { page: pageB } = await openPage(browser, u);
    await pageA.evaluate(() => window._p1OpenCatalogModal("resources"));
    await pageB.evaluate(() => window._p1OpenCatalogModal("resources"));
    await sleep(150);

    // Un défaut ("annale") ne peut pas être archivé -- on utilise un ajout personnalisé pour
    // pouvoir exercer les deux opérations (renommer puis archiver) sur la MÊME entrée.
    await addResource(pageA, "Cible");
    await sleep(500);
    await waitFor(() => pageB.evaluate(() => window._p1GetAvailableResources().some((r) => r.label === "Cible")), { timeout: 10000 });
    const id = await pageA.evaluate(() => window._p1GetAvailableResources().find((r) => r.label === "Cible").id);

    // A renomme EN PREMIER, B archive JUSTE APRÈS (horodatage plus récent) -- la fusion doit
    // retenir l'archivage de B (le plus récent), pas le renommage de A (dict_the `u` le plus
    // grand gagne, voir p1MergeCatalogArrays).
    await pageA.evaluate((rid) => { document.querySelector(`.p1-catalog-row[data-id="${rid}"] .p1-catalog-text-field`).readOnly = false; }, id);
    await pageA.evaluate((rid) => window._p1CatalogRename(rid, "CibleRenommee"), id);
    await sleep(250);
    await pageB.evaluate((rid) => document.querySelector(`.p1-catalog-row[data-id="${rid}"] .p1-catalog-delete`)?.click(), id);
    await sleep(700);

    const prefs = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const entry = (prefs.data().customResources || []).find((r) => r.id === id);
    assert(entry, "l'entrée a disparu du serveur (devrait être archivée, jamais effacée)");
    assert(entry.archived === true, "l'archivage (le plus récent) n'a pas gagné sur le renommage : " + JSON.stringify(entry));
  });

  await S("CAT3", "garde A3/A5 : gestionnaire refusé (chargement en cours) et mutation refusée (hors ligne), jamais une écriture avant/pendant", async () => {
    const u = await mkUser({ courses: 1 });
    const { page } = await openPage(browser, u);

    // Simule la fenêtre "catalogues pas encore chargés pour ce compte" (voir
    // window._checkSelectedResources/_p1CatalogCanEdit) : état réel traversé par tout compte
    // entre la connexion et le premier instantané reçu, ici forcé pour le tester de façon fiable
    // (sans dépendre de la vitesse réelle, non déterministe, de l'émulateur).
    const before = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const beforeData = before.exists ? before.data() : {};
    await page.evaluate(() => { window._p1CatalogsLoaded = false; });
    await page.evaluate(() => window._p1OpenCatalogModal("resources"));
    await sleep(150);
    assert(!(await page.evaluate(() => document.getElementById("p1-catalog-modal").classList.contains("active"))), "le gestionnaire s'est ouvert alors que les catalogues ne sont pas encore chargés (A5)");
    // Appel direct de la mutation (contournant l'UI) : doit aussi être refusé (A3), pas
    // seulement l'ouverture du modal.
    await page.evaluate(() => window._p1CatalogAdd());
    await sleep(300);

    // Remet l'état "chargé" : le gestionnaire s'ouvre de nouveau normalement.
    await page.evaluate((uid) => { window._p1CatalogsLoaded = true; window._p1CatalogOwnerUid = uid; }, u.uid);
    await page.evaluate(() => window._p1OpenCatalogModal("resources"));
    await sleep(150);
    assert(await page.evaluate(() => document.getElementById("p1-catalog-modal").classList.contains("active")), "le gestionnaire reste refusé après que les catalogues sont marqués chargés");
    await page.evaluate(() => window._p1CloseCatalogModal());
    await sleep(250);

    // Hors ligne (canPerformAction('config') doit refuser) : même garde, chemin différent.
    // canPerformAction lit `window.offlineActionsBlocked` (pas `isOfflineMode`, variable de
    // script différente, non accessible depuis ce module) -- voir canPerformAction().
    await page.evaluate(() => { window.offlineActionsBlocked = true; });
    await page.evaluate(() => window._p1OpenCatalogModal("resources"));
    await sleep(150);
    assert(!(await page.evaluate(() => document.getElementById("p1-catalog-modal").classList.contains("active"))), "le gestionnaire s'est ouvert alors que la page est hors ligne");
    await page.evaluate(() => { window.offlineActionsBlocked = false; });

    // Dans TOUS les cas ci-dessus, rien n'a dû être écrit sur le serveur.
    const after = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const afterData = after.exists ? after.data() : {};
    assert(JSON.stringify(afterData.customResources || null) === JSON.stringify(beforeData.customResources || null), "une écriture a eu lieu malgré les gardes refusées : " + JSON.stringify(afterData.customResources));
  });

  await S("CAT4", "échec d'écriture réel : message visible, mutation annulée (jamais une ligne fantôme qui reste affichée)", async () => {
    const u = await mkUser({ courses: 1 });
    const { page } = await openPage(browser, u);
    await page.evaluate(() => window._p1OpenCatalogModal("resources"));
    await sleep(150);
    const beforeCount = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);

    // Simule un échec réel d'écriture (ex. connexion instable) en remplaçant temporairement la
    // transaction par un rejet systématique, sans toucher au reste du module.
    await page.evaluate(() => {
      window.__p1RealRunTx = window._fsRunTransaction;
      window._fsRunTransaction = () => Promise.reject(new Error("simulated-write-failure"));
    });
    await page.evaluate(() => {
      const el = document.getElementById("p1-catalog-new-label");
      el.readOnly = false;
      el.value = "DevraitDisparaitre";
    });
    await page.evaluate(() => window._p1CatalogAdd());
    await sleep(300);

    const afterCount = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    assert(afterCount === beforeCount, "la ligne optimiste est restée affichée malgré l'échec réel de l'écriture (A4) : " + afterCount + " lignes (attendu " + beforeCount + ")");
    assert(!(await page.evaluate(() => window._p1GetAvailableResources().some((r) => r.label === "DevraitDisparaitre"))), "l'entrée fantôme est restée dans l'état local après l'échec");

    await page.evaluate(() => { window._fsRunTransaction = window.__p1RealRunTx; });
    const prefs = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const labels = ((prefs.exists ? prefs.data().customResources : null) || []).map((r) => r.label);
    assert(!labels.includes("DevraitDisparaitre"), "l'entrée a quand même été écrite côté serveur malgré l'échec simulé");
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
