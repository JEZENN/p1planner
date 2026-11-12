/* Planning : l'icône du bouton « Mois » est dans une petite case et c'est la même icône que l'en-tête du menu déroulant.
   Vraie page + émulateurs, menu ouvert par un vrai clic, trois thèmes.
   Lancer : node test/e2e/mois-icone.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; MOISSHOT=1 pour les captures) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const OPEN = [];
const S = (id, title, fn) => scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } });
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const rgbOf = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);

async function ouvrir({ theme = "light", vp = { width: 1600, height: 900 } } = {}) {
  const u = await mkUser({ courses: 1 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 700);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
  page.__erreurs = []; page.on("pageerror", (e) => page.__erreurs.push(String(e.message || e)));
  await page.evaluate(() => document.querySelector('[data-page="planning"]').click()); await sleep(1300);
  return page;
}
const glyphe = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); const c = getComputedStyle(e, "::before").content.replace(/^["']|["']$/g, ""); return { cls: [...e.classList].filter((k) => /^fa-/.test(k)).join(" "), g: c ? c.codePointAt(0).toString(16) : null }; }, sel);

async function verifier(theme) {
  const page = await ouvrir({ theme });
  await page.waitForSelector("#month-dropdown-btn", { visible: true, timeout: 8000 });
  await page.click("#month-dropdown-btn"); await sleep(600);
  assert(await page.evaluate(() => document.getElementById("month-dropdown-menu").classList.contains("active")), "menu non ouvert");
  const bouton = await glyphe(page, "#month-dropdown-btn .custom-dropdown-icon > i"), entete = await glyphe(page, "#month-dropdown-menu .custom-dropdown-header > i:first-child");
  assert(bouton.g && bouton.g === entete.g, `icône du bouton (${bouton.cls} U+${bouton.g}) ≠ icône de l'en-tête (${entete.cls} U+${entete.g})`);
  const m = await page.evaluate(() => {
    const i = document.querySelector("#month-dropdown-btn .custom-dropdown-icon > i"), b = document.getElementById("month-dropdown-btn"), y = document.getElementById("year-dropdown-btn"), cs = getComputedStyle(i), r = i.getBoundingClientRect(), br = b.getBoundingClientRect(), t = document.getElementById("month-dropdown-text").getBoundingClientRect(), root = getComputedStyle(document.documentElement);
    return { w: r.width, h: r.height, rad: cs.borderTopLeftRadius, bg: cs.backgroundColor, fg: cs.color, dy: Math.abs((r.top + r.bottom) / 2 - (br.top + br.bottom) / 2), hBtn: br.height, hAn: y.getBoundingClientRect().height, gauche: r.left - br.left, avantTexte: t.left - r.right, ombre: cs.boxShadow };
  });
  assert(Math.round(m.w) === 26 && Math.round(m.h) === 26 && parseFloat(m.rad) >= 7, "case : " + JSON.stringify(m));
  assert(rgbOf(m.bg)[3] === undefined || rgbOf(m.bg)[3] > 0, "fond de la case transparent : " + m.bg);
  assert(rgbOf(m.bg)[3] !== 0 && m.bg !== "rgba(0, 0, 0, 0)", "case sans fond : " + m.bg);
  assert(m.dy <= 1, "icône non centrée verticalement dans le bouton (" + m.dy.toFixed(1) + " px)");
  assert(Math.abs(m.hBtn - m.hAn) <= 0.6, `hauteur du bouton Mois (${m.hBtn}) ≠ bouton Année (${m.hAn}) : la case ne doit pas agrandir le bouton`);
  assert(m.gauche >= 8 && m.avantTexte >= 4, "case collée au bord ou au texte : " + JSON.stringify(m));
  if (theme === "dark") assert(m.ombre !== "none", "sombre : pas de liseré autour de la case");
  if (process.env.MOISSHOT) { const r = await page.evaluate(() => { const d = document.querySelector(".planning-date-selector").getBoundingClientRect(), mm = document.getElementById("month-dropdown-menu").getBoundingClientRect(); return { x: d.left - 14, y: d.top - 12, width: d.width + 28, height: mm.bottom - d.top + 24 }; }); await page.screenshot({ path: `docs/captures-15-10/mois-icone-${theme}.png`, clip: r }); }
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
}

for (const theme of ["light", "dark", "pastel"]) await S("MI-" + theme, `thème ${theme} : l'icône du bouton « Mois » est dans une case (26 px, coins arrondis, fond teinté), identique à celle de l'en-tête du menu, centrée, sans agrandir le bouton`, () => verifier(theme));

await S("MI-masque", "là où l'icône est masquée (petits écrans), la case ne réapparaît pas", async () => {
  const page = await ouvrir({ vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  const r = await page.evaluate(() => { const sp = document.querySelector("#month-dropdown-btn .custom-dropdown-icon"), i = sp.querySelector("i"); return { display: getComputedStyle(sp).display, largeur: i.getBoundingClientRect().width }; });
  assert(r.display !== "none" || r.largeur === 0, "case visible alors que l'icône est masquée : " + JSON.stringify(r));
});

const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
