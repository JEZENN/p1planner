/* Note sur 20 des entraînements (29/10/2026) : colonne « Note /20 » entre « Statut » et « Actions », saisie directe dans la case (sans fenêtre), pastille rouge → vert.
   Champ OPTIONNEL « score » (0 à 20, 2 décimales) de chaque document users/{uid}/trainingItems/{id} ; pas de note = pas de champ (jamais null).
   Vraie page + émulateurs. Lancer : node test/e2e/train-score.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; SCORESHOTS=1 pour les captures) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const M = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const PC = { width: 1366, height: 900 };
const shot = async (page, name) => { if (process.env.SCORESHOTS) await page.screenshot({ path: `docs/captures-15-10/note-entrainements-${name}.png` }); };

/* 8 entraînements : titres courts (lignes d'une seule ligne) + un long. Types : colle / qcm / annale. */
const SEED = [
  [8001, "colle", "Colle A"], [8002, "qcm", "QCM B"], [8003, "annale", "Annale C"], [8004, "colle", "Colle D"],
  [8005, "qcm", "QCM E"], [8006, "annale", "Annale F"], [8007, "colle", "Colle G"], [8008, "qcm", "QCM H"],
];
const BASE = (id, type, title) => ({ id, title, type, matiere: "s1", plateforme: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() });

