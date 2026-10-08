/* Retour de Jean (03/10, capture à l'appui) : "POURQUOI quand l'animation check apparait la
   barre de défilement latérale est toujours présente alors que je t'avais justement demandé
   qu'elle soit abscente ?" -- `document.body.style.overflow = 'hidden'` (posé par
   _ednApplyScrollLock) n'a AUCUN effet sur la scrollbar réellement visible ici puisque c'est
   <html> qui défile (overflow-y:auto en CSS), pas <body> : elle restait donc affichée pendant
   tout le verrou. Corrigé par une classe purement visuelle (.p1-scrollbar-hidden sur <html>,
   scrollbar-width/::-webkit-scrollbar), JAMAIS overflow/position sur <html> lui-même (casserait
   position:sticky, voir le commentaire dans _ednApplyScrollLock). Vraie page + vrais émulateurs,
   verrou exercé directement via window._ednScrollLock/_ednScrollUnlock (mêmes fonctions que la
   vraie animation de validation d'un tour, voir showTourSuccessAnimation). */
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

  // Un compte neuf ouvre automatiquement l'onboarding (son propre verrou de scroll,
  // propriétaire "tpxPersoOnboarding") -- on le ferme par son vrai bouton Passer, comme un
  // utilisateur réel, pour repartir d'un état déverrouillé avant de tester CE verrou-ci.
  await sleep(400);
  const hasOnboarding = await page.evaluate(() => !!document.getElementById("tpx-onb-skip"));
  if (hasOnboarding) {
    await page.evaluate(() => document.getElementById("tpx-onb-skip").click());
    await page.waitForFunction(() => !document.getElementById("tpx-onb-overlay"), { timeout: 10000 });
    await sleep(200);
  }

  await S("SB1", "verrou de scroll actif : la scrollbar de <html> est masquée visuellement, sans toucher à son overflow/position", async () => {
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth);
    assert(before === "thin", "pré-requis du test invalide : la scrollbar n'est pas dans son état normal (\"thin\", voir CSS html{}) avant tout verrou -- (" + before + ")");

    await page.evaluate(() => window._ednScrollLock("sb-test"));
    await sleep(50);
    const during = await page.evaluate(() => ({
      scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
      hasClass: document.documentElement.classList.contains("p1-scrollbar-hidden"),
      htmlOverflow: getComputedStyle(document.documentElement).overflowY,
      htmlPosition: getComputedStyle(document.documentElement).position,
    }));
    assert(during.hasClass, "la classe .p1-scrollbar-hidden n'est pas posée sur <html> pendant le verrou");
    assert(during.scrollbarWidth === "none", "la scrollbar de <html> est toujours visible pendant le verrou (scrollbarWidth=" + during.scrollbarWidth + ") -- régression du bug signalé par Jean");
    // Garde-fou de non-régression du conflit documenté verrou/sticky (voir mémoire projet) :
    // overflow/position de <html> ne doivent JAMAIS être touchés par ce correctif.
    assert(during.htmlOverflow === "auto" || during.htmlOverflow === "visible", "l'overflow de <html> a été modifié par le verrou (" + during.htmlOverflow + ") -- risque de casser position:sticky");
    assert(during.htmlPosition === "static", "la position de <html> a été modifiée par le verrou (" + during.htmlPosition + ")");

    await page.evaluate(() => window._ednScrollUnlock("sb-test"));
    await sleep(50);
    const after = await page.evaluate(() => ({
      scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
      hasClass: document.documentElement.classList.contains("p1-scrollbar-hidden"),
    }));
    assert(!after.hasClass, "la classe .p1-scrollbar-hidden n'a pas été retirée après le déverrouillage");
    assert(after.scrollbarWidth !== "none", "la scrollbar reste masquée après le déverrouillage (" + after.scrollbarWidth + ")");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("SB2", "verrous multiples (propriétaires différents) : la scrollbar ne réapparaît qu'une fois TOUS les verrous levés", async () => {
    await page.evaluate(() => { window._ednScrollLock("ownerA"); window._ednScrollLock("ownerB"); });
    await sleep(50);
    await page.evaluate(() => window._ednScrollUnlock("ownerA"));
    await sleep(50);
    const stillLocked = await page.evaluate(() => document.documentElement.classList.contains("p1-scrollbar-hidden"));
    assert(stillLocked, "la scrollbar réapparaît alors qu'un second propriétaire (ownerB) tient encore le verrou");

    await page.evaluate(() => window._ednScrollUnlock("ownerB"));
    await sleep(50);
    const released = await page.evaluate(() => document.documentElement.classList.contains("p1-scrollbar-hidden"));
    assert(!released, "la scrollbar reste masquée après la levée du dernier verrou");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
