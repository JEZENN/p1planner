/* Mesures de mise en page des TOURS (mode détaillé) dans une VRAIE page — 2026-09-27.
   Vérifie (1) que les dates sont toutes à la même hauteur dans une ligne (téléphone portrait :
   placeholders alignés) et (2) que sur tablette (481 → 1100 px) le tableau garde sa taille naturelle et
   défile horizontalement. Arguments = préfixes de scénarios ; PAGE_FILE=<autre version> pour rejouer
   sur un MUTANT / l'ancienne version (contrôle de sensibilité). CSS uniquement : aucune donnée touchée. */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

/* Ligne A = celle de la photo (T1 sans durée/support avec date ; T2 et T3 « 1:00 » + cours + date) ;
   ligne B = supports variés ; ligne C = dates seules. */
async function seed(uid, { full = false } = {}) {
  const c = (id, data) => adb.doc(`users/${uid}/courses/${id}`).set(data, { merge: true });
  const A = { tourConfidences: [3, 4, 4], tourDates: ["2026-09-05", "2026-09-11", "2026-09-20"], tourDurations: [null, "1:00", "1:00"], tourSupports: [null, "cours", "cours"] };
  const B = { tourConfidences: [2, 3, 4, 3], tourDates: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"], tourDurations: ["0:45", null, "1:30", "2:00"], tourSupports: ["qcm", null, "perso", "conf"] };
  const C = { tourConfidences: [3, 3, 3], tourDates: ["2026-08-01", "2026-08-08", "2026-08-15"], tourDurations: [null, null, null], tourSupports: [null, null, null] };
  if (full) { // 8 tours remplis -> mode 14 tours, page 2 affichée par défaut
    for (const r of [A, B, C]) {
      const n = 8;
      r.tourConfidences = Array.from({ length: n }, (_, i) => 2 + (i % 3));
      r.tourDates = Array.from({ length: n }, (_, i) => `2026-0${1 + (i % 8)}-1${i % 9}`);
      r.tourDurations = Array.from({ length: n }, (_, i) => (r === A ? (i === 0 ? null : "1:00") : r === B ? (i % 2 ? null : "1:30") : null));
      r.tourSupports = Array.from({ length: n }, (_, i) => (r === A ? (i === 0 ? null : "cours") : r === B ? ["qcm", null, "perso", "conf"][i % 4] : null));
    }
    A.tourConfidences.push(3, 4); A.tourDates.push("2026-09-21", "2026-09-22"); A.tourDurations.push("1:00", null); A.tourSupports.push("qcm", null);
  }
  await c("c1", A); await c("c2", B); await c("c3", C);
}

async function open(user, { extended = false, page2 = false } = {}) {
  const { page } = await openPage(browser, user);
  await page.evaluate(async (ext) => {
    try { localStorage.setItem("toursViewMode__" + window.currentUser.uid, "classic"); } catch (e) {}
    if (window.tpxSetExtendedToursRuntime) window.tpxSetExtendedToursRuntime(!!ext);
    document.querySelector('[data-page="items"]').click();
  }, extended);
  await sleep(1200);
  await page.evaluate(() => { if (typeof window.renderItemsTable === "function") window.renderItemsTable(); });
  await sleep(600);
  if (page2) { // la page 2 est celle par défaut quand T8 est rempli ; sinon on bascule à la flèche
    await page.evaluate(() => { const b = document.querySelector(".tour-page-arrow-right:not([disabled])"); if (b) b.click(); });
    await sleep(500);
  }
  return page;
}

/* Mesures : par ligne, écart de hauteur des dates VISIBLES, chevauchements, tailles. */
const measure = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll("#items-table-body tr")].filter((r) => r.querySelector(".tour-cell"));
  const out = { rows: rows.length, maxSpread: 0, dateOverlap: false, arrowOverlap: false, badge: null, tableWidth: 0, containerClient: 0, containerScroll: 0,
    pageScroll: document.documentElement.scrollWidth - innerWidth, tableStyleWidth: getComputedStyle(document.querySelector("#page-items .items-table")).width };
  const inter = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  for (const r of rows) {
    const dates = [...r.querySelectorAll(".tour-date:not(.ti-placeholder)")].filter((d) => d.textContent.trim() && d.offsetParent !== null);
    const tops = dates.map((d) => d.getBoundingClientRect().top);
    if (tops.length > 1) out.maxSpread = Math.max(out.maxSpread, Math.max(...tops) - Math.min(...tops));
    const rects = dates.map((d) => d.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    for (let i = 1; i < rects.length; i++) if (rects[i].left < rects[i - 1].right - 0.5) out.dateOverlap = true;
    const arrow = r.querySelector(".tour-page-arrow"), ind = r.querySelector(".tour-page-indicator");
    const prio = r.querySelector(".days-cell-inner > *");
    const badges = [...r.querySelectorAll(".tour-badge")].filter((b) => b.offsetParent !== null);
    const last = badges[badges.length - 1];
    for (const x of [arrow, ind]) {
      if (!x) continue;
      const xr = x.getBoundingClientRect();
      if (prio && inter(xr, prio.getBoundingClientRect())) out.arrowOverlap = true;
      if (last && inter(xr, last.getBoundingClientRect())) out.arrowOverlap = true;
    }
    if (!out.badge) { const b = r.querySelector(".tour-badge:not(.locked)"); if (b) { const q = b.getBoundingClientRect(); out.badge = [Math.round(q.width), Math.round(q.height)]; } }
  }
  const t = document.querySelector("#page-items .items-table"), c = document.querySelector("#page-items .items-container");
  out.tableWidth = Math.round(t.getBoundingClientRect().width); out.containerClient = c.clientWidth; out.containerScroll = c.scrollWidth;
  return out;
});
const fmt = (m) => JSON.stringify(m);

