/* Méthode Pomodoro (27/10/2026) : case dans « Ma journée de travail », grande fenêtre, frise, « Passer », maintien sur les − / +, fins de période, plein écran,
   robustesse (2 onglets, rechargement), données du compte inchangées, aide, Nouveautés (sans notification), icônes des titres des fenêtres « Temps de travail » / « Entraînements du jour ».
   Vraie page + émulateurs. Le minuteur est LOCAL (localStorage « p1_pomo_v1 »).
   Lancer : node test/e2e/pomodoro.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; POMOSHOTS=1 pour les captures) */
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
const FORMATS = [
  { id: "PCclair", label: "PC clair", vp: { width: 1366, height: 900 }, theme: "light" },
  { id: "PCsombre", label: "PC sombre", vp: { width: 1366, height: 900 }, theme: "dark" },
  { id: "iPad", label: "iPad 820", vp: M(820, 1180), theme: "light" },
  { id: "tel", label: "téléphone debout 390", vp: M(390, 844), theme: "light" },
  { id: "telCouche", label: "téléphone couché 844×390", vp: M(844, 390), theme: "dark" },
];
const shot = async (page, name) => { if (process.env.POMOSHOTS) await page.screenshot({ path: `docs/captures-15-10/${name}.png` }); };
const clean = async (page) => { await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {}); await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden"); }).catch(() => {}); };

async function open(f, { prefs = {} } = {}) {
  const u = await mkUser({ courses: 1 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...prefs }, { merge: true });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.setViewport(f.vp); await sleep(f.vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await clean(page);
  if (f.theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), f.theme); await sleep(400); }
  await page.evaluate(() => { try { localStorage.removeItem("p1_pomo_v1"); } catch (e) {} document.querySelector('[data-page="stats"]').click(); });
  await page.waitForSelector("#p1PomoCard", { timeout: 20000 }); await sleep(1200);
  return { u, page, ctx: ctx.ctx };
}
const st = (page) => page.evaluate(() => window.p1Pomodoro.state());
/* modifie l'état local (comme le ferait le temps qui passe / un autre onglet) puis demande au minuteur de le relire */
const setState = async (page, fn) => {
  await page.evaluate((src) => { const s = JSON.parse(localStorage.getItem("p1_pomo_v1") || "null") || window.p1Pomodoro.state(); (new Function("s", "now", src))(s, Date.now()); localStorage.setItem("p1_pomo_v1", JSON.stringify(s)); document.dispatchEvent(new Event("visibilitychange")); }, fn);
  await sleep(750);
};
const openModal = async (page) => { await page.evaluate(() => window.p1Pomodoro.open()); await page.waitForSelector("#p1PomoOverlay.active", { timeout: 8000 }); await sleep(500); };
const closeModal = async (page) => { await page.evaluate(() => document.getElementById("p1PomoDone").click()); await sleep(450); };
const R = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; }, sel);

