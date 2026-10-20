/* Retouches du 15/10/2026 (suite) : « jours depuis la dernière révision » en jour calendaire local, clés de jour des
   statistiques, notification de trophée fantôme, couronne Premium sous une fenêtre (téléphone), suppression d'une tâche.
   Vraie page + vrais émulateurs ; horloge simulée (Europe/Paris) injectée avant le chargement de la page.
   Lancer : node test/e2e/retouches-15-10.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];   // contextes ouverts par le scenario en cours : fermes a la fin (sinon les pages restent actives et ralentissent les suivants)
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

/* ── horloge simulée : instant « aujourd'hui à hh:mm, heure de Paris » ── */
const TZ = "Europe/Paris";
const parisParts = (t) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).filter((p) => p.type !== "literal").map((p) => [p.type, +p.value]));
const parisOffset = (t) => { const p = parisParts(t); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000; };
const pad = (n) => String(n).padStart(2, "0");
const todayP = parisParts(Date.now());
const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const TODAY = keyOf(todayP.year, todayP.month, todayP.day);
const YESTERDAY = (() => { const d = new Date(Date.UTC(todayP.year, todayP.month - 1, todayP.day - 1)); return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); })();
const parisInstant = (h, mi) => { const base = Date.UTC(todayP.year, todayP.month - 1, todayP.day, h, mi); let t = base - parisOffset(base); t = base - parisOffset(t); return t; };
const clockScript = (target) => `(() => { const D = Date, off = ${target} - D.now();
  class FD extends D { constructor(...a) { if (a.length === 0) super(D.now() + off); else super(...a); } static now() { return D.now() + off; } }
  window.Date = FD; })();`;

const PHONE = { width: +(process.env.PHONE_W || 390), height: +(process.env.PHONE_H || 844), isMobile: true, hasTouch: true, deviceScaleFactor: 2 };   // PHONE_W=360 PHONE_H=780 pour le petit téléphone
async function killOnboarding(page) {
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await page.waitForSelector("#tpx-onb-overlay", { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => {
    const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove();
    if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear();
    window.__ednAnonymousLockCount = 0;
    if (window._ednScrollUnlock) window._ednScrollUnlock();
    document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden");
  });
}
async function page_(opts = {}) {
  const u = await mkUser({ courses: opts.courses || 1 });
  if (opts.seed) await opts.seed(u);
  const ctx = await openPage(browser, u, { init: opts.at ? clockScript(opts.at) : null, tz: opts.at ? TZ : null });
  OPEN.push(ctx.ctx);
  const page = ctx.page; await page.bringToFront();
  await page.setViewport(opts.viewport || { width: 1366, height: 900 });
  await sleep(opts.viewport && opts.viewport.isMobile ? 2500 : 400);
  await page.waitForFunction(() => window.currentUser && window._ednPlanningBridge, { timeout: 30000 });
  await killOnboarding(page);
  return { u, ...ctx };
}

/* ── jours depuis la dernière révision, en jour calendaire local ── */
for (const [label, h, mi] of [["00h30", 0, 30], ["12h00", 12, 0]]) {
  await S("DJ-" + label.replace("h", ""), `« jours depuis la dernière révision » à ${label} (Paris) : cours revu hier = 1 j (date AAAA-MM-JJ ou AAAA-MM-JJT00:00:00.000Z), revu aujourd'hui = 0 j`, async () => {
    const { page } = await page_({
      courses: 3, at: parisInstant(h, mi),
      seed: async (u) => {
        await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: [3], tourDates: [YESTERDAY + "T00:00:00.000Z"], tourSupports: ["qcm"] }, { merge: true });
        await adb.doc(`users/${u.uid}/courses/c2`).set({ tourConfidences: [3], tourDates: [YESTERDAY], tourSupports: ["qcm"] }, { merge: true });
        await adb.doc(`users/${u.uid}/courses/c3`).set({ tourConfidences: [3], tourDates: [TODAY + "T00:00:00.000Z"], tourSupports: ["qcm"] }, { merge: true });
      },
    });
    const now = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); });
    assert(now.startsWith(TODAY) && now.endsWith(`${pad(h)}:${pad(mi)}`.slice(0, 5)) || now.slice(11, 13) === pad(h), "horloge simulée : " + now);
    await page.evaluate(() => document.querySelector('[data-page="items"]').click());
    await page.waitForFunction(() => document.querySelectorAll('#items-table-body .days-cell[data-fc="c1"] .days-badge').length > 0, { timeout: 20000 });
    await sleep(500);
    const b = await page.evaluate(() => Object.fromEntries(["c1", "c2", "c3"].map((c) => [c, (document.querySelector(`#items-table-body .days-cell[data-fc="${c}"] .days-badge`) || {}).textContent])));
    assert(b.c1 === "1j" && b.c2 === "1j" && b.c3 === "0j", `[${now}] pastilles de jours : ${JSON.stringify(b)} (attendu c1 1j, c2 1j, c3 0j)`);
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
}

