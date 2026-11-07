/* Clic sur une matière (Mes matières) : la page « Mes cours » s'affiche ET l'onglet « Mes cours » est celui qui est actif
   (classe active + pastille bleue sous « Mes cours », pas sous « Mes matières »), filtre sur la matière cliquée.
   Vraie page + émulateurs. Lancer : node test/e2e/nav-matiere.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const OPEN = [];
const S = (id, title, fn) => scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } });
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const M = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const state = (page) => page.evaluate(() => {
  const btns = [...document.querySelectorAll(".app-nav-btn")].map((b) => ({ p: b.dataset.page, a: b.classList.contains("active"), l: b.offsetLeft, w: b.offsetWidth }));
  const pill = document.querySelector(".app-nav-pill"), pr = pill ? pill.getBoundingClientRect() : null;
  const act = btns.find((b) => b.a);
  const ab = document.querySelector(".app-nav-btn.active"), abr = ab ? ab.getBoundingClientRect() : null;
  return { btns: btns.filter((b) => b.a).map((b) => b.p), pages: [...document.querySelectorAll(".app-page.active")].map((p) => p.id), pillLeft: pr && Math.round(pr.left), pillW: pr && Math.round(pr.width), btnLeft: abr && Math.round(abr.left), btnW: abr && Math.round(abr.width), filter: (document.getElementById("specialty-dropdown-counter") || {}).textContent, act };
});

try {
  for (const [vp, id] of [[{ width: 1366, height: 900 }, "PC"], [{ width: 1100, height: 700 }, "PCetroit"], [M(820, 1180), "iPad"], [M(390, 844), "tel"]]) {
    await S("NM1-" + id, `(${id}) clic sur une matière de « Mes matières » : onglet « Mes cours » actif, pastille sous « Mes cours », filtre sur la matière`, async () => {
      const u = await mkUser({ courses: 2 });
      await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
      const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
      await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 600);
      await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
      await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
      await page.evaluate(() => document.querySelector('[data-page="dashboard"]').click()); await sleep(1200);
      const s0 = await state(page);
      assert(s0.btns.join() === "dashboard", "départ : " + JSON.stringify(s0));
      await page.waitForSelector(".specialty-card", { timeout: 15000 });
      await page.evaluate(() => document.querySelector(".specialty-card").scrollIntoView({ block: "center", behavior: "instant" })); await sleep(400);
      const c = await page.evaluate(() => { const r = document.querySelector(".specialty-card").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      if (vp.isMobile) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
      await sleep(900);
      const s1 = await state(page);
      assert(s1.pages.join() === "page-items", "page affichée : " + JSON.stringify(s1));
      assert(s1.btns.join() === "items", "onglet actif : " + JSON.stringify(s1));
      assert(Math.abs(s1.pillLeft - s1.btnLeft) <= 3 && Math.abs(s1.pillW - s1.btnW) <= 3, "la pastille n'est pas sous « Mes cours » : " + JSON.stringify(s1));
      assert(s1.filter === "1", "filtre sur une matière : compteur " + JSON.stringify(s1.filter));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("NM2", "page « Mes cours » (150 cours) : léger glissement d'apparition comme sur les autres pages, joué APRÈS le calcul du tableau (positions intermédiaires visibles, arrivée à 0), tableau déjà rempli ; aucun glissement avec « réduire les animations »", async () => {
    for (const reduce of [false, true]) {
      const u = await mkUser({ courses: 150 });
      await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
      const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
      if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.setViewport({ width: 1366, height: 900 }); await sleep(600);
      await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
      await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
      await page.evaluate(() => document.querySelector('.app-nav-btn[data-page="dashboard"]').click()); await sleep(1500);
      await page.evaluate(() => {
        window.__pi = []; const t0 = performance.now();
        (function f() {
          const el = document.getElementById("page-items");
          if (el && el.classList.contains("active")) { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); window.__pi.push({ t: Math.round(performance.now() - t0), y: Math.round(m.m42 * 10) / 10, rows: document.querySelectorAll("#items-table-body tr").length, an: getComputedStyle(el).animationName }); }
          if (performance.now() - t0 < 2500) requestAnimationFrame(f);
        })();
      });
      await page.evaluate(() => document.querySelector('.app-nav-btn[data-page="items"]').click());
      await sleep(2700);
      const P = await page.evaluate(() => window.__pi);
      assert(P.length > 5, "page jamais affichée");
      const mid = [...new Set(P.filter((x) => x.y > 0.5 && x.y < 11.5).map((x) => x.y))];
      const last = P[P.length - 1];
      assert(last.y === 0 && last.rows > 0, "état final : " + JSON.stringify(last));
      if (!reduce) {
        assert(mid.length >= 3, "glissement absent ou saccadé (positions intermédiaires : " + JSON.stringify(mid) + ") : " + JSON.stringify(P.slice(0, 6)));
        assert(P.filter((x) => x.y > 0.5).every((x) => x.rows > 0), "le glissement a démarré avant que le tableau soit rempli : " + JSON.stringify(P.slice(0, 6)));
      } else assert(mid.length === 0, "glissement malgré « réduire les animations » : " + JSON.stringify(mid));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
      while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} }
    }
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
