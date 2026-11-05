/* Évolutions : (1) Paramètres réorganisés (introduction, sommaire cliquable, « Revoir la présentation » sous « Mon compte »),
   (2) en-tête des fenêtres de notes (bouton Flashcard au survol, plus d'infobulles), (3) to-do (infobulle du « + », ajout animé, écran vide),
   (4) mode Compact : légende masquée, (5) mode Compact : animation d'ajout d'un tour, (6) raccourcis des pages dans le header (PC / iPad).
   Vraie page + émulateurs. Lancer : node test/e2e/evol-31-10.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; EVSHOTS=1 pour les captures) */
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
const FM = [
  { id: "PC", label: "PC 1366", vp: { width: 1366, height: 900 } },
  { id: "iPadP", label: "iPad portrait 820", vp: M(820, 1180) },
  { id: "iPadL", label: "iPad paysage 1180", vp: M(1180, 820) },
  { id: "tel", label: "téléphone 390", vp: M(390, 844) },
];
const shot = async (page, name) => { if (process.env.EVSHOTS) await page.screenshot({ path: `docs/captures-15-10/evol-31-10-${name}.png` }); };
const rgbOf = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);

async function open({ vp = FM[0].vp, theme = "light", courses = 2, seed = null, mode = null, reduce = false, page0 = "dashboard" } = {}) {
  const u = await mkUser({ courses });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  if (seed) await seed(u.uid);
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 600);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
  if (mode) await page.evaluate((uid, md) => { try { localStorage.setItem("toursViewMode__" + uid, md); } catch (e) {} }, u.uid, mode);
  if (page0) { await page.evaluate((p) => document.querySelector('[data-page="' + p + '"]').click(), page0); await sleep(1100); }
  if (mode) await page.evaluate(() => { if (window.applyToursModeToStats) window.applyToursModeToStats(); if (window.renderItemsTable) window.renderItemsTable(); });
  await sleep(500);
  return { u, page };
}
const openTodo = async (page) => { await page.evaluate(() => document.getElementById("global-todo-btn").click()); await page.waitForSelector("#global-todo-overlay.active", { timeout: 8000 }); await sleep(900); };
const openSettings = async (page) => { await page.evaluate(() => window.openSettingsModal()); await page.waitForSelector("#settings-modal-overlay.active", { timeout: 8000 }); await sleep(1500); };

