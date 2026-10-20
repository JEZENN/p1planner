/* Liste à cocher dans les notes de la journée, titres modernisés, curseur « Matières », bouton fermer (15/10/2026).
   Vraie page + vrais émulateurs ; la sauvegarde est lue SUR LE SERVEUR (Firestore), pas seulement dans l'interface.
   Lancer : node test/e2e/note-checklist.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const PHONE = { width: +(process.env.PHONE_W || 390), height: +(process.env.PHONE_H || 844), isMobile: true, hasTouch: true, deviceScaleFactor: 2 };   // PHONE_W=360 PHONE_H=780 pour le petit téléphone
const OPEN = [];   // contextes ouverts par le scenario en cours : fermes a la fin
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

const TODAY = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
const NOTE = (items, done = []) => '<div data-planning-rich="1"><ul class="planning-note-check">' + items.map((t, i) => `<li${done.includes(i) ? ' class="planning-note-done"' : ""}>${t}</li>`).join("") + "</ul></div>";
const seedNote = (u, notes) => adb.doc(`users/${u.uid}/calendarDays/${TODAY}`).set({ status: "", specialties: [], notes, updatedAt: new Date() });
const serverNotes = async (uid) => { const d = (await adb.doc(`users/${uid}/calendarDays/${TODAY}`).get()).data(); return d ? d.notes || "" : ""; };
/* La sauvegarde prend ~1 à 6 s : on attend (jusqu'à 15 s) que le serveur satisfasse le prédicat. */
async function waitServer(uid, pred, ms = 15000) { const t0 = Date.now(); let n = ""; while (Date.now() - t0 < ms) { n = await serverNotes(uid); if (pred(n)) return n; await sleep(300); } return n; }

/* L assistant de bienvenue pose un verrou de defilement (body overflow:hidden) : on l attend, on le retire, on libere le verrou. */
async function killOnboarding(page) {
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await page.waitForSelector("#tpx-onb-overlay", { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => {
    const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove();
    if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear();
    window.__ednAnonymousLockCount = 0;
    if (window._ednScrollUnlock) window._ednScrollUnlock();
    document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden");
  });
}
async function planUser(opts = {}) {
  const u = await mkUser({ courses: 1 });
  if (opts.notes) await seedNote(u, opts.notes);
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx);
  const page = ctx.page; await page.bringToFront();
  if (opts.viewport) await page.setViewport(opts.viewport); else await page.setViewport({ width: 1366, height: 900 });
  await sleep(opts.viewport && opts.viewport.isMobile ? 2500 : 300);
  await page.waitForFunction(() => window.currentUser && window._ednPlanningBridge, { timeout: 30000 });
  await killOnboarding(page);
  if (opts.theme) { const set = () => page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), opts.theme); await set(); await sleep(2500); await set(); await sleep(300); }   // les reglages distants peuvent rappliquer le theme du profil juste apres le chargement
  if (!opts.noPlanning) {
    await page.evaluate(() => document.querySelector('[data-page="planning"]').click());
    await page.waitForFunction((d) => document.querySelector(`.day-notes-input[data-date="${d}"]`), { timeout: 20000 }, TODAY);
    await page.evaluate((d) => document.querySelector(`.day-notes-input[data-date="${d}"]`).scrollIntoView({ behavior: "instant", block: "center" }), TODAY);
    await sleep(600);
  }
  return { u, ...ctx };
}
const CELL = `.day-notes-input[data-date="${TODAY}"]`;
async function openDay(page) {
  await page.evaluate((d) => window.openPlanningDayDetailModal(d), TODAY);
  await page.waitForSelector("#pdd-editor", { timeout: 8000 }); await sleep(600);
}
/* Centre du rond de la ligne n de l'éditeur ed (sélecteur) et paramètres de la case. */
const circle = async (page, ed, n = 0) => {
  // le défilement du site est doux : on cadre la ligne (instantané), on ATTEND, puis seulement on mesure
  await page.evaluate((sel, k) => { const li = document.querySelectorAll(sel + " ul.planning-note-check > li")[k]; if (li) li.scrollIntoView({ behavior: "instant", block: "center" }); }, ed, n);
  await sleep(700);
  return page.evaluate((sel, k) => {
  const li = document.querySelectorAll(sel + " ul.planning-note-check > li")[k]; if (!li) return null;
  const r = li.getBoundingClientRect(), cs = getComputedStyle(li), fs = parseFloat(cs.fontSize), ck = parseFloat(getComputedStyle(li, "::before").width);
  const e = document.querySelector(sel).getBoundingClientRect();
  return { x: r.left - 0.3 * fs - ck / 2, y: r.top + 0.7 * fs, left: r.left, top: r.top, h: r.height, fs, ck, circleLeft: r.left - ck - 0.3 * fs, edLeft: e.left, edRight: e.right };
  }, ed, n);
};
/* Mesure la ligne n une fois la mise en page STABLE (deux mesures identiques d affilee). */
const circleStable = async (page, ed, n = 0) => { let c = await circle(page, ed, n); for (let i = 0; i < 6; i++) { const c2 = await circle(page, ed, n); const same = Math.abs(c2.y - c.y) < 0.5 && Math.abs(c2.x - c.x) < 0.5; c = c2; if (same) break; } return c; };
const liState = (page, ed) => page.evaluate((sel) => [...document.querySelectorAll(sel + " ul.planning-note-check > li")].map((l) => ({ t: l.textContent.trim(), done: l.classList.contains("planning-note-done") })), ed);
const liCount = (n) => (n.match(/<li/g) || []).length;

