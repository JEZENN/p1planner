/* Chargement en squelette : la barre de défilement verticale ne décale pas le squelette.
   Vraie page + émulateurs, vraies barres de défilement visibles (le mode headless les masque par défaut), échantillon à chaque image
   depuis le début du chargement : pendant tout le squelette, la largeur du header et celle de la barre de navigation du squelette restent identiques,
   que le squelette tienne ou non dans la fenêtre.
   Lancer : node test/e2e/skel-barre.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import puppeteer from "puppeteer-core";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { mkUser, openPage, scenario, report, assert, sleep } from "./lib.mjs";

const server = await startServer(), proxy = await startProxy();
const browser = await puppeteer.launch({ executablePath: process.env.BROWSER_PATH, headless: "new", ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,900"] });

async function echantillonner(vh, courses) {
  const u = await mkUser({ courses });
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.setViewport({ width: 1280, height: vh });
    await page.evaluateOnNewDocument(() => {
      window.__S = [];
      const loop = () => {
        const d = document.documentElement, nb = document.querySelector(".p1-sk-navbar"), sk = document.getElementById("p1-skel"), hd = document.querySelector(".header");
        window.__S.push({ skel: d.classList.contains("p1-skel"), visible: !!(sk && sk.getBoundingClientRect().height > 0), nbW: nb ? Math.round(nb.getBoundingClientRect().width * 10) / 10 : null, nbL: nb ? Math.round(nb.getBoundingClientRect().left * 10) / 10 : null, hdW: hd ? Math.round(hd.getBoundingClientRect().width) : null, sh: d.scrollHeight, ih: window.innerHeight });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.documentElement.classList.contains("p1-skel") && !document.getElementById("p1-skel"), { timeout: 30000 });
    await sleep(500);
    const S = await page.evaluate(() => window.__S);
    const sk = S.filter((s) => s.skel && s.visible && s.nbW != null);
    return { n: sk.length, nbW: [...new Set(sk.map((s) => s.nbW))], nbL: [...new Set(sk.map((s) => s.nbL))], hdW: [...new Set(sk.map((s) => s.hdW).filter((x) => x != null))] };
  } finally { await ctx.close(); }
}

for (const [vh, courses, desc] of [[900, 3, "squelette plus haut que la fenêtre (barre présente)"], [1300, 3, "squelette qui tient juste dans la fenêtre"], [1500, 2, "grande fenêtre (squelette plus court que la fenêtre)"]]) {
  await scenario(`SB-${vh} ${desc} : le squelette et le header ne bougent pas pendant tout le chargement`, async () => {
    const r = await echantillonner(vh, courses);
    assert(r.n >= 5, "squelette jamais observé : " + JSON.stringify(r));
    assert(r.nbW.length === 1, "la largeur du squelette change pendant le chargement : " + JSON.stringify(r.nbW));
    assert(r.nbL.length === 1, "la position du squelette change : " + JSON.stringify(r.nbL));
    assert(r.hdW.length === 1, "la largeur du header change pendant le squelette : " + JSON.stringify(r.hdW));
  });
}

const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
