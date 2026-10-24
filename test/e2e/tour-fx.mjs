/* Tour enregistré / modifié / supprimé (mode détaillé) : animation SUR PLACE dans la case du tour. Vraie page + vrais émulateurs ;
   le chemin est le vrai (clic sur la case → fenêtre → confiance + durée → Enregistrer), l'état serveur est relu avec l'admin SDK.
   Un enregistreur injecté dans la page échantillonne le DOM toutes les 25 ms (calques, classes, textes, check plein écran).
   Lancer : node test/e2e/tour-fx.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const M = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const PC = { width: 1366, height: 900 };
let SHOT = null;   /* TOURFX_SHOTS=1 : capture à 650 ms (nom = SHOT) dans docs/captures-15-10/ */
const shot = async (page) => { if (process.env.TOURFX_SHOTS && SHOT) { const n = SHOT; SHOT = null; await sleep(650); await page.screenshot({ path: `docs/captures-15-10/${n}.png` }); } };
const todayIso = () => new Date().toISOString();

const clean = async (page) => {
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); }).catch(() => {});
};

/* Page « Mes cours » en mode détaillé. seed(uid) : écrit les tours avant l'ouverture. */
async function open(vp, { theme = "light", courses = 3, seed = null, j = false, reduce = false, mode = "classic" } = {}) {
  const u = await mkUser({ courses });
  if (seed) await seed(u.uid);
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport(vp);
  await sleep(vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await clean(page);
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(400); }
  await page.evaluate((uid, jOn, md) => {
    try { localStorage.setItem("toursViewMode__" + uid, md); if (jOn) localStorage.setItem("jMethodEnabled__" + uid, "1"); } catch (e) {}
    document.querySelector('[data-page="items"]').click();
  }, u.uid, j, mode);
  await sleep(1200);
  await page.evaluate(() => { if (typeof window.renderItemsTable === "function") window.renderItemsTable(); });
  await sleep(700);
  return { u, page };
}
const seedTours = (cid, conf, extra = {}) => async (uid) => {
  const n = conf.length;
  await adb.doc(`users/${uid}/courses/${cid}`).set({ tourConfidences: conf, tourDates: conf.map((c) => (c == null ? null : todayIso())), tourDurations: conf.map((c) => (c == null ? null : "1:00")), tourSupports: conf.map(() => null), tourCount: conf.filter((c) => c != null).length, ...extra }, { merge: true });
};

