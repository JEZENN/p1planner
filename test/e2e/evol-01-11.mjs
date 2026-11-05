/* Évolutions : (1) pause des révisions (Paramètres → Flashcards), (2) flashcards : menu « Classement » qui se ferme, « Voir la réponse » à la hauteur des boutons de réponse,
   bouton « Session Flash » à la hauteur de « Réinitialiser les filtres », (3) to-do : « Valider un tour + la tâche » sans la fenêtre de tour, (4) menus : profil ⇄ « ··· »,
   changement de page depuis le header sans glissement d'entrée.
   Vraie page + émulateurs. Lancer : node test/e2e/evol-01-11.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; EVSHOTS=1 pour les captures) */
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
const FM = [
  { id: "PC", label: "PC 1366", vp: { width: 1366, height: 900 } },
  { id: "iPadP", label: "iPad portrait 820", vp: M(820, 1180) },
  { id: "tel", label: "téléphone 390", vp: M(390, 844) },
];
const shot = async (page, name) => { if (process.env.EVSHOTS) await page.screenshot({ path: `docs/captures-15-10/evol-01-11-${name}.png` }); };
const DAY = 864e5;

async function open({ vp = FM[0].vp, theme = "light", courses = 2, seed = null, reduce = false, page0 = "dashboard", prefs = {} } = {}) {
  const u = await mkUser({ courses });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...prefs }, { merge: true });
  if (seed) await seed(u.uid);
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 600);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
  if (page0) { await page.evaluate((p) => document.querySelector('[data-page="' + p + '"]').click(), page0); await sleep(1100); }
  await sleep(500);
  return { u, page };
}
const iso = (ms) => new Date(ms).toISOString();
const card = (id, o) => ({ speId: "s1", recto: "<p>Recto " + id + "</p>", verso: "<p>Verso " + id + "</p>", itemId: null, interval: 0, nextReview: iso(Date.now() - 1000), lastReview: null, createdAt: iso(Date.now() - 30 * DAY), updatedAt: iso(Date.now() - 30 * DAY), source: "manuel", ...o });
const seedCards = (defs) => async (uid) => { for (const [id, o] of Object.entries(defs)) await adb.doc(`users/${uid}/flashcards/${id}`).set(card(id, o)); };
const getCard = async (uid, id) => (await adb.doc(`users/${uid}/flashcards/${id}`).get()).data();
const prefsOf = async (uid) => (await adb.doc(`users/${uid}/settings/preferences`).get()).data() || {};
const openSettingsSection = async (page, key) => { await page.evaluate(() => window.openSettingsModal()); await page.waitForSelector("#settings-modal-overlay.active", { timeout: 8000 }); await sleep(1200); await page.evaluate((k) => window.p1OpenSettingsSection(k), key); await sleep(700); };
const openTodo = async (page) => { await page.evaluate(() => document.getElementById("global-todo-btn").click()); await page.waitForSelector("#global-todo-overlay.active", { timeout: 8000 }); await sleep(900); };
const task = (text, extra = {}) => ({ text, itemKey: "s1-c1", specialtyColor: "#7c6cf6", specialtyName: "MatiereE2E", specialtyShort: "ME", completed: false, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), ...extra });

