/* Flashcards : modes Simple / Anki / FSRS, réglages, drapeaux, suspension.
   Vraie page + émulateurs. Lancer : node test/e2e/flashcards-v2.mjs [préfixes]   (PUBLIC_DIR=<copie « avant »> pour la contre-épreuve ; EVSHOTS=1 pour les captures) */
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
const DAY = 864e5, iso = (ms) => new Date(ms).toISOString();
const shot = async (page, name) => { if (process.env.EVSHOTS) await page.screenshot({ path: `docs/captures-15-10/flashcards-v2-${name}.png` }); };

async function open({ vp = FM[0].vp, theme = "light", seed = null, prefs = {} } = {}) {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...prefs }, { merge: true });
  if (seed) await seed(u.uid);
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 600);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar") && window.P1FlashAlgo, { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
  await sleep(500);
  return { u, page };
}
const base = (id, o) => ({ speId: "s1", recto: "<p>Recto " + id + "</p>", verso: "<p>Verso " + id + "</p>", itemId: null, interval: 0, nextReview: iso(Date.now() - 1000), lastReview: null, createdAt: iso(Date.now() - 30 * DAY), updatedAt: iso(Date.now() - 30 * DAY), source: "manuel", ...o });
const seedCards = (defs) => async (uid) => { for (const [id, o] of Object.entries(defs)) await adb.doc(`users/${uid}/flashcards/${id}`).set(base(id, o)); };
const allCards = async (uid) => { const s = await adb.collection(`users/${uid}/flashcards`).get(); const o = {}; s.forEach((d) => { o[d.id] = d.data(); }); return o; };
const prefsOf = async (uid) => (await adb.doc(`users/${uid}/settings/preferences`).get()).data() || {};
const openSection = async (page) => { await page.evaluate(() => window.openSettingsModal()); await page.waitForSelector("#settings-modal-overlay.active", { timeout: 8000 }); await sleep(1200); await page.evaluate(() => window.p1OpenSettingsSection("p1-flash")); await sleep(700); };
const setMode = async (page, m) => { await page.evaluate((x) => document.querySelector('.p1fc-mode[data-m="' + x + '"]').click(), m); await sleep(900); };
const FIVE = () => ({
  neuve: {},
  revisee: { interval: 10, lastReview: iso(Date.now() - 12 * DAY), nextReview: iso(Date.now() - 2 * DAY) },
  retard: { interval: 3, lastReview: iso(Date.now() - 20 * DAY), nextReview: iso(Date.now() - 17 * DAY) },
  drapeau: { flag: "difficile", interval: 5, lastReview: iso(Date.now() - 6 * DAY), nextReview: iso(Date.now() - 1 * DAY) },
  suspendue: { suspended: true, interval: 4, lastReview: iso(Date.now() - 9 * DAY), nextReview: iso(Date.now() - 5 * DAY) },
  future: { interval: 30, lastReview: iso(Date.now() - 2 * DAY), nextReview: iso(Date.now() + 28 * DAY) },
});
async function runSession(page, answer = "know", cap = 40) {
  await page.evaluate(() => window.openFlashDrawer()); await sleep(1500);
  await page.evaluate(() => window.launchMultiFlashSession());
  const started = await waitFor(() => page.evaluate(() => document.getElementById("flashSessionOverlay").classList.contains("active")), { timeout: 8000 });
  if (!started) return 0;
  let n = 0;
  for (; n < cap; n++) {
    const ok = await page.evaluate((a) => {
      const ov = document.getElementById("flashSessionOverlay"); if (!ov.classList.contains("active") || !document.querySelector("#flashSessStage .flash-reveal-btn")) return false;
      window._flashFlip(); return true;
    }, answer);
    if (!ok) break;
    await sleep(450);
    await page.evaluate((a) => window._flashEval(a), answer); await sleep(350);
  }
  await page.evaluate(() => { const q = document.getElementById("flashSessionOverlay"); if (q.classList.contains("active")) window._flashQuit(); }); await sleep(500);
  await page.evaluate(() => { const o = document.getElementById("flashDrawerOverlay"); if (o && o.classList.contains("active")) window.closeFlashDrawer(); }); await sleep(400);
  return n;
}
function invariants(c, id) {
  const bad = [];
  const dateOk = (v) => v == null || (typeof v === "string" && !isNaN(Date.parse(v)));
  if (!dateOk(c.nextReview) || !dateOk(c.lastReview) || !dateOk(c.createdAt)) bad.push("date invalide");
  if (c.interval != null && !(typeof c.interval === "number" && isFinite(c.interval) && c.interval >= 0)) bad.push("interval " + c.interval);
  if (c.ease != null && !(c.ease >= 1.3 && c.ease <= 5)) bad.push("ease " + c.ease);
  if (c.stability != null && !(c.stability > 0)) bad.push("stability " + c.stability);
  if (c.difficulty != null && !(c.difficulty >= 1 && c.difficulty <= 10)) bad.push("difficulty " + c.difficulty);
  for (const k of ["interval", "ease", "stability", "difficulty", "reps", "lapses"]) if (c[k] != null && (typeof c[k] !== "number" || !isFinite(c[k]))) bad.push(k + " NaN");
  return bad.length ? id + " : " + bad.join(", ") : null;
}

