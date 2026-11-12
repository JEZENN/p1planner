/* To-Do, « Valider un tour + la tâche » :
   - mode Détaillé : ouvre la fenêtre « Enregistrer un tour » (confiance, date, durée, support), la To-Do reste ouverte dessous, la tâche est validée à l'enregistrement ;
   - mode Compact : sélecteur de niveau dans le popover, avec la pastille du cours centrée, non rognée, au texte lisible.
   Vraie page + émulateurs, tout par de vrais clics. Lancer : node test/e2e/todo-modes.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; TODOSHOT=1 pour les captures) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const PC = { width: 1366, height: 900 };

async function ouvrir({ compact = false, couleur = "#6366f1", nom = "Ventilation" } = {}) {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  await adb.doc(`users/${u.uid}/subjects/s1`).set({ name: nom, color: couleur }, { merge: true });
  const now = new Date();
  await adb.doc(`users/${u.uid}/tasks/tk-c1`).set({ text: "01 - Cours1", itemKey: "s1-c1", completed: false, archivedAt: null, createdAt: now, updatedAt: now });
  await adb.doc(`users/${u.uid}/tasks/tk-c2`).set({ text: "02 - Cours2", itemKey: "s1-c2", completed: false, archivedAt: null, createdAt: new Date(now.getTime() + 1), updatedAt: now });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.setViewport(PC); await sleep(700);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
  if (compact) { await page.evaluate((uid) => { localStorage.setItem("toursViewMode__" + uid, "compact"); window.applyToursModeToStats(); window.renderItemsTable(); }, u.uid); await sleep(600); }
  page.__erreurs = []; page.on("pageerror", (e) => page.__erreurs.push(String(e.message || e)));
  await waitFor(() => page.evaluate(() => document.querySelectorAll("#checklist-items .checklist-item").length === 2), { timeout: 25000 });
  await page.click("#global-todo-btn"); await page.waitForSelector("#global-todo-overlay.active", { timeout: 8000 }); await sleep(900);
  return { u, page };
}
const boite = (id) => `#checklist-items [data-todo-id="${id}"] .checklist-checkbox`;
const cliquerBoite = async (page, id) => { await page.click(boite(id)); await sleep(800); };
const etatPanneau = (page) => page.evaluate(() => ({ actif: document.getElementById("global-todo-overlay").classList.contains("active"), ferme: document.getElementById("global-todo-overlay").classList.contains("closing") }));
const tache = async (u, id) => (await adb.doc(`users/${u.uid}/tasks/${id}`).get()).data();
const cours = async (u, id) => (await adb.doc(`users/${u.uid}/courses/${id}`).get()).data();

await S("TM1", "mode Détaillé : « Valider un tour + la tâche » ouvre la fenêtre « Enregistrer un tour » (pas seulement le niveau), la To-Do reste ouverte dessous, aucune ligne marquée ni popover", async () => {
  const { page } = await ouvrir(); await cliquerBoite(page, "tk-c1");
  const av = await page.evaluate(() => ({ mode: document.getElementById("checklist-choice-popup").getAttribute("data-p1-mode"), niveaux: document.querySelectorAll("#p1-tl-expand .p1-tl-lv").length, chev: document.querySelector("#checklist-choice-tour .train-cl-chevron").className }));
  assert(av.mode === "detail" && av.niveaux === 0 && /chevron-right/.test(av.chev), "popover détaillé : " + JSON.stringify(av));
  await page.click("#checklist-choice-tour"); await sleep(1200);
  const m = await page.evaluate(() => {
    const mod = document.getElementById("confidence-modal"), r = mod.querySelector(".confidence-modal-content").getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + 60);
    return { actif: mod.classList.contains("active"), dessus: !!h && mod.contains(h), titre: document.getElementById("confidence-modal-title").textContent, nom: document.getElementById("tour-context-name").textContent, support: document.querySelectorAll("#tour-support-buttons .support-btn").length, duree: !!document.getElementById("tour-duration-hours"), date: !!document.getElementById("tour-date"), popover: document.getElementById("checklist-choice-popup").classList.contains("show"), cibles: document.querySelectorAll(".p1-todo-cible").length };
  });
  assert(m.actif && m.dessus, "fenêtre « Enregistrer un tour » absente ou recouverte : " + JSON.stringify(m));
  assert(m.support > 0 && m.duree && m.date, "support / durée / date absents : " + JSON.stringify(m));
  assert(!m.popover && m.cibles === 0, "popover ou marquage resté : " + JSON.stringify(m));
  assert(/Cours1/.test(m.nom), "cours affiché : " + m.nom);
  const p = await etatPanneau(page); assert(p.actif && !p.ferme, "la To-Do s'est fermée : " + JSON.stringify(p));
  if (process.env.TODOSHOT) await page.screenshot({ path: "docs/captures-15-10/todo-tour-detaille.png" });
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await S("TM2", "mode Détaillé : enregistrer le tour (confiance, durée, support) valide la tâche ; le tour est écrit avec ces valeurs ; la To-Do reste ouverte", async () => {
  const { u, page } = await ouvrir(); await cliquerBoite(page, "tk-c1");
  await page.click("#checklist-choice-tour"); await sleep(1200);
  await page.click('#confidence-buttons .confidence-btn[data-confidence="4"]'); await sleep(200);
  await page.type("#tour-duration-hours", "1"); await page.type("#tour-duration-minutes", "30");
  const sup = await page.evaluate(() => { const b = document.querySelector("#tour-support-buttons .support-btn"); return b ? b.getAttribute("data-support") : null; });
  await page.click("#tour-support-buttons .support-btn"); await sleep(200);
  await page.click("#btn-save-tour"); await sleep(1500);
  assert(await waitFor(async () => { const t = await tache(u, "tk-c1"); return t && t.completed === true; }, { timeout: 15000 }), "tâche non validée sur le serveur");
  const c = await cours(u, "c1");
  assert(c && (c.tourConfidences || [])[0] === 4, "confiance du tour : " + JSON.stringify(c && c.tourConfidences));
  assert(c && /1:30|90|01:30/.test(String((c.tourDurations || [])[0])), "durée du tour : " + JSON.stringify(c && c.tourDurations));
  assert(c && (c.tourSupports || [])[0] && (c.tourSupports || [])[0] === sup, "support du tour : " + JSON.stringify(c && c.tourSupports) + " (choisi " + sup + ")");
  const p = await etatPanneau(page); assert(p.actif && !p.ferme, "la To-Do s'est fermée à l'enregistrement : " + JSON.stringify(p));
  assert(!(await page.evaluate(() => document.getElementById("confidence-modal").classList.contains("active"))), "fenêtre encore ouverte après l'enregistrement");
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await S("TM3", "mode Détaillé : fermer la fenêtre sans enregistrer ne valide ni la tâche ni un tour", async () => {
  const { u, page } = await ouvrir(); await cliquerBoite(page, "tk-c2");
  await page.click("#checklist-choice-tour"); await sleep(1200);
  await page.click("#confidence-close"); await sleep(1500);
  const t = await tache(u, "tk-c2"), c = await cours(u, "c2");
  assert(t && t.completed === false, "tâche validée sans enregistrement");
  assert(!c || !(c.tourConfidences || []).some((x) => x != null), "tour écrit sans enregistrement : " + JSON.stringify(c && c.tourConfidences));
  const p = await etatPanneau(page); assert(p.actif, "la To-Do s'est fermée");
});

await S("TM4", "mode Détaillé : clavier (Entrée sur « Valider un tour + la tâche ») ouvre aussi la fenêtre", async () => {
  const { page } = await ouvrir(); await cliquerBoite(page, "tk-c1");
  await page.focus("#checklist-choice-tour"); await page.keyboard.press("Enter"); await sleep(1200);
  assert(await page.evaluate(() => document.getElementById("confidence-modal").classList.contains("active")), "fenêtre non ouverte au clavier");
});

await S("TM5", "mode Compact : le popover déplie le sélecteur de niveau (pas la grande fenêtre) ; choisir un niveau écrit le tour et valide la tâche", async () => {
  const { u, page } = await ouvrir({ compact: true }); await cliquerBoite(page, "tk-c1");
  const av = await page.evaluate(() => ({ mode: document.getElementById("checklist-choice-popup").getAttribute("data-p1-mode"), niveaux: document.querySelectorAll("#p1-tl-expand .p1-tl-lv").length, chev: document.querySelector("#checklist-choice-tour .train-cl-chevron").className }));
  assert(av.mode === "compact" && av.niveaux >= 5 && /chevron-down/.test(av.chev), "popover compact : " + JSON.stringify(av));
  await page.click("#checklist-choice-tour"); await sleep(700);
  assert(!(await page.evaluate(() => document.getElementById("confidence-modal").classList.contains("active"))), "la grande fenêtre s'est ouverte en mode Compact");
  await page.click('#p1-tl-expand .p1-tl-lv[data-v="3"]'); await sleep(1500);
  assert(await waitFor(async () => { const t = await tache(u, "tk-c1"); return t && t.completed === true; }, { timeout: 15000 }), "tâche non validée");
  const c = await cours(u, "c1"); assert(c && (c.tourConfidences || [])[0] === 3, "niveau du tour : " + JSON.stringify(c && c.tourConfidences));
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

for (const [couleur, attendu] of [["#6366f1", "255,255,255"], ["#7c6cf6", "255,255,255"], ["#fde68a", "17,24,39"]]) {
  await S("TM6-" + couleur.slice(1), `mode Compact, cours de couleur ${couleur} : pastille centrée, entière (bord visible, rien de rogné), texte ${attendu === "255,255,255" ? "blanc" : "foncé"}`, async () => {
    const { page } = await ouvrir({ compact: true, couleur }); await cliquerBoite(page, "tk-c1");
    await page.click("#checklist-choice-tour"); await sleep(800);
    const g = await page.evaluate(() => {
      const h = document.getElementById("p1-tl-expand"), p = h.querySelector(".p1-tl-subj"), l = h.querySelector(".p1-tl-lvls"), hr = h.getBoundingClientRect(), pr = p.getBoundingClientRect(), lr = l.getBoundingClientRect(), cs = getComputedStyle(p);
      return { dx: Math.abs((pr.left + pr.right) / 2 - (lr.left + lr.right) / 2), gauche: pr.left - hr.left, droite: hr.right - pr.right, bord: cs.borderLeftWidth, fond: cs.backgroundColor, texte: cs.color, nom: p.textContent.trim() };
    });
    assert(g.dx <= 1.5, "pastille non centrée (écart " + g.dx.toFixed(1) + " px) " + JSON.stringify(g));
    assert(g.gauche >= 0 && g.droite >= 0 && parseFloat(g.bord) >= 2, "pastille rognée : " + JSON.stringify(g));
    const hex = [1, 3, 5].map((i) => parseInt(couleur.slice(i, i + 2), 16)).join();
    assert((g.fond.match(/\d+/g) || []).slice(0, 3).join() === hex, "fond de la pastille " + g.fond + " : la couleur de la matière (" + couleur + ") n'est pas reprise");
    assert(g.nom === "Ventilation", "nom de la matière : " + g.nom);
    assert((g.texte.match(/\d+/g) || []).slice(0, 3).join() === attendu, "couleur du texte " + g.texte + " (attendu " + attendu + ") sur " + g.fond);
    if (process.env.TODOSHOT && couleur === "#6366f1") { const r = await page.evaluate(() => { const p = document.getElementById("checklist-choice-popup").getBoundingClientRect(); return { x: p.left - 12, y: p.top - 12, width: p.width + 24, height: p.height + 24 }; }); await page.screenshot({ path: "docs/captures-15-10/todo-compact-pastille.png", clip: r }); }
  });
}

const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
