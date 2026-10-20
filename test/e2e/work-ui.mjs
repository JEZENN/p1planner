/* Sessions de travail, entraînements du jour, graphique « Temps de travail », mode compact, Nouveautés — vraie page + vrais émulateurs.
   (Interface alignée sur l'autre outil du même éditeur, 14/10 : fenêtres, cartes, pastilles, légende, cœurs.)
   Lancer : node test/e2e/work-ui.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
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

const localKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const wsDocs = async (uid) => (await adb.collection(`users/${uid}/workSessions`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const waitDocs = async (uid, pred, ms = 8000) => { const t0 = Date.now(); let d = []; while (Date.now() - t0 < ms) { d = await wsDocs(uid); if (pred(d)) return d; await sleep(200); } return d; };

/* Compte neuf, page des statistiques ouverte (assistant de première connexion masqué : il recouvre la page d'un compte neuf). */
async function statsUser(opts = {}) {
  const u = await mkUser({ courses: 1 });
  if (opts.seed) await opts.seed(u);
  const ctx = await openPage(browser, u);
  await ctx.page.bringToFront();
  if (opts.viewport) await ctx.page.setViewport(opts.viewport);
  await sleep(opts.viewport && opts.viewport.isMobile ? 2500 : 300);
  await ctx.page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await ctx.page.waitForFunction(() => window.p1WorkSessions && (!window.p1WorkSessions.ready || window.p1WorkSessions.ready()) && window.currentUser && document.getElementById("p1TrCard") && document.getElementById("p1WsCardPlus"), { timeout: 30000 });
  await ctx.page.evaluate(() => document.querySelector('[data-page="stats"]').click());
  await sleep(600);
  return { u, ...ctx };
}
const jsClick = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
const openWork = (page, add) => page.evaluate((a) => window.p1WorkSessions.openWork(a ? { mode: "add" } : undefined), add);
const openTrain = (page, add) => page.evaluate((a) => window.p1WorkSessions.openTrain(a ? { mode: "add" } : undefined), add);
const txt = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent.replace(/\s+/g, " ").trim(), sel);
/* Ajout d'une session par l'interface : type (pastille), durée (pastille), bouton. */
async function addUI(page, type, min) {
  await page.evaluate((t, m) => { document.querySelector(`#p1WsTypeChips .ws-chip[data-type="${t}"]`).click(); document.querySelector(`#p1WsDurChips .ws-chip[data-min="${m}"]`).click(); document.getElementById("p1WsAddBtn").click(); }, type, min);
}

