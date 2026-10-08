/* Types/plateformes d'entraînement PERSONNALISABLES (2026-09-28, demande explicite) — vraie
   page + vrais émulateurs. Même mécanique exacte que ressources/supports (voir
   catalog-custom.mjs) : défauts protégés, archivage à la suppression, palette restreinte,
   plafond total. Couvre ici surtout ce qui est SPÉCIFIQUE aux entraînements : boutons du
   modal "Ajouter", carte contexte, colonnes du tableau, badge du panneau notes, filtre
   déroulant, badge du Programme de la journée — tous dérivés du même catalogue. */
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

async function goToTrainings(page) {
  await page.evaluate(() => document.querySelector('[data-page="entrainements"]').click());
  await sleep(700);
}
const openCatalog = (page, kind) => page.evaluate((k) => window._p1OpenCatalogModal(k), kind);
async function addEntry(page, label, color) {
  await page.evaluate((l) => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = l; }, label);
  const clicked = await page.evaluate((c) => {
    const btn = document.querySelector(`#p1-catalog-new-swatches .tpx-swatch[data-color="${c}"]`);
    if (!btn) return false;
    btn.click();
    return true;
  }, color);
  assert(clicked, `pastille ${color} introuvable`);
  await page.evaluate(() => window._p1CatalogAdd());
  await sleep(120);
}
const catalogState = (page, kind) => page.evaluate((k) => {
  const fn = k === "trainTypes" ? window._p1GetAvailableTrainTypes : window._p1GetAvailableTrainPlateformes;
  return fn().map(t => ({ id: t.id, label: t.label, color: t.color }));
}, kind);