/* ── clés de jour des statistiques (absence attendue du défaut) : un tour daté d'aujourd'hui à 00 h 30 compte aujourd'hui ── */
await S("WK", "statistiques du jour / de la semaine à 00h30 (Paris) : un tour daté d'aujourd'hui compte aujourd'hui, pas la veille", async () => {
  const { page } = await page_({
    courses: 1, at: parisInstant(0, 30),
    seed: async (u) => { await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: [3], tourDates: [TODAY + "T00:00:00.000Z"], tourDurations: ["1:00"], tourSupports: ["qcm"] }, { merge: true }); },
  });
  const r = await page.evaluate(() => {
    const wk = window.getWeeklyData();
    let daily = null; try { daily = typeof calculateDailyStats === "function" ? calculateDailyStats().toursToday : null; } catch (e) { daily = "erreur " + e.message; }
    const loc = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
    return { daily, loc, days: wk.days, toursData: wk.toursData, totalTours: wk.totalTours };
  });
  const idx = r.days.length - 1;
  assert(r.days[idx] === r.loc, "dernier jour de la semaine = aujourd'hui local : " + JSON.stringify(r));
  assert(r.toursData[idx] === 1 && r.totalTours === 1, "tour du jour mal classé : " + JSON.stringify(r));
  assert(r.daily === null || r.daily === 1, "tours du jour (statistiques du jour) : " + JSON.stringify(r.daily));
});

/* ── notification de trophée fantôme ── */
await S("TR1", "notification de trophée : invisible = non cliquable et non visible (visibility:hidden + pointer-events:none) tant que « show » n'est pas posé ; l'affichage reste possible avec « show »", async () => {
  const { page } = await page_({ viewport: PHONE });
  const g = await page.evaluate(() => {
    const n = document.getElementById("trophy-notification"), cs = getComputedStyle(n), r = n.getBoundingClientRect();
    const hits = []; for (let x = 4; x < innerWidth; x += 20) { const e = document.elementFromPoint(x, innerHeight - 1); if (e && n.contains(e)) hits.push(Math.round(x)); }
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const e2 = document.elementFromPoint(cx, cy);
    return { show: n.classList.contains("show"), vis: cs.visibility, pe: cs.pointerEvents, op: cs.opacity, top: Math.round(r.top), vh: innerHeight, hitsBottom: hits.length, hitsCentre: !!(e2 && n.contains(e2)) };
  });
  assert(g.vis === "hidden" && g.pe === "none" && g.hitsBottom === 0 && !g.hitsCentre, "notification fantôme : " + JSON.stringify(g));
  const on = await page.evaluate(async () => { const n = document.getElementById("trophy-notification"); n.classList.add("show"); await new Promise((r) => setTimeout(r, 700)); const cs = getComputedStyle(n); const o = { vis: cs.visibility, op: cs.opacity, pe: cs.pointerEvents }; n.classList.remove("show"); return o; });
  assert(on.vis === "visible" && +on.op === 1, "avec « show » la notification doit s'afficher : " + JSON.stringify(on));
});

