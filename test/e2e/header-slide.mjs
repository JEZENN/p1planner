/* Raccourcis des pages dans le header : la pastille de la page active GLISSE d'un raccourci à l'autre (≈ 0,26 s) au lieu de sauter ;
   position exacte à l'arrivée ; aucune animation avec « réduire les animations » ; l'icône active reste blanche et lisible.
   Vraie page + émulateurs. Lancer : node test/e2e/header-slide.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const OPEN = [];
const S = (id, title, fn) => scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } });
const server = await startServer(), proxy = await startProxy(), browser = await launch();

async function open(theme, reduce) {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport({ width: 1366, height: 900 }); await sleep(600);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
  await page.evaluate(() => document.querySelector('[data-page="dashboard"]').click()); await sleep(1000);
  await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "2600px"; document.querySelector("footer, body").appendChild(d); }); await sleep(300);
  await page.evaluate(() => window.scrollTo(0, 700)); await sleep(1200);
  return page;
}
const probe = (page, ms) => page.evaluate((dur) => {
  window.__ih = []; const t0 = performance.now();
  (function f() {
    const ind = document.querySelector("#p1HdrNav .p1-hdr-ind"), ab = document.querySelector("#p1HdrNav .p1-hdr-b.active");
    if (ind) { const m = new DOMMatrixReadOnly(getComputedStyle(ind).transform); window.__ih.push({ t: Math.round(performance.now() - t0), x: Math.round(m.m41), page: ab ? ab.dataset.page : null, abLeft: ab ? ab.offsetLeft : null, op: Number(getComputedStyle(ind).opacity) }); }
    if (performance.now() - t0 < dur) requestAnimationFrame(f);
  })();
}, ms);

try {
  for (const theme of ["light", "dark"]) {
    await S("HD1-" + theme, `header (${theme}) : clic sur un autre raccourci → la pastille active glisse jusqu'à lui (positions intermédiaires), arrive exactement dessus, l'icône active est blanche`, async () => {
      const page = await open(theme, false);
      assert(await page.evaluate(() => !!document.querySelector("#p1HdrNav .p1-hdr-ind") && document.querySelector("#p1HdrNav").classList.contains("is-on")), "raccourcis absents");
      const start = await page.evaluate(() => { const ab = document.querySelector("#p1HdrNav .p1-hdr-b.active"); return { page: ab.dataset.page, left: ab.offsetLeft }; });
      const target = await page.evaluate((cur) => { const b = [...document.querySelectorAll("#p1HdrNav .p1-hdr-b[data-page]")].find((x) => x.dataset.page !== cur && !x.classList.contains("active")); return b.dataset.page; }, start.page);
      await probe(page, 1200);
      await page.evaluate((p) => document.querySelector(`#p1HdrNav .p1-hdr-b[data-page="${p}"]`).click(), target);
      await sleep(1400);
      const H = await page.evaluate(() => window.__ih);
      const end = await page.evaluate(() => { const ab = document.querySelector("#p1HdrNav .p1-hdr-b.active"); const ind = document.querySelector("#p1HdrNav .p1-hdr-ind"); return { page: ab && ab.dataset.page, left: ab && ab.offsetLeft, color: ab && getComputedStyle(ab).color, bg: ab && getComputedStyle(ab).backgroundColor, indLeft: ind && ind.getBoundingClientRect().left, abLeft: ab && ab.getBoundingClientRect().left }; });
      assert(end.page === target, "page active : " + JSON.stringify(end));
      const xs = H.map((h) => h.x), lo = Math.min(start.left, end.left), hi = Math.max(start.left, end.left);
      assert(xs.some((x) => x > lo + 3 && x < hi - 3), "la pastille saute d'un raccourci à l'autre (aucune position intermédiaire) : " + JSON.stringify([...new Set(xs)]));
      assert(Math.abs(xs[xs.length - 1] - end.left) <= 1 && Math.abs(end.indLeft - end.abLeft) <= 1.5, "la pastille n'est pas sur le raccourci actif : " + JSON.stringify(end));
      assert(end.color === "rgb(255, 255, 255)" && /rgba\(0, 0, 0, 0\)|transparent/.test(end.bg), "icône active (blanche, fond porté par la pastille) : " + JSON.stringify(end));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("HD2", "« réduire les animations » : la pastille passe directement sur le raccourci cliqué", async () => {
    const page = await open("light", true);
    const start = await page.evaluate(() => document.querySelector("#p1HdrNav .p1-hdr-b.active").dataset.page);
    const target = await page.evaluate((cur) => [...document.querySelectorAll("#p1HdrNav .p1-hdr-b[data-page]")].find((x) => x.dataset.page !== cur).dataset.page, start);
    await probe(page, 900);
    await page.evaluate((p) => document.querySelector(`#p1HdrNav .p1-hdr-b[data-page="${p}"]`).click(), target);
    await sleep(1100);
    const H = await page.evaluate(() => window.__ih), end = await page.evaluate(() => document.querySelector("#p1HdrNav .p1-hdr-b.active").offsetLeft);
    const mid = H.filter((h) => h.x !== H[0].x && Math.abs(h.x - end) > 1);
    assert(mid.length === 0, "positions intermédiaires malgré « réduire les animations » : " + JSON.stringify(mid.slice(0, 3)));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
