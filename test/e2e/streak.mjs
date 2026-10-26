/* Flammes et vies — vraie page + vrais émulateurs (2026-10-12, interface alignée le 14/10).
   Lancer : node test/e2e/streak.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
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

const key = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
const mondayOf = (k) => { const [y, m, d] = k.split("-").map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return key(x); };
const TODAY = key(new Date()), WEEK = mondayOf(TODAY), PREV_WEEK = mondayOf(ago(7));
const st = (over = {}) => ({ last: ago(1), count: 4, best: 6, lives: 5, week: WEEK, used: null, gift: null, anim: null, ...over });
const streakDoc = async (uid) => (await adb.doc(`users/${uid}/streak/state`).get()).data();

/* Ouvre la page, pose un échantillonneur DANS la page (15 ms, un seul page.evaluate : des allers-retours depuis le test rateraient la fenêtre de
   0,5 s où l'ancien nombre est affiché) AVANT d'afficher les Statistiques, puis les affiche. */
async function openStats(u, { width = 1280, height = 900, theme = "light", reduced = false, mobile = false } = {}) {
  const ctx = await openPage(browser, u); const page = ctx.page;
  await page.bringToFront();
  if (reduced) { await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]); await page.reload({ waitUntil: "load" }); }   // préférence active DÈS le chargement
  if (mobile) await page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); else await page.setViewport({ width, height });
  await sleep(mobile ? 2500 : 300);
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await page.waitForFunction(() => window.p1Streak && window.currentUser && document.getElementById("p1StreakCard"), { timeout: 30000 });
  if (theme === "dark") await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.waitForFunction(() => window.p1Streak.state() !== undefined, { timeout: 30000 });
  await page.evaluate(() => {
    const S0 = performance.now();
    window.__s = { nums: [], plus: false, lit: false, litStart: null, breakIdx: [], breakDur: 0, breakStart: null, shards: false, minus: false, gift: false, subs: [] };
    setInterval(() => {
      const n = document.getElementById("p1StreakN"), card = document.getElementById("p1StreakCard"), sub = document.getElementById("p1StreakSub");
      if (!n || !card) return;
      const S = window.__s, now = Math.round(performance.now() - S0);
      if (S.nums[S.nums.length - 1] !== n.textContent) S.nums.push(n.textContent);
      if (card.querySelector(".ws-streak-plus")) S.plus = true;
      if (card.classList.contains("is-lit")) { S.lit = true; if (S.litStart === null) S.litStart = now; }
      if (card.querySelector(".ws-heart-shard")) S.shards = true;
      if (card.querySelector(".ws-heart-minus")) S.minus = true;
      [...document.querySelectorAll("#p1Lives i")].forEach((h, k) => {
        if (h.classList.contains("is-break")) { if (!S.breakIdx.includes(k)) S.breakIdx.push(k); if (S.breakStart === null) S.breakStart = now; S.breakDur = Math.max(S.breakDur, parseFloat(getComputedStyle(h).animationDuration)); }
        if (h.classList.contains("is-gift")) S.gift = true;
      });
      if (sub && S.subs[S.subs.length - 1] !== sub.textContent) S.subs.push(sub.textContent);
    }, 15);
    document.querySelector('[data-page="stats"]').click();
  });
  return ctx;
}
const cardState = (page) => page.evaluate(() => ({
  num: document.getElementById("p1StreakN").textContent, unit: document.getElementById("p1StreakUnit").textContent, sub: document.getElementById("p1StreakSub").textContent.replace(/\s+/g, " ").trim(),
  hearts: [...document.querySelectorAll("#p1Lives i")].map((h) => h.classList.contains("is-on")).join(","), aria: document.getElementById("p1StreakCard").getAttribute("aria-label"),
  title: document.getElementById("p1StreakCard").title || "", s: window.__s
}));
const waitDone = (page) => page.waitForFunction(() => window.p1Streak && !window.p1Streak._playing() && window.p1Streak.state() && window.p1Streak.state().anim === window.p1Streak.today(), { timeout: 30000 });

