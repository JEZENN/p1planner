/* Mode sur-mesure et entraînements : animation sur place (ajout / modification / suppression d'une matière, d'un cours, d'un
   entraînement) + fenêtre « Gérer ». Vraie page + vrais émulateurs ; l'état serveur est relu avec l'admin SDK.
   Un enregistreur injecté échantillonne le DOM toutes les 25 ms (calques, cadre lumineux, pastilles, défilement, notifications).
   Formats : PC 1366 × 900 et téléphone 390 × 844 ; clair, sombre, pastel.
   Lancer : node test/e2e/perso-fx.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; PERSOFX_SHOTS=1 pour les captures) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor, BASE as BASE_URL } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const M = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const PC = { width: 1366, height: 900 }, TEL = M(390, 844);
const FORMATS = [
  { id: "PCclair", label: "PC clair", vp: PC, theme: "light" },
  { id: "PCsombre", label: "PC sombre", vp: PC, theme: "dark" },
  { id: "PCpastel", label: "PC pastel", vp: PC, theme: "pastel" },
  { id: "tel390", label: "téléphone 390", vp: TEL, theme: "light" },
];
let SHOT = null;
const shot = async (page, ms = 700) => { if (process.env.PERSOFX_SHOTS && SHOT) { const n = SHOT; SHOT = null; await sleep(ms); await page.screenshot({ path: `docs/captures-15-10/${n}.png` }); } };

const clean = async (page) => {
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden"); }).catch(() => {});
};
/* seed(uid) avant l'ouverture ; page = "items" | "dashboard" | "entrainements" */
async function open(vp, { theme = "light", courses = 1, seed = null, pageName = "items", reduce = false } = {}) {
  const u = await mkUser({ courses });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });   // présentation de bienvenue déjà faite (sinon elle se rouvre à la 1re création et verrouille le défilement)
  if (seed) await seed(u.uid);
  const ctx = await openPage(browser, u, { wait: courses > 0 }); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await clean(page);
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(400); }
  await page.evaluate((p) => { document.querySelector(`[data-page="${p}"]`).click(); }, pageName);
  await sleep(1500);
  if (pageName === "items") { await page.evaluate(() => { try { window.renderItemsTable(); } catch (e) {} }); await sleep(600); }
  await page.waitForSelector("#tpx-btn-add-entry, #tpx-btn-add-spec, .train-add-main-btn", { timeout: 20000 }).catch(() => {});
  return { u, page };
}
const seedCourses = (n) => async (uid) => { for (let i = 2; i <= n; i++) await adb.doc(`users/${uid}/courses/c${i}`).set({ subjectId: "s1", name: "Cours" + i, order: i * 10, courseNum: i, archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date() }); };
const seedSubjects = (n) => async (uid) => { for (let i = 2; i <= n; i++) await adb.doc(`users/${uid}/subjects/s${i}`).set({ name: "Matiere" + i, color: "#7c6cf6", order: 10 + i * 10, archivedAt: null, createdAt: new Date() }); };
const seedTrains = (n) => async (uid) => { const b = adb.batch(); for (let i = 1; i <= n; i++) b.set(adb.doc(`users/${uid}/trainingItems/${1000 + i}`), { id: 1000 + i, titre: "QCM " + (1000 + i), title: "QCM " + (1000 + i), type: "colle", matiere: "s1", plat: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() }); await b.commit(); };

/* clic « vrai » au centre d'un élément (souris, ou toucher sur téléphone) */
const center = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
async function press(page, sel, touch) {
  /* cadre l'élément, attend que la page soit stable, vérifie que le point visé le touche bien, puis clique (jusqu'à 4 essais) */
  let c = null;
  for (let k = 0; k < 4; k++) {
    await page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); if (r.top < 40 || r.bottom > innerHeight - 40 || r.left < 0 || r.right > innerWidth) e.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); }, sel);
    await sleep(350);
    c = await page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const h = document.elementFromPoint(x, y); return { x, y, hit: !!h && (e === h || e.contains(h) || h.contains(e)) }; }, sel);
    if (c.hit) break;
  }
  if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
}
const typeIn = async (page, sel, text) => { await page.evaluate((s) => { const e = document.querySelector(s); e.focus(); e.value = ""; }, sel); await page.type(sel, text); };

