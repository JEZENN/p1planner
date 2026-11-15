/* Visiteur déconnecté : un squelette adapté à la page de présentation (barre latérale de connexion + carte centrale) s'affiche
   à la place de celui du tableur, aux mêmes positions que la vraie page, puis la présentation le remplace en fondu.
   Utilisateur connecté : le squelette du tableur est inchangé et la présentation n'apparaît jamais à sa place.
   Vraie page + émulateurs, échantillon à chaque image depuis le début du chargement.
   Lancer : node test/e2e/skel-deconnecte.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { BASE, launch, mkUser, openPage, scenario, report, assert, sleep } from "./lib.mjs";

const server = await startServer(), proxy = await startProxy(), browser = await launch();
const SAMPLER = () => {
  window.__S = [];
  const t0 = performance.now();
  const vis = (e) => { if (!e) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false; return e.getBoundingClientRect().height > 0; };
  const loop = () => {
    const mc = document.getElementById("main-content");
    window.__S.push({ t: Math.round(performance.now() - t0), skel: vis(document.getElementById("p1-skel")), skelPres: vis(document.getElementById("p1-skel-pres")), pres: vis(document.getElementById("presentation-section")), main: vis(mc) && mc.classList.contains("active") });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
const resume = (S) => ({ frames: S.length, skel: S.filter((s) => s.skel).length, skelPres: S.filter((s) => s.skelPres).length, pres: S.filter((s) => s.pres).length, presAvecSkel: S.filter((s) => s.skelPres && s.pres).length, blank: S.filter((s) => !s.skel && !s.skelPres && !s.pres && !s.main).length });
const PRET = () => { const p = document.getElementById("presentation-section"); return p && getComputedStyle(p).display !== "none" && !document.documentElement.classList.contains("p1-skel") && !document.getElementById("p1-skel-pres"); };

async function ouvrirDeconnecte() {
  const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(SAMPLER);
  await page.goto(BASE + "/tableur.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(PRET, { timeout: 30000 });
  await sleep(1200);
  return { S: await page.evaluate(() => window.__S), ctx, page };
}
function verifierDeconnecte(r) {
  assert(r.skelPres >= 3, "le squelette de la présentation n'a jamais été affiché : " + JSON.stringify(r));
  assert(r.skel === 0, "le squelette du tableur est apparu pour un visiteur déconnecté : " + JSON.stringify(r));
  assert(r.presAvecSkel === 0, "présentation et squelette affichés ensemble : " + JSON.stringify(r));
  assert(r.pres > 5, "présentation jamais affichée : " + JSON.stringify(r));
  assert(r.blank <= 12, "trop d'images vides : " + JSON.stringify(r));
}

await scenario("SD1 visiteur qui ne s'est jamais connecté : squelette de la présentation (jamais celui du tableur), puis la présentation", async () => {
  const { S, ctx } = await ouvrirDeconnecte();
  try { verifierDeconnecte(resume(S)); } finally { await ctx.close(); }
});

await scenario("SD2 visiteur qui s'est déconnecté (base d'authentification présente, aucun compte) : même résultat", async () => {
  const u = await mkUser({ courses: 1 });
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.evaluate(async () => { await window.__authApi.signOut(window.__auth); });
    await sleep(800);
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(SAMPLER);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(PRET, { timeout: 30000 });
    await sleep(1200);
    verifierDeconnecte(resume(await page.evaluate(() => window.__S)));
  } finally { await ctx.close(); }
});

await scenario("SD3 utilisateur connecté : squelette du tableur, jamais celui de la présentation ni la présentation, puis l'application", async () => {
  const u = await mkUser({ courses: 2 });
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(SAMPLER);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => { const m = document.getElementById("main-content"); return m && m.classList.contains("active") && !document.documentElement.classList.contains("p1-skel") && !document.getElementById("p1-skel"); }, { timeout: 30000 });
    await sleep(800);
    const r = resume(await page.evaluate(() => window.__S));
    assert(r.skel > 5, "squelette du tableur jamais affiché : " + JSON.stringify(r));
    assert(r.skelPres === 0, "squelette de la présentation affiché pour un utilisateur connecté : " + JSON.stringify(r));
    assert(r.pres === 0, "la présentation déconnectée est apparue pour un utilisateur connecté : " + JSON.stringify(r));
    assert(r.blank <= 12, "trop d'images vides : " + JSON.stringify(r));
  } finally { await ctx.close(); }
});

/* Positions : le chargement est tenu sur le squelette (la fin du squelette est retenue), mesuré, puis relâchée pour mesurer la vraie page dans la même fenêtre */
const RETENIR = () => {
  window.__hold = true; let reel = null;
  Object.defineProperty(window, "p1SkelReady", { configurable: true, get() { return (w) => { if (window.__hold) { window.__attente = (window.__attente || []).concat([w]); return; } if (reel) reel(w); }; }, set(v) { reel = v; } });
  window.__relacher = () => { window.__hold = false; (window.__attente || []).forEach((w) => reel && reel(w)); };
};
for (const [w, h] of [[1920, 1000], [1366, 768], [1024, 768], [820, 1100], [600, 900], [480, 844], [390, 844], [360, 740]]) {
  await scenario(`SD4-${w} (${w} px) le squelette de la présentation est aux mêmes positions que la vraie page (barre latérale, carte, grille)`, async () => {
    const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
    try {
      await page.setViewport({ width: w, height: h });
      await page.evaluateOnNewDocument(RETENIR);
      await page.goto(BASE + "/tableur.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => { const s = document.getElementById("p1-skel-pres"); return s && getComputedStyle(s).display !== "none" && document.documentElement.classList.contains("p1-anon") && (window.__attente || []).length > 0; }, { timeout: 30000 });
      await sleep(400);
      const mesurer = (sk) => page.evaluate((sk) => {
        const root = sk ? document.getElementById("p1-skel-pres") : document.getElementById("presentation-section");
        const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top + scrollY, width: b.width, height: b.height }; };
        return { side: r(root.querySelector(".presentation-sidebar")), card: r(root.querySelector(".login-sidebar-card")), cont: r(root.querySelector(".presentation-container")), grid: r(root.querySelector(".presentation-feature-grid")) };
      }, sk);
      await page.evaluate(() => { document.documentElement.style.scrollbarGutter = "stable"; });   // même réserve de barre des deux côtés
      const K = await mesurer(true);
      await page.evaluate(() => window.__relacher());
      await page.waitForFunction(() => !document.documentElement.classList.contains("p1-skel") && !document.getElementById("p1-skel-pres"), { timeout: 15000 });
      await sleep(600);
      const R = await mesurer(false);
      const bad = [];
      const d = (n, a, b, t) => { if (a == null || b == null || Math.abs(a - b) > t) bad.push(`${n} ${a == null ? "absent" : Math.round(a)} / réel ${b == null ? "absent" : Math.round(b)}`); };
      d("barre latérale gauche", K.side.left, R.side.left, 2); d("barre latérale largeur", K.side.width, R.side.width, 2);
      d("carte gauche", K.card.left, R.card.left, 2); d("carte largeur", K.card.width, R.card.width, 2);
      d("conteneur gauche", K.cont.left, R.cont.left, 2); d("conteneur largeur", K.cont.width, R.cont.width, 2);
      d("grille gauche", K.grid.left, R.grid.left, 2); d("grille largeur", K.grid.width, R.grid.width, 2);
      d("hauteur de la carte", K.card.height, R.card.height, 3); d("haut de la grille", K.grid.top, R.grid.top, 4);
      d("haut de la barre latérale", K.side.top, R.side.top, 3); d("haut du conteneur", K.cont.top, R.cont.top, 3);
      assert(!bad.length, bad.join(" ; "));
    } finally { await ctx.close(); }
  });
}

const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
