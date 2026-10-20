/* Annale / Colle / Concours blanc : on saisit le NOMBRE DE QCM de l'épreuve (1 ajout = 1 épreuve) ; la fenêtre, les cartes et la semaine montrent
   le nombre d'épreuves, le total de QCM et le détail de chaque épreuve. Type QCM inchangé. Vraie page + vrais émulateurs.
   Lancer : node test/e2e/epreuves-qcm.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();

const wsDocs = async (uid) => (await adb.collection(`users/${uid}/workSessions`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const waitDocs = async (uid, pred, ms = 10000) => { const t0 = Date.now(); let d = []; while (Date.now() - t0 < ms) { d = await wsDocs(uid); if (pred(d)) return d; await sleep(200); } return d; };
const txt = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; }, sel);

async function statsUser(vp) {
  const u = await mkUser({ courses: 1 });
  const ctx = await openPage(browser, u); await ctx.page.bringToFront();
  if (vp) await ctx.page.setViewport(vp);
  await sleep(vp && vp.isMobile ? 2500 : 300);
  await ctx.page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await ctx.page.waitForFunction(() => window.p1WorkSessions && window.currentUser && document.getElementById("p1TrCard"), { timeout: 30000 });
  await ctx.page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock(); document.body.style.overflow = ""; });
  await ctx.page.evaluate(() => document.querySelector('[data-page="stats"]').click()); await sleep(600);
  return { u, ...ctx };
}
/* Ajout par l'interface : type, nombre de QCM (saisi), temps (pastille). */
async function addEpreuve(page, kind, qcm, min) {
  await page.evaluate((k) => document.getElementById("p1WsTr" + k).click(), kind);
  await page.waitForFunction((k) => document.getElementById("p1WsQi").classList.contains("is-open"), { timeout: 8000 }, kind); await sleep(700);
  await page.evaluate((n, m) => {
    const i = document.getElementById("p1WsQiN"); i.value = String(n); i.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(`#p1WsQiTChips .ws-chip[data-min="${m}"]`).click();
  }, qcm, min);
  await page.evaluate(() => document.getElementById("p1WsQiOk").click());
  await page.waitForFunction(() => !document.getElementById("p1WsQi").classList.contains("is-open"), { timeout: 8000 }); await sleep(900);
}

