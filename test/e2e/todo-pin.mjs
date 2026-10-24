/* Envoi vers la To-do : la punaise remplace la coche verte SANS « trou » (24/10/2026). Vraie page + émulateurs.
   Dans les 5 endroits (liste des cours, cours à revoir en priorité, entraînements, notes de cours, notes d'entraînement) :
   échantillonnage requestAnimationFrame pendant 1,8 s après le clic : à chaque image, soit le bouton (opacité ≥ 0,9), soit la punaise est visible.
   Lancer : node test/e2e/todo-pin.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
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
const PC = { width: 1366, height: 900 }, TEL = M(390, 844);

const clean = async (page) => {
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden"); }).catch(() => {});
};
async function open(vp, { theme = "light", reduce = false } = {}) {
  const u = await mkUser({ courses: 1 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  await adb.doc(`users/${u.uid}/courses/c1`).set({ priority: "urgent", tourConfidences: [2], tourDates: [new Date().toISOString()], tourDurations: ["1:00"], tourSupports: [null], tourCount: 1 }, { merge: true });
  await adb.doc(`users/${u.uid}/trainingItems/1001`).set({ id: 1001, titre: "QCM 1001", title: "QCM 1001", type: "colle", matiere: "s1", plat: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await clean(page);
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(400); }
  await waitFor(() => page.evaluate(() => (window.userData.trainings || []).length === 1), { timeout: 20000 });
  return { u, page };
}
const clickEl = async (page, sel, touch) => {
  let c = null;
  for (let k = 0; k < 4; k++) {
    await page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); if (r.top < 40 || r.bottom > innerHeight - 40 || r.left < 0 || r.right > innerWidth) e.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); }, sel);
    await sleep(350);
    c = await page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const h = document.elementFromPoint(x, y); return { x, y, hit: !!h && (e === h || e.contains(h) || h.contains(e)) }; }, sel);
    if (c.hit) break;
  }
  return c;
};

/* échantillonne le parent du bouton à chaque image ; renvoie les images « vides » */
const arm = (page, btnSel) => page.evaluate((sel) => {
  const btn = document.querySelector(sel); const parent = btn.parentNode;
  const R = window.__pin = { frames: 0, empty: [], t0: performance.now(), minOpacity: 1, done: false };
  const visible = (c) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const ok = () => [...parent.children].some((c) => {
    const op = parseFloat(getComputedStyle(c).opacity);
    if (c.matches("button") && visible(c) && op >= 0.5) return true;   // (0,65-0,75 = retour « appui » :active du bouton au toucher, pas un trou : le bug laissait 0)
    if (c.matches(".added-to-checklist-badge, .notes-todo-badge, .todo-pin-enter, .p1-pin-in") && visible(c) && op >= 0.3) { R.minOpacity = Math.min(R.minOpacity, op); return true; }
    return false;
  });
  (function tick() { R.frames++; if (!ok()) { R.empty.push(Math.round(performance.now() - R.t0)); R.detail = R.detail || [...parent.children].map((c) => { const r = c.getBoundingClientRect(); return c.tagName + "." + c.className + " op=" + getComputedStyle(c).opacity + " w=" + Math.round(r.width) + " disp=" + getComputedStyle(c).display; }); } if (performance.now() - R.t0 < 1800) requestAnimationFrame(tick); else R.done = true; })();
  window.__parentRef = parent;
}, btnSel);
const disarm = async (page) => { await waitFor(() => page.evaluate(() => window.__pin && window.__pin.done), { timeout: 5000, every: 100 }); return page.evaluate(() => window.__pin); };
const tasksFor = async (uid, key) => (await adb.collection(`users/${uid}/tasks`).get()).docs.map((d) => d.data()).filter((t) => JSON.stringify(t).indexOf(key) >= 0 && !t.archivedAt);

const PLACES = [
  { id: "liste", label: "liste des cours", page: "items", btn: ".send-to-checklist-btn", key: "c1", rerender: () => window.renderItemsTable(), badge: ".added-to-checklist-badge" },
  { id: "priorite", label: "cours à revoir en priorité", page: "stats", btn: ".priority-send-btn", key: "c1", rerender: () => window.renderPriorityItems && window.renderPriorityItems(), badge: ".added-to-checklist-badge" },
  { id: "entrainements", label: "liste des entraînements", page: "entrainements", btn: "#train-table-body .todo-btn", key: "1001", rerender: () => window.renderTrainTable(), badge: ".added-to-checklist-badge" },
  { id: "notes-cours", label: "notes d'un cours", page: "items", btn: "#notesTodoZone button.btn-todo", key: "c1", notes: "course" },
  { id: "notes-entr", label: "notes d'un entraînement", page: "entrainements", btn: "#trainNotesTodoZone button.btn-todo", key: "1001", notes: "train" },
];
const FORMATS = [["pc-light", PC, "light"], ["pc-dark", PC, "dark"], ["pc-pastel", PC, "pastel"], ["tel-light", TEL, "light"]];

