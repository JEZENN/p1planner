/* Captures d'écran des retouches du 15/10/2026 (liste à cocher, titres, bouton fermer, « Mes amis ») — PC + téléphone, clair / sombre / pastel.
   Lancer : node test/e2e/captures-15-10.mjs   → docs/captures-15-10/*.png (vraie page, émulateurs, données de test uniquement). */
import "./env-e2e.mjs";
import fs from "node:fs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, sleep } from "./lib.mjs";

const OUT = new URL("../../docs/captures-15-10/", import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const TODAY = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
const NOTE = '<div data-planning-rich="1"><ul class="planning-note-check"><li class="planning-note-done">Cardio : QCM faits</li><li>Pneumo : refaire la fiche</li><li>Neuro : relire le cours</li></ul></div>';
const PC = { width: 1366, height: 900 }, PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const shot = async (page, name) => { const p = new URL(name + ".png", OUT); await page.screenshot({ path: p.pathname.replace(/^\//, "") }); console.log("capture", name); };

async function open(theme, vp) {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/calendarDays/${TODAY}`).set({ status: "", specialties: [], notes: NOTE, updatedAt: new Date() });
  const { page } = await openPage(browser, u); await page.bringToFront(); await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && window._ednPlanningBridge, { timeout: 30000 });
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await page.waitForSelector("#tpx-onb-overlay", { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock(); document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden"); });
  const set = () => page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await set(); await sleep(2500); await set(); await sleep(300);
  return page;
}

try {
  for (const theme of ["light", "dark", "pastel"]) {
    for (const [dev, vp] of [["pc", PC], ["tel", PHONE]]) {
      const page = await open(theme, vp);
      // 1) fenêtre « Organisation de la journée » avec la liste à cocher
      await page.evaluate((d) => window.openPlanningDayDetailModal(d), TODAY); await sleep(1200);
      await shot(page, `fenetre-journee-${dev}-${theme}`);
      await page.evaluate(() => document.getElementById("pdd-close").click()); await sleep(600);
      // 2) la même liste dans la case du planning (PC seulement : la case est trop petite pour un cadrage utile sur téléphone, on cadre quand même)
      await page.evaluate(() => document.querySelector('[data-page="planning"]').click()); await sleep(800);
      await page.evaluate((d) => document.querySelector(`.day-notes-input[data-date="${d}"]`).scrollIntoView({ behavior: "instant", block: "center" }), TODAY); await sleep(900);
      await shot(page, `planning-${dev}-${theme}`);
      // 3) titres de page
      await page.evaluate(() => document.querySelector('[data-page="dashboard"]').click()); await sleep(900);
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
      await shot(page, `titre-page-${dev}-${theme}`);
      // 4) titres des statistiques
      await page.evaluate(() => document.querySelector('[data-page="stats"]').click()); await sleep(1500);
      await shot(page, `statistiques-${dev}-${theme}`);
      await page.close();
    }
  }
} finally { await browser.close(); proxy.close(); server.close(); }
process.exit(0);