try {
  const u = await mkUser({ courses: 1 });
  let page = (await openPage(browser, u)).page;
  await goToTrainings(page);

  await S("TT1", "état par défaut : 3 types protégés (Concours blanc/Annale/Colle), 2 plateformes protégées (Prépa/Tutorat)", async () => {
    const types = await catalogState(page, "trainTypes");
    const plats = await catalogState(page, "trainPlateformes");
    assert(types.length === 3 && types.map(t => t.label).join(",") === "Concours blanc,Annale,Colle", "types par défaut incorrects : " + JSON.stringify(types));
    assert(plats.length === 2 && plats.map(t => t.label).join(",") === "Prépa,Tutorat", "plateformes par défaut incorrectes : " + JSON.stringify(plats));
    await page.evaluate(() => window.openAddTrainModal());
    await sleep(200);
    const btnCount = await page.evaluate(() => ({
      types: document.querySelectorAll("#train-type-btns .train-modal-type-btn").length,
      plats: document.querySelectorAll("#train-plateforme-btns .train-modal-type-btn").length,
    }));
    assert(btnCount.types === 3 && btnCount.plats === 2, "boutons du modal incorrects : " + JSON.stringify(btnCount));
    await page.evaluate(() => window.closeTrainModal());
  });

  await S("TT2", "défauts protégés : cadenas, pas de suppression possible", async () => {
    await openCatalog(page, "trainTypes");
    const types = await catalogState(page, "trainTypes");
    for (const t of types) {
      const locked = await page.evaluate((id) => !!document.querySelector(`.p1-catalog-row[data-id="${id}"] .p1-catalog-lock`), t.id);
      assert(locked, `${t.id} devrait être protégé`);
    }
    await page.evaluate(() => window._p1CloseCatalogModal());
  });

  await S("TT3", "ajout d'un type ET d'une plateforme personnalisés, sélectionnables et sauvegardés sur un VRAI entraînement", async () => {
    await openCatalog(page, "trainTypes");
    await addEntry(page, "Séminaire", "#10b981");
    await page.evaluate(() => window._p1CloseCatalogModal());
    await openCatalog(page, "trainPlateformes");
    await addEntry(page, "Campus+", "#f97316");
    await page.evaluate(() => window._p1CloseCatalogModal());

    const types = await catalogState(page, "trainTypes");
    const plats = await catalogState(page, "trainPlateformes");
    const customType = types.find(t => t.label === "Séminaire");
    const customPlat = plats.find(t => t.label === "Campus+");
    assert(customType && customPlat, "type/plateforme personnalisés introuvables après ajout");

    await page.evaluate(() => window.openAddTrainModal());
    await sleep(200);
    await page.evaluate((id) => document.querySelector(`#train-type-btns .train-modal-type-btn[data-value="${id}"]`).click(), customType.id);
    await page.evaluate((id) => document.querySelector(`#train-plateforme-btns .train-modal-type-btn[data-value="${id}"]`).click(), customPlat.id);
    await page.evaluate(() => { document.getElementById("train-title-input").value = "Mon entraînement perso"; });
    // Carte contexte : doit refléter le VRAI nom/la VRAIE couleur (pas une table figée).
    const ctx = await page.evaluate(() => ({ type: document.getElementById("train-modal-ctx-type").textContent, plat: document.getElementById("train-modal-ctx-plat").textContent }));
    assert(ctx.type === "Séminaire" && ctx.plat === "Campus+", "carte contexte incorrecte : " + JSON.stringify(ctx));
    await page.evaluate(() => window.saveTrainModal());
    await sleep(500);

    const saved = await adb.collection(`users/${u.uid}/trainingItems`).where("title", "==", "Mon entraînement perso").get();
    assert(!saved.empty, "l'entraînement n'a pas été sauvegardé sur Firestore");
    const doc = saved.docs[0].data();
    assert(doc.type === customType.id && doc.plateforme === customPlat.id, "type/plateforme mal enregistrés : " + JSON.stringify(doc));

    // Colonnes du tableau : badges corrects (pas de classe CSS figée, style inline).
    const rowBadges = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#train-table-body tr, .train-table tbody tr")];
      for (const r of rows) { if (r.textContent.includes("Mon entraînement perso")) return r.textContent; }
      return null;
    });
    assert(rowBadges && rowBadges.includes("Séminaire") && rowBadges.includes("Campus+"), "badges absents du tableau : " + JSON.stringify(rowBadges));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("TT4", "AUDIT — suppression du type déjà utilisé par cet entraînement : jamais de perte/corruption, jamais de repli illisible", async () => {
    const types = await catalogState(page, "trainTypes");
    const seminaire = types.find(t => t.label === "Séminaire");
    assert(seminaire, "type « Séminaire » introuvable avant suppression");
    await openCatalog(page, "trainTypes");
    await page.evaluate((id) => window._p1CatalogDelete(id), seminaire.id);
    await page.evaluate(() => window._p1CloseCatalogModal());
    await goToTrainings(page);
    const rowBadges = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#train-table-body tr, .train-table tbody tr")];
      for (const r of rows) { if (r.textContent.includes("Mon entraînement perso")) return r.textContent; }
      return null;
    });
    assert(rowBadges && rowBadges.includes("Séminaire"), "le type supprimé n'affiche plus le vrai nom après suppression (repli illisible ou case vide) : " + JSON.stringify(rowBadges));
    assert(page.__errors.length === 0, "erreurs JS après suppression d'un type utilisé : " + JSON.stringify(page.__errors));
    const saved = await adb.collection(`users/${u.uid}/trainingItems`).where("title", "==", "Mon entraînement perso").get();
    assert(!saved.empty && saved.docs[0].data().type === seminaire.id, "la donnée Firestore a été altérée par la suppression du type");
  });

  await S("TT7", "AUDIT — retour de Jean (2026-09-29) : le modal \"Ajouter un entraînement\" déjà ouvert doit voir apparaître un type/une plateforme fraîchement créé SANS le fermer/rouvrir", async () => {
    // Avant le correctif de _p1CatalogAfterChange (routait trainTypes/trainPlateformes vers
    // la branche "resources", qui ne rafraîchit rien), ce scénario échouait : les boutons du
    // modal déjà ouvert restaient figés sur l'ancien catalogue tant qu'on ne le refermait pas.
    // Placé ici (avant TT5, le test de plafond) pour garder de la marge : à ce stade, 0 type
    // personnalisé actif (Séminaire vient d'être archivé par TT4) et 1 plateforme (Campus+).
    await page.evaluate(() => window.openAddTrainModal());
    await sleep(200);
    const before = await page.evaluate(() => ({
      types: document.querySelectorAll("#train-type-btns .train-modal-type-btn").length,
      plats: document.querySelectorAll("#train-plateforme-btns .train-modal-type-btn").length,
    }));

    // Ouvre le gestionnaire de catalogue PAR-DESSUS le modal d'entraînement déjà ouvert
    // (exactement le geste réel : crayon "Gérer les types" depuis le modal d'ajout).
    await openCatalog(page, "trainTypes");
    await addEntry(page, "Webinaire", "#06b6d4");
    await page.evaluate(() => window._p1CloseCatalogModal());
    await sleep(250);

    const afterTypes = await page.evaluate(() => ({
      count: document.querySelectorAll("#train-type-btns .train-modal-type-btn").length,
      hasWebinaire: [...document.querySelectorAll("#train-type-btns .train-modal-type-btn")].some(b => b.textContent.includes("Webinaire")),
    }));
    assert(afterTypes.count === before.types + 1, "le modal déjà ouvert n'a pas gagné de bouton type : " + JSON.stringify(afterTypes) + " vs avant=" + before.types);
    assert(afterTypes.hasWebinaire, "le bouton « Webinaire » n'apparaît pas dans le modal déjà ouvert");

    await openCatalog(page, "trainPlateformes");
    await addEntry(page, "Discord", "#6366f1");
    await page.evaluate(() => window._p1CloseCatalogModal());
    await sleep(250);

    const afterPlats = await page.evaluate(() => ({
      count: document.querySelectorAll("#train-plateforme-btns .train-modal-type-btn").length,
      hasDiscord: [...document.querySelectorAll("#train-plateforme-btns .train-modal-type-btn")].some(b => b.textContent.includes("Discord")),
    }));
    assert(afterPlats.count === before.plats + 1, "le modal déjà ouvert n'a pas gagné de bouton plateforme : " + JSON.stringify(afterPlats) + " vs avant=" + before.plats);
    assert(afterPlats.hasDiscord, "le bouton « Discord » n'apparaît pas dans le modal déjà ouvert");

    // Le filtre déroulant de la page Entraînements doit lui aussi refléter l'ajout, sans reload.
    await page.evaluate(() => window.closeTrainModal());
    await sleep(200);
    const filterHasWebinaire = await page.evaluate(() => {
      const list = document.getElementById("train-type-multi-list");
      return !!list && list.textContent.includes("Webinaire");
    });
    assert(filterHasWebinaire, "le filtre déroulant « Type » n'a pas été mis à jour automatiquement");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("TT5", "plafond total : types 6 (3 défauts + 3 ajouts), plateformes 5 (2 défauts + 3 ajouts)", async () => {
    // Avant TT5 : 1 type personnalisé actif (Webinaire, ajouté par TT7) et 2 plateformes
    // (Campus+ + Discord, TT3+TT7). Il faut donc 2 ajouts de type et 1 de plateforme pour
    // atteindre le plafond réel (6 et 5), pas 3 et 2 comme si on partait de zéro.
    await openCatalog(page, "trainTypes");
    await addEntry(page, "T2", "#8b5cf6");
    await addEntry(page, "T3", "#ec4899");
    let types = await catalogState(page, "trainTypes");
    assert(types.length === 6, "devrait être à 6 : " + JSON.stringify(types.map(t => t.label)));
    const addDisabled = await page.evaluate(() => document.getElementById("p1-catalog-add-btn").disabled);
    assert(addDisabled, "bouton d'ajout devrait être désactivé au plafond (types)");
    await page.evaluate(() => window._p1CloseCatalogModal());

    await openCatalog(page, "trainPlateformes");
    await addEntry(page, "P3", "#84cc16");
    let plats = await catalogState(page, "trainPlateformes");
    assert(plats.length === 5, "devrait être à 5 : " + JSON.stringify(plats.map(t => t.label)));
    await page.evaluate(() => window._p1CloseCatalogModal());
  });

  await S("TT8", "AUDIT — retour de Jean (2026-09-29) : les champs mot de passe du compte sont dans de vraies balises <form>, isolées du reste de la page (parade « unowned form » autofill)", async () => {
    // Root cause confirmée par lecture directe : AUCUNE balise <form> n'existait nulle part
    // dans tableur.html, donc Chrome/Edge regroupaient tous les champs de la page (y compris
    // les champs texte du gestionnaire de catalogue) avec les VRAIS champs mot de passe du
    // compte pour l'heuristique « Enregistrer votre mot de passe ? ». On vérifie ici que les
    // deux zones sensibles sont bien scindées en <form> distinctes, et que la page ne recharge
    // pas si Entrée est pressée dedans (onsubmit="return false").
    const struct = await page.evaluate(() => {
      const mail = document.getElementById("acc-mail-sub");
      const pwd = document.getElementById("acc-pwd-sub");
      return {
        mailIsForm: !!mail && mail.tagName === "FORM",
        pwdIsForm: !!pwd && pwd.tagName === "FORM",
        catalogNotInAForm: !document.getElementById("p1-catalog-new-label")?.closest("form"),
      };
    });
    assert(struct.mailIsForm, "#acc-mail-sub devrait être une balise <form> (isolation autofill)");
    assert(struct.pwdIsForm, "#acc-pwd-sub devrait être une balise <form> (isolation autofill)");
    assert(struct.catalogNotInAForm, "le champ du catalogue ne doit PAS se retrouver dans le même <form> que les mots de passe");

    // Simule Entrée dans le formulaire mot de passe : aucune navigation ne doit se produire
    // (onsubmit="return false" + aucun bouton type=submit).
    const urlBefore = page.url();
    const submitted = await page.evaluate(() => {
      const form = document.getElementById("acc-pwd-sub");
      let prevented = false;
      form.addEventListener("submit", (e) => { if (e.defaultPrevented) prevented = true; }, { once: true });
      const evt = new Event("submit", { cancelable: true });
      const ok = form.dispatchEvent(evt);
      return { defaultWasPrevented: !ok, listenerSawPrevented: prevented };
    });
    assert(submitted.defaultWasPrevented, "onsubmit=\"return false\" ne bloque pas la soumission par défaut");
    assert(page.url() === urlBefore, "la page a navigué après soumission du formulaire mot de passe");
  });

  await S("TT6", "persistance Firestore complète après un rechargement", async () => {
    const typesBefore = await catalogState(page, "trainTypes");
    const platsBefore = await catalogState(page, "trainPlateformes");
    await page.evaluate(() => location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(1800);
    const typesAfter = await catalogState(page, "trainTypes");
    const platsAfter = await catalogState(page, "trainPlateformes");
    assert(JSON.stringify(typesAfter) === JSON.stringify(typesBefore), "types différents après reload");
    assert(JSON.stringify(platsAfter) === JSON.stringify(platsBefore), "plateformes différentes après reload");
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
