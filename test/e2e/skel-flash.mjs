/* Chargement : aucune fenêtre modale / élément flottant ne s'affiche brut avant le squelette.
   Les fenêtres modales sont écrites dans la page avant leur feuille de style : tant que le navigateur lit le fichier, elles étaient dessinées
   (une fenêtre plein écran, une barre sur le côté) pendant une ou deux images. Échantillon à chaque image depuis le début du chargement :
   hors en-tête, squelettes, sections de page et pied de page, aucun élément visible de plus de 40 px.
   Visiteur déconnecté et utilisateur connecté, processeur ralenti pour élargir la fenêtre d'observation.
   Lancer : node test/e2e/skel-flash.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { BASE, launch, mkUser, openPage, scenario, report, assert, sleep } from "./lib.mjs";

const server = await startServer(), proxy = await startProxy(), browser = await launch();
const SAMPLER = () => {
  window.__S = []; window.__F = [];
  const desc = (e) => (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "") || e.tagName;
  const loop = () => {
    if (document.body && document.documentElement.classList.contains("p1-skel")) {   // seulement pendant le squelette (ensuite la page prend sa place)
      let n = 0;
      for (const e of document.body.children) {   // éléments de premier niveau : leur opacité / visibilité vaut pour tout leur contenu
        if (e.matches("#header, header, #p1-skel, #p1-skel-pres, #presentation-section, #main-content, footer, .page-header, script, style, link")) continue;
        const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) continue;
        const b = e.getBoundingClientRect(); if (b.width < 40 || b.height < 40) continue;
        if (b.right <= 0 || b.bottom <= 0 || b.left >= innerWidth || b.top >= innerHeight) continue;   // hors de la zone visible
        n++; if (window.__F.length < 6) window.__F.push(desc(e) + "@" + Math.round(b.left) + "," + Math.round(b.top) + " " + Math.round(b.width) + "x" + Math.round(b.height));
      }
      window.__S.push(n);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
async function mesurer(page, nav) {
  const cdp = await page.createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluateOnNewDocument(SAMPLER);
  await nav();
  await sleep(3500);
  return page.evaluate(() => ({ frames: window.__S.length, bad: window.__S.filter((n) => n > 0).length, ex: window.__F }));
}
for (const [w, h] of [[1280, 900], [390, 844]]) {
  await scenario(`SF-déconnecté-${w} visiteur déconnecté : aucun élément brut affiché pendant le chargement`, async () => {
    const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
    try {
      await page.setViewport({ width: w, height: h });
      const r = await mesurer(page, () => page.goto(BASE + "/tableur.html", { waitUntil: "domcontentloaded" }));
      assert(r.frames > 5, "échantillon trop court : " + JSON.stringify(r));
      assert(r.bad === 0, "éléments bruts affichés sur " + r.bad + " images : " + JSON.stringify(r.ex));
    } finally { await ctx.close(); }
  });
  await scenario(`SF-connecté-${w} utilisateur connecté : aucun élément brut affiché pendant le chargement`, async () => {
    const u = await mkUser({ courses: 3 });
    const { page, ctx } = await openPage(browser, u);
    try {
      await page.setViewport({ width: w, height: h });
      const r = await mesurer(page, () => page.reload({ waitUntil: "domcontentloaded" }));
      assert(r.frames > 5, "échantillon trop court : " + JSON.stringify(r));
      assert(r.bad === 0, "éléments bruts affichés sur " + r.bad + " images : " + JSON.stringify(r.ex));
    } finally { await ctx.close(); }
  });
}
await scenario("SF-final après le chargement, les fenêtres modales restent utilisables (aucune ne reste masquée par la règle de lecture)", async () => {
  const u = await mkUser({ courses: 2 });
  const { page, ctx } = await openPage(browser, u);
  try {
    const r = await page.evaluate(() => ({ cls: document.documentElement.className, lb: getComputedStyle(document.getElementById("img-lightbox-overlay")).display, hidden: [...document.body.children].filter((e) => getComputedStyle(e).display === "none" && e.id === "back-to-top").length }));
    assert(!/p1-parsing/.test(r.cls), "la classe de lecture est restée : " + r.cls);
    const ouvert = await page.evaluate(() => { const o = document.getElementById("helpModalOverlay"); o.classList.add("active"); return getComputedStyle(o).display; });
    assert(ouvert !== "none", "une fenêtre modale ne s'ouvre plus : " + ouvert);
  } finally { await ctx.close(); }
});
const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
