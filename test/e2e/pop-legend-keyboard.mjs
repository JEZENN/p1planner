/* P1Planner — 3 retouches reprises de TypixClin (03/10/2026 au soir), demande explicite de Jean.
   Vraie page + vrais émulateurs.

   A. Téléphone : dans les listes personnalisables (#p1-catalog-modal), la ligne touchée doit
      rester visible quand le clavier virtuel ouvre (réduit la zone visible). Bug reproduit sur
      P1 (cause DIFFÉRENTE d'EDN : #p1-catalog-modal n'a pas la classe .settings-modal-overlay,
      donc ni le mécanisme global tcp-kb-pin ni le bloc tablette OVERLAY_CLASSES ne s'y
      appliquent -- aucune gestion n'existait, contrairement à EDN où un mécanisme s'appliquait
      mais suivait mal un textarea). Correctif LOCAL et dédié
      (_p1CatalogKeepFieldVisible/_p1CatalogScheduleKeepVisible), porté/adapté de
      keepFieldVisible (TypixClin). Contre-preuve réelle faite en diagnostic manuel (code
      temporairement neutralisé -> champ invisible/intouchable après "ouverture du clavier" ->
      restauré) avant d'écrire ce test.
   B. La légende « Supports disponibles » (#legendModal) était écrite EN DUR (4 entrées figées) --
      reconstruite depuis AVAILABLE_SUPPORTS (_p1RenderSupportLegend, porté de
      renderSupportLegend TypixClin).
   C. Les boutons .legend-button/.timer-button/.planning-legend-btn deviennent bleus (icône
      blanche) tant que leur fenêtre est ouverte (bloc p1-pop-open, porté de tpx-pop-open
      TypixClin).

   ⚠️ Piège réel rencontré en écrivant ces tests (à retenir pour tout futur test e2e de ce
   fichier) : `page.setViewport({..., isMobile, hasTouch})` déclenche un VRAI rechargement de la
   page dans cet environnement Puppeteer/Chrome dès que `isMobile`/`hasTouch` CHANGENT de valeur
   (confirmé : window.currentUser devient momentanément null puis se réauthentifie seul,
   _p1CatalogsLoaded retombe à false ~2s) -- y compris en repassant du mobile au bureau. En
   revanche, changer SEULEMENT la hauteur (même isMobile/hasTouch qu'avant) ne recharge rien :
   c'est exactement ce qu'utilise la simulation du clavier virtuel ci-dessous. Toute transition
   bureau<->mobile doit donc attendre explicitement la re-stabilisation (voir toMobile/toDesktop). */
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

async function waitStable(page) {
  // ⚠️ page.setViewport({isMobile/hasTouch}) déclenche un VRAI rechargement de la page dans cet
  // environnement (voir avertissement en tête de fichier). Un court délai initial laisse le
  // rechargement RÉELLEMENT démarrer avant de vérifier son issue -- sinon cette vérification
  // peut s'exécuter sur l'état d'AVANT le rechargement (encore valide une fraction de seconde)
  // et résoudre immédiatement à tort. Repéré : un run isolé passait, le même run noyé dans une
  // suite plus longue échouait (rechargement visiblement plus lent sous charge).
  await sleep(400);
  await page.waitForFunction(() => document.readyState === "complete" && window._p1CatalogsLoaded === true && window.currentUser && window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 20000 });
  await sleep(700);
}
async function toMobile(page, pageTab) {
  await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
  await waitStable(page);
  if (pageTab) { await page.evaluate((p) => document.querySelector(`[data-page="${p}"]`)?.click(), pageTab); await sleep(300); }
}
async function toDesktop(page, pageTab) {
  await page.setViewport({ width: 1280, height: 900, hasTouch: false, isMobile: false });
  await waitStable(page);
  if (pageTab) { await page.evaluate((p) => document.querySelector(`[data-page="${p}"]`)?.click(), pageTab); await sleep(300); }
}