try {
/* ═══════════════════ Sessions de travail ═══════════════════ */
await S("S1", "« + » : fenêtre ouverte sur « Ajouter » ; type + 1 h -> document créé, bouton VERT « Session ajoutée », la ligne apparaît, temps du jour = 1h00", async () => {
  const { u, page } = await statsUser();
  await jsClick(page, "#p1WsCardPlus");
  await page.waitForSelector("#p1WsOverlay.active", { timeout: 5000 });
  // défilement doux de la zone de contenu vers « Ajouter » (scrollTo smooth : attendu par scrutation)
  await page.waitForFunction(() => { const body = document.getElementById("p1WsBody"), b = body.getBoundingClientRect(), a = document.getElementById("p1WsAdd").getBoundingClientRect(); return body.scrollHeight <= body.clientHeight + 4 || a.top - b.top < 40 || body.scrollTop >= body.scrollHeight - body.clientHeight - 2; }, { timeout: 8000 });
  await addUI(page, "QCM", 60);
  const docs = await waitDocs(u.uid, (d) => d.length === 1);
  assert(docs.length === 1, "documents créés : " + docs.length);
  const d = docs[0];
  assert(d.minutes === 60 && d.label === "QCM" && d.kind === null && d.deletedAt === null && d.date === localKey(), "document inattendu : " + JSON.stringify(d));
  await page.waitForFunction(() => document.querySelectorAll("#p1WsList .ws-row").length === 1, { timeout: 8000 });
  const ui = await page.evaluate(() => ({ btn: document.getElementById("p1WsAddBtn").className + "|" + document.getElementById("p1WsAddBtn").textContent.trim(), total: document.getElementById("p1WsTotal").textContent, card: document.getElementById("stat-time-today").textContent, split: document.getElementById("p1WsCardSplit").textContent }));
  assert(/is-done/.test(ui.btn) && /Session ajoutée/.test(ui.btn) && ui.total === "1h00" && ui.card === "1h00" && /dont 1h00 de sessions/.test(ui.split), "interface : " + JSON.stringify(ui));
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
});

await S("S2", "suppression en un clic : deletedAt posé (pas de suppression physique), ligne retirée, temps remis à 0", async () => {
  const { u, page } = await statsUser();
  await page.evaluate(() => window.p1WorkSessions.addSession({ date: window.p1WorkSessions.todayKey(), label: "Fiches", minutes: 45 }));
  await sleep(600); await openWork(page, false);
  await page.waitForFunction(() => document.querySelectorAll("#p1WsList .ws-row").length === 1 && !document.querySelector("#p1WsList .ws-row").getAnimations().length, { timeout: 8000 });
  await page.click("#p1WsList .ws-del");
  const docs = await waitDocs(u.uid, (d) => d.length === 1 && d[0].deletedAt);
  assert(docs.length === 1 && docs[0].deletedAt, "soft delete attendu : " + JSON.stringify(docs));
  await page.waitForFunction(() => !document.querySelector("#p1WsList .ws-row"), { timeout: 8000 });
  const ui = await page.evaluate(() => ({ total: document.getElementById("p1WsTotal").textContent, card: document.getElementById("stat-time-today").textContent }));
  assert(ui.total === "0h00" && ui.card === "0h00", "interface : " + JSON.stringify(ui));
});

await S("S3", "plafond 24 h : au-delà, message animé « Journée complète… », rien d'écrit", async () => {
  const { u, page } = await statsUser();
  await page.evaluate(async () => { const t = window.p1WorkSessions.todayKey(); await window.p1WorkSessions.addSession({ date: t, label: "Cours", minutes: 900 }); await window.p1WorkSessions.addSession({ date: t, label: "Cours", minutes: 480 }); });
  await openWork(page, true); await sleep(900);
  await addUI(page, "QCM", 60);                                         // 23 h + 1 h = 24 h pile : accepté
  await waitDocs(u.uid, (d) => d.length === 3);
  await sleep(1900);                                                    // le bouton « Session ajoutée » redevient « Ajouter la session »
  await addUI(page, "Fiches", 30);                                      // refusée
  await page.waitForFunction(() => document.getElementById("p1WsDurErr").classList.contains("is-shown"), { timeout: 5000 });
  const msg = await txt(page, "#p1WsDurErr");
  assert(/24 h/.test(msg), "message : " + msg);
  await sleep(600);
  assert((await wsDocs(u.uid)).length === 3, "une session a été écrite malgré le plafond");
});

await S("S4", "changer le statut / les notes d'un jour n'efface PAS les sessions (stockage hors calendarDays)", async () => {
  const { u, page } = await statsUser();
  await page.evaluate(() => window.p1WorkSessions.addSession({ date: window.p1WorkSessions.todayKey(), label: "QCM", minutes: 30 }));
  await waitDocs(u.uid, (d) => d.length === 1);
  await adb.doc(`users/${u.uid}/calendarDays/${localKey()}`).set({ status: "ok", specialties: [], notes: "x" }, { merge: false });
  await sleep(1000);
  const docs = await wsDocs(u.uid);
  assert(docs.length === 1 && !docs[0].deletedAt, "session perdue : " + JSON.stringify(docs));
});

await S("S5", "deux navigateurs : l'ajout de A apparaît chez B, la suppression chez B disparaît chez A", async () => {
  const A = await statsUser();
  const B = await openPage(browser, A.u); await B.page.bringToFront();
  await B.page.waitForFunction(() => window.p1WorkSessions && window.p1WorkSessions.ready(), { timeout: 20000 });
  await A.page.bringToFront();
  await A.page.evaluate(() => window.p1WorkSessions.addSession({ date: window.p1WorkSessions.todayKey(), label: "Annales", minutes: 90 }));
  await B.page.bringToFront();
  await B.page.waitForFunction(() => window.p1WorkSessions.minutesFor(window.p1WorkSessions.todayKey()).sessions === 90, { timeout: 10000 });
  const id = await B.page.evaluate(() => window.p1WorkSessions.list(window.p1WorkSessions.todayKey())[0].id);
  await B.page.evaluate((i) => window.p1WorkSessions.remove(i), id);
  await A.page.bringToFront();
  await A.page.waitForFunction(() => window.p1WorkSessions.minutesFor(window.p1WorkSessions.todayKey()).sessions === 0, { timeout: 10000 });
});

await S("S6", "double clic rapproché sur « Ajouter la session » = UN seul ajout", async () => {
  const { u, page } = await statsUser();
  await openWork(page, true); await sleep(900);
  await page.evaluate(() => { document.querySelector('#p1WsTypeChips .ws-chip[data-type="QCM"]').click(); document.querySelector('#p1WsDurChips .ws-chip[data-min="30"]').click(); });
  const r = await page.evaluate(() => { const b = document.getElementById("p1WsAddBtn").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.click(r.x, r.y); await page.mouse.click(r.x, r.y);
  await sleep(1500);
  const docs = await wsDocs(u.uid);
  assert(docs.length === 1, "documents créés par un double clic : " + docs.length);
});

await S("S7", "déconnexion : rien de l'ancien compte n'est compté ensuite", async () => {
  const { page } = await statsUser();
  await page.evaluate(() => window.p1WorkSessions.addSession({ date: window.p1WorkSessions.todayKey(), label: "QCM", minutes: 30 }));
  await sleep(800);
  await page.evaluate(() => window.p1StopWorkSessions());
  const m = await page.evaluate(() => window.p1WorkSessions.minutesFor(window.p1WorkSessions.todayKey()).sessions);
  assert(m === 0, "session de l'ancien compte encore comptée : " + m);
});

/* ═══════════════════ Entraînements ═══════════════════ */
await S("C1", "entraînement : bouton de type -> petite fenêtre « nombre + temps » ; ajout -> case du type, cartes à jour, petite fenêtre refermée ; « − » retire le dernier ajout", async () => {
  const { u, page } = await statsUser();
  await jsClick(page, "#p1TrCardPlus");
  await page.waitForSelector("#p1TrOverlay.active", { timeout: 5000 }); await sleep(900);
  await jsClick(page, "#p1WsTrqcm");
  await page.waitForFunction(() => document.getElementById("p1WsQi").classList.contains("is-open"), { timeout: 5000 });
  const lab = await txt(page, "#p1WsQiNLabel");
  assert(lab === "Nombre de QCM", "libellé : " + lab);
  await page.evaluate(() => { document.querySelector('#p1WsQiNChips .ws-chip[data-n="30"]').click(); document.querySelector('#p1WsQiTChips .ws-chip[data-min="30"]').click(); document.getElementById("p1WsQiOk").click(); });
  const docs = await waitDocs(u.uid, (d) => d.length === 1);
  assert(docs.length === 1 && docs[0].kind === "qcm" && docs[0].count === 30 && docs[0].minutes === 30 && docs[0].label === "QCM", "document : " + JSON.stringify(docs));
  await page.waitForFunction(() => !document.getElementById("p1WsQi").classList.contains("is-open"), { timeout: 5000 });
  const ui = await page.evaluate(() => ({ tile: (document.querySelector('.ws-tr-tile[data-kind="qcm"] .ws-tr-tile-n') || {}).textContent, tt: (document.querySelector('.ws-tr-tile[data-kind="qcm"] .ws-tr-tile-t') || {}).textContent, card: document.getElementById("p1TrCardValue").textContent, pills: document.getElementById("p1TrCardPills").textContent.replace(/\s+/g, " ").trim(), time: document.getElementById("stat-time-today").textContent, total: document.getElementById("p1TrTotal").textContent }));
  assert(ui.tile === "30" && ui.tt === "0h30" && ui.card === "0h30" && ui.pills === "30 QCM" && ui.time === "0h30" && ui.total === "0h30", "interface : " + JSON.stringify(ui));
  await sleep(700);
  await jsClick(page, '.ws-tr-minus[data-kind="qcm"]');
  const after = await waitDocs(u.uid, (d) => d.length === 1 && d[0].deletedAt);
  assert(after[0].deletedAt, "le dernier ajout n'a pas été retiré (soft delete) : " + JSON.stringify(after));
  await page.waitForFunction(() => !document.querySelector('.ws-tr-tile[data-kind="qcm"]') || document.querySelector('.ws-tr-tile[data-kind="qcm"]').classList.contains("is-leaving"), { timeout: 5000 });
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
});

await S("C2", "trois cartes entraînements (jour / 7 jours / total) : valeur en TEMPS + pastilles par type, grille de 4 types, colonnes plafonnées", async () => {
  const { page } = await statsUser({ viewport: { width: 1280, height: 900 } });
  await page.evaluate(async () => { const a = window.p1WorkSessions, t = a.todayKey(); await a.addTraining({ date: t, typeId: "qcm", count: 40, minutes: 60 }); await a.addTraining({ date: t, typeId: "colle", count: 25, minutes: 90 }); });   // colle : 1 épreuve de 25 QCM
  await sleep(1200);
  const r = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("#p1TrWeekGrid .ws-tr-wcell")].map((c) => c.querySelector(".ws-tr-wcell-k").textContent + ":" + c.querySelector(".ws-tr-wcell-n").textContent);
    const a = document.getElementById("p1TrCard").getBoundingClientRect(), w = document.getElementById("p1TrWeekCard").getBoundingClientRect(), g = document.getElementById("p1TrTotalCard").getBoundingClientRect();
    const dg = document.querySelector("#page-stats .daily-stats-grid").getBoundingClientRect(), wg = document.querySelector("#page-stats .weekly-stats-grid").getBoundingClientRect();
    return { day: document.getElementById("p1TrCardValue").textContent, dayPills: document.getElementById("p1TrCardPills").textContent.replace(/\s+/g, " ").trim(), cells, week: document.getElementById("p1TrWeekTotal").textContent, all: document.getElementById("p1TrAllTime").textContent, allPills: document.getElementById("p1TrAllPills").textContent.replace(/\s+/g, " ").trim(),
      dayW: Math.round(a.width), dayGridW: Math.round(dg.width), weekW: Math.round(w.width), weekGridW: Math.round(wg.width) };
  });
  assert(r.day === "2h30" && r.dayPills === "40 QCM1 Colle · 25 QCM" && r.cells.join() === "QCM:40,Annale:0,Colle:1,Concours blanc:0" && r.week === "2h30" && r.all === "2h30" && r.allPills === "40 QCM1 Colle · 25 QCM", "cartes : " + JSON.stringify(r));
  assert(r.dayW < r.dayGridW * 0.35 && r.weekW < r.weekGridW * 0.45, "une carte seule s'étire sur la rangée : " + JSON.stringify(r));
});

