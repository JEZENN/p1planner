/* Curseur de saisie (24/10/2026) : (1) zone de texte vide des notes : le curseur est centré sur le texte d'invite ; (2) curseur bleu (--primary) partout.
   Vraie page + émulateurs. Mesure AUX PIXELS : on capture le haut de la zone vide et on compare les lignes du curseur (couleur du curseur) à celles
   du texte d'invite (gris). Le curseur clignote : plusieurs captures jusqu'à le voir.
   Lancer : node test/e2e/caret.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; CARET_OUT=<fichier.json> pour enregistrer les mesures) */
import "./env-e2e.mjs";
import fs from "node:fs";
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
const OUT = {};

const clean = async (page) => {
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden"); }).catch(() => {});
};
async function open(vp, { theme = "light", font = null, trainings = false } = {}) {
  const u = await mkUser({ courses: 1 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  if (trainings) await adb.doc(`users/${u.uid}/trainingItems/1001`).set({ id: 1001, titre: "QCM 1001", title: "QCM 1001", type: "colle", matiere: "s1", plat: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await clean(page);
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(400); }
  if (font) { await page.evaluate((f) => window.p1ApplyFont(f, false), font); await sleep(500); }
  if (trainings) await waitFor(() => page.evaluate(() => (window.userData.trainings || []).length === 1), { timeout: 20000 });
  return { u, page };
}

/* ouvre la fenêtre d'un éditeur de notes vide et renvoie son sélecteur */
const EDITORS = [
  { id: "course", sel: "#notesEditorArea", open: (p) => p.evaluate(() => window.openNotesModal(1, "s1", "c1", "Cours1")) },
  { id: "train", sel: "#trainNotesEditor", open: (p) => p.evaluate(() => window._openTrainNotes(1001)) },
  { id: "spe", sel: "#speNotesEditor", open: (p) => p.evaluate(() => window.openSpeErrModal("s1")) },
];
const closeAll = (page) => page.evaluate(() => { document.querySelectorAll(".notes-close-btn, .modal-close, .unified-modal-close").forEach((b) => { try { if (b.offsetParent) b.click(); } catch (e) {} }); }).catch(() => {});

/* analyse d'une capture : lignes du curseur (couleur `caret`) et lignes du texte d'invite (gris), en px CSS relatifs au haut du clip */
const analyze = (page, b64, caret, dpr) => page.evaluate(async (b64, caret, dpr) => {
  const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
  const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const cnt = new Map(); for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const k = px(x, y).join(","); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const bg = [...cnt.entries()].sort((p, q) => q[1] - p[1])[0][0].split(",").map(Number), dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const caretRows = new Set(), textRows = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = px(x, y); if (dist(p, bg) < 60) continue;
    if (dist(p, caret) < 60) caretRows.add(y); else textRows.add(y);
  }
  const span = (s) => { const a = [...s].sort((x, y) => x - y); return a.length ? [a[0] / dpr, (a[a.length - 1] + 1) / dpr] : null; };
  return { caret: span(caretRows), text: span(textRows) };
}, b64, caret, dpr);

async function measure(page, sel, dpr) {
  const info = await page.evaluate((s) => { const e = document.querySelector(s); e.scrollIntoView({ block: "center", behavior: "instant" }); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); const m = cs.caretColor.match(/[0-9]+/g).map(Number); return { x: r.left, y: r.top, w: r.width, caret: m.slice(0, 3), empty: e.matches(":empty") }; }, sel);
  assert(info.empty, "l'éditeur n'est pas vide : " + sel);
  const c = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + 60, y: r.top + 30 }; }, sel);
  await page.mouse.click(c.x, c.y); await sleep(200);
  const clip = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.max(40, Math.min(r.width, 520, innerWidth - Math.max(0, r.left) - 6)), height: 90 }; }, sel);
  let best = null;
  for (let i = 0; i < 14; i++) {
    const b64 = await page.screenshot({ clip, encoding: "base64" });
    if (process.env.CARET_DEBUG && i === 0) fs.writeFileSync(process.env.CARET_DEBUG + "-" + sel.replace(/W/g, "") + ".png", Buffer.from(b64, "base64"));
    const a = await analyze(page, b64, info.caret, dpr);
    if (a.caret && a.caret[1] - a.caret[0] >= 8 && a.text) { best = a; break; }
    if (a.text) best = a;
    await sleep(110);
  }
  /* le même curseur avec du texte TAPÉ (référence : « exactement comme avec du texte tapé ») */
  await page.keyboard.type("Cé"); await sleep(150);
  let typedCaret = null;
  for (let i = 0; i < 14 && !typedCaret; i++) { const b64 = await page.screenshot({ clip, encoding: "base64" }); const a = await analyze(page, b64, info.caret, dpr); if (a.caret && a.caret[1] - a.caret[0] >= 8) typedCaret = a.caret; else await sleep(110); }
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); await sleep(300);
  return { ...best, typedCaret, caretRgb: info.caret };
}