// Ajoute `n` supports custom via le VRAI gestionnaire.
async function addCustomSupports(page, entries) {
  for (const [label, abbr] of entries) {
    await page.evaluate(() => window._p1OpenCatalogModal("supports"));
    await sleep(150);
    await page.evaluate((l) => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.value = l; }, label);
    await page.evaluate((a) => { const el = document.getElementById("p1-catalog-new-abbr"); el.readOnly = false; el.value = a; }, abbr);
    await page.evaluate(() => window._p1CatalogAdd());
    await sleep(300);
    const ok = await page.evaluate((l) => window._p1GetAvailableSupports().some((s) => s.label === l), label);
    assert(ok, "l'ajout de « " + label + " » (" + abbr + ") a échoué (pré-requis de test invalide)");
    await page.evaluate(() => window._p1CloseCatalogModal());
    await sleep(300);
  }
}

try {
  const u = await mkUser({ courses: 1 });
  const { page } = await openPage(browser, u);
  await page.evaluate(() => document.querySelector('[data-page="entrainements"]')?.click());
  await sleep(300);

  // ═══════════════════════════ A. Clavier téléphone ═══════════════════════════
  await S("A1", "téléphone : la ligne touchée (champ Nom) reste visible ET touchable quand le clavier virtuel réduit la zone visible", async () => {
    await toMobile(page, "entrainements");
    await addCustomSupports(page, [["Perso1", "P1X"], ["Perso2", "P2X"]]);

    await page.evaluate(() => window._p1OpenCatalogModal("supports"));
    await sleep(300);
    const before = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#p1-catalog-list .p1-catalog-row")];
      const body = document.querySelector("#p1-catalog-modal .resources-config-body");
      const bodyRect = body.getBoundingClientRect();
      const fully = rows.map((r) => { const rr = r.getBoundingClientRect(); return rr.top >= bodyRect.top && rr.bottom <= bodyRect.bottom; });
      const idx = fully.lastIndexOf(true);
      return { idx, rowCount: rows.length };
    });
    assert(before.rowCount === 6, "catalogue supports : 6 lignes attendues (4 défauts + 2 ajouts), trouvé " + before.rowCount);
    assert(before.idx >= 0, "aucune ligne pleinement visible avant réduction (pré-requis du test invalide)");

    await page.evaluate((idx) => {
      const row = document.querySelectorAll("#p1-catalog-list .p1-catalog-row")[idx];
      const field = row.querySelector(".p1-catalog-text-field:not(.p1-catalog-abbr-input)");
      field.readOnly = false;
      field.focus();
    }, before.idx);
    await sleep(200);

    // Simule l'ouverture du clavier : réduit UNIQUEMENT la hauteur (même isMobile/hasTouch,
    // voir avertissement en tête de fichier -- aucun rechargement ici). Voir
    // _p1CatalogScheduleKeepVisible (passes 60/180/320/520/800ms).
    await page.setViewport({ width: 390, height: 470, hasTouch: true, isMobile: true });
    await sleep(900);

    const after = await page.evaluate((idx) => {
      const row = document.querySelectorAll("#p1-catalog-list .p1-catalog-row")[idx];
      const field = row.querySelector(".p1-catalog-text-field:not(.p1-catalog-abbr-input)");
      const body = document.querySelector("#p1-catalog-modal .resources-config-body");
      const bodyRect = body.getBoundingClientRect();
      const fr = field.getBoundingClientRect();
      const atPoint = document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2);
      return {
        fullyVisible: fr.top >= bodyRect.top - 0.5 && fr.bottom <= bodyRect.bottom + 0.5,
        touchable: atPoint === field,
        isFocused: document.activeElement === field,
      };
    }, before.idx);
    assert(after.isFocused, "le champ a perdu le focus pendant la réduction (pré-requis du test invalide)");
    assert(after.fullyVisible, "le champ touché n'est plus entièrement visible après l'ouverture du clavier virtuel -- régression du bug signalé par Jean sur EDN");
    assert(after.touchable, "le champ touché n'est plus atteignable (elementFromPoint) après l'ouverture du clavier virtuel");

    // Frappe + sauvegarde réelles : le champ doit rester utilisable, pas seulement visible.
    await page.evaluate((idx) => {
      const row = document.querySelectorAll("#p1-catalog-list .p1-catalog-row")[idx];
      const field = row.querySelector(".p1-catalog-text-field:not(.p1-catalog-abbr-input)");
      field.value = "";
      field.focus();
    }, before.idx);
    await page.keyboard.type("ParClavier");
    await page.keyboard.press("Tab"); // quitte le champ -> déclenche onchange -> _p1CatalogRename
    await sleep(600);
    const saved = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const customSupports = (saved.data() || {}).customSupports || [];
    assert(customSupports.some((s) => s.label === "ParClavier"), "le renommage fait pendant le clavier virtuel n'a pas été enregistré sur Firestore : " + JSON.stringify(customSupports.map((s) => s.label)));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));

    await page.evaluate(() => window._p1CloseCatalogModal());
  });

  await S("A2", "téléphone : le champ « Nom » d'AJOUT (en haut de la fenêtre) reste utilisable après l'ouverture du clavier", async () => {
    // Repart d'une hauteur "clavier fermé" propre (A1 a fini sur 470px) -- même isMobile/hasTouch,
    // donc aucun rechargement (voir avertissement en tête de fichier).
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await sleep(200);
    await page.evaluate(() => window._p1OpenCatalogModal("supports"));
    await sleep(200);
    await page.evaluate(() => { const el = document.getElementById("p1-catalog-new-label"); el.readOnly = false; el.focus(); });
    await sleep(100);
    await page.setViewport({ width: 390, height: 470, hasTouch: true, isMobile: true });
    await sleep(900);
    const st = await page.evaluate(() => {
      const field = document.getElementById("p1-catalog-new-label");
      const fr = field.getBoundingClientRect();
      const atPoint = document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2);
      return { isFocused: document.activeElement === field, touchable: atPoint === field, top: fr.top, bottom: fr.bottom };
    });
    assert(st.isFocused, "le champ d'ajout a perdu le focus (pré-requis du test invalide)");
    assert(st.touchable, "le champ d'ajout « Nom » n'est plus atteignable après l'ouverture du clavier virtuel : " + JSON.stringify(st));
    await page.evaluate(() => window._p1CloseCatalogModal());
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true }); // même isMobile/hasTouch -> pas de rechargement
    await sleep(200);
  });

  await toDesktop(page, "entrainements");

  // ═══════════════════════════ B. Légende Supports disponibles ═══════════════════════════
  await S("B1", "légende d'origine identique à l'ancienne (acronymes, couleurs, textes historiques, ordre)", async () => {
    await page.evaluate(() => toggleLegendModal({ stopPropagation() {} }));
    await sleep(150);
    const items = await page.evaluate(() => [...document.querySelectorAll("#legendModal .legend-items .legend-item")].map((el) => ({
      abbr: el.querySelector(".legend-badge").textContent,
      color: el.querySelector(".legend-badge").style.background,
      desc: el.querySelector(".legend-description").textContent,
    })));
    assert(items.length === 6, "6 entrées attendues (4 défauts + 2 ajoutées en partie A), trouvé " + items.length);
    assert(items[0].abbr === "QCM" && items[0].desc === "QCM", "1ère entrée inattendue : " + JSON.stringify(items[0]));
    assert(items[1].abbr === "CRS" && items[1].desc === "Fiche de cours", "2e entrée inattendue : " + JSON.stringify(items[1]));
    assert(items[2].abbr === "CNF" && items[2].desc === "Conférence", "3e entrée inattendue (texte historique « Conférence » attendu malgré le label réel « Conf ») : " + JSON.stringify(items[2]));
    assert(items[3].abbr === "PER" && items[3].desc === "Fiche perso", "4e entrée inattendue : " + JSON.stringify(items[3]));
    assert(items.some((i) => i.desc === "ParClavier"), "le support renommé en partie A (« ParClavier ») absent de la légende : " + JSON.stringify(items));
    await page.evaluate(() => closeLegendModal());
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("B2", "ajout d'un support via le VRAI gestionnaire : apparaît dans la légende avec son acronyme/sa couleur", async () => {
    await addCustomSupports(page, [["Podcast", "POD"]]);
    await page.evaluate(() => toggleLegendModal({ stopPropagation() {} }));
    await sleep(150);
    const items = await page.evaluate(() => [...document.querySelectorAll("#legendModal .legend-items .legend-item")].map((el) => ({
      abbr: el.querySelector(".legend-badge").textContent, desc: el.querySelector(".legend-description").textContent,
    })));
    assert(items.some((i) => i.abbr === "POD" && i.desc === "Podcast"), "support ajouté « Podcast »/POD absent de la légende : " + JSON.stringify(items));
    await page.evaluate(() => closeLegendModal());
  });

  await S("B3", "légende déjà OUVERTE : renommage/recoloration d'un support reflétés en direct", async () => {
    const id = await page.evaluate(() => window._p1GetAvailableSupports().find((s) => s.label === "Podcast").id);
    await page.evaluate(() => toggleLegendModal({ stopPropagation() {} }));
    await sleep(150);
    await page.evaluate((sid) => window._p1CatalogRename(sid, "PodcastRenomme"), id);
    await sleep(300);
    const items = await page.evaluate(() => [...document.querySelectorAll("#legendModal .legend-items .legend-item")].map((el) => el.querySelector(".legend-description").textContent));
    assert(items.includes("PodcastRenomme"), "le renommage n'est pas reflété dans la légende déjà ouverte : " + JSON.stringify(items));
    assert(!items.includes("Podcast"), "l'ancien nom est toujours affiché dans la légende : " + JSON.stringify(items));
    await page.evaluate(() => closeLegendModal());
  });

  await S("B4", "suppression d'un support : retiré de la légende", async () => {
    const id = await page.evaluate(() => window._p1GetAvailableSupports().find((s) => s.label === "PodcastRenomme").id);
    await page.evaluate((sid) => window._p1CatalogDelete(sid), id);
    await sleep(400);
    await page.evaluate(() => toggleLegendModal({ stopPropagation() {} }));
    await sleep(150);
    const items = await page.evaluate(() => [...document.querySelectorAll("#legendModal .legend-items .legend-item")].map((el) => el.querySelector(".legend-description").textContent));
    assert(!items.includes("PodcastRenomme"), "le support supprimé est toujours affiché dans la légende : " + JSON.stringify(items));
    assert(items.length === 6, "6 entrées attendues après suppression (retour à 4 défauts + 2 de la partie A), trouvé " + items.length + " : " + JSON.stringify(items));
    await page.evaluate(() => closeLegendModal());
  });

  await S("B5", "ajout depuis un 2e appareil du même compte (écriture Firestore directe, écoute temps réel) : apparaît dans la légende", async () => {
    const snap = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const current = (snap.data() || {}).customSupports || [];
    const next = current.concat([{ id: "sup-" + Date.now(), label: "AutreAppareil", abbr: "DAA", color: "#14b8a6" }]);
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ customSupports: next }, { merge: true });
    await page.waitForFunction(() => window._p1GetAvailableSupports().some((s) => s.label === "AutreAppareil"), { timeout: 10000 });
    await page.evaluate(() => toggleLegendModal({ stopPropagation() {} }));
    await sleep(150);
    const items = await page.evaluate(() => [...document.querySelectorAll("#legendModal .legend-items .legend-item")].map((el) => el.querySelector(".legend-description").textContent));
    assert(items.includes("AutreAppareil"), "l'ajout fait depuis un autre appareil n'apparaît pas dans la légende : " + JSON.stringify(items));
    await page.evaluate(() => closeLegendModal());
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  // ═══════════════════════════ C. Bouton bleu quand sa fenêtre est ouverte ═══════════════════════════
  // #legendModal/.legend-button (et #timerModal/.timer-button) vivent sur la page "Mes cours"
  // (data-page="items") -- un ".legend-button" existe AUSSI sur "entrainements" (couplé à
  // #trainLegendModal, 1er DANS l'ordre du DOM si on reste sur cette page). getComputedStyle sur
  // un bouton actuellement masqué (page non active, display:none) n'est pas fiable : on se place
  // sur "Mes cours" pour que ce soit bien LUI que `.legend-button`/`#timerButton` désignent.
  await page.evaluate(() => document.querySelector('[data-page="items"]')?.click());
  await sleep(300);

  await S("C1", "légende : bouton gris au repos -> bleu fenêtre ouverte -> gris après la croix", async () => {
    await page.evaluate(() => toggleLegendModal({ stopPropagation() {} }));
    await sleep(150);
    const open = await page.evaluate(() => {
      const btn = document.querySelector(".legend-button");
      const cs = getComputedStyle(btn);
      const icon = getComputedStyle(btn.querySelector("i"));
      return { bg: cs.backgroundImage, iconColor: icon.color, ariaExpanded: btn.getAttribute("aria-expanded"), hasClass: btn.classList.contains("p1-pop-open") };
    });
    assert(open.hasClass, "la classe p1-pop-open n'est pas posée sur le bouton légende fenêtre ouverte");
    assert(/59, 130, 246/.test(open.bg), "le bouton n'est pas bleu (rgb(59,130,246) attendu) fenêtre ouverte : " + open.bg);
    assert(open.iconColor === "rgb(255, 255, 255)", "l'icône n'est pas blanche fenêtre ouverte : " + open.iconColor);
    assert(open.ariaExpanded === "true", "aria-expanded absent/faux fenêtre ouverte");

    await page.evaluate(() => closeLegendModal());
    await sleep(300);
    const closed = await page.evaluate(() => {
      const btn = document.querySelector(".legend-button");
      return { hasClass: btn.classList.contains("p1-pop-open"), ariaExpanded: btn.getAttribute("aria-expanded") };
    });
    assert(!closed.hasClass, "la classe p1-pop-open n'a pas été retirée après la fermeture (croix)");
    assert(closed.ariaExpanded === "false", "aria-expanded encore vrai après fermeture");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("C2", "chronomètre : vert à l'arrêt/en marche fermé -> BLEU fenêtre ouverte -> vert de nouveau à la fermeture", async () => {
    await page.evaluate(() => window.startTimer());
    await sleep(200);
    const runningClosedHasClass = await page.evaluate(() => document.getElementById("timerButton").classList.contains("active"));
    assert(runningClosedHasClass, "le chrono n'est pas « active » après startTimer() (pré-requis du test invalide)");

    await page.evaluate(() => toggleTimerModal({ stopPropagation() {} }));
    await sleep(150);
    const runningOpen = await page.evaluate(() => {
      const btn = document.getElementById("timerButton");
      return { bg: getComputedStyle(btn).backgroundImage, hasClass: btn.classList.contains("p1-pop-open") };
    });
    assert(runningOpen.hasClass, "p1-pop-open absent sur le chrono lancé, fenêtre ouverte");
    assert(/59, 130, 246/.test(runningOpen.bg), "le chrono lancé, fenêtre ouverte, n'est pas BLEU (devrait l'emporter sur le vert) : " + runningOpen.bg);

    await page.evaluate(() => closeTimerModalAnimated());
    await sleep(300);
    const runningClosedAgain = await page.evaluate(() => document.getElementById("timerButton").classList.contains("p1-pop-open"));
    assert(!runningClosedAgain, "p1-pop-open encore posé après fermeture du chrono");
    await page.evaluate(() => { if (typeof stopTimer === "function") stopTimer(); });
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("C3", "aucun violet en thème sombre (--primary-gradient vaut #8b5cf6 en sombre, jamais utilisé ici)", async () => {
    await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); });
    await page.evaluate(() => toggleLegendModal({ stopPropagation() {} }));
    await sleep(150);
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".legend-button")).backgroundImage);
    assert(/59, 130, 246/.test(bg), "le bouton n'est pas bleu en thème sombre : " + bg);
    assert(!/139, 92, 246/.test(bg), "le bouton est VIOLET en thème sombre (--primary-gradient mal utilisé) : " + bg);
    await page.evaluate(() => closeLegendModal());
    await sleep(300); // laisse le fondu de fermeture (200ms) se terminer avant le scénario suivant
    await page.evaluate(() => { document.documentElement.removeAttribute("data-theme"); });
  });

  await S("C4", "thème pastel : variante bleue pastel dédiée appliquée", async () => {
    await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "pastel"); });
    await page.evaluate(() => toggleLegendModal({ stopPropagation() {} }));
    await sleep(150);
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".legend-button")).backgroundImage);
    assert(/107, 140, 199/.test(bg), "la variante bleue pastel (#6b8cc7) n'est pas appliquée en thème pastel : " + bg);
    await page.evaluate(() => closeLegendModal());
    await sleep(300); // laisse le fondu de fermeture (200ms) se terminer avant le scénario suivant
    await page.evaluate(() => { document.documentElement.removeAttribute("data-theme"); });
  });

  await S("C5", "téléphone (hasTouch/isMobile) : planning-legend-btn devient bleu à l'ouverture, redevient gris après fermeture", async () => {
    // ⚠️ Piège de test réel découvert en écrivant ce scénario (pas un bug de l'app) : sur
    // téléphone (largeur ≤768px), un mécanisme PRÉEXISTANT ferme déjà ces mêmes fenêtres au
    // moindre évènement 'scroll' (debounce 50ms, voir "FERMETURE DES MODALS EN CLIQUANT
    // AILLEURS"). En automatisation (CDP), un scroll INCIDENT (reflow/resize de la page
    // planning) se glisse parfois entre l'ouverture et la vérification, refermant la fenêtre
    // avant même qu'on ait pu constater qu'elle s'était bien ouverte -- confirmé en mesurant la
    // classe toutes les 40ms après une ouverture manuelle : "show closing" apparaît dès la
    // frame suivante. page.touchscreen.tap()/element.click() sur CE bouton se sont d'ailleurs
    // montrés peu fiables pour la même raison. On ouvre donc et on vérifie DANS LE MÊME appel
    // evaluate (un seul tick JS, avant qu'un scroll incident ait pu être traité) : le mécanisme
    // p1-pop-open lui-même (MutationObserver sur la classe de la modale) est déjà vérifié avec
    // un clic réel, sans cette contrainte de timing, sur un AUTRE bouton de la même famille en
    // C1 -- ce qui est spécifique à CE test, c'est la condition téléphone (hasTouch/isMobile).
    await toMobile(page, "planning");
    // Micro-tâche (Promise.resolve) : laisse le MutationObserver (lui-même en micro-tâche)
    // réagir à la mutation de classe SANS rendre la main à la boucle d'évènements (où le
    // `setTimeout(...,50)` du mécanisme "ferme au scroll" pourrait, lui, s'exécuter).
    const openState = await page.evaluate(async () => {
      window.togglePlanningLegendModal({ stopPropagation() {} });
      await Promise.resolve();
      const btn = document.querySelector(".planning-legend-btn");
      return { modalShown: document.getElementById("planningLegendModal").classList.contains("show"), hasPopOpen: btn.classList.contains("p1-pop-open") };
    });
    assert(openState.modalShown, "le modal planning-legend ne s'est pas ouvert du tout (pré-requis du test invalide)");
    assert(openState.hasPopOpen, "planning-legend-btn pas bleu immédiatement après l'ouverture (téléphone)");

    const closedState = await page.evaluate(async () => {
      window.closePlanningLegendModalAnimated();
      await Promise.resolve();
      return document.querySelector(".planning-legend-btn").classList.contains("p1-pop-open");
    });
    assert(!closedState, "planning-legend-btn encore bleu immédiatement après la fermeture (téléphone)");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