/* ═══════════════════ Graphique « Temps de travail » ═══════════════════ */
await S("G1", "graphique : 3 parts empilées, échelle fixe, légende à bascule SANS changer l'échelle, aucune reconstruction fenêtre ouverte (une seule à la fermeture)", async () => {
  const { page } = await statsUser();
  await page.evaluate(async () => { const t = window.p1WorkSessions.todayKey(); await window.p1WorkSessions.addSession({ date: t, label: "QCM", minutes: 90 }); await window.p1WorkSessions.addTraining({ date: t, typeId: "qcm", count: 1, minutes: 60 }); });
  await sleep(1500);
  await page.evaluate(() => window.p1RefreshWeeklyChart()); await sleep(1500);
  const ch = await page.evaluate(() => { const c = Chart.getChart("chart-time-weekly"); return { labels: c.data.datasets.map((d) => d.label), stacked: c.options.scales.y.stacked, max: c.options.scales.y.max, step: c.options.scales.y.ticks.stepSize, min: c.options.scales.y.min, width: Math.round(c.scales.y.width) }; });
  assert(ch.labels.join("|") === "Tours|Sessions de travail|Entraînements" && ch.stacked === true && ch.max === 3 && ch.step === 1 && ch.min === 0 && ch.width === 46, "graphique : " + JSON.stringify(ch));
  const chips = await page.evaluate(() => [...document.querySelectorAll(".ws-time-legend .ws-time-chip")].map((b) => ({ on: b.getAttribute("aria-pressed"), h: Math.round(b.getBoundingClientRect().height), t: b.textContent.replace(/\s+/g, " ").trim() })));
  assert(chips.length === 3 && chips.every((c) => c.on === "true" && c.h >= 24) && /Tours.*0h00/.test(chips[0].t) && /Sessions.*1h30/.test(chips[1].t) && /Entraînements.*1h00/.test(chips[2].t), "légende : " + JSON.stringify(chips));
  const geo = () => page.evaluate(() => { const c = Chart.getChart("chart-time-weekly"); return { max: c.scales.y.max, w: c.scales.y.width, left: c.chartArea.left, top: c.chartArea.top }; });
  const before = await geo();
  for (const i of [1, 2, 0]) { await page.evaluate((k) => document.querySelector(`.ws-time-chip[data-i="${k}"]`).click(), i); await page.waitForFunction(() => !Chart.animator.running(Chart.getChart("chart-time-weekly")), { timeout: 8000 }); }
  const after = await geo();
  assert(JSON.stringify(before) === JSON.stringify(after), "l'échelle/zone de tracé a bougé : " + JSON.stringify({ before, after }));
  assert(await page.evaluate(() => [...document.querySelectorAll(".ws-time-legend .ws-time-chip")].every((b) => b.getAttribute("aria-pressed") === "false")), "toutes les parts masquées : aria-pressed attendu faux");
  for (const i of [1, 2, 0]) { await page.evaluate((k) => document.querySelector(`.ws-time-chip[data-i="${k}"]`).click(), i); await page.waitForFunction(() => !Chart.animator.running(Chart.getChart("chart-time-weekly")), { timeout: 8000 }); }
  const b0 = await page.evaluate(() => window.p1ChartBuilds);
  await openWork(page, false); await sleep(600);
  await page.evaluate(() => window.p1WorkSessions.addSession({ date: window.p1WorkSessions.todayKey(), label: "Fiches", minutes: 30 }));
  await sleep(1500);
  assert((await page.evaluate(() => window.p1ChartBuilds)) === b0, "graphique reconstruit fenêtre ouverte");
  await page.evaluate(() => window.p1WorkSessions.close()); await sleep(1500);
  const b2 = await page.evaluate(() => window.p1ChartBuilds);
  assert(b2 === b0 + 1, "reconstructions à la fermeture : " + (b2 - b0) + " (1 attendue)");
  await openWork(page, false); await sleep(600); await page.evaluate(() => window.p1WorkSessions.close()); await sleep(1500);
  assert((await page.evaluate(() => window.p1ChartBuilds)) === b2, "reconstruction inutile à la fermeture sans changement");
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
});