/* ── couronne Premium flottante sous une fenêtre, téléphone ── */
await S("FB1", "couronne Premium : masquée sur téléphone (<= 600 px) tant qu'une fenêtre est ouverte, conservée pendant le message « Premium » (tpx-nudge) et sur PC", async () => {
  const MODALS = ["settings-modal-overlay", "help-modal-overlay", "feedback-modal-overlay", "whats-new-modal-overlay", "pdd-overlay"];
  const { page } = await page_({ viewport: PHONE });
  await page.evaluate(() => { document.body.classList.add("tpx-premium-locked"); window.tpxPremiumLocked = true; });
  await page.waitForFunction(() => document.getElementById("tpx-premium-fab"), { timeout: 8000 });
  const disp = () => page.evaluate(() => getComputedStyle(document.getElementById("tpx-premium-fab")).display);
  assert((await disp()) === "flex", "sans fenêtre la couronne doit être visible : " + (await disp()));
  for (const cls of MODALS) {
    const has = await page.evaluate((c) => !!document.querySelector("." + c), cls);
    if (!has) continue;
    await page.evaluate((c) => document.querySelector("." + c).classList.add("active"), cls); await sleep(250);
    const d = await disp();
    const nudge = await page.evaluate(() => { const f = document.getElementById("tpx-premium-fab"); f.classList.add("tpx-nudge"); const x = getComputedStyle(f).display; f.classList.remove("tpx-nudge"); return x; });
    await page.evaluate((c) => document.querySelector("." + c).classList.remove("active"), cls); await sleep(150);
    assert(d === "none", `fenêtre « ${cls} » ouverte : la couronne est ${d} (attendu none)`);
    assert(nudge === "flex", `fenêtre « ${cls} » ouverte + message Premium : la couronne est ${nudge} (attendu flex)`);
  }
  assert((await disp()) === "flex", "fenêtre refermée : la couronne doit revenir");
  // même règle par le verrou de défilement (corps figé = une fenêtre est ouverte), et pour le bouton d'essai
  const both = () => page.evaluate(() => { const g = (id) => { const e = document.getElementById(id) || document.querySelector("." + id); return e ? getComputedStyle(e).display : "absent"; }; return { premium: g("tpx-premium-fab"), trial: g("tpx-trial-fab") }; });
  const rest = await both();
  await page.evaluate(() => { document.body.style.overflow = "hidden"; }); await sleep(250);
  const locked = await both();
  const lockedNudge = await page.evaluate(() => { const f = document.getElementById("tpx-premium-fab"); f.classList.add("tpx-nudge"); const x = getComputedStyle(f).display; f.classList.remove("tpx-nudge"); return x; });
  await page.evaluate(() => { document.body.style.overflow = ""; }); await sleep(150);
  assert(locked.premium === "none" && lockedNudge === "flex", "verrou de défilement : couronne " + JSON.stringify(locked) + " avec message Premium " + lockedNudge);
  if (rest.trial === "flex") assert(locked.trial === "none", "verrou de défilement : le bouton d'essai reste visible " + JSON.stringify(locked));
  await page.setViewport({ width: 1366, height: 900 }); await sleep(2500);   // (le passage téléphone -> PC recharge la page : on repose l'état verrouillé)
  await page.waitForFunction(() => window.currentUser && window._ednPlanningBridge, { timeout: 30000 }); await killOnboarding(page);
  await page.evaluate(() => { document.body.classList.add("tpx-premium-locked"); window.tpxPremiumLocked = true; });
  await page.waitForFunction(() => document.getElementById("tpx-premium-fab"), { timeout: 8000 }); await sleep(300);
  await page.evaluate(() => document.querySelector(".settings-modal-overlay").classList.add("active")); await sleep(250);
  assert((await disp()) === "flex", "sur PC la couronne ne doit pas être masquée : " + (await disp()));
  await page.evaluate(() => document.querySelector(".settings-modal-overlay").classList.remove("active"));
});