try {
  /* ═════════ CR1 : curseur centré sur le texte d'invite ═════════ */
  const CASES = [
    ...["light", "dark", "pastel"].flatMap((th) => [["pc", PC, th, null], ["tel", TEL, th, null]]),
    ["pc", PC, "light", "serif"], ["pc", PC, "light", "round"],
  ];
  for (const [vid, vp, th, font] of CASES) {
    await S(`CR1-${vid}-${th}${font ? "-" + font : ""}`, `curseur centré sur l'invite dans les 3 zones vides (${vid === "pc" ? "PC" : "téléphone"}, ${th}${font ? ", police " + font : ""}) : écart des centres ≤ 2,5 px ; invite qui disparaît à la frappe`, async () => {
      const { page } = await open(vp, { theme: th, font, trainings: true });
      for (const ed of EDITORS) {
        await ed.open(page); await sleep(1200);
        const m = await measure(page, ed.sel, vp.deviceScaleFactor || 1);
        assert(m.text, `${ed.id} : texte d'invite introuvable à l'écran`);
        assert(m.caret, `${ed.id} : curseur introuvable (couleur ${m.caretRgb})`);
        const cc = (m.caret[0] + m.caret[1]) / 2, tc = (m.text[0] + m.text[1]) / 2;
        OUT[`${vid}-${th}-${font || "base"}-${ed.id}`] = { text: m.text, caret: m.caret };
        OUT[`${vid}-${th}-${font || "base"}-${ed.id}`].typedCaret = m.typedCaret;
        if (!font) assert(Math.abs(cc - tc) <= 2.5, `${ed.id} : curseur ${m.caret.map((v) => v.toFixed(1))} / invite ${m.text.map((v) => v.toFixed(1))} : centres décalés de ${(tc - cc).toFixed(1)} px`);
        assert(m.typedCaret, `${ed.id} : curseur introuvable après frappe`);
        assert(Math.abs(m.caret[0] - m.typedCaret[0]) <= 3 && Math.abs(m.caret[1] - m.typedCaret[1]) <= 3, `${ed.id} : curseur de la zone vide ${m.caret.map((v) => v.toFixed(1))} ≠ curseur du texte tapé ${m.typedCaret.map((v) => v.toFixed(1))}`);
        // frappe : l'invite disparaît, le texte apparaît
        await page.keyboard.type("abc"); await sleep(200);
        const typed = await page.evaluate((s) => { const e = document.querySelector(s); return { before: getComputedStyle(e, "::before").content, txt: e.textContent.trim().slice(0, 3), empty: e.matches(":empty") }; }, ed.sel);
        assert(!typed.empty && typed.txt === "abc", `${ed.id} : frappe non prise en compte : ` + JSON.stringify(typed));
        await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); await sleep(300);
        const back = await page.evaluate((s) => { const e = document.querySelector(s); return { empty: e.matches(":empty"), before: getComputedStyle(e, "::before").content }; }, ed.sel);
        if (back.empty) assert(/Commencez/.test(back.before), `${ed.id} : l'invite ne revient pas après effacement : ` + back.before);
        await closeAll(page); await sleep(600);
      }
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ CC1 : curseur bleu partout ═════════ */
  for (const th of ["light", "dark", "pastel"]) {
    await S(`CC1-${th}`, `curseur de saisie = couleur du thème (--primary) dans l'Organisation de la journée, les cases du planning, les Flashcards, les recherches, la liste des tâches, les notes (${th}) ; cases à cocher non concernées`, async () => {
      const { page } = await open(PC, { theme: th });
      await page.evaluate(() => document.querySelector('[data-page="planning"]').click()); await sleep(1500);
      await page.evaluate(() => window.openPlanningDayDetailModal(new Date().toISOString().slice(0, 10))); await sleep(900);
      const r = await page.evaluate(() => {
        const probe = document.createElement("span"); probe.style.color = "var(--primary)"; document.body.appendChild(probe); const exp = getComputedStyle(probe).color; probe.remove();
        const sels = [".pdd-editor", ".day-notes-input", ".flash-rt-editor", "#search-item", "#checklist-new-item", ".notes-editor-area", "#tpx-btn-add-spec"];
        const out = {};
        for (const s of sels.slice(0, 6)) { const e = document.querySelector(s); out[s] = e ? getComputedStyle(e).caretColor : "(absent)"; }
        const cb = document.createElement("input"); cb.type = "checkbox"; document.body.appendChild(cb); out.checkbox = getComputedStyle(cb).caretColor; cb.remove();
        return { exp, out };
      });
      const bad = Object.entries(r.out).filter(([k, v]) => k !== "checkbox" && v !== r.exp);
      assert(!bad.length, `couleur attendue ${r.exp} ; écarts : ${JSON.stringify(bad)}`);
      assert(r.exp !== "rgb(0, 0, 0)" && /^rgb\(\d+, \d+, \d+\)$/.test(r.exp) && r.exp.split(",").map((s) => parseInt(s.replace(/\D/g, ""), 10))[2] > 150, "la couleur du thème n'est pas bleue : " + r.exp);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
} finally {
  if (process.env.CARET_OUT) fs.writeFileSync(process.env.CARET_OUT, JSON.stringify(OUT, null, 1));
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