await S("H-A", "légende : masquer / ré-afficher une part est ANIMÉ (animation active ET part encore visible pendant le fondu)", async () => {
  const { page } = await statsUser();
  await page.evaluate(async () => { const t = window.p1WorkSessions.todayKey(); await window.p1WorkSessions.addSession({ date: t, label: "QCM", minutes: 90 }); await window.p1WorkSessions.addTraining({ date: t, typeId: "qcm", count: 1, minutes: 60 }); window.p1RefreshWeeklyChart(); });
  await sleep(2500);
  for (const i of [2, 1]) {
    const run = await page.evaluate((k) => new Promise((res) => {
      const c = Chart.getChart("chart-time-weekly"); const seen = []; document.querySelector(`.ws-time-chip[data-i="${k}"]`).click();
      const t0 = performance.now(); const iv = setInterval(() => { seen.push({ running: Chart.animator.running(c), visible: !!c.getDatasetMeta(k).visible }); if (performance.now() - t0 > 600) { clearInterval(iv); res({ ok: seen.some((s) => s.running && s.visible), n: seen.length }); } }, 15);
    }), i);
    assert(run.ok, `[part ${i}] masquage non animé : ${JSON.stringify(run)}`);
    await page.waitForFunction(() => !Chart.animator.running(Chart.getChart("chart-time-weekly")), { timeout: 8000 });
    assert(await page.evaluate((k) => !Chart.getChart("chart-time-weekly").getDatasetMeta(k).visible, i), `[part ${i}] pas masquée à la fin`);
    await page.evaluate((k) => document.querySelector(`.ws-time-chip[data-i="${k}"]`).click(), i);
    await page.waitForFunction(() => !Chart.animator.running(Chart.getChart("chart-time-weekly")), { timeout: 8000 });
  }
});