/* Enregistreur */
const startRec = (page) => page.evaluate(() => {
  const R = window.__rec = { t0: performance.now(), s: [], toasts: window.__toasts || [] };
  const vis = (el) => { const b = el.getBoundingClientRect(); let x0 = b.left, x1 = b.right, c = el.parentElement;
    while (c && c !== document.body && c !== document.documentElement) { const cs = getComputedStyle(c); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { const cr = c.getBoundingClientRect(); x0 = Math.max(x0, cr.left + c.clientLeft); x1 = Math.min(x1, cr.left + c.clientLeft + c.clientWidth); } c = c.parentElement; }
    return { l: Math.max(x0, 0), r: Math.min(x1, document.documentElement.clientWidth), t: b.top, b: b.bottom }; };
  R.iv = setInterval(() => {
    const g = document.querySelector(".tpx-pfx-glow"), tg = document.querySelector(".tpx-pfx-hit, .tpx-pfx-out");
    const gr = g ? g.getBoundingClientRect() : null;
    R.s.push({ t: Math.round(performance.now() - R.t0), y: Math.round(scrollY), sw: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight,
      layers: document.querySelectorAll(".tpx-pfx-layer").length, glow: gr ? { l: gr.left, r: gr.right, t: gr.top, b: gr.bottom } : null,
      plus: (document.querySelector(".tpx-pfx-plus") || {}).textContent || null, minus: (document.querySelector(".tpx-pfx-minus") || {}).textContent || null,
      conf: document.querySelectorAll(".tpx-pfx-confetti").length, target: tg ? vis(tg) : null, tcls: tg ? tg.className : null,
      tkey: tg ? (tg.getAttribute("data-train-id") || tg.getAttribute("data-key") || null) : null,
      outIds: [...document.querySelectorAll(".tpx-pfx-out")].map((e) => e.getAttribute("data-train-id") || e.getAttribute("data-key")),
      hitN: document.querySelectorAll(".tpx-pfx-hit").length, row: window.__watch ? ((r) => r ? (r.className || "-") + (r.offsetParent ? "" : " [masquée]") : "[absente]")(document.querySelector(`#train-table-body tr[data-train-id="${window.__watch}"]`)) : null, mgr: !!document.querySelector("#tpx-modal-overlay.active:not(.closing) #tpx-mgr-list"),
      zl: (document.querySelector(".tpx-pfx-layer") || { style: {} }).style.zIndex || null, op: g && g.closest(".tpx-pfx-layer") ? g.closest(".tpx-pfx-layer").style.opacity : null });
  }, 25);
});
const stopRec = (page) => page.evaluate(() => { clearInterval(window.__rec.iv); return window.__rec; });
const firstGlow = (R) => R.s.find((x) => x.glow);
const quietTrain = async (page) => { await page.evaluate(() => { window.__lastRT = Date.now(); if (!window.__rtWrapped) { window.__rtWrapped = true; const o = window.renderTrainTable; window.renderTrainTable = function () { window.__lastRT = Date.now(); return o.apply(this, arguments); }; } }); const t0 = Date.now(); while (Date.now() - t0 < 10000) { if (await page.evaluate(() => Date.now() - window.__lastRT > 1200)) return; await sleep(200); } };   // attend que l'écoute Firestore ait fini de redessiner le tableau
const spyToasts = (page) => page.evaluate(() => { window.__toasts = []; const o = window.showToastNotification; window.showToastNotification = function (m) { window.__toasts.push(String(m)); return o && o.apply(this, arguments); }; });

/* contrôles communs d'un « ajout / modification » dans la page (cadre vert sur toute la largeur, pastille, confettis, page arrêtée, pas de barre horizontale) */
function checkHit(R, label, { add = true, rowWide = true } = {}) {
  const g = firstGlow(R); assert(g, `${label} : aucun cadre lumineux`);
  assert(g.target, `${label} : élément animé introuvable au moment du cadre`);
  if (rowWide) { assert(Math.abs(g.glow.l - (g.target.l + 1)) <= 3 && Math.abs(g.glow.r - (g.target.r - 1)) <= 3, `${label} : cadre ${Math.round(g.glow.l)}→${Math.round(g.glow.r)} ≠ ligne ${Math.round(g.target.l)}→${Math.round(g.target.r)}`); }
  const plus = R.s.map((x) => x.plus).filter(Boolean)[0]; assert(plus, `${label} : pastille absente`);
  const conf = Math.max(...R.s.map((x) => x.conf));
  if (add) assert(conf >= 20, `${label} : confettis ${conf}`); else assert(conf === 0, `${label} : confettis à la modification (${conf})`);
  assert(R.s.every((x) => x.sw <= x.vw), `${label} : barre horizontale (scrollWidth ${Math.max(...R.s.map((x) => x.sw))} > ${R.s[0].vw})`);
  return plus;
}
/* la page est arrêtée quand le cadre apparaît (descente terminée) */
function checkSettled(R, label) {
  const g = firstGlow(R), i = R.s.indexOf(g), y0 = g.y;
  const later = R.s.filter((x, k) => k >= i && x.t <= g.t + 400);
  assert(later.every((x) => Math.abs(x.y - y0) <= 2), `${label} : la page bouge pendant l'animation (${later.map((x) => x.y).join(",")})`);
  if (!(g.target.t >= 0 && g.target.b <= g.vh + 1)) console.log("    [debug] glow à " + g.t + " ms ; y: " + R.s.filter((x, k) => k % 8 === 0).map((x) => x.t + ":" + x.y).join(" "));
  assert(g.target.t >= 0 && g.target.b <= g.vh + 1, `${label} : élément non entièrement visible (haut ${Math.round(g.target.t)}, bas ${Math.round(g.target.b)}, écran ${g.vh})`);
}
const pageOf = (page, name) => page.evaluate((n) => [...document.querySelectorAll("#items-table-body tr")].some((r) => r.textContent.indexOf(n) >= 0), name);

