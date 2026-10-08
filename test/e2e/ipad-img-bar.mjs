/* I1 (audit 02/10, comparaison au modèle EDN TableurEnLigne.html @media (pointer: coarse) and
   (min-width: 769px)) : la barre de contrôle d'image des notes (Agrandir/Monter/Descendre/
   Supprimer) restait à la taille ORDINATEUR sur un iPad (≥769px, tactile) -- seul le
   breakpoint téléphone (max-width: 768px) l'agrandissait. Vraie page + vrais émulateurs.

   Remarque méthodologique : le modal Notes passe par un bref état "verrouillé" juste après son
   ouverture (contenteditable=false, panneau quasi réduit à 0px le temps du premier rendu) --
   sans lien avec ce correctif. Pour rester déterministe (ne pas dépendre de la vitesse réelle,
   non garantie, de cette phase de chargement), la largeur de #notesEditorArea est FORCÉE
   explicitement avant chaque mesure plutôt que de dépendre de son dimensionnement naturel --
   ce qui teste fidèlement le VRAI CSS et la VRAIE fonction _notesImgBarFit, juste sans la
   course contre ce chargement initial, non pertinente pour I1. */
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

// editorWidthPx : largeur forcée de #notesEditorArea juste avant la mesure (voir remarque
// méthodologique ci-dessus). 700px = un panneau d'édition confortable (jamais de raison d'être
// "tight") ; une valeur plus petite sert spécifiquement à tester le mode étroit (IBTIGHT).
async function measureBar(page, editorWidthPx) {
  await page.evaluate(() => window._p1DebugShowImgPopup("notes"));
  await sleep(350); // laisse le popup s'afficher réellement (voir _notesFooterShow)
  await page.evaluate((w) => { document.getElementById("notesEditorArea").style.width = w + "px"; }, editorWidthPx);
  await page.evaluate(() => window._notesImgBarFit("notes"));
  await sleep(150);
  return page.evaluate(() => {
    const popup = document.getElementById("notesImgFloatingPopup");
    const btns = [...popup.querySelectorAll(".img-popup-btn")].map((b) => b.getBoundingClientRect());
    const label = popup.querySelector(".img-popup-btn-label");
    return {
      isTight: popup.classList.contains("is-tight"),
      labelVisible: !!label && getComputedStyle(label).display !== "none",
      btnSizes: btns.map((r) => ({ w: r.width, h: r.height })),
      overflowsViewport: popup.getBoundingClientRect().right > document.documentElement.clientWidth,
    };
  });
}

try {
  const u = await mkUser({ courses: 1 });

  await S("IB1", "iPad (820×1180, tactile) : cibles ≥ 44×44 px, barre entière visible, « Supprimer » avec son texte", async () => {
    const { page } = await openPage(browser, u);
    await page.setViewport({ width: 820, height: 1180, hasTouch: true, isMobile: false });
    await page.evaluate((fc) => window.openNotesModal(1, "s1", fc, "Cours1"), "c1");
    await sleep(300);
    const m = await measureBar(page, 700);
    // Tolérance de 2px (arrondi flex/sous-pixel observé en Chrome headless ; le CSS computed
    // confirme bien min-width/min-height: 44px exactement) : la valeur réelle doit rester
    // visiblement PRÈS de la cible 44px, pas retomber au ~19px d'avant ce correctif (le point
    // que ce test doit réellement prouver).
    m.btnSizes.forEach((s, i) => assert(s.w >= 42 && s.h >= 42, "bouton #" + i + " trop petit pour un doigt sur iPad : " + JSON.stringify(s)));
    assert(!m.overflowsViewport, "la barre déborde du viewport sur iPad 820px");
    assert(!m.isTight && m.labelVisible, "« Supprimer » a perdu son texte alors que l'éditeur (700px) tient largement la barre complète");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("IB1B", "iPad paysage (1180×820, tactile) : même garantie", async () => {
    const { page } = await openPage(browser, u);
    await page.setViewport({ width: 1180, height: 820, hasTouch: true, isMobile: false });
    await page.evaluate((fc) => window.openNotesModal(1, "s1", fc, "Cours1"), "c1");
    await sleep(300);
    const m = await measureBar(page, 700);
    m.btnSizes.forEach((s, i) => assert(s.w >= 42 && s.h >= 42, "bouton #" + i + " trop petit (iPad paysage) : " + JSON.stringify(s)));
  });

  await S("IB3", "ordinateur (1280×900, pas de tactile) : taille INCHANGÉE (pas de régression du style existant)", async () => {
    const { page } = await openPage(browser, u);
    await page.setViewport({ width: 1280, height: 900, hasTouch: false, isMobile: false });
    await page.evaluate((fc) => window.openNotesModal(1, "s1", fc, "Cours1"), "c1");
    await sleep(300);
    const m = await measureBar(page, 700);
    m.btnSizes.forEach((s, i) => assert(s.h < 40, "bouton #" + i + " a grandi sur ordinateur alors qu'aucune souris tactile n'est déclarée : " + JSON.stringify(s)));
  });

  await S("IB4", "téléphone (390×844, tactile) : règle existante (max-width:768px) inchangée, aucun débordement introduit par ce correctif", async () => {
    // Hors périmètre de I1 (qui vise spécifiquement ≥769px) : ce correctif n'ajoute qu'un
    // NOUVEAU bloc @media (pointer:coarse) and (min-width:769px), sans toucher au bloc
    // téléphone existant (max-width:768px) -- ce test vérifie juste l'absence de régression
    // introduite par le nouvel enrobage <span class="img-popup-btn-label"> de "Supprimer".
    const { page } = await openPage(browser, u);
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.evaluate((fc) => window.openNotesModal(1, "s1", fc, "Cours1"), "c1");
    await sleep(300);
    const m = await measureBar(page, 340); // largeur réaliste d'un éditeur sur téléphone 390px
    assert(!m.overflowsViewport, "la barre déborde du viewport sur téléphone 390px");
    assert(m.labelVisible, "le texte « Supprimer » a disparu sur téléphone (la classe is-tight ne doit avoir aucun effet hors du @media iPad)");
  });

  await S("IBTIGHT", "éditeur iPad ÉTROIT : « Supprimer » passe en icône seule SEULEMENT si la barre complète déborderait, jamais par défaut", async () => {
    const { page } = await openPage(browser, u);
    await page.setViewport({ width: 820, height: 1180, hasTouch: true, isMobile: false });
    await page.evaluate((fc) => window.openNotesModal(1, "s1", fc, "Cours1"), "c1");
    await sleep(300);

    // Éditeur ÉTROIT (simule un futur panneau latéral) : la barre complète (boutons 44px +
    // curseur 140px + texte "Supprimer", ~334px de large) ne tient plus dans 220px.
    const narrow = await measureBar(page, 220);
    assert(narrow.isTight, "« is-tight » pas posée alors que l'éditeur (220px) est trop étroit pour la barre complète");
    assert(!narrow.labelVisible, "le texte « Supprimer » reste visible alors que la barre est en mode étroit");

    // Ré-élargit l'éditeur : la barre retrouve son texte (jamais figée en mode étroit à tort).
    const wide = await measureBar(page, 700);
    assert(!wide.isTight && wide.labelVisible, "le mode étroit reste figé après avoir réélargi l'éditeur (700px)");
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
