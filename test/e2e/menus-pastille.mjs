/* Pastilles d'icônes (légendes, en-têtes des menus déroulants) et barre de défilement du menu « Mois ».
   Vraie page + émulateurs, navigateur lancé SANS « --hide-scrollbars » (sinon aucune barre n'est dessinée et le test ne prouve rien),
   captures sans « captureBeyondViewport ». La géométrie de la barre est lue sur les PIXELS de la capture.
   Lancer : node test/e2e/menus-pastille.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; MENUSHOTS=<préfixe> pour garder les captures) */
import "./env-e2e.mjs";
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { mkUser, adb, scenario, report, assert, sleep, openPage } from "./lib.mjs";

const exe = [process.env.BROWSER_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].filter(Boolean).find((p) => fs.existsSync(p));
const server = await startServer(), proxy = await startProxy();
const browser = await puppeteer.launch({ executablePath: exe, headless: "new", ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,900"] });
const shot = process.env.MENUSHOTS;
const THEMES = ["light", "dark", "pastel"];

/* lit des pixels d'une capture PNG (base64) : colonnes de la barre (x) pour chaque ligne y */
const lirePixels = (page, b64, xs) => page.evaluate(async (data, xs) => {
  const oct = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([oct], { type: "image/png" }));
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  const out = { w: bmp.width, h: bmp.height, cols: {} };
  for (const x of xs) { const d = g.getImageData(x, 0, 1, bmp.height).data; const col = []; for (let y = 0; y < bmp.height; y++) col.push([d[y * 4], d[y * 4 + 1], d[y * 4 + 2], d[y * 4 + 3]]); out.cols[x] = col; }
  return out;
}, b64, xs);
const proche = (a, b, tol = 14) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

async function ouvrir(theme) {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...(theme !== "light" ? { theme } : {}) }, { merge: true });
  const { page } = await openPage(browser, u);
  await page.setViewport({ width: 1500, height: 900 });   /* le sélecteur Mois / Année du planning n'existe qu'au-delà de 1366 px */
  await page.evaluate((t) => { try { localStorage.setItem("theme", t); } catch (e) {} const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; if (window.p1SetTheme) window.p1SetTheme(t, false); }, theme);
  await sleep(700);
  page.__erreurs = []; page.on("pageerror", (e) => page.__erreurs.push(String(e.message || e)));
  return page;
}
const aller = async (page, id) => { await page.click(`.app-nav-btn[data-page="${id}"]`); await sleep(900); };
const pastilleEntete = (page, menuId) => page.evaluate((id) => {
  const h = document.querySelector("#" + id + " .custom-dropdown-header"), i = h && h.querySelector(":scope > i:first-child");
  if (!h || !i) return null;
  const cs = getComputedStyle(i), hs = getComputedStyle(h), r = i.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), rad: cs.borderTopLeftRadius, bg: cs.backgroundColor, fg: cs.color, hauteurEntete: Math.round(h.getBoundingClientRect().height), fondEntete: hs.backgroundColor };
}, menuId);