/* ═══════════════════ Hauteur fixe de la fenêtre Entraînements ═══════════════════ */
await S("H-B", "fenêtre Entraînements : hauteur de la fenêtre, du cadre de la liste et du récap IDENTIQUES (< 1 px) avec 0, 1 … 4 types et de gros nombres ; message « vide » en fondu", async () => {
  const { page } = await statsUser();
  for (const [label, w, h] of [["PC", 1280, 900], ["iPad", 820, 1180], ["tél. 390", 390, 844], ["tél. 360", 360, 740]]) {
    await page.setViewport({ width: w, height: h });
    await openTrain(page, false); await sleep(1200);
    const M = () => page.evaluate(() => { const r = (s) => Math.round(document.querySelector(s).getBoundingClientRect().height * 10) / 10; return { modal: r("#p1TrModal"), list: r("#p1TrListBox"), recap: r("#p1TrBody .ws-summary") }; });
    const states = [await M()];
    const t = await page.evaluate(() => window.p1WorkSessions.todayKey());
    let k = 0;
    for (const id of ["qcm", "annale", "colle", "concours-blanc"]) {
      if (k === 0) {
        const ops = await page.evaluate((d) => new Promise((res) => {
          const el = document.getElementById("p1TrEmpty"); const seen = [parseFloat(getComputedStyle(el).opacity)];
          window.p1WorkSessions.addTraining({ date: d, typeId: "qcm", count: 12, minutes: 20 });
          getComputedStyle(el).opacity;
          const tr = el.getAnimations().filter((a) => a.transitionProperty === "opacity").map((a) => a.effect.getTiming().duration);
          const t0 = performance.now(); const iv = setInterval(() => { seen.push(parseFloat(getComputedStyle(el).opacity)); if (performance.now() - t0 > 700) { clearInterval(iv); res({ tr, seen }); } }, 15);
        }), t);
        assert(ops.tr.length === 1 && ops.tr[0] === 160 && ops.seen[0] === 1 && ops.seen[ops.seen.length - 1] === 0, `[${label}] pas de fondu du message vide : ${JSON.stringify(ops)}`);
      } else await page.evaluate((i, d, n) => window.p1WorkSessions.addTraining({ date: d, typeId: i, count: n, minutes: 20 }), id, t, k === 3 ? 999 : 12);
      k++; await sleep(900); states.push(await M());
    }
    for (const key of ["modal", "list", "recap"]) {
      const vals = states.map((s) => s[key]);
      assert(Math.max(...vals) - Math.min(...vals) < 1, `[${label}] hauteur « ${key} » variable : ${JSON.stringify(vals)}`);
    }
    await page.evaluate(async (d) => { const w = window.p1WorkSessions; for (const g of Object.values(w.trainingGroups(d))) for (const id of g.ids) await w.remove(id); }, t);
    await sleep(1800);
    const back = await M();
    assert(Math.abs(back.list - states[0].list) < 1 && Math.abs(back.recap - states[0].recap) < 1 && Math.abs(back.modal - states[0].modal) < 1, `[${label}] retour au vide : ${JSON.stringify({ back, first: states[0] })}`);
    assert(await page.evaluate(() => getComputedStyle(document.getElementById("p1TrEmpty")).opacity === "1"), `[${label}] message vide pas revenu`);
    await page.evaluate(() => window.p1WorkSessions.close()); await sleep(600);
  }
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
});

await S("H-C", "fenêtre Temps de travail : ligne « Entraînement » = libellé + « Voir » + temps, sans parenthèse ni détail", async () => {
  const { page } = await statsUser();
  await page.evaluate(async () => { const t = window.p1WorkSessions.todayKey(); await window.p1WorkSessions.addTraining({ date: t, typeId: "qcm", count: 2, minutes: 20 }); await window.p1WorkSessions.addTraining({ date: t, typeId: "annale", count: 1, minutes: 30 }); });
  await sleep(800); await openWork(page, false); await sleep(1200);
  const row = await page.evaluate(() => { const p = document.getElementById("p1WsSeeTr").closest(".ws-part"); const v = document.getElementById("p1WsSeeTr"); return { txt: p.textContent.replace(/\s+/g, " ").trim(), time: document.getElementById("p1WsTrTime").textContent, seeVisible: !v.hidden && v.getBoundingClientRect().width > 20 }; });
  assert(row.txt === "EntraînementVoir0h50" && row.time === "0h50" && row.seeVisible && !/[()]/.test(row.txt), "ligne Entraînement : " + JSON.stringify(row));
});

/* ═══════════════════ Mode compact ═══════════════════ */
const seedTour = async (u, mins) => adb.doc(`users/${u.uid}/courses/c1`).set({ tourCount: 1, tourConfidences: [3], tourDates: [localKey()], tourDurations: [mins], tourSupports: [null] }, { merge: true });
await S("H-D1", "mode compact : détaillé = 3 parts / 1h35 ; bascule = pas de ligne Tours, 0h50, 2 parts ; retour détaillé = tout revient", async () => {
  const { page } = await statsUser({ seed: (u) => seedTour(u, "0:45") });
  await page.evaluate(async () => { const t = window.p1WorkSessions.todayKey(); await window.p1WorkSessions.addSession({ date: t, label: "QCM", minutes: 30 }); await window.p1WorkSessions.addTraining({ date: t, typeId: "qcm", count: 1, minutes: 20 }); });
  await sleep(2500);
  const snap = async () => {
    await page.evaluate(() => window.p1RefreshWeeklyChart()); await sleep(1800);
    await openWork(page, false); await sleep(900);
    const r = await page.evaluate(() => { const c = Chart.getChart("chart-time-weekly"); return { card: document.getElementById("stat-time-today").textContent, week: document.getElementById("weekly-time-total").textContent, parts: c.data.datasets.map((d) => d.label), chips: document.querySelectorAll(".ws-time-legend .ws-time-chip").length, toursRow: !document.getElementById("p1WsToursTime").closest(".ws-part").hidden, total: document.getElementById("p1WsTotal").textContent, sub: document.getElementById("p1WsSubtitle").textContent, colors: c.data.datasets.map((d) => d.borderColor) }; });
    await page.evaluate(() => window.p1WorkSessions.close()); await sleep(700);
    return r;
  };
  const d1 = await snap();
  assert(d1.card === "1h35" && d1.week === "1h35" && d1.parts.length === 3 && d1.chips === 3 && d1.toursRow && d1.total === "1h35", "détaillé : " + JSON.stringify(d1));
  await page.evaluate(() => window.toggleToursMode()); await page.waitForFunction(() => window.getToursViewMode() === "compact", { timeout: 8000 }); await sleep(2500);
  const d2 = await snap();
  assert(d2.card === "0h50" && d2.week === "0h50" && d2.parts.join("|") === "Sessions de travail|Entraînements" && d2.chips === 2 && !d2.toursRow && d2.total === "0h50" && d2.sub === "Sessions de travail + entraînements", "compact : " + JSON.stringify(d2));
  assert(d2.colors[0] === d1.colors[1] && d2.colors[1] === d1.colors[2], "la couleur doit suivre la part, pas sa position : " + JSON.stringify({ d1: d1.colors, d2: d2.colors }));
  await page.evaluate(() => window.toggleToursMode()); await page.waitForFunction(() => window.getToursViewMode() === "classic", { timeout: 8000 }); await sleep(2500);
  const d3 = await snap();
  assert(d3.card === "1h35" && d3.week === "1h35" && d3.parts.length === 3 && d3.toursRow && d3.total === "1h35", "retour détaillé : " + JSON.stringify(d3));
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
});