try {
  await S("EP1", "annale : 20, 30 puis 50 QCM = 3 annales et 100 QCM (fenêtre, détail par épreuve, cartes, semaine) ; le type QCM reste en nombre de QCM ; « − » retire la dernière épreuve", async () => {
    const { u, page } = await statsUser();
    await page.evaluate(() => window.p1WorkSessions.openTrain({ mode: "add" }));
    await page.waitForSelector("#p1TrOverlay.active", { timeout: 6000 }); await sleep(1200);
    // libellés de la petite fenêtre
    await page.evaluate(() => document.getElementById("p1WsTrannale").click()); await sleep(900);
    assert((await txt(page, "#p1WsQiNLabel")) === "Nombre de QCM (1 annale)", "libellé : " + (await txt(page, "#p1WsQiNLabel")));
    assert((await txt(page, "#p1WsTrannale .ws-tr-btn-s")) === "QCM + temps", "sous-titre du bouton : " + (await txt(page, "#p1WsTrannale .ws-tr-btn-s")));
    const chips = await page.evaluate(() => [...document.querySelectorAll("#p1WsQiNChips .ws-chip")].map((c) => c.textContent));
    assert(chips.join() === "20 QCM,30 QCM,40 QCM,50 QCM,60 QCM", "pastilles du nombre : " + chips.join());
    const tchA = await page.evaluate(() => [...document.querySelectorAll("#p1WsQiTChips .ws-chip")].map((c) => c.textContent).join());
    assert(tchA === "1 h,1 h 30,2 h,3 h,4 h", "pastilles de temps annale : " + tchA);
    await page.evaluate(() => document.getElementById("p1WsQiOk").click()); await sleep(300);
    assert(/Indique le nombre de QCM/.test(await txt(page, "#p1WsQiNErr") || ""), "message sans nombre : " + (await txt(page, "#p1WsQiNErr")));
    await page.evaluate(() => document.getElementById("p1WsTrannale").click()); await sleep(900);   // referme la petite fenêtre
    for (const n of [20, 30, 50]) await addEpreuve(page, "annale", n, 60);
    // serveur : une épreuve par document, count = QCM
    const docs = await waitDocs(u.uid, (d) => d.filter((x) => x.kind === "annale").length === 3);
    const cs = docs.filter((x) => x.kind === "annale").map((x) => x.count).sort((a, b) => a - b);
    assert(cs.join() === "20,30,50", "documents (count = QCM de chaque épreuve) : " + JSON.stringify(docs.map((x) => [x.kind, x.count, x.minutes])));
    // fenêtre : tuile
    const tile = await page.evaluate(() => { const t = document.querySelector('.ws-tr-tile[data-kind="annale"]'); return t && { n: t.querySelector(".ws-tr-tile-n").textContent, t: t.querySelector(".ws-tr-tile-t").textContent, d: t.querySelector(".ws-tr-tile-d").textContent, over: t.scrollWidth > t.clientWidth + 1 }; });
    assert(tile && tile.n === "3" && tile.t === "100 QCM · 3h00" && tile.d === "20 · 30 · 50" && !tile.over, "tuile : " + JSON.stringify(tile));
    assert((await txt(page, "#p1TrDetail")) === "(3 Annale (100 QCM))", "récapitulatif : " + (await txt(page, "#p1TrDetail")));
    // type QCM : inchangé (le nombre est le nombre de QCM)
    await addEpreuve(page, "qcm", 40, 30);
    const q = await page.evaluate(() => { const t = document.querySelector('.ws-tr-tile[data-kind="qcm"]'); return t && { n: t.querySelector(".ws-tr-tile-n").textContent, t: t.querySelector(".ws-tr-tile-t").textContent, d: t.querySelector(".ws-tr-tile-d").textContent }; });
    assert(q && q.n === "40" && q.t === "0h30" && q.d === "", "tuile QCM : " + JSON.stringify(q));
    // cartes + semaine
    await page.evaluate(() => document.getElementById("p1TrClose").click()); await sleep(900);
    await page.evaluate(() => window.p1WorkSessions.renderCards()); await sleep(400);
    const c = await page.evaluate(() => ({ day: document.getElementById("p1TrCardPills").textContent.replace(/\s+/g, " ").trim(), all: document.getElementById("p1TrAllPills").textContent.replace(/\s+/g, " ").trim(),
      wn: document.querySelector('#p1TrWeekGrid .ws-tr-wcell[data-kind="annale"] .ws-tr-wcell-n').textContent, wq: (document.querySelector('#p1TrWeekGrid .ws-tr-wcell[data-kind="annale"] .ws-tr-wcell-q') || {}).textContent,
      wqcm: document.querySelector('#p1TrWeekGrid .ws-tr-wcell[data-kind="qcm"] .ws-tr-wcell-n').textContent, wqq: !!document.querySelector('#p1TrWeekGrid .ws-tr-wcell[data-kind="qcm"] .ws-tr-wcell-q') }));
    assert(c.day === "40 QCM3 Annale · 100 QCM" && c.all === "40 QCM3 Annale · 100 QCM", "pastilles des cartes : " + JSON.stringify(c));
    assert(c.wn === "3" && c.wq === "100 QCM" && c.wqcm === "40" && !c.wqq, "semaine : " + JSON.stringify(c));
    // « − » retire la dernière épreuve (50 QCM)
    await page.evaluate(() => window.p1WorkSessions.openTrain()); await page.waitForSelector("#p1TrOverlay.active", { timeout: 6000 }); await sleep(1200);
    const aria = await page.evaluate(() => document.querySelector('.ws-tr-tile[data-kind="annale"] .ws-tr-minus').getAttribute("aria-label"));
    assert(/50 QCM/.test(aria), "« − » : " + aria);
    await page.evaluate(() => document.querySelector('.ws-tr-tile[data-kind="annale"] .ws-tr-minus').click()); await sleep(900);
    const t2 = await page.evaluate(() => { const t = document.querySelector('.ws-tr-tile[data-kind="annale"]'); return { n: t.querySelector(".ws-tr-tile-n").textContent, t: t.querySelector(".ws-tr-tile-t").textContent, d: t.querySelector(".ws-tr-tile-d").textContent }; });
    assert(t2.n === "2" && t2.t === "50 QCM · 2h00" && t2.d === "20 · 30", "après « − » : " + JSON.stringify(t2));
    const d2 = await waitDocs(u.uid, (d) => d.filter((x) => x.kind === "annale" && !x.deletedAt).length === 2);
    assert(d2.filter((x) => x.kind === "annale" && x.deletedAt).map((x) => x.count).join() === "50", "la dernière épreuve (50 QCM) n'est pas retirée côté serveur");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("EP2", "colle et concours blanc : même logique (libellé, pastilles, total) — téléphone 390", async () => {
    const { u, page } = await statsUser({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.evaluate(() => window.p1WorkSessions.openTrain({ mode: "add" }));
    await page.waitForSelector("#p1TrOverlay.active", { timeout: 6000 }); await sleep(1500);
    await page.evaluate(() => document.getElementById("p1WsTrconcours-blanc").click()); await sleep(900);
    assert((await txt(page, "#p1WsQiNLabel")) === "Nombre de QCM (1 concours blanc)", "libellé CCB : " + (await txt(page, "#p1WsQiNLabel")));
    const chips = await page.evaluate(() => [...document.querySelectorAll("#p1WsQiNChips .ws-chip")].map((c) => c.textContent).join());
    assert(chips === "20 QCM,30 QCM,40 QCM,50 QCM,60 QCM", "pastilles CCB (mêmes que l'annale) : " + chips);
    const tch = await page.evaluate(() => [...document.querySelectorAll("#p1WsQiTChips .ws-chip")].map((c) => c.textContent).join());
    assert(tch === "1 h,1 h 30,2 h,3 h,4 h", "pastilles de temps CCB (mêmes que l'annale) : " + tch);
    await page.evaluate(() => document.getElementById("p1WsTrconcours-blanc").click()); await sleep(900);
    await addEpreuve(page, "colle", 15, 30); await addEpreuve(page, "colle", 25, 45); await addEpreuve(page, "concours-blanc", 100, 180);
    const docs = await waitDocs(u.uid, (d) => d.length === 3);
    assert(docs.map((x) => x.kind + ":" + x.count).sort().join() === "colle:15,colle:25,concours-blanc:100", "documents : " + JSON.stringify(docs.map((x) => [x.kind, x.count])));
    const tiles = await page.evaluate(() => ["colle", "concours-blanc"].map((k) => { const t = document.querySelector(`.ws-tr-tile[data-kind="${k}"]`); return [t.querySelector(".ws-tr-tile-n").textContent, t.querySelector(".ws-tr-tile-t").textContent, t.querySelector(".ws-tr-tile-d").textContent, t.scrollWidth > t.clientWidth + 1]; }));
    assert(JSON.stringify(tiles) === JSON.stringify([["2", "40 QCM · 1h15", "15 · 25", false], ["1", "100 QCM · 3h00", "100", false]]), "tuiles : " + JSON.stringify(tiles));
    const over = await page.evaluate(() => document.getElementById("p1TrBody").scrollWidth > document.getElementById("p1TrBody").clientWidth + 1);
    assert(!over, "défilement horizontal de la fenêtre sur téléphone");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally { await browser.close(); proxy.close(); server.close(); }
process.exit(report());