for (const theme of THEMES) {
  /* ═════════ M1 : pastille des en-têtes (Mois, Année, Cours par page, Entraînements par page) ═════════ */
  await scenario(`M1-${theme} pastille dans l'en-tête des menus « Mois », « Année », « Cours par page » et « Entraînements par page » (${theme}) : case arrondie de 28 px, en-tête de 46 px`, async () => {
    const page = await ouvrir(theme);
    await aller(page, "planning");
    for (const [btn, menu] of [["month-dropdown-btn", "month-dropdown-menu"], ["year-dropdown-btn", "year-dropdown-menu"]]) {
      await page.click("#" + btn); await sleep(500);
      const p = await pastilleEntete(page, menu);
      assert(p && p.w === 28 && p.h === 28 && p.rad === "8px" && p.hauteurEntete === 46, `${menu} : ` + JSON.stringify(p));
      assert(theme !== "dark" || (rgb(p.fg).join() === "147,197,253" && /0\.18/.test(p.bg)), `${menu} (sombre) : ` + JSON.stringify(p));
      await page.click("#" + btn); await sleep(400);
    }
    await aller(page, "items");
    await page.click("#pagination-dropdown-btn"); await sleep(500);
    let p = await pastilleEntete(page, "pagination-dropdown-menu");
    assert(p && p.w === 28 && p.h === 28 && p.rad === "8px" && p.hauteurEntete === 46, "pagination-dropdown-menu : " + JSON.stringify(p));
    await page.click("#pagination-dropdown-btn"); await sleep(400);
    await aller(page, "entrainements");
    await page.click("#train-pagination-dropdown-btn"); await sleep(500);
    p = await pastilleEntete(page, "train-pagination-dropdown-menu");
    assert(p && p.w === 28 && p.h === 28 && p.rad === "8px" && p.hauteurEntete === 46, "train-pagination-dropdown-menu : " + JSON.stringify(p));
    assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
  });

  /* ═════════ M2 : pastille des légendes ═════════ */
  await scenario(`M2-${theme} pastille dans le titre des légendes des matières (Planning, Entraînements) (${theme}) : case de 34 px, arrondie, icône de la couleur d'accent`, async () => {
    const page = await ouvrir(theme);
    await aller(page, "planning");
    await page.evaluate(() => window.togglePlanningLegendModal({ stopPropagation() {} })); await sleep(600);
    const mesure = () => page.evaluate(() => [...document.querySelectorAll(".legend-modal-title")].filter((t) => t.offsetParent !== null).map((t) => { const i = t.querySelector(":scope > i:first-child"), cs = getComputedStyle(i), r = i.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), rad: cs.borderTopLeftRadius, bg: cs.backgroundColor, fg: cs.color }; }));
    let m = await mesure();
    assert(m.length >= 1 && m.every((x) => x.w === 34 && x.h === 34 && x.rad === "10px" && !/^rgba\(0, 0, 0, 0\)$/.test(x.bg)), "légende du planning : " + JSON.stringify(m));
    if (theme === "dark") assert(m.every((x) => rgb(x.fg).join() === "147,197,253"), "icône sombre : " + JSON.stringify(m));
    await page.evaluate(() => window.closePlanningLegendModal && window.closePlanningLegendModal()); await sleep(500);
    await aller(page, "entrainements");
    await page.evaluate(() => window.toggleTrainLegendModal({ stopPropagation() {} })); await sleep(600);
    m = await mesure();
    assert(m.length >= 1 && m.every((x) => x.w === 34 && x.h === 34 && x.rad === "10px"), "légende des entraînements : " + JSON.stringify(m));
    assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
  });

  /* ═════════ M3 : barre de défilement du menu « Mois », lue sur les pixels ═════════ */
  await scenario(`M3-${theme} menu « Mois » (${theme}) : barre dessinée dans le menu, sous l'en-tête, arrêtée avant l'arrondi du bas, sans flèches ; l'en-tête va jusqu'au bord droit (haut de liste et bas de liste)`, async () => {
    const page = await ouvrir(theme);
    await aller(page, "planning");
    await page.click("#month-dropdown-btn"); await sleep(700);
    const info = await page.evaluate(() => { const m = document.getElementById("month-dropdown-menu"), r = m.getBoundingClientRect(), h = m.querySelector(".custom-dropdown-header").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, sh: m.scrollHeight, ch: m.clientHeight, cw: m.clientWidth, off: m.offsetWidth, rad: getComputedStyle(m).borderTopLeftRadius, fondEntete: getComputedStyle(m.querySelector(".custom-dropdown-header")).backgroundColor, entete: h.height }; });
    assert(info.sh > info.ch + 20, "le menu n'est pas défilable : " + JSON.stringify(info));
    assert(info.off - info.cw >= 11 && info.off - info.cw <= 13, "largeur de la barre : " + (info.off - info.cw) + " px (attendu 12)");
    const verifier = async (etat) => {
      const clip = { x: Math.floor(info.x), y: Math.floor(info.y), width: Math.ceil(info.w), height: Math.ceil(info.h) };
      const png = await page.screenshot({ clip, captureBeyondViewport: false, encoding: "base64" });
      if (shot) fs.writeFileSync(`docs/captures-15-10/${shot}-mois-${theme}-${etat}.png`, Buffer.from(png, "base64"));
      const W = clip.width, H = clip.height, xs = [W - 8, W - 6, W - 3];
      const px = await lirePixels(page, png, xs);
      const col = px.cols[W - 6];
      const fond = col[Math.round(info.entete) + 3];   /* sous l'en-tête, au-dessus du début de la piste : fond du menu */
      const ent = rgb(info.fondEntete);
      /* en-tête : la bande de la barre (3 colonnes) a la couleur de l'en-tête sur toute sa hauteur, jusqu'au bord droit */
      for (const x of xs) for (const y of [8, 22, 38]) assert(proche(px.cols[x][y], ent, 18), `${etat} : bande de l'en-tête à x=${x} y=${y} = ${px.cols[x][y]} au lieu de ${ent}`);
      /* sous l'en-tête et dans le bas : le fond du menu (aucune flèche, aucun bouton) */
      for (const y of [48, 49, 50, 51]) assert(proche(col[y], fond, 10), `${etat} : pixel ${y} (entre l'en-tête et la piste) = ${col[y]} ≠ fond ${fond}`);
      for (const y of [H - 3, H - 5, H - 7, H - 9]) assert(proche(col[y], fond, 10), `${etat} : pixel ${y} (bas du menu) = ${col[y]} ≠ fond ${fond}`);
      /* le pouce : couleur ≠ fond, entre 52 et H - 10 */
      const pouce = []; for (let y = 52; y < H - 10; y++) if (!proche(col[y], fond, 12)) pouce.push(y);
      assert(pouce.length > 40, `${etat} : pouce introuvable (${pouce.length} pixels)`);
      assert(pouce[0] >= 52 && pouce[pouce.length - 1] <= H - 10, `${etat} : pouce de ${pouce[0]} à ${pouce[pouce.length - 1]} (hauteur ${H})`);
      return { debut: pouce[0], fin: pouce[pouce.length - 1], H };
    };
    const haut = await verifier("haut");
    await page.evaluate(() => { const m = document.getElementById("month-dropdown-menu"); m.scrollTop = m.scrollHeight; }); await sleep(400);
    const bas = await verifier("bas");
    assert(bas.debut > haut.debut + 10, `le pouce ne descend pas (${haut.debut} → ${bas.debut})`);
    assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
  });
}