await S("H-D2", "compte déjà en compact sur téléphone 390 : pas de ligne Tours, 2 parts, pas de défilement horizontal de la fenêtre", async () => {
  const u = await mkUser({ courses: 1 });
  await seedTour(u, "0:45");
  const ctx = await openPage(browser, u); const page = ctx.page;
  await page.bringToFront(); await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await page.waitForFunction(() => window.p1WorkSessions && window.currentUser, { timeout: 20000 });
  await page.evaluate(() => window.toggleToursMode()); await page.waitForFunction(() => window.getToursViewMode() === "compact", { timeout: 8000 }); await sleep(1500);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await sleep(3000);
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await page.waitForFunction(() => window.p1WorkSessions && window.p1WorkSessions.ready() && document.getElementById("p1TrCard"), { timeout: 30000 });
  await page.evaluate(async () => { document.querySelector('[data-page="stats"]').click(); const t = window.p1WorkSessions.todayKey(); await window.p1WorkSessions.addSession({ date: t, label: "QCM", minutes: 30 }); await window.p1WorkSessions.addTraining({ date: t, typeId: "qcm", count: 1, minutes: 20 }); });
  await sleep(2500);
  await page.evaluate(() => { window.p1RefreshWeeklyChart(); window.p1WorkSessions.openWork(); }); await sleep(2200);
  const r = await page.evaluate(() => { const c = Chart.getChart("chart-time-weekly"), body = document.getElementById("p1WsBody"), mod = document.getElementById("p1WsModal"); return { mode: window.getToursViewMode(), tours: document.getElementById("p1WsToursTime").closest(".ws-part").hidden, parts: c.data.datasets.length, card: document.getElementById("stat-time-today").textContent, hs: body.scrollWidth > body.clientWidth + 1 || mod.scrollWidth > mod.clientWidth + 1 }; });
  assert(r.mode === "compact" && r.tours && r.parts === 2 && r.card === "0h50" && !r.hs, "compact tél. : " + JSON.stringify(r));
});

/* ═══════════════════ Nouveautés ═══════════════════ */
await S("N1", "Nouveautés : un compte qui avait lu la v6 revoit la pastille ; « Police et thème » en tête, puis « Flammes », puis « Sessions de travail » ; plus de pastille après lecture", async () => {
  const u = await mkUser();
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ whatsNewSeen_v6: true }, { merge: true });
  const { page } = await openPage(browser, u);
  await page.bringToFront();
  await page.waitForFunction(() => window.currentUser, { timeout: 15000 });
  await sleep(2500);
  assert(await page.evaluate(() => document.getElementById("whats-new-badge").classList.contains("show")), "pastille Nouveautés absente alors que la v7 n'est pas lue");
  const h = await page.evaluate(() => [...document.querySelectorAll(".whats-new-modal-body .whats-new-section h4")].slice(0, 3).map((x) => x.textContent));
  assert(/Police et thème/.test(h[0]) && /Flammes/.test(h[1]) && /Sessions de travail et entraînements/.test(h[2]), "ordre : " + JSON.stringify(h));
  await page.evaluate(() => window.openWhatsNewModal && window.openWhatsNewModal()); await sleep(600);
  await page.evaluate(() => window.closeWhatsNewModal && window.closeWhatsNewModal()); await sleep(1500);
  assert(!(await page.evaluate(() => document.getElementById("whats-new-badge").classList.contains("show"))), "pastille encore affichée après lecture");
  assert((await adb.doc(`users/${u.uid}/settings/preferences`).get()).data().whatsNewSeen_v7 === true, "whatsNewSeen_v7 non enregistré");
});

/* ═══════════════════ Pastilles = vrais boutons ═══════════════════ */
const csGet = (page, sel, props) => page.evaluate((s, ps) => { const e = document.querySelector(s); const c = getComputedStyle(e); const o = {}; ps.forEach((p) => (o[p] = c[p])); return o; }, sel, props);
async function waitCs(page, sel, props, pred, what) {
  let v; const t0 = Date.now();
  while (Date.now() - t0 < 4000) { v = await csGet(page, sel, props); if (pred(v)) return v; await sleep(80); }
  throw new Error(`${what} : ${JSON.stringify(v)}`);
}
const center = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const declaredBorder = (page) => page.evaluate(() => { for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.selectorText === ".ws-chips .ws-chip") { const m = /border:\s*([\d.]+px)/.exec(r.style.cssText); return m && m[1]; } } catch (e) {} } return null; });