/* ── suppression d'une tâche : animation discrète ── */
async function withTask(page) {
  await page.evaluate(() => { const i = document.getElementById("checklist-new-item"); i.value = "Tâche à supprimer"; document.getElementById("checklist-add-btn").click(); });
  await page.waitForFunction(() => document.querySelector(".checklist-item"), { timeout: 15000 });
  await page.evaluate(() => { if (window.openGlobalTodoDrawer) window.openGlobalTodoDrawer(); }); await sleep(700);
}
/* La transition démarre un peu tard dans le navigateur de test : on échantillonne jusqu'à voir une valeur intermédiaire. */
const seenAnimating = async (page, h0) => { const t0 = Date.now(); while (Date.now() - t0 < 900) { const v = await visibleItem(page); if (v && v.conn && (v.op < 0.999 || v.h < h0 - 0.5)) return true; if (!v) return false; await sleep(30); } return false; };
const visibleItem = (page) => page.evaluate(() => { const e = [...document.querySelectorAll(".checklist-item")].find((x) => x.offsetParent !== null); if (!e) return null; const cs = getComputedStyle(e); return { op: +cs.opacity, h: e.getBoundingClientRect().height, tr: cs.transform, conn: e.isConnected }; });
await S("DEL1", "supprimer une tâche : glissement + fondu + repli (~0,3 s) avant la suppression ; supprimée ensuite côté serveur", async () => {
  const { u, page } = await page_({});
  await withTask(page);
  const h0 = (await visibleItem(page)).h;
  await page.evaluate(() => [...document.querySelectorAll(".checklist-delete")].find((x) => x.offsetParent !== null).click());
  const mid = await seenAnimating(page, h0);
  assert(mid, "pas d'animation à mi-course (la tâche a disparu d'un coup ou n'a pas bougé)  h0=" + h0);

  await sleep(1500);
  assert(!(await visibleItem(page)), "la tâche est encore affichée");
  const arch = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 10000) { const s = await adb.collection(`users/${u.uid}/tasks`).get(); const d = s.docs.map((x) => x.data()); if (d.length && d.every((x) => x.archivedAt)) return true; await sleep(300); } return false; })();
  assert(arch, "la tâche n'est pas archivée côté serveur");
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
});
await S("DEL2", "supprimer une tâche : si la liste n'est pas redessinée, la tâche est restaurée ; « mouvements réduits » = suppression immédiate", async () => {
  const { page } = await page_({});
  await withTask(page);
  await page.evaluate(() => { window.__orig = PlanningModule.deleteChecklistItem; PlanningModule.deleteChecklistItem = function () { window.__called = (window.__called || 0) + 1; }; });
  await page.evaluate(() => [...document.querySelectorAll(".checklist-delete")].find((x) => x.offsetParent !== null).click());
  const mid2 = await seenAnimating(page, 57);
  assert(mid2, "pas d'animation avant la suppression");

  await sleep(3800);
  const back = await visibleItem(page);
  const called = await page.evaluate(() => window.__called || 0);
  assert(called === 1 && back && back.op > 0.99 && back.h > 10, "tâche non restaurée (ou suppression appelée " + called + " fois) : " + JSON.stringify(back));
  await page.evaluate(() => { PlanningModule.deleteChecklistItem = window.__orig; });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluate(() => [...document.querySelectorAll(".checklist-delete")].find((x) => x.offsetParent !== null).click());
  let inter = 0, gone = false; const t0 = Date.now();
  while (Date.now() - t0 < 5000) { const v = await visibleItem(page); if (!v) { gone = true; break; } if (v.op < 0.999 || v.h < 50 || v.tr !== "none") inter++; await sleep(20); }
  assert(gone && inter === 0, "mouvements réduits : disparition " + (gone ? "ok" : "absente") + ", " + inter + " image(s) intermédiaire(s) (aucune attendue)");
});

/* ── graduations entières des graphiques qui comptent des unités ── */
await S("CH1", "graphique « Tours » de la semaine : graduations entières seulement (pas de 0,2 / 0,4 quand il y a 1 tour)", async () => {
  const { page } = await page_({
    courses: 1,
    seed: async (u) => { await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: [3], tourDates: [TODAY + "T00:00:00.000Z"], tourDurations: ["1:00"], tourSupports: ["qcm"] }, { merge: true }); },
  });
  await page.evaluate(() => document.querySelector('[data-page="stats"]').click());
  await page.waitForFunction(() => window.Chart && window.Chart.getChart && window.Chart.getChart("chart-tours-weekly"), { timeout: 20000 });
  await sleep(1200);
  const t = await page.evaluate(() => Chart.getChart("chart-tours-weekly").scales.y.ticks.map((x) => x.value));
  assert(t.length >= 2 && t.every((v) => Number.isInteger(v)), "graduations du graphique Tours : " + JSON.stringify(t));
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
});

