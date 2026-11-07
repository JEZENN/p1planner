/* To-do : supprimer une tâche quand le réseau est lent — la tâche disparaît tout de suite et ne revient jamais ;
   archivée côté serveur une fois la réponse arrivée. Vraie page + émulateurs, latence imposée par le navigateur.
   Lancer : node test/e2e/todo-delete-slow.mjs   (PUBLIC_DIR=<copie « avant »> pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const server = await startServer(), proxy = await startProxy(), browser = await launch();
const task = (text) => ({ text, completed: false, archivedAt: null, createdAt: new Date(), updatedAt: new Date() });
try {
  await scenario("TD1 supprimer des tâches avec 3,5 s de latence : elles disparaissent aussitôt (animation comprise), ne reviennent pas, archivées ensuite sur le serveur", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
    for (const [id, t] of [["t1", "Tâche 1"], ["t2", "Tâche 2"], ["t3", "Tâche 3"], ["t4", "Tâche 4"]]) await adb.doc(`users/${u.uid}/tasks/${id}`).set(task(t));
    const { page, ctx } = await openPage(browser, u);
    try {
      await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); });
      await page.evaluate(() => document.getElementById("global-todo-btn").click()); await page.waitForSelector("#global-todo-overlay.active", { timeout: 8000 }); await sleep(900);
      await page.waitForSelector('.checklist-item[data-todo-id="t1"]', { timeout: 10000 });
      const cdp = await page.createCDPSession();
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 3500, downloadThroughput: -1, uploadThroughput: -1 });
      const del = async (id) => { const r = await page.evaluate((i) => { const b = document.querySelector('.checklist-item[data-todo-id="' + i + '"] .checklist-delete'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id); await page.mouse.click(r.x, r.y); };
      await page.evaluate(() => { window.__seen = {}; const t0 = performance.now(); (function f() { document.querySelectorAll(".checklist-item").forEach((e) => { const id = e.getAttribute("data-todo-id"); (window.__seen[id] = window.__seen[id] || []).push(Math.round(performance.now() - t0)); }); if (performance.now() - t0 < 9000) setTimeout(f, 100); })(); });
      await del("t1"); await sleep(250); await del("t3");
      await sleep(7800);
      const seen = await page.evaluate(() => window.__seen);
      const last = (id) => (seen[id] || [0]).slice(-1)[0];
      assert(last("t1") < 1500 && last("t3") < 1800, "tâches encore affichées trop longtemps : t1 jusqu'à " + last("t1") + " ms, t3 jusqu'à " + last("t3") + " ms");
      assert(last("t2") > 7000 && last("t4") > 7000, "les autres tâches doivent rester : " + JSON.stringify([last("t2"), last("t4")]));
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      const ok = await waitFor(async () => { const a = (await adb.doc(`users/${u.uid}/tasks/t1`).get()).data(), b = (await adb.doc(`users/${u.uid}/tasks/t3`).get()).data(); return a.archivedAt && b.archivedAt; }, { timeout: 25000 });
      assert(ok, "les tâches ne sont pas archivées côté serveur");
      const rest = await Promise.all(["t2", "t4"].map(async (i) => (await adb.doc(`users/${u.uid}/tasks/${i}`).get()).data()));
      assert(rest.every((d) => !d.archivedAt), "une autre tâche a été archivée");
      await sleep(1500);
      const left = await page.evaluate(() => [...document.querySelectorAll(".checklist-item")].map((e) => e.getAttribute("data-todo-id")));
      assert(left.join() === "t2,t4", "liste finale : " + left.join());
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    } finally { await ctx.close(); }
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