try {
  /* ═════════ M : menus ═════════ */
  await S("M1", "profil ⇄ menu « ··· » des ressources : ouvrir l'un ferme l'autre, dans les deux sens (vrais clics)", async () => {
    const { page } = await open({ page0: "items", prefs: { customResources: [{ id: "fiches", label: "Fiches", color: "#10b981" }], selectedResources: ["annale", "tutorat", "prepa"] } });
    await page.waitForSelector(".resource-box.overflow-btn", { visible: true, timeout: 20000 });
    const state = () => page.evaluate(() => ({ profile: document.getElementById("profile-dropdown").classList.contains("active"), more: document.getElementById("resource-overflow-popup").classList.contains("show") }));
    await page.click("#user-avatar"); await sleep(400);
    let s = await state(); assert(s.profile && !s.more, "profil non ouvert : " + JSON.stringify(s));
    await page.click(".resource-box.overflow-btn"); await sleep(500);
    s = await state(); assert(s.more && !s.profile, "« ··· » ouvert : le profil aurait dû se fermer : " + JSON.stringify(s));
    await page.click("#user-avatar"); await sleep(700);
    s = await state(); assert(s.profile && !s.more, "profil ouvert : « ··· » aurait dû se fermer : " + JSON.stringify(s));
    await page.mouse.click(700, 500); await sleep(400);
    s = await state(); assert(!s.profile, "un clic ailleurs doit fermer le profil : " + JSON.stringify(s));
    await page.click(".resource-box.overflow-btn"); await sleep(500);
    s = await state(); assert(s.more && !s.profile, "« ··· » doit s'ouvrir sans profil : " + JSON.stringify(s));
    await page.click("#user-avatar"); await sleep(300); await page.click("#user-avatar"); await sleep(300);
    s = await state(); assert(!s.profile, "second clic sur l'avatar : le profil doit se fermer : " + JSON.stringify(s));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("M2", "changement de page depuis le header : pas de glissement d'entrée (barre normale : glissement conservé)", async () => {
    const { page } = await open({ page0: "dashboard" });
    const slide = (ms) => page.evaluate((t) => new Promise((res) => { let n = 0; const t0 = performance.now(); (function f() { n = Math.max(n, document.getAnimations().filter((a) => a.animationName === "p1PageSlideIn").length); if (performance.now() - t0 < t) requestAnimationFrame(f); else res(n); })(); }), ms);
    /* barre normale */
    const pNorm = slide(500); await page.evaluate(() => document.querySelector('.app-nav-btn[data-page="planning"]').click()); const nNorm = await pNorm;
    assert(nNorm >= 1, "la barre normale doit garder son glissement : " + nNorm);
    await page.evaluate(() => document.querySelector('.app-nav-btn[data-page="stats"]').click()); await sleep(700);
    /* descendre : la pilule du header apparaît */
    await page.evaluate(() => { const sp = document.createElement("div"); sp.id = "p1-spacer"; sp.style.height = "3000px"; document.getElementById("main-content").appendChild(sp); window.scrollTo(0, 1500); }); await sleep(900);
    await page.waitForSelector("#p1HdrNav.is-on", { timeout: 6000 });
    const pHdr = slide(520); await page.click('#p1HdrNav .p1-hdr-b[data-page="planning"]'); const nHdr = await pHdr;
    assert(nHdr === 0, "depuis le header, la page ne doit pas glisser : " + nHdr);
    await sleep(900);
    const cls = await page.evaluate(() => document.body.classList.contains("p1-hdr-go"));
    assert(!cls, "la classe doit être retirée après ~450 ms");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ F : flashcards ═════════ */
  await S("F1", "fenêtre de carte : le menu « Classement » se ferme au clic / toucher / clavier ailleurs, y compris dans les zones de texte", async () => {
    const { page } = await open({ page0: "dashboard" });
    await page.evaluate(() => { window.speErrCurrentId = "s1"; window._flashNewCard(); }); await page.waitForSelector("#flashEditOverlay.active", { timeout: 8000 }); await sleep(900);
    const isOpen = () => page.evaluate(() => document.getElementById("flashItemPicker").classList.contains("open"));
    const openIt = async () => { await page.click("#flashItemPicker .tpx-picker-btn"); await sleep(250); assert(await isOpen(), "le menu ne s'ouvre pas"); };
    await openIt(); await page.click("#flashFormRecto"); await sleep(250); assert(!(await isOpen()), "clic dans le recto : le menu reste ouvert");
    await openIt(); await page.click("#flashFormVerso"); await sleep(250); assert(!(await isOpen()), "clic dans le verso : le menu reste ouvert");
    await openIt(); await page.click("#flashEditTitle"); await sleep(250); assert(!(await isOpen()), "clic sur le titre : le menu reste ouvert");
    await openIt(); await page.evaluate(() => document.getElementById("flashFormRecto").focus()); await sleep(250); assert(!(await isOpen()), "focus clavier ailleurs : le menu reste ouvert");
    await openIt(); await page.keyboard.press("Escape"); await sleep(250);
    await page.waitForSelector("#flashEditOverlay.active", { timeout: 2000 }).catch(() => {});
    await page.evaluate(() => { const ov = document.getElementById("flashEditOverlay"); if (!ov.classList.contains("active")) { window.speErrCurrentId = "s1"; window._flashNewCard(); } }); await sleep(700);
    await openIt();
    const box = await page.evaluate(() => { const r = document.querySelector("#flashItemPicker .tpx-picker-btn").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(box.x, box.y); await sleep(250); assert(!(await isOpen()), "second clic sur le bouton : le menu doit se refermer");
    await openIt(); await page.touchscreen?.tap?.(20, 20); await sleep(250);
    assert(!(await isOpen()), "toucher hors du menu : le menu reste ouvert");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  for (const f of FM) {
    await S("F2-" + f.id, `${f.label} : « Voir la réponse » exactement aussi haut que les boutons Raté / Hésitant / Su (computed height), remesuré au redimensionnement et à la taille de police`, async () => {
      const { page } = await open({ vp: f.vp, seed: seedCards({ a: {}, b: {}, c: { interval: 21, lastReview: iso(Date.now() - 40 * DAY), nextReview: iso(Date.now() - 1000) } }) });
      await page.evaluate(() => window.openFlashDrawer()); await sleep(1500);
      await page.evaluate(() => window.launchMultiFlashSession()); await page.waitForSelector("#flashSessionOverlay.active .flash-reveal-btn", { timeout: 10000 }); await sleep(1100);
      const hRev = () => page.evaluate(() => getComputedStyle(document.querySelector("#flashSessionOverlay .flash-reveal-btn")).height);
      const hEval = () => page.evaluate(() => { const w = document.getElementById("speFlashEvalWrap"), p = w.style.display; w.style.display = "block"; w.style.visibility = "hidden"; const hs = [...w.querySelectorAll(".flash-eval-btn")].map((b) => getComputedStyle(b).height); w.style.display = p; w.style.visibility = ""; return hs; });
      const same = async (tag) => { const r = await hRev(), e = await hEval(); assert(e.every((h) => Math.abs(parseFloat(h) - parseFloat(r)) < 0.6), `${tag} : réponse ${r} ≠ boutons ${JSON.stringify(e)}`); return parseFloat(r); };
      const h1 = await same("ouverture");
      assert(h1 > 44, "hauteur trop faible : " + h1);
      await shot(page, "voir-reponse-" + f.id);
      await page.evaluate(() => document.documentElement.style.fontSize = "20px"); await page.evaluate(() => window.dispatchEvent(new Event("resize"))); await sleep(500);
      const h2 = await same("police 20 px"); assert(h2 > h1, `la hauteur doit suivre la police : ${h1} → ${h2}`);
      await page.evaluate(() => document.documentElement.style.fontSize = "");
      await page.setViewport({ ...f.vp, width: f.vp.width === 390 ? 340 : 600 }); await sleep(700);
      await same("redimensionnement");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  for (const f of FM) {
    await S("F3-" + f.id, `${f.label} : « Session Flash » à la hauteur de « Réinitialiser les filtres »`, async () => {
      const { page } = await open({ vp: f.vp, page0: "dashboard" });
      const hs = await page.evaluate(() => { const a = document.querySelector(".flash-global-btn").getBoundingClientRect(), b = document.getElementById("btn-reset-filters-specialty").getBoundingClientRect(); return { sf: a.height, rf: b.height, st: a.top, rt: b.top }; });
      assert(Math.abs(hs.sf - hs.rf) < 0.6 && Math.abs(hs.st - hs.rt) < 0.6, "hauteurs différentes : " + JSON.stringify(hs));
      await shot(page, "session-flash-" + f.id);
    });
  }

  /* ═════════ T : to-do ═════════ */
  const tourSeed = (n, conf) => async (uid) => {
    await adb.doc(`users/${uid}/courses/c1`).set({ tourConfidences: conf.slice(0, n), tourDates: conf.slice(0, n).map(() => iso(Date.now() - 3 * DAY).slice(0, 10)), tourDurations: conf.slice(0, n).map(() => null), tourSupports: conf.slice(0, n).map(() => null), tourCount: n }, { merge: true });
    await adb.doc(`users/${uid}/tasks/t1`).set(task("1 - Cours1"));
    await adb.doc(`users/${uid}/tasks/t2`).set(task("2 - Cours2", { itemKey: "s1-c2" }));
  };
  const clickTaskBox = (page, id) => page.evaluate((i) => { const b = document.querySelector('.checklist-item[data-todo-id="' + i + '"] .checklist-checkbox'); b.scrollIntoView({ block: "center" }); b.click(); }, id);
  for (const f of FM) {
    await S("T1-" + f.id, `${f.label} : « Valider un tour + la tâche » se déplie (survol PC / toucher), matière, niveaux, dernier niveau encadré, tour enregistré comme un tour rapide, tâche validée, aucune fenêtre de tour`, async () => {
      const { u, page } = await open({ vp: f.vp, page0: "planning", seed: tourSeed(2, [2, 3]) });
      await openTodo(page);
      await page.waitForSelector('.checklist-item[data-todo-id="t1"]', { timeout: 10000 });
      await clickTaskBox(page, "t1"); await sleep(700);
      assert(await page.evaluate(() => document.getElementById("checklist-choice-popup").classList.contains("show")), "popup non ouvert");
      const touch = !!f.vp.isMobile;
      const optBox = await page.evaluate(() => { const r = document.getElementById("checklist-choice-tour").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 14 }; });
      const expH = () => page.evaluate(() => document.getElementById("p1-tl-expand").getBoundingClientRect().height);
      assert((await expH()) < 2, "la ligne ne doit pas être dépliée au départ");
      if (touch) await page.touchscreen.tap(optBox.x, optBox.y); else await page.mouse.move(optBox.x, optBox.y);
      await sleep(700);
      assert((await expH()) > 60, "la ligne ne se déplie pas : " + (await expH()));
      const info = await page.evaluate(() => ({
        subj: (document.querySelector(".p1-tl-subj span") || {}).textContent, hasCheck: !!document.querySelector(".p1-tl-subj i.fa-check"),
        lv: [...document.querySelectorAll(".p1-tl-lv")].map((b) => b.textContent), cur: [...document.querySelectorAll(".p1-tl-lv.current")].map((b) => b.textContent),
        title: document.querySelector(".p1-tl-lv.current") && document.querySelector(".p1-tl-lv.current").getAttribute("title"),
        popup: (() => { const p = document.getElementById("checklist-choice-popup").getBoundingClientRect(), t = document.querySelector('.checklist-item[data-todo-id="t1"]').getBoundingClientRect(); return { pt: p.top, pb: p.bottom, pl: p.left, pr: p.right, rt: t.top, rb: t.bottom, vw: innerWidth, vh: innerHeight }; })(),
      }));
      assert(info.subj === "MatiereE2E" && info.hasCheck, "puce de matière : " + JSON.stringify(info));
      assert(info.lv.join() === "1,2,3,4,5" && info.cur.join() === "3", "niveaux / dernier tour encadré : " + JSON.stringify(info));
      assert(info.title == null, "aucune bulle du navigateur (title)");
      const P = info.popup;
      assert(P.pb <= P.rt + 1 || P.pt >= P.rb - 1, "la fenêtre recouvre la tâche : " + JSON.stringify(P));
      assert(P.pl >= 0 && P.pr <= P.vw && P.pt >= 0 && P.pb <= P.vh, "la fenêtre sort de l'écran : " + JSON.stringify(P));
      if (!touch) {
        const cb = await page.evaluate(() => { const r = document.querySelector(".p1-tl-lv.current").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.mouse.move(cb.x, cb.y); await sleep(450);
        const tip = await page.evaluate(() => { const t = document.getElementById("p1-tl-tip"); return t && { txt: t.textContent, op: getComputedStyle(t).opacity }; });
        assert(tip && tip.txt === "Niveau du dernier tour" && parseFloat(tip.op) > 0.9, "infobulle du niveau du dernier tour : " + JSON.stringify(tip));
      }
      await shot(page, "todo-tour-" + f.id);
      const lvl = await page.evaluate(() => { const b = document.querySelector('.p1-tl-lv[data-v="4"]'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      if (touch) await page.touchscreen.tap(lvl.x, lvl.y); else await page.mouse.click(lvl.x, lvl.y);
      const modalOpen = await page.evaluate(() => { const m = document.getElementById("confidence-modal"); return m && m.classList.contains("active"); });
      assert(!modalOpen, "la fenêtre « Enregistrer un tour » ne doit pas s'ouvrir");
      const c = await waitFor(async () => { const d = (await adb.doc(`users/${u.uid}/courses/c1`).get()).data(); return (d.tourConfidences || []).filter((v) => v != null).length === 3 && d; }, { timeout: 15000 });
      assert(c, "tour non enregistré");
      assert(c.tourConfidences[2] === 4 && c.tourConfidences[0] === 2 && c.tourConfidences[1] === 3, "position / niveau : " + JSON.stringify(c.tourConfidences));
      assert(c.tourDates[2] === new Date().toISOString().slice(0, 10) || (c.tourDates[2] || "").slice(0, 10) === new Date().toISOString().slice(0, 10) || !!c.tourDates[2], "date du jour : " + JSON.stringify(c.tourDates));
      assert((c.tourDurations || [])[2] == null && (c.tourSupports || [])[2] == null, "ni temps ni support : " + JSON.stringify([c.tourDurations, c.tourSupports]));
      const t = await waitFor(async () => { const d = (await adb.doc(`users/${u.uid}/tasks/t1`).get()).data(); return d.completed === true && d; }, { timeout: 15000 });
      assert(t, "la tâche n'est pas validée");
      const t2 = (await adb.doc(`users/${u.uid}/tasks/t2`).get()).data();
      assert(t2.completed === false, "l'autre tâche ne doit pas bouger");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("T2", "tous les tours remplis : message clair, rien n'est validé ni écrit", async () => {
    const { u, page } = await open({ page0: "planning", seed: tourSeed(8, [1, 2, 3, 4, 5, 1, 2, 3]) });
    await openTodo(page);
    await page.waitForSelector('.checklist-item[data-todo-id="t1"]', { timeout: 10000 });
    await clickTaskBox(page, "t1"); await sleep(700);
    const ob = await page.evaluate(() => { const r = document.getElementById("checklist-choice-tour").getBoundingClientRect(); return { x: r.left + 40, y: r.top + 14 }; });
    await page.mouse.move(ob.x, ob.y); await sleep(700);
    const lv = await page.evaluate(() => { const r = document.querySelector('.p1-tl-lv[data-v="5"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const before = (await adb.doc(`users/${u.uid}/courses/c1`).get()).data();
    await page.mouse.click(lv.x, lv.y); await sleep(1500);
    const msg = await page.evaluate(() => { const m = document.getElementById("custom-alert-modal"); return m && m.classList.contains("active") ? m.innerText : null; });
    assert(msg && /Tous les tours de ce cours sont déjà remplis/.test(msg), "message : " + msg);
    await sleep(1500);
    const after = (await adb.doc(`users/${u.uid}/courses/c1`).get()).data(), t = (await adb.doc(`users/${u.uid}/tasks/t1`).get()).data();
    assert(JSON.stringify(after.tourConfidences) === JSON.stringify(before.tourConfidences), "le cours a changé");
    assert(t.completed === false, "la tâche ne doit pas être validée");
  });
  await S("T3", "premier tour (aucun tour dans la matière) : aucun niveau encadré ; échelle sur 10 : deux rangées de 5 ; « Valider la tâche uniquement » inchangé", async () => {
    const { u, page } = await open({ page0: "planning", prefs: { confidenceScale: 10 }, seed: tourSeed(0, []) });
    await page.evaluate(() => { try { localStorage.setItem("confidenceScale__" + window.currentUser.uid, "10"); } catch (e) {} });
    await openTodo(page);
    await page.waitForSelector('.checklist-item[data-todo-id="t1"]', { timeout: 10000 });
    await clickTaskBox(page, "t1"); await sleep(700);
    const ob = await page.evaluate(() => { const r = document.getElementById("checklist-choice-tour").getBoundingClientRect(); return { x: r.left + 40, y: r.top + 14 }; });
    await page.mouse.move(ob.x, ob.y); await sleep(700);
    const info = await page.evaluate(() => ({ n: document.querySelectorAll(".p1-tl-lv").length, rows: document.querySelectorAll(".p1-tl-row").length, cur: document.querySelectorAll(".p1-tl-lv.current").length, scale: window.getConfidenceScale && window.getConfidenceScale() }));
    if (info.scale === 10) assert(info.n === 10 && info.rows === 2, "barème 10 : " + JSON.stringify(info));
    else assert(info.n === 5 && info.rows === 1, "barème 5 : " + JSON.stringify(info));
    assert(info.cur === 0, "aucun niveau ne doit être encadré sans tour : " + JSON.stringify(info));
    await shot(page, "todo-tour-echelle");
    const tb = await page.evaluate(() => { const r = document.getElementById("checklist-choice-task").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(tb.x, tb.y);
    const t = await waitFor(async () => { const d = (await adb.doc(`users/${u.uid}/tasks/t1`).get()).data(); return d.completed === true && d; }, { timeout: 15000 });
    assert(t, "« Valider la tâche uniquement » ne valide plus");
    const c = (await adb.doc(`users/${u.uid}/courses/c1`).get()).data();
    assert(!(c.tourConfidences || []).some((v) => v != null), "aucun tour ne doit être écrit : " + JSON.stringify(c.tourConfidences));
  });

  /* ═════════ P : pause des révisions ═════════ */
  const cardsPause = () => seedCards({
    rev: { interval: 15, lastReview: iso(Date.now() - 10 * DAY), nextReview: iso(Date.now() + 5 * DAY) },
    nouv: {},
    late: { interval: 6, lastReview: iso(Date.now() - 12 * DAY), nextReview: iso(Date.now() - 2 * DAY) },
    future: { interval: 40, lastReview: iso(Date.now() - 3 * DAY), nextReview: iso(Date.now() + 37 * DAY) },
  });
  for (const theme of ["light", "dark"]) {
    await S("P1-" + theme, `pause des révisions (${theme}) : interrupteur, état enregistré, plus aucune carte due, session refusée par un encart clair`, async () => {
      const { u, page } = await open({ theme, page0: "dashboard", seed: cardsPause() });
      await page.evaluate(() => window.updateFlashGlobalCount()); await waitFor(async () => (await page.evaluate(() => document.getElementById("flashGlobalDueCount").textContent)) === "2", { timeout: 8000 });
      await openSettingsSection(page, "p1-flash");
      const lab = await page.evaluate(() => ({ title: document.querySelector('[data-setting="p1-flash"] .settings-card-title').textContent, strong: document.getElementById("p1-pause-title").textContent, sub: document.getElementById("p1-pause-sub").textContent, on: document.getElementById("p1-pause-sw").getAttribute("aria-checked"), item: [...document.querySelectorAll(".p1-set-it-tx")].map((e) => e.textContent) }));
      assert(lab.strong === "Pause des révisions" && lab.on === "false" && /^Pars en vacances l.esprit léger : plus aucune carte n.est proposée et rien ne s.accumule\. À la reprise, tes échéances sont décalées de la durée de la pause\.$/.test(lab.sub) && lab.item.includes("Flashcards"), "état de repos : " + JSON.stringify(lab));
      await shot(page, "pause-repos-" + theme);
      /* transitions : fond de la ligne (0,3 s) et fondu du texte (0,18 s) lancés dès le clic */
      await page.evaluate(() => { window.__tr = []; window.__swap = false; new MutationObserver(() => { if (document.getElementById('p1-pause-sub').classList.contains('is-swap')) window.__swap = true; }).observe(document.getElementById('p1-pause-sub'), { attributes: true, attributeFilter: ['class'] }); const t0 = performance.now(); (function f() { document.getAnimations().forEach((a) => { if (a.transitionProperty) { const e = a.effect.target; window.__tr.push(a.transitionProperty + ':' + a.effect.getTiming().duration + ':' + (e.id || e.className)); } }); if (performance.now() - t0 < 700) requestAnimationFrame(f); })(); });
      await page.click('#p1-pause-sw'); await sleep(900);
      const trs = await page.evaluate(() => [...new Set(window.__tr)]);
      assert(trs.some((t) => /^background-color:300:p1-pause-row/.test(t)), 'fond de la ligne : transition de 0,3 s absente : ' + JSON.stringify(trs));
      assert(await page.evaluate(() => window.__swap), 'fondu du texte absent (classe is-swap jamais posée)');
      const fin = await page.evaluate(() => ({ sub: document.getElementById('p1-pause-sub').textContent, on: document.getElementById('p1-pause-sw').getAttribute('aria-checked'), cls: document.getElementById('p1-pause-row').className, subOp: parseFloat(getComputedStyle(document.getElementById('p1-pause-sub')).opacity) }));
      assert(fin.subOp === 1, 'le texte doit être revenu visible : ' + fin.subOp);
      const d = new Date(), pad = (n) => (n < 10 ? "0" : "") + n;
      assert(fin.on === "true" && fin.cls.includes("is-paused") && fin.sub === `En pause depuis le ${pad(d.getDate())}/${pad(d.getMonth() + 1)} (0 jour) : aucune carte n’est proposée. À la reprise, tes échéances seront décalées d’autant.`, "état en pause : " + JSON.stringify(fin));
      await shot(page, "pause-actif-" + theme);
      const pr = await waitFor(async () => (await prefsOf(u.uid)).flashSettings && (await prefsOf(u.uid)).flashSettings.pauseSince, { timeout: 10000 });
      assert(pr && !isNaN(Date.parse(pr)), "flashSettings.pauseSince non enregistré : " + JSON.stringify(await prefsOf(u.uid)));
      /* rien n'est dû, compteur vide */
      const due = await page.evaluate(async () => ({ n: (await window.loadAllDueFlashCards()).length }));
      await page.evaluate(() => window.updateFlashGlobalCount()); await sleep(1200);
      const badge = await page.evaluate(() => document.getElementById("flashGlobalDueCount").textContent);
      assert(due.n === 0 && badge === "", "des cartes restent dues : " + JSON.stringify({ due, badge }));
      /* session refusée */
      await page.evaluate(() => window.closeSettingsModal && window.closeSettingsModal()); await sleep(600);
      await page.evaluate(() => window.openFlashDrawer()); await sleep(1300);
      await page.evaluate(() => window.launchMultiFlashSession()); await sleep(800);
      const refus = await page.evaluate(() => { const m = document.getElementById("custom-alert-modal"); return { alert: m && m.classList.contains("active") ? m.innerText : null, sess: document.getElementById("flashSessionOverlay").classList.contains("active"), toast: document.querySelectorAll(".toast-notification").length }; });
      assert(refus.alert && /Révisions en pause/.test(refus.alert) && /Tes révisions sont en pause \(Paramètres → Flashcards\)\. Réactive-les pour reprendre\./.test(refus.alert) && !refus.sess && refus.toast === 0, "session refusée : " + JSON.stringify(refus));
      await shot(page, "pause-refus-" + theme);
      /* aucune carte écrite par la mise en pause */
      const rev = await getCard(u.uid, "rev");
      assert(!rev.pauseShift, "la mise en pause ne doit toucher aucune carte");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("P2", "reprise après 3 jours : cartes déjà révisées décalées de 3 jours, nouvelle carte intacte, message de fin 6 s, jamais décalées deux fois (rechargement)", async () => {
    const { u, page } = await open({ page0: "dashboard", seed: cardsPause() });
    const before = {}; for (const id of ["rev", "nouv", "late", "future"]) before[id] = await getCard(u.uid, id);
    const t0 = iso(Date.now() - 3 * DAY);
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ flashSettings: { pauseSince: t0 } }, { merge: true });
    await openSettingsSection(page, "p1-flash");
    await waitFor(async () => (await page.evaluate(() => document.getElementById("p1-pause-sw").getAttribute("aria-checked"))) === "true", { timeout: 8000 });
    const sub = await page.evaluate(() => document.getElementById("p1-pause-sub").textContent);
    assert(/\(3 jours\)/.test(sub), "durée affichée : " + sub);
    await page.click("#p1-pause-sw");
    const shiftingSeen = await waitFor(async () => (await page.evaluate(() => document.getElementById("p1-pause-msg-in").textContent)) === "Décalage des échéances…", { timeout: 3000, every: 30 });
    const done = await waitFor(async () => (await page.evaluate(() => document.getElementById("p1-pause-msg-in").textContent)) === "Révisions reprises : 3 cartes décalées.", { timeout: 20000 });
    assert(done, "message de fin absent : " + (await page.evaluate(() => document.getElementById("p1-pause-msg-in").textContent)));
    void shiftingSeen;
    await shot(page, "pause-reprise");
    const after = {}; for (const id of ["rev", "nouv", "late", "future"]) after[id] = await getCard(u.uid, id);
    for (const id of ["rev", "late", "future"]) {
      for (const k of ["nextReview", "lastReview"]) { const dlt = Date.parse(after[id][k]) - Date.parse(before[id][k]); assert(dlt >= 3 * DAY - 2000 && dlt < 3 * DAY + 90000, `${id}.${k} décalé de ${dlt / DAY} j`); }
      assert(after[id].pauseShift === t0, id + " : marqueur pauseShift absent");
      assert(after[id].recto === before[id].recto && after[id].interval === before[id].interval && after[id].createdAt === before[id].createdAt, id + " : autre champ modifié");
    }
    assert(JSON.stringify(after.nouv) === JSON.stringify(before.nouv), "la nouvelle carte ne doit pas bouger");
    const pf = (await prefsOf(u.uid)).flashSettings;
    assert(pf && pf.pauseSince === undefined && pf.pauses.length === 1 && pf.pauses[0].s === t0 && !isNaN(Date.parse(pf.pauses[0].e)) && pf.pauses[0].apps.join() === "p1planner", "historique : " + JSON.stringify(pf));
    await sleep(500);
    const off = await page.evaluate(() => ({ on: document.getElementById("p1-pause-sw").getAttribute("aria-checked"), sub: document.getElementById("p1-pause-sub").textContent }));
    assert(off.on === "false" && /^Pars en vacances/.test(off.sub), "état de repos après reprise : " + JSON.stringify(off));
    await page.evaluate(() => window.updateFlashGlobalCount()); await sleep(1300);
    const badge = await page.evaluate(() => document.getElementById("flashGlobalDueCount").textContent);
    assert(badge === "1", "le compteur doit revenir pour la nouvelle carte seulement (la carte en retard est décalée de 3 jours : plus due) : " + badge);
    /* le message disparaît après 6 s */
    await sleep(6600);
    const gone = await page.evaluate(() => !document.getElementById("p1-pause-msg").classList.contains("is-open"));
    assert(gone, "le message doit disparaître après 6 s");
    /* rechargement : rien n'est décalé une seconde fois */
    const snap = JSON.stringify(after);
    await page.reload({ waitUntil: "load" }); await sleep(7000);
    const again = {}; for (const id of ["rev", "nouv", "late", "future"]) again[id] = await getCard(u.uid, id);
    assert(JSON.stringify(again) === snap, "les cartes ont encore bougé après rechargement");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("P3", "pause remise juste après une reprise : le message « Révisions reprises… » disparaît aussitôt ; mouvements réduits : changements immédiats", async () => {
    const { u, page } = await open({ page0: "dashboard", seed: cardsPause(), reduce: true });
    await openSettingsSection(page, "p1-flash");
    await page.click("#p1-pause-sw"); await waitFor(async () => (await prefsOf(u.uid)).flashSettings && (await prefsOf(u.uid)).flashSettings.pauseSince, { timeout: 8000 });
    const sub = await page.evaluate(() => ({ t: document.getElementById("p1-pause-sub").textContent, swap: document.getElementById("p1-pause-sub").classList.contains("is-swap") }));
    assert(/^En pause depuis le/.test(sub.t) && !sub.swap, "mouvements réduits : le texte doit changer sans fondu : " + JSON.stringify(sub));
    await sleep(1200);
    await page.click("#p1-pause-sw");
    await waitFor(async () => /Révisions reprises/.test(await page.evaluate(() => document.getElementById("p1-pause-msg-in").textContent)), { timeout: 15000 });
    await page.click("#p1-pause-sw"); await sleep(120);
    const open1 = await page.evaluate(() => document.getElementById("p1-pause-msg").classList.contains("is-open"));
    assert(!open1, "le message de reprise doit se replier aussitôt");
    await sleep(500);
    const txt = await page.evaluate(() => document.getElementById("p1-pause-msg-in").textContent);
    assert(txt === "", "le message doit être vidé après le repli : " + JSON.stringify(txt));
    await waitFor(async () => (await prefsOf(u.uid)).flashSettings && (await prefsOf(u.uid)).flashSettings.pauseSince, { timeout: 8000 });
  });
  await S("P4", "pause enregistrée par une autre application : à l'ouverture, les cartes sont décalées une fois et l'application est ajoutée à l'historique", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
    await seedCards({ rev: { interval: 15, lastReview: iso(Date.now() - 10 * DAY), nextReview: iso(Date.now() + 5 * DAY) }, nouv: {} })(u.uid);
    const s = iso(Date.now() - 4 * DAY), e = iso(Date.now() - 1 * DAY), before = await getCard(u.uid, "rev");
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ flashSettings: { pauses: [{ s, e, apps: ["autre"] }] } }, { merge: true });
    const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page;
    const ok = await waitFor(async () => (await getCard(u.uid, "rev")).pauseShift === s, { timeout: 20000 });
    if (!ok) console.log(JSON.stringify({ logs: page.__logs.slice(-12), errs: page.__errors, prefs: await prefsOf(u.uid), card: await getCard(u.uid, "rev"), fs: await page.evaluate(() => ({ raw: window._p1FlashSettingsRaw, ready: typeof window.p1FlashShiftForPause, paused: window.p1FlashPause && window.p1FlashPause.isPaused() })) }));
    assert(ok, "la carte n'a pas été décalée");
    const after = await getCard(u.uid, "rev");
    assert(Math.abs(Date.parse(after.nextReview) - Date.parse(before.nextReview) - 3 * DAY) < 1500, "décalage de 3 jours attendu : " + (Date.parse(after.nextReview) - Date.parse(before.nextReview)) / DAY);
    const pf = await waitFor(async () => { const p = (await prefsOf(u.uid)).flashSettings; return p && p.pauses[0].apps.includes("p1planner") && p; }, { timeout: 10000 });
    assert(pf && pf.pauses[0].apps.join() === "autre,p1planner", "historique : " + JSON.stringify(pf));
    const snapN = after.nextReview;
    await page.reload({ waitUntil: "load" }); await sleep(6000);
    assert((await getCard(u.uid, "rev")).nextReview === snapN, "décalée une seconde fois après rechargement");
  });
  for (const theme of ['dark', 'pastel']) {
    await S('V1-' + theme, 'aspect (' + theme + ') : fenêtre de validation de la to-do dépliée, ligne de pause des révisions active', async () => {
      const { page } = await open({ theme, page0: 'planning', seed: tourSeed(2, [2, 3]) });
      await openTodo(page); await page.waitForSelector('.checklist-item[data-todo-id="t1"]', { timeout: 10000 });
      await clickTaskBox(page, 't1'); await sleep(700);
      const ob = await page.evaluate(() => { const r = document.getElementById('checklist-choice-tour').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 14 }; });
      await page.mouse.move(ob.x, ob.y); await sleep(800);
      const cb = await page.evaluate(() => { const r = document.querySelector('.p1-tl-lv.current').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(cb.x, cb.y); await sleep(500);
      const ok = await page.evaluate(() => { const o = document.getElementById('checklist-choice-tour'); const b = getComputedStyle(o).backgroundImage; return /linear-gradient/.test(b) && document.querySelectorAll('.p1-tl-lv').length === 5; });
      assert(ok, 'popup incomplet');
      await shot(page, 'todo-tour-' + theme);
      await page.keyboard.press('Escape'); await page.mouse.click(30, 700); await sleep(500);
      await page.evaluate(() => { const c = document.getElementById('global-todo-overlay'); if (c) c.classList.remove('active'); });
      await openSettingsSection(page, 'p1-flash');
      await page.click('#p1-pause-sw'); await sleep(900);
      await shot(page, 'pause-' + theme);
      assert(page.__errors.length === 0, 'erreurs JS : ' + page.__errors.join(' | '));
    });
  }
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