/* ── « Mes amis » : soulignement glissant + fondu du panneau ── */
await S("FR1", "« Mes amis » : un trait glisse sous l'onglet actif (ouverture sans glissement), le panneau apparaît en fondu/montée, rien ne bouge avec « mouvements réduits »", async () => {
  const { page } = await page_({});
  await page.evaluate(() => window.openFriendsModal());
  await page.waitForFunction(() => document.getElementById("friends-modal-overlay").classList.contains("active"), { timeout: 8000 }); await sleep(900);
  const pos = () => page.evaluate(() => { const i = document.querySelector("#friends-modal-overlay .p1-ftab-ink"), t = document.querySelector("#friends-modal-overlay .friends-tab.active"); if (!i) return null; const ir = i.getBoundingClientRect(), tr = t.getBoundingClientRect(); return { il: ir.left, iw: ir.width, ih: ir.height, tl: tr.left, tw: tr.width, bg: getComputedStyle(i).backgroundColor, tabBorder: getComputedStyle(t).borderBottomColor }; });
  const p0 = await pos();
  assert(p0 && Math.abs(p0.il - p0.tl) < 1.5 && Math.abs(p0.iw - p0.tw) < 1.5 && p0.ih >= 1.9, "trait absent ou mal placé à l'ouverture : " + JSON.stringify(p0));
  assert(p0.bg !== "rgba(0, 0, 0, 0)", "trait transparent : " + JSON.stringify(p0));
  const seen = { slide: false, fade: false };
  await page.evaluate(() => document.getElementById("ftab-list").click());
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    const p = await pos(), target = await page.evaluate(() => document.getElementById("ftab-list").getBoundingClientRect().left);
    if (p && p.il > p0.il + 2 && p.il < target - 2) seen.slide = true;
    const o = await page.evaluate(() => +getComputedStyle(document.getElementById("fpanel-list")).opacity);
    if (o > 0 && o < 0.98) seen.fade = true;
    await sleep(25);
  }
  const p1 = await pos(), tl = await page.evaluate(() => { const r = document.getElementById("ftab-list").getBoundingClientRect(); return { left: r.left, width: r.width }; });
  assert(seen.slide, "le trait n'a pas glissé d'un onglet à l'autre (aucune position intermédiaire)");
  assert(seen.fade, "le panneau n'est pas apparu en fondu (aucune opacité intermédiaire)");
  assert(Math.abs(p1.il - tl.left) < 1.5 && Math.abs(p1.iw - tl.width) < 1.5, "trait mal placé après le changement : " + JSON.stringify(p1) + " onglet Liste : " + JSON.stringify(tl));
  const col = await page.evaluate(() => getComputedStyle(document.getElementById("ftab-list")).color);
  for (let i = 0; i < 40 && (await pos()).bg !== col; i++) await sleep(100);   // (transition de couleur tardive dans le navigateur de test)
  p1.bg = (await pos()).bg;
  assert(p1.bg === col, "couleur du trait " + p1.bg + " différente de celle de l'onglet actif " + col);
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  // mouvements réduits : le trait saute directement, le panneau ne s'anime pas
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluate(() => document.getElementById("ftab-add").click()); await sleep(60);
  const r = await page.evaluate(() => ({ op: +getComputedStyle(document.getElementById("fpanel-add")).opacity, anim: getComputedStyle(document.getElementById("fpanel-add")).animationName }));
  assert(r.op === 1 && r.anim === "none", "mouvements réduits : panneau animé " + JSON.stringify(r));
});