/* Enregistreur : échantillonne le DOM toutes les 25 ms depuis l'appel. */
const startRec = (page) => page.evaluate(() => {
  const R = window.__rec = { t0: performance.now(), checks: 0, waves: 0, rays: 0, confetti: 0, plus: null, pop: false, rowAdded: false, rowRemoved: false, emptied: false, ghost: null, minus: null, glow: null,
    layersMax: 0, firstAt: null, goneAt: null, modalOpenAtFirst: null, scrollAtFirst: null, zLayer: null, samples: 0 };
  const ov = document.getElementById("tour-success-overlay");
  if (ov) new MutationObserver((ms) => { for (const m of ms) if (!(m.oldValue || "").split(/\s+/).includes("show") && ov.classList.contains("show")) R.checks++; }).observe(ov, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  const vis = (row) => { const b = row.getBoundingClientRect(); let x0 = b.left, x1 = b.right, c = row.parentElement;
    while (c && c !== document.body && c !== document.documentElement) { const ox = getComputedStyle(c).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") { const cr = c.getBoundingClientRect(); x0 = Math.max(x0, cr.left + c.clientLeft); x1 = Math.min(x1, cr.left + c.clientLeft + c.clientWidth); } c = c.parentElement; }
    return { x0: Math.max(x0, 0), x1: Math.min(x1, document.documentElement.clientWidth), rowW: b.width }; };
  R.iv = setInterval(() => {
    R.samples++;
    const layers = document.querySelectorAll(".p1-fx-layer").length;
    R.layersMax = Math.max(R.layersMax, layers);
    if (layers > 0 && R.firstAt == null) {
      R.firstAt = performance.now() - R.t0; const m = document.getElementById("confidence-modal");
      R.modalOpenAtFirst = !!(m && m.classList.contains("active")); R.scrollAtFirst = window.scrollY; R.zLayer = getComputedStyle(document.querySelector(".p1-fx-layer")).zIndex;
    }
    if (layers === 0 && R.firstAt != null && R.goneAt == null) R.goneAt = performance.now() - R.t0;
    R.waves = Math.max(R.waves, document.querySelectorAll(".p1-tour-wave").length);
    R.rays = Math.max(R.rays, document.querySelectorAll(".p1-tour-ray").length);
    R.confetti = Math.max(R.confetti, document.querySelectorAll(".p1-confetti").length);
    const p = document.querySelector(".p1-tour-plus"); if (p) R.plus = p.textContent;
    const mn = document.querySelector(".p1-tour-minus"); if (mn) R.minus = mn.textContent;
    const g = document.querySelector(".p1-tour-ghost"); if (g && !R.ghost) R.ghost = { cls: g.className, text: g.textContent };
    if (document.querySelector(".tour-badge.p1-tour-pop")) R.pop = true;
    if (document.querySelector(".tour-badge.p1-tour-emptied")) R.emptied = true;
    const ra = document.querySelector("tr.p1-row-added"); if (ra) R.rowAdded = true;
    if (document.querySelector("tr.p1-row-removed")) R.rowRemoved = true;
    const gl = document.querySelector(".p1-row-glow");
    if (gl && ra) { const r = gl.getBoundingClientRect(), v = vis(ra); R.glow = { left: r.left, right: r.right, w: r.width, vx0: v.x0, vx1: v.x1, rowW: v.rowW, vw: document.documentElement.clientWidth }; }
  }, 25);
});
const stopRec = (page) => page.evaluate(() => { clearInterval(window.__rec.iv); return window.__rec; });

const srv = async (uid, cid) => ((await adb.doc(`users/${uid}/courses/${cid}`).get()).data() || {}).tourConfidences || [];
const badgeCenter = async (page, cid, tour) => { await page.evaluate((c, t) => document.querySelector(`.tour-badge[data-fc="${c}"][data-tour="${t}"]`).scrollIntoView({ behavior: "instant", block: "center" }), cid, tour); await sleep(600); return page.evaluate((c, t) => { const r = document.querySelector(`.tour-badge[data-fc="${c}"][data-tour="${t}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === document.querySelector(`.tour-badge[data-fc="${c}"][data-tour="${t}"]`) }; }, cid, tour); };
const clickAt = async (page, c, touch) => { if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y); };
const confBtn = (page, conf, touch) => page.evaluate((c) => { const b = document.querySelector(`.confidence-btn[data-confidence="${c}"]`); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, conf).then((c) => clickAt(page, c, touch));
const press = async (page, sel, touch) => { const c = await page.evaluate((q) => { const b = document.querySelector(q); let r = b.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) { b.scrollIntoView({ behavior: "instant", block: "center" }); r = b.getBoundingClientRect(); } return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await sleep(200); await clickAt(page, c, touch); };
const elCenter = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s); b.scrollIntoView({ behavior: "instant", block: "center" }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

/* Ouvre la fenêtre sur la case, choisit la confiance (+ durée 1 h), enregistre. Renvoie quand « Enregistrer » est cliqué. */
async function validate(page, cid, tour, conf, touch) {
  await clickAt(page, await badgeCenter(page, cid, tour), touch);
  await page.waitForFunction(() => document.querySelector(".confidence-btn"), { timeout: 10000 }); await sleep(450);
  await confBtn(page, conf, touch); await sleep(150);
  await page.evaluate(() => { const h = document.getElementById("tour-duration-hours"); if (h) { h.value = "1"; h.dispatchEvent(new Event("input", { bubbles: true })); } });
  await startRec(page);
  await press(page, "#btn-save-tour", touch);
  await shot(page);
}
async function remove(page, cid, tour, touch) {
  await clickAt(page, await badgeCenter(page, cid, tour), touch);
  await page.waitForFunction(() => document.querySelector(".confidence-btn"), { timeout: 10000 }); await sleep(450);
  await startRec(page);
  await press(page, "#btn-reset-tour", touch);
  await shot(page);
}

const FORMATS = [
  { id: "PCclair", label: "PC 1366 clair", vp: PC, theme: "light" },
  { id: "PCsombre", label: "PC 1366 sombre", vp: PC, theme: "dark" },
  { id: "PCpastel", label: "PC 1366 pastel", vp: PC, theme: "pastel" },
  { id: "iPad820", label: "iPad 820", vp: M(820, 1180), theme: "light" },
  { id: "tel390", label: "téléphone 390", vp: M(390, 844), theme: "light" },
];
const glowOk = (g) => g && g.w > 0 && g.left >= g.vx0 - 3 && g.right <= g.vx1 + 3 && g.right <= g.vw + 3;

try {
  /* ═════════ FX1 : nouveau tour ═════════ */
  for (const f of FORMATS) {
    await S("FX1-" + f.id, `nouveau tour (${f.label}) : case qui jaillit, 2 ondes, 10 rayons, « +1 tour », confettis, ligne verte + contour dans la partie visible, pas de grand check, calques retirés, serveur à jour`, async () => {
      const touch = !!f.vp.isMobile;
      const { u, page } = await open(f.vp, { theme: f.theme, seed: seedTours("c1", [3]) });
      SHOT = `tour-fx-nouveau-${f.id}`;
      await validate(page, "c1", 1, 4, touch);
      await sleep(3800);
      const R = await stopRec(page);
      if (!R.pop) { const dbg = await page.evaluate(() => ({ modal: document.getElementById("confidence-modal").className, err: [...document.querySelectorAll(".visible")].map((e) => e.id + ":" + e.textContent.slice(0, 40)), conf: document.querySelector(".confidence-btn.selected") && document.querySelector(".confidence-btn.selected").dataset.confidence, badge: document.querySelector('.tour-badge[data-fc="c1"][data-tour="1"]').className, mode: window.getToursViewMode && window.getToursViewMode() })); throw new Error("pas de p1-tour-pop " + JSON.stringify(dbg) + " serveur " + JSON.stringify(await srv(u.uid, "c1")) + " logs " + page.__logs.slice(-4).join(" | ")); }
      assert(R.pop, "pop");
      assert(R.layersMax >= 1 && R.waves === 2, `ondes : ${R.waves} (calques ${R.layersMax})`);
      assert(R.rays === 10, `rayons : ${R.rays}`);
      assert(R.plus === "+1 tour", `pastille : ${R.plus}`);
      assert(R.confetti >= 20, `confettis : ${R.confetti}`);
      assert(R.rowAdded, "la ligne n'a pas pris p1-row-added");
      assert(glowOk(R.glow), "contour hors de la partie visible de la ligne : " + JSON.stringify(R.glow));
      if (f.vp.width <= 820) assert(R.glow.rowW > R.glow.vw - 4 || R.glow.vx1 - R.glow.vx0 <= R.glow.vw, "mesure de la ligne incohérente " + JSON.stringify(R.glow));
      assert(R.checks === 0, `grand check joué ${R.checks} fois`);
      assert(R.modalOpenAtFirst === false, "l'animation part pendant que la fenêtre est encore ouverte");
      assert(R.zLayer === "30", "z-index du calque : " + R.zLayer);
      assert(R.goneAt != null && R.goneAt - R.firstAt >= 1800 && R.goneAt - R.firstAt <= 3300, `durée des calques : ${R.goneAt && Math.round(R.goneAt - R.firstAt)} ms`);
      const left = await page.evaluate(() => document.querySelectorAll(".p1-fx-layer,.p1-row-glow,.p1-confetti").length); assert(left === 0, "calques restants : " + left);
      const sv = await waitFor(async () => (await srv(u.uid, "c1"))[1] === 4); assert(sv, "serveur non à jour : " + JSON.stringify(await srv(u.uid, "c1")));
      assert(R.samples > 80, "enregistreur trop peu échantillonné : " + R.samples);
    });
  }

  /* ═════════ FX2 : modification ═════════ */
  await S("FX2-PCclair", "modification d'un tour existant : « Modifié », aucun confetti, ondes + rayons, pas de check, serveur à jour", async () => {
    const { u, page } = await open(PC, { seed: seedTours("c1", [3, 3]) });
    SHOT = "tour-fx-modification-PCclair";
    await validate(page, "c1", 1, 5, false);
    await sleep(3800);
    const R = await stopRec(page);
    assert(R.plus === "Modifié", "pastille : " + R.plus);
    assert(R.confetti === 0, "confettis : " + R.confetti);
    assert(R.waves === 2 && R.rays === 10 && R.pop && R.rowAdded, JSON.stringify({ w: R.waves, r: R.rays, pop: R.pop, row: R.rowAdded }));
    assert(R.checks === 0, "grand check joué " + R.checks);
    assert(await waitFor(async () => (await srv(u.uid, "c1"))[1] === 5), "serveur non à jour : " + JSON.stringify(await srv(u.uid, "c1")));
  });

  /* ═════════ FX3 : suppression ═════════ */
  for (const f of [FORMATS[0], FORMATS[1], FORMATS[4]]) {
    await S("FX3-" + f.id, `suppression (${f.label}) : fantôme à l'ancienne couleur, « Tour supprimé », case vide, ligne rouge, serveur vidé, pas de check`, async () => {
      const touch = !!f.vp.isMobile;
      const { u, page } = await open(f.vp, { theme: f.theme, seed: seedTours("c1", [3, 4]) });
      SHOT = `tour-fx-suppression-${f.id}`;
      await remove(page, "c1", 1, touch);
      await sleep(3200);
      const R = await stopRec(page);
      assert(R.ghost && /\bc4\b/.test(R.ghost.cls), "fantôme : " + JSON.stringify(R.ghost));
      assert(R.ghost.text.trim().length > 0, "numéro du tour absent du fantôme");
      assert(R.minus === "Tour supprimé", "pastille : " + R.minus);
      assert(R.emptied && R.rowRemoved, `case/ligne : ${R.emptied} ${R.rowRemoved}`);
      assert(R.checks === 0 && R.plus === null && R.confetti === 0, "animation d'ajout ou check joué");
      assert(R.modalOpenAtFirst === false, "l'animation part pendant que la fenêtre est encore ouverte");
      const b = await page.evaluate(() => { const e = document.querySelector('.tour-badge[data-fc="c1"][data-tour="1"]'); return { cls: e.className, text: e.textContent.trim() }; });
      assert(!/(^|\s)c\d+(\s|$)/.test(b.cls), "la case garde une couleur : " + b.cls);
      assert(b.text === R.ghost.text.trim(), `numéro du fantôme « ${R.ghost.text} » ≠ case « ${b.text} »`);
      assert(await waitFor(async () => (await srv(u.uid, "c1"))[1] == null), "serveur non vidé : " + JSON.stringify(await srv(u.uid, "c1")));
      const left = await page.evaluate(() => document.querySelectorAll(".p1-fx-layer").length); assert(left === 0, "calques restants : " + left);
    });
  }

  /* ═════════ FX4 : case hors écran ═════════ */
  await S("FX4-PCclair", "case hors écran : la page défile jusqu'à la case (centrée), puis l'animation joue", async () => {
    const { u, page } = await open(PC, { courses: 60, seed: seedTours("c40", [3]) });
    /* fenêtre ouverte depuis « Révisions J » (comme depuis la Todo) alors que la page « Mes cours » est en haut : la case du cours 40 est loin sous l'écran */
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await sleep(300);
    await page.evaluate(() => window.openTourModalFromJRevision("s1", "c40"));
    await page.waitForFunction(() => document.querySelector(".confidence-btn"), { timeout: 10000 }); await sleep(450);
    await confBtn(page, 4, false); await sleep(150);
    const away = await page.evaluate(() => { const r = document.querySelector('.tour-badge[data-fc="c40"][data-tour="1"]').getBoundingClientRect(); return r.top > innerHeight || r.bottom < 0; });
    assert(away, "la case est restée à l'écran (test mal posé)");
    await startRec(page);
    const t0 = Date.now();
    await clickAt(page, await (async () => { const r = await page.evaluate(() => { const b = document.getElementById("btn-save-tour").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); return r; })(), false);
    await sleep(4200);
    const R = await stopRec(page);
    const pos = await page.evaluate(() => { const r = document.querySelector('.tour-badge[data-fc="c40"][data-tour="1"]').getBoundingClientRect(); return { cy: r.top + r.height / 2, vh: innerHeight }; });
    assert(Math.abs(pos.cy - pos.vh / 2) <= 120, `case non centrée : y ${Math.round(pos.cy)} sur ${pos.vh}`);
    assert(R.pop && R.plus === "+1 tour" && R.confetti >= 20, `animation absente : ${JSON.stringify({ pop: R.pop, plus: R.plus, c: R.confetti })}`);
    assert(R.checks === 0, "grand check joué");
    assert(R.firstAt >= 450, `animation partie trop tôt (${Math.round(R.firstAt)} ms) : pas d'attente du défilement`);
    assert(await waitFor(async () => (await srv(u.uid, "c40"))[1] === 4), "serveur non à jour");
  });

  /* ═════════ FX5 : repli = grand check, une seule fois ═════════ */
  await S("FX5a", "validation depuis un point d'entrée autre que « Révisions J » (ex. Todo) alors que le tableau n'est pas affiché (autre onglet) : le grand check joue UNE fois, aucun calque", async () => {
    const { u, page } = await open(PC, { seed: seedTours("c1", [3]) });
    await page.evaluate(() => document.querySelector('[data-page="dashboard"]').click()); await sleep(900);
    await page.evaluate(() => { const el = document.createElement("span"); el.dataset.specialty = "s1"; el.dataset.fc = "c1"; el.dataset.tour = "1"; window.openConfidenceModal(el); }); await sleep(700);
    await confBtn(page, 4, false); await sleep(150);
    await startRec(page);
    await clickAt(page, await elCenter(page, "#btn-save-tour"), false);
    await sleep(3300);
    const R = await stopRec(page);
    assert(R.checks === 1, "grand check joué " + R.checks + " fois");
    assert(R.layersMax === 0 && !R.pop, "calque d'animation joué alors que la case n'est pas affichée");
    assert(await waitFor(async () => (await srv(u.uid, "c1"))[1] === 4), "serveur non à jour");
  });
  /* ═════════ FX8 : validation depuis les révisions J → la nouvelle animation joue sur la case, dans « Mes cours » (24/10/2026) ═════════ */
  for (const [id, vp, courses, cid, label] of [["pc", PC, 3, "c1", "PC"], ["tel", M(390, 844), 3, "c1", "téléphone 390"], ["page2", PC, 60, "c55", "PC, cours sur la page 2 du tableau"]]) {
    await S("FX8-" + id, `validation depuis « Révisions J » (${label}) : fenêtre J fermée, « Mes cours » ouvert sur la page du cours, animation sur la case (pop, 2 ondes, 10 rayons, « +1 tour », confettis), aucun grand check, serveur à jour`, async () => {
      const touch = !!vp.isMobile;
      const { u, page } = await open(vp, { courses, seed: seedTours(cid, [3]) });
      await page.evaluate(() => document.querySelector('[data-page="dashboard"]').click()); await sleep(900);
      await page.evaluate(() => window.openDayJModal && window.openDayJModal("2026-01-01")); await sleep(600);
      const jOpen = await page.evaluate(() => { const m = document.getElementById("day-j-modal"); return !!m && m.classList.contains("active"); });
      await page.evaluate((c) => window.openTourModalFromJRevision("s1", c), cid); await sleep(800);
      await confBtn(page, 4, touch); await sleep(150);
      await startRec(page);
      SHOT = `tour-fx-depuis-j-${id}`;
      await press(page, "#btn-save-tour", touch);
      await shot(page, 2800);
      await sleep(6200);
      const R = await stopRec(page);
      const st = await page.evaluate(() => ({ items: !!document.querySelector("#page-items.active"), jModal: !!document.querySelector("#day-j-modal.active") }));
      assert(st.items, "« Mes cours » n'est pas ouvert");
      assert(!st.jModal, "la fenêtre des J est restée ouverte (elle était ouverte au départ : " + jOpen + ")");
      assert(R.pop && R.plus === "+1 tour" && R.waves === 2 && R.rays === 10 && R.confetti >= 20, `animation absente : ${JSON.stringify({ pop: R.pop, plus: R.plus, w: R.waves, r: R.rays, c: R.confetti })}`);
      assert(R.checks === 0, "grand check joué " + R.checks + " fois");
      assert(await waitFor(async () => (await srv(u.uid, cid))[1] === 4), "serveur non à jour");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  await S("FX5b", "mode compact (fenêtre ouverte depuis « Révisions J ») : le grand check joue UNE fois, aucun calque", async () => {
    const { u, page } = await open(PC, { seed: seedTours("c1", [3]), mode: "compact" });
    await page.evaluate(() => window.openTourModalFromJRevision("s1", "c1")); await sleep(700);
    await confBtn(page, 4, false); await sleep(150);
    await startRec(page);
    await clickAt(page, await elCenter(page, "#btn-save-tour"), false);
    await sleep(3300);
    const R = await stopRec(page);
    assert(R.checks === 1, "grand check joué " + R.checks + " fois");
    assert(R.layersMax === 0 && !R.pop, "calque d'animation joué en mode compact");
    assert(await waitFor(async () => (await srv(u.uid, "c1"))[1] === 4), "serveur non à jour");
  });
  await S("FX5c", "écriture refusée : ni animation, ni grand check", async () => {
    const { u, page } = await open(PC, { seed: seedTours("c1", [3]) });
    await clickAt(page, await badgeCenter(page, "c1", 1), false);
    await page.waitForFunction(() => document.querySelector(".confidence-btn"), { timeout: 10000 }); await sleep(450);
    await confBtn(page, 4, false); await sleep(150);
    /* refus réel : le cours a été « restauré » après le chargement de la page → p1WriteTourSlot refuse d'écrire */
    await adb.doc(`users/${u.uid}/courses/c1`).set({ restoredAt: new Date(Date.now() + 3600e3) }, { merge: true }); await sleep(800);
    await startRec(page);
    await clickAt(page, await elCenter(page, "#btn-save-tour"), false);
    await sleep(3000);
    const R = await stopRec(page);
        assert(R.checks === 0 && R.layersMax === 0 && !R.pop, `animation malgré l'échec : ${JSON.stringify({ c: R.checks, l: R.layersMax, pop: R.pop })}`);
    assert((await srv(u.uid, "c1"))[1] == null, "le serveur a reçu une écriture");
    assert(page.__logs.some((l) => /restaur/.test(l)), "le refus réel (cours restauré) n'a pas été déclenché");
  });
  await S("FX5d", "suppression refusée : aucune animation", async () => {
    const { u, page } = await open(PC, { seed: seedTours("c1", [3, 4]) });
    await clickAt(page, await badgeCenter(page, "c1", 1), false);
    await page.waitForFunction(() => document.querySelector(".confidence-btn"), { timeout: 10000 }); await sleep(450);
    /* refus réel : le cours a été « restauré » après le chargement de la page → p1WriteTourSlot refuse d'écrire */
    await adb.doc(`users/${u.uid}/courses/c1`).set({ restoredAt: new Date(Date.now() + 3600e3) }, { merge: true }); await sleep(800);
    await startRec(page);
    await clickAt(page, await elCenter(page, "#btn-reset-tour"), false);
    await sleep(2600);
    const R = await stopRec(page);
        assert(R.layersMax === 0 && !R.rowRemoved && R.checks === 0, "animation malgré l'échec");
  });

  /* ═════════ FX6 : Méthode des J ═════════ */
  for (const [id, btn, label] of [["FX6a", "#jFirstTourConfirmBtn", "Planifier avec ce rythme"], ["FX6b", ".j-first-tour-actions .j-due-btn-postpone", "Pas cette fois"]]) {
    await S(id, `Méthode des J (1ᵉʳ tour, « ${label} ») : rien pendant la fenêtre J, l'animation à sa fermeture, pas de check`, async () => {
      const { u, page } = await open(PC, { courses: 3, j: true });
      await validate(page, "c1", 0, 4, false);
      await page.waitForSelector("#j-first-tour-modal.active", { timeout: 15000 });
      await sleep(2200);   // la fenêtre J reste ouverte : rien ne doit jouer
      const mid = await page.evaluate(() => ({ layers: document.querySelectorAll(".p1-fx-layer").length, pop: !!document.querySelector(".tour-badge.p1-tour-pop"), check: document.getElementById("tour-success-overlay").classList.contains("show") }));
      assert(mid.layers === 0 && !mid.pop && !mid.check, "animation pendant la fenêtre J : " + JSON.stringify(mid));
      await clickAt(page, await elCenter(page, btn), false);
      await sleep(3800);
      const R = await stopRec(page);
      assert(R.pop && R.plus === "+1 tour" && R.waves === 2 && R.confetti >= 20, `animation absente après la fenêtre J : ${JSON.stringify({ pop: R.pop, plus: R.plus, w: R.waves, c: R.confetti })}`);
      assert(R.checks === 0, "grand check joué " + R.checks);
      assert(await waitFor(async () => (await srv(u.uid, "c1"))[0] === 4), "serveur non à jour");
    });
  }

  /* ═════════ FX7 : mouvement réduit ═════════ */
  await S("FX7", "prefers-reduced-motion : aucun calque, la ligne se teinte quand même, pas de check", async () => {
    const { u, page } = await open(PC, { seed: seedTours("c1", [3]), reduce: true });
    const rm = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches); assert(rm, "mouvement réduit non émulé");
    await validate(page, "c1", 1, 4, false);
    await sleep(2200);
    const R = await stopRec(page);
    assert(R.rowAdded, "la ligne ne se teinte pas");
    assert(R.layersMax === 0 && R.waves === 0 && R.confetti === 0, `calques créés : ${R.layersMax}`);
    assert(R.checks === 0, "grand check joué");
    assert(await waitFor(async () => (await srv(u.uid, "c1"))[1] === 4), "serveur non à jour");
  });

  /* ═════════ ERR : aucune erreur JS ═════════ */
  await S("ERR1", "aucune erreur JS sur une validation, une modification et une suppression", async () => {
    const { u, page } = await open(PC, { seed: seedTours("c1", [3]) });
    await validate(page, "c1", 1, 4, false); await sleep(3200); await stopRec(page);
    await validate(page, "c1", 1, 2, false); await sleep(3200); await stopRec(page);
    await remove(page, "c1", 1, false); await sleep(3000); await stopRec(page);
    const errs = page.__errors.filter((e) => !/ResizeObserver/.test(e)); assert(errs.length === 0, "erreurs JS : " + errs.join(" | "));
    assert(await waitFor(async () => (await srv(u.uid, "c1"))[1] == null), "serveur non vidé");
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