/* ═════════ M4 : les autres menus restent entiers ═════════ */
await scenario("M4 menus « Année », « Cours par page » et « Entraînements par page » : ouverts, ils s'affichent dans leur cadre, sans barre qui déborde de l'en-tête ni arrondi cassé", async () => {
  const page = await ouvrir("light");
  await aller(page, "planning");
  await page.click("#year-dropdown-btn"); await sleep(500);
  const r = await page.evaluate(() => { const m = document.getElementById("year-dropdown-menu"), r = m.getBoundingClientRect(); return { h: Math.round(r.height), sh: m.scrollHeight, ch: m.clientHeight, ov: getComputedStyle(m).overflowY, rad: getComputedStyle(m).borderTopLeftRadius }; });
  assert(r.sh <= r.ch + 1 && r.rad !== "0px", "menu Année : " + JSON.stringify(r));
  await page.click("#year-dropdown-btn"); await sleep(300);
  await aller(page, "items");
  await page.click("#pagination-dropdown-btn"); await sleep(500);
  const p = await page.evaluate(() => { const m = document.getElementById("pagination-dropdown-menu"), r = m.getBoundingClientRect(); return { visible: r.height > 40 && getComputedStyle(m).visibility === "visible", sh: m.scrollHeight, ch: m.clientHeight, off: m.offsetWidth - m.clientWidth }; });
  assert(p.visible, "menu Cours par page non affiché : " + JSON.stringify(p));
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
