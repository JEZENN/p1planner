/* Catalogue personnalisable RESSOURCES + SUPPORTS (2026-09-27, revu après retour de Jean sur
   la 1ʳᵉ version) — vraie page + vrais émulateurs. Couvre : ressources/supports PAR DÉFAUT
   protégés (jamais supprimables, cadenas), ajout borné (palette de couleurs restreinte,
   acronyme dédié pour les supports), renommage/recoloration, persistance Firestore, parade
   anti-autofill navigateur (readonly + attributs "ignore"), échappement XSS, repli d'affichage
   pour une valeur historique retirée du catalogue, non-régression du bouton "···" ressources.
   CSS + données : rien de TypixClin touché, seul public/tableur.html est modifié par cette
   fonctionnalité. */
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

async function goToItems(page) {
  await page.evaluate(() => document.querySelector('[data-page="items"]').click());
  await sleep(600);
  await page.evaluate(() => { if (typeof window.renderItemsTable === "function") window.renderItemsTable(); });
  await sleep(300);
}

const openCatalog = (page, kind) => page.evaluate((k) => window._p1OpenCatalogModal(k), kind);

/* Ajoute une entrée via les VRAIS contrôles (nom, acronyme si fourni, clic sur une pastille de
   la palette restreinte — pas de saisie RGB libre, conforme au nouveau sélecteur). */
async function addEntry(page, label, color, abbr) {
  await page.evaluate((l) => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = l; }, label);
  if (abbr !== undefined) {
    await page.evaluate((a) => { const el = document.getElementById("p1-catalog-new-abbr"); el.readOnly = false; el.value = a; }, abbr);
  }
  const clicked = await page.evaluate((c) => {
    const btn = document.querySelector(`#p1-catalog-new-swatches .tpx-swatch[data-color="${c}"]`);
    if (!btn) return false;
    btn.click();
    return true;
  }, color);
  assert(clicked, `pastille de couleur ${color} introuvable dans la palette restreinte`);
  await page.evaluate(() => window._p1CatalogAdd());
  await sleep(120);
}

const catalogState = (page, kind) => page.evaluate((k) => (k === "resources" ? window._p1GetAvailableResources() : window._p1GetAvailableSupports()).map(r => ({ id: r.id, label: r.label, color: r.color, abbr: r.abbr })), kind);
const addDisabled = (page) => page.evaluate(() => document.getElementById("p1-catalog-add-btn").disabled);
const isLocked = (page, id) => page.evaluate((i) => !!document.querySelector(`.p1-catalog-row[data-id="${i}"] .p1-catalog-lock`), id);
const hasDeleteBtn = (page, id) => page.evaluate((i) => !!document.querySelector(`.p1-catalog-row[data-id="${i}"] .p1-catalog-delete`), id);