try {
  const u = await mkUser({ courses: 3 });
  await seed(u.uid);
  let page = await open(u);
  const at = async (w, h = 900) => { await page.setViewport({ width: w, height: h }); await sleep(450); return measure(page); };

  await S("L1", "téléphone portrait 360-480 px : dates à la même hauteur (max − min ≤ 0,5 px), même avec placeholders", async () => {
    for (const w of [360, 375, 390, 414, 430, 480]) {
      const m = await at(w);
      assert(m.rows >= 3, `lignes absentes à ${w}`);
      assert(m.maxSpread <= 0.5, `${w} px : écart de hauteur des dates ${m.maxSpread.toFixed(2)} px (${fmt(m)})`);
    }
  });

  await S("L2", "tablettes 481-1100 px : cases 30×28, tableau en taille naturelle (max-content) qui défile, aucun chevauchement", async () => {
    for (const w of [481, 600, 744, 768, 820, 834, 900, 1024, 1080, 1100]) {
      const m = await at(w);
      assert(m.badge && m.badge[0] === 30 && m.badge[1] === 28, `${w} px : cases ${m.badge} au lieu de 30×28`);
      assert(m.tableWidth >= 900, `${w} px : tableau comprimé (${m.tableWidth} px)`);
      if (m.tableWidth > m.containerClient) assert(m.containerScroll > m.containerClient, `${w} px : le conteneur ne défile pas alors que le tableau (${m.tableWidth}) dépasse (${m.containerClient})`);
      assert(!m.dateOverlap, `${w} px : dates qui se chevauchent`);
      assert(m.maxSpread <= 0.5, `${w} px : dates décalées (${m.maxSpread.toFixed(2)})`);
      assert(m.pageScroll <= 0, `${w} px : défilement horizontal de la PAGE (${m.pageScroll})`);
    }
  });

  await S("L3", "inchangés : bureau ≥ 1101 px (30×28) et téléphone ≤ 480 px (26×24), paysage téléphone", async () => {
    for (const w of [1101, 1180, 1366]) { const m = await at(w); assert(m.badge[0] === 30 && m.badge[1] === 28, `${w} px : ${m.badge}`); assert(!m.dateOverlap, `${w} px chevauchement`); }
    for (const [w, h] of [[320, 700], [390, 844], [430, 932], [480, 900]]) { const m = await at(w, h); assert(m.badge[0] === 26 && m.badge[1] === 24, `${w} px : cases ${m.badge} au lieu de 26×24`); }
    for (const [w, h] of [[667, 375], [844, 390]]) { const m = await at(w, h); assert(m.badge[0] === 30 && m.badge[1] === 28, `paysage ${w}×${h} : ${m.badge}`); assert(m.maxSpread <= 0.5 && !m.dateOverlap, `paysage ${w}×${h} : ${fmt(m)}`); }
  });

  await S("L6", "aucun défilement horizontal global de la page, de 320 à 1366 px (seul .items-container défile)", async () => {
    for (const w of [320, 360, 390, 430, 480, 481, 600, 768, 834, 1024, 1100, 1180, 1366]) {
      const m = await at(w);
      assert(m.pageScroll <= 0, `${w} px : la page défile horizontalement de ${m.pageScroll} px`);
    }
  });

  await S("L7", "thème sombre : mêmes mesures (390 et 834 px)", async () => {
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
    await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); });
    for (const w of [390, 834]) { const m = await at(w); assert(m.maxSpread <= 0.5 && !m.dateOverlap, `${w} px sombre : ${fmt(m)}`); }
    await page.evaluate(() => { document.documentElement.removeAttribute("data-theme"); });
  });

  // ── Mode 14 tours (page 2 affichée par défaut car T8 est rempli) ──────────────────────
  const u2 = await mkUser({ courses: 3 });
  await seed(u2.uid, { full: true });
  page = await open(u2, { extended: true });
  await S("L4", "flèche/indicateur (mode 14 tours) : aucun chevauchement avec la pastille de priorité ni le dernier badge, 320 → 1366 px", async () => {
    for (const w of [320, 360, 390, 430, 480, 481, 600, 768, 834, 1024, 1100, 1180, 1366]) {
      const m = await at(w);
      assert(!m.arrowOverlap, `${w} px : flèche/indicateur chevauche la priorité ou un badge (${fmt(m)})`);
    }
  });
  await S("L5", "mode 14 tours, page 2 puis page 1 : mêmes garanties (dates alignées à ≤ 480, taille naturelle 481-1100)", async () => {
    for (const p2 of [true, false]) {
      if (!p2) { await page.evaluate(() => { const b = document.querySelector(".tour-page-arrow:not([disabled])"); if (b) b.click(); }); await sleep(600); }
      for (const w of [375, 430, 480]) { const m = await at(w); assert(m.maxSpread <= 0.5, `${w} px page ${p2 ? 2 : 1} : écart ${m.maxSpread.toFixed(2)} (${fmt(m)})`); }
      for (const w of [600, 834, 1024, 1100]) {
        const m = await at(w);
        assert(m.badge && m.badge[0] === 30 && m.badge[1] === 28, `${w} px page ${p2 ? 2 : 1} : cases ${m.badge}`);
        assert(!m.dateOverlap && m.pageScroll <= 0, `${w} px page ${p2 ? 2 : 1} : ${fmt(m)}`);
      }
    }
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
