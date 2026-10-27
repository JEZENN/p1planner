/* Listes personnalisables (27/10/2026) : les titres « Ajouter » / « Existants » de la fenêtre commune #p1-catalog-modal ont leur icône dans une petite case pastel
   (32 px, coins 10 px), comme les titres de la méthode Pomodoro et des fenêtres « Temps de travail » / « Entraînements du jour ». Purement visuel.
   PC 1366 + téléphone 390 ; clair, sombre, pastel ; les 4 listes (resources, supports, trainTypes, trainPlateformes). Vraie page + émulateurs.
   Lancer : node test/e2e/catalog-titles.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; CATSHOTS=1 pour les captures) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const KINDS = ["resources", "supports", "trainTypes", "trainPlateformes"];
const FORMATS = [
  { id: "PC", label: "PC 1366", vp: { width: 1366, height: 900 } },
  { id: "tel", label: "téléphone 390", vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
];

async function open(f, theme) {
  const u = await mkUser({ courses: 1 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.setViewport(f.vp); await sleep(f.vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t), theme); await sleep(500); }
  await page.evaluate(() => document.querySelector('[data-page="items"]').click()); await sleep(900);
  return page;
}

const measure = (page) => page.evaluate(() => {
  const modal = document.getElementById("p1-catalog-modal"), box = modal.querySelector(".notes-modal-content, .modal-content, .settings-modal-inner") || modal.firstElementChild;
  const bb = box.getBoundingClientRect();
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return { raw: c, a: c === "transparent" ? 0 : 1 }; const p = m[1].split(/[ ,\/]+/).filter(Boolean); return { raw: c, a: p.length > 3 ? parseFloat(p[3]) : 1 }; };
  const one = (el) => {
    const i = el.querySelector(":scope > i"), ib = i.getBoundingClientRect(), cs = getComputedStyle(i), eb = el.getBoundingClientRect();
    const rng = document.createRange(); const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    let tb = null; if (tn) { rng.selectNodeContents(tn); const rr = rng.getBoundingClientRect(); tb = { l: rr.left, r: rr.right, t: rr.top, b: rr.bottom }; }
    const badge = el.querySelector(".p1-catalog-count-badge"), bd = badge && badge.getBoundingClientRect();
    return {
      txt: el.textContent.replace(/\s+/g, " ").trim(), w: ib.width, h: ib.height, radius: cs.borderTopLeftRadius, bg: parse(cs.backgroundColor), color: cs.color,
      textGap: tb ? tb.l - ib.right : null, textMid: tb ? (tb.t + tb.b) / 2 - (ib.top + ib.bottom) / 2 : null,
      badgeMid: bd ? (bd.top + bd.bottom) / 2 - (ib.top + ib.bottom) / 2 : null, badgeRight: bd ? eb.right - bd.right : null, badgeTop: bd ? bd.top : null,
      oneLine: eb.height <= 40, over: el.scrollWidth > el.clientWidth + 1 || eb.right > bb.right + 1 || eb.left < bb.left - 1, tt: getComputedStyle(el).textTransform, fs: getComputedStyle(el).fontSize, col: getComputedStyle(el).color,
    };
  };
  const titles = [...modal.querySelectorAll(".p1-catalog-section-title")].map(one);
  return { titles, pageOver: document.documentElement.scrollWidth > innerWidth + 1, modalOver: box.scrollWidth > box.clientWidth + 1 };
});

try {
  for (const f of FORMATS) for (const theme of ["light", "dark", "pastel"]) {
    await S(`CT-${f.id}-${theme}`, `${f.label} (${theme}) : titres « Ajouter » / « Existants » des 4 listes : icône 32×32 px, coins 10 px, fond teinté non transparent, une seule ligne, texte collé à l'icône, compteur à droite centré, rien ne déborde`, async () => {
      const page = await open(f, theme);
      const bad = [];
      for (const kind of KINDS) {
        await page.evaluate((k) => window._p1OpenCatalogModal(k), kind); await sleep(700);
        const r = await measure(page);
        if (r.titles.length !== 2) { bad.push(`${kind}: ${r.titles.length} titres`); continue; }
        const [add, ex] = r.titles;
        for (const [n, t] of [["Ajouter", add], ["Existants", ex]]) {
          if (!t.txt.startsWith(n)) bad.push(`${kind}/${n}: texte « ${t.txt} »`);
          if (Math.abs(t.w - 32) > 0.6 || Math.abs(t.h - 32) > 0.6) bad.push(`${kind}/${n}: icône ${t.w}×${t.h}`);
          if (t.radius !== "10px") bad.push(`${kind}/${n}: coins ${t.radius}`);
          if (!(t.bg.a > 0.05)) bad.push(`${kind}/${n}: fond ${t.bg.raw}`);
          if (!t.oneLine || t.over) bad.push(`${kind}/${n}: ligne/débordement ${JSON.stringify(t)}`);
          if (t.tt !== "none" || t.fs !== "16px") bad.push(`${kind}/${n}: style ${t.tt} ${t.fs}`);
          if (t.textGap == null || t.textGap < 6 || t.textGap > 14) bad.push(`${kind}/${n}: texte à ${t.textGap} px de l'icône`);
          if (Math.abs(t.textMid) > 2) bad.push(`${kind}/${n}: texte décalé de ${t.textMid.toFixed(1)} px`);
        }
        if (ex.badgeMid == null || Math.abs(ex.badgeMid) > 2) bad.push(`${kind}: compteur décalé verticalement ${ex.badgeMid}`);
        if (ex.badgeRight == null || ex.badgeRight > 3) bad.push(`${kind}: compteur pas à droite (${ex.badgeRight} px du bord)`);
        if (r.pageOver || r.modalOver) bad.push(`${kind}: débordement page/fenêtre`);
        if (process.env.CATSHOTS && kind === "supports") await page.screenshot({ path: `docs/captures-15-10/catalogue-titres-${f.id}-${theme}.png` });
        await page.evaluate(() => window._p1CloseCatalogModal()); await sleep(500);
      }
      assert(!bad.length, bad.join(" ; "));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