try {
  await S("CK1", "bouton « Liste à cocher » à droite de « Liste à puces », même taille, icône affichée, barre sans débordement ; Cardio / Pneumo / Neuro = 3 cases non cochées, enregistrées sur le serveur", async () => {
    const { u, page } = await planUser();
    await openDay(page);
    const g = await page.evaluate(() => {
      const b = document.querySelector('#pdd-toolbar [data-cmd="bullet"]').getBoundingClientRect(), c = document.querySelector('#pdd-toolbar [data-cmd="check"]'), cr = c.getBoundingClientRect(), tb = document.getElementById("pdd-toolbar");
      const ic = c.querySelector("i"), cs = getComputedStyle(ic);
      return { right: cr.left >= b.right - 0.5 && cr.left - b.right < 12, same: Math.abs(cr.width - b.width) < 0.6 && Math.abs(cr.height - b.height) < 0.6, icon: /Font Awesome/.test(cs.fontFamily) && ic.getBoundingClientRect().width > 6, aria: c.getAttribute("aria-label"), noOverflow: tb.scrollWidth <= tb.clientWidth + 1, sameRow: Math.abs(cr.top - b.top) < 1 };
    });
    assert(g.right && g.same && g.icon && g.aria === "Liste à cocher" && g.noOverflow && g.sameRow, "barre d'outils : " + JSON.stringify(g));
    await page.click("#pdd-editor"); await page.keyboard.type("Cardio");
    await page.click('#pdd-toolbar [data-cmd="check"]'); await sleep(300);
    await page.keyboard.press("End");   // (le navigateur de test remet le curseur au début du texte après toute conversion en liste — vaut aussi pour « Liste à puces »)
    await page.keyboard.press("Enter"); await page.keyboard.type("Pneumo"); await page.keyboard.press("Enter"); await page.keyboard.type("Neuro");
    const st = await liState(page, "#pdd-editor");
    assert(st.length === 3 && st.every((x) => !x.done) && st.map((x) => x.t).join() === "Cardio,Pneumo,Neuro", "cases dans la fenêtre : " + JSON.stringify(st));
    const n = await waitServer(u.uid, (s) => /planning-note-check/.test(s) && liCount(s) === 3);
    assert(/planning-note-check/.test(n) && liCount(n) === 3 && !/planning-note-done/.test(n), "serveur : " + n);
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("CK2", "coche / décoche dans la fenêtre : transition de la coche, texte barré, case verte, serveur à jour dans les deux sens", async () => {
    const { u, page } = await planUser({ notes: NOTE(["Cardio", "Pneumo"]) });
    await openDay(page);
    const c = await circle(page, "#pdd-editor", 0);
    await page.mouse.click(c.x, c.y);
    const tr = await page.evaluate(() => { const li = document.querySelector("#pdd-editor ul.planning-note-check > li"); getComputedStyle(li, "::after").opacity; return li.getAnimations({ subtree: true }).filter((a) => a.effect && a.effect.pseudoElement === "::after" && a.transitionProperty).map((a) => a.transitionProperty + ":" + a.effect.getTiming().duration); });
    assert(tr.some((x) => x.startsWith("opacity")) && tr.some((x) => x.startsWith("transform")), "pas de transition sur la coche : " + JSON.stringify(tr));
    await sleep(900);
    const v = await page.evaluate(() => { const li = document.querySelector("#pdd-editor ul.planning-note-check > li"); const cs = getComputedStyle(li), b = getComputedStyle(li, "::before"), a = getComputedStyle(li, "::after"); return { done: li.classList.contains("planning-note-done"), bg: b.backgroundColor, tick: a.opacity, deco: cs.textDecorationLine, decoColor: cs.textDecorationColor }; });
    assert(v.done && v.bg === "rgb(16, 185, 129)" && v.tick === "1" && /line-through/.test(v.deco) && v.decoColor !== "rgba(0, 0, 0, 0)", "après la coche : " + JSON.stringify(v));
    let n = await waitServer(u.uid, (s) => /planning-note-done/.test(s)); assert(/planning-note-done/.test(n) && liCount(n) === 2, "serveur (coché) : " + n);
    await page.mouse.click(c.x, c.y);
    let v2 = "rgb(16, 185, 129)"; for (let i = 0; i < 40 && v2 === "rgb(16, 185, 129)"; i++) { await sleep(100); v2 = await page.evaluate(() => getComputedStyle(document.querySelector("#pdd-editor ul.planning-note-check > li"), "::before").backgroundColor); }
    assert(v2 !== "rgb(16, 185, 129)", "case encore verte après la décoche : " + v2);
    n = await waitServer(u.uid, (s) => !/planning-note-done/.test(s)); assert(!/planning-note-done/.test(n), "serveur (décoché) : " + n);
  });

  await S("CK3", "coche dans la case du planning, fenêtre fermée : aucune fenêtre ni menu, pas d'édition, serveur à jour ; un clic sur le texte ne coche pas et passe en édition", async () => {
    const { u, page } = await planUser({ notes: NOTE(["Cardio", "Pneumo"]) });
    const c = await circle(page, CELL, 0);
    await page.mouse.click(c.x, c.y); await sleep(700);
    const r = await page.evaluate((sel) => ({ done: document.querySelector(sel + " li").classList.contains("planning-note-done"), modal: !!document.querySelector("#pdd-overlay.active"), menu: !!document.querySelector(".pdd-status-menu.open, .status-popup.active, .specialty-popup.active"), focused: document.activeElement === document.querySelector(sel) }), CELL);
    assert(r.done && !r.modal && !r.menu && !r.focused, "case du planning : " + JSON.stringify(r));
    const n = await waitServer(u.uid, (s) => /planning-note-done/.test(s)); assert(/planning-note-done/.test(n), "serveur : " + n);
    const li = await page.evaluate((sel) => { const l = document.querySelectorAll(sel + " li")[1], r = l.getBoundingClientRect(); return { x: r.left + 18, y: r.top + r.height / 2 }; }, CELL);
    await page.mouse.click(li.x, li.y); await sleep(500);
    const t = await page.evaluate((sel) => ({ done: document.querySelectorAll(sel + " li")[1].classList.contains("planning-note-done"), focused: document.activeElement === document.querySelector(sel) }), CELL);
    assert(!t.done && t.focused, "clic sur le texte : " + JSON.stringify(t));
  });

  await S("CK4", "téléphone : toucher la case dans le planning la coche, sans passer en édition, serveur à jour ; toucher le texte garde l'édition", async () => {
    const { u, page } = await planUser({ notes: NOTE(["Cardio", "Pneumo"]), viewport: PHONE });
    const idle = await page.evaluate((sel) => { const e = document.querySelector(sel); return { ce: e.getAttribute("contenteditable"), idle: e.classList.contains("touch-idle") }; }, CELL);
    assert(idle.ce === "false" && idle.idle, "case non « touch-idle » au repos : " + JSON.stringify(idle));
    const c2 = await circle(page, CELL, 0);
    await page.touchscreen.tap(c2.x, c2.y); await sleep(800);
    const r = await page.evaluate((sel) => { const e = document.querySelector(sel); return { done: e.querySelector("li").classList.contains("planning-note-done"), ce: e.getAttribute("contenteditable"), modal: !!document.querySelector("#pdd-overlay.active") }; }, CELL);
    assert(r.done && r.ce === "false" && !r.modal, "toucher la case : " + JSON.stringify(r));
    const n = await waitServer(u.uid, (s) => /planning-note-done/.test(s)); assert(/planning-note-done/.test(n), "serveur : " + n);
    const t = await page.evaluate((sel) => { const l = document.querySelectorAll(sel + " li")[1], r = l.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; }, CELL);
    await page.touchscreen.tap(t.x, t.y); await sleep(700);
    const e = await page.evaluate((sel) => { const el = document.querySelector(sel); return { ce: el.getAttribute("contenteditable"), done: el.querySelectorAll("li")[1].classList.contains("planning-note-done") }; }, CELL);
    assert(e.ce === "true" && !e.done, "toucher le texte (édition attendue, rien de coché) : " + JSON.stringify(e));
  });

  await S("CK5", "Entrée après une ligne cochée = nouvelle ligne décochée ; re-cliquer sort de la liste en gardant le texte ; « Liste à puces » inchangée ; puces -> cases", async () => {
    const { u, page } = await planUser({ notes: NOTE(["Fait"], [0]) });
    await openDay(page);
    await page.evaluate(() => { const li = document.querySelector("#pdd-editor li"), r = document.createRange(); r.selectNodeContents(li); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById("pdd-editor").focus(); });
    await page.keyboard.press("Enter"); await page.keyboard.type("À faire");
    const st = await liState(page, "#pdd-editor");
    assert(st.length === 2 && st[0].done && !st[1].done && st[1].t === "À faire", "nouvelle ligne décochée : " + JSON.stringify(st));
    const n1 = await waitServer(u.uid, (s) => /À faire/.test(s)); assert(liCount(n1) === 2 && (n1.match(/planning-note-done/g) || []).length === 1, "serveur : " + n1);
    await page.click('#pdd-toolbar [data-cmd="check"]'); await sleep(400);
    const out = await page.evaluate(() => ({ ul: document.querySelectorAll("#pdd-editor ul.planning-note-check").length, txt: document.getElementById("pdd-editor").textContent.replace(/\s+/g, " ").trim() }));
    assert(out.txt.includes("À faire"), "texte perdu à la sortie de la liste : " + JSON.stringify(out));
    // « Liste à puces » : puces disc, pas de case
    await page.evaluate(() => { const ed = document.getElementById("pdd-editor"); ed.innerHTML = "<div>Puce</div>"; const r = document.createRange(); r.selectNodeContents(ed.firstChild); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ed.focus(); });
    await page.click('#pdd-toolbar [data-cmd="bullet"]'); await sleep(300);
    const b = await page.evaluate(() => { const ul = document.querySelector("#pdd-editor ul"); return { has: !!ul, check: ul && ul.classList.contains("planning-note-check"), type: ul && getComputedStyle(ul).listStyleType, before: ul && getComputedStyle(ul.querySelector("li"), "::before").content }; });
    assert(b.has && !b.check && b.type === "disc" && (b.before === "none" || b.before === "normal"), "liste à puces : " + JSON.stringify(b));
    await page.click('#pdd-toolbar [data-cmd="check"]'); await sleep(300);
    assert(await page.evaluate(() => document.querySelector("#pdd-editor ul").classList.contains("planning-note-check")), "la liste à puces n'est pas devenue une liste à cocher");
    const n2 = await waitServer(u.uid, (s) => /Puce/.test(s) && /planning-note-check/.test(s)); assert(/Puce/.test(n2) && /planning-note-check/.test(n2), "serveur (puces -> cases) : " + n2);
  });

  await S("CK6", "lecture seule / Premium verrouillé : la case ne se coche pas (message Premium) ; filtre de la note exact", async () => {
    const { page } = await planUser({ notes: NOTE(["Cardio"]) });
    await page.evaluate(() => { window.__nudge = 0; window.tpxPremiumLocked = true; window.tpxPremiumNudge = function () { window.__nudge++; }; });
    const c = await circle(page, CELL, 0);
    await page.mouse.click(c.x, c.y); await sleep(500);
    const r = await page.evaluate((sel) => ({ done: document.querySelector(sel + " li").classList.contains("planning-note-done"), nudge: window.__nudge }), CELL);
    assert(!r.done && r.nudge >= 1, "case cochée malgré le verrou ou aucun message Premium : " + JSON.stringify(r));
    const f = await page.evaluate(() => window.sanitizePlanningNoteHTML('<ul class="planning-note-check evil"><li class="planning-note-done x" onclick="alert(1)">a</li></ul><p class="planning-note-check">b</p><span class="planning-note-done">c</span>'));
    assert(f === '<ul class="planning-note-check"><li class="planning-note-done">a</li></ul><p>b</p><span>c</span>', "filtre : " + f);
  });

  await S("CK7", "taille et zones : case >= 1,3 em (fenêtre) / >= 15 px (planning), coche centrée, rond dans l'éditeur, toucher dans la marge coche, entre deux lignes = la plus proche, sur le texte = rien — PC et téléphone", async () => {
    for (const [label, vp] of [["PC", null], ["tél.", PHONE]]) {
      const { page } = await planUser({ notes: NOTE(["Cardio", "Pneumo", "Neuro"]), viewport: vp || undefined });
      const tap = async (x, y) => { if (vp) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await sleep(vp ? 600 : 350); };
      for (const [where, ed] of [["case du planning", CELL], ["fenêtre", "#pdd-editor"]]) {
        if (where === "fenêtre") { await page.evaluate(() => window.p1WorkSessions && 0); await openDay(page); }
        const c = await circleStable(page, ed, 0);
        const m = await page.evaluate((sel) => {
          const li = document.querySelector(sel + " ul.planning-note-check > li"), fs = parseFloat(getComputedStyle(li).fontSize), b = getComputedStyle(li, "::before"), a = getComputedStyle(li, "::after");
          const bw = parseFloat(b.width), bl = parseFloat(b.left), bt = parseFloat(b.top), aw = parseFloat(a.width), ah = parseFloat(a.height), al = parseFloat(a.left), at = parseFloat(a.top);
          return { fs, ck: bw, ckEm: bw / fs, cx: bl + bw / 2, cy: bt + bw / 2, ax: al + aw / 2, ay: at + ah / 2 };
        }, ed);
        if (where === "fenêtre") assert(m.ckEm >= 1.29, `[${label}] ${where} : case ${m.ckEm.toFixed(2)} em < 1,3 em`);
        else assert(m.ck >= 14.9, `[${label}] ${where} : case ${m.ck.toFixed(1)} px < 15 px`);
        assert(Math.abs(m.cx - m.ax) <= 1 && Math.abs(m.cy - m.ay) <= 1.2, `[${label}] ${where} : coche non centrée ${JSON.stringify(m)}`);
        assert(c.circleLeft >= c.edLeft - 0.5, `[${label}] ${where} : rond hors de l'éditeur (rond ${c.circleLeft.toFixed(1)} < éditeur ${c.edLeft.toFixed(1)})`);
        await tap(c.left - c.ck - 0.3 * c.fs + 2, c.y);   // dans la marge, à 2 px du bord gauche du rond
        let s = await liState(page, ed); assert(s[0].done && !s[1].done && !s[2].done, `[${label}] ${where} : toucher dans la marge : ${JSON.stringify(s)}`);
        await tap(c.x, c.y);                                    // décoche
        const c1 = await circle(page, ed, 1), c0 = await circle(page, ed, 0);
        await tap(c0.x, (c0.y + c1.y) / 2 - (c1.y - c0.y) * 0.18);   // entre deux lignes, plus près de la 1re
        s = await liState(page, ed); assert(s[0].done && !s[1].done, `[${label}] ${where} : toucher entre deux lignes : ${JSON.stringify(s)}`);
        await tap(c0.x, c0.y);                                  // décoche la 1re
        const ct = await circle(page, ed, 2); await tap(ct.left + 1.2 * ct.fs, ct.y);   // sur le texte : rien
        s = await liState(page, ed); assert(s.every((x) => !x.done), `[${label}] ${where} : un toucher sur le texte a coché : ${JSON.stringify(s)}`);
        if (where === "fenêtre") await page.evaluate(() => { const c = document.getElementById("pdd-close"); if (c) c.click(); });
        await sleep(400);
      }
    }
  });

  await S("CK9", "note VIDE : cliquer « Liste à cocher » puis saisir crée bien des CASES (et non de simples puces), enregistrées sur le serveur", async () => {
    const { u, page } = await planUser({ noPlanning: true });
    await openDay(page);
    await page.click("#pdd-editor"); await sleep(200);
    await page.click('#pdd-toolbar [data-cmd="bullet"]'); await sleep(400);   // le bouton « puces » existant marche aussi sur une note vide
    const pb = await page.evaluate(() => { const ul = document.querySelector("#pdd-editor ul"); return { has: !!ul, check: !!(ul && ul.classList.contains("planning-note-check")) }; });
    assert(pb.has && !pb.check, "note vide : « Liste à puces » n'a rien créé : " + JSON.stringify(pb));
    await page.click('#pdd-toolbar [data-cmd="check"]'); await sleep(400);   // une liste à puces vide devient une liste à cocher
    await page.keyboard.type("Cardio"); await page.keyboard.press("Enter"); await page.keyboard.type("Pneumo");
    const r = await page.evaluate(() => { const ul = document.querySelector("#pdd-editor ul"); return { has: !!ul, check: !!(ul && ul.classList.contains("planning-note-check")), n: document.querySelectorAll("#pdd-editor ul > li").length }; });
    assert(r.has && r.check && r.n === 2, "note vide : liste obtenue " + JSON.stringify(r) + " (cases attendues)");
    const n = await waitServer(u.uid, (s) => /planning-note-check/.test(s) && liCount(s) === 2);
    assert(/planning-note-check/.test(n) && liCount(n) === 2, "serveur : " + n);
  });

  await S("CK8", "deux appareils : la coche faite sur A apparaît sur B (onSnapshot) sans effacer ce que B est en train de saisir", async () => {
    const A = await planUser({ notes: NOTE(["Cardio", "Pneumo"]) });
    const B = await openPage(browser, A.u); OPEN.push(B.ctx); await B.page.bringToFront(); await B.page.setViewport({ width: 1366, height: 900 });
    await B.page.waitForFunction(() => window.currentUser && window._ednPlanningBridge, { timeout: 30000 });
    await killOnboarding(B.page);
    await B.page.evaluate(() => document.querySelector('[data-page="planning"]').click());
    await B.page.waitForFunction((d) => document.querySelector(`.day-notes-input[data-date="${d}"] li`), { timeout: 20000 }, TODAY);
    // B tape dans la case d'un AUTRE jour (saisie en cours), pendant que A coche
    const other = await B.page.evaluate((t) => { const eds = [...document.querySelectorAll(".day-notes-input")].filter((e) => e.dataset.date !== t); const e = eds[0]; e.scrollIntoView({ behavior: "instant", block: "center" }); return e.dataset.date; }, TODAY);
    await sleep(500);
    await B.page.click(`.day-notes-input[data-date="${other}"]`); await B.page.keyboard.type("saisie en cours");
    await A.page.bringToFront();
    const c = await circle(A.page, CELL, 0); await A.page.mouse.click(c.x, c.y);
    await waitServer(A.u.uid, (s) => /planning-note-done/.test(s));
    await B.page.bringToFront();
    await B.page.waitForFunction((d) => document.querySelector(`.day-notes-input[data-date="${d}"] li`).classList.contains("planning-note-done"), { timeout: 20000 }, TODAY);
    const kept = await B.page.evaluate((d) => document.querySelector(`.day-notes-input[data-date="${d}"]`).textContent, other);
    assert(/saisie en cours/.test(kept), "la saisie en cours sur B a été perdue : " + JSON.stringify(kept));
  });

  /* ═══════════════ Titres ═══════════════ */
  const STAT_ICONS = { daily: "rgb(245, 158, 11)", weekly: "rgb(139, 92, 246)", "priority-section": "rgb(239, 68, 68)", ranking: "rgb(245, 158, 11)" };
  const PASTEL_ICONS = { daily: "rgb(171, 129, 56)", weekly: "rgb(155, 134, 204)", "priority-section": "rgb(187, 69, 69)", ranking: "rgb(171, 129, 56)" };
  for (const theme of ["light", "pastel"]) {
    await S("ST1-" + theme, `titres des Statistiques (${theme}) : plus de trait gris, trait en dégradé de 2 px, tuile 34×34 teintée, couleurs d'icônes inchangées, une seule ligne, « ? » qui ouvre l'aide`, async () => {
      const { page } = await planUser({ noPlanning: true, theme, viewport: { width: 1366, height: 900 } });
      await page.evaluate(() => document.querySelector('[data-page="stats"]').click()); await sleep(800);
      const r = await page.evaluate(() => [...document.querySelectorAll("#page-stats .stats-section-title")].map((t) => {
        const cs = getComputedStyle(t), af = getComputedStyle(t, "::after"), i = t.querySelector("i:first-child"), ic = getComputedStyle(i), ir = i.getBoundingClientRect(), tr = t.getBoundingClientRect();
        return { cls: t.className.replace("stats-section-title", "").trim(), border: cs.borderBottomWidth, afH: af.height, afBg: /gradient/.test(af.backgroundImage), w: Math.round(ir.width), h: Math.round(ir.height), tint: ic.backgroundColor !== "rgba(0, 0, 0, 0)" || /gradient|color-mix/.test(ic.backgroundImage), color: ic.color, one: tr.height < 62, font: cs.fontFamily.slice(0, 20), help: !!t.querySelector(".help-icon") };
      }));
      assert(r.length === 5, "nombre de titres : " + r.length);
      for (const t of r) {
        assert(t.border === "0px" && t.afH === "2px" && t.afBg && t.w === 34 && t.h === 34 && t.tint && t.one, `titre « ${t.cls} » : ${JSON.stringify(t)}`);
        const exp = (theme === "pastel" ? PASTEL_ICONS : STAT_ICONS)[t.cls]; if (exp) assert(t.color === exp, `couleur d'icône « ${t.cls} » (${theme}) : ${t.color} au lieu de ${exp}`);
      }
      await page.evaluate(() => document.querySelector("#page-stats .stats-section-title.daily .help-icon").click()); await sleep(600);
      assert(await page.evaluate(() => !!document.querySelector(".help-modal-overlay.active")), "le « ? » n'ouvre pas l'aide");
    });
  }

  for (const theme of ["light", "dark", "pastel"]) {
    await S("HD1-" + theme, `titres de page (${theme}) : tuile 42 px (34 px <= 768), icône blanche, aucune ombre, une ligne, rien ne déborde à 360 px (mois « Septembre »)`, async () => {
      for (const [w, h, tile] of [[1366, 900, 42], [360, 780, 34]]) {
        const { page } = await planUser({ noPlanning: true, theme, viewport: w < 500 ? { width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: w, height: h } });
        for (const pg of ["dashboard", "items", "entrainements", "planning"]) {
          await page.evaluate((p) => document.querySelector(`[data-page="${p}"]`).click(), pg); await sleep(900);
          const r = await page.evaluate((p) => {
            const sel = p === "planning" ? "h2.planning-month-title" : `#page-${p} h2.section-title`;
            const h2 = document.querySelector(sel); if (!h2) return { missing: sel };
            if (p === "planning") { const sp = h2.querySelector("span, .planning-month-name") || h2; const t = [...h2.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (t) t.textContent = " Septembre "; }
            const i = h2.querySelector("i:first-child"), cs = getComputedStyle(i), rr = i.getBoundingClientRect(), hr = h2.getBoundingClientRect();
            return { sel, w: Math.round(rr.width), h: Math.round(rr.height), color: cs.color, shadow: cs.boxShadow, bg: cs.backgroundImage !== "none" ? "image" : cs.backgroundColor, oneLine: hr.height < (rr.height + 14), over: h2.scrollWidth > h2.clientWidth + 1 || hr.right > innerWidth + 1, help: !!h2.querySelector(".help-icon") };
          }, pg);
          assert(!r.missing, `[${w}] titre introuvable : ${r.missing}`);
          assert(r.w === tile && r.h === tile && r.color === "rgb(255, 255, 255)" && r.shadow === "none" && r.bg !== "rgba(0, 0, 0, 0)" && r.oneLine && !r.over, `[${w}] ${pg} (${theme}) : ${JSON.stringify(r)}`);
        }
      }
    });
  }

  /* ═══════════════ Fenêtre de la journée : curseur « Matières », bouton fermer ═══════════════ */
  await S("SP1", "bouton « Matières » : main au survol, main dès l'ouverture sans bouger, flèche à 1 px hors du bouton, main au retour, re-clic = fermeture", async () => {
    const { page } = await planUser({ noPlanning: true });
    await page.evaluate((d) => window.openPlanningDayDetailModal(d), TODAY); await sleep(1500);
    const b = await page.evaluate(() => { const r = document.getElementById("pdd-spec-btn").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
    const cursorAt = (x, y) => page.evaluate((px, py) => { const e = document.elementFromPoint(px, py); return e ? getComputedStyle(e).cursor : "(rien)"; }, x, y);
    await page.mouse.move(b.x - 5, b.y); await page.mouse.move(b.x, b.y);
    assert((await cursorAt(b.x, b.y)) === "pointer", "pas de main au survol du bouton : " + (await cursorAt(b.x, b.y)));
    await page.mouse.down(); await page.mouse.up();                         // ouverture SANS bouger la souris
    await page.waitForFunction(() => document.getElementById("pdd-spec-pop").classList.contains("active"), { timeout: 5000 }); await sleep(500);
    const c0 = await cursorAt(b.x, b.y);
    assert(c0 === "pointer", "après le clic, sans bouger : curseur « " + c0 + " » (main attendue)");
    await page.mouse.move(b.right + 1, b.y); await sleep(100);
    const out = await cursorAt(b.right + 1, b.y); assert(out !== "pointer", "main à 1 px hors du bouton : " + out);
    await page.mouse.move(b.x, b.y); await sleep(100);
    assert((await cursorAt(b.x, b.y)) === "pointer", "pas de main au retour sur le bouton");
    await page.mouse.down(); await page.mouse.up(); await sleep(800);
    assert(!(await page.evaluate(() => document.getElementById("pdd-spec-pop").classList.contains("active"))), "le re-clic ne ferme pas la fenêtre des spécialités");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  /* ═══════════════ Non-régression : barre d'outils, comptage des caractères, hors ligne ═══════════════ */
  await S("NR1", "barre d'outils (gras, italique, souligné, couleurs, puces, effacer) inchangée ; le compteur de caractères compte le texte, les cases n'ajoutent rien ; hors ligne : la case ne bouge pas", async () => {
    const { page } = await planUser({ noPlanning: true });
    await openDay(page);
    const sel = () => page.evaluate(() => { const ed = document.getElementById("pdd-editor"); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    const html = () => page.evaluate(() => document.getElementById("pdd-editor").innerHTML);
    const setHtml = (h) => page.evaluate((x) => { const ed = document.getElementById("pdd-editor"); ed.innerHTML = x; ed.dispatchEvent(new Event("input", { bubbles: true })); }, h);
    const fmt = [["bold", /<(b|strong)\b/i], ["italic", /<(i|em)\b/i], ["underline", /<u\b/i]];
    for (const [cmd, re] of fmt) {
      await setHtml("Texte"); await sel(); await page.click(`#pdd-toolbar [data-cmd="${cmd}"]`); await sleep(250);
      const h = await html(); assert(re.test(h), `${cmd} : ${h}`);
      await sel(); await page.click('#pdd-toolbar [data-cmd="clear"]'); await sleep(250);
      const c = await html(); assert(!re.test(c), `effacer la mise en forme (${cmd}) : ${c}`);
    }
    for (const col of ["red", "blue", "green"]) {
      await setHtml("Texte"); await sel(); await page.click(`#pdd-toolbar [data-color="${col}"]`); await sleep(250);
      const h = await html(); assert(h.includes("planning-note-" + col) || /color: rgb\(/.test(h), `couleur ${col} : ${h}`);   // l'éditeur pose une couleur en ligne ; la note enregistrée la ramène à la classe
    }
    await setHtml("Texte"); await sel(); await page.click('#pdd-toolbar [data-cmd="bullet"]'); await sleep(250);
    const bl = await page.evaluate(() => { const ul = document.querySelector("#pdd-editor ul"); return { has: !!ul, check: !!(ul && ul.classList.contains("planning-note-check")) }; });
    assert(bl.has && !bl.check, "puces : " + JSON.stringify(bl));
    // compteur : même texte en puces et en cases = même compte ; le compte suit le texte
    const cnt = () => page.evaluate(() => document.getElementById("pdd-char-count").textContent);
    await setHtml("<ul><li>Cardio</li><li>Pneumo</li><li>Neuro</li></ul>"); await sleep(200);
    const cPuces = await cnt();
    await setHtml('<ul class="planning-note-check"><li>Cardio</li><li class="planning-note-done">Pneumo</li><li>Neuro</li></ul>'); await sleep(200);
    const cCases = await cnt();
    assert(cPuces === cCases, `compteur : puces ${cPuces} / cases ${cCases}`);
    assert(/^\d+ \/ 1000$/.test(cCases) && +cCases.split(" ")[0] >= "CardioPneumoNeuro".length, "compteur incohérent : " + cCases);
    // hors ligne : la case du planning ne se coche pas
    await page.evaluate(() => document.getElementById("pdd-close").click()); await sleep(500);
    await seedNote(await (async () => ({ uid: (await page.evaluate(() => window.currentUser.uid)) }))(), NOTE(["Hors ligne"]));
    await page.evaluate(() => document.querySelector('[data-page="planning"]').click());
    await page.waitForSelector(CELL, { timeout: 15000 });
    await page.waitForFunction((c) => document.querySelector(c + " li"), { timeout: 15000 }, CELL);
    const c0 = await circleStable(page, CELL, 0);
    await page.evaluate(() => { window.offlineActionsBlocked = true; });
    await page.mouse.click(c0.x, c0.y); await sleep(600);
    const done = await page.evaluate((c) => document.querySelector(c + " li").classList.contains("planning-note-done"), CELL);
    assert(!done, "hors ligne : la case a été cochée");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  const closeBg = { light: { rest: "rgb(254, 226, 226)", red: "rgb(239, 68, 68)" }, dark: { rest: "rgba(239, 68, 68, 0.6)", red: "rgb(239, 68, 68)" }, pastel: { rest: "rgb(240, 220, 220)", red: "rgb(207, 123, 123)" } };
  for (const theme of ["light", "dark", "pastel"]) {
    await S("CL1-" + theme, `bouton fermer de la fenêtre de la journée (${theme}) : pastel au repos, rouge plein au survol ET à l'appui maintenu ; relâché hors du bouton, la fenêtre reste ouverte`, async () => {
      const { page } = await planUser({ noPlanning: true, theme });
      await page.evaluate((d) => window.openPlanningDayDetailModal(d), TODAY); await sleep(900);
      const bg = () => page.evaluate(() => getComputedStyle(document.getElementById("pdd-close")).backgroundColor);
      const waitBg = async (exp, what) => { const t0 = Date.now(); let v; while (Date.now() - t0 < 4000) { v = await bg(); if (v === exp) return; await sleep(80); } throw new Error(`${what} : ${v} au lieu de ${exp}`); };
      const e = closeBg[theme];
      await waitBg(e.rest, "repos");
      const b = await page.evaluate(() => { const r = document.getElementById("pdd-close").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(b.x, b.y); await waitBg(e.red, "survol");
      await page.mouse.down(); await sleep(250); await waitBg(e.red, "appui maintenu");
      for (let i = 0; i < 8; i++) { await sleep(120); const v = await bg(); assert(v === e.red, `appui maintenu : le bouton repasse a ${v} au lieu de rester ${e.red}`); }   // le focus ne doit PAS ramener le pastel pendant l appui
      await page.mouse.move(b.x + 140, b.y + 90); await page.mouse.up(); await sleep(500);
      assert(await page.evaluate(() => document.getElementById("pdd-overlay").classList.contains("active")), "relâché hors du bouton : la fenêtre s'est fermée");
    });
  }
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
