/* Mode Compact : le chiffre du compteur de tours change avec une légère animation (l'ancien glisse et s'efface, le nouveau arrive ;
   vers le haut quand on ajoute, vers le bas quand on retire) ; rien si « réduire les animations » ; chiffre final correct.
   Vraie page + émulateurs. Lancer : node test/e2e/compact-roll.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const OPEN = [];
const S = (id, title, fn) => scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } });
const server = await startServer(), proxy = await startProxy(), browser = await launch();

async function open(theme, reduce) {
  const u = await mkUser({ courses: 1 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport({ width: 1366, height: 900 }); await sleep(600);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
  await page.evaluate((uid) => { try { localStorage.setItem("toursViewMode__" + uid, "compact"); } catch (e) {} }, u.uid);
  await page.evaluate(() => document.querySelector('[data-page="items"]').click()); await sleep(1100);
  await page.evaluate(() => { window.applyToursModeToStats && window.applyToursModeToStats(); window.renderItemsTable && window.renderItemsTable(); }); await sleep(600);
  return { u, page };
}
const record = (page, ms) => page.evaluate((dur) => {
  window.__roll = []; const t0 = performance.now();
  (function f() {
    const n = document.querySelector('#items-table-body .tour-cell .ct-num'), v = n && n.querySelector(".ct-num-v");
    if (n && v) { const cs = getComputedStyle(v), after = getComputedStyle(n, "::after"); window.__roll.push({ t: Math.round(performance.now() - t0), cls: n.className, prev: n.getAttribute("data-prev"), txt: v.textContent, op: Number(cs.opacity), tf: cs.transform, afterShown: after.display !== "none", afterOp: Number(after.opacity) }); }
    if (performance.now() - t0 < dur) requestAnimationFrame(f);
  })();
}, ms);
const pickAndAdd = async (page) => {
  await page.evaluate(() => document.querySelector("#items-table-body .tour-cell .ct-zone-r").click());
  await page.waitForSelector(".ct-conf-pop", { timeout: 5000 }); await sleep(500);
  await page.evaluate(() => { const bs = [...document.querySelectorAll(".ct-conf-pop button")]; (bs[3] || bs[bs.length - 1]).click(); });
};

try {
  for (const theme of ["light", "dark"]) {
    await S("CR1-" + theme, `Compact (${theme}) : 0 → 1 (ajout) : l'ancien « 0 » glisse vers le haut et s'efface, le « 1 » monte et apparaît (≈ 0,26 s) ; puis 1 → 0 (retrait) : sens inverse ; chiffres finaux justes ; aucune erreur`, async () => {
      const { u, page } = await open(theme, false);
      assert(await page.evaluate(() => document.body.classList.contains("tours-compact") && !!document.querySelector(".ct-tile")), "pas en mode Compact");
      assert((await page.evaluate(() => document.querySelector("#items-table-body .tour-cell .ct-num").textContent.trim())) === "0", "départ à 0");
      await record(page, 1600);
      await pickAndAdd(page); await sleep(1700);
      const A = await page.evaluate(() => window.__roll);
      const up = A.filter((x) => /ct-roll-up/.test(x.cls));
      assert(up.length > 3 && up.every((x) => x.prev === "0" && x.txt === "1"), "animation d'ajout absente : " + JSON.stringify(A.filter((x) => x.txt === "1").slice(0, 3)));
      assert(up.some((x) => x.op > 0.02 && x.op < 0.98), "le nouveau chiffre n'a pas d'état intermédiaire (fondu) : " + JSON.stringify(up.slice(0, 4)));
      assert(up.some((x) => x.afterShown && x.afterOp > 0.02 && x.afterOp < 0.98), "l'ancien chiffre ne s'efface pas en douceur");
      const last = A[A.length - 1];
      assert(last.txt === "1" && last.op === 1 && (last.tf === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(last.tf)), "état final : " + JSON.stringify(last));
      assert(await waitFor(async () => { const d = (await adb.doc(`users/${u.uid}/courses/c1`).get()).data() || {}; return (d.tours || d.tourConfidences || []).filter((x) => x != null).length === 1; }, { timeout: 15000 }), "tour non écrit sur le serveur");
      // retrait : 1 → 0
      await sleep(800);
      await record(page, 1600);
      await page.evaluate(() => document.querySelector("#items-table-body .tour-cell .ct-zone-l").click());
      await page.waitForSelector(".ct-rm-pop .ctrm-btn", { timeout: 5000 }); await sleep(500);
      await page.evaluate(() => document.querySelector(".ct-rm-pop .ctrm-btn").click()); await sleep(1700);
      const B = await page.evaluate(() => window.__roll);
      const down = B.filter((x) => /ct-roll-down/.test(x.cls));
      assert(down.length > 3 && down.every((x) => x.prev === "1" && x.txt === "0"), "animation de retrait absente : " + JSON.stringify(B.filter((x) => x.txt === "0").slice(0, 3)));
      assert(B[B.length - 1].txt === "0" && B[B.length - 1].op === 1, "état final après retrait : " + JSON.stringify(B[B.length - 1]));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("CR2", "« réduire les animations » : le chiffre change sans animation (aucun fondu, aucun ancien chiffre affiché)", async () => {
    const { page } = await open("light", true);
    await record(page, 1600);
    await pickAndAdd(page); await sleep(1700);
    const A = await page.evaluate(() => window.__roll);
    assert(A.some((x) => x.txt === "1"), "le chiffre n'a pas changé");
    assert(A.filter((x) => x.txt === "1").every((x) => x.op === 1 && !x.afterShown), "animation jouée malgré « réduire les animations » : " + JSON.stringify(A.filter((x) => x.txt === "1").slice(0, 3)));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("CR3", "Compact : « Ajouter Tour » depuis la fenêtre des notes -> cadre vert + « +1 tour » autour de la ligne du tableau, l'ancien check plein écran n'apparaît pas ; le tour est bien écrit", async () => {
    const { u, page } = await open("light", false);
    assert(await page.evaluate(() => document.body.classList.contains("tours-compact")), "pas en mode Compact");
    await page.evaluate(() => { window.__chk = 0; const f = window.showTourSuccessAnimation; window.showTourSuccessAnimation = function () { window.__chk++; return f.apply(this, arguments); }; });
    await page.evaluate(() => window.openNotesModal(1, "s1", "c1", "Cours1")); await sleep(1500);
    await page.evaluate(() => document.querySelector(".notes-action-btn.btn-tour").click());
    await page.waitForSelector(".confidence-btn", { visible: true, timeout: 10000 }); await sleep(700);
    await page.evaluate(() => { document.querySelector('.confidence-btn[data-confidence="4"]').click(); });
    await sleep(300);
    await page.evaluate(() => {
      window.__cf = []; const t0 = performance.now();
      (function f() {
        const g = document.querySelector(".p1-cfx-glow"), p = document.querySelector(".p1-cfx-pill"), row = document.querySelector('#items-table-body .tour-cell[data-specialty="s1"][data-fc="c1"]');
        const r = row && row.closest("tr");
        if (g && r) { const a = g.getBoundingClientRect(), b = r.getBoundingClientRect(); window.__cf.push({ t: Math.round(performance.now() - t0), dW: Math.round(a.width - b.width), dH: Math.round(a.height - b.height), pill: p ? p.textContent : null, overlay: !!(document.getElementById("tour-success-overlay") || {}).classList && document.getElementById("tour-success-overlay").classList.contains("active") }); }
        if (performance.now() - t0 < 4000) requestAnimationFrame(f);
      })();
    });
    await page.evaluate(() => document.getElementById("btn-save-tour").click());
    await sleep(4200);
    const cf = await page.evaluate(() => window.__cf);
    assert(cf.length > 10 && cf.some((x) => x.pill === "+1 tour"), "cadre vert + « +1 tour » jamais vus (" + cf.length + " mesures)");
    assert(cf.every((x) => !x.overlay) && (await page.evaluate(() => window.__chk)) === 0, "l'ancien check plein écran a été joué : " + JSON.stringify({ chk: await page.evaluate(() => window.__chk) }));
    assert(cf.slice(3).every((x) => Math.abs(x.dW) <= 4 && Math.abs(x.dH) <= 4), "cadre différent de la ligne : " + JSON.stringify(cf.slice(3, 6)));
    const ok = await waitFor(async () => { const d = (await adb.doc(`users/${u.uid}/courses/c1`).get()).data() || {}; return (d.tourConfidences || d.tours || []).filter((x) => x != null).length === 1; }, { timeout: 15000 });
    assert(ok, "tour non écrit");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