try {
  for (const pl of PLACES) {
    for (const [fid, vp, th] of FORMATS) {
      await S(`PT1-${pl.id}-${fid}`, `${pl.label} (${fid}) : à chaque image le bouton OU la punaise est visible ; punaise finale à la même place qu'au rechargement ; tâche enregistrée une seule fois (double clic)`, async () => {
        const touch = !!vp.isMobile;
        const { u, page } = await open(vp, { theme: th });
        await page.evaluate((p) => document.querySelector(`[data-page="${p}"]`).click(), pl.page); await sleep(1500);
        if (pl.page === "items") { await page.evaluate(() => { try { window.renderItemsTable(); } catch (e) {} }); await sleep(500); }
        if (pl.notes === "course") { await page.evaluate(() => window.openNotesModal(1, "s1", "c1", "Cours1")); await sleep(1200); }
        if (pl.notes === "train") { await page.evaluate(() => window._openTrainNotes(1001)); await sleep(1200); }
        await page.waitForSelector(pl.btn, { timeout: 15000 });
        const c = await clickEl(page, pl.btn, touch);
        if (!touch) { await page.mouse.move(c.x, c.y); await sleep(500); }   // le bouton se déploie au survol (« → To-do »)
        await arm(page, pl.btn);
        if (touch) { await page.touchscreen.tap(c.x, c.y); await page.touchscreen.tap(c.x, c.y); } else { await page.mouse.click(c.x, c.y); await page.mouse.click(c.x, c.y); }   // double clic
        const R = await disarm(page);
        assert(R.frames > 12, "échantillonnage trop court : " + R.frames + " images");
        assert(R.empty.length === 0, `${R.empty.length} image(s) sans bouton ni punaise (à ${R.empty.slice(0, 6).join(", ")} ms sur ${R.frames}) : ${JSON.stringify(R.detail)}`);
        // la punaise finale est bien là
        const pin = await page.evaluate(() => { const p = window.__parentRef; const b = p.querySelector(".added-to-checklist-badge, .notes-todo-badge"); if (!b) return null; const r = b.getBoundingClientRect(); const row = p.closest("tr") || p; return { top: r.top - row.getBoundingClientRect().top, cls: b.className, anim: getComputedStyle(b).animationName, op: getComputedStyle(b).opacity }; });
        assert(pin, "la punaise finale est absente");
        assert(parseFloat(pin.op) >= 0.99, "punaise finale pas pleinement visible : " + pin.op);
        // même place qu'une punaise affichée au rechargement (tableaux)
        if (pl.rerender) {
          await page.evaluate(pl.rerender); await sleep(700);
          const again = await page.evaluate((bsel) => { const b = document.querySelector(bsel); if (!b) return null; const r = b.getBoundingClientRect(); const row = b.closest("tr") || b.parentNode; return { top: r.top - row.getBoundingClientRect().top }; }, pl.badge);
          assert(again, "punaise absente après redessin");
          assert(Math.abs(again.top - pin.top) <= 1, `punaise décalée : ${pin.top.toFixed(1)} px après l'animation, ${again.top.toFixed(1)} px au redessin`);
        }
        // une seule tâche
        const ok = await waitFor(async () => (await tasksFor(u.uid, pl.key)).length >= 1, { timeout: 15000 });
        assert(ok, "tâche absente du serveur");
        await sleep(1500);
        const n = (await tasksFor(u.uid, pl.key)).length; assert(n === 1, "tâches créées : " + n + " (double clic)");
        assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
      });
    }
  }
  await S("PT2-mouvement-reduit", "mouvement réduit : la punaise remplace le bouton sans animation (liste des cours)", async () => {
    const { page } = await open(PC, { reduce: true });
    await page.evaluate(() => document.querySelector('[data-page="items"]').click()); await sleep(1500);
    await page.evaluate(() => window.renderItemsTable()); await sleep(500);
    await page.waitForSelector(".send-to-checklist-btn", { timeout: 15000 });
    await arm(page, ".send-to-checklist-btn");
    const c = await clickEl(page, ".send-to-checklist-btn", false); await page.mouse.click(c.x, c.y);
    const R = await disarm(page);
    assert(R.empty.length === 0, "images vides : " + R.empty.length);
    const anim = await page.evaluate(() => { const b = window.__parentRef.querySelector(".added-to-checklist-badge"); return b ? getComputedStyle(b).animationName : null; });
    assert(anim === "none", "animation de la punaise malgré le mouvement réduit : " + anim);
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