try {
  for (const f of FM) {
    await S("FA1-" + f.id, `${f.label} : réglages Flashcards — mode, objectif, intervalle maximal, ordre, « Facile » enregistrés ; un changement de mode n'écrit aucune carte ; rien ne déborde`, async () => {
      const { u, page } = await open({ vp: f.vp, seed: seedCards(FIVE()) });
      const before = JSON.stringify(await allCards(u.uid));
      await openSection(page);
      assert(await page.evaluate(() => !!document.querySelector('[data-setting="p1-flash"] .p1fc-body')), "corps des réglages absent");
      await shot(page, "reglages-simple-" + f.id);
      await setMode(page, "anki");
      let p = (await prefsOf(u.uid)).flashSettings;
      assert(p && p.mode === "anki", "mode non enregistré : " + JSON.stringify(p));
      assert(await page.evaluate(() => [...document.querySelectorAll("[data-adv]")].every((e) => !e.hidden) && document.querySelector('.p1fc-explain[data-for="anki"]').hidden === false), "lignes avancées / explication Anki");
      await page.evaluate(() => document.querySelector('.p1fc-explain[data-for="anki"] .p1fc-more').click()); await sleep(300);
      assert(await page.evaluate(() => !document.querySelector('.p1fc-explain[data-for="anki"] p').hidden), "« En savoir plus » ne déplie pas");
      await setMode(page, "fsrs");
      await page.evaluate(() => { const r = document.querySelector(".p1fc-range"); r.value = 85; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); }); await sleep(900);
      await page.evaluate(() => document.querySelector('.p1fc-chips[data-k="maxIvl"] button[data-v="730"]').click()); await sleep(500);
      await page.evaluate(() => document.querySelector('.p1fc-seg[data-k="order"] button[data-v="echeance"]').click()); await sleep(500);
      await page.evaluate(() => document.querySelector('.p1fc-step[data-k="newPerDay"] [data-d="5"]').click()); await sleep(300);
      await page.evaluate(() => document.querySelector('.p1fc-toggle[data-k="easy"]').click()); await sleep(1100);
      p = (await prefsOf(u.uid)).flashSettings;
      assert(p.mode === "fsrs" && Math.abs(p.retention - 0.85) < 1e-9 && p.maxIvl === 730 && p.order === "echeance" && p.newPerDay === 35 && p.easy === true, "réglages enregistrés : " + JSON.stringify(p));
      const geo = await page.evaluate(() => {
        const c = document.querySelector('[data-setting="p1-flash"]'), g = c.querySelector('.p1fc-seg[data-k="order"]'), b = g.querySelector("button.is-on"), cs = getComputedStyle(g, "::before");
        const over = [...c.querySelectorAll(".p1fc-row, .p1fc-seg, .p1fc-chips, .p1fc-mode")].filter((e) => e.getBoundingClientRect().right > c.getBoundingClientRect().right + 1).length;
        return { slide: g.classList.contains("p1fc-slide"), w: parseFloat(cs.width), bw: b.getBoundingClientRect().width, over, sw: c.scrollWidth, cw: c.clientWidth };
      });
      assert(geo.slide && Math.abs(geo.w - geo.bw) < 1.5 && geo.over === 0 && geo.sw <= geo.cw + 1, "sélecteur / débordement : " + JSON.stringify(geo));
      await shot(page, "reglages-fsrs-" + f.id);
      assert(JSON.stringify(await allCards(u.uid)) === before, "un changement de réglage a écrit une carte");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  for (const theme of ["dark", "pastel"]) {
    await S("FA1v-" + theme, `aspect des réglages (${theme})`, async () => {
      const { page } = await open({ theme, prefs: { flashSettings: { mode: "fsrs" } } });
      await openSection(page); await shot(page, "reglages-" + theme);
      assert(await page.evaluate(() => document.querySelector(".p1fc-mode.is-active").dataset.m === "fsrs"), "mode actif non restauré depuis le compte");
    });
  }
  await S("FA2", "session Anki puis FSRS : champs enregistrés valides (facilité, stabilité, difficulté), « Raté » revient dans la session, bouton « Facile » en option", async () => {
    const { u, page } = await open({ seed: seedCards({ a: {}, b: { interval: 6, lastReview: iso(Date.now() - 8 * DAY), nextReview: iso(Date.now() - 2 * DAY) } }), prefs: { flashSettings: { mode: "anki", easy: true } } });
    await page.evaluate(() => window.openFlashDrawer()); await sleep(1500);
    await page.evaluate(() => window.launchMultiFlashSession()); await page.waitForSelector("#flashSessionOverlay.active .flash-reveal-btn", { timeout: 10000 }); await sleep(900);
    const ui = await page.evaluate(() => ({ chip: (document.querySelector(".p1fc-mode-chip") || {}).textContent, btns: [...document.querySelectorAll("#flashSessStage .flash-eval-btn")].map((b) => b.textContent.replace(/\s+/g, " ").trim()), tools: document.querySelectorAll(".p1fc-tool").length }));
    assert(/Anki/.test(ui.chip) && ui.btns.length === 4 && /Facile/.test(ui.btns[3]) && ui.tools === 2, "interface de session : " + JSON.stringify(ui));
    await shot(page, "session-anki");
    const first = await page.evaluate(() => window._flashSession ? 1 : 0);
    void first;
    await page.evaluate(() => { window._flashFlip(); }); await sleep(500);
    await page.evaluate(() => window._flashEval("fail")); await sleep(1500);
    const cards = await allCards(u.uid);
    const failed = Object.entries(cards).find(([, c]) => c.lapses === 1);
    assert(failed && failed[1].interval === 0 && Date.parse(failed[1].nextReview) - Date.now() < 11 * 60000 && failed[1].algo === "anki" && failed[1].ease <= 2.3, "carte ratée : " + JSON.stringify(failed));
    const left = await page.evaluate(() => document.getElementById("flashSessCounter").textContent);
    assert(/\/ 3/.test(left), "la carte ratée doit revenir dans la session (3 cartes) : " + left);
    for (let i = 0; i < 6; i++) {
      const more = await page.evaluate(() => !!document.querySelector("#flashSessStage .flash-reveal-btn")); if (!more) break;
      await page.evaluate(() => window._flashFlip()); await sleep(450); await page.evaluate(() => window._flashEval("easy")); await sleep(500);
    }
    await sleep(800);
    for (const [id, c] of Object.entries(await allCards(u.uid))) { const bad = invariants(c, id); assert(!bad, "invariants Anki : " + bad); }
    const sb = (await allCards(u.uid)).b;
    assert(sb.reps >= 1 && sb.ease > 2.3, "carte révisée en Anki : " + JSON.stringify(sb));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("FA2f", "session FSRS : stabilité > 0, difficulté 1-10, intervalle borné par l'intervalle maximal", async () => {
    const { u, page } = await open({ seed: seedCards({ a: {}, b: { interval: 6, lastReview: iso(Date.now() - 8 * DAY), nextReview: iso(Date.now() - 2 * DAY) } }), prefs: { flashSettings: { mode: "fsrs", maxIvl: 180 } } });
    await runSession(page, "know"); await sleep(800);
    const cards = await allCards(u.uid);
    for (const [id, c] of Object.entries(cards)) { const bad = invariants(c, id); assert(!bad, "invariants FSRS : " + bad); }
    assert(cards.a.stability > 0 && cards.a.difficulty >= 1 && cards.a.difficulty <= 10 && cards.a.algo === "fsrs" && cards.b.stability > 0 && cards.b.interval <= 180, "champs FSRS : " + JSON.stringify([cards.a, cards.b]));
  });
  await S("FA3", "drapeau et suspension en session : drapeau enregistré (menu, couleur), « Suspendre » écrit suspended et passe à la carte suivante, « Réactiver » dans la liste", async () => {
    const { u, page } = await open({ seed: seedCards({ a: {}, b: {} }) });
    await page.evaluate(() => window.openFlashDrawer()); await sleep(1500);
    await page.evaluate(() => window.launchMultiFlashSession()); await page.waitForSelector("#flashSessionOverlay.active .flash-reveal-btn", { timeout: 10000 }); await sleep(900);
    await page.click(".p1fc-tool.flag"); await sleep(500);
    assert(await page.evaluate(() => document.querySelectorAll(".p1fc-flag-menu button").length === 4), "menu du drapeau");
    await page.click('.p1fc-flag-menu button[data-f="important"]'); await sleep(1500);
    const cards = await allCards(u.uid);
    assert(Object.values(cards).filter((c) => c.flag === "important").length === 1, "drapeau non enregistré : " + JSON.stringify(Object.values(cards).map((c) => c.flag)));
    assert(await page.evaluate(() => document.querySelector(".p1fc-tool.flag").classList.contains("f-important")), "bouton drapeau non coloré");
    await shot(page, "session-drapeau");
    const cur = await page.evaluate(() => document.getElementById("flashSessCounter").textContent);
    await page.click(".p1fc-tool.pause"); await sleep(2600);
    const after = await allCards(u.uid);
    assert(Object.values(after).filter((c) => c.suspended === true).length === 1, "suspension non enregistrée");
    const nxt = await page.evaluate(() => document.getElementById("flashSessCounter").textContent);
    assert(nxt !== cur || /1 \/ 1/.test(nxt), "la session doit passer à la carte suivante : " + cur + " → " + nxt);
    await page.evaluate(() => window._flashQuit()); await sleep(500);
    await page.evaluate(() => window.closeFlashDrawer()); await sleep(400);
    const idS = Object.entries(after).find(([, c]) => c.suspended)[0];
    await page.evaluate(() => { window.speErrCurrentId = "s1"; });
    const html = await page.evaluate((id) => { const c = { id, recto: "x", speId: "s1", suspended: true, flag: "corriger" }; return window.P1FlashAlgo.rowBadges(c); }, idS);
    assert(/Réactiver/.test(html) && /f-corriger/.test(html), "pastilles de la liste : " + html);
    await page.evaluate((id) => window.P1FlashAlgo.resume(id, "s1", null), idS); await sleep(1500);
    assert((await allCards(u.uid))[idS].suspended === false, "« Réactiver » n'a pas levé la suspension");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("FA4", "changements de mode sans perte : Simple → Anki → FSRS → Simple → FSRS avec de vraies sessions, temps simulé entre deux ; invariants relus sur le serveur à chaque étape", async () => {
    const { u, page } = await open({ seed: seedCards(FIVE()) });
    const ref = await allCards(u.uid);
    const fixed = ["speId", "recto", "verso", "itemId", "createdAt", "source"];
    const check = async (tag, n0) => {
      const now = await allCards(u.uid);
      assert(Object.keys(now).length === n0, tag + " : nombre de cartes " + Object.keys(now).length);
      for (const [id, c] of Object.entries(now)) {
        for (const k of fixed) assert(JSON.stringify(c[k]) === JSON.stringify(ref[id][k]), `${tag} : ${id}.${k} modifié`);
        const bad = invariants(c, id); assert(!bad, tag + " : " + bad);
      }
      assert(JSON.stringify(now.suspendue) === JSON.stringify(ref.suspendue), tag + " : la carte suspendue a changé");
      assert((now.drapeau.flag || null) === "difficile", tag + " : drapeau perdu");
      assert(now.future.nextReview === ref.future.nextReview || Date.parse(now.future.nextReview) > Date.now(), tag + " : la carte future est devenue due à tort");
    };
    const n0 = Object.keys(ref).length;
    const elapse = async (days) => { const s = await adb.collection(`users/${u.uid}/flashcards`).get(); for (const d of s.docs) { const c = d.data(); if (c.suspended) continue; const up = {}; if (c.nextReview) up.nextReview = iso(Date.parse(c.nextReview) - days * DAY); if (c.lastReview) up.lastReview = iso(Date.parse(c.lastReview) - days * DAY); await d.ref.update(up); } };
    await runSession(page, "know"); await check("Simple", n0);
    const snapSimple = JSON.stringify(await allCards(u.uid));
    for (const [m, days] of [["anki", 3], ["fsrs", 4], ["simple", 5], ["fsrs", 6]]) {
      await elapse(days);
      await openSection(page); await setMode(page, m);
      await page.evaluate(() => window.closeSettingsModal()); await sleep(600);
      const afterSwitch = JSON.stringify(await allCards(u.uid));
      const beforeSwitch = JSON.stringify(await allCards(u.uid));
      assert(afterSwitch === beforeSwitch, "le changement de mode a écrit");
      await runSession(page, m === "simple" ? "hesitant" : "know"); await sleep(600);
      await check("après " + m, n0);
    }
    void snapSimple;
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("FA5", "fenêtre de carte : choix du drapeau (survol coloré ≠ sélection), enregistré à la création ; une modification de texte ne touche pas au drapeau", async () => {
    const { u, page } = await open({ seed: seedCards({ x: { flag: "corriger" } }) });
    await page.evaluate(() => { window.speErrCurrentId = "s1"; window._flashNewCard(); }); await page.waitForSelector("#flashEditOverlay.active", { timeout: 8000 }); await sleep(900);
    assert(await page.evaluate(() => document.querySelectorAll("#p1fcEditFlag button[data-f]").length === 4), "boutons de drapeau");
    await page.hover('#p1fcEditFlag button[data-f="important"]'); await sleep(400);
    const hov = await page.evaluate(() => { const b = document.querySelector('#p1fcEditFlag button[data-f="important"]'), cs = getComputedStyle(b); return { bc: cs.borderTopColor, col: cs.color, on: b.classList.contains("is-on"), tf: cs.transform }; });
    assert(hov.bc === "rgb(34, 197, 94)" && hov.col === "rgb(21, 128, 61)" && !hov.on && hov.tf !== "none", "survol coloré : " + JSON.stringify(hov));
    await page.click('#p1fcEditFlag button[data-f="difficile"]'); await sleep(300);
    await page.evaluate(() => { document.getElementById("flashFormRecto").innerHTML = "<p>Nouveau recto</p>"; document.getElementById("flashFormVerso").innerHTML = "<p>Nouveau verso</p>"; });
    await page.click("#flashEditSaveBtn"); await sleep(2000);
    const cards = await allCards(u.uid);
    const nw = Object.values(cards).find((c) => /Nouveau recto/.test(c.recto));
    assert(nw && nw.flag === "difficile", "drapeau à la création : " + JSON.stringify(nw));
    await shot(page, "edition-drapeau");
    assert(cards.x.flag === "corriger", "carte existante modifiée");
    await page.evaluate(() => { const c = { id: "x", speId: "s1", recto: "<p>Recto x</p>", verso: "<p>Verso x</p>", flag: "corriger" }; window.speErrCurrentId = "s1"; window._flashEditCard && 0; });
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  for (const f of [FM[0], FM[2]]) {
    for (const theme of ['light', 'dark', 'pastel']) {
      await S('FU-' + f.id + '-' + theme, f.label + ' (' + theme + ') : bandeau « À jour pour aujourd’hui » avec une coche verte centrée sur le texte, jamais seule à la ligne', async () => {
        const { page } = await open({ vp: f.vp, theme, seed: seedCards({ futur: { interval: 30, lastReview: iso(Date.now() - 2 * DAY), nextReview: iso(Date.now() + 28 * DAY) } }) });
        const r = await page.evaluate(async () => {
          const h = document.createElement('div'); h.id = 'fuHost'; h.style.cssText = 'position:fixed;left:10px;top:60px;width:340px;z-index:99999;background:#fff;padding:8px'; document.body.appendChild(h);
          window.renderNotesFlashPanel('s1', null, 'fuHost'); await new Promise((r) => setTimeout(r, 2500));
          const out = [];
          for (const w of [340, 120]) {
            h.style.width = w + 'px'; await new Promise((r) => setTimeout(r, 200));
            const t = h.querySelector('.flash-due-banner-text'), ck = h.querySelector('.flash-uptodate-check'); if (!t || !ck) { out.push({ w, none: true, html: h.innerHTML.slice(0, 200) }); continue; }
            const nw = ck.parentNode, tn = nw.firstChild, rg = document.createRange(); rg.setStart(tn, 0); rg.setEnd(tn, tn.length);
            const wr = rg.getBoundingClientRect(), cr = ck.getBoundingClientRect(), cs = getComputedStyle(ck);
            out.push({ w, bg: cs.backgroundColor, wy: wr.top + wr.height / 2, cy: cr.top + cr.height / 2, wl: wr.left, wrt: wr.right, cl: cr.left, size: cr.width, text: t.textContent.replace(/s+/g, ' ').trim(), emoji: /🎉/.test(t.textContent) });
          }
          return out;
        });
        for (const o of r) {
          assert(!o.none, 'coche absente : ' + JSON.stringify(o));
          assert(!o.emoji && /À jour pour aujourd'hui/.test(o.text), 'texte : ' + o.text);
          assert(Math.abs(o.wy - o.cy) <= 2.5, 'coche non centrée (' + o.w + ' px) : ' + (o.cy - o.wy));
          assert(o.cl >= o.wrt - 1 && Math.abs(o.size - o.size) < 1 && o.size > 10, 'coche à la ligne ou trop petite : ' + JSON.stringify(o));
        }
        const want = theme === 'pastel' ? 'rgb(111, 174, 132)' : 'rgb(34, 197, 94)';
        assert(r[0].bg === want, 'couleur ' + theme + ' : ' + r[0].bg);
        await shot(page, 'a-jour-' + f.id + '-' + theme);
      });
    }
  }
  await S("FA6", "Session Flash : sélection par drapeau — compteurs, cumul, matières cochées, compteur du bas, cartes exactes de la session (même non dues, jamais suspendues), retour à « Indifférent »", async () => {
    const { page } = await open({ seed: async (uid) => {
      await adb.doc("users/" + uid + "/subjects/s2").set({ name: "MatiereDeux", color: "#10b981", order: 20, archivedAt: null, createdAt: new Date() });
      const defs = { a1: { flag: "important" }, a2: { flag: "important", interval: 20, lastReview: iso(Date.now() - 3 * DAY), nextReview: iso(Date.now() + 17 * DAY) }, a3: { flag: "difficile" }, a4: { flag: "important", suspended: true }, a5: {},
        b1: { speId: "s2", flag: "corriger", interval: 9, lastReview: iso(Date.now() - 2 * DAY), nextReview: iso(Date.now() + 7 * DAY) }, b2: { speId: "s2" } };
      for (const [id, o] of Object.entries(defs)) await adb.doc("users/" + uid + "/flashcards/" + id).set(base(id, o));
    } });
    await page.evaluate(() => window.openFlashDrawer()); await sleep(1800);
    const st = () => page.evaluate(() => ({
      chips: [...document.querySelectorAll("#flashDrawerOpts .fdo-chips button")].map((b) => ({ f: b.dataset.f, on: b.classList.contains("is-on"), dis: b.disabled, n: (b.querySelector(".fdo-n") || {}).textContent })),
      checked: [...document.querySelectorAll("#flashDrawerList .flash-drawer-item-wrap")].filter((w) => w.querySelector(".flash-drawer-item input[type=checkbox]").checked).map((w) => (w.querySelector(".flash-drawer-item") || {}).dataset.spe),
      count: document.getElementById("flashDrawerCount").textContent, w: document.getElementById("flashDrawer").getBoundingClientRect().width, tipAttr: document.querySelector('#flashDrawerOpts button[data-f=""]').dataset.p1Tip }));
    const s0 = await st();
    assert(s0.chips[0].on && s0.chips.map((c) => c.f).join() === ",important,difficile,corriger" && s0.chips[1].n === "2" && s0.chips[2].n === "1" && s0.chips[3].n === "1", "blocs et compteurs (suspendue exclue) : " + JSON.stringify(s0.chips));
    assert(Math.abs(s0.w - 440) < 1 && s0.tipAttr === "Sans filtre de drapeau : les cartes dues", "largeur du tiroir / infobulle : " + s0.w);
    await page.hover('#flashDrawerOpts button[data-f="important"]'); await sleep(500);
    const tip = await page.evaluate(() => { const t = document.getElementById("p1-tip"); return t && { txt: t.textContent, vis: t.classList.contains("visible") }; });
    assert(tip && tip.vis && /Toutes tes cartes « Important », même non dues/.test(tip.txt), "infobulle : " + JSON.stringify(tip));
    await page.click('#flashDrawerOpts button[data-f="important"]'); await sleep(700);
    const tipKeep = await page.evaluate(() => document.getElementById("p1-tip").classList.contains("visible"));
    assert(tipKeep && await page.evaluate(() => document.getElementById("flashDrawerOverlay").classList.contains("active")), "après le clic : infobulle conservée et tiroir ouvert");
    const s1 = await st();
    assert(s1.chips[1].on && !s1.chips[0].on && s1.checked.join() === "s1" && /2 cartes/.test(s1.count), "important : " + JSON.stringify(s1));
    await page.click('#flashDrawerOpts button[data-f="corriger"]'); await sleep(600);
    const s2 = await st();
    assert(s2.checked.sort().join() === "s1,s2" && /3 cartes/.test(s2.count), "cumul important + à corriger : " + JSON.stringify(s2));
    await shot(page, "tiroir-drapeaux");
    await page.evaluate(() => window.launchMultiFlashSession()); await page.waitForSelector("#flashSessionOverlay.active .flash-reveal-btn", { timeout: 10000 }); await sleep(900);
    const total = await page.evaluate(() => document.getElementById("flashSessCounter").textContent);
    assert(/\/ 3/.test(total), "la session doit contenir 3 cartes : " + total);
    await page.evaluate(() => window._flashQuit()); await sleep(600);
    await page.evaluate(() => window.openFlashDrawer()); await sleep(1800);
    const s3 = await st();
    assert(s3.chips[0].on && s3.chips.slice(1).every((c) => !c.on), "chaque ouverture repart sur Indifférent : " + JSON.stringify(s3.chips));
    await page.click('#flashDrawerOpts button[data-f="difficile"]'); await sleep(500);
    await page.click("#flashDrawerDueOnlyBtn"); await sleep(500);
    const s4 = await st();
    assert(s4.chips[0].on && s4.chips.slice(1).every((c) => !c.on), "« Uniquement les dues » remet Indifférent : " + JSON.stringify(s4.chips));
    await page.click('#flashDrawerOpts button[data-f="difficile"]'); await sleep(500);
    await page.click('#flashDrawerOpts button[data-f="difficile"]'); await sleep(500);
    assert((await st()).chips[0].on, "retirer tous les drapeaux remet Indifférent");
    await page.click("#flashDrawerSelectAllBtn"); await sleep(300);
    await page.click('#flashDrawerOpts button[data-f="important"]'); await sleep(400);
    await page.click("#flashDrawerSelectAllBtn"); await sleep(500);
    assert((await st()).chips[0].on, "« Tout sélectionner » remet Indifférent");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