/* ── IC1 : clic / toucher sur l'icône d'un titre de page = remonter comme un clic d'onglet ── */
const TITLES = { dashboard: "#page-dashboard h2.section-title", items: "#page-items h2.section-title", entrainements: "#page-entrainements h2.section-title", planning: "h2.planning-month-title" };
const scrollY = (page) => page.evaluate(() => Math.round(window.pageYOffset * 10) / 10);
async function settle(page) { let last = -1, n = 0; for (let i = 0; i < 60; i++) { const y = await scrollY(page); if (y === last) { if (++n >= 4) return y; } else { n = 0; last = y; } await sleep(100); } return last; }
for (const [label, vp] of [["PC", { width: 1366, height: 900 }], ["téléphone 390", PHONE]]) {
  await S("IC1-" + label.split(" ")[0], `icône des titres de page (${label}) : main au survol, clic/toucher plus bas = on remonte au point exact d'un clic d'onglet (±3 px), en haut rien ne bouge`, async () => {
    const { page } = await page_({ viewport: vp });
    await page.evaluate(() => { document.body.style.minHeight = "4500px"; });
    const touch = !!vp.isMobile;
    for (const pg of ["dashboard", "items", "entrainements", "planning"]) {
      await page.evaluate((p) => document.querySelector(`[data-page="${p}"]`).click(), pg); await sleep(500);
      // point de référence : celui d'un clic d'onglet
      await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" })); await sleep(300);
      await page.evaluate((p) => document.querySelector(`[data-page="${p}"]`).click(), pg);
      const tab = await settle(page);
      const sel = TITLES[pg];
      const pos = () => page.evaluate((q) => { const i = document.querySelector(q + " > i:first-child"); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, cursor: getComputedStyle(i).cursor }; }, sel);
      const act = async (p) => { if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
      // plus bas dans la page
      let p = null, off = 0;
      for (const o of [160, 110, 60, 20]) {   // première position où l'icône est visible ET au premier plan (l'en-tête fixe peut la recouvrir)
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), tab + o); await sleep(500);
        p = await pos();
        const top = await page.evaluate((x, y, q) => { const e = document.elementFromPoint(x, y); return !!(e && e.matches(q + " > i:first-child")); }, p.x, p.y, sel);
        if (p.y > 0 && p.y < vp.height && top) { off = o; break; }
        p = null;
      }
      assert(p, `[${pg}] icône jamais visible au premier plan pour le test`);
      assert(Math.abs((await scrollY(page)) - tab) > 4, `[${pg}] la position testée n'est pas plus bas que le point d'onglet`);
      if (!touch) assert(p.cursor === "pointer", `[${pg}] curseur de l'icône : ${p.cursor} (main attendue)`);
      await act(p);
      const after = await settle(page);
      assert(Math.abs(after - tab) <= 3, `[${pg}] après le clic sur l'icône : défilement ${after} au lieu de ${tab} (point d'un clic d'onglet)`);
      // en haut : rien ne bouge
      p = await pos(); await act(p); await sleep(900);
      const still = await scrollY(page);
      assert(Math.abs(still - tab) <= 3, `[${pg}] icône cliquée à la position d'onglet : la page a bougé (${tab} -> ${still})`);
    }
    if (!touch) {   // survol / appui : léger agrandissement, léger enfoncement
      await page.evaluate(() => document.querySelector('[data-page="dashboard"]').click()); await settle(page);
      const p = await page.evaluate(() => { const i = document.querySelector("#page-dashboard h2.section-title > i:first-child"); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const scale = () => page.evaluate(() => { const m = getComputedStyle(document.querySelector("#page-dashboard h2.section-title > i:first-child")).transform; return m === "none" ? 1 : +m.match(/matrix\(([^,]+)/)[1]; });
      const waitScale = async (f, what) => { const t0 = Date.now(); let v; while (Date.now() - t0 < 3000) { v = await scale(); if (f(v)) return v; await sleep(60); } throw new Error(what + " : échelle " + v); };
      await page.mouse.move(p.x, p.y); await waitScale((v) => Math.abs(v - 1.06) < 0.01, "survol (1,06 attendu)");
      await page.mouse.down(); await waitScale((v) => Math.abs(v - 0.94) < 0.01, "appui (0,94 attendu)"); await page.mouse.up();
    }
    // le « ? » d'aide à côté du titre ouvre l'aide SANS faire remonter la page
    await page.evaluate(() => document.querySelector('[data-page="dashboard"]').click()); const tab0 = await settle(page);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), tab0 + 60); await sleep(500);
    const hp = await page.evaluate(() => { const h = document.querySelector("#page-dashboard h2.section-title .help-icon"); const r = h.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: !!(e && (e === h || h.contains(e))) }; });
    assert(hp.top && hp.y > 0 && hp.y < vp.height, "« ? » non cliquable à la position testée : " + JSON.stringify(hp));
    if (touch) await page.touchscreen.tap(hp.x, hp.y); else await page.mouse.click(hp.x, hp.y);
    await sleep(900);
    const helpOpen = await page.evaluate(() => !!document.querySelector(".help-modal-overlay.active")), yh = await scrollY(page);
    assert(helpOpen, "le « ? » n'a pas ouvert l'aide");
    assert(Math.abs(yh - tab0) > 20, "le « ? » a fait remonter la page (" + yh + " ~ " + tab0 + ")");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
}