async function open({ vp = PC, theme = "light", seed = SEED, scores = {}, prefs = {} } = {}) {
  const u = await mkUser({ courses: 1 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...prefs }, { merge: true });
  for (const [id, type, title] of seed) await adb.doc(`users/${u.uid}/trainingItems/${id}`).set({ ...BASE(id, type, title), ...(scores[id] != null ? { score: scores[id] } : {}) });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t), theme); await sleep(500); }
  await page.evaluate(() => document.querySelector('[data-page="entrainements"]').click()); await sleep(1200);
  await page.waitForFunction((n) => document.querySelectorAll("#train-table-body tr").length >= n, { timeout: 25000 }, seed.length);
  return { u, page };
}
const badge = (id) => `#train-table-body tr[data-train-id="${id}"] .p1-score-badge`;
const field = (id) => `#train-table-body tr[data-train-id="${id}"] .p1-score-input`;
const doc = async (u, id) => (await adb.doc(`users/${u.uid}/trainingItems/${id}`).get()).data();
const clickBadge = async (page, id) => { await page.click(badge(id)); await page.waitForSelector(field(id), { timeout: 5000 }); };
const val = (page, id) => page.evaluate((s) => document.querySelector(s) && document.querySelector(s).value, field(id));
const mem = (page, id) => page.evaluate((i) => { const t = window.userData.trainings.find((x) => x.id === i); return t && ("score" in t ? t.score : "ABSENT"); }, id);
const txt = (page, id) => page.evaluate((s) => { const b = document.querySelector(s); return b && { t: b.textContent.replace(/\s+/g, ""), cls: b.className, aria: b.getAttribute("aria-label") }; }, badge(id));
const waitDoc = async (u, id, pred, ms = 8000) => { for (let i = 0; i < ms / 200; i++) { const d = await doc(u, id); if (pred(d)) return d; await sleep(200); } return doc(u, id); };
/* tape « s » dans le champ ouvert, remet à vide d'abord */
const typeIn = async (page, id, s) => { await page.evaluate((q) => { const i = document.querySelector(q); i.focus(); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); }, field(id)); await page.keyboard.type(s); return val(page, id); };
const typeIn2 = async (page, v) => { await page.evaluate(() => { const i = document.querySelector("#trainNotesModalInner .p1-score-input"); i.focus(); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); }); if (v) await page.keyboard.type(v); return page.evaluate(() => document.querySelector("#trainNotesModalInner .p1-score-input").value); };
const lum = (rgb) => { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const rgbOf = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

try {
  /* ═════════ TS1 : place de la colonne, « — » sans note ═════════ */
  await S("TS1", "colonne « Note /20 » entre « Statut » et « Actions » ; en-tête triable sur une ligne ; sans note : « — » discret, aria-label explicite", async () => {
    const { page } = await open();
    const r = await page.evaluate(() => {
      const ths = [...document.querySelectorAll("#train-thead-row th")], row = document.querySelector("#train-table-body tr");
      const th = ths[5], hs = ths.map((x) => Math.round(x.getBoundingClientRect().height));
      const b = row.children[5].querySelector(".p1-score-badge");
      return { heads: ths.map((x) => x.textContent.replace(/\s+/g, " ").trim()), sort: th.dataset.sort, cls: th.className, hs, thOver: th.scrollWidth > th.clientWidth + 1, cell: row.children[5].className, btnTag: b && b.tagName, t: b && b.textContent, empty: b && b.classList.contains("is-empty"), aria: b && b.getAttribute("aria-label"), cols: row.children.length };
    });
    assert(r.heads.join("|") === "Type|Plateforme|Intitulé|Matière|Statut|Note /20|Actions", "en-têtes : " + r.heads.join("|"));
    assert(r.sort === "score" && /p1-score-th/.test(r.cls), "tri : " + r.sort + " / " + r.cls);
    assert(Math.max(...r.hs) - Math.min(...r.hs) <= 1 && !r.thOver, "en-tête « Note /20 » sur plusieurs lignes ou rogné : " + JSON.stringify(r));
    assert(r.cols === 7 && r.btnTag === "BUTTON" && r.empty && r.t === "—", "case sans note : " + JSON.stringify(r));
    assert(/Pas de note/.test(r.aria), "aria-label sans note : " + r.aria);
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    await shot(page, "PC-vide");
  });

  /* ═════════ TS2 : « 14,5 » + Entrée ═════════ */
  await S("TS2", "« 14,5 » + Entrée : pastille « 14,5 » au palier 8, aria-label « Note : 14,5 sur 20 — modifier », score = 14.5 (nombre) en base, aucun autre champ modifié", async () => {
    const { u, page } = await open();
    const before = await doc(u, 8002);
    await clickBadge(page, 8002);
    await page.keyboard.type("14,5"); await page.keyboard.press("Enter");
    await page.waitForSelector(badge(8002) + ".s8", { timeout: 5000 });
    const t = await txt(page, 8002);
    assert(/^14,5(\/20)?$/.test(t.t) && /s8/.test(t.cls) && t.aria === "Note : 14,5 sur 20 — modifier", "pastille : " + JSON.stringify(t));
    const after = await waitDoc(u, 8002, (d) => d.score === 14.5);
    assert(after.score === 14.5 && typeof after.score === "number", "score en base : " + JSON.stringify(after.score));
    const diff = Object.keys({ ...before, ...after }).filter((k) => k !== "updatedAt" && k !== "score" && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    assert(diff.length === 0, "autres champs modifiés : " + diff.join());
    assert((await mem(page, 8002)) === 14.5, "mémoire : " + (await mem(page, 8002)));
    const others = await Promise.all([8001, 8003].map((i) => doc(u, i)));
    assert(others.every((d) => !("score" in d)), "un autre entraînement a reçu un champ score");
    await shot(page, "PC-note");
  });

  /* ═════════ TS3 : filtre de frappe ═════════ */
  await S("TS3", "filtre de frappe : 21→2, 25→2, 20,5→20,, 1,234→1,23, -3→3, abc→vide, collage invalide refusé ; flash rouge ; 20 et 14.25 acceptés", async () => {
    const { page } = await open();
    await clickBadge(page, 8001);
    const bad = [];
    for (const [typed, exp] of [["21", "2"], ["25", "2"], ["20,5", "20,"], ["1,234", "1,23"], ["-3", "3"], ["abc", ""], ["20", "20"], ["14.25", "14.25"], ["14,", "14,"], ["0", "0"], ["007", "00"]]) {
      const got = await typeIn(page, 8001, typed);
      if (got !== exp) bad.push(`« ${typed} » → « ${got} » (attendu « ${exp} »)`);
    }
    const flash = await page.evaluate(() => { const w = document.querySelector(".p1-score-edit"); const i = document.querySelector(".p1-score-input"); i.value = "5"; i.dispatchEvent(new Event("input", { bubbles: true })); w.classList.remove("is-bad"); i.focus(); document.execCommand("insertText", false, "99"); return { bad: w.classList.contains("is-bad"), v: i.value }; });
    if (flash.v !== "5" || !flash.bad) bad.push("« 5 » + frappe invalide « 99 » : " + JSON.stringify(flash));
    const paste = await page.evaluate(() => { const i = document.querySelector(".p1-score-input"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); i.focus(); document.execCommand("insertText", false, "abc21"); return i.value; });
    if (paste !== "") bad.push("collage « abc21 » → « " + paste + " »");
    const paste2 = await page.evaluate(() => { const i = document.querySelector(".p1-score-input"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); i.focus(); document.execCommand("insertText", false, "12,5"); return i.value; });
    if (paste2 !== "12,5") bad.push("collage valide « 12,5 » → « " + paste2 + " »");
    assert(!bad.length, bad.join(" ; "));
    const caret = await page.evaluate(() => { const i = document.querySelector(".p1-score-input"); const cs = getComputedStyle(i); const p = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(); return { caret: cs.caretColor, ph: i.getAttribute("placeholder"), im: i.getAttribute("inputmode"), p, edge: getComputedStyle(document.querySelector(".p1-score-edit")).borderTopColor, suf: document.querySelector(".p1-score-suffix").textContent, sufInInput: i.parentElement.contains(document.querySelector(".p1-score-suffix")) && document.querySelector(".p1-score-suffix").parentElement !== i }; });
    assert(!caret.ph && caret.im === "decimal" && caret.suf === "/20" && caret.caret !== "auto", "champ de saisie : " + JSON.stringify(caret));
    await page.keyboard.press("Escape");
  });

  /* ═════════ TS4 : Entrée / Échap / clic ailleurs / vide ═════════ */
  await S("TS4", "Échap annule ; clic ailleurs enregistre ; champ vide supprime le champ « score » en base (jamais null, même après rechargement) ; « 14, » vaut 14", async () => {
    const { u, page } = await open({ scores: { 8003: 9 } });
    await clickBadge(page, 8003); await page.keyboard.type("17"); await page.keyboard.press("Escape"); await sleep(500);
    assert((await txt(page, 8003)).t.startsWith("9") && (await doc(u, 8003)).score === 9, "Échap n'a pas annulé");
    assert(!(await page.$(field(8003))), "le champ est resté ouvert après Échap");
    await clickBadge(page, 8004); await page.keyboard.type("11,25");
    await page.mouse.click(5, 300); await sleep(300);   // clic ailleurs (hors tableau)
    const d4 = await waitDoc(u, 8004, (d) => d.score === 11.25);
    assert(d4.score === 11.25 && (await txt(page, 8004)).t.startsWith("11,25"), "le clic ailleurs n'a pas enregistré : " + JSON.stringify(d4.score));
    await clickBadge(page, 8005); await page.keyboard.type("14,"); await page.keyboard.press("Enter");
    const d5 = await waitDoc(u, 8005, (d) => d.score === 14);
    assert(d5.score === 14 && /^14(\/20)?$/.test((await txt(page, 8005)).t), "« 14, » : " + JSON.stringify(d5.score) + " " + JSON.stringify(await txt(page, 8005)));
    /* effacer la note de 8003 (9) */
    await clickBadge(page, 8003); await typeIn(page, 8003, ""); await page.keyboard.press("Enter");
    const d3 = await waitDoc(u, 8003, (d) => !("score" in d));
    assert(!("score" in d3), "le champ score est toujours en base : " + JSON.stringify(d3.score));
    assert((await mem(page, 8003)) === "ABSENT" && (await txt(page, 8003)).t === "—", "mémoire / pastille après effacement : " + (await mem(page, 8003)));
    /* la note effacée ne ressuscite pas : rechargement complet */
    await page.reload({ waitUntil: "domcontentloaded" }); await sleep(2500);
    await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
    await page.evaluate(() => document.querySelector('[data-page="entrainements"]').click()); await sleep(1200);
    await page.waitForSelector(badge(8003), { timeout: 20000 });
    assert((await txt(page, 8003)).t === "—" && (await mem(page, 8003)) === "ABSENT" && !("score" in (await doc(u, 8003))), "la note effacée est revenue après rechargement");
    assert((await txt(page, 8004)).t.startsWith("11,25") && (await txt(page, 8005)).cls.includes("s7"), "notes perdues au rechargement");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ TS5 : redessin pendant la frappe, liste remplacée ═════════ */
  await S("TS5", "redessin pendant la frappe : champ recréé à l'identique (texte + curseur), un seul enregistrement ; liste remplacée pendant la frappe : la note n'est pas perdue (mémoire, base, pastille)", async () => {
    const { u, page } = await open();
    await clickBadge(page, 8006); await page.keyboard.type("1"); await page.keyboard.type("5");
    await page.evaluate((s) => { const i = document.querySelector(s); i.setSelectionRange(1, 1); window.__old = i; window.__writes = 0; const f = window._fsSetDoc; window._fsSetDoc = function () { if (/trainingItems\/8006$/.test(String(arguments[0] && arguments[0].path))) window.__writes++; return f.apply(this, arguments); }; }, field(8006));
    await page.evaluate(() => window.renderTrainTable());
    const st = await page.evaluate((s) => { const i = document.querySelector(s); return { same: i === window.__old, v: i && i.value, a: i && i.selectionStart, b: i && i.selectionEnd, focus: i && document.activeElement === i, gone: !!window.__old._gone, oldConnected: window.__old.isConnected, n: document.querySelectorAll(".p1-score-input").length }; }, field(8006));
    assert(!st.same && st.v === "15" && st.a === 1 && st.b === 1 && st.focus && st.gone && !st.oldConnected && st.n === 1, "champ recréé : " + JSON.stringify(st));
    await page.keyboard.type("2");   // « 1 » + « 2 » + « 5 » = « 125 » > 20 → refusé ; on insère « 0 » à la place
    assert((await val(page, 8006)) === "15", "frappe invalide acceptée après redessin : " + (await val(page, 8006)));
    await page.keyboard.type(","); await page.keyboard.type("5");   // « 1,55 »
    assert((await val(page, 8006)) === "1,55", "frappe après redessin : " + (await val(page, 8006)));
    await page.keyboard.press("Enter");
    const d = await waitDoc(u, 8006, (x) => x.score === 1.55);
    assert(d.score === 1.55, "score en base : " + d.score);
    await sleep(800);
    const w = await page.evaluate(() => window.__writes);
    assert(w === 1, "nombre d'écritures du document 8006 : " + w);
    /* liste remplacée (copie profonde) pendant la frappe */
    await clickBadge(page, 8007);
    await page.evaluate(() => { window.userData.trainings = JSON.parse(JSON.stringify(window.userData.trainings)); });
    await page.keyboard.type("12"); await page.keyboard.press("Enter");
    const d7 = await waitDoc(u, 8007, (x) => x.score === 12);
    assert(d7.score === 12, "note perdue (liste remplacée) — base : " + d7.score);
    assert((await mem(page, 8007)) === 12 && (await txt(page, 8007)).t.startsWith("12"), "mémoire / pastille : " + (await mem(page, 8007)) + " " + JSON.stringify(await txt(page, 8007)));
    /* idem avec Échap : la pastille se réaffiche à partir de la liste à jour */
    await page.evaluate(() => { window.__fresh = JSON.parse(JSON.stringify(window.userData.trainings)); });
    await clickBadge(page, 8008); await page.keyboard.type("3");
    await page.evaluate(() => { window.userData.trainings = JSON.parse(JSON.stringify(window.userData.trainings)); window.userData.trainings.find((x) => x.id === 8008).score = 7; });
    await page.keyboard.press("Escape"); await sleep(300);
    assert((await txt(page, 8008)).t.startsWith("7") && !(await page.$(field(8008))), "pastille après Échap (liste remplacée) : " + JSON.stringify(await txt(page, 8008)));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ TS6 : tri ═════════ */
  await S("TS6", "tri par « Note /20 » dans les deux sens : sans note premier en croissant, dernier en décroissant", async () => {
    const { page } = await open({ scores: { 8001: 5, 8002: 18, 8003: 12.5, 8005: 0 } });
    const order = () => page.evaluate(() => [...document.querySelectorAll("#train-table-body tr")].map((r) => r.dataset.trainId + ":" + r.querySelector(".p1-score-badge").textContent.replace(/\s+/g, "").replace("/20", "")));
    await page.click('#train-thead-row th[data-sort="score"]'); await sleep(500);
    const asc = (await order()).map((x) => x.split(":")[1]);
    const nums = (a) => a.filter((x) => x !== "—").map((x) => Number(x.replace(",", ".")));
    assert(asc.slice(0, 4).every((x) => x === "—") && nums(asc).join() === "0,5,12.5,18", "croissant : " + asc.join(" "));
    await page.click('#train-thead-row th[data-sort="score"]'); await sleep(500);
    const desc = (await order()).map((x) => x.split(":")[1]);
    assert(nums(desc).join() === "18,12.5,5,0", "décroissant : " + desc.join(" "));
    assert(desc.slice(4).every((x) => x === "—"), "décroissant : les sans-note ne sont pas en dernier : " + desc.join(" "));
    assert(await page.evaluate(() => document.querySelector('#train-thead-row th[data-sort="score"]').classList.contains("sorted")), "en-tête non marqué comme trié");
  });

  /* ═════════ TS7 : rechargement, aucune autre donnée touchée ═════════ */
  await S("TS7", "après rechargement : notes conservées ; toute la collection trainingItems avant/après : seul « score » diffère, sur les seuls entraînements notés ; aucune valeur null écrite", async () => {
    const { u, page } = await open();
    const snap = async () => { const o = {}; (await adb.collection(`users/${u.uid}/trainingItems`).get()).forEach((d) => { const x = d.data(); delete x.updatedAt; o[d.id] = x; }); return o; };
    await sleep(2500);   // laisse la synchro des entraînements prédéfinis finir
    const before = await snap();
    for (const [id, v] of [[8001, "7"], [8004, "19,75"], [8008, "0"]]) { await clickBadge(page, id); await page.keyboard.type(v); await page.keyboard.press("Enter"); await sleep(500); }
    await waitDoc(u, 8008, (d) => d.score === 0);
    await sleep(1500);
    await page.reload({ waitUntil: "domcontentloaded" }); await sleep(2500);
    await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
    await page.evaluate(() => document.querySelector('[data-page="entrainements"]').click()); await sleep(1200);
    await page.waitForSelector(badge(8004), { timeout: 20000 });
    const shown = await Promise.all([8001, 8004, 8008, 8002].map((i) => txt(page, i)));
    assert(shown[0].t.startsWith("7") && shown[1].t.startsWith("19,75") && shown[2].t.startsWith("0") && shown[3].t === "—", "après rechargement : " + JSON.stringify(shown.map((s) => s.t)));
    assert(shown[2].cls.includes("s1") && shown[1].cls.includes("s10") && shown[0].cls.includes("s4"), "paliers : " + shown.map((s) => s.cls).join(" | "));
    const after = await snap();
    assert(Object.keys(before).join() === Object.keys(after).join(), "documents ajoutés/retirés : " + Object.keys(before).length + " → " + Object.keys(after).length);
    const diffs = [];
    for (const id of Object.keys(before)) for (const k of new Set([...Object.keys(before[id]), ...Object.keys(after[id])])) if (JSON.stringify(before[id][k]) !== JSON.stringify(after[id][k])) diffs.push(id + "." + k);
    assert(diffs.sort().join() === ["8001.score", "8004.score", "8008.score"].join(), "champs modifiés : " + diffs.join());
    assert(Object.values(after).every((x) => x.score === undefined || typeof x.score === "number"), "un score n'est pas un nombre");
    /* aussi côté mémoire : toute la liste, seul score diffère */
    const memList = await page.evaluate(() => window.userData.trainings.map((t) => ({ ...t })));
    const bad = memList.filter((t) => !("score" in t) ? false : ![8001, 8004, 8008].includes(t.id));
    assert(!bad.length, "score inattendu en mémoire : " + bad.map((t) => t.id).join());
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ TS8 : largeurs, thèmes, téléphone ═════════ */
  for (const theme of ["light", "dark", "pastel"]) {
    await S("TS8-" + theme, `largeurs 1024 / 1100 / 1280 / 1366 / 1920 (${theme}) : pas de défilement horizontal du tableau, en-tête « Note /20 » sur une ligne, pastille dans sa case, lignes courtes de même hauteur, « /20 » de la pastille à partir de 1280 px`, async () => {
      const { page } = await open({ theme, scores: { 8001: 3, 8002: 17.5, 8003: 12, 8004: 20, 8005: 0 } });
      const bad = [];
      for (const w of [1024, 1100, 1280, 1366, 1920]) {
        await page.setViewport({ width: w, height: 900 }); await sleep(600);
        const r = await page.evaluate(() => {
          const c = document.querySelector("#page-entrainements .items-container"), t = document.querySelector("#page-entrainements .train-table");
          const th = document.querySelector("#train-thead-row th.p1-score-th"), ths = [...document.querySelectorAll("#train-thead-row th")];
          const rows = [...document.querySelectorAll("#train-table-body tr")];
          const inCell = rows.every((tr) => { const b = tr.querySelector(".p1-score-badge").getBoundingClientRect(), td = tr.children[5].getBoundingClientRect(); return b.left >= td.left - 0.5 && b.right <= td.right + 0.5; });
          const sm = getComputedStyle(rows[0].querySelector(".p1-score-badge small")).display;
          return { sw: c.scrollWidth, cw: c.clientWidth, thOver: th.scrollWidth > th.clientWidth + 1, thH: ths.map((x) => Math.round(x.getBoundingClientRect().height)), rowH: rows.map((x) => Math.round(x.getBoundingClientRect().height)), inCell, sm, pageOver: document.documentElement.scrollWidth > innerWidth + 1, thW: Math.round(th.getBoundingClientRect().width) };
        });
        if (r.sw > r.cw + 1) bad.push(`${w}: défilement horizontal du tableau (${r.sw} > ${r.cw})`);
        if (r.thOver || Math.max(...r.thH) - Math.min(...r.thH) > 1) bad.push(`${w}: en-tête sur plusieurs lignes ou rogné ${JSON.stringify(r.thH)}`);
        if (!r.inCell) bad.push(`${w}: pastille hors de sa case`);
        if (Math.max(...r.rowH) > 61) bad.push(`${w}: ligne trop haute ${JSON.stringify(r.rowH)}`);
        if (Math.max(...r.rowH) - Math.min(...r.rowH) > 2) bad.push(`${w}: hauteurs de lignes inégales ${JSON.stringify(r.rowH)}`);
        if ((w >= 1280) !== (r.sm !== "none")) bad.push(`${w}: « /20 » de la pastille ${r.sm}`);
        if (r.pageOver && w !== 1100) bad.push(`${w}: défilement horizontal de la page`);
        await shot(page, `${w}-${theme}`);
      }
      assert(!bad.length, bad.join(" ; "));
    });
  }
  await S("TS8-tel", "téléphone 390 (clair, sombre) : le tableau défile horizontalement comme avant, saisie au doigt (tap), clavier décimal, « /20 » de saisie masqué, rien ne déborde de la page", async () => {
    const { u, page } = await open({ vp: M(390, 844), scores: { 8002: 16 } });
    const r = await page.evaluate(() => ({ pageOver: document.documentElement.scrollWidth > innerWidth + 1, th: getComputedStyle(document.querySelector("#page-entrainements .train-table")).minWidth }));
    assert(!r.pageOver, "défilement horizontal de la PAGE sur téléphone");
    await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center", inline: "center" }), badge(8001)); await sleep(300);
    await page.tap(badge(8001)); await page.waitForSelector(field(8001), { timeout: 5000 });
    const f = await page.evaluate((s) => { const i = document.querySelector(s); return { im: i.getAttribute("inputmode"), suf: getComputedStyle(document.querySelector(".p1-score-suffix")).display, focus: document.activeElement === i, w: Math.round(document.querySelector(".p1-score-edit").getBoundingClientRect().width), cell: Math.round(i.closest("td").getBoundingClientRect().width) }; }, field(8001));
    assert(f.im === "decimal" && f.suf === "none" && f.focus && f.w <= f.cell, "saisie au doigt : " + JSON.stringify(f));
    await page.keyboard.type("13,5"); await page.keyboard.press("Enter");
    const d = await waitDoc(u, 8001, (x) => x.score === 13.5);
    assert(d.score === 13.5 && (await txt(page, 8001)).cls.includes("s7"), "note au doigt : " + d.score);
    await shot(page, "tel-clair");
    await page.evaluate(() => window.p1SetTheme("dark")); await sleep(500);
    await shot(page, "tel-sombre");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ TS9 : lecture seule, hors ligne ═════════ */
  await S("TS9", "compte en lecture seule (Premium expiré) : saisie bloquée, aucune donnée modifiée ; hors ligne : bouton grisé et saisie refusée", async () => {
    const { u, page } = await open({ scores: { 8001: 10 } });
    assert(await page.evaluate(() => typeof window.canPerformAction === "function"), "canPerformAction absent");
    await page.evaluate(() => { window.tpxPremiumLocked = true; });
    await page.click(badge(8002)); await sleep(500);
    assert(!(await page.$(field(8002))), "la saisie s'est ouverte en lecture seule");
    await page.click(badge(8001)); await sleep(400);
    assert(!(await page.$(field(8001))) && (await doc(u, 8001)).score === 10 && !("score" in (await doc(u, 8002))), "données modifiées en lecture seule");
    await page.evaluate(() => { window.tpxPremiumLocked = false; window.offlineActionsBlocked = true; window.renderTrainTable(); });
    const o = await page.evaluate((s) => { const b = document.querySelector(s); return { op: b.style.opacity, cur: b.style.cursor }; }, badge(8002));
    assert(o.op === "0.4" && o.cur === "not-allowed", "bouton non grisé hors ligne : " + JSON.stringify(o));
    await page.click(badge(8002)); await sleep(500);
    assert(!(await page.$(field(8002))), "la saisie s'est ouverte hors ligne");
    await page.evaluate(() => { window.offlineActionsBlocked = false; window.renderTrainTable(); });
    const o2 = await page.evaluate((s) => document.querySelector(s).style.opacity, badge(8002));
    assert(o2 === "", "bouton toujours grisé après retour en ligne : " + o2);
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ TS10 : couleurs, lisibilité, animation ═════════ */
  for (const theme of ["light", "dark", "pastel"]) {
    await S("TS10-" + theme, `couleurs (${theme}) : paliers = ceil(note / 2) de 1 à 10 (0 → 1, 20 → 10), dégradé du rouge au vert, texte lisible (contraste ≥ 4,5) sur les 10 paliers`, async () => {
      const { page } = await open({ theme });
      const probes = [[0, 1], [0.5, 1], [2, 1], [2.01, 2], [4, 2], [6.5, 4], [8, 4], [9, 5], [10, 5], [11, 6], [12.2, 7], [14.5, 8], [16, 8], [17, 9], [18, 9], [19, 10], [20, 10]];
      const lv = await page.evaluate((p) => p.map(([v]) => { const b = window._p1TrainScoreBadge({ id: 1, score: v }); return +b.className.match(/ s(\d+)/)[1]; }), probes);
      const badLv = probes.filter((p, i) => lv[i] !== p[1]).map((p) => p[0] + "→" + lv[probes.indexOf(p)]);
      assert(!badLv.length, "paliers faux : " + badLv.join(", "));
      const cols = await page.evaluate(() => { const out = []; for (let n = 1; n <= 10; n++) { const b = window._p1TrainScoreBadge({ id: 1, score: n * 2 }); document.body.appendChild(b); const cs = getComputedStyle(b); out.push({ n, bg: cs.backgroundColor, fg: cs.color }); b.remove(); } return out; });
      const lows = cols.filter((c) => cr(rgbOf(c.bg), rgbOf(c.fg)) < 4.5).map((c) => `${c.n} ${cr(rgbOf(c.bg), rgbOf(c.fg)).toFixed(1)}`);
      assert(!lows.length, "contraste insuffisant : " + lows.join(", "));
      const first = rgbOf(cols[0].bg), last = rgbOf(cols[9].bg);
      assert(first[0] > first[1] && first[0] > first[2], "palier 1 pas rouge : " + cols[0].bg);
      assert(last[1] > last[0] && last[1] > last[2], "palier 10 pas vert : " + cols[9].bg);
      const distinct = new Set(cols.map((c) => c.bg)).size;
      assert(distinct === 10, "paliers non distincts : " + distinct);
    });
  }
  await S("TS10-anim", "ouverture : la pastille de saisie se déploie (≈ 0,32 s, scale .72 → 1) ; rien si « réduire les animations »", async () => {
    const { page } = await open();
    await page.click(badge(8001)); await page.waitForSelector(field(8001));
    const a = await page.evaluate(() => { const w = document.querySelector(".p1-score-edit"), cs = getComputedStyle(w); return { cls: w.classList.contains("is-opening"), name: cs.animationName, dur: cs.animationDuration, fn: cs.animationTimingFunction }; });
    assert(a.cls && a.name === "p1ScoreOpen" && a.dur === "0.32s" && /cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/.test(a.fn), "animation : " + JSON.stringify(a));
    await sleep(500);
    assert(await page.evaluate(() => !document.querySelector(".p1-score-edit").classList.contains("is-opening")), "classe d'animation restée posée");
    await page.keyboard.press("Escape"); await sleep(300);
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.click(badge(8001)); await page.waitForSelector(field(8001));
    const r = await page.evaluate(() => getComputedStyle(document.querySelector(".p1-score-edit")).animationName);
    assert(r === "none", "animation malgré « réduire les animations » : " + r);
  });

  /* ═════════ TS11 : « Ma bibliothèque », synchro des prédéfinis ═════════ */
  await S("TS11", "« Ma bibliothèque » : un entraînement officiel noté reste affiché (touché) ; syncDefaultTrainings() conserve score et ne patche que ses champs de référence", async () => {
    /* P1 n'a pas d'entraînement prédéfini (DEFAULT_TRAININGS vide) : on en simule un (isDefault, jamais touché) */
    const { u, page } = await open({ seed: [...SEED, [8100, "colle", "Officiel"]] });
    await adb.doc(`users/${u.uid}/trainingItems/8100`).set({ isDefault: true, statut: "non-fait" }, { merge: true });
    await page.reload({ waitUntil: "domcontentloaded" }); await sleep(2500);
    await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
    await page.evaluate(() => document.querySelector('[data-page="entrainements"]').click()); await sleep(1200);
    await page.waitForSelector(badge(8001), { timeout: 20000 });
    const hid = await page.evaluate(() => ({ custom: window.isCustomTrainings(), row: !!document.querySelector('tr[data-train-id="8100"]'), data: window.userData.trainings.filter((x) => x.id === 8100).map((x) => ({ d: x.isDefault, o: window.isOfficialTrainingId(x.id), st: x.statut })), n: window.userData.trainings.length }));
    assert(hid.custom && !hid.row && hid.data.length === 1, "mode « Ma bibliothèque » : " + JSON.stringify(hid));
    await page.evaluate(() => { const t = window.userData.trainings.find((x) => x.id === 8100); t.score = 15; window.saveTrainings(); window.renderTrainTable(); });
    await sleep(500);
    assert(await page.evaluate(() => !!document.querySelector('tr[data-train-id="8100"] .p1-score-badge.s8')), "l'entraînement officiel noté a disparu de la liste");
    const d0 = await waitDoc(u, 8100, (d) => d && d.score === 15);
    assert(d0.score === 15, "score non enregistré : " + JSON.stringify(d0.score));
    const s = await page.evaluate(() => {
      window.TPXPerso.setTrainingsMode("official", { rerender: false });   /* en « Ma bibliothèque » la synchro est volontairement inactive */
      const saved = window.DEFAULT_TRAININGS; window.DEFAULT_TRAININGS = [{ id: 8100, title: "Titre de référence", type: "qcm", plateforme: "edni", matiere: "s1", matieres: ["s1"] }];
      const changed = window.syncDefaultTrainings();
      const t = window.userData.trainings.find((x) => x.id === 8100);
      const r = { changed, title: t.title, type: t.type, score: t.score, statut: t.statut };
      window.DEFAULT_TRAININGS = saved; return r;
    });
    assert(s.changed === true && s.title === "Titre de référence" && s.type === "qcm", "syncDefaultTrainings n'a pas patché ses champs : " + JSON.stringify(s));
    assert(s.score === 15 && s.statut === "non-fait", "syncDefaultTrainings a touché aux données de l'utilisateur : " + JSON.stringify(s));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ TS12 : Nouveautés ═════════ */
  await S("TS12", "Nouveautés : nouvelle entrée en tête « Note tes entraînements sur 20 » (tutoiement, sans emoji), AUCUNE pastille pour un compte qui avait tout vu, clé « vu » inchangée (whatsNewSeen_v7)", async () => {
    const { u, page } = await open({ prefs: { whatsNewSeen_v7: true } });
    await sleep(2500);
    const n = await page.evaluate(() => { const s = [...document.querySelectorAll(".whats-new-modal-body .whats-new-section")]; const f = s[0]; const b = document.querySelector(".whats-new-badge, #whatsNewBadge, .whats-new-dot"); return { h: f.querySelector("h4").textContent, p: f.querySelector("p").textContent.replace(/\s+/g, " ").trim(), icon: f.querySelector(".whats-new-section-icon i").className, bg: getComputedStyle(f.querySelector(".whats-new-section-icon")).backgroundImage, second: s[1].querySelector("h4").textContent, badge: !!(b && b.offsetParent) }; });
    assert(n.h === "Note tes entraînements sur 20" && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(n.h), "titre : " + n.h);
    assert(n.p === "Dans le tableau des entraînements, la colonne Note /20 se remplit d'un clic.", "texte : " + n.p);
    assert(/linear-gradient/.test(n.bg) && n.second === "Méthode Pomodoro", "icône / 2e entrée : " + JSON.stringify(n));
    assert(!n.badge, "une pastille de notification s'est allumée");
    const keys = Object.keys((await adb.doc(`users/${u.uid}/settings/preferences`).get()).data()).filter((k) => /^whatsNew/.test(k));
    assert(keys.join() === "whatsNewSeen_v7", "clés « vu » : " + keys.join());
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ En-tête du cahier d'erreurs : bouton rond « Note /20 » ═════════ */
  const SB = "#trainNotesScoreBtn", HF = "#trainNotesModalInner .p1-score-input";
  const openCahier = async (page, id) => { await page.evaluate((i) => window._openTrainNotes(i), id); await page.waitForSelector("#trainNotesOverlay.active", { timeout: 8000 }); await sleep(700); };
  const closeCahier = async (page) => { await page.evaluate(() => window.closeTrainNotesModal()); await sleep(600); };
  const hbtn = (page) => page.evaluate((q) => { const b = document.querySelector(q); if (!b) return null; const r = b.getBoundingClientRect(); return { cls: b.className, w: Math.round(r.width), h: Math.round(r.height), t: b.textContent.replace(/\s+/g, " ").trim(), aria: b.getAttribute("aria-label"), bg: getComputedStyle(b).backgroundColor, fg: getComputedStyle(b).color, icon: !!b.querySelector("i.fa-star-half-stroke") }; }, SB);

  await S("TH1", "cahier d'erreurs : bouton rond de 30 px juste à droite de « Statut » et avant la croix ; sans note : gris + étoile, se déploie avec « Note /20 » au survol", async () => {
    const { page } = await open();
    await openCahier(page, 8001);
    const pos = await page.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); const a = r("#trainNotesStatutBtn"), b = r("#trainNotesScoreBtn"), c = r("#trainNotesModalInner .notes-header-right .notes-close-btn"); const sib = [...document.querySelector("#trainNotesScoreBtn").parentNode.children].map((e) => e.id || e.className.split(" ")[0]); return { gapL: b.left - a.right, gapR: c.left - b.right, same: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)), sib }; });
    assert(pos.gapL >= 0 && pos.gapL < 14 && pos.gapR >= 0 && pos.gapR < 14 && pos.same < 1.5, "place : " + JSON.stringify(pos));
    const i = pos.sib.indexOf("trainNotesScoreBtn");
    assert(pos.sib[i - 1] === "trainNotesStatutBtn" && /notes-close-btn/.test(pos.sib[i + 1]), "ordre : " + pos.sib.join(">"));
    const b = await hbtn(page);
    assert(b.w === 30 && b.h === 30 && /no-score/.test(b.cls) && b.icon && b.aria === "Noter sur 20", "bouton sans note : " + JSON.stringify(b));
    assert(rgbOf(b.bg).join() === "229,231,235", "fond gris attendu : " + b.bg);
    await page.hover(SB); await sleep(700);
    const h = await hbtn(page);
    assert(h.w > 70 && /Note \/20/.test(h.t), "déploiement au survol : " + JSON.stringify(h));
    await shot(page, "cahier-sans-note");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  await S("TH2", "cahier : clic → même saisie directe que le tableau (le champ remplace le bouton, non enregistré comme saisie du tableau) ; « 14,5 » + Entrée : bouton au palier 8 avec « 14,5 », « /20 » au survol, score en base, tableau derrière mis à jour", async () => {
    const { u, page } = await open();
    await openCahier(page, 8002);
    await page.click(SB); await page.waitForSelector(HF, { timeout: 5000 });
    const st = await page.evaluate(() => ({ btn: !!document.getElementById("trainNotesScoreBtn"), tableEdit: window._p1TrainScoreEditing, focus: document.activeElement === document.querySelector("#trainNotesModalInner .p1-score-input"), within: document.querySelector("#trainNotesModalInner .p1-score-input").closest(".notes-header-right") !== null }));
    assert(!st.btn && st.tableEdit == null && st.focus && st.within, "état pendant la saisie : " + JSON.stringify(st));
    assert((await typeIn2(page, "21")) === "2" && (await typeIn2(page, "abc")) === "" && (await typeIn2(page, "20,5")) === "20,", "filtre de frappe dans l'en-tête");
    await typeIn2(page, ""); await page.keyboard.type("14,5");
    await page.mouse.move(700, 130);   /* la souris ne reste pas sur le bouton (sinon il s'élargit au survol) */
    await page.keyboard.press("Enter");
    await page.waitForSelector(SB + ".s8", { timeout: 5000 }); await sleep(800);
    const b = await hbtn(page);
    assert(/^14,5/.test(b.t) && b.w === 30 && b.aria === "Note : 14,5/20 — modifier" && !(await page.$(HF)), "bouton après saisie : " + JSON.stringify(b));
    const d = await waitDoc(u, 8002, (x) => x.score === 14.5);
    assert(d.score === 14.5, "base : " + d.score);
    assert((await txt(page, 8002)).cls.includes("s8"), "le tableau derrière le cahier n'est pas à jour : " + JSON.stringify(await txt(page, 8002)));
    await page.hover(SB); await sleep(700);
    const h = await hbtn(page);
    assert(h.w > 50 && /14,5\s*\/20/.test(h.t), "déploiement avec « /20 » : " + JSON.stringify(h));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  await S("TH3", "cahier : Échap annule SANS fermer le cahier ; clic ailleurs dans le cahier enregistre ; fermer le cahier pendant la saisie enregistre ; champ vide efface (base sans champ score)", async () => {
    const { u, page } = await open({ scores: { 8003: 9 } });
    await openCahier(page, 8003);
    await page.click(SB); await page.waitForSelector(HF); await page.keyboard.type("17"); await page.keyboard.press("Escape"); await sleep(500);
    assert(await page.evaluate(() => document.getElementById("trainNotesOverlay").classList.contains("active")), "Échap a fermé le cahier");
    assert(!(await page.$(HF)) && (await hbtn(page)).t.startsWith("9") && (await doc(u, 8003)).score === 9, "Échap n'a pas annulé");
    /* clic ailleurs dans le cahier */
    await page.click(SB); await page.waitForSelector(HF); await page.keyboard.type("11,25");
    await page.click("#trainNotesTitle2"); await sleep(400);
    const d1 = await waitDoc(u, 8003, (x) => x.score === 11.25);
    assert(d1.score === 11.25 && (await hbtn(page)).t.startsWith("11,25") && !(await page.$(HF)), "clic ailleurs : " + d1.score);
    assert(await page.evaluate(() => document.getElementById("trainNotesOverlay").classList.contains("active")), "le clic ailleurs a fermé le cahier");
    /* fermer le cahier pendant la saisie */
    await page.click(SB); await page.waitForSelector(HF); await page.keyboard.type("6");
    await page.evaluate(() => window.closeTrainNotesModal()); await sleep(700);
    const d2 = await waitDoc(u, 8003, (x) => x.score === 6);
    assert(d2.score === 6 && (await txt(page, 8003)).cls.includes("s3"), "fermeture pendant la saisie : " + d2.score);
    assert(!(await page.$(HF)), "champ resté dans le DOM");
    /* champ vide : efface */
    await openCahier(page, 8003);
    assert((await hbtn(page)).t.startsWith("6"), "bouton non à jour à la réouverture : " + (await hbtn(page)).t);
    await page.click(SB); await page.waitForSelector(HF); await typeIn2(page, ""); await page.keyboard.press("Enter");
    const d3 = await waitDoc(u, 8003, (x) => !("score" in x));
    assert(!("score" in d3), "score toujours en base : " + d3.score);
    const b = await hbtn(page);
    assert(/no-score/.test(b.cls) && b.icon && (await txt(page, 8003)).t === "—" && (await mem(page, 8003)) === "ABSENT", "après effacement : " + JSON.stringify(b));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  await S("TH4", "cahier : un AUTRE entraînement s'ouvre avec SON bouton (vide si pas de note), jamais celui du précédent ; liste remplacée pendant la saisie : la note n'est pas perdue ; note posée dans le tableau reprise à l'ouverture", async () => {
    const { u, page } = await open({ scores: { 8004: 16 } });
    await openCahier(page, 8004);
    assert((await hbtn(page)).t.startsWith("16") && /s8/.test((await hbtn(page)).cls), "bouton de 8004 : " + JSON.stringify(await hbtn(page)));
    await closeCahier(page);
    await openCahier(page, 8005);
    const b = await hbtn(page);
    assert(/no-score/.test(b.cls) && b.icon && !/16/.test(b.t), "8005 devrait être sans note : " + JSON.stringify(b));
    await page.click(SB); await page.waitForSelector(HF);
    await page.evaluate(() => { window.userData.trainings = JSON.parse(JSON.stringify(window.userData.trainings)); });
    await page.keyboard.type("12"); await page.keyboard.press("Enter");
    const d = await waitDoc(u, 8005, (x) => x.score === 12);
    assert(d.score === 12 && (await mem(page, 8005)) === 12 && (await hbtn(page)).t.startsWith("12"), "liste remplacée : " + d.score + " / " + (await mem(page, 8005)));
    await closeCahier(page);
    await clickBadge(page, 8006); await page.keyboard.type("3"); await page.keyboard.press("Enter"); await sleep(500);
    await openCahier(page, 8006);
    assert((await hbtn(page)).t.startsWith("3") && /s2/.test((await hbtn(page)).cls), "note du tableau non reprise : " + JSON.stringify(await hbtn(page)));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  await S("TH5", "téléphone 375 px : l'en-tête du cahier ne déborde pas (bouton, puis champ de saisie) ; le tap au doigt fonctionne", async () => {
    const { u, page } = await open({ vp: M(375, 812), scores: { 8002: 18 } });
    await openCahier(page, 8001);
    const geo = () => page.evaluate(() => { const inner = document.getElementById("trainNotesModalInner").getBoundingClientRect(), hr = document.querySelector("#trainNotesModalInner .notes-header-right"), hrr = hr.getBoundingClientRect(); const kids = [...hr.children].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect()); const hd = hr.parentElement; return { over: hr.scrollWidth > hr.clientWidth + 1, kidsOut: kids.some((k) => k.right > inner.right + 0.5 || k.left < inner.left - 0.5 || k.right > innerWidth + 0.5 || k.left < -0.5), sx: scrollX, headOver: hd.scrollWidth > hd.clientWidth + 1, pageOver: document.documentElement.scrollWidth > innerWidth + 1, rows: Math.round(hd.getBoundingClientRect().height), hrTop: Math.round(hrr.top), right: Math.round(inner.right - Math.max(...kids.map((k) => k.right))) }; });
    const g0 = await geo();
    assert(!g0.over && !g0.kidsOut && !g0.headOver && !g0.pageOver, "bouton : débordement " + JSON.stringify(g0));
    await page.tap(SB); await page.waitForSelector(HF, { timeout: 5000 });
    const g1 = await geo();
    assert(!g1.over && !g1.kidsOut && !g1.headOver && !g1.pageOver, "champ de saisie : débordement " + JSON.stringify(g1) + " (avant : " + JSON.stringify(g0) + ")");
    const f = await page.evaluate(() => { const i = document.querySelector("#trainNotesModalInner .p1-score-input"); return { im: i.getAttribute("inputmode"), focus: document.activeElement === i, suf: getComputedStyle(document.querySelector("#trainNotesModalInner .p1-score-suffix")).display }; });
    assert(f.im === "decimal" && f.focus && f.suf === "none", "saisie au doigt : " + JSON.stringify(f));
    await shot(page, "cahier-tel-saisie");
    await page.keyboard.type("13,5"); await page.keyboard.press("Enter");
    const d = await waitDoc(u, 8001, (x) => x.score === 13.5);
    assert(d.score === 13.5 && /s7/.test((await hbtn(page)).cls), "note au doigt : " + d.score);
    await shot(page, "cahier-tel-note");
    await closeCahier(page); await openCahier(page, 8002);
    const g2 = await geo();
    assert(!g2.over && !g2.kidsOut && !g2.headOver && !g2.pageOver, "18 (palier 9) : débordement " + JSON.stringify(g2));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  await S("TH6", "cahier : lecture seule bloquée (aucune saisie, aucune donnée modifiée) ; hors ligne : bouton désactivé comme « Statut »", async () => {
    const { u, page } = await open({ scores: { 8001: 10 } });
    await openCahier(page, 8001);
    await page.evaluate(() => { window.tpxPremiumLocked = true; });
    await page.click(SB); await sleep(500);
    assert(!(await page.$(HF)) && (await doc(u, 8001)).score === 10, "saisie ouverte en lecture seule");
    await page.evaluate(() => { window.tpxPremiumLocked = false; window.offlineActionsBlocked = true; window._p1TnScoreRefresh(); });
    const o = await page.evaluate((q) => { const b = document.querySelector(q); return { dis: b.disabled, op: b.style.opacity, pe: b.style.pointerEvents, off: b.dataset.offlineDisabled }; }, SB);
    assert(o.dis && o.op === "0.4" && o.pe === "none" && o.off === "true", "bouton non désactivé hors ligne : " + JSON.stringify(o));
    await page.evaluate((q) => document.querySelector(q).click(), SB); await sleep(400);
    assert(!(await page.$(HF)), "saisie ouverte hors ligne");
    await page.evaluate(() => { window.offlineActionsBlocked = false; window._p1TnScoreRefresh(); });
    const o2 = await page.evaluate((q) => { const b = document.querySelector(q); return { dis: b.disabled, op: b.style.opacity }; }, SB);
    assert(!o2.dis && o2.op === "", "bouton toujours désactivé au retour en ligne : " + JSON.stringify(o2));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });


  /* ═════════ Rangement en douceur du bouton, plus d'infobulles ═════════ */
  const SAMPLER = () => { window.__w = []; const t0 = performance.now(); window.__iv = setInterval(() => { const e = document.querySelector("#trainNotesModalInner .p1-score-edit") || document.getElementById("trainNotesScoreBtn"); if (!e) return; window.__w.push([Math.round(performance.now() - t0), e.classList.contains("p1-score-edit") ? "f" : "b", Math.round(e.getBoundingClientRect().width * 10) / 10, e.offsetWidth]); }, 30); };
  const settleState = (page) => page.evaluate(() => { const b = document.getElementById("trainNotesScoreBtn"); return { cls: b.className, style: b.getAttribute("style"), tr: b.style.transition, w: b.style.width, mw: b.style.maxWidth, lab: (b.querySelector(".notes-btn-label") || {}).style && b.querySelector(".notes-btn-label").getAttribute("style") }; });

  for (const how of ["clic ailleurs", "Entrée", "Échap"]) {
    await S("TH8-" + how.replace(/\W/g, ""), "rangement en douceur (" + how + ") : la largeur du bouton décroît progressivement, du champ (~70 px) à la largeur de repos ; ensuite aucun style en ligne ni is-settling", async () => {
      const { u, page } = await open({ scores: { 8001: how === "Échap" ? 9 : null } });
      await openCahier(page, 8001);
      await page.click(SB); await page.waitForSelector(HF); await page.keyboard.type(how === "Échap" ? "17" : "14,5");
      await sleep(450);   /* le déploiement du champ est terminé : sa largeur est ~70 px */
      await page.mouse.move(700, 130);   /* la souris ne survole pas le bouton : on mesure le rangement, pas le survol */
      await page.evaluate(SAMPLER); await sleep(120);
      if (how === "clic ailleurs") await page.click("#trainNotesTitle2");
      else await page.keyboard.press(how === "Entrée" ? "Enter" : "Escape");
      await sleep(1100);
      const w = await page.evaluate(() => { clearInterval(window.__iv); return window.__w; });
      const f = w.filter((x) => x[1] === "f"), b = w.filter((x) => x[1] === "b");
      const w0 = Math.max(...f.map((x) => x[3])), rest = b[b.length - 1][2];
      assert(w0 >= 55 && w0 <= 110, "largeur du champ : " + w0 + " " + JSON.stringify(w.slice(0, 12)));
      assert(Math.abs(rest - 30) <= 1, "largeur de repos : " + rest);
      assert(b.length >= 6 && b[0][2] >= w0 - 8, "le bouton ne repart pas de la largeur du champ (" + w0 + ") : " + JSON.stringify(b.slice(0, 6)));
      const mid = b.filter((x) => x[2] > 33 && x[2] < w0 - 6);
      assert(mid.length >= 4, "pas assez de largeurs intermédiaires (" + mid.length + ") : " + JSON.stringify(b));
      let up = 0; for (let i = 1; i < b.length; i++) if (b[i][2] > b[i - 1][2] + 0.6) up++;
      assert(up === 0, "la largeur remonte pendant le rangement : " + JSON.stringify(b));
      const s = await settleState(page);
      assert(!/is-settling/.test(s.cls) && !s.tr && !s.w && !s.mw && !s.style, "style en ligne ou classe restés : " + JSON.stringify(s));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  await S("TH8-bis", "rangement : une nouvelle saisie démarrée pendant le rangement l'annule proprement ; « réduire les animations » : aucune animation, aucun style en ligne", async () => {
    const { page } = await open();
    await openCahier(page, 8001);
    await page.click(SB); await page.waitForSelector(HF); await page.keyboard.type("5");
    await page.keyboard.press("Enter"); await sleep(120);   /* rangement en cours */
    const mid = await settleState(page);
    assert(mid.w !== "" && mid.tr !== "", "le rangement n'a pas démarré : " + JSON.stringify(mid));
    await page.click(SB); await page.waitForSelector(HF, { timeout: 5000 });   /* nouvelle saisie en plein rangement */
    await page.keyboard.press("Escape"); await sleep(900);
    const s = await settleState(page);
    assert(!/is-settling/.test(s.cls) && !s.tr && !s.w && !s.mw, "traces après une saisie démarrée en plein rangement : " + JSON.stringify(s));
    /* mouvement réduit */
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.click(SB); await page.waitForSelector(HF); await page.keyboard.type("7");
    await page.mouse.move(700, 130); await page.evaluate(SAMPLER); await sleep(120); await page.keyboard.press("Enter"); await sleep(900);
    const w = await page.evaluate(() => { clearInterval(window.__iv); return window.__w; });
    const b = w.filter((x) => x[1] === "b");
    assert(b.length && b.every((x) => Math.abs(x[2] - 30) <= 1), "animation malgré « réduire les animations » : " + JSON.stringify(b));
    const s2 = await settleState(page);
    assert(!s2.style && !/is-settling/.test(s2.cls), "style en ligne en mouvement réduit : " + JSON.stringify(s2));
  });

  await S("TH9", "aucune infobulle (attribut title) sur les boutons « Statut » et « Note » de l'en-tête, jamais remise ; aria-label conservé (« Changer le statut », « Noter sur 20 », « Note : 14,5/20 — modifier »)", async () => {
    const { page } = await open({ scores: { 8002: 14.5 } });
    const probe = () => page.evaluate(() => ["trainNotesStatutBtn", "trainNotesScoreBtn"].map((i) => { const b = document.getElementById(i); return { i, title: b.getAttribute("title"), aria: b.getAttribute("aria-label"), has: b.hasAttribute("title") }; }));
    assert((await page.evaluate(() => ["trainNotesStatutBtn", "trainNotesScoreBtn"].some((i) => document.getElementById(i).hasAttribute("title")))) === false, "title présent avant ouverture");
    await openCahier(page, 8001);
    let p = await probe();
    assert(p.every((x) => !x.has) && p[0].aria === "Changer le statut" && p[1].aria === "Noter sur 20", "sans note : " + JSON.stringify(p));
    await closeCahier(page); await openCahier(page, 8002);
    p = await probe();
    assert(p.every((x) => !x.has) && p[1].aria === "Note : 14,5/20 — modifier", "avec note : " + JSON.stringify(p));
    await page.click(SB); await page.waitForSelector(HF); await page.keyboard.type("3,25"); await page.keyboard.press("Enter"); await sleep(900);
    p = await probe();
    assert(p.every((x) => !x.has) && p[1].aria === "Note : 3,25/20 — modifier", "après saisie : " + JSON.stringify(p));
    await page.evaluate(() => { window.tpxPremiumLocked = false; window.offlineActionsBlocked = true; window._p1TnScoreRefresh(); window.offlineActionsBlocked = false; window._p1TnScoreRefresh(); window.trainNotesSetStatut && window.trainNotesSetStatut("fait"); });
    await sleep(300);
    p = await probe();
    assert(p.every((x) => !x.has), "title revenu après rafraîchissements / changement de statut : " + JSON.stringify(p));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  for (const theme of ["dark", "pastel"]) {
    await S("TH7-" + theme, "cahier (" + theme + ") : bouton lisible — sans note : gris" + (theme === "dark" ? " translucide" : "") + " ; avec note : couleur du palier, texte avec un contraste ≥ 4,5 (10 paliers)", async () => {
      const { page } = await open({ theme });
      await openCahier(page, 8001);
      const none = await hbtn(page);
      if (theme === "dark") assert(/rgba\(107, 114, 128, 0\.4\)/.test(none.bg), "fond sans note en sombre : " + none.bg);
      await page.addStyleTag({ content: "#trainNotesScoreBtn{transition:none !important}" });   /* sinon on lit une couleur en pleine transition (0,18 s) */
      const res = await page.evaluate(() => { const out = []; const b = document.getElementById("trainNotesScoreBtn"); for (let n = 1; n <= 10; n++) { window.userData.trainings.find((x) => x.id === 8001).score = n * 2 - 1; window._p1TnScoreRefresh(); const cs = getComputedStyle(b); out.push({ n, cls: b.className, bg: cs.backgroundColor, fg: cs.color }); } return out; });
      const lows = res.filter((c) => !new RegExp("\\bs" + c.n + "\\b").test(c.cls) || cr(rgbOf(c.bg), rgbOf(c.fg)) < 4.5).map((c) => c.n + ":" + cr(rgbOf(c.bg), rgbOf(c.fg)).toFixed(1));
      assert(!lows.length, "paliers du bouton : " + lows.join(", "));
      await shot(page, "cahier-" + theme);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