try {
  /* ═════════ PM1 : la case ═════════ */
  for (const f of FORMATS) {
    await S("PM1-" + f.id, `case (${f.label}) : juste après « Flammes », « Méthode Pomodoro », 25:00, « Prêt », rien ne déborde ; « + » lance sans ouvrir la fenêtre ; la barre se vide (≈ 50 % à mi-parcours)`, async () => {
      const { page } = await open(f);
      const c = await page.evaluate(() => {
        const card = document.getElementById("p1PomoCard"), prev = card.previousElementSibling, r = card.getBoundingClientRect(), grid = card.parentElement.getBoundingClientRect();
        const kids = [...card.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1) && getComputedStyle(e).position !== "absolute"; }).length;
        return { prev: prev && prev.id, label: card.querySelector(".daily-stat-label").textContent.trim(), val: document.getElementById("p1PomoCardVal").textContent, tag: document.getElementById("p1PomoCardTag").textContent.trim(), over: card.scrollWidth > card.clientWidth + 1 || kids > 0, inGrid: r.right <= grid.right + 1 && r.left >= grid.left - 1, pageOver: document.documentElement.scrollWidth > innerWidth + 1, sub: !!card.querySelector(".p1-pomo-sub"), h: r.height, hs: [...card.parentElement.children].map((e) => Math.round(e.getBoundingClientRect().height)) };
      });
      assert(c.prev === "p1StreakCard", "place : après « " + c.prev + " » au lieu de « Flammes »");
      assert(c.label === "Méthode Pomodoro" && c.val === "25:00" && /Prêt/.test(c.tag), JSON.stringify(c));
      assert(!c.over && c.inGrid && !c.pageOver, "la case déborde : " + JSON.stringify(c));
      assert(!c.sub, "ligne d'explication sous la pastille");
      await page.evaluate(() => document.getElementById("p1PomoCard").scrollIntoView({ block: "center", behavior: "instant" })); await sleep(500); await shot(page, `pomodoro-case-${f.id}`);
      // « + » : lance sans ouvrir la fenêtre
      await page.evaluate(() => document.getElementById("p1PomoCardBtn").click()); await sleep(1500);
      const a = await page.evaluate(() => ({ open: document.getElementById("p1PomoOverlay").classList.contains("active"), val: document.getElementById("p1PomoCardVal").textContent, tag: document.getElementById("p1PomoCardTag").textContent.trim(), bar: parseFloat(document.getElementById("p1PomoCardBar").style.width), ic: document.getElementById("p1PomoCardBtn").getAttribute("data-ic") }));
      assert(!a.open, "la fenêtre s'est ouverte");
      assert(a.val !== "25:00" && /^24:/.test(a.val) && /Concentration 1\/4/.test(a.tag) && a.ic === "fa-pause", "pas lancé : " + JSON.stringify(a));
      assert(a.bar > 90 && a.bar <= 100, "barre au départ : " + a.bar);
      // mi-parcours : la barre se vide
      await setState(page, "s.endsAt = now + s.total / 2;");
      const mid = await page.evaluate(() => parseFloat(document.getElementById("p1PomoCardBar").style.width));
      assert(mid > 45 && mid < 55, "barre à mi-parcours : " + mid + " %");
      // pause / reprise par le « + »
      await page.evaluate(() => document.getElementById("p1PomoCardBtn").click()); await sleep(600);
      assert((await st(page)).running === false, "le « + » ne met pas en pause");
      await page.evaluate(() => document.getElementById("p1PomoCardBtn").click()); await sleep(600);
      assert((await st(page)).running === true, "le « + » ne reprend pas");
      await page.evaluate(() => document.getElementById("p1PomoCard").click()); await sleep(600);
      assert(await page.evaluate(() => document.getElementById("p1PomoOverlay").classList.contains("active")), "un clic sur la case n'ouvre pas la fenêtre");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ PM2 : la fenêtre ═════════ */
  for (const f of FORMATS) {
    await S("PM2-" + f.id, `fenêtre (${f.label}) : colonnes, Sonnerie sous Chronomètre, sonneries et formules sur une ligne, tuiles de 32 px, rien ne dépasse, pied fixe, gouttière réservée`, async () => {
      const { page } = await open(f);
      await openModal(page);
      await shot(page, `pomodoro-fenetre-${f.id}`);
      const w = f.vp.width, h = f.vp.height;
      const m = await page.evaluate(() => {
        const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const body = document.getElementById("p1PomoBody"), modal = document.getElementById("p1PomoModal"), foot = document.querySelector(".p1-pomo-foot");
        const A = document.querySelector(".p1-pomo-col-a"), B = document.querySelector(".p1-pomo-col-b");
        const boxes = [...document.querySelectorAll(".p1-pomo-box")];
        const row = (id) => { const k = [...document.getElementById(id).children].map((e) => r(e)); return { n: k.length, spread: Math.max(...k.map((x) => x.t)) - Math.min(...k.map((x) => x.t)), right: Math.max(...k.map((x) => x.r)), cr: r(document.getElementById(id)).r }; };
        return { A: r(A), B: r(B), modal: r(modal), foot: r(foot), body: r(body), timer: r(document.querySelector(".p1-pomo-timer")), sound: r(document.getElementById("p1PomoSoundT").closest(".p1-pomo-box")),
          tones: row("p1PomoToneChips"), presets: row("p1PomoPresets"), gutter: getComputedStyle(body).scrollbarGutter, overflowY: getComputedStyle(body).overflowY,
          tiles: [...document.querySelectorAll(".p1-pomo-sec > i")].map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }),
          boxOver: boxes.some((b) => b.scrollWidth > b.clientWidth + 1), bodyOver: body.scrollWidth > body.clientWidth + 1, pageOver: document.documentElement.scrollWidth > innerWidth + 1,
          modalInVp: modal.getBoundingClientRect().right <= innerWidth + 1 && modal.getBoundingClientRect().bottom <= innerHeight + 1, vw: innerWidth, vh: innerHeight, bodyScrollable: body.scrollHeight > body.clientHeight + 1 };
      });
      assert(m.gutter === "stable" && m.overflowY === "auto", "gouttière : " + m.gutter + " / " + m.overflowY);
      assert(m.tiles.length >= 4 && m.tiles.every((t) => t[0] === 32 && t[1] === 32), "tuiles des titres : " + JSON.stringify(m.tiles));
      assert(!m.boxOver && !m.bodyOver && !m.pageOver && m.modalInVp, "ça dépasse : " + JSON.stringify({ box: m.boxOver, body: m.bodyOver, page: m.pageOver, inVp: m.modalInVp }));
      assert(m.tones.n === 5 && m.tones.spread <= 2 && m.tones.right <= m.tones.cr + 1, "sonneries sur plusieurs lignes : " + JSON.stringify(m.tones));
      assert(m.presets.n === 4 && m.presets.spread <= 2 && m.presets.right <= m.presets.cr + 1, "formules rapides sur plusieurs lignes : " + JSON.stringify(m.presets));
      assert(m.sound.t >= m.timer.b - 1, "« Sonnerie » n'est pas sous « Chronomètre »");
      assert(Math.abs(m.foot.b - m.modal.b) <= 1 && m.foot.t > m.body.b - 1, "pied non fixe en bas de la fenêtre");
      if (w > 860 && !(h <= 520)) {
        assert(m.B.l >= m.A.r - 1 && Math.abs(m.A.t - m.B.t) <= 2, "pas deux colonnes");
        assert(Math.abs(m.A.b - m.B.b) <= 3, `les colonnes ne finissent pas au même niveau : ${Math.round(m.A.b)} / ${Math.round(m.B.b)}`);
      } else { assert(m.B.t >= m.A.b - 1, "une seule colonne attendue"); }
      if (w <= 560) assert(Math.abs(m.modal.w - m.vw) <= 1 && Math.abs(m.modal.h - m.vh) <= 1, "pas en plein écran sous 560 px : " + JSON.stringify(m.modal));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ PM3 : frise ═════════ */
  await S("PM3a", "frise d'une séance de 4 : CpCpCpC, largeurs proportionnelles aux durées, minutes sans unité, repère au bout de la case en cours (±2 px)", async () => {
    const { page } = await open(FORMATS[0]);
    await page.evaluate(() => { const s = window.p1Pomodoro.state(); s.cfg.goal = 4; s.cfg.focus = 25; s.cfg.brk = 5; s.cfg.longOn = true; s.cfg.every = 4; localStorage.setItem("p1_pomo_v1", JSON.stringify(s)); document.dispatchEvent(new Event("visibilitychange")); });
    await sleep(700); await openModal(page);
    const idle = await page.evaluate(() => { const segs = [...document.querySelectorAll("#p1PomoTlBar .p1-pomo-tl-seg")]; return { pat: segs.map((s) => (s.classList.contains("is-brk") ? "p" : "C")).join(""), mins: segs.map((s) => s.textContent.trim()), w: segs.map((s) => s.getBoundingClientRect().width), g: segs.map((s) => parseFloat(s.style.flexGrow)) }; });
    assert(idle.pat === "CpCpCpC", "motif : " + idle.pat);
    assert(idle.mins.every((t) => t === "" || /^\d+$/.test(t)), "minutes avec unité ou texte : " + JSON.stringify(idle.mins));
    for (let i = 0; i < idle.w.length; i++) assert(Math.abs(idle.w[i] / idle.g[i] - idle.w[0] / idle.g[0]) <= 0.08 * (idle.w[0] / idle.g[0]), `largeur non proportionnelle : ${idle.w.map((x) => Math.round(x))} / ${idle.g}`);
    // en cours : repère au bout de la case en cours
    await page.evaluate(() => document.getElementById("p1PomoMain").click()); await sleep(1500);
    const run = await page.evaluate(() => {
      const bar = document.getElementById("p1PomoTlBar"), cur = bar.querySelector(".is-cur"), mk = document.querySelector("#p1PomoTlTop .p1-pomo-tl-mk"); if (!cur || !mk) return null;
      const cr = cur.getBoundingClientRect(), ms = mk.getBoundingClientRect(), b = mk.querySelector("span").getBoundingClientRect();
      const tick = parseFloat(mk.style.left) / 100 * bar.getBoundingClientRect().width + bar.getBoundingClientRect().left;
      return { curW: cr.width, edge: cr.right, tick, cls: mk.className, txt: mk.textContent, curTxt: cur.textContent.trim() };
    });
    assert(run, "pas de case en cours / de repère");
    assert(Math.abs(run.tick - run.edge) <= 2, `repère à ${run.tick.toFixed(1)} px, bout de la case ${run.edge.toFixed(1)} px`);
    assert(/^Pause \d\d:\d\d$/.test(run.txt), "texte du repère : " + run.txt);
    assert(/^\d*$/.test(run.curTxt), "case en cours avec unité : " + run.curTxt);
    // pause : « En pause »
    await page.evaluate(() => document.getElementById("p1PomoMain").click()); await sleep(900);
    assert(/En pause/.test(await page.evaluate(() => document.querySelector("#p1PomoTlTop .p1-pomo-tl-mk").textContent)), "repère « En pause » absent");
    await shot(page, "pomodoro-frise-PCclair");
  });

  for (const f of [FORMATS[0], FORMATS[3], FORMATS[4]]) {
    await S("PM3b-" + f.id, `90 / 20 × 12 (${f.label}) : aucun nombre coupé, case en cours ≥ 38 px, « 1:30:00 » dans le cercle (fenêtre et plein écran)`, async () => {
      const { page } = await open(f);
      await page.evaluate(() => { const s = window.p1Pomodoro.state(); Object.assign(s.cfg, { focus: 90, brk: 20, goal: 12, longOn: false }); localStorage.setItem("p1_pomo_v1", JSON.stringify(s)); document.dispatchEvent(new Event("visibilitychange")); });
      await sleep(700); await openModal(page);
      await page.evaluate(() => document.getElementById("p1PomoMain").click()); await sleep(1500);
      const r = await page.evaluate(() => {
        const bar = document.getElementById("p1PomoTlBar"), segs = [...bar.querySelectorAll(".p1-pomo-tl-seg")], cur = bar.querySelector(".is-cur");
        const cut = segs.filter((s) => { const b = s.querySelector("b"); if (!b || !b.textContent.trim()) return false; const sr = s.getBoundingClientRect(), br = b.getBoundingClientRect(); return br.left < sr.left - 0.5 || br.right > sr.right + 0.5 || b.scrollWidth > b.clientWidth + 1; }).length;
        const ring = document.getElementById("p1PomoRing").getBoundingClientRect(), tm = document.getElementById("p1PomoTime").getBoundingClientRect();
        return { n: segs.length, cut, cur: cur.getBoundingClientRect().width, txt: document.getElementById("p1PomoTime").textContent, hours: document.getElementById("p1PomoRing").classList.contains("is-hours"), inRing: tm.left >= ring.left && tm.right <= ring.right && tm.top >= ring.top && tm.bottom <= ring.bottom, barOver: bar.scrollWidth > bar.clientWidth + 1, pageOver: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert(r.n === 23, "cases : " + r.n);
      assert(r.cut === 0, r.cut + " nombre(s) coupé(s)");
      assert(r.cur >= 37.5, "case en cours : " + r.cur.toFixed(1) + " px");
      assert(/^1:(29|30):\d\d$/.test(r.txt) && r.hours && r.inRing, "cercle : " + JSON.stringify(r));
      assert(!r.barOver && !r.pageOver, "ça dépasse : " + JSON.stringify(r));
      // plein écran
      await page.evaluate(() => document.getElementById("p1PomoZoom").click()); await sleep(900);
      const z = await page.evaluate(() => { const ring = document.getElementById("p1PomoRing").getBoundingClientRect(), tm = document.getElementById("p1PomoTime").getBoundingClientRect(); return { inRing: tm.left >= ring.left - 1 && tm.right <= ring.right + 1, txt: document.getElementById("p1PomoTime").textContent, zen: document.getElementById("p1PomoOverlay").classList.contains("is-zen") }; });
      assert(z.zen && /^1:/.test(z.txt) && z.inRing, "plein écran : " + JSON.stringify(z));
    });
  }

  /* ═════════ PM4 : « Passer » ═════════ */
  await S("PM4", "« Passer » : concentration 1 → pause → concentration 2 (pas de retour à la 1) → … → dernière → séance terminée ; statistiques du jour inchangées", async () => {
    const { page } = await open(FORMATS[0]);
    await page.evaluate(() => { const s = window.p1Pomodoro.state(); Object.assign(s.cfg, { goal: 3, auto: true, longOn: false }); localStorage.setItem("p1_pomo_v1", JSON.stringify(s)); document.dispatchEvent(new Event("visibilitychange")); });
    await sleep(700); await openModal(page);
    const snap = async () => { const s = await st(page); return `${s.phase}/${s.sess}/${s.stats.n}/${s.stats.min}`; };
    const tag = () => page.evaluate(() => document.getElementById("p1PomoPhase").textContent.trim());
    await page.evaluate(() => document.getElementById("p1PomoMain").click()); await sleep(500);
    const seq = [await snap()];
    const tags = [await tag()];
    for (let i = 0; i < 5; i++) { await page.evaluate(() => document.getElementById("p1PomoSkip").click()); await sleep(450); seq.push(await snap()); tags.push(await tag()); }
    // focus1 → pause (sess 1) → focus2 → pause (sess 2) → focus3 → idle (sess 0)
    const phases = seq.map((x) => x.split("/")[0]).join(">");
    assert(phases === "focus>break>focus>break>focus>idle", "enchaînement : " + phases + " (" + seq.join(" | ") + ")");
    assert(seq.map((x) => x.split("/")[1]).join(",") === "0,1,1,2,2,0", "séance : " + seq.join(" | "));
    assert(seq.every((x) => x.split("/")[2] === "0" && x.split("/")[3] === "0"), "statistiques du jour modifiées par « Passer » : " + seq.join(" | "));
    assert(/Concentration 2\/3/.test(tags[2]) && /Concentration 3\/3/.test(tags[4]) && tags[5] === "Prêt", "pastilles : " + tags.join(" | "));
    assert((await st(page)).running === false, "le minuteur tourne encore après la fin de séance");
  });

  /* ═════════ PM5 : maintien sur les − / + ═════════ */
  await S("PM5", "maintien appuyé sur « + » (1,3 s) : ≥ 25 min de plus puis arrêt au relâchement ; un clic ou Entrée = 1 pas ; butée de la pause à 1 min", async () => {
    const { page } = await open(FORMATS[0]);
    await openModal(page);
    const focus = async () => (await st(page)).cfg.focus, brk = async () => (await st(page)).cfg.brk;
    const ctr = async (id) => { const b = await R(page, "#" + id); return { x: b.l + b.w / 2, y: b.t + b.h / 2 }; };
    // maintien
    const f0 = await focus(); let c = await ctr("p1PomoFocusPlus");
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await sleep(1300); await page.mouse.up(); await sleep(150);
    const f1 = await focus(); await sleep(700); const f2 = await focus();
    assert(f1 - f0 >= 25, `maintien 1,3 s : +${f1 - f0} min (attendu ≥ 25)`);
    assert(f2 === f1, `le maintien continue après le relâchement : ${f1} → ${f2}`);
    // un clic = un pas
    await page.evaluate(() => { const s = window.p1Pomodoro.state(); s.cfg.focus = 25; localStorage.setItem("p1_pomo_v1", JSON.stringify(s)); document.dispatchEvent(new Event("visibilitychange")); }); await sleep(700);
    c = await ctr("p1PomoFocusPlus"); await page.mouse.click(c.x, c.y); await sleep(300);
    assert((await focus()) === 30, "un clic ≠ 1 pas : " + (await focus()));
    // Entrée = 1 pas
    await page.evaluate(() => document.getElementById("p1PomoFocusPlus").focus()); await page.keyboard.press("Enter"); await sleep(300);
    assert((await focus()) === 35, "Entrée ≠ 1 pas : " + (await focus()));
    // butée de la pause : 3 → 1 (désactivé), le maintien s'arrête
    await page.evaluate(() => { const s = window.p1Pomodoro.state(); s.cfg.brk = 4; localStorage.setItem("p1_pomo_v1", JSON.stringify(s)); document.dispatchEvent(new Event("visibilitychange")); }); await sleep(700);
    c = await ctr("p1PomoBreakMinus"); await page.mouse.move(c.x, c.y); await page.mouse.down(); await sleep(1200); const dis = await page.evaluate(() => document.getElementById("p1PomoBreakMinus").disabled); await page.mouse.up(); await sleep(500);
    assert((await brk()) === 1 && dis, "butée : pause " + (await brk()) + " min, bouton désactivé : " + dis);
    await sleep(500); assert((await brk()) === 1, "la pause descend sous 1 min");
  });

  /* ═════════ PM6 : fins de période ═════════ */
  await S("PM6", "fin de période (heure de fin dans le passé) : la sonnerie choisie est jouée, AUCUN appel à showToastNotification, l'annonce aria-live est là", async () => {
    const { page } = await open(FORMATS[0]);
    await page.evaluate(() => {
      window.__osc = []; window.__toasts = [];
      const AC = window.AudioContext || window.webkitAudioContext, o = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () { const x = o.apply(this, arguments); const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(x.frequency), "value"); x.__f = x.frequency; const st = x.start; x.start = function () { window.__osc.push(Math.round(x.frequency.value)); return st.apply(this, arguments); }; return x; };
      const t = window.showToastNotification; window.showToastNotification = function () { window.__toasts.push([].slice.call(arguments).join("|")); return t && t.apply(this, arguments); };
    });
    await openModal(page);
    await page.evaluate(() => { const s = window.p1Pomodoro.state(); Object.assign(s.cfg, { tone: "carillon", vol: 60, sound: true, goal: 4, auto: true }); localStorage.setItem("p1_pomo_v1", JSON.stringify(s)); document.dispatchEvent(new Event("visibilitychange")); }); await sleep(700);
    await page.evaluate(() => document.getElementById("p1PomoMain").click()); await sleep(600);
    await page.evaluate(() => { window.__osc.length = 0; });
    await setState(page, "s.endsAt = now - 800;");   // la concentration vient de se terminer
    await sleep(1200);
    const r = await page.evaluate(() => ({ osc: window.__osc.slice(), toasts: window.__toasts.slice(), live: document.getElementById("p1PomoLive").textContent, phase: window.p1Pomodoro.state().phase }));
    assert(r.phase === "break", "pas de passage en pause : " + r.phase);
    assert(r.osc.join(",") === "1568,1175,988,784", "sonnerie « Carillon » (pause) non jouée : " + JSON.stringify(r.osc));   // carillon descendant = fin de concentration
    assert(r.toasts.length === 0, "notification à l'écran : " + JSON.stringify(r.toasts));
    assert(/Concentration terminée : pause de 5 min/.test(r.live), "annonce aria-live : " + r.live);
    assert(await page.evaluate(() => document.getElementById("p1PomoLive").getAttribute("aria-live") === "polite"), "aria-live absent");
    // fin de pause : sonnerie montante, retour en concentration
    await page.evaluate(() => { window.__osc.length = 0; }); await setState(page, "s.endsAt = now - 800;"); await sleep(1200);
    const r2 = await page.evaluate(() => ({ osc: window.__osc.slice(), phase: window.p1Pomodoro.state().phase, live: document.getElementById("p1PomoLive").textContent }));
    assert(r2.phase === "focus" && r2.osc.join(",") === "784,988,1175,1568", "fin de pause : " + JSON.stringify(r2));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ PM7 : plein écran ═════════ */
  for (const f of FORMATS) {
    await S("PM7-" + f.id, `plein écran (${f.label}) : transition, seul le chronomètre, cercle rond et entier, pas de défilement${f.id === "telCouche" ? ", cercle à gauche / frise et boutons à droite" : ""} ; Échap réduit puis ferme`, async () => {
      const { page } = await open(f);
      await openModal(page);
      await page.evaluate(() => { window.__zen = []; const md = document.getElementById("p1PomoModal"); new MutationObserver(() => window.__zen.push([...md.classList].filter((c) => /zen/.test(c)).join(" "))).observe(md, { attributes: true, attributeFilter: ["class"] }); });
      await page.evaluate(() => document.getElementById("p1PomoZoom").click()); await sleep(900);
      const log = await page.evaluate(() => window.__zen);
      assert(log.some((x) => /p1-zen-out/.test(x)) && log.some((x) => /p1-zen-in-big/.test(x)), "transition absente : " + JSON.stringify(log));
      await shot(page, `pomodoro-plein-ecran-${f.id}`);
      const z = await page.evaluate(() => {
        const o = document.getElementById("p1PomoOverlay"), svg = document.querySelector("#p1PomoRing svg").getBoundingClientRect(), ring = document.getElementById("p1PomoRing").getBoundingClientRect(), tl = document.getElementById("p1PomoTl").getBoundingClientRect(), ct = document.querySelector(".p1-pomo-ctrls").getBoundingClientRect();
        const hidden = [...document.querySelectorAll(".p1-pomo-head, .p1-pomo-foot, .p1-pomo-col-b, .p1-pomo-box:not(.p1-pomo-timer)")].every((e) => e.getBoundingClientRect().width === 0);
        const body = document.getElementById("p1PomoBody"), md = document.getElementById("p1PomoModal").getBoundingClientRect();
        return { zen: o.classList.contains("is-zen"), svg: { w: svg.width, h: svg.height, l: svg.left, t: svg.top, r: svg.right, b: svg.bottom }, ring: { l: ring.left, t: ring.top, r: ring.right, b: ring.bottom }, tl: { l: tl.left, t: tl.top, r: tl.right, b: tl.bottom }, ct: { l: ct.left, t: ct.top, r: ct.right, b: ct.bottom }, hidden,
          scroll: body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1, pageScroll: document.documentElement.scrollWidth > innerWidth + 1, full: Math.abs(md.width - innerWidth) <= 1 && Math.abs(md.height - innerHeight) <= 1, vw: innerWidth, vh: innerHeight };
      });
      assert(z.zen && z.full, "pas en plein écran : " + JSON.stringify(z));
      assert(Math.abs(z.svg.w - z.svg.h) <= 2, `cercle pas carré : ${z.svg.w} × ${z.svg.h}`);
      assert(z.svg.l >= -1 && z.svg.t >= -1 && z.svg.r <= z.vw + 1 && z.svg.b <= z.vh + 1, "cercle coupé : " + JSON.stringify(z.svg));
      assert(z.svg.w >= 0.4 * Math.min(z.vw, z.vh), "cercle trop petit : " + z.svg.w);
      assert(z.hidden && !z.scroll && !z.pageScroll, "autre chose que le chronomètre visible / défilement : " + JSON.stringify({ hidden: z.hidden, scroll: z.scroll }));
      assert(z.tl.b <= z.vh + 1 && z.ct.b <= z.vh + 1 && z.tl.r <= z.vw + 1 && z.ct.r <= z.vw + 1, "frise / boutons coupés : " + JSON.stringify({ tl: z.tl, ct: z.ct }));
      if (f.id === "telCouche") assert(z.svg.r <= z.tl.l + 4 && z.svg.r <= z.ct.l + 4, "téléphone couché : cercle pas à gauche : " + JSON.stringify({ svg: z.svg, tl: z.tl }));
      // Échap : réduit d'abord, puis ferme
      await page.keyboard.press("Escape"); await sleep(900);
      assert(await page.evaluate(() => { const o = document.getElementById("p1PomoOverlay"); return o.classList.contains("active") && !o.classList.contains("is-zen"); }), "Échap n'a pas réduit le plein écran (ou a fermé la fenêtre)");
      await page.keyboard.press("Escape"); await sleep(600);
      assert(await page.evaluate(() => !document.getElementById("p1PomoOverlay").classList.contains("active")), "2e Échap : fenêtre toujours ouverte");
    });
  }

  /* ═════════ PM8 : robustesse ═════════ */
  await S("PM8", "deux onglets : même minuteur (pause dans l'un = pause dans l'autre, et inversement) ; rechargement en cours de période : temps juste", async () => {
    const { page, ctx } = await open(FORMATS[0]);
    const p2 = await ctx.newPage(); p2.setDefaultNavigationTimeout(120000); await p2.setViewport(FORMATS[0].vp);
    await p2.goto((await page.evaluate(() => location.origin)) + "/tableur.html", { waitUntil: "load" });
    await p2.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 }); await clean(p2);
    await p2.evaluate(() => document.querySelector('[data-page="stats"]').click()); await p2.waitForSelector("#p1PomoCard", { timeout: 20000 }); await sleep(1000);
    const run = (pg) => pg.evaluate(() => window.p1Pomodoro.state().running);
    const tg = (pg) => pg.evaluate(() => document.getElementById("p1PomoCardBtn").click());
    await tg(page); await sleep(900);
    assert((await run(page)) && (await run(p2)), "le minuteur lancé dans l'onglet 1 ne tourne pas dans l'onglet 2");
    await tg(page); await sleep(900);
    assert(!(await run(page)) && !(await run(p2)), "pause dans l'onglet 1 non vue dans l'onglet 2");
    assert(await p2.evaluate(() => document.getElementById("p1PomoCardBtn").getAttribute("aria-label") === "Reprendre le minuteur"), "l'onglet 2 n'affiche pas « Reprendre »");
    await tg(p2); await sleep(900);
    assert((await run(page)) && (await run(p2)), "reprise dans l'onglet 2 non vue dans l'onglet 1");
    await tg(p2); await sleep(900);
    assert(!(await run(page)), "pause dans l'onglet 2 non vue dans l'onglet 1");
    await p2.close();
    // rechargement en cours de période : temps juste
    await tg(page); await sleep(600);
    await setState(page, "s.endsAt = now + 10 * 60000; s.total = 25 * 60000;");
    const endsAt = await page.evaluate(() => window.p1Pomodoro.state().endsAt);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 }); await clean(page);
    await page.evaluate(() => document.querySelector('[data-page="stats"]').click()); await page.waitForSelector("#p1PomoCard", { timeout: 20000 }); await sleep(1200);
    const v = await page.evaluate(() => document.getElementById("p1PomoCardVal").textContent);
    const [mm, ss] = v.split(":").map(Number); const left = mm * 60 + ss, expect = Math.round((endsAt - Date.now()) / 1000);
    assert(Math.abs(left - expect) <= 2, `après rechargement : ${v} (attendu ≈ ${Math.floor(expect / 60)}:${String(expect % 60).padStart(2, "0")})`);
    // fermeture longue : les périodes écoulées s'enchaînent depuis leurs vraies heures de fin
    await setState(page, "s.endsAt = now - 6 * 60000; s.running = true; s.phase = 'focus'; s.total = 25 * 60000; s.cfg.auto = true; s.cfg.brk = 5; s.cfg.goal = 4;");
    const s = await st(page);
    assert(s.phase === "focus" && s.sess === 1, `rattrapage : phase ${s.phase}, séance ${s.sess} (attendu : concentration 2 déjà commencée)`);
    assert(s.endsAt > Date.now() && s.endsAt <= Date.now() + 25 * 60000, "heure de fin de la période suivante incohérente");
  });

  /* ═════════ PM9 : données du compte ═════════ */
  await S("PM9", "données du compte : tout ce qui est sous users/{uid} identique avant / après l'usage du minuteur ; aucun champ « pomo » / « timer »", async () => {
    const { u, page } = await open(FORMATS[0]);
    const dump = async () => {
      const out = {};
      const walk = async (ref) => { const cols = await ref.listCollections(); for (const c of cols) { const snap = await c.get(); for (const d of snap.docs) { out[d.ref.path] = JSON.stringify(d.data(), (k, v) => (v && typeof v === "object" && "_seconds" in v ? v._seconds : v)); await walk(d.ref); } } };
      const root = adb.doc(`users/${u.uid}`); const d0 = await root.get(); out[root.path] = JSON.stringify(d0.data()); await walk(root); return out;
    };
    await sleep(3500);
    const before = await dump();
    await openModal(page);
    for (const id of ["p1PomoMain", "p1PomoSkip", "p1PomoMain", "p1PomoStop"]) { await page.evaluate((i) => document.getElementById(i).click(), id); await sleep(300); }
    await page.evaluate(() => { document.querySelector('#p1PomoPresets .p1-pomo-chip:nth-child(2)').click(); document.getElementById("p1PomoLongTg").click(); document.getElementById("p1PomoAutoTg").click(); document.getElementById("p1PomoSoundTg").click(); });
    await setState(page, "s.running = true; s.phase = 'focus'; s.endsAt = now - 500; s.total = 25 * 60000;");
    await closeModal(page); await sleep(3500);
    const after = await dump();
    const diff = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
    assert(!diff.length, "documents modifiés : " + diff.join(", "));
    assert(!Object.entries(after).some(([k, v]) => /pomo|timer/i.test(k) || /"[^"]*(pomo|timer)[^"]*"\s*:/i.test(v)), "champ pomo / timer trouvé dans le compte");
    assert(await page.evaluate(() => !!localStorage.getItem("p1_pomo_v1")), "état local absent (le minuteur doit être local)");
  });

  /* ═════════ PM10 : aide et Nouveautés ═════════ */
  await S("PM10", "aide « Ma journée de travail » : ligne Pomodoro ; Nouveautés : entrée en tête avec icône en dégradé ; AUCUNE pastille pour un compte qui avait tout vu ; clé inchangée (whatsNewSeen_v7)", async () => {
    const { u, page } = await open(FORMATS[0], { prefs: { whatsNewSeen_v7: true } });
    await page.evaluate(() => openHelpModal("stats-daily")); await sleep(600);
    const h = await page.evaluate(() => { const li = [...document.querySelectorAll("#helpModalBody li")].find((x) => /Méthode Pomodoro/.test(x.textContent)); const all = [...document.querySelectorAll("#helpModalBody li")].map((x) => x.querySelector("strong") ? x.querySelector("strong").textContent : ""); return { txt: li && li.textContent.replace(/\s+/g, " ").trim(), pos: all.indexOf("Méthode Pomodoro"), last: all.length - 1, title: document.getElementById("helpModalTitle").textContent }; });
    assert(h.txt && /45 min de concentration, 15 min de pause/.test(h.txt) && /plein écran/.test(h.txt), "ligne d'aide : " + h.txt);
    assert(h.pos === h.last && h.pos > 0, "la ligne n'est pas la dernière : " + h.pos + "/" + h.last);
    assert(h.title === "Ma journée de travail", "titre de l'aide : " + h.title);
    await page.evaluate(() => closeHelpModal({ target: document.getElementById("helpModalOverlay"), currentTarget: document.getElementById("helpModalOverlay") })); await sleep(400);
    await sleep(2500);
    const n = await page.evaluate(() => { const s = [...document.querySelectorAll(".whats-new-modal-body .whats-new-section")]; const f = s[0]; const ic = f.querySelector(".whats-new-section-icon"); return { h: f.querySelector("h4").textContent, p: f.querySelector("p").textContent.replace(/\s+/g, " ").trim(), icon: f.querySelector("i").className, bg: getComputedStyle(ic).backgroundImage, second: s[1].querySelector("h4").textContent, badge: document.getElementById("whats-new-badge").classList.contains("show"), dot: document.getElementById("avatar-whatsnew-dot").classList.contains("show") }; });
    assert(n.h === "Méthode Pomodoro" && n.icon.includes("fa-stopwatch") && /linear-gradient/.test(n.bg), "entrée Nouveautés : " + JSON.stringify(n));
    assert(n.p === "Travaille par périodes de concentration entrecoupées de courtes pauses. Dans le Tableau de bord, la case Méthode Pomodoro lance une concentration en un clic ; ouvre-la pour régler les durées, la séance et la sonnerie.", "texte : " + n.p);
    assert(n.second === "Police et thème dans les Paramètres", "2e entrée : " + n.second);
    assert(!n.badge && !n.dot, "une pastille de notification s'est allumée : " + JSON.stringify(n));
    const keys = Object.keys((await adb.doc(`users/${u.uid}/settings/preferences`).get()).data()).filter((k) => /^whatsNew/.test(k));
    assert(keys.join() === "whatsNewSeen_v7", "clés « vu » : " + keys.join());
  });

  /* ═════════ PM11 : icônes des titres des fenêtres « Temps de travail » / « Entraînements du jour » ═════════ */
  for (const f of [FORMATS[0], FORMATS[1], FORMATS[3]]) {
    await S("PM11-" + f.id, `fenêtres « Temps de travail » et « Entraînements du jour » (${f.label}) : icônes des 4 titres dans une tuile de 32 px (ambre / violet), alignées avec le compteur, rien ne déborde`, async () => {
      const { page } = await open(f);
      const meas = (ov) => page.evaluate((o) => {
        const inner = document.querySelector(o); let root = inner; while (root && !(root.getAttribute && (root.getAttribute("role") === "dialog" || /overlay/i.test(root.className || "")))) root = root.parentElement; root = root || inner; const tiles = [...root.querySelectorAll(".ws-sec-t > i")].filter((e) => e.getBoundingClientRect().width > 0);
        const rows = tiles.map((i) => { const sec = i.closest(".ws-sec"), t = i.closest(".ws-sec-t").getBoundingClientRect(), b = i.getBoundingClientRect(), cnt = sec.querySelector(".ws-count"); if (cnt) { cnt.hidden = false; if (!cnt.textContent) cnt.textContent = "3"; }   /* compteur affiché de force pour mesurer l'alignement */ const cs = getComputedStyle(i); return { w: Math.round(b.width), h: Math.round(b.height), col: cs.color, bg: cs.backgroundColor, text: i.closest(".ws-sec-t").textContent.trim(), cnt: cnt ? Math.abs((cnt.getBoundingClientRect().top + cnt.getBoundingClientRect().height / 2) - (b.top + b.height / 2)) : 0, over: sec.scrollWidth > sec.clientWidth + 1, secH: sec.getBoundingClientRect().height }; });
        return { rows, over: root.scrollWidth > root.clientWidth + 1 };
      }, ov);
      await page.evaluate(() => document.getElementById("p1WsCardPlus").click()); await sleep(1200);
      const ws = await meas("#p1WsBody");
      assert(ws.rows.length >= 2 && ws.rows.every((r) => r.w === 32 && r.h === 32), "tuiles « Temps de travail » : " + JSON.stringify(ws.rows));
      assert(ws.rows.every((r) => r.col === (f.theme === "dark" ? "rgb(251, 191, 36)" : "rgb(217, 119, 6)")), "couleur (ambre) : " + JSON.stringify(ws.rows.map((r) => r.col)));
      assert(ws.rows.every((r) => r.cnt <= 3 && !r.over) && !ws.over, "alignement / débordement « Temps de travail » : " + JSON.stringify(ws));
      await shot(page, `pomodoro-titres-travail-${f.id}`);
      await page.evaluate(() => document.getElementById("p1WsDone").click()); await sleep(900);
      await page.evaluate(() => document.getElementById("p1TrCardPlus").click()); await sleep(1200);
      const tr = await meas("#p1TrModal");
      assert(tr.rows.length >= 2 && tr.rows.every((r) => r.w === 32 && r.h === 32), "tuiles « Entraînements du jour » : " + JSON.stringify(tr.rows));
      assert(tr.rows.every((r) => r.col === (f.theme === "dark" ? "rgb(196, 181, 253)" : "rgb(139, 92, 246)")), "couleur (violet) : " + JSON.stringify(tr.rows.map((r) => r.col)));
      assert(tr.rows.every((r) => r.cnt <= 3 && !r.over) && !tr.over, "alignement / débordement « Entraînements » : " + JSON.stringify(tr));
      await shot(page, `pomodoro-titres-entrainements-${f.id}`);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ PM12 : espace « + » du coin / « Voir le détail » sur téléphone ═════════ */
  const GAP = (page) => page.evaluate(() => {
    const one = (card) => {
      if (!card) return null;
      const btn = card.querySelector(".p1-pomo-btn, .ws-tr-plus, .ws-plus"), cta = card.querySelector(".daily-stat-cta, .daily-stat-click-hint"), cb = card.getBoundingClientRect();
      if (!btn || !cta) return null;
      const b = btn.getBoundingClientRect(), c = cta.getBoundingClientRect();
      const over = [...card.querySelectorAll("*")].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).position !== "absolute" && (r.right > cb.right + 1 || r.left < cb.left - 1 || r.bottom > cb.bottom + 1); });
      return { gap: c.top - b.bottom, pad: getComputedStyle(card.querySelector(".daily-stat-value-row")).paddingTop, over, h: cb.height, cardOver: card.scrollWidth > card.clientWidth + 1 };
    };
    const tr = document.querySelector(".daily-stat-card:has(> .ws-tr-plus)");
    return { pomo: one(document.getElementById("p1PomoCard")), tr: one(tr), pageOver: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  for (const [w, theme] of [[390, "light"], [390, "dark"], [360, "light"], [360, "dark"]]) {
    await S(`PM12-${w}${theme}`, `téléphone ${w} px (${theme}) : écart entre le bas du « + » et le haut de « Voir le détail » ≥ 3 px, égal (±2 px) à celui de « Entraînements du jour », rien ne déborde`, async () => {
      const { page } = await open({ id: "t" + w, label: "tel " + w, vp: M(w, 844), theme });
      const r = await GAP(page);
      assert(r.pomo && r.tr, "cases introuvables : " + JSON.stringify(r));
      assert(r.pomo.gap >= 3, `écart Pomodoro trop petit : ${r.pomo.gap.toFixed(1)} px`);
      assert(Math.abs(r.pomo.gap - r.tr.gap) <= 2, `écart Pomodoro ${r.pomo.gap.toFixed(1)} px ≠ « Entraînements du jour » ${r.tr.gap.toFixed(1)} px`);
      assert(r.pomo.pad === "6.4px" || parseFloat(r.pomo.pad) > 0, "padding-top non appliqué : " + r.pomo.pad);
      assert(!r.pomo.over && !r.pomo.cardOver && !r.pageOver, "débordement : " + JSON.stringify(r));
      if (process.env.POMOSHOTS) await page.screenshot({ path: `docs/captures-15-10/pomodoro-espace-${w}${theme}.png` });
    });
  }
  await S("PM12-PC", "PC 1366 px : rien ne change (aucun padding ajouté sous le titre, même écart que « Entraînements du jour »)", async () => {
    const { page } = await open(FORMATS[0]);
    const r = await GAP(page);
    assert(r.pomo && r.tr, "cases introuvables : " + JSON.stringify(r));
    assert(parseFloat(r.pomo.pad) === 0 && parseFloat(r.tr.pad) === 0, `padding-top sur PC : Pomodoro ${r.pomo.pad}, Entraînements ${r.tr.pad}`);
    assert(Math.abs(r.pomo.gap - r.tr.gap) <= 2, `PC : écart Pomodoro ${r.pomo.gap.toFixed(1)} px vs ${r.tr.gap.toFixed(1)} px`);
    assert(!r.pomo.over && !r.pageOver, "débordement sur PC");
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