for (const theme of ["light", "dark"]) {
  await S("P1-" + theme, `pastilles des sessions (${theme}) : repos / survol / appui / actif / rebond mesurés à la souris réelle`, async () => {
    const { page } = await statsUser({ viewport: { width: 1280, height: 900, deviceScaleFactor: 2 } });
    if (theme === "dark") await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await openWork(page, true); await sleep(1500);
    const T = '#p1WsTypeChips .ws-chip[data-type="Fiches"]';
    const rest = await csGet(page, T, ["borderTopColor", "backgroundColor", "boxShadow", "cursor", "touchAction", "userSelect"]);
    const h = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().height, T);
    assert((await declaredBorder(page)) === "1.5px" && rest.boxShadow !== "none" && rest.cursor === "pointer" && rest.touchAction === "manipulation" && rest.userSelect === "none" && h >= 34, "repos : " + JSON.stringify({ rest, h }));
    if (theme === "light") assert(rest.borderTopColor === "rgb(209, 213, 219)" && rest.backgroundColor === "rgb(255, 255, 255)", "repos clair : " + JSON.stringify(rest));
    else assert(rest.borderTopColor === "rgb(71, 85, 105)", "repos sombre : " + JSON.stringify(rest));
    const c = await center(page, T);
    await page.mouse.move(c.x, c.y);
    await waitCs(page, T, ["borderTopColor", "backgroundColor", "transform"], (v) => v.borderTopColor === (theme === "light" ? "rgb(245, 158, 11)" : "rgb(71, 85, 105)") && v.backgroundColor === (theme === "light" ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.18)") && v.transform === "matrix(1, 0, 0, 1, 0, -1)", "survol");
    await page.mouse.down();
    await waitCs(page, T, ["transform", "boxShadow", "backgroundColor"], (v) => v.transform === "matrix(0.95, 0, 0, 0.95, 0, 0)" && (theme === "dark" || (v.boxShadow === "none" && v.backgroundColor === "rgba(245, 158, 11, 0.22)")), "appui");   // sombre : comme la référence, seule la réduction s'applique (la teinte de survol reste)
    await page.evaluate(() => { window.__pop = false; new MutationObserver((m) => m.forEach((r) => { if (r.target.classList && r.target.classList.contains("is-pop")) window.__pop = true; })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] }); });
    await page.mouse.up();
    await waitCs(page, T, ["backgroundColor", "color"], (v) => v.backgroundColor === "rgb(217, 119, 6)" && (theme === "dark" ? true : v.color === "rgb(255, 255, 255)"), "choix actif, souris dessus (teinte de survol)");
    assert((await page.evaluate((s) => document.querySelector(s).getAttribute("aria-pressed"), T)) === "true" && (await page.evaluate(() => window.__pop)), "aria-pressed / is-pop");
    await page.mouse.move(5, 5);
    const on = await waitCs(page, T, ["backgroundColor", "color", "boxShadow"], (v) => v.backgroundColor === "rgb(245, 158, 11)" && v.boxShadow !== "none", "choix actif au repos");
    if (theme === "light") assert(on.color === "rgb(255, 255, 255)", "texte du choix actif : " + on.color);
    assert((await page.evaluate(() => document.getElementById("p1WsType").value)) === "Fiches", "la pastille n'a pas rempli le champ de type");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
}

await S("P2", "petite fenêtre « nombre + temps » : couleur du type choisi, pas d'« Annuler », bouton d'ajout pleine largeur, ajout referme la zone, 2e clic sur le type et Échap referment (sans fermer la fenêtre)", async () => {
  const { u, page } = await statsUser();
  await jsClick(page, "#p1TrCardPlus");
  await page.waitForSelector("#p1TrOverlay.active", { timeout: 5000 }); await sleep(1200);
  await page.click("#p1WsTrannale");
  await page.waitForFunction(() => { const z = document.getElementById("p1WsQi"); return z.classList.contains("is-open") && z.getAnimations({ subtree: true }).length === 0; }, { timeout: 8000 });
  assert(!/Annuler/i.test(await txt(page, "#p1WsQi")), "bouton « Annuler » présent");
  const m = await page.evaluate(() => { const card = document.querySelector("#p1WsQi .ws-tr-qi-card"), z = card.getBoundingClientRect(), b = document.getElementById("p1WsQiOk").getBoundingClientRect(), pad = parseFloat(getComputedStyle(card).paddingLeft), bc = getComputedStyle(card).borderTopColor; return { l: b.left - z.left - 1.5, r: z.right - 1.5 - b.right, pad, bc, rgb: getComputedStyle(document.getElementById("p1WsQi")).getPropertyValue("--k-rgb").trim() }; });
  assert(Math.abs(m.l - m.pad) <= 1.5 && Math.abs(m.r - m.pad) <= 1.5, "marges du bouton d'ajout : " + JSON.stringify(m));
  assert(m.rgb === "13, 148, 136" && /13, 148, 136/.test(m.bc), "couleur du type (annale = vert d'eau) : " + JSON.stringify(m));
  await page.evaluate(() => { document.querySelector('#p1WsQiNChips .ws-chip[data-n="30"]').click(); document.querySelector('#p1WsQiTChips .ws-chip[data-min="120"]').click(); });
  assert((await page.evaluate(() => document.querySelector('#p1WsQiNChips .ws-chip[aria-pressed="true"]').textContent)) === "30 QCM", "pastille du nombre");
  await page.click("#p1WsQiOk");
  await page.waitForFunction(() => !document.getElementById("p1WsQi").classList.contains("is-open"), { timeout: 8000 });
  const docs = await waitDocs(u.uid, (d) => d.length === 1);
  assert(docs.length === 1 && docs[0].kind === "annale" && docs[0].count === 30 && docs[0].minutes === 120, "document : " + JSON.stringify(docs));
  const open = () => page.evaluate(() => document.getElementById("p1WsQi").classList.contains("is-open"));
  await sleep(700); await page.click("#p1WsTrcolle"); await sleep(800); assert(await open(), "zone non ouverte");
  await sleep(700); await page.click("#p1WsTrcolle"); await sleep(800); assert(!(await open()), "2e clic sur le type : zone non refermée");
  await sleep(700); await page.click("#p1WsTrqcm"); await sleep(800); assert(await open(), "zone QCM non ouverte");
  await page.click("#p1WsTrcolle"); await sleep(800);   // changer de type : la zone reste ouverte, réinitialisée, couleur du nouveau type
  assert((await open()) && (await txt(page, "#p1WsQiNLabel")) === "Nombre de QCM (1 colle)", "changement de type : " + (await txt(page, "#p1WsQiNLabel")));
  await page.keyboard.press("Escape"); await sleep(700);
  const st = await page.evaluate(() => ({ zone: document.getElementById("p1WsQi").classList.contains("is-open"), win: document.getElementById("p1TrOverlay").classList.contains("active") }));
  assert(!st.zone && st.win, "Échap : " + JSON.stringify(st));
  await page.keyboard.press("Escape"); await sleep(800);
  assert(!(await page.evaluate(() => document.getElementById("p1TrOverlay").classList.contains("active"))), "2e Échap : fenêtre non fermée");
  assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
});