try {
  /* EV1 (Paramètres) : remplacé par test/e2e/settings-split.mjs (mise en page en deux colonnes) */

  /* ═════════ EV2 : en-tête des fenêtres de notes ═════════ */
  for (const theme of ["light", "dark"]) {
    await S("EV2-" + theme, `en-tête des notes (${theme}) : bouton Flashcard — repos clair, survol dégradé + icône blanche, jamais allumé après focus ; aucune infobulle (title / data-tooltip) même posée après coup, aria-label conservé`, async () => {
      const { page } = await open({ theme, page0: "items" });
      await page.evaluate(() => window.openNotesModal(1, "s1", "c1", "Cours1")); await sleep(1200);
      const B = "#notesFlashBtn";
      const rest = await page.evaluate((q) => { const cs = getComputedStyle(document.querySelector(q)); return { bg: cs.backgroundColor, fg: cs.color }; }, B);
      if (theme === "light") assert(rgbOf(rest.bg).slice(0, 3).join() === "224,231,255" && rest.fg === getPrimary(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim())), "repos clair : " + JSON.stringify(rest));
      else assert(rgbOf(rest.bg).join() === "99,102,241,0.22" && rgbOf(rest.fg).join() === "199,210,254", "repos sombre : " + JSON.stringify(rest));
      await page.hover(B); await sleep(700);
      const hov = await page.evaluate((q) => { const b = document.querySelector(q), cs = getComputedStyle(b); return { img: cs.backgroundImage, fg: cs.color, sh: cs.boxShadow, tf: cs.transform, w: b.getBoundingClientRect().width }; }, B);
      assert(/linear-gradient/.test(hov.img) && rgbOf(hov.fg).join() === "255,255,255" && hov.sh !== "none" && hov.w > 60, "survol : " + JSON.stringify(hov));
      await page.evaluate((q) => document.querySelector(q).focus(), B); await sleep(500);
      const foc = await page.evaluate((q) => { const cs = getComputedStyle(document.querySelector(q)); return { img: cs.backgroundImage, bg: cs.backgroundColor }; }, B);
      assert(foc.img === "none" && rgbOf(foc.bg).length >= 3, "le bouton reste allumé avec le focus : " + JSON.stringify(foc));
      await page.mouse.move(5, 5);
      const css = await page.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.cssText && /hover: none/.test(r.conditionText || r.cssText) && /btn-flash/.test(r.cssText)); } catch (e) { return false; } }));
      assert(css, "règle tactile (pas de survol collé) absente");
      /* infobulles */
      await page.evaluate(() => { const h = document.querySelector("#notesModalInner .notes-header-right, .notes-modal-inner .notes-header-right") || document.querySelector(".notes-header-right"); const b = h.querySelector("button"); b.setAttribute("title", "Test infobulle"); const z = document.getElementById("notesTodoZone"); z.innerHTML = '<span class="notes-todo-badge" data-tooltip="Déjà dans la to-do" title="Déjà dans la to-do"><i class="fas fa-thumbtack"></i></span>'; document.getElementById("notesShareBtn").setAttribute("data-tooltip", "Partager"); }); await sleep(300);
      const tips = await page.evaluate(() => [...document.querySelectorAll(".notes-header-right")].map((h) => [...h.querySelectorAll("[title],[data-tooltip]")].map((e) => e.className + ":" + e.getAttribute("title") + ":" + e.getAttribute("data-tooltip")).concat(h.hasAttribute("title") ? ["root"] : [])));
      assert(tips.every((a) => a.length === 0), "infobulles restantes : " + JSON.stringify(tips));
      const aria = await page.evaluate(() => ({ pin: (document.querySelector("#notesTodoZone .notes-todo-badge") || {}).getAttribute && document.querySelector("#notesTodoZone .notes-todo-badge").getAttribute("aria-label"), share: document.getElementById("notesShareBtn").getAttribute("aria-label") }));
      assert(aria.pin === "Déjà dans la to-do" && aria.share === "Partager cette note", "aria-label non conservé : " + JSON.stringify(aria));
      await shot(page, "notes-entete-" + theme);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("EV2-cahier", "cahier d'erreurs : aucune infobulle dans l'en-tête", async () => {
    const { page } = await open({ page0: "entrainements", seed: async (uid) => { await adb.doc(`users/${uid}/trainingItems/8001`).set({ id: 8001, title: "Colle A", type: "colle", matiere: "s1", plateforme: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() }); } });
    await page.waitForSelector('#train-table-body tr[data-train-id="8001"]', { timeout: 20000 });
    await page.evaluate(() => window._openTrainNotes(8001)); await page.waitForSelector("#trainNotesOverlay.active"); await sleep(900);
    await page.evaluate(() => { document.getElementById("trainNotesStatutBtn").setAttribute("title", "x"); }); await sleep(300);
    const t = await page.evaluate(() => [...document.querySelectorAll("#trainNotesModalInner .notes-header-right [title],#trainNotesModalInner .notes-header-right [data-tooltip]")].length);
    assert(t === 0, "infobulles restantes : " + t);
  });

  /* ═════════ EV3 : to-do ═════════ */
  const task = (text) => ({ text, completed: false, archivedAt: null, createdAt: new Date(), updatedAt: new Date() });
  await S("EV3-tip", "to-do : infobulle « Ajouter une tâche » au survol du « + » (bulle #1f2937, 0,7 rem, pointe), sous le bouton, alignée sur son bord droit, jamais hors de l'écran ; visible au clavier ; jamais sur tactile", async () => {
    const { page } = await open({ page0: "planning" });
    await openTodo(page);
    const B = "#checklist-add-btn";
    const off = await page.evaluate((q) => getComputedStyle(document.querySelector(q), "::after").opacity, B);
    assert(off === "0", "infobulle visible au repos : " + off);
    await page.hover(B); await sleep(500);
    const t = await page.evaluate((q) => { const b = document.querySelector(q), a = getComputedStyle(b, "::after"), p = getComputedStyle(b, "::before"), br = b.getBoundingClientRect(); return { content: a.content, op: a.opacity, bg: a.backgroundColor, fs: a.fontSize, fg: a.color, w: parseFloat(a.width), r: a.right, top: parseFloat(a.top), pointe: p.borderBottomColor, vw: innerWidth, vh: innerHeight, br: { l: br.left, r: br.right, b: br.bottom } }; }, B);
    assert(/Ajouter une tâche/.test(t.content) && t.op === "1" && rgbOf(t.bg).join() === "31,41,55" && t.fs === "11.2px" && rgbOf(t.fg).join() === "255,255,255" && rgbOf(t.pointe).join() === "31,41,55", "style : " + JSON.stringify(t));
    assert(t.r === "0px" && t.br.r <= t.vw && t.br.r - t.w >= 0 && t.br.b + 9 + 24 <= t.vh, "position / débordement : " + JSON.stringify(t));
    await shot(page, "todo-infobulle");
    await page.mouse.move(5, 5); await sleep(300);
    await page.evaluate(() => document.getElementById("checklist-new-item").focus()); await page.keyboard.press("Tab"); await sleep(400);
    const k = await page.evaluate(() => ({ on: document.activeElement && document.activeElement.id, op: getComputedStyle(document.getElementById("checklist-add-btn"), "::after").opacity }));
    assert(k.on === "checklist-add-btn" && k.op === "1", "clavier : " + JSON.stringify(k));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("EV3-tip-tel", "to-do sur téléphone : aucune infobulle collée", async () => {
    const { page } = await open({ vp: FM[3].vp, page0: "planning" });
    const c = await page.evaluate(() => getComputedStyle(document.getElementById("checklist-add-btn"), "::after").content);
    assert(c === "none" || c === "normal", "infobulle présente sur tactile : " + c);
  });
  await S("EV3-anim", "to-do : la tâche ajoutée glisse en place (0,38 s) puis un halo violet s'efface (~1 s) ; aucune animation au chargement, au redessin ni en cochant ; > 3 nouvelles d'un coup : aucune", async () => {
    const { u, page } = await open({ page0: "planning", seed: async (uid) => { for (const t of ["Tâche A", "Tâche B"]) await adb.collection(`users/${uid}/tasks`).add(task(t)); } });
    await page.waitForFunction(() => document.querySelectorAll("#checklist-items .checklist-item").length === 2, { timeout: 15000 });
    await openTodo(page);
    const q = () => page.evaluate(() => [...document.querySelectorAll("#checklist-items .checklist-item")].map((e) => ({ t: e.querySelector(".checklist-item-text").textContent.trim(), n: e.classList.contains("p1-todo-new") })));
    assert((await q()).every((x) => !x.n), "animation au chargement : " + JSON.stringify(await q()));
    /* ajout par l'interface */
    await page.type("#checklist-new-item", "Nouvelle tâche"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => [...document.querySelectorAll("#checklist-items .checklist-item")].some((e) => /Nouvelle tâche/.test(e.textContent)), { timeout: 8000 });
    const a = await page.evaluate(() => { const e = [...document.querySelectorAll("#checklist-items .checklist-item")].find((x) => /Nouvelle tâche/.test(x.textContent)), cs = getComputedStyle(e); return { cls: e.classList.contains("p1-todo-new"), an: cs.animationName, dur: cs.animationDuration }; });
    assert(a.cls && /p1TodoIn/.test(a.an) && /0\.38s/.test(a.dur) && /p1TodoHalo/.test(a.an), "ajout animé : " + JSON.stringify(a));
    const others = (await q()).filter((x) => !/Nouvelle/.test(x.t) && x.n);
    assert(!others.length, "d'autres tâches animées : " + JSON.stringify(others));
    await sleep(1500);
    await page.evaluate(() => window.PlanningModule.renderChecklist()); await sleep(200);
    assert((await q()).every((x) => !x.n), "animation au simple redessin : " + JSON.stringify(await q()));
    /* cocher */
    await page.evaluate(() => document.querySelector("#checklist-items .checklist-checkbox").click()); await sleep(900);
    assert((await q()).every((x) => !x.n), "animation en cochant : " + JSON.stringify(await q()));
    /* 4 nouvelles d'un coup (autre appareil) : rien */
    { const bt = adb.batch(); for (const t of ["R1", "R2", "R3", "R4"]) bt.set(adb.collection(`users/${u.uid}/tasks`).doc(), task(t)); await bt.commit(); }   /* un seul lot : un seul rendu avec 4 nouvelles tâches */
    await page.waitForFunction(() => document.querySelectorAll("#checklist-items .checklist-item").length >= 7, { timeout: 15000 }); await sleep(300);
    assert((await q()).every((x) => !x.n), "4 nouvelles tâches animées : " + JSON.stringify(await q()));
    /* 2 nouvelles d'un coup : animées */
    { const bt = adb.batch(); for (const t of ["S1", "S2"]) bt.set(adb.collection(`users/${u.uid}/tasks`).doc(), task(t)); await bt.commit(); }
    await page.waitForFunction(() => document.querySelectorAll("#checklist-items .checklist-item").length >= 9, { timeout: 15000 });
    const two = (await q()).filter((x) => x.n).map((x) => x.t).sort().join();
    assert(two === "S1,S2", "2 nouvelles tâches : " + two);
    await shot(page, "todo-ajout");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("EV3-anim-rm", "to-do : « réduire les animations » → aucune animation d'ajout", async () => {
    const { page } = await open({ page0: "planning", reduce: true });
    await openTodo(page);
    await page.type("#checklist-new-item", "Tâche calme"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => [...document.querySelectorAll("#checklist-items .checklist-item")].some((e) => /Tâche calme/.test(e.textContent)), { timeout: 8000 });
    const an = await page.evaluate(() => getComputedStyle([...document.querySelectorAll("#checklist-items .checklist-item")].find((x) => /Tâche calme/.test(x.textContent))).animationName);
    assert(an === "none", "animation malgré « réduire les animations » : " + an);
  });
  for (const theme of ["light", "dark", "pastel"]) {
    await S("EV3-vide-" + theme, `to-do vide (${theme}) : cadre en pointillés arrondi, pastille violette 56 px inclinée avec halo qui respire, titre et texte exacts`, async () => {
      const { page } = await open({ theme, page0: "planning" });
      await page.waitForSelector("#checklist-items .p1-todo-empty", { timeout: 15000 });
      const e = await page.evaluate(() => {
        const box = document.querySelector("#checklist-items .p1-todo-empty"), cs = getComputedStyle(box), ico = box.querySelector(".p1-empty-ico"), ic = getComputedStyle(ico), vis = box.querySelector(".p1-empty-visual"), hv = getComputedStyle(vis, "::before");
        const r = ico.getBoundingClientRect(), bb = box.getBoundingClientRect(), cb = document.querySelector(".checklist-card").getBoundingClientRect();
        return { bs: cs.borderTopStyle, bw: cs.borderTopWidth, rad: cs.borderTopLeftRadius, w: Math.round(ic.width.replace("px", "")), h: Math.round(ic.height.replace("px", "")), tf: ic.transform, bg: ic.backgroundImage, halo: hv.animationName, title: box.querySelector(".p1-empty-title").textContent, text: box.querySelector(".p1-empty-text").textContent, inCard: bb.left >= cb.left && bb.right <= cb.right, over: box.scrollWidth > box.clientWidth + 1, ico: ico.querySelector("i").className };
      });
      assert(e.bs === "dashed" && parseFloat(e.rad) >= 12, "cadre : " + JSON.stringify(e));
      assert(e.w === 56 && e.h === 56 && e.tf !== "none" && /linear-gradient/.test(e.bg) && /139, 92, 246/.test(e.bg) && e.halo === "p1EmptyHalo", "pastille : " + JSON.stringify(e));
      assert(e.title === "Aucune tâche pour le moment", "titre : " + e.title);
      assert(e.text === "Écris une tâche ci-dessus puis appuie sur Entrée, ou envoie un cours depuis la liste avec la flèche : il s'affichera ici.", "texte : " + e.text);
      assert(e.inCard && !e.over, "débordement : " + JSON.stringify(e));
      await shot(page, "todo-vide-" + theme);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ EV4 : légende masquée en Compact ═════════ */
  await S("EV4", "mode Compact : bouton de légende (palette) et sa fenêtre masqués ; mode Détaillé : présents ; « Réinitialiser les filtres » toujours là ; fenêtre ouverte puis passage en Compact : fermée", async () => {
    const { u, page } = await open({ page0: "items" });
    const st = () => page.evaluate(() => ({ btn: getComputedStyle(document.querySelector(".legend-button")).display, modal: getComputedStyle(document.getElementById("legendModal")).display, show: document.getElementById("legendModal").classList.contains("show"), reset: getComputedStyle(document.getElementById("btn-reset-filters")).display, compact: document.body.classList.contains("tours-compact"), plan: !!document.querySelector(".planning-legend-btn") }));
    const d = await st();
    assert(d.btn !== "none" && !d.compact && d.reset !== "none", "Détaillé : " + JSON.stringify(d));
    await page.evaluate(() => toggleLegendModal({ stopPropagation() {} })); await sleep(500);
    assert((await st()).show, "la fenêtre de légende ne s'ouvre pas en Détaillé");
    await page.evaluate((uid) => { localStorage.setItem("toursViewMode__" + uid, "compact"); window.applyToursModeToStats(); window.renderItemsTable(); }, u.uid); await sleep(700);
    const c = await st();
    assert(c.compact && c.btn === "none" && c.modal === "none" && c.reset !== "none" && !c.show, "Compact : " + JSON.stringify(c));
    await shot(page, "compact-sans-legende");
    await page.evaluate((uid) => { localStorage.setItem("toursViewMode__" + uid, "classic"); window.applyToursModeToStats(); window.renderItemsTable(); }, u.uid); await sleep(700);
    const b = await st();
    assert(b.btn !== "none" && !b.compact && !b.show, "retour en Détaillé : " + JSON.stringify(b));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ EV5 : Compact, animation d'ajout d'un tour ═════════ */
  const pickAndAdd = async (page) => {
    await page.evaluate(() => document.querySelector("#items-table-body .tour-cell .ct-zone-r").click());
    await page.waitForSelector(".ct-conf-pop", { timeout: 5000 }); await sleep(500);
    await page.evaluate(() => { const bs = [...document.querySelectorAll(".ct-conf-pop button")]; (bs[3] || bs[bs.length - 1]).click(); });
  };
  for (const theme of ["light", "dark"]) {
    await S("EV5-" + theme, `Compact (${theme}) : ajout d'un tour → cadre vert sur toute la ligne (coins 10 px, fond .14, reflet) + pastille « +1 tour » au-dessus du compteur ; suit la ligne redessinée ; se retire seul ; l'ancien check n'est PAS joué`, async () => {
      const { u, page } = await open({ theme, page0: "items", mode: "compact" });
      assert(await page.evaluate(() => document.body.classList.contains("tours-compact") && !!document.querySelector(".ct-tile")), "pas en mode Compact");
      await page.evaluate(() => { window.__chk = 0; const f = window.showTourSuccessAnimation; window.showTourSuccessAnimation = function () { window.__chk++; return f.apply(this, arguments); }; });
      await pickAndAdd(page); await sleep(250);
      const A = await page.evaluate(() => {
        const l = document.querySelector(".p1-cfx-layer"); if (!l) return null;
        const g = l.querySelector(".p1-cfx-glow"), p = l.querySelector(".p1-cfx-pill"), gs = getComputedStyle(g), gr = g.getBoundingClientRect();
        const row = document.querySelector('#items-table-body .tour-cell[data-specialty="s1"][data-fc="c1"]').closest("tr"), rr = row.getBoundingClientRect();
        const tile = row.querySelector(".ct-tile").getBoundingClientRect(), pr = p.getBoundingClientRect();
        return { z: getComputedStyle(l).zIndex, pos: getComputedStyle(l).position, parent: l.parentElement.tagName, bs: gs.boxShadow, bg: gs.backgroundColor, rad: gs.borderTopLeftRadius, an: gs.animationName, dur: gs.animationDuration, sweep: getComputedStyle(g, "::after").animationName,
          dRow: [Math.abs(gr.left - rr.left), Math.abs(gr.top - rr.top), Math.abs(gr.right - rr.right), Math.abs(gr.bottom - rr.bottom)].map((x) => Math.round(x)), txt: p.textContent, pbg: getComputedStyle(p).backgroundImage, pfg: getComputedStyle(p).color, pan: getComputedStyle(p).animationDuration,
          above: pr.bottom <= tile.top + 6 && pr.top < tile.top, dx: Math.abs((pr.left + pr.width / 2) - (tile.left + tile.width / 2)), tableChanged: !!document.querySelector(".p1-cfx-glow").closest("#items-table-body"), checkShown: (document.getElementById("tour-success-overlay") || {}).className || "" };
      });
      assert(A, "aucun calque d'animation");
      assert(A.parent === "BODY" && A.pos === "fixed" && !A.tableChanged, "calque : " + JSON.stringify(A));
      assert(/34, 197, 94/.test(A.bs) && A.rad === "10px" && /rgba\(34, 197, 94, 0\.14\)/.test(A.bg) && A.an === "p1CfxGlow" && A.dur === "2.2s" && A.sweep === "p1CfxSweep", "cadre : " + JSON.stringify(A));
      assert(A.dRow.every((x) => x <= 6), "le cadre ne couvre pas la ligne : " + JSON.stringify(A.dRow));
      assert(A.txt === "+1 tour" && /34, 197, 94/.test(A.pbg) && /22, 163, 74/.test(A.pbg) && rgbOf(A.pfg).join() === "255,255,255" && A.pan === "1.6s" && A.above && A.dx <= 8, "pastille : " + JSON.stringify(A));
      assert(Number(A.z) < 60, "le calque passe au-dessus des bandeaux collants : " + A.z);
      assert(await page.evaluate(() => window.__chk === 0 && !document.getElementById("tour-success-overlay")?.classList.contains("active")), "l'ancien check a été joué : " + A.checkShown);
      await shot(page, "compact-ajout-" + theme);
      /* la ligne est redessinée après l'écriture : le cadre la suit */
      await page.waitForFunction(() => { const c = document.querySelector('#items-table-body .tour-cell[data-specialty="s1"][data-fc="c1"] .ct-num'); return c && c.textContent.trim() === "1"; }, { timeout: 8000 });
      await sleep(400);
      const B = await page.evaluate(() => { const g = document.querySelector(".p1-cfx-glow"); if (!g) return null; const gr = g.getBoundingClientRect(), rr = document.querySelector('#items-table-body .tour-cell[data-specialty="s1"][data-fc="c1"]').closest("tr").getBoundingClientRect(); return [Math.abs(gr.left - rr.left), Math.abs(gr.top - rr.top), Math.abs(gr.right - rr.right), Math.abs(gr.bottom - rr.bottom)].map((x) => Math.round(x)); });
      assert(B && B.every((x) => x <= 6), "le cadre ne suit pas la ligne redessinée : " + JSON.stringify(B));
      await sleep(2600);
      assert(await page.evaluate(() => !document.querySelector(".p1-cfx-layer")), "le calque ne s'est pas retiré");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
      const db = await adb.doc(`users/${u.uid}/courses/c1`).get(); assert((db.data().tourConfidences || []).filter((x) => x != null).length === 1, "le tour n'est pas enregistré");
    });
  }
  await S("EV5-retrait", "Compact : retirer un tour ne joue aucune animation (ni calque, ni check) ; Détaillé : l'ajout n'appelle pas la nouvelle animation", async () => {
    const { u, page } = await open({ page0: "items", mode: "compact", seed: async (uid) => { await adb.doc(`users/${uid}/courses/c1`).set({ tourConfidences: [3], tourDates: [new Date().toISOString().slice(0, 10)], tourDurations: [null], tourSupports: [null] }, { merge: true }); } });
    await page.evaluate(() => { window.__chk = 0; const f = window.showTourSuccessAnimation; window.showTourSuccessAnimation = function () { window.__chk++; return f.apply(this, arguments); }; window.__layers = 0; new MutationObserver((m) => m.forEach((r) => r.addedNodes.forEach((n) => { if (n.classList && (n.classList.contains("p1-cfx-layer") || n.classList.contains("tpx-pfx-layer"))) window.__layers++; }))).observe(document.body, { childList: true }); });
    await page.waitForFunction(() => { const c = document.querySelector('#items-table-body .tour-cell[data-specialty="s1"][data-fc="c1"] .ct-num'); return c && c.textContent.trim() === "1"; }, { timeout: 8000 });
    await page.evaluate(() => window.compactTourRemove("s1", "c1")); await sleep(2200);
    const n = await page.evaluate(() => ({ chk: window.__chk, layers: window.__layers, num: document.querySelector('#items-table-body .tour-cell[data-specialty="s1"][data-fc="c1"] .ct-num').textContent.trim() }));
    assert(n.num === "0" && n.chk === 0 && n.layers === 0, "animation au retrait : " + JSON.stringify(n));
    /* Détaillé : p1CompactAddFx jamais appelée */
    await page.evaluate((uid) => { localStorage.setItem("toursViewMode__" + uid, "classic"); window.applyToursModeToStats(); window.renderItemsTable(); window.__fx = 0; const f = window.p1CompactAddFx; window.p1CompactAddFx = function () { window.__fx++; return f.apply(this, arguments); }; }, u.uid); await sleep(800);
    await page.evaluate(() => { const b = document.querySelector("#items-table-body .tour-cell .add-tour-btn, #items-table-body .tour-cell [onclick*='openConfidenceModal'], #items-table-body .tour-cell .tour-add"); });
    assert((await page.evaluate(() => window.__fx)) === 0, "p1CompactAddFx appelée en Détaillé");
  });
  await S("EV5-repli", "Compact : mouvement réduit ou ligne introuvable → l'animation n'est pas jouée (renvoie false) et l'ancien check est conservé", async () => {
    const { page } = await open({ page0: "items", mode: "compact", reduce: true });
    const r = await page.evaluate(() => ({ rm: window.p1CompactAddFx("s1", "c1"), none: (() => { return window.p1CompactAddFx("zz", "zz"); })(), layers: document.querySelectorAll(".p1-cfx-layer").length }));
    assert(r.rm === false && r.none === false && r.layers === 0, "retour : " + JSON.stringify(r));
    await page.evaluate(() => { window.__chk = 0; const f = window.showTourSuccessAnimation; window.showTourSuccessAnimation = function () { window.__chk++; return f.apply(this, arguments); }; });
    await pickAndAdd(page); await sleep(900);
    const c = await page.evaluate(() => ({ chk: window.__chk, layers: document.querySelectorAll(".p1-cfx-layer").length }));
    assert(c.chk === 1 && c.layers === 0, "repli sur l'ancien check : " + JSON.stringify(c));
  });
  for (const f of [FM[1], FM[3]]) {
    await S("EV5-clip-" + f.id, `Compact (${f.label}) : le cadre est coupé au conteneur qui défile horizontalement (jamais au-delà de la partie visible), pastille masquée si le compteur est hors de vue`, async () => {
      const { page } = await open({ vp: f.vp, page0: "items", mode: "compact" });
      const info = await page.evaluate(() => { const c = document.querySelector("#page-items .items-container"); return { sw: c.scrollWidth, cw: c.clientWidth }; });
      assert(info.sw > info.cw + 20, "le tableau ne défile pas à cette largeur (" + JSON.stringify(info) + ")");
      for (const pos of [0, Math.round((info.sw - info.cw) / 2), info.sw - info.cw]) {
        await page.evaluate((x) => { document.querySelector("#page-items .items-container").scrollLeft = x; }, pos); await sleep(300);
        await page.evaluate(() => window.p1CompactAddFx("s1", "c1")); await sleep(350);
        const g = await page.evaluate(() => { const gl = document.querySelector(".p1-cfx-glow"); const cr = document.querySelector("#page-items .items-container").getBoundingClientRect(); const r = gl.getBoundingClientRect(); const pill = document.querySelector(".p1-cfx-pos"); const pr = pill.querySelector(".p1-cfx-pill").getBoundingClientRect(); const hidden = getComputedStyle(pill).visibility === "hidden"; return { l: r.left >= cr.left - 1, r: r.right <= cr.right + 1, w: r.width, pillHidden: hidden, pillInside: hidden || (pr.left >= cr.left - 1 && pr.right <= cr.right + 1) }; });
        assert(g.l && g.r && g.w > 0, `défilement ${pos} : cadre hors du conteneur ${JSON.stringify(g)}`);
        assert(g.pillInside, `défilement ${pos} : la pastille dépasse la partie visible de la ligne`);
        await page.evaluate(() => document.querySelectorAll(".p1-cfx-layer").forEach((l) => l.remove())); await sleep(100);
      }
      await shot(page, "compact-clip-" + f.id);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ EV6 : raccourcis des pages dans le header ═════════ */
  for (const f of FM.slice(0, 3)) for (const theme of f.id === "PC" ? ["light", "dark"] : ["light"]) {
    await S(`EV6-${f.id}-${theme}`, `header (${f.label}, ${theme}) : les raccourcis apparaissent quand la vraie barre passe sous le header, disparaissent quand elle revient ; pilule 46 px, boutons de 44 px (icône 1,08 rem), centrée entre logo et menus, mêmes icônes dans le même ordre, page active suivie, To-Do violet, aucune infobulle`, async () => {
      const { page } = await open({ vp: f.vp, theme, page0: "dashboard" });
      await page.evaluate(() => { const d = document.createElement("div"); d.id = "p1-ev-spacer"; d.style.height = "2600px"; document.querySelector("footer, body").appendChild(d); }); await sleep(300);
      const st = () => page.evaluate(() => { const p = document.getElementById("p1HdrNav"), cs = getComputedStyle(p); return { cls: p.className, vis: cs.visibility, op: cs.opacity, disp: cs.display }; });
      let s0 = await st(); assert(s0.vis === "hidden" && !/is-on/.test(s0.cls), "pilule visible en haut de page : " + JSON.stringify(s0));
      await page.evaluate(() => window.scrollTo(0, 700)); await sleep(900);
      const s1 = await st(); assert(/is-on/.test(s1.cls) && s1.vis === "visible", "pilule absente en bas : " + JSON.stringify(s1));
      const g = await page.evaluate(() => {
        const p = document.getElementById("p1HdrNav"), r = p.getBoundingClientRect(), hdr = document.getElementById("header"), logo = hdr.querySelector(".logo").getBoundingClientRect(), right = hdr.querySelector("nav.nav, .nav").getBoundingClientRect();
        const real = [...document.querySelectorAll(".app-nav .app-nav-btn")].map((b) => ({ page: b.dataset.page, ic: b.querySelector("i").className, act: b.classList.contains("active"), name: b.querySelector("span") ? b.querySelector("span").textContent.trim() : "" }));
        const bs = [...p.querySelectorAll(".p1-hdr-b")], ps = getComputedStyle(p);
        const todoReal = document.querySelector("#global-todo-btn i").className;
        return { h: r.height, pad: ps.paddingTop, bd: ps.borderTopWidth, rad: ps.borderTopLeftRadius, bg: ps.backgroundColor, sh: ps.boxShadow, cx: r.left + r.width / 2, mid: (logo.right + right.left) / 2, w: r.width, gap: right.left - logo.right,
          btnW: bs.map((b) => Math.round(b.getBoundingClientRect().width)), icoFs: getComputedStyle(bs[0]).fontSize, pages: bs.filter((b) => b.dataset.page).map((b) => ({ page: b.dataset.page, ic: b.querySelector("i").className, act: b.classList.contains("active"), aria: b.getAttribute("aria-label"), txt: b.textContent.trim() })), todo: bs.filter((b) => b.classList.contains("todo")).map((b) => ({ ic: b.querySelector("i").className, bg: getComputedStyle(b).backgroundImage, aria: b.getAttribute("aria-label"), last: b === bs[bs.length - 1] })),
          real, todoReal, tips: [...p.querySelectorAll("*")].filter((e) => e.hasAttribute("title") || e.hasAttribute("data-tooltip")).length + (p.hasAttribute("title") ? 1 : 0), delays: bs.map((b) => getComputedStyle(b).animationDelay), anim: getComputedStyle(p).animationName + "/" + getComputedStyle(p).animationDuration, ianim: getComputedStyle(bs[0]).animationName + "/" + getComputedStyle(bs[0]).animationDuration + "/" + getComputedStyle(bs[0]).animationTimingFunction,
          scriptTag: document.getElementById("p1-evol-js") && document.getElementById("p1-evol-js").tagName, pillTag: p.tagName, hdrBottom: hdr.getBoundingClientRect().bottom, pillTop: r.top, pillBottom: r.bottom };
      });
      assert(g.h === 46 && g.pad === "4px" && g.btnW.every((w) => w === 44) && g.icoFs === "17.28px", "gabarit : " + JSON.stringify({ h: g.h, pad: g.pad, btnW: g.btnW, fs: g.icoFs }));
      assert(Math.abs(g.cx - g.mid) <= 2 && g.gap >= g.w + 24, "centrage entre logo et menus : " + JSON.stringify({ cx: g.cx, mid: g.mid, gap: g.gap, w: g.w }));
      assert(g.pages.map((x) => x.page).join() === g.real.map((x) => x.page).join() && g.pages.every((x, i) => x.ic === g.real[i].ic && x.aria === g.real[i].name && x.txt === "" && x.act === g.real[i].act), "icônes / ordre / page active : " + JSON.stringify({ p: g.pages, r: g.real }));
      assert(g.todo.length === 1 && g.todo[0].last && g.todo[0].ic === g.todoReal && /139, 92, 246/.test(g.todo[0].bg) && /124, 58, 237/.test(g.todo[0].bg) && g.todo[0].aria === "To-Do", "To-Do : " + JSON.stringify(g.todo));
      assert(g.tips === 0, "infobulles dans la pilule : " + g.tips);
      assert(g.pillTop >= 0 && g.pillBottom <= g.hdrBottom, "la pilule sort du header : " + JSON.stringify({ t: g.pillTop, b: g.pillBottom, h: g.hdrBottom }));
      assert(g.scriptTag === "SCRIPT" && g.pillTag === "DIV", "identifiants : " + g.scriptTag + " / " + g.pillTag);
      assert(/p1HdrPillIn\/0\.28s/.test(g.anim) && /p1HdrIcoIn\/0\.3s\/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(g.ianim) && g.delays.slice(0, 4).join() === "0s,0.035s,0.07s,0.105s", "animations : " + JSON.stringify({ a: g.anim, i: g.ianim, d: g.delays }));
      if (theme === "dark") assert(rgbOf(g.bg).slice(0, 3).join() === "30,41,59", "fond sombre : " + g.bg); else assert(rgbOf(g.bg).slice(0, 3).join() === "255,255,255" && /15, 23, 42/.test(g.sh), "fond clair : " + g.bg + " " + g.sh);
      await shot(page, `header-${f.id}-${theme}`);
      /* retour de la vraie barre : disparition en fondu, sur place */
      const w0 = g.w;
      await page.evaluate(() => window.scrollTo(0, 0));
      let off = await st(); for (let i = 0; i < 12 && !/is-off/.test(off.cls); i++) { await sleep(40); off = await st(); }
      assert(/is-off/.test(off.cls) && !/is-on/.test(off.cls), "pas de fondu de sortie : " + JSON.stringify(off));
      const w1 = await page.evaluate(() => document.getElementById("p1HdrNav").getBoundingClientRect().width); assert(Math.abs(w1 - w0) < 1, "la pilule change de taille en disparaissant : " + w0 + " → " + w1);
      await sleep(700); const s2 = await st(); assert(s2.vis === "hidden" && !/is-/.test(s2.cls), "pilule encore là : " + JSON.stringify(s2));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("EV6-clic", "header : clic sur une icône = clic de la vraie barre (même page) puis retour doux tout en haut, les raccourcis repartent ; To-Do : ouvre la to-do SANS faire défiler ; compteur de la to-do en pastille rouge ; suit la page active", async () => {
    const { page } = await open({ page0: "dashboard" });
    await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "2600px"; document.querySelector("footer, body").appendChild(d); }); await sleep(300);
    await page.evaluate(() => window.scrollTo(0, 700)); await sleep(900);
    await page.evaluate(() => { const rc = document.getElementById("global-todo-count"); rc.textContent = "3"; rc.style.display = ""; }); await sleep(300);
    const cnt = await page.evaluate(() => { const c = document.querySelector("#p1HdrNav .p1-hdr-cnt"); return c && { show: getComputedStyle(c).display !== "none", t: c.textContent, bg: getComputedStyle(c).backgroundColor }; });
    assert(cnt && cnt.show && cnt.t === "3" && rgbOf(cnt.bg).join() === "239,68,68", "compteur : " + JSON.stringify(cnt));
    await page.evaluate(() => { const rc = document.getElementById("global-todo-count"); rc.style.display = "none"; rc.textContent = "0"; }); await sleep(300);
    assert(await page.evaluate(() => getComputedStyle(document.querySelector("#p1HdrNav .p1-hdr-cnt")).display === "none"), "compteur toujours affiché à 0");
    /* To-Do */
    const y0 = await page.evaluate(() => scrollY);
    await page.evaluate(() => document.querySelector("#p1HdrNav .p1-hdr-b.todo").click()); await sleep(900);
    const t = await page.evaluate(() => ({ y: scrollY, open: !!document.querySelector("#global-todo-overlay.active, #global-todo-overlay.show, #global-todo-overlay.open") || getComputedStyle(document.getElementById("global-todo-overlay")).visibility === "visible" }));
    assert(Math.abs(t.y - y0) <= 2 && t.open, "To-Do : " + JSON.stringify({ y0, t }));
    await page.keyboard.press("Escape"); await page.evaluate(() => { const c = document.querySelector("#global-todo-overlay .global-todo-close, #global-todo-overlay [onclick*='close']"); if (c) c.click(); }); await sleep(600);
    /* page */
    await page.evaluate(() => document.querySelector('#p1HdrNav .p1-hdr-b[data-page="planning"]').click()); await sleep(250);
    const mid = await page.evaluate(() => ({ y: scrollY, page: document.querySelector(".app-nav-btn.active").dataset.page }));
    assert(mid.page === "planning", "la vraie page n'a pas changé : " + mid.page);
    await sleep(1500);
    const up = await page.evaluate(() => { const n = document.querySelector(".app-nav").getBoundingClientRect(); return { y: scrollY, navTop: Math.round(n.top), navBottom: Math.round(n.bottom), hdr: Math.round(document.getElementById("header").getBoundingClientRect().bottom), on: document.getElementById("p1HdrNav").classList.contains("is-on") }; });
    assert(up.y > 20 && up.navTop >= up.hdr && up.navTop <= up.hdr + 24 && !up.on, "remontée : juste au-dessus de la barre (pas tout en haut) et raccourcis repartis : " + JSON.stringify(up));
    /* la page active suit la vraie barre */
    await page.evaluate(() => window.scrollTo(0, 700)); await sleep(900);
    await page.evaluate(() => document.querySelector('.app-nav-btn[data-page="entrainements"]').click()); await sleep(900);
    assert(await page.evaluate(() => document.querySelector('#p1HdrNav .p1-hdr-b.active').dataset.page === "entrainements"), "la page active ne suit pas la vraie barre");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("EV6-tel", "téléphone 390 : aucun raccourci dans le header, même en bas de page ; iPad paysage : la pilule se masque si la place manque (largeur + 24 px)", async () => {
    const { page } = await open({ vp: FM[3].vp, page0: "dashboard" });
    await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "2600px"; document.querySelector("footer, body").appendChild(d); window.scrollTo(0, 700); }); await sleep(900);
    const p = await page.evaluate(() => { const e = document.getElementById("p1HdrNav"), cs = getComputedStyle(e); return { disp: cs.display, on: e.classList.contains("is-on") }; });
    assert(p.disp === "none" && !p.on, "pilule sur téléphone : " + JSON.stringify(p));
    /* place insuffisante : on rétrécit la fenêtre (768) puis on simule un logo trop large */
    await page.setViewport({ width: 800, height: 900 }); await sleep(600);
    await page.evaluate(() => { document.querySelector("#header .logo").style.width = "560px"; window.scrollTo(0, 0); window.scrollTo(0, 720); }); await sleep(900);
    const q = await page.evaluate(() => ({ on: document.getElementById("p1HdrNav").classList.contains("is-on") }));
    assert(!q.on, "la pilule s'affiche sans place suffisante");
  });
  await S("EV6-reload", "header : après un rechargement, déjà en bas de page → un simple recalcul (sans événement de défilement) affiche directement les raccourcis ; l'écran de chargement garde la page en haut (aucune pilule fantôme)", async () => {
    const { page } = await open({ page0: "dashboard" });
    await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "2600px"; document.body.appendChild(d); }); await sleep(300);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
    await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); const d = document.createElement("div"); d.style.height = "2600px"; document.body.appendChild(d); });
    await page.waitForFunction(() => !document.documentElement.classList.contains("p1-skel") && document.querySelector(".app-nav").getClientRects().length > 0, { timeout: 25000 }); await sleep(600);
    assert(await page.evaluate(() => scrollY === 0 && !document.getElementById("p1HdrNav").classList.contains("is-on")), "pilule affichée en haut de page après rechargement");
    const r = await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 800); window.p1HdrShortcutsUpdate(); return { y: scrollY, on: document.getElementById("p1HdrNav").classList.contains("is-on") }; });
    assert(r.y > 100 && r.on, "recalcul sans événement de défilement : " + JSON.stringify(r));
  });
  await S("EV6-J", "header : le raccourci « Révisions J » suit le réglage « Méthode des J » EN DIRECT (pilule déjà affichée, sans défiler) : absent quand la méthode est désactivée, apparaît à l'activation (avant To-Do), disparaît à la désactivation ; compteur repris ; clic = ouvre les révisions J sans défiler", async () => {
    const { page } = await open({ page0: "dashboard" });
    await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "2600px"; document.querySelector("footer, body").appendChild(d); }); await sleep(300);
    await page.evaluate(() => window.scrollTo(0, 700)); await sleep(900);
    const pill = () => page.evaluate(() => ({ on: document.getElementById("p1HdrNav").classList.contains("is-on"), btns: [...document.querySelectorAll("#p1HdrNav .p1-hdr-b")].map((b) => (b.dataset.page || (b.classList.contains("jrev") ? "jrev" : "todo"))), y: scrollY, real: getComputedStyle(document.getElementById("global-jrev-btn")).display }));
    const p0 = await pill();
    assert(p0.on && p0.btns.join() === "stats,dashboard,items,entrainements,planning,todo" && p0.real === "none", "départ (méthode désactivée) : " + JSON.stringify(p0));
    /* activation par le vrai réglage */
    await page.evaluate(() => window.openSettingsModal()); await page.waitForSelector("#settings-modal-overlay.active"); await sleep(1200);
    await page.evaluate(() => window.p1OpenSettingsSection("Méthode des J")); await sleep(500);
    await page.click('#j-method-switch .seg-opt[data-jmethod="on"]'); await sleep(1200);
    const p1 = await pill();
    assert(p1.real !== "none" && p1.btns.join() === "stats,dashboard,items,entrainements,planning,jrev,todo" && p1.on && p1.y === p0.y, "après activation : " + JSON.stringify(p1));
    const jb = await page.evaluate(() => { const b = document.querySelector("#p1HdrNav .p1-hdr-b.jrev"), r = b.getBoundingClientRect(), n = b.nextElementSibling; return { aria: b.getAttribute("aria-label"), ic: b.querySelector("i").className, title: b.hasAttribute("title"), w: Math.round(r.width), nextTodo: !!n && n.classList.contains("todo") }; });
    assert(jb.aria === "Révisions J" && /fa-calendar-check/.test(jb.ic) && !jb.title && jb.w === 44 && jb.nextTodo, "bouton J : " + JSON.stringify(jb));
    /* la pilule reste centrée et dans le header avec 7 boutons */
    const g = await page.evaluate(() => { const p = document.getElementById("p1HdrNav").getBoundingClientRect(), h = document.getElementById("header"), l = h.querySelector(".logo").getBoundingClientRect(), r = h.querySelector("nav.nav, .nav").getBoundingClientRect(); return { cx: p.left + p.width / 2, mid: (l.right + r.left) / 2, fits: r.left - l.right >= p.width + 24 }; });
    assert(Math.abs(g.cx - g.mid) <= 2 && g.fits, "centrage avec le bouton J : " + JSON.stringify(g));
    /* compteur */
    await page.evaluate(() => { const c = document.getElementById("global-jrev-count"); c.textContent = "2"; c.style.display = ""; }); await sleep(300);
    const cnt = await page.evaluate(() => { const c = document.querySelector("#p1HdrNav .p1-hdr-b.jrev .p1-hdr-cnt"); return c && { show: getComputedStyle(c).display !== "none", t: c.textContent }; });
    assert(cnt && cnt.show && cnt.t === "2", "compteur J : " + JSON.stringify(cnt));
    await page.evaluate(() => { const c = document.getElementById("global-jrev-count"); c.style.display = "none"; c.textContent = "0"; });
    /* désactivation par le vrai réglage */
    await page.click('#j-method-switch .seg-opt[data-jmethod="off"]'); await sleep(1200);
    const p2 = await pill();
    assert(p2.real === "none" && p2.btns.join() === p0.btns.join() && p2.on && p2.y === p0.y, "après désactivation : " + JSON.stringify(p2));
    await page.evaluate(() => window.closeSettingsModal()); await sleep(600);
    /* activé pendant que la pilule est cachée : elle est juste au moment de réapparaître */
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(900);
    await page.evaluate((uid) => { localStorage.setItem("jMethodEnabled__" + uid, "1"); if (window.refreshJMethodUI) window.refreshJMethodUI(); }, await page.evaluate(() => window.currentUser.uid)); await sleep(500);
    await page.evaluate(() => window.scrollTo(0, 700)); await sleep(900);
    const p3 = await pill(); assert(p3.on && p3.btns.includes("jrev"), "réapparition : " + JSON.stringify(p3));
    /* clic : ouvre les révisions J sans défiler */
    const y3 = p3.y; await page.evaluate(() => document.querySelector("#p1HdrNav .p1-hdr-b.jrev").click()); await sleep(900);
    const o = await page.evaluate(() => ({ y: scrollY, open: !!document.querySelector("#global-jrev-overlay.active, #global-jrev-overlay.show, #global-jrev-overlay.open") || getComputedStyle(document.getElementById("global-jrev-overlay")).visibility === "visible" }));
    assert(Math.abs(o.y - y3) <= 2 && o.open, "clic J : " + JSON.stringify(o));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
function getPrimary(v) { const m = v.match(/^#([0-9a-f]{6})$/i); if (!m) return v; const n = parseInt(m[1], 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; }
