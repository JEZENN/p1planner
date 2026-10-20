/* Barre de sauvegarde sous l'en-tête : bleue qui avance pendant l'écriture, verte à la confirmation puis effacée, orange si l'écriture tarde (hors ligne),
   rouge si elle est refusée ; l'ancien rond / coche reste caché. Vraie page + vrais émulateurs ; états échantillonnés toutes les 25 ms DANS la page.
   Lancer : node test/e2e/save-bar.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const TODAY = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();

async function user(opts = {}) {
  const u = await mkUser({ courses: 1 });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); await ctx.page.bringToFront();
  if (opts.theme) await ctx.page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), opts.theme);
  await ctx.page.waitForFunction(() => window.currentUser && window._ednPlanningBridge, { timeout: 30000 });
  await ctx.page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await ctx.page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock(); document.body.style.overflow = ""; });
  return { u, ...ctx };
}
/* Échantillonneur : enregistre l'état de la barre (classes, opacité, largeur) toutes les 25 ms. */
const startSampler = (page) => page.evaluate(() => {
  window.__sb = []; window.__sbRun = true;
  (function tick() {
    if (!window.__sbRun) return;
    const b = document.getElementById("p1-save-bar"), f = b && b.firstChild;
    window.__sb.push(b ? { c: b.className, o: +getComputedStyle(b).opacity, w: Math.round((f.getBoundingClientRect().width / b.getBoundingClientRect().width) * 100) } : null);
    setTimeout(tick, 25);
  })();
});
const stopSampler = (page) => page.evaluate(() => { window.__sbRun = false; return window.__sb; });
const has = (s, cls) => s.some((x) => x && x.c.split(" ").includes(cls) && (cls === "saving" || x.o > 0.3));   // « enregistrement » peut ne durer que quelques ms sur un émulateur local : on regarde la classe
const ctl = (m) => fetch("http://127.0.0.1:8186/mode/" + m).then((r) => r.text());

try {
  await S("SB1", "écriture réussie : la barre apparaît (bleue, elle avance), devient verte à la confirmation, puis s'efface ; le rond / la coche d'avant reste caché ; la note est bien enregistrée", async () => {
    const { u, page } = await user();
    await page.evaluate((d) => window.openPlanningDayDetailModal(d), TODAY); await page.waitForSelector("#pdd-editor", { timeout: 8000 }); await sleep(900);
    await startSampler(page);
    await page.click("#pdd-editor"); await page.keyboard.type("Barre de sauvegarde");
    await sleep(3500);
    const s = await stopSampler(page);
    assert(has(s, "saving"), "pas de phase « enregistrement » (bleue) : " + JSON.stringify(s.filter((x) => x).slice(0, 6)));
    assert(has(s, "saved"), "pas de phase « enregistré » (verte)");
    await sleep(1800);
    const end = await page.evaluate(() => { const b = document.getElementById("p1-save-bar"); return { op: +getComputedStyle(b).opacity, old: getComputedStyle(document.getElementById("save-indicator-header")).visibility }; });
    assert(end.op < 0.05, "la barre ne s'efface pas : " + JSON.stringify(end));
    assert(end.old === "hidden", "l'ancien indicateur est visible : " + JSON.stringify(end));
    const geo = await page.evaluate(() => { const b = document.getElementById("p1-save-bar").getBoundingClientRect(), h = document.getElementById("header").getBoundingClientRect(); return { dBottom: Math.round(Math.abs(b.bottom - h.bottom)), w: Math.round(b.width), vw: innerWidth, h: Math.round(b.height) }; });
    assert(geo.dBottom <= 2 && geo.w >= geo.vw - 1 && geo.h === 2, "position de la barre : " + JSON.stringify(geo));
    const n = (await adb.doc(`users/${u.uid}/calendarDays/${TODAY}`).get()).data();
    assert(n && /Barre de sauvegarde/.test(n.notes || ""), "note non enregistrée : " + JSON.stringify(n));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("SB2", "écriture refusée : la barre devient ROUGE puis s'efface", async () => {
    const { page } = await user();
    await startSampler(page);
    await page.evaluate(async () => { try { await window._fsSetDoc(window._fsDoc(window._fsDb, "users", window.currentUser.uid, "interdit", "x"), { a: 1 }); } catch (e) {} });
    await sleep(1500);
    const s = await stopSampler(page);
    assert(has(s, "error"), "pas de phase « erreur » (rouge) : " + JSON.stringify(s.filter((x) => x).slice(0, 8)));
    await sleep(4500);
    const op = await page.evaluate(() => +getComputedStyle(document.getElementById("p1-save-bar")).opacity);
    assert(op < 0.05, "la barre rouge ne s'efface pas (" + op + ")");
  });

  await S("SB3", "réseau qui ne répond plus : la barre passe à l'ORANGE (en attente) si l'écriture tarde, puis au vert au retour du réseau ; rien n'est perdu", async () => {
    const { u, page } = await user();
    await page.evaluate((d) => window.openPlanningDayDetailModal(d), TODAY); await page.waitForSelector("#pdd-editor", { timeout: 8000 }); await sleep(900);
    await startSampler(page);
    await ctl("hang");   // réseau qui ne répond plus (le serveur ne confirme rien)
    // l'écriture directe d'un jour (même chemin que la case du planning) : en attente tant que le serveur ne répond pas
    await page.evaluate((d) => window._ednPlanningBridge.saveDayNotesRich(d, "<div>Hors ligne puis retour</div>"), TODAY);
    await sleep(8500);
    let s = await stopSampler(page);
    const maxBlue = Math.max(0, ...s.filter((x) => x && x.c.includes("saving")).map((x) => x.w));
    assert(maxBlue >= 50, "la barre bleue n'avance pas (largeur max " + maxBlue + " %)");
    assert(has(s, "pending"), "pas de phase « en attente » (orange) après 6 s sans confirmation : " + JSON.stringify(s.filter((x) => x).slice(-4)));
    await startSampler(page);
    await ctl("up");
    const t0 = Date.now(); let d = null;
    while (Date.now() - t0 < 25000) { d = (await adb.doc(`users/${u.uid}/calendarDays/${TODAY}`).get()).data(); if (d && /Hors ligne puis retour/.test(d.notes || "")) break; await sleep(500); }
    s = await stopSampler(page);
    assert(d && /Hors ligne puis retour/.test(d.notes || ""), "l'écriture n'a pas été reprise au retour du réseau");
    assert(has(s, "saved"), "pas de phase verte au retour du réseau : " + JSON.stringify(s.filter((x) => x).slice(-5)));
  });

  for (const theme of ["dark", "pastel"]) {
    await S("SB4-" + theme, `thème ${theme} : la barre reste collée au bas de l'en-tête, visible, 2 px`, async () => {
      const { page } = await user({ theme });
      await sleep(2500); await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.evaluate(async () => { window.p1SaveBar("saving"); });
      await sleep(900);
      const g = await page.evaluate(() => { const b = document.getElementById("p1-save-bar"), r = b.getBoundingClientRect(), h = document.getElementById("header").getBoundingClientRect(), f = getComputedStyle(b.firstChild); return { dBottom: Math.round(Math.abs(r.bottom - h.bottom)), h: Math.round(r.height), op: +getComputedStyle(b).opacity, bg: f.backgroundImage !== "none" ? "dégradé" : f.backgroundColor }; });
      assert(g.dBottom <= 2 && g.h === 2 && g.op > 0.9, `(${theme}) ` + JSON.stringify(g));
    });
  }
} finally { await browser.close(); proxy.close(); server.close(); }
process.exit(report());
