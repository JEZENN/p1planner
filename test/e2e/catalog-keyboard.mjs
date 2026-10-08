/* Clavier tactile + parité EDN pour les listes personnalisables (audit 02/10, Lot B).
   Vraie page + vrais émulateurs.

   B1 : Entrée/OK dans le champ d'AJOUT valide l'ajout (avant ce correctif : quittait juste le
   champ, il fallait ensuite toucher « Ajouter » séparément).
   B2 : un retour à la ligne envoyé par le clavier comme un évènement `input` (claviers Android,
   sans `keydown` Entrée détectable) a le même effet que B1.
   B3 : nom vide ou doublon (sans tenir compte de la casse/des accents) refusés avec un message
   visible, jamais un échec silencieux.
   B4 : carte « Listes personnalisables » dans les Paramètres, sous « Entraînements », un bouton
   par liste qui ouvre le bon gestionnaire PAR-DESSUS les Paramètres. */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

try {
  const u = await mkUser({ courses: 1 });
  const { page } = await openPage(browser, u);

  await S("KB1", "champ d'ajout (nom) : Entrée valide directement l'ajout, pas besoin de toucher « Ajouter »", async () => {
    await page.evaluate(() => window._p1OpenCatalogModal("resources"));
    await sleep(150);
    const before = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    await page.evaluate(() => {
      const el = document.getElementById("p1-catalog-new-label");
      el.readOnly = false;
      el.value = "ParEntree";
    });
    await page.focus("#p1-catalog-new-label");
    await page.keyboard.press("Enter");
    await sleep(500);
    const after = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    assert(after === before + 1, "Entrée dans le champ d'ajout n'a pas créé l'entrée (avant ce correctif : quittait juste le champ) : " + before + " -> " + after);
    assert(await page.evaluate(() => window._p1GetAvailableResources().some((r) => r.label === "ParEntree")), "« ParEntree » absent du catalogue après Entrée");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("KB2", "champ d'ajout (acronyme, supports) : Entrée valide aussi l'ajout", async () => {
    await page.evaluate(() => document.querySelector('[data-page="entrainements"]').click());
    await sleep(300);
    await page.evaluate(() => window._p1OpenCatalogModal("supports"));
    await sleep(150);
    await page.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = "ViaAbbr"; });
    await page.evaluate(() => { const el = document.getElementById("p1-catalog-new-abbr"); el.readOnly = false; el.value = "VIA"; });
    await page.focus("#p1-catalog-new-abbr");
    await page.keyboard.press("Enter");
    await sleep(500);
    assert(await page.evaluate(() => window._p1GetAvailableSupports().some((s) => s.label === "ViaAbbr" && s.abbr === "VIA")), "ajout via Entrée dans le champ acronyme non pris en compte");
  });

  await S("KB3", "clavier Android (évènement input insertLineBreak, pas de keydown Entrée) : même effet que B1", async () => {
    await page.evaluate(() => window._p1OpenCatalogModal("resources"));
    await sleep(150);
    await page.evaluate(() => {
      const el = document.getElementById("p1-catalog-new-label");
      el.readOnly = false;
      el.value = "ViaAndroid\n"; // le clavier insère le retour à la ligne lui-même, dans la valeur
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertLineBreak" }));
    });
    await sleep(500);
    assert(await page.evaluate(() => window._p1GetAvailableResources().some((r) => r.label === "ViaAndroid")), "retour à la ligne clavier (insertLineBreak) n'a pas déclenché l'ajout");
    // Vérifie aussi qu'un vrai COLLAGE multi-lignes (inputType différent) n'ajoute rien tout seul.
    const beforePaste = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    await page.evaluate(() => {
      const el = document.getElementById("p1-catalog-new-label");
      el.readOnly = false;
      el.value = "ColleMultiLigne\nSuite";
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
    });
    await sleep(300);
    const afterPaste = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    assert(afterPaste === beforePaste, "un collage multi-lignes a déclenché un ajout automatique, ce n'est pas le comportement attendu");
  });

  // KB4/KB5/KB6 utilisent le catalogue des TYPES D'ENTRAÎNEMENT (jamais touché par KB1-KB3,
  // 3 défauts + plafond 6 — marge suffisante et état prévisible, indépendant de l'ORDRE des
  // scénarios précédents sur resources/supports).
  await S("KB4", "ligne EXISTANTE : Entrée valide juste la saisie (ne crée jamais une nouvelle entrée)", async () => {
    await page.evaluate(() => document.querySelector('[data-page="entrainements"]').click());
    await sleep(300);
    await page.evaluate(() => window._p1OpenCatalogModal("trainTypes"));
    await sleep(150);
    // Entrée propre à ce test (jamais un défaut partagé par d'autres scénarios) : un ajout avant
    // le renommage, pour ne dépendre d'aucun état laissé par un autre scénario.
    await page.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = "KB4"; });
    await page.evaluate(() => window._p1CatalogAdd());
    await sleep(400);
    const id = await page.evaluate(() => window._p1GetAvailableTrainTypes().find((t) => t.label === "KB4").id);
    const before = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    await page.evaluate((rid) => {
      const el = document.querySelector(`.p1-catalog-row[data-id="${rid}"] .p1-catalog-text-field`);
      el.readOnly = false;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length); // curseur en FIN de texte (focus() seul ne le garantit pas)
    }, id);
    await page.keyboard.type(" renomme");
    await page.keyboard.press("Enter");
    await sleep(400);
    const after = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    assert(after === before, "Entrée sur une ligne existante a créé une NOUVELLE entrée au lieu de juste valider le renommage");
    assert(await page.evaluate((rid) => window._p1GetAvailableTrainTypes().find((t) => t.id === rid).label === "KB4 renomme", id), "le renommage par Entrée n'a pas été pris en compte");
  });

  await S("KB5", "doublon (casse/accents différents) refusé avec un message visible, aucune entrée en double créée", async () => {
    await page.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = "Doublon KB5"; });
    await page.evaluate(() => window._p1CatalogAdd());
    await sleep(400);
    const before = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    await page.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = "  DOUBLON kb5  "; }); // même nom, casse/espaces différents
    await page.evaluate(() => window._p1CatalogAdd());
    await sleep(300);
    const after = await page.evaluate(() => document.querySelectorAll("#p1-catalog-list .p1-catalog-row").length);
    assert(after === before, "un doublon (casse/espaces différents) a quand même été ajouté : " + before + " -> " + after);
    const msg = await page.evaluate(() => document.getElementById("p1-catalog-add-error").textContent);
    assert(/existe déjà/i.test(msg), "aucun message de doublon visible : " + JSON.stringify(msg));
    assert(await page.evaluate(() => document.getElementById("p1-catalog-add-error").classList.contains("is-shown")), "le message de doublon n'est pas affiché (classe is-shown absente)");
  });

  await S("KB6", "nom vide refusé avec un message visible (avant ce correctif : rien ne se passait)", async () => {
    await page.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = "   "; });
    await page.evaluate(() => window._p1CatalogAdd());
    await sleep(200);
    const msg = await page.evaluate(() => document.getElementById("p1-catalog-add-error").textContent);
    assert(/nom/i.test(msg), "aucun message visible pour un nom vide : " + JSON.stringify(msg));
    // Le message disparaît une fois qu'un ajout valide réussit.
    await page.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = "NomValide" + Date.now(); });
    await page.evaluate(() => window._p1CatalogAdd());
    await sleep(400);
    assert(!(await page.evaluate(() => document.getElementById("p1-catalog-add-error").classList.contains("is-shown"))), "le message d'erreur reste affiché après un ajout réussi");
  });

  await S("KB7", "Paramètres : carte « Listes personnalisables » sous « Entraînements », 4 boutons ouvrent le bon gestionnaire par-dessus, fermeture ramène aux Paramètres", async () => {
    await page.evaluate(() => window._p1CloseCatalogModal());
    await sleep(250);
    await page.evaluate(() => document.getElementById("user-avatar").click());
    await sleep(150);
    await page.evaluate(() => window.openSettingsModal());
    await sleep(300);

    const order = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#settings-modal-overlay .settings-card")];
      return cards.map((c) => c.getAttribute("data-setting"));
    });
    const iTrain = order.indexOf("tpx-trainings");
    const iCat = order.indexOf("p1-catalogs");
    assert(iCat !== -1, "carte « Listes personnalisables » absente des Paramètres");
    assert(iTrain === -1 || iCat === iTrain + 1, "la carte n'est pas placée juste sous « Entraînements » : ordre = " + JSON.stringify(order));

    // .p1-catalog-settings-row est réutilisée par la carte "Autres actions" (retour de Jean,
    // même style de lignes) -- on scope au SÉLECTEUR de la carte "Listes personnalisables" pour
    // ne compter que ses 4 boutons à elle.
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-setting="p1-catalogs"] .p1-catalog-settings-row')].length);
    assert(rows === 4, "nombre de boutons inattendu dans la carte : " + rows);

    await page.evaluate(() => document.querySelectorAll('[data-setting="p1-catalogs"] .p1-catalog-settings-row')[1].click()); // Supports
    await sleep(250);
    assert(await page.evaluate(() => document.getElementById("p1-catalog-modal").classList.contains("active")), "le gestionnaire ne s'est pas ouvert par-dessus les Paramètres");
    assert(await page.evaluate(() => window._p1CatalogState.kind === "supports"), "le bouton « Supports de tour » n'a pas ouvert le bon catalogue");
    assert(await page.evaluate(() => document.getElementById("settings-modal-overlay").classList.contains("active")), "les Paramètres se sont refermés au lieu de rester ouverts en dessous");

    await page.evaluate(() => window._p1CloseCatalogModal());
    await sleep(300);
    assert(await page.evaluate(() => document.getElementById("settings-modal-overlay").classList.contains("active")), "fermer le gestionnaire n'est pas revenu aux Paramètres (restés ouverts)");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
