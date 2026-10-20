/* Captures : cartes Thème et Police (PC + téléphone), une même page avec les 3 polices, écran vide jour et semaine (clair + sombre).
   Lancer : node test/e2e/captures-police-vide.mjs   → docs/captures-15-10/*.png (émulateurs, données de test) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, sleep } from "./lib.mjs";

const OUT = "C:/Users/jezen/OneDrive/Documents/INTERNAT/p1planner/docs/captures-15-10/";
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const clean = (page) => page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock(); document.body.style.overflow = ""; });
async function open(vp) {
  const u = await mkUser({ courses: 2 }); const { page } = await openPage(browser, u); page.setDefaultNavigationTimeout(120000); await page.bringToFront(); await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 }); await sleep(5000); await clean(page);
  return page;
}
try {
  for (const [dev, vp] of [["pc", { width: 1366, height: 900 }], ["tel", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const page = await open(vp);
    // cartes Thème + Police
    await page.evaluate(() => window.openSettingsModal()); await page.waitForSelector('.settings-card[data-setting="p1-font"]'); await sleep(1000);
    await page.evaluate(() => { document.querySelector('.settings-card[data-setting="p1-theme"]').scrollIntoView({ behavior: "instant", block: "start" }); }); await sleep(900);
    await page.screenshot({ path: OUT + `parametres-theme-police-${dev}.png` });
    await page.evaluate(() => { document.querySelector('.settings-card[data-setting="p1-font"]').scrollIntoView({ behavior: "instant", block: "center" }); }); await sleep(700);
    await page.screenshot({ path: OUT + `parametres-police-${dev}.png` });
    await page.evaluate(() => window.closeSettingsModal()); await sleep(700);
    // une même page avec les 3 polices
    for (const k of ["default", "serif", "round"]) {
      await page.evaluate((f) => window.p1ApplyFont(f, false), k); await page.evaluate(() => document.fonts.ready); await sleep(1200);
      await page.evaluate(() => { document.querySelector('[data-page="stats"]').click(); }); await sleep(1200);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await sleep(500);
      await page.screenshot({ path: OUT + `police-${k}-${dev}.png` });
    }
    await page.evaluate(() => window.p1ApplyFont("default", false));
    // écran vide jour + semaine, clair puis sombre
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => window.p1SetTheme(t), theme); await sleep(1200);
      for (const [kind, fn] of [["jour", "openToursTodayModal"], ["semaine", "openToursWeekModal"]]) {
        await page.evaluate((f) => { document.querySelector('[data-page="stats"]').click(); window[f](); }, fn); await sleep(1400);
        await page.screenshot({ path: OUT + `ecran-vide-${kind}-${dev}-${theme}.png` });
        await page.evaluate((f) => { (f === "openToursTodayModal" ? window.closeToursTodayModal : window.closeToursWeekModal)(); }, fn); await sleep(700);
      }
    }
    await page.close();
    console.log("ok", dev);
  }
} finally { await browser.close(); proxy.close(); server.close(); }
process.exit(0);