try {
  // ═══════════════════ RESSOURCES ═══════════════════
  const uR = await mkUser({ courses: 1 });
  let page = (await openPage(browser, uR)).page;
  await goToItems(page);

  // Sélectionne les 3 ressources par défaut à afficher (flux réel "Configurer" — sans ça,
  // selectedResources reste vide et le tableur affiche le bouton "Configurer" à la place des
  // cases). Nécessaire pour tester le comportement du bouton "···" ensuite.
  await page.evaluate(() => {
    window.openResourcesConfigModal();
    window._p1GetAvailableResources().slice(0, 3).forEach(r => window.toggleResourceOption(r.id));
    window.saveResourcesConfig();
  });
  await sleep(200);

  await S("R1", "état par défaut : 3 ressources, aucun bouton « ··· » (rien à survoler)", async () => {
    const list = await catalogState(page, "resources");
    assert(list.length === 3, "catalogue par défaut ≠ 3 : " + JSON.stringify(list));
    const overflowBtn = await page.evaluate(() => !!document.querySelector("#items-table-body .overflow-btn"));
    assert(!overflowBtn, "bouton ··· présent alors qu'aucune ressource au-delà des 3 affichées");
  });

  await S("A1", "parade anti-autofill : champs nom/acronyme en lecture seule au repos, autocomplete=off, déverrouillés au premier geste réel", async () => {
    await openCatalog(page, "resources");
    const before = await page.evaluate(() => {
      const el = document.getElementById("p1-catalog-new-label");
      return { readonly: el.readOnly, autocomplete: el.getAttribute("autocomplete"), lpignore: el.getAttribute("data-lpignore") };
    });
    assert(before.readonly === true, "le champ nom devrait démarrer en lecture seule (parade autofill)");
    assert(before.autocomplete === "off", "autocomplete devrait être 'off' sur le champ nom");
    assert(before.lpignore === "true", "attribut anti-gestionnaire tiers manquant (data-lpignore)");
    // Un vrai pointerdown (comme un clic réel) doit déverrouiller le champ SANS étape supplémentaire.
    await page.evaluate(() => {
      const el = document.getElementById("p1-catalog-new-label");
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    const after = await page.evaluate(() => document.getElementById("p1-catalog-new-label").readOnly);
    assert(after === false, "le champ nom n'a pas été déverrouillé par un pointerdown réel");
  });

  await S("R2", "ajout d'une 4e ressource (palette restreinte) : catalogue à 4, bouton « ··· » apparaît et s'ouvre sans popup vide", async () => {
    await addEntry(page, "Annale+", "#ef4444");
    const list = await catalogState(page, "resources");
    assert(list.length === 4, "catalogue après ajout ≠ 4 : " + JSON.stringify(list));
    assert(list[3].label === "Annale+" && list[3].color === "#ef4444", "entrée ajoutée incorrecte : " + JSON.stringify(list[3]));
    await page.evaluate(() => window._p1CloseCatalogModal());
    await goToItems(page);
    const hasOverflow = await page.evaluate(() => !!document.querySelector("#items-table-body .overflow-btn"));
    assert(hasOverflow, "bouton ··· absent alors que 4 ressources existent (3 affichées + 1 en overflow)");
    // Clique dessus : le popup doit contenir la 4e ressource, jamais rester "vide".
    const popupHasItem = await page.evaluate(() => {
      const btn = document.querySelector("#items-table-body .overflow-btn");
      btn.click();
      const popup = document.getElementById("resource-overflow-popup");
      return !!popup && popup.textContent.includes("Annale+");
    });
    assert(popupHasItem, "popup « ··· » vide ou introuvable après ajout d'une 4e ressource");
  });

  await S("R3", "défauts protégés : Annale/Tutorat/Prépa affichent un cadenas, jamais un bouton supprimer", async () => {
    await openCatalog(page, "resources");
    const list = await catalogState(page, "resources");
    for (const d of list.filter(r => ["annale", "tutorat", "prepa"].includes(r.id))) {
      assert(await isLocked(page, d.id), `${d.id} devrait afficher un cadenas (protégé)`);
      assert(!(await hasDeleteBtn(page, d.id)), `${d.id} ne devrait pas avoir de bouton supprimer`);
      const before = (await catalogState(page, "resources")).length;
      await page.evaluate((id) => window._p1CatalogDelete(id), d.id); // tentative directe malgré le garde-fou UI
      const after = (await catalogState(page, "resources")).length;
      assert(before === after, `${d.id} a pu être supprimé malgré la protection`);
    }
    // La ressource ajoutée en R2 (non protégée), elle, a bien un bouton supprimer.
    const custom = list.find(r => !["annale", "tutorat", "prepa"].includes(r.id));
    assert(await hasDeleteBtn(page, custom.id), "la ressource personnalisée devrait avoir un bouton supprimer");
    assert(!(await isLocked(page, custom.id)), "la ressource personnalisée ne devrait pas afficher de cadenas");
  });

  await S("R4", "plafond total MAX_CUSTOM_RESOURCES=6 (3 défauts + 3 ajouts) : ajout bloqué au-delà, bouton + désactivé", async () => {
    await addEntry(page, "R5", "#f59e0b"); // 4 -> 5
    await addEntry(page, "R6", "#06b6d4"); // 5 -> 6 = plafond (3 défauts + 3 ajouts)
    let list = await catalogState(page, "resources");
    assert(list.length === 6, "devrait être à 6 (plafond) : " + JSON.stringify(list.map(r => r.label)));
    assert(await addDisabled(page), "le bouton d'ajout devrait être désactivé au plafond");
    await addEntry(page, "Trop", "#6366f1"); // tentative au-delà du plafond : doit être ignorée
    list = await catalogState(page, "resources");
    assert(list.length === 6 && !list.some(r => r.label === "Trop"), "une 7e ressource a été ajoutée malgré le plafond : " + JSON.stringify(list.map(r => r.label)));
  });

  await S("R7", "suppression = ARCHIVAGE (jamais une suppression dure) : libère le plafond, jamais résolue à nouveau après reload", async () => {
    const before = await catalogState(page, "resources");
    const target = before.find(r => r.label === "R6");
    assert(target, "ressource « R6 » introuvable avant suppression : " + JSON.stringify(before));
    await page.evaluate((id) => window._p1CatalogDelete(id), target.id);
    const active = await catalogState(page, "resources");
    assert(!active.some(r => r.id === target.id), "la ressource supprimée apparaît encore dans le catalogue ACTIF");
    assert(active.length === 5, "le plafond ne s'est pas libéré après suppression : " + JSON.stringify(active.map(r => r.label)));
    assert(!(await addDisabled(page)), "le bouton d'ajout devrait être réactivé (une place libérée)");
    const full = await page.evaluate(() => window._p1GetAllResourcesFull().map(r => ({ id: r.id, label: r.label, archived: r.archived })));
    const archivedEntry = full.find(r => r.id === target.id);
    assert(archivedEntry && archivedEntry.archived === true && archivedEntry.label === "R6",
      "la ressource supprimée n'est pas conservée (archived:true, nom intact) dans la liste complète : " + JSON.stringify(archivedEntry));
    // Ajoute une nouvelle ressource : la place libérée doit être réellement utilisable (l'entrée
    // archivée ne doit JAMAIS compter dans le plafond).
    await addEntry(page, "R8", "#8b5cf6");
    const afterAdd = await catalogState(page, "resources");
    assert(afterAdd.length === 6, "le plafond n'a pas repris sa valeur normale après un nouvel ajout : " + JSON.stringify(afterAdd.map(r => r.label)));
    // Persistance : l'archivage (et non une renaissance de l'entrée) doit survivre au reload.
    await page.evaluate(() => location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(1800);
    const fullAfterReload = await page.evaluate(() => window._p1GetAllResourcesFull().map(r => ({ id: r.id, archived: r.archived })));
    const stillArchived = fullAfterReload.find(r => r.id === target.id);
    assert(stillArchived && stillArchived.archived === true, "l'archivage n'a pas survécu au rechargement : " + JSON.stringify(stillArchived));
    const activeAfterReload = await catalogState(page, "resources");
    assert(!activeAfterReload.some(r => r.id === target.id), "la ressource archivée est réapparue dans le catalogue actif après reload");
    await goToItems(page);
  });

  await S("R5", "renommage (avec échappement XSS) + recoloration d'un DÉFAUT, répercutés sur l'affichage du tableur", async () => {
    const list = await catalogState(page, "resources");
    const targetId = list[0].id; // "annale" — protégé contre la SUPPRESSION, mais reste renommable/recolorable
    const xssLabel = '<img src=x onerror=alert(1)>'; // tronqué à 16 caractères par MAX_CATALOG_LABEL
    await page.evaluate((id, l) => window._p1CatalogRename(id, l), targetId, xssLabel);
    await page.evaluate((id, c) => window._p1CatalogRecolor(id, c), targetId, "#a855f7");
    const updated = (await catalogState(page, "resources")).find(r => r.id === targetId);
    assert(updated.label.length <= 16, "le libellé n'a pas été tronqué à 16 caractères : " + JSON.stringify(updated.label));
    assert(updated.color === "#a855f7", "la couleur n'a pas été appliquée : " + JSON.stringify(updated));
    await goToItems(page);
    const boxHtml = await page.evaluate((id) => {
      const box = document.querySelector(`#items-table-body .resource-box[onclick*="${id}"]`);
      return box ? box.outerHTML : null;
    }, targetId);
    assert(boxHtml, "case de ressource introuvable après renommage");
    assert(!boxHtml.includes("<img"), "XSS NON échappé dans le rendu : " + boxHtml);
    assert(boxHtml.includes("&lt;img"), "le libellé échappé n'apparaît pas comme attendu : " + boxHtml);
    assert(boxHtml.includes("a855f7"), "la nouvelle couleur n'apparaît pas dans le style de la case : " + boxHtml);
    const alerts = page.__errors.filter(e => /alert/i.test(e));
    assert(alerts.length === 0, "une alerte JS a été déclenchée (XSS exécuté) : " + JSON.stringify(alerts));
    await page.evaluate(() => window._p1CloseCatalogModal());
  });

  await S("R6", "persistance Firestore : le catalogue personnalisé (dont le défaut renommé) survit à un rechargement complet", async () => {
    const before = await catalogState(page, "resources");
    await page.evaluate(() => location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(1800); // laisse _checkSelectedResources() (async, post-connexion) s'exécuter
    const after = await catalogState(page, "resources");
    assert(JSON.stringify(after) === JSON.stringify(before), "catalogue différent après rechargement :\navant=" + JSON.stringify(before) + "\naprès=" + JSON.stringify(after));
  });

  // ═══════════════════ SUPPORTS ═══════════════════
  const uS = await mkUser({ courses: 2 });
  await adb.doc(`users/${uS.uid}/courses/c1`).set({ tourConfidences: [3, null], tourDates: ["2026-09-01", null], tourSupports: ["qcm", null] }, { merge: true });
  // c2 porte une valeur HISTORIQUE ("college") jamais réintroductible via l'UI mais qui doit
  // continuer à s'afficher correctement (repli LEGACY_SUPPORT_META), même après un ajout/suppression
  // dans le catalogue courant.
  await adb.doc(`users/${uS.uid}/courses/c2`).set({ tourConfidences: [4], tourDates: ["2026-09-02"], tourSupports: ["college"] }, { merge: true });
  page = (await openPage(browser, uS)).page;
  await goToItems(page);

  await S("S1", "état par défaut : 4 supports protégés (QCM/Fiche de cours/Conf/Fiche perso), acronymes historiques QCM/CRS/CNF/PER", async () => {
    const list = await catalogState(page, "supports");
    assert(list.length === 4, "catalogue supports par défaut ≠ 4 : " + JSON.stringify(list));
    // Régression réelle rencontrée DEUX FOIS (vérification visuelle, puis à nouveau après un
    // cycle sauvegarde/rechargement en cours de suite) : le plafond de longueur destiné à une
    // SAISIE utilisateur tronquait aussi les libellés par défaut plus longs que lui
    // ("Fiche de cours" -> "Fiche de cou" avec un plafond à 12). Le plafond (MAX_CATALOG_LABEL)
    // a été relevé à 16 (≥ 14, le plus long libellé par défaut) pour ne plus jamais collisionner
    // avec un texte que l'app contrôle elle-même. Vérifié explicitement ici.
    const labelById = Object.fromEntries(list.map(s => [s.id, s.label]));
    assert(labelById.cours === "Fiche de cours", "libellé par défaut tronqué (cours) : " + JSON.stringify(labelById.cours));
    assert(labelById.perso === "Fiche perso", "libellé par défaut tronqué (perso) : " + JSON.stringify(labelById.perso));
    const abbrById = Object.fromEntries(list.map(s => [s.id, s.abbr]));
    assert(abbrById.qcm === "QCM" && abbrById.cours === "CRS" && abbrById.conf === "CNF" && abbrById.perso === "PER",
      "acronymes par défaut incorrects (régression possible vs l'ancienne table figée) : " + JSON.stringify(abbrById));
    const btnCount = await page.evaluate(() => {
      const badge = document.querySelector('.tour-badge[data-fc="c1"][data-tour="0"]');
      badge.click();
      return document.querySelectorAll("#tour-support-buttons .support-btn").length;
    });
    assert(btnCount === 4, "le modal de tour n'affiche pas 4 boutons Support : " + btnCount);
    await openCatalog(page, "supports");
    for (const d of list) {
      assert(await isLocked(page, d.id), `${d.id} devrait afficher un cadenas (support par défaut protégé)`);
    }
    await page.evaluate(() => window._p1CloseCatalogModal());
  });

  await S("S2", "repli historique : un support « college » enregistré (retiré du catalogue) s'affiche encore (COL), pas de crash", async () => {
    const badgeText = await page.evaluate(() => {
      const el = document.querySelector('#items-table-body .tour-support');
      return el ? el.textContent.trim() : null;
    });
    // c1 (support=qcm, catalogue par défaut) OU c2 (support=college, valeur historique) doivent
    // tous deux être visibles sans erreur JS.
    assert(page.__errors.length === 0, "erreurs JS pendant le rendu des supports : " + JSON.stringify(page.__errors));
    assert(badgeText, "aucun badge de support rendu (devrait au moins afficher QCM ou COL)");
  });

  await S("S3", "ajout d'un support personnalisé AVEC acronyme choisi, sélectionnable dans le modal de tour, sauvegardé et rendu (avec CET acronyme) au reload", async () => {
    await openCatalog(page, "supports");
    await addEntry(page, "Ronéo", "#6366f1", "RON");
    const list = await catalogState(page, "supports");
    assert(list.length === 5 && list[4].label === "Ronéo" && list[4].abbr === "RON", "support personnalisé (avec acronyme) non ajouté : " + JSON.stringify(list));
    await page.evaluate(() => window._p1CloseCatalogModal());
    const newId = list[4].id;
    // Modifie le T1 de c1 (déjà enregistré avec support="qcm") pour lui affecter ce nouveau
    // support personnalisé, via le VRAI modal (mode édition) — vérifie l'écriture Firestore
    // ET le rendu après reload, pas seulement l'état en mémoire.
    await page.evaluate((id) => {
      const badge = document.querySelector('.tour-badge[data-fc="c1"][data-tour="0"]');
      badge.click();
    }, newId);
    await sleep(150);
    await page.evaluate((id) => {
      document.querySelector(`#tour-support-buttons .support-btn[data-support="${id}"]`).click();
    }, newId);
    await page.evaluate(() => document.getElementById("btn-save-tour").click());
    await sleep(400);
    const saved = (await adb.doc(`users/${uS.uid}/courses/c1`).get()).data();
    assert(saved.tourSupports && saved.tourSupports[0] === newId, "le support personnalisé n'a pas été sauvegardé sur Firestore : " + JSON.stringify(saved.tourSupports));
    await page.evaluate(() => location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(1800);
    await goToItems(page);
    const badgeAfterReload = await page.evaluate(() => {
      const els = [...document.querySelectorAll('#items-table-body .tour-support')];
      return els.map(e => e.textContent.trim());
    });
    // Doit afficher EXACTEMENT l'acronyme choisi ("RON"), pas une déduction automatique du nom.
    assert(badgeAfterReload.includes("RON"), "l'acronyme personnalisé choisi (RON) n'est pas rendu après reload : " + JSON.stringify(badgeAfterReload));
  });

  await S("S4", "plafond total MAX_CUSTOM_SUPPORTS=7 (4 défauts + 3 ajouts)", async () => {
    await openCatalog(page, "supports");
    await addEntry(page, "S6", "#84cc16", "SIX"); // 5 -> 6 (Ronéo posé en S3 + S6)
    await addEntry(page, "S7", "#f97316", "SPT"); // 6 -> 7 = plafond (4 défauts + 3 ajouts : Ronéo, S6, S7)
    let list = await catalogState(page, "supports");
    assert(list.length === 7, "devrait être à 7 : " + JSON.stringify(list.map(s => s.label)));
    assert(await addDisabled(page), "bouton d'ajout devrait être désactivé au plafond (supports)");
    await addEntry(page, "Trop", "#8b5cf6", "TRO");
    list = await catalogState(page, "supports");
    assert(list.length === 7, "plafond dépassé (supports) : " + JSON.stringify(list.map(s => s.label)));
    await page.evaluate(() => window._p1CloseCatalogModal());
  });

  await S("S5", "AUDIT — suppression d'un support DÉJÀ UTILISÉ par un tour enregistré (c1/T1, « Ronéo »/RON, posé en S3) : jamais de perte/corruption, jamais de repli illisible", async () => {
    const before = await catalogState(page, "supports");
    const roneo = before.find(r => r.label === "Ronéo");
    assert(roneo, "support « Ronéo » introuvable avant suppression : " + JSON.stringify(before));
    // Vérifie l'état AVANT suppression : le tour c1/T1 référence bien cet id.
    const saved = (await adb.doc(`users/${uS.uid}/courses/c1`).get()).data();
    assert(saved.tourSupports[0] === roneo.id, "précondition invalide : c1/T1 ne référence pas Ronéo : " + JSON.stringify(saved.tourSupports));
    await openCatalog(page, "supports");
    await page.evaluate((id) => window._p1CatalogDelete(id), roneo.id);
    await page.evaluate(() => window._p1CloseCatalogModal());
    // 1) Aucune perte de données : le document Firestore du cours garde EXACTEMENT la même
    //    référence — la suppression du catalogue n'écrit RIEN sur les cours existants.
    const savedAfter = (await adb.doc(`users/${uS.uid}/courses/c1`).get()).data();
    assert(savedAfter.tourSupports[0] === roneo.id, "la suppression du support a modifié/perdu la donnée du cours : " + JSON.stringify(savedAfter.tourSupports));
    // 2) Affichage : le badge continue de montrer l'acronyme RÉEL ("RON"), jamais un repli
    //    générique illisible dérivé de l'id interne (ex. les 3 premiers caractères de l'id).
    await goToItems(page);
    const badgeTexts = await page.evaluate(() => [...document.querySelectorAll('#items-table-body .tour-support')].map(e => e.textContent.trim()));
    assert(badgeTexts.includes("RON"), "le badge n'affiche plus « RON » après suppression du support (repli illisible ou case vide) : " + JSON.stringify(badgeTexts));
    assert(page.__errors.length === 0, "erreurs JS après suppression d'un support utilisé : " + JSON.stringify(page.__errors));
    // 3) Le support supprimé ne réapparaît plus comme choix dans le modal de tour (catalogue actif).
    const stillPickable = await page.evaluate((id) => {
      const badge = document.querySelector('.tour-badge[data-fc="c1"][data-tour="0"]');
      badge.click();
      return !!document.querySelector(`#tour-support-buttons .support-btn[data-support="${id}"]`);
    }, roneo.id);
    assert(!stillPickable, "le support supprimé apparaît encore comme choix dans le modal de tour");
    // 4) Éditer ET resauvegarder CE MÊME tour (sans toucher au support) ne doit ni planter ni
    //    réinjecter un id différent — la référence orpheline reste stable tant qu'on ne change
    //    pas explicitement le support.
    await page.evaluate(() => document.getElementById("btn-save-tour").click());
    await sleep(400);
    const savedAfterResave = (await adb.doc(`users/${uS.uid}/courses/c1`).get()).data();
    assert(savedAfterResave.tourSupports[0] === roneo.id, "réenregistrer le tour a altéré la référence au support supprimé : " + JSON.stringify(savedAfterResave.tourSupports));
    // 5) Persistance de l'archivage + du rendu correct après un rechargement complet.
    await page.evaluate(() => location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(1800);
    await goToItems(page);
    const badgeTextsAfterReload = await page.evaluate(() => [...document.querySelectorAll('#items-table-body .tour-support')].map(e => e.textContent.trim()));
    assert(badgeTextsAfterReload.includes("RON"), "« RON » n'est plus affiché après reload (suite à la suppression) : " + JSON.stringify(badgeTextsAfterReload));
    assert(page.__errors.length === 0, "erreurs JS après reload avec un support supprimé référencé : " + JSON.stringify(page.__errors));
  });

  await S("V1", "aucun champ « input type=text » adjacent dans le gestionnaire (parade Chrome/Edge « Enregistrer le mot de passe ? ») + modal borné avec un seul défilement (liste de 7 supports entièrement atteignable)", async () => {
    await openCatalog(page, "supports"); // catalogue à 7 (4 défauts + Ronéo archivé + S6 + S7), le cas visé par le retour de Jean
    const structure = await page.evaluate(() => {
      const modal = document.getElementById("p1-catalog-modal");
      return {
        // Le bug remonté (Chrome/Edge propose d'enregistrer un mot de passe) vient de 2
        // <input type="text"> consécutifs dans le DOM (Nom + Acronyme) — plus aucun ne doit
        // exister dans ce gestionnaire, remplacés par des <textarea> (voir _p1CatalogRowHtml).
        textInputCount: modal.querySelectorAll('input[type="text"]').length,
        textareaCount: modal.querySelectorAll("textarea").length,
      };
    });
    assert(structure.textInputCount === 0, "il reste des <input type=\"text\"> dans le gestionnaire (risque de détection identifiant/mot de passe) : " + JSON.stringify(structure));
    assert(structure.textareaCount >= 9, "pas assez de <textarea> (attendu au moins Nom+Acronyme de l'ajout + 7 lignes x Nom, plus Acronyme pour les 3 personnalisées) : " + JSON.stringify(structure));
    // Modal borné (max-height) : la boîte ne doit jamais dépasser la fenêtre, et le corps doit
    // réellement défiler (scrollHeight > clientHeight) puisque 7 lignes + la carte "Ajouter" ne
    // tiennent pas dans une petite fenêtre de test.
    await page.setViewport({ width: 420, height: 700 });
    await sleep(200);
    const scroll = await page.evaluate(() => {
      const box = document.querySelector("#p1-catalog-modal .resources-config-content");
      const body = document.querySelector("#p1-catalog-modal .resources-config-body");
      return {
        boxHeight: box.getBoundingClientRect().height,
        viewportHeight: innerHeight,
        bodyScrollHeight: body.scrollHeight,
        bodyClientHeight: body.clientHeight,
      };
    });
    assert(scroll.boxHeight <= scroll.viewportHeight + 1, `la boîte du modal (${scroll.boxHeight}px) dépasse la fenêtre (${scroll.viewportHeight}px) — devrait être bornée par max-height`);
    assert(scroll.bodyScrollHeight > scroll.bodyClientHeight, `le corps du modal ne défile pas alors que le contenu (${scroll.bodyScrollHeight}px) dépasse sa hauteur visible (${scroll.bodyClientHeight}px)`);
    // La dernière ligne ("S7") doit être atteignable en faisant défiler CE conteneur jusqu'en bas.
    const lastRowReachable = await page.evaluate(() => {
      const body = document.querySelector("#p1-catalog-modal .resources-config-body");
      body.scrollTop = body.scrollHeight;
      const rows = [...document.querySelectorAll("#p1-catalog-list .p1-catalog-row")];
      const last = rows[rows.length - 1];
      const r = last.getBoundingClientRect(), b = body.getBoundingClientRect();
      return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
    });
    assert(lastRowReachable, "la dernière ligne du catalogue n'est pas atteignable en défilant le corps du modal");
    await page.evaluate(() => window._p1CloseCatalogModal());
    await page.setViewport({ width: 1280, height: 900 });
  });

} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