try {
  await S("E1", "nouveau compte : 1 flamme, 5 vies, animation à l'ouverture des Stats, PAS rejouée au rechargement ; `anim` sur le serveur ; rien dans le stockage local", async () => {
    const u = await mkUser({ courses: 1 });
    const { page } = await openStats(u);
    await waitDone(page); await sleep(2800);
    const c = await cardState(page);
    assert(c.num === "1" && c.unit === "jour" && c.hearts === "true,true,true,true,true" && c.sub === "de connexion d’affilée", "carte : " + JSON.stringify(c));
    assert(c.s.lit === true, "la flamme ne s'est pas embrasée : " + JSON.stringify(c.s));
    const doc = await streakDoc(u.uid);
    assert(doc && doc.count === 1 && doc.lives === 5 && doc.last === TODAY && doc.anim === TODAY && doc.week === WEEK, "document serveur : " + JSON.stringify(doc));
    const keys = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => /streak|flamme|vie|flame/i.test(k)));
    assert(keys.length === 0, "clé de stockage local liée aux flammes : " + JSON.stringify(keys));
    const idb = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).filter((n) => /streak|flamme/i.test(n || "")));
    assert(idb.length === 0, "base IndexedDB liée aux flammes : " + JSON.stringify(idb));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    await page.reload({ waitUntil: "load" }); await sleep(800);
    await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
    await page.waitForFunction(() => window.p1Streak && window.p1Streak.state() !== undefined, { timeout: 30000 });
    await page.evaluate(() => { window.__r = { lit: false }; setInterval(() => { const c = document.getElementById("p1StreakCard"); if (c && c.classList.contains("is-lit")) window.__r.lit = true; }, 30); document.querySelector('[data-page="stats"]').click(); });
    await sleep(3000);
    const again = await page.evaluate(() => ({ lit: window.__r.lit, num: document.getElementById("p1StreakN").textContent }));
    assert(again.lit === false && again.num === "1", "animation rejouée après rechargement : " + JSON.stringify(again));
  });

  await S("E2", "hier (4, record 6) : animation 4 -> 5 avec « +1 », cœurs inchangés, record affiché", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st());
    const { page } = await openStats(u);
    await waitDone(page); await sleep(2800);
    const c = await cardState(page);
    assert(c.s.nums.includes("4"), "l'ancien nombre (4) n'a jamais été affiché : " + JSON.stringify(c.s.nums));
    assert(c.s.nums.indexOf("4") < c.s.nums.lastIndexOf("5") && c.num === "5" && c.s.plus && c.s.lit, "animation 4->5 : " + JSON.stringify(c.s));
    assert(c.sub === "de connexion d’affilée · record 6" && c.hearts === "true,true,true,true,true", "sous-ligne/cœurs : " + JSON.stringify(c));
    const doc = await streakDoc(u.uid);
    assert(doc.count === 5 && doc.anim === TODAY && doc.best === 6, "serveur : " + JSON.stringify(doc));
  });

  await S("E3", "2e navigateur le même jour : toujours 5, AUCUNE animation ; la 1re vue seule a joué", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st());
    const A = await openStats(u);
    await waitDone(A.page); await sleep(2500);
    const B = await openStats(u);
    await sleep(3500);
    const c = await cardState(B.page);
    assert(c.num === "5" && c.s.plus === false && c.s.lit === false, "2e navigateur : " + JSON.stringify(c.s) + " num=" + c.num);
    assert((await streakDoc(u.uid)).count === 5, "compté deux fois");
  });

  await S("E4", "jour manqué (avec vies) : le cœur bat puis se fend en deux moitiés et « −1 », « Série sauvée · 1 vie utilisée », PUIS la flamme s'embrase ; flammes gardées (+1)", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st({ last: ago(2), count: 7, best: 7, week: WEEK }));
    const { page } = await openStats(u);
    await waitDone(page); await sleep(3200);
    const c = await cardState(page);
    assert(c.num === "8" && c.hearts === "true,true,true,true,false" && /Série sauvée · 1 vie utilisée/.test(c.sub), "carte : " + JSON.stringify(c));
    assert(c.s.breakIdx.length === 1 && c.s.breakIdx[0] === 4, "UN seul cœur doit se briser (le dernier) : " + JSON.stringify(c.s));
    assert(c.s.breakDur >= 0.75, "le cœur bat trop vite (durée CSS " + c.s.breakDur + " s)");
    assert(c.s.shards && c.s.minus, "les deux moitiés et le « −1 » n'ont pas été vus : " + JSON.stringify(c.s));
    assert(c.s.breakStart !== null && c.s.litStart !== null && c.s.litStart - c.s.breakStart >= 1500, "la flamme doit s'embraser APRÈS le cœur (cœur à " + c.s.breakStart + " ms, flamme à " + c.s.litStart + " ms)");
    const doc = await streakDoc(u.uid);
    assert(doc.count === 8 && doc.lives === 4 && doc.used && doc.used.n === 1, "serveur : " + JSON.stringify(doc));
  });

  await S("E5", "absence avec 0 vie : la série repart à 1, 0 vie, record conservé (aucun cœur ne se brise)", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st({ last: ago(6), count: 9, best: 9, lives: 0, week: WEEK }));
    const { page } = await openStats(u);
    await waitDone(page); await sleep(2800);
    const c = await cardState(page);
    const doc = await streakDoc(u.uid);
    assert(c.num === "1" && c.hearts === "false,false,false,false,false" && doc.count === 1 && doc.lives === 0 && doc.best === 9 && c.s.breakIdx.length === 0, "carte " + JSON.stringify(c) + " serveur " + JSON.stringify(doc));
  });

  await S("E10", "10 jours sans connexion, 2 vies : 13 flammes, 1 vie, UN seul cœur se brise, « Série sauvée · 1 vie utilisée »", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st({ last: ago(11), count: 12, best: 12, lives: 2, week: WEEK }));
    const { page } = await openStats(u);
    await waitDone(page); await sleep(3200);
    const c = await cardState(page);
    const doc = await streakDoc(u.uid);
    assert(c.num === "13" && c.hearts === "true,false,false,false,false" && /Série sauvée · 1 vie utilisée/.test(c.sub), "carte : " + JSON.stringify(c));
    assert(c.s.breakIdx.length === 1 && c.s.breakDur >= 0.75, "cœurs brisés : " + JSON.stringify(c.s));
    assert(c.s.nums.includes("12") && c.s.nums[c.s.nums.length - 1] === "13", "suite des nombres 12 -> 13 : " + JSON.stringify(c.s.nums));
    assert(doc.count === 13 && doc.lives === 1 && doc.used && doc.used.n === 1, "serveur : " + JSON.stringify(doc));
  });

  await S("E6", "nouvelle semaine : +1 vie offerte (le cœur apparaît avec son petit rebond), plafond 5", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st({ last: ago(1), count: 3, best: 3, lives: 1, week: PREV_WEEK }));
    const { page } = await openStats(u);
    await waitDone(page); await sleep(3000);
    const c = await cardState(page);
    const doc = await streakDoc(u.uid);
    assert(doc.lives === 2 && doc.gift === TODAY && doc.week === WEEK && c.hearts === "true,true,false,false,false", "serveur " + JSON.stringify(doc) + " carte " + JSON.stringify(c));
    assert(c.s.gift === true, "le cœur offert n'a pas joué son apparition : " + JSON.stringify(c.s));
  });

  await S("E7", "téléphone 390, thème sombre : rien de rogné, cœurs vides gris / pleins clairs, aucune info-bulle", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st({ last: ago(2), count: 7, best: 7 }));
    const { page } = await openStats(u, { width: 390, height: 2100, theme: "dark", mobile: true });   // grande hauteur : la carte doit être visible à >= 50 % pour que l'animation se joue
    await waitDone(page); await sleep(3000);
    const r = await page.evaluate(() => {
      const card = document.getElementById("p1StreakCard"), cr = card.getBoundingClientRect();
      const inside = ["p1StreakSub", "p1StreakN", "p1Lives"].every((id) => { const e = document.getElementById(id).getBoundingClientRect(); return e.left >= cr.left - 0.5 && e.right <= cr.right + 0.5; });
      const sub = document.getElementById("p1StreakSub");
      const h = [...document.querySelectorAll("#p1Lives i")].map((x) => getComputedStyle(x).color);
      return { inside, clipped: sub.scrollWidth > sub.clientWidth + 1, h, title: !!card.title || !!card.querySelector("[title]"), dt: card.querySelector("[data-tooltip]") !== null };
    });
    assert(r.inside && !r.clipped && !r.title && !r.dt, "mise en page : " + JSON.stringify(r));
    assert(r.h.length === 5 && r.h.slice(0, 4).every((c) => c === "rgb(248, 113, 113)") && r.h[4] === "rgb(71, 85, 105)", "couleurs des cœurs (sombre, 5 cœurs) : " + JSON.stringify(r.h));
  });

  await S("E8", "mouvements réduits : aucune animation, valeur finale tout de suite, `anim` quand même écrit", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st());
    const { page } = await openStats(u, { reduced: true });
    await waitDone(page); await sleep(1500);
    const c = await cardState(page);
    assert(c.num === "5" && c.s.lit === false && c.s.plus === false && !c.s.nums.includes("4"), "mouvements réduits : " + JSON.stringify(c.s));
    assert((await streakDoc(u.uid)).anim === TODAY, "anim non écrit");
  });

  await S("E9", "carte : place (après « Entraînements du jour », même rangée), même hauteur, libellé « Flammes », aria-label complet", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st({ last: TODAY, count: 5, best: 6, lives: 2, anim: TODAY }));
    const { page } = await openStats(u);
    await sleep(1800);
    const r = await page.evaluate(() => {
      const a = document.getElementById("p1TrCard").getBoundingClientRect(), b = document.getElementById("p1StreakCard").getBoundingClientRect();
      return { sameRow: Math.abs(a.top - b.top) < 1, after: b.left > a.right - 1, sameH: Math.abs(a.height - b.height) < 1.5, label: document.querySelector("#p1StreakCard .daily-stat-label").textContent, aria: document.getElementById("p1StreakCard").getAttribute("aria-label"), sub: document.getElementById("p1StreakSub").textContent.replace(/\s+/g, " ").trim() };
    });
    assert(r.sameRow && r.after && r.label === "Flammes" && r.sub === "de connexion d’affilée · record 6", "carte : " + JSON.stringify(r));
    assert(r.aria === "Flammes : 5 jours de connexion d’affilée, record 6, 2 vies sur 5", "aria-label : " + r.aria);
    assert(r.sameH, "hauteur différente : " + JSON.stringify(r));
  });

  await S("E11", "téléphone 360 sombre avec 5 cœurs : ligne du titre sans rognage (libellé entier, cœurs dans la carte), rien ne déborde", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/streak/state`).set(st({ last: TODAY, count: 12, best: 120, lives: 5, anim: TODAY }));
    const { page } = await openStats(u, { width: 360, height: 2100, theme: "dark", mobile: true });
    await sleep(1500);
    const r = await page.evaluate(() => {
      const card = document.getElementById("p1StreakCard"), cr = card.getBoundingClientRect(), lab = card.querySelector(".daily-stat-label"), hearts = document.getElementById("p1Lives").getBoundingClientRect(), ico = card.querySelector(".daily-stat-icon").getBoundingClientRect(), l = lab.getBoundingClientRect();
      const sub = document.getElementById("p1StreakSub");
      return { labelClipped: lab.scrollWidth > lab.clientWidth + 1, heartsInside: hearts.right <= cr.right - 4 && hearts.left >= cr.left, noOverlap: l.right <= hearts.left + 0.5 && l.left >= ico.right - 0.5, subClipped: sub.scrollWidth > sub.clientWidth + 1, oneLine: hearts.height < 24, count: document.querySelectorAll("#p1Lives i").length, cw: Math.round(cr.width), sub: sub.textContent };
    });
    assert(!r.labelClipped && r.heartsInside && r.noOverlap && !r.subClipped && r.oneLine && r.count === 5, "360 px : " + JSON.stringify(r));
  });

  await S("H1", "aides : textes demandés présents (jour + 7 jours), AUCUNE mention du mode compact, titre « Graphiques et entraînements »", async () => {
    const u = await mkUser({ courses: 1 });
    const { page } = await openStats(u);
    const text = async (id) => {
      await page.evaluate((i) => window.openHelpModal(i), id); await sleep(500);
      const t = await page.evaluate(() => (document.querySelector(".help-modal-overlay.active") || document.querySelector(".help-modal-overlay")).textContent.replace(/\s+/g, " "));
      await page.evaluate(() => { const c = document.querySelector(".help-modal-overlay.active .help-modal-close") || document.querySelector(".help-modal-close"); if (c) c.click(); }); await sleep(500);
      return t;
    };
    const d = await text("stats-daily"), w = await text("stats-weekly");
    for (const frag of ["durée de vos tours + vos sessions de travail (QCM, annales, fiches…) + vos entraînements", "Cliquez sur cette carte pour voir le détail, ou sur « + » pour ajouter une session.", "vos entraînements du jour (types de P1), avec le temps passé", "Cliquez sur la carte pour le détail, ou sur « + » pour en ajouter.", "vos jours de connexion d'affilée (depuis n'importe quel appareil) et votre record", "une seule vie ❤ est utilisée à votre retour et vos flammes sont gardées ; vous recevez une vie par semaine (5 au maximum)"])
      assert(d.includes(frag), "aide « jour » : fragment absent : " + frag);
    for (const frag of ["Graphiques et entraînements", "vos tours, vos sessions de travail et vos entraînements, empilés jour par jour", "Cliquez sur « Tours », « Sessions » ou « Entraînements » sous le graphique pour masquer ou réafficher une partie.", "nombre de chaque type d'entraînement sur les 7 derniers jours, et le temps total"])
      assert(w.includes(frag), "aide « 7 jours » : fragment absent : " + frag);
    assert(!/compact/i.test(d) && !/compact/i.test(w), "mention du mode compact dans l'aide");
    assert(!w.includes("Trois graphiques"), "ancien titre « Trois graphiques » encore présent");
  });

  await S("N2", "Nouveautés : « Flammes » juste après « Police et thème » et avant « Sessions de travail », icône orange-rouge, texte demandé ; pastille pour un compte qui a lu la v6, éteinte après lecture", async () => {
    const u = await mkUser();
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ whatsNewSeen_v6: true }, { merge: true });
    const { page } = await openStats(u);
    await sleep(2500);
    const r = await page.evaluate(() => {
      const secs = [...document.querySelectorAll(".whats-new-modal-body .whats-new-section")], ic = secs[1].querySelector(".whats-new-section-icon");
      return { h: secs.slice(0, 3).map((x) => x.querySelector("h4").textContent), txt: secs[1].querySelector("p").textContent.replace(/\s+/g, " ").trim(), cls: ic.className, bg: getComputedStyle(ic).backgroundImage, badge: document.getElementById("whats-new-badge").classList.contains("show") };
    });
    assert(/^Police et thème/.test(r.h[0]) && r.h[1] === "Flammes" && /^Sessions de travail/.test(r.h[2]), "ordre : " + JSON.stringify(r.h));
    assert(r.txt === "Chaque jour de connexion d'affilée te rapporte une flamme (carte « Flammes » du Tableau de bord). Absent un jour ou plusieurs ? À ton retour, une seule vie ❤ est utilisée et tes flammes sont gardées. Une vie offerte chaque semaine, 5 au maximum.", "texte : " + r.txt);
    assert(/flame/.test(r.cls) && /249, 115, 22/.test(r.bg) && /239, 68, 68/.test(r.bg), "icône : " + JSON.stringify(r));
    assert(r.badge, "pastille absente");
    await page.evaluate(() => window.openWhatsNewModal && window.openWhatsNewModal()); await sleep(600);
    await page.evaluate(() => window.closeWhatsNewModal && window.closeWhatsNewModal()); await sleep(1500);
    assert(!(await page.evaluate(() => document.getElementById("whats-new-badge").classList.contains("show"))), "pastille encore affichée après lecture");
    assert((await adb.doc(`users/${u.uid}/settings/preferences`).get()).data().whatsNewSeen_v7 === true, "whatsNewSeen_v7 non enregistré");
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
