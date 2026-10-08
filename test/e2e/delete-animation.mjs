/* Animation de suppression discrète (2026-09-29, demande explicite de Jean : "Ajoute une
   animation discrète lors de la suppression d'un support, d'une ressource, d'une plateforme
   .... aussi bien pour la liste des items que pour la liste des entraînements"). Vraie page +
   vrais émulateurs. Vérifie que window.p1FadeOutRow est bien appliqué (classe .p1-row-fade-out
   posée avant le retrait réel) dans les 3 endroits concernés : le gestionnaire de catalogue
   (ressources/supports/types/plateformes), le gestionnaire "Mes matières/cours" (mode
   personnalisé), et le tableau des entraînements. */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

try {
  const u = await mkUser({ courses: 1 });
  const { page } = await openPage(browser, u);

  await S("D1", "catalogue (support) : la ligne se fige en fondu AVANT de disparaître, jamais un retrait instantané", async () => {
    await page.evaluate(() => document.querySelector('[data-page="entrainements"]').click());
    await sleep(500);
    await page.evaluate(() => window._p1OpenCatalogModal("supports"));
    await sleep(150);
    // Ajoute un support personnalisé (jamais protégé, donc supprimable) pour ce test.
    await page.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = "Podcast"; });
    await page.evaluate(() => document.querySelector('#p1-catalog-new-swatches .tpx-swatch[data-color="#14b8a6"]').click());
    await page.evaluate(() => window._p1CatalogAdd());
    await sleep(150);

    const before = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    const id = await page.evaluate(() => window._p1GetAvailableSupports().find(s => s.label === "Podcast").id);
    assert(id, "support « Podcast » introuvable après ajout");

    await page.evaluate((rid) => document.querySelector(`.p1-catalog-row[data-id="${rid}"] .p1-catalog-delete`).click(), id);

    // Juste après le clic (avant la fin du fondu, ~200ms) : la ligne existe ENCORE dans le DOM,
    // avec la classe de fondu posée — jamais un retrait net et instantané.
    const justAfter = await page.evaluate((rid) => {
      const row = document.querySelector(`.p1-catalog-row[data-id="${rid}"]`);
      return { present: !!row, fading: !!row && row.classList.contains("p1-row-fade-out") };
    }, id);
    assert(justAfter.present, "la ligne a disparu INSTANTANÉMENT (aucune animation) au lieu de s'estomper");
    assert(justAfter.fading, "la classe .p1-row-fade-out n'est pas posée sur la ligne supprimée");

    // Après le délai de l'animation : la ligne a bien fini par disparaître (re-rendu de la liste).
    await sleep(400);
    const after = await page.evaluate((rid) => ({
      present: !!document.querySelector(`.p1-catalog-row[data-id="${rid}"]`),
      count: document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length,
    }), id);
    assert(!after.present, "la ligne est toujours là après le délai d'animation : suppression jamais effectuée");
    assert(after.count === before - 1, "le compte de lignes après suppression est incorrect : " + after.count + " (attendu " + (before - 1) + ")");
    await page.evaluate(() => window._p1CloseCatalogModal());
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("D2", "tableau des entraînements : même fondu avant le retrait de la ligne", async () => {
    await adb.doc(`users/${u.uid}/trainingItems/9001`).set({
      id: 9001, titre: "QCM 9001", type: "colle", matiere: "s1", plat: "edni",
      statut: "a-faire", archivedAt: null, updatedAt: new Date(),
    });
    await page.evaluate(() => window.p1StartTrainingsListener(window.currentUser.uid));
    await page.waitForFunction(() => (window.userData.trainings || []).some(t => t.id === 9001), { timeout: 15000 });
    await page.evaluate(() => window.renderTrainTable());
    await sleep(200);

    const before = await page.evaluate(() => document.querySelectorAll("#train-table-body tr").length);
    assert(await page.evaluate(() => !!document.querySelector('tr[data-train-id="9001"]')), "ligne 9001 introuvable avant suppression");

    await page.evaluate(() => { window._deleteTraining(9001); window.trainConfirmDelete(); });

    // Juste après : la ligne est ENCORE présente, avec la classe de fondu.
    const justAfter = await page.evaluate(() => {
      const row = document.querySelector('tr[data-train-id="9001"]');
      return { present: !!row, fading: !!row && row.classList.contains("p1-row-fade-out") };
    });
    assert(justAfter.present, "la ligne 9001 a disparu instantanément (aucune animation)");
    assert(justAfter.fading, "la classe .p1-row-fade-out n'est pas posée sur la ligne d'entraînement supprimée");

    await sleep(400);
    const after = await page.evaluate(() => ({
      present: !!document.querySelector('tr[data-train-id="9001"]'),
      count: document.querySelectorAll("#train-table-body tr").length,
    }));
    assert(!after.present, "la ligne 9001 est toujours affichée après le délai d'animation");
    assert(after.count === before - 1, "compte de lignes du tableau incorrect après suppression : " + after.count + " (attendu " + (before - 1) + ")");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("D3", "gestionnaire « Mes cours » (mode personnalisé) : transition discrète, ET le gestionnaire réapparaît bien après confirmation (vrai bug préexistant trouvé au passage)", async () => {
    // ⚠️ Bug réel trouvé en implémentant l'animation demandée (pas juste un souci d'animation) :
    // buildModal() n'accepte qu'UN SEUL overlay à la fois (id fixe #tpx-modal-overlay). Ouvrir la
    // boîte de confirmation "Archiver ce cours ?" DÉTRUISAIT donc déjà le gestionnaire "Gérer mon
    // programme" au moment même du clic sur la corbeille — après confirmation, le gestionnaire ne
    // réapparaissait JAMAIS (l'utilisateur se retrouvait sans aucun modal). Corrigé en rouvrant
    // explicitement le gestionnaire (openManager(mgrTab)) après un court délai (le temps que la
    // confirmation termine son propre fondu de sortie), au lieu de réutiliser un DOM déjà détaché.
    await page.evaluate(() => window.TPXPerso.setContentMode(window.TPXPerso.MODE_CUSTOM));
    await sleep(150);

    // Crée une matière personnalisée, puis un cours dedans (formulaires réels, comme un vrai utilisateur).
    await page.evaluate(() => window.TPXPerso.openSpecialtyModal(null));
    await sleep(150);
    await page.evaluate(() => { document.getElementById("tpx-mat-name").value = "Matière Test Anim"; });
    await page.evaluate(() => document.getElementById("tpx-mat-ok").click());
    await sleep(200);

    await page.evaluate(() => window.TPXPerso.openItemModal(null));
    await sleep(150);
    await page.evaluate(() => { document.getElementById("tpx-it-name").value = "Cours Test Anim"; });
    await page.evaluate(() => document.getElementById("tpx-it-ok").click());
    await sleep(300);

    await page.evaluate(() => window.TPXPerso.openManager("entry"));
    await sleep(200);
    const rowInfo = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(".tpx-mgr-row")];
      const row = rows.find(r => r.textContent.includes("Cours Test Anim"));
      return row ? { i: row.getAttribute("data-i"), count: rows.length } : null;
    });
    assert(rowInfo, "ligne « Cours Test Anim » introuvable dans le gestionnaire");

    await page.evaluate((i) => document.querySelector(`.tpx-mgr-act[data-act="del"][data-i="${i}"]`).click(), rowInfo.i);
    await sleep(150);
    // Confirmation : la boîte "Archiver ce cours ?" (confirmModal) doit apparaître — son bouton
    // de confirmation est #tpx-cf-yes (voir confirmModal()).
    const confirmed = await page.evaluate(() => {
      const btn = document.getElementById("tpx-cf-yes");
      if (!btn) return false;
      btn.click();
      return true;
    });
    assert(confirmed, "bouton de confirmation d'archivage (#tpx-cf-yes) introuvable");

    // Le RÉ-AFFICHAGE du gestionnaire est volontairement différé (~220ms) : juste après le clic,
    // rien d'anormal ne doit encore s'être passé de façon abrupte.
    await sleep(500);
    const after = await page.evaluate(() => {
      const overlay = document.getElementById("tpx-modal-overlay");
      const title = overlay ? overlay.querySelector(".unified-modal-heading")?.textContent : null;
      const rows = overlay ? [...overlay.querySelectorAll(".tpx-mgr-row")] : [];
      return {
        overlayExists: !!overlay,
        title,
        stillThere: rows.some(r => r.textContent.includes("Cours Test Anim")),
        count: rows.length,
      };
    });
    assert(after.overlayExists, "le gestionnaire n'est jamais réapparu après confirmation (régression du bug corrigé)");
    assert(after.title === "Gérer mon programme", "le modal réaffiché n'est pas le bon : " + JSON.stringify(after.title));
    assert(!after.stillThere, "« Cours Test Anim » est toujours listé après la réouverture du gestionnaire");
    assert(after.count === rowInfo.count - 1, "compte de lignes du gestionnaire incorrect après suppression : " + after.count + " (attendu " + (rowInfo.count - 1) + ")");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("D4", "gestionnaire « Mes matières » : \"Modifier\" rouvre le gestionnaire à la fermeture de la fiche (même onglet, même recherche) au lieu de le fermer purement et simplement", async () => {
    // Retour de Jean (03/10) : "pourquoi quand j'essaye de modifier une matière dans gérer mes
    // matières le modal gérer les matières se ferme ?" -- même cause que D3 (buildModal() à
    // overlay unique), mais sur "Modifier" cette fois, jamais corrigé jusqu'ici (D3 ne couvrait
    // que "Supprimer"). Corrigé via mgrPendingReturn/_tpxReturnTo (voir buildModal) : rouvre le
    // gestionnaire à la fermeture de N'IMPORTE QUELLE fiche ouverte depuis lui -- validation,
    // annulation, croix, voile ou Échap, tous passent par le même close().
    await page.evaluate(() => window.TPXPerso.openManager("spec"));
    await sleep(200);
    assert(await page.evaluate(() => !!document.getElementById("tpx-modal-overlay")), "le gestionnaire ne s'est pas ouvert");

    // Recherche en cours : doit être préservée au retour (comme l'onglet). Un terme assez
    // générique pour matcher le nom AVANT ("MatiereE2E") ET APRÈS ("MatiereRenommeeD4") le
    // renommage ci-dessous -- sinon la ligne renommée sortirait du filtre, faussant le test.
    await page.evaluate(() => {
      const q = document.getElementById("tpx-mgr-q");
      q.value = "Matiere";
      q.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(150);

    await page.evaluate(() => document.querySelector('.tpx-mgr-act[data-act="edit"]').click());
    await sleep(200);
    const duringEdit = await page.evaluate(() => document.querySelector("#tpx-modal-overlay .unified-modal-heading")?.textContent);
    assert(duringEdit === "Modifier la matière", "la fiche de modification ne s'est pas ouverte : " + JSON.stringify(duringEdit));

    await page.evaluate(() => {
      document.getElementById("tpx-mat-name").value = "MatiereRenommeeD4";
      document.getElementById("tpx-mat-ok").click();
    });
    // Fondu de sortie (200ms, voir buildModal().close()) + marge.
    await sleep(500);

    const after = await page.evaluate(() => {
      const overlay = document.getElementById("tpx-modal-overlay");
      return {
        overlayExists: !!overlay,
        title: overlay ? overlay.querySelector(".unified-modal-heading")?.textContent : null,
        firstRowTitle: overlay ? overlay.querySelector(".tpx-mgr-row .tpx-mgr-title")?.textContent : null,
        searchValue: document.getElementById("tpx-mgr-q")?.value,
      };
    });
    assert(after.overlayExists, "le gestionnaire ne s'est jamais rouvert après la fiche de modification");
    assert(after.title === "Gérer mon programme", "le modal réaffiché n'est pas le bon : " + JSON.stringify(after.title));
    assert(after.firstRowTitle === "MatiereRenommeeD4", "le renommage n'est pas reflété dans la liste rouverte : " + JSON.stringify(after.firstRowTitle));
    assert(after.searchValue === "Matiere", "la recherche en cours n'a pas été préservée au retour : " + JSON.stringify(after.searchValue));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