await S("P3", "téléphone 390 (tactile) : (hover:hover) faux, aucun survol collé, pastilles >= 34 px, fenêtre PLEIN ÉCRAN, pas de défilement horizontal", async () => {
  const { page } = await statsUser({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  await page.evaluate(() => window.p1WorkSessions.openWork({ mode: "add" }));
  await sleep(1800);
  assert(await page.evaluate(() => !matchMedia("(hover: hover)").matches), "(hover: hover) vrai en émulation tactile");
  const Q = '#p1WsTypeChips .ws-chip[data-type="QCM"]', F = '#p1WsTypeChips .ws-chip[data-type="Fiches"]';
  // le défilement doux vers « Ajouter » doit être FINI avant de viser une pastille (sinon le toucher part à côté)
  await page.waitForFunction(() => new Promise((res) => { const b = document.getElementById("p1WsBody"); const y0 = b.scrollTop; setTimeout(() => res(Math.abs(b.scrollTop - y0) < 1), 250); }), { timeout: 10000, polling: 300 });
  const a = await center(page, Q); await page.touchscreen.tap(a.x, a.y);
  await waitCs(page, Q, ["backgroundColor"], (v) => v.backgroundColor === "rgb(245, 158, 11)", "QCM actif après tap");
  await sleep(800);
  const b = await center(page, F); await page.touchscreen.tap(b.x, b.y);
  await waitCs(page, F, ["backgroundColor"], (v) => v.backgroundColor === "rgb(245, 158, 11)", "Fiches actif après tap");
  await waitCs(page, Q, ["transform", "backgroundColor"], (v) => v.transform === "none" && v.backgroundColor === "rgb(255, 255, 255)", "pastille quittée pas revenue au repos (survol collé ?)");
  const m = await page.evaluate(() => {
    const chips = [...document.querySelectorAll("#p1WsAdd .ws-chip")].map((p) => p.getBoundingClientRect().height);
    const mod = document.getElementById("p1WsModal").getBoundingClientRect(), body = document.getElementById("p1WsBody"), bt = document.getElementById("p1WsAddBtn").getBoundingClientRect(), bx = document.getElementById("p1WsAdd").getBoundingClientRect();
    return { minChip: Math.min.apply(null, chips), full: Math.abs(mod.width - innerWidth) < 1 && Math.abs(mod.height - innerHeight) < 2, btnW: bt.width, boxW: bx.width, hs: body.scrollWidth > body.clientWidth + 1 };
  });
  assert(m.minChip >= 33 && m.full && m.btnW > m.boxW - 40 && !m.hs, "mesures tél. : " + JSON.stringify(m));
});

/* ═══════════════════ Bouton « Du jour » (page Entraînements) ═══════════════════ */
await S("E3", "page Entraînements : « Du jour » (pastilles PC / badge numérique <= 1024) sans chevauchement du « ? » ni de la pagination, de 1280 à 360 px", async () => {
  const { page } = await statsUser();
  await page.evaluate(async () => { const w = window.p1WorkSessions, t = w.todayKey(); await w.addTraining({ date: t, typeId: "qcm", count: 2, minutes: 30 }); await w.addTraining({ date: t, typeId: "colle", count: 1, minutes: 30 }); document.querySelector('[data-page="entrainements"]').click(); });
  for (const [w, h] of [[1280, 900], [820, 1180], [390, 844], [360, 740]]) {
    await page.setViewport({ width: w, height: h }); await sleep(1000);
    const r = await page.evaluate(() => {
      const R = (s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width }; };
      const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
      const today = R("#p1TrHeadBtn"), add = R(".train-add-main-btn"), pag = R("#train-header-pagination"), help = R("#page-entrainements .train-section-header-sticky .help-icon");
      const pills = getComputedStyle(document.getElementById("p1TrHeadPills")).display, badge = getComputedStyle(document.getElementById("p1TrHeadBadge")).display;
      return { overlaps: [hit(today, add), hit(today, pag), hit(help, pag), hit(today, help)], pills, badge, txt: document.getElementById("p1TrHeadBadge").textContent, pillsTxt: document.getElementById("p1TrHeadPills").textContent.replace(/\s+/g, " ").trim() };
    });
    assert(r.overlaps.every((v) => !v), `[${w}] chevauchement : ${JSON.stringify(r)}`);
    if (w > 1024) assert(r.pills !== "none" && /2 QCM/.test(r.pillsTxt) && /1 Colle/.test(r.pillsTxt), `[${w}] pastilles absentes : ${JSON.stringify(r)}`);
    else assert(r.pills === "none" && r.badge !== "none" && r.txt === "3", `[${w}] badge numérique attendu : ${JSON.stringify(r)}`);
  }
});

} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