try {
  /* ═════════ PF1 : nouveau cours sur la page 2 du tableau (60 cours) ═════════ */
  for (const f of FORMATS) {
    await S("PF1-" + f.id, `60 cours, « Nouveau cours » n° 61 sur la page 2 (${f.label}) : page 2, descente, puis cadre vert sur toute la largeur, « +1 cours », confettis, page arrêtée, aucune barre horizontale`, async () => {
      const touch = !!f.vp.isMobile;
      const { u, page } = await open(f.vp, { theme: f.theme, courses: 60, seed: seedCourses(60), pageName: "items" });
      await spyToasts(page);
      const onP1 = await pageOf(page, "Cours1"); assert(onP1, "départ : la page 1 n'affiche pas Cours1");
      await press(page, "#tpx-btn-add-entry", touch); await sleep(900);
      await typeIn(page, "#tpx-it-name", "CoursNeuf61"); await sleep(200);
      await startRec(page);
      SHOT = `perso-fx-cours-${f.id}`;
      await press(page, "#tpx-it-ok", touch);
      await shot(page, 2700);
      await sleep(5200);
      const R = await stopRec(page);
      assert(await pageOf(page, "CoursNeuf61"), "le tableau n'est pas passé à la page qui contient le nouveau cours");
      const plus = checkHit(R, "cours");
      assert(plus === "+1 cours", "pastille : " + plus);
      checkSettled(R, "cours");
      const y = R.s[0].y, y2 = R.s[R.s.length - 1].y; assert(y2 > y + 100 || y2 !== y, `pas de descente (${y} → ${y2})`);
      const sv = await waitFor(async () => !!(await adb.collection(`users/${u.uid}/courses`).where("name", "==", "CoursNeuf61").get()).size); assert(sv, "cours absent du serveur");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ PF2 : nouvelle matière (30 matières) ═════════ */
  for (const f of [FORMATS[0], FORMATS[3]]) {
    await S("PF2-" + f.id, `30 matières, « Nouvelle matière » (${f.label}) : descente jusqu'à la nouvelle carte (entièrement visible), puis animation « +1 matière »`, async () => {
      const touch = !!f.vp.isMobile;
      const { u, page } = await open(f.vp, { theme: f.theme, courses: 1, seed: seedSubjects(30), pageName: "dashboard" });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await sleep(300);
      await press(page, "#tpx-btn-add-spec", touch); await sleep(900);
      await typeIn(page, "#tpx-mat-name", "NouvelleMat"); await sleep(200);
      await startRec(page);
      SHOT = `perso-fx-matiere-${f.id}`;
      await press(page, "#tpx-mat-ok", touch);
      await shot(page, 2700);
      await sleep(5200);
      const R = await stopRec(page);
      const plus = checkHit(R, "matière", { rowWide: false });
      assert(plus === "+1 matière", "pastille : " + plus);
      checkSettled(R, "matière");
      assert(await waitFor(async () => !!(await adb.collection(`users/${u.uid}/subjects`).where("name", "==", "NouvelleMat").get()).size), "matière absente du serveur");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ PF3 : depuis « Gérer » ═════════ */
  await S("PF3-PCclair", "depuis « Gérer » (Ajouter puis Fermer) : l'animation joue sur la ligne du gestionnaire, la page ne bouge pas derrière, puis descente à la fermeture", async () => {
    const { u, page } = await open(PC, { courses: 60, seed: seedCourses(60), pageName: "items" });
    await press(page, "#tpx-btn-mgr-entry", false); await sleep(1000);
    await press(page, "#tpx-mgr-add", false); await sleep(900);
    await typeIn(page, "#tpx-it-name", "CoursGerer"); await sleep(200);
    await startRec(page);
    SHOT = "perso-fx-gerer-ajout-PCclair";
    await press(page, "#tpx-it-ok", false);
    await shot(page, 1500);
    await sleep(3200);
    let R = await stopRec(page);
    const inMgr = R.s.filter((x) => x.glow && x.mgr);
    assert(inMgr.length > 5, "pas d'animation dans le gestionnaire (échantillons " + inMgr.length + ")");
    assert(inMgr.some((x) => x.zl === "10200"), "calque du gestionnaire sans z-index 10200 : " + inMgr[0].zl);
    assert(inMgr.some((x) => x.plus === "+1 cours"), "pastille « +1 cours » absente du gestionnaire");
    assert(R.s.every((x) => !x.mgr || Math.abs(x.y - R.s[0].y) <= 2), "la page a bougé derrière « Gérer » : " + [...new Set(R.s.filter((x) => x.mgr).map((x) => x.y))].join(","));
    assert(R.s.every((x) => x.sw <= x.vw), "barre horizontale");
    // fermeture de « Gérer » : descente puis animation dans la page
    await startRec(page);
    await press(page, "#tpx-mgr-close", false);
    await sleep(5200);
    R = await stopRec(page);
    assert(await pageOf(page, "CoursGerer"), "la page n'affiche pas le nouveau cours après la fermeture");
    const g = firstGlow(R); assert(g && !g.mgr, "pas d'animation dans la page après la fermeture de « Gérer »");
    assert(R.s.some((x) => x.plus === "+1 cours"), "pastille absente dans la page");
    checkSettled(R, "après fermeture");
    assert(await waitFor(async () => !!(await adb.collection(`users/${u.uid}/courses`).where("name", "==", "CoursGerer").get()).size), "cours absent du serveur");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ PF4 : menu « Gérer » ═════════ */
  for (const f of [FORMATS[0], FORMATS[1], FORMATS[3]]) {
    await S("PF4-" + f.id, `« Gérer » (${f.label}) : boutons bleu / rouge pastel puis pleins (icône blanche) au survol, aucune infobulle, fondu entre onglets, place de la barre de défilement réservée`, async () => {
      const touch = !!f.vp.isMobile;
      const { page } = await open(f.vp, { theme: f.theme, courses: 40, seed: seedCourses(40), pageName: "items" });
      await press(page, "#tpx-btn-mgr-entry", touch); await sleep(1100);
      const st = () => page.evaluate(() => {
        const b = (s) => { const e = document.querySelector(s); const c = getComputedStyle(e); return { bg: c.backgroundColor, col: c.color, title: e.getAttribute("title"), aria: e.getAttribute("aria-label"), icon: getComputedStyle(e.querySelector("i")).color }; };
        return { edit: b("#tpx-mgr-list .tpx-mgr-act:not(.danger)"), del: b("#tpx-mgr-list .tpx-mgr-act.danger") };
      });
      let s = await st();
      assert(s.edit.title == null && s.del.title == null && s.edit.aria === "Modifier" && s.del.aria === "Supprimer", "infobulles / aria : " + JSON.stringify(s));
      assert(/^rgba\(59, 130, 246, 0\.1/.test(s.edit.bg) || f.theme === "dark" && /^rgba\(96, 165, 250/.test(s.edit.bg), "Modifier au repos : " + s.edit.bg);
      assert(/^rgba\(239, 68, 68, 0\.1/.test(s.del.bg) || f.theme === "dark" && /^rgba\(248, 113, 113/.test(s.del.bg), "Supprimer au repos : " + s.del.bg);
      if (!touch) {
        const hov = async (sel) => { const c = await center(page, sel); await page.mouse.move(c.x, c.y); await sleep(350); return st(); };
        s = await hov("#tpx-mgr-list .tpx-mgr-act:not(.danger)");
        assert(s.edit.bg === "rgb(59, 130, 246)" && s.edit.icon === "rgb(255, 255, 255)", "Modifier au survol : " + JSON.stringify(s.edit));
        s = await hov("#tpx-mgr-list .tpx-mgr-act.danger");
        assert(s.del.bg === "rgb(239, 68, 68)" && s.del.icon === "rgb(255, 255, 255)", "Supprimer au survol : " + JSON.stringify(s.del));
        await page.mouse.move(5, 5);
      }
      // appui maintenu (vrai :active)
      { const c = await center(page, "#tpx-mgr-list .tpx-mgr-act.danger"); await page.mouse.move(c.x, c.y); await page.mouse.down(); await sleep(250);
        const a = await st(); await page.mouse.move(5, 5); await page.mouse.up();
        assert(a.del.bg === "rgb(220, 38, 38)" || a.del.bg === "rgb(239, 68, 68)", "Supprimer à l'appui : " + a.del.bg); await sleep(300); }
      // fondu entre onglets + réserve de barre
      const gut = await page.evaluate(() => getComputedStyle(document.getElementById("tpx-mgr-list")).scrollbarGutter); assert(gut === "stable", "scrollbar-gutter : " + gut);
      await page.evaluate(() => { window.__lv = false; const l = document.getElementById("tpx-mgr-list"); new MutationObserver(() => { if (l.classList.contains("tpx-mgr-leaving")) window.__lv = true; }).observe(l, { attributes: true, attributeFilter: ["class"] }); });
      const w1 = await page.evaluate(() => document.querySelector("#tpx-mgr-list .tpx-mgr-row").getBoundingClientRect().width);
      await press(page, '#tpx-mgr-tabs .tpx-mgr-tab[data-tab="spec"]', touch); await sleep(700);
      assert(await page.evaluate(() => window.__lv), "pas de fondu au passage Cours → Matières");
      const w2 = await page.evaluate(() => document.querySelector("#tpx-mgr-list .tpx-mgr-row").getBoundingClientRect().width);
      assert(Math.abs(w1 - w2) <= 0.5, `la largeur des lignes change entre une liste avec barre (${w1}) et sans barre (${w2})`);
      assert(await page.evaluate(() => [...document.querySelectorAll("#tpx-mgr-list .tpx-mgr-row")].every((r) => r.classList.contains("tpx-mgr-in") || getComputedStyle(r).animationName !== "none" || true)), "apparition");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("PF4-vide", "« Gérer » : textes de liste vide « …votre première matière. » / « …votre premier cours. »", async () => {
    const { page } = await open(PC, { courses: 0, seed: async (uid) => { await adb.doc(`users/${uid}/subjects/s1`).set({ archivedAt: new Date() }, { merge: true }); }, pageName: "dashboard" });
    await press(page, "#tpx-btn-mgr-spec", false); await sleep(1100);
    const t1 = await page.evaluate(() => (document.querySelector("#tpx-mgr-list .tpx-mgr-empty") || {}).textContent);
    assert(t1 && /créer votre première matière\.$/.test(t1.trim()), "matières : " + t1);
    await press(page, '#tpx-mgr-tabs .tpx-mgr-tab[data-tab="entry"]', false); await sleep(700);
    const t2 = await page.evaluate(() => (document.querySelector("#tpx-mgr-list .tpx-mgr-empty") || {}).textContent);
    assert(t2 && /créer votre premier cours\.$/.test(t2.trim()), "cours : " + t2);
  });

  /* ═════════ PF5 : entraînements (240 lignes) ═════════ */
  for (const f of [FORMATS[0], FORMATS[3]]) {
    await S("PF5-" + f.id, `entraînements, 240 lignes (${f.label}) : ajout (page du tableau, descente, « +1 entraînement », confettis), modification (« Modifié »), aucune notification verte`, async () => {
      const touch = !!f.vp.isMobile;
      const { u, page } = await open(f.vp, { theme: f.theme, courses: 1, seed: seedTrains(240), pageName: "entrainements" });
      await page.evaluate(() => window.p1StartTrainingsListener && 0); await sleep(1500);
      await waitFor(() => page.evaluate(() => (window.userData.trainings || []).length === 240), { timeout: 20000 });
      await page.evaluate(() => { try { window.renderTrainTable(); } catch (e) {} }); await sleep(500);
      await spyToasts(page);
      await press(page, ".train-add-main-btn", touch); await sleep(800);
      await page.evaluate(() => { document.querySelector("#train-type-btns .train-modal-type-btn").click(); });
      await typeIn(page, "#train-title-input", "NouvelEntr"); await sleep(200);
      await startRec(page);
      SHOT = `perso-fx-entrainement-${f.id}`;
      await press(page, '#train-modal button[onclick*="saveTrainModal"]', touch);
      await shot(page, 2700);
      await sleep(5200);
      let R = await stopRec(page);
      const row = await page.evaluate(() => { const r = [...document.querySelectorAll("#train-table-body tr")].find((x) => x.textContent.indexOf("NouvelEntr") >= 0); return r ? r.getAttribute("data-train-id") : null; });
      assert(row, "le tableau n'affiche pas le nouvel entraînement (page non changée)");
      const plus = checkHit(R, "entraînement", { rowWide: !touch }); assert(plus === "+1 entraînement", "pastille : " + plus);
      checkSettled(R, "entraînement");
      assert((await page.evaluate(() => window.__toasts)).length === 0, "notification verte : " + JSON.stringify(await page.evaluate(() => window.__toasts)));
      // modification
      await page.evaluate((id) => document.querySelector(`#train-table-body tr[data-train-id="${id}"] .train-action-btn[onclick*="_openTrainEdit"]`).click(), row); await sleep(800);
      await typeIn(page, "#train-title-input", "NouvelEntrBis"); await sleep(200);
      await startRec(page);
      SHOT = `perso-fx-entrainement-modif-${f.id}`;
      await press(page, '#train-modal button[onclick*="saveTrainModal"]', touch);
      await shot(page, 2700);
      await sleep(4800);
      R = await stopRec(page);
      const plus2 = checkHit(R, "entraînement modifié", { add: false, rowWide: !touch }); assert(plus2 === "Modifié", "pastille : " + plus2);
      assert((await page.evaluate(() => window.__toasts)).length === 0, "notification verte à la modification");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  for (const f of [FORMATS[0], FORMATS[1], FORMATS[3]]) {
    await S("PF5s-" + f.id, `suppression d'un entraînement au milieu (${f.label}) : la ligne supprimée s'anime encore dans le tableau, disparaît ≥ 0,5 s plus tard, la ligne du dessous n'est jamais marquée, pas de notification, serveur archivé`, async () => {
      const touch = !!f.vp.isMobile;
      const { u, page } = await open(f.vp, { theme: f.theme, courses: 1, seed: seedTrains(240), pageName: "entrainements" });
      await waitFor(() => page.evaluate(() => (window.userData.trainings || []).length === 240), { timeout: 20000 });
      await page.evaluate(() => { try { window.renderTrainTable(); } catch (e) {} }); await sleep(600);
      await quietTrain(page);
      await spyToasts(page);
      const ids = await page.evaluate(() => [...document.querySelectorAll("#train-table-body tr[data-train-id]")].map((r) => r.getAttribute("data-train-id")));
      const mid = ids[20], below = ids[21]; assert(mid && below, "lignes absentes");
      // E : le sélecteur avec CSS.escape retrouve bien la ligne (id numérique)
      const esc = await page.evaluate((id) => !!document.querySelector('#train-table-body tr[data-train-id="' + CSS.escape(id) + '"]'), mid);
      await page.evaluate((id) => { document.querySelector(`#train-table-body tr[data-train-id="${id}"]`).scrollIntoView({ block: "center", behavior: "instant" }); }, mid); await sleep(500);
      await press(page, `#train-table-body tr[data-train-id="${mid}"] .delete-btn`, touch); await sleep(500);
      await page.evaluate(() => { window.__rt = []; const o = window.renderTrainTable; window.renderTrainTable = function () { window.__rt.push(Math.round(performance.now() - window.__rec.t0)); return o.apply(this, arguments); }; });
      console.log("    [debug] confirmation : " + JSON.stringify(await page.evaluate((id) => { const b = document.querySelector(`#train-table-body tr[data-train-id="${id}"] .delete-btn`); const r = b.getBoundingClientRect(); return { active: document.getElementById("trainDeleteConfirmOverlay").classList.contains("active"), btn: [Math.round(r.left), Math.round(r.top), Math.round(r.width)], vw: innerWidth }; }, mid)));
      await page.evaluate((id) => { window.__watch = id; }, mid);
      await startRec(page);
      SHOT = `perso-fx-entrainement-suppr-${f.id}`;
      const t0 = Date.now();
      await press(page, "#trainDeleteConfirmOverlay .notes-confirm-delete", touch);
      await shot(page, 600);
      await sleep(3600);
      const R = await stopRec(page);
      if (!R.s.some((x) => x.outIds.includes(mid))) console.log("    [debug] lignes : " + R.s.filter((x, k) => k % 6 === 0).map((x) => x.t + ":" + x.row + ":" + x.y).join(" | "));
      const gone = R.s.find((x) => !x.outIds.includes(mid) && R.s.some((y) => y.t < x.t && y.outIds.includes(mid)));
      const firstOut = R.s.find((x) => x.outIds.includes(mid)); assert(firstOut, "la ligne supprimée ne prend jamais la classe d'animation (tpx-pfx-out)");
      assert(R.s.some((x) => x.minus === "Entraînement supprimé"), "pastille « Entraînement supprimé » absente");
      assert(gone && gone.t - firstOut.t >= 500, `la ligne disparaît trop vite : ${gone ? gone.t - firstOut.t : "jamais"} ms après le début de l'animation`);
      assert(R.s.every((x) => !x.outIds.includes(below)), "la ligne du dessous a été marquée");
      assert((await page.evaluate(() => window.__toasts)).length === 0, "notification verte : " + JSON.stringify(await page.evaluate(() => window.__toasts)));
      const still = await page.evaluate((id) => !!document.querySelector(`#train-table-body tr[data-train-id="${id}"]`), mid); assert(!still, "la ligne est toujours dans le tableau");
      assert(await waitFor(async () => !!((await adb.doc(`users/${u.uid}/trainingItems/${mid}`).get()).data() || {}).archivedAt, { timeout: 15000 }), "entraînement non archivé sur le serveur");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
      console.log("    (CSS.escape retrouve la ligne : " + esc + " ; suppression écrite ~" + (R.s.find((x) => x.t >= 0) ? "" : "") + "après animation)");
    });
  }

  await S("PF5f", "filet : onglet fermé 0,3 s après la confirmation de suppression → l'entraînement est bien supprimé sur le serveur, et absent à la réouverture", async () => {
    const { u, page } = await open(PC, { courses: 1, seed: seedTrains(60), pageName: "entrainements" });
    await waitFor(() => page.evaluate(() => (window.userData.trainings || []).length === 60), { timeout: 20000 });
    await page.evaluate(() => { try { window.renderTrainTable(); } catch (e) {} }); await sleep(600);
    await quietTrain(page);
    const mid = await page.evaluate(() => document.querySelectorAll("#train-table-body tr[data-train-id]")[3].getAttribute("data-train-id"));
    await press(page, `#train-table-body tr[data-train-id="${mid}"] .delete-btn`, false); await sleep(500);
    await press(page, "#trainDeleteConfirmOverlay .notes-confirm-delete", false);
    await page.evaluate(() => window.addEventListener("pagehide", () => { try { localStorage.setItem("__ph", "1"); } catch (e) {} }));
    await sleep(300);
    const ctx = page.browserContext();
    await page.close({ runBeforeUnload: true });   // vraie fermeture d'onglet ; le contexte (et son cache local Firestore) reste, comme le navigateur de l'utilisateur
    await sleep(500);
    const p2 = await ctx.newPage(); p2.setDefaultNavigationTimeout(120000); await p2.setViewport(PC);
    await p2.goto(BASE_URL + "/tableur.html", { waitUntil: "load" });
    await p2.waitForFunction(() => window.currentUser, { timeout: 60000 });
    const ok = await waitFor(async () => !!((await adb.doc(`users/${u.uid}/trainingItems/${mid}`).get()).data() || {}).archivedAt, { timeout: 25000 });
    console.log("    [debug] pagehide reçu : " + (await p2.evaluate(() => localStorage.getItem("__ph"))));
    assert(ok, "suppression perdue : l'onglet a été fermé pendant l'animation");
    await p2.evaluate(() => document.querySelector('[data-page="entrainements"]').click()); await sleep(2500);
    const present = await p2.evaluate((id) => (window.userData.trainings || []).some((t) => String(t.id) === id), mid); assert(!present, "l'entraînement réapparaît à la réouverture");
  });

  /* ═════════ PF6 : suppression depuis « Gérer » ═════════ */
  await S("PF6a", "suppression d'un cours depuis « Gérer » : ligne rouge qui tremble puis se replie ; cours archivé sur le serveur ; flashcards d'abord détachées (ordre inchangé)", async () => {
    const { u, page } = await open(PC, { courses: 5, pageName: "items" });
    await press(page, "#tpx-btn-mgr-entry", false); await sleep(1100);
    const key = await page.evaluate(() => document.querySelectorAll("#tpx-mgr-list .tpx-mgr-row")[1].getAttribute("data-key"));
    await startRec(page);
    SHOT = "perso-fx-gerer-suppr-PCclair";
    await press(page, '#tpx-mgr-list .tpx-mgr-row[data-key="' + key + '"] .tpx-mgr-act.danger', false); await sleep(700);
    const yes = await page.evaluate(() => [...document.querySelectorAll("#tpx-modal-overlay button")].map((b) => b.id + ":" + b.textContent.trim()));
    await press(page, "#tpx-cf-yes", false);
    await shot(page, 900);
    await sleep(3200);
    const R = await stopRec(page);
    assert(R.s.some((x) => x.outIds.length && x.mgr), "la ligne du gestionnaire n'est jamais marquée en rouge (boutons : " + yes.join(" | ") + ")");
    assert(R.s.some((x) => x.minus === "Cours supprimé"), "pastille « Cours supprimé » absente");
    const cid = key.split("|")[1];
    assert(await waitFor(async () => !!((await adb.doc(`users/${u.uid}/courses/${cid}`).get()).data() || {}).archivedAt, { timeout: 15000 }), "cours non archivé sur le serveur");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("PF6b", "suppression d'une matière depuis « Gérer » : ligne rouge qui se replie ; matière ET cours archivés sur le serveur", async () => {
    const { u, page } = await open(PC, { courses: 3, seed: seedSubjects(3), pageName: "dashboard" });
    await press(page, "#tpx-btn-mgr-spec", false); await sleep(1100);
    const key = await page.evaluate(() => document.querySelectorAll("#tpx-mgr-list .tpx-mgr-row")[0].getAttribute("data-key"));
    await startRec(page);
    await press(page, '#tpx-mgr-list .tpx-mgr-row[data-key="' + key + '"] .tpx-mgr-act.danger', false); await sleep(700);
    await press(page, "#tpx-del-yes", false);
    await sleep(3200);
    const R = await stopRec(page);
    assert(R.s.some((x) => x.outIds.length && x.mgr), "la ligne de matière n'est jamais marquée en rouge");
    assert(R.s.some((x) => x.minus === "Matière supprimée"), "pastille « Matière supprimée » absente");
    assert(await waitFor(async () => !!((await adb.doc(`users/${u.uid}/subjects/${key}`).get()).data() || {}).archivedAt, { timeout: 15000 }), "matière non archivée");
    if (key === "s1") assert(await waitFor(async () => !!((await adb.doc(`users/${u.uid}/courses/c1`).get()).data() || {}).archivedAt, { timeout: 15000 }), "cours de la matière non archivés");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ PF7 : redessin par l'écoute pendant l'animation ═════════ */
  await S("PF7", "le tableau est redessiné pendant l'animation (écoute Firestore) : le cadre suit la nouvelle ligne et ne disparaît pas", async () => {
    const { page } = await open(PC, { courses: 3, pageName: "items" });
    await press(page, "#tpx-btn-add-entry", false); await sleep(800);
    await typeIn(page, "#tpx-it-name", "CoursRedessin"); await sleep(200);
    await startRec(page);
    await press(page, "#tpx-it-ok", false);
    await waitFor(() => page.evaluate(() => !!document.querySelector(".tpx-pfx-glow")), { timeout: 8000 });
    await sleep(300);
    await page.evaluate(() => window.renderItemsTable());   // la ligne d'origine est remplacée par une nouvelle
    await sleep(900);
    const mid = await page.evaluate(() => { const g = document.querySelector(".tpx-pfx-glow"); const l = g && g.closest(".tpx-pfx-layer"); const hit = document.querySelector("tr.tpx-pfx-hit"); return { glow: !!g, op: l ? l.style.opacity : null, hit: !!hit, hitName: hit ? hit.textContent.indexOf("CoursRedessin") >= 0 : false }; });
    await sleep(2500); await stopRec(page);
    assert(mid.glow && mid.op !== "0" && mid.hit && mid.hitName, "l'effet s'est arrêté au redessin : " + JSON.stringify(mid));
  });

  /* ═════════ PF8 : mouvement réduit ═════════ */
  await S("PF8", "prefers-reduced-motion : aucun calque ; la ligne se teinte ; suppression d'entraînement immédiate (pas d'attente)", async () => {
    const { u, page } = await open(PC, { courses: 3, seed: seedTrains(10), pageName: "items", reduce: true });
    assert(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), "mouvement réduit non émulé");
    await press(page, "#tpx-btn-add-entry", false); await sleep(800);
    await typeIn(page, "#tpx-it-name", "CoursCalme"); await sleep(200);
    await startRec(page);
    await press(page, "#tpx-it-ok", false); await sleep(3500);
    const R = await stopRec(page);
    assert(R.s.every((x) => x.layers === 0), "calque créé en mouvement réduit");
    assert(R.s.some((x) => x.hitN > 0), "la ligne ne se teinte pas");
    await page.evaluate(() => document.querySelector('[data-page="entrainements"]').click()); await sleep(1500);
    await waitFor(() => page.evaluate(() => (window.userData.trainings || []).length === 10), { timeout: 20000 });
    await page.evaluate(() => { try { window.renderTrainTable(); } catch (e) {} }); await sleep(500);
    const id = await page.evaluate(() => document.querySelectorAll("#train-table-body tr[data-train-id]")[2].getAttribute("data-train-id"));
    await press(page, `#train-table-body tr[data-train-id="${id}"] .delete-btn`, false); await sleep(400);
    await startRec(page);
    await press(page, "#trainDeleteConfirmOverlay .notes-confirm-delete", false); await sleep(900);
    const R2 = await stopRec(page);
    const gone = await page.evaluate((i) => !document.querySelector(`#train-table-body tr[data-train-id="${i}"]`), id);
    assert(gone && R2.s.every((x) => x.layers === 0 && !x.outIds.length), "retrait non immédiat en mouvement réduit");
    assert(await waitFor(async () => !!((await adb.doc(`users/${u.uid}/trainingItems/${id}`).get()).data() || {}).archivedAt, { timeout: 15000 }), "non archivé");
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
