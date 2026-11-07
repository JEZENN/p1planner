/* Matières et cours personnalisés : supprimer quand le réseau est lent — l'élément disparaît tout de suite des listes
   (compteurs de l'état local) et ne revient jamais ; archivé côté serveur une fois la réponse arrivée.
   Vraie page + émulateurs, latence imposée par le navigateur.
   Lancer : node test/e2e/perso-delete-slow.mjs   (PUBLIC_DIR=<copie « avant »> pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const server = await startServer(), proxy = await startProxy(), browser = await launch();
const LAT = (cdp, ms) => cdp.send("Network.emulateNetworkConditions", { offline: false, latency: ms, downloadThroughput: -1, uploadThroughput: -1 });
const sampler = (page, ms) => page.evaluate((dur) => { window.__cnt = []; const t0 = performance.now(); (function f() { const c = window.TPXPerso.counts(); window.__cnt.push([Math.round(performance.now() - t0), c.specialties, c.items]); if (performance.now() - t0 < dur) setTimeout(f, 100); })(); }, ms);
const press = async (page, sel) => {
  for (let k = 0; k < 4; k++) {
    await page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); if (r.top < 40 || r.bottom > innerHeight - 40) e.scrollIntoView({ block: "center", behavior: "instant" }); }, sel);
    await sleep(350);
    const c = await page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const h = document.elementFromPoint(x, y); return { x, y, hit: !!h && (e === h || e.contains(h) || h.contains(e)) }; }, sel);
    if (c.hit || k === 3) { await page.mouse.click(c.x, c.y); return; }
  }
};
async function open(pageName, seed) {
  const u = await mkUser({ courses: 4 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  if (seed) await seed(u.uid);
  const ctx = await openPage(browser, u);
  const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; });
  await page.evaluate((p) => { document.querySelector(`[data-page="${p}"]`).click(); }, pageName);
  await sleep(1500);
  await page.waitForFunction(() => window.TPXPerso && window.TPXPerso.counts().items >= 4, { timeout: 30000 });
  return { u, ctx, page };
}
try {
  await scenario("PD1 supprimer une matière avec 3,5 s de latence : elle disparaît aussitôt de l'état local, ne revient pas, archivée ensuite sur le serveur", async () => {
    const { u, ctx, page } = await open("dashboard", async (uid) => { for (const i of [2, 3]) await adb.doc(`users/${uid}/subjects/s${i}`).set({ name: "Matiere" + i, color: "#7c6cf6", order: 10 + i * 10, archivedAt: null, createdAt: new Date() }); });
    try {
      const before = await page.evaluate(() => window.TPXPerso.counts());
      assert(before.specialties === 3 && before.items === 4, "départ inattendu : " + JSON.stringify(before));
      const cdp = await page.createCDPSession(); await cdp.send("Network.enable"); await LAT(cdp, 3500);
      await sampler(page, 9000);
      await page.evaluate(() => { window.TPXPerso._deleteSpecialty("s2"); });
      await sleep(9500);
      const cnt = await page.evaluate(() => window.__cnt);
      const firstLow = cnt.find((c) => c[1] === 2);
      assert(firstLow && firstLow[0] < 1500, "la matière reste comptée trop longtemps : première fois à 2 matières = " + (firstLow ? firstLow[0] + " ms" : "jamais"));
      assert(cnt.filter((c) => c[0] > (firstLow ? firstLow[0] : 0)).every((c) => c[1] === 2), "la matière réapparaît : " + JSON.stringify(cnt.filter((c) => c[1] !== 2).slice(-3)));
      await LAT(cdp, 0);
      const ok = await waitFor(async () => !!((await adb.doc(`users/${u.uid}/subjects/s2`).get()).data() || {}).archivedAt, { timeout: 25000 });
      assert(ok, "matière non archivée côté serveur");
      const others = await Promise.all(["s1", "s3"].map(async (i) => (await adb.doc(`users/${u.uid}/subjects/${i}`).get()).data()));
      assert(others.every((d) => !d.archivedAt), "une autre matière a été archivée");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    } finally { await ctx.ctx.close(); }
  });
  await scenario("PD2 supprimer un cours (fenêtre « Gérer ») avec 3,5 s de latence : il disparaît aussitôt de l'état local, ne revient pas, archivé ensuite sur le serveur", async () => {
    const { u, ctx, page } = await open("items");
    try {
      await page.evaluate(() => { try { window.renderItemsTable(); } catch (e) {} }); await sleep(600);
      await press(page, "#tpx-btn-mgr-entry"); await sleep(1100);
      const key = await page.evaluate(() => document.querySelectorAll("#tpx-mgr-list .tpx-mgr-row")[1].getAttribute("data-key"));
      const cid = key.split("|")[1];
      const cdp = await page.createCDPSession(); await cdp.send("Network.enable"); await LAT(cdp, 3500);
      await sampler(page, 9000);
      await press(page, '#tpx-mgr-list .tpx-mgr-row[data-key="' + key + '"] .tpx-mgr-act.danger'); await sleep(700);
      await press(page, "#tpx-cf-yes");
      await sleep(9500);
      const cnt = await page.evaluate(() => window.__cnt);
      const firstLow = cnt.find((c) => c[2] === 3);
      assert(firstLow && firstLow[0] < 2500, "le cours reste compté trop longtemps : première fois à 3 cours = " + (firstLow ? firstLow[0] + " ms" : "jamais"));
      assert(cnt.filter((c) => c[0] > firstLow[0]).every((c) => c[2] === 3), "le cours réapparaît : " + JSON.stringify(cnt.filter((c) => c[2] !== 3).slice(-3)));
      await LAT(cdp, 0);
      const ok = await waitFor(async () => !!((await adb.doc(`users/${u.uid}/courses/${cid}`).get()).data() || {}).archivedAt, { timeout: 25000 });
      assert(ok, "cours non archivé côté serveur");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    } finally { await ctx.ctx.close(); }
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