/* ── TR1b : changements d'onglet avec 100 lignes par page ── */
await S("TR1b", "changement d'onglet (100 lignes par page) : le titre reste à l'opacité 1 sur CHAQUE image ; « Mes cours » (lourde) ne montre aucune image décalée ; les autres pages glissent", async () => {
  const { u, page } = await page_({
    courses: 100,
    seed: async (u) => {
      for (let i = 2; i <= 12; i++) await adb.doc(`users/${u.uid}/subjects/s${i}`).set({ name: "Matiere" + i, color: "#7c6cf6", order: 10 + i, archivedAt: null, createdAt: new Date() });
      for (let b = 0; b < 100; b += 25) { const w = adb.batch(); for (let i = b; i < b + 25; i++) w.set(adb.doc(`users/${u.uid}/trainingItems/${9100 + i}`), { id: 9100 + i, titre: "QCM " + i, type: "colle", matiere: "s1", plat: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() }); await w.commit(); }
    },
  });
  await page.evaluate(() => window.p1StartTrainingsListener && window.p1StartTrainingsListener(window.currentUser.uid)); await sleep(2500);
  await page.evaluate(() => {
    window.__lt = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ["longtask"] }); } catch (e) {}
  });
  const T = { dashboard: "#page-dashboard h2.section-title", items: "#page-items h2.section-title", entrainements: "#page-entrainements h2.section-title", planning: "h2.planning-month-title" };
  async function go(pg) {
    await page.evaluate(() => { window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.evaluate((p, sel) => {
      window.__fr = []; window.__lt = []; window.__run = true; let prev = performance.now();
      const el = () => document.querySelector(sel);
      const op = (e) => { let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
      (function f(t) {
        if (!window.__run) return;
        const pgEl = document.getElementById("page-" + p), h = el();
        window.__fr.push({ gap: t - prev, op: h ? op(h) : null, tr: pgEl ? getComputedStyle(pgEl).transform : null, vis: !!(h && h.offsetParent) });
        prev = t; requestAnimationFrame(f);
      })(performance.now());
    }, pg, T[pg]);
    await page.evaluate((p) => document.querySelector(`[data-page="${p}"]`).click(), pg);
    await sleep(1100);
    return page.evaluate(() => { window.__run = false; const fr = window.__fr.filter((f) => f.vis); return { n: fr.length, minOp: Math.min(...fr.map((f) => f.op)), shifted: fr.filter((f) => f.tr && f.tr !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(f.tr)).length, maxGap: Math.round(Math.max(...window.__fr.map((f) => f.gap))), longtasks: window.__lt.slice() }; });
  }
  const res = {};
  for (const pg of ["items", "dashboard", "entrainements", "planning", "items"]) { const r = await go(pg); (res[pg] = res[pg] || []).push(r); console.log("   ", pg, JSON.stringify(r)); }
  for (const pg of Object.keys(res)) for (const r of res[pg]) assert(r.n > 0 && r.minOp >= 0.999, `${pg} : titre transparent sur une image (opacité min ${r.minOp})`);
  for (const r of res.items) assert(r.shifted === 0, `« Mes cours » : ${r.shifted} image(s) décalée(s) (aucune attendue)`);
  for (const pg of ["dashboard", "entrainements", "planning"]) assert(res[pg][0].shifted >= 1, `${pg} : le glissement a disparu (aucune image décalée)`);
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
});

await browser.close(); proxy.close(); server.close();
process.exit(report());
