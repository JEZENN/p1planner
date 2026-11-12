/* To-Do : la tâche dont le popover de validation est ouvert est repérable (case violette, contour, flèche du popover vers la case).
   Vraie page + émulateurs, ouvertures et fermetures par de vrais clics (cours et entraînement).
   Lancer : node test/e2e/todo-cible.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; TODOSHOT=1 pour les captures) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const PC = { width: 1366, height: 900 }, TEL = { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const VIOLET = "124,58,237";
const rgbOf = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);

const COURS = ["tk-c1", "tk-c2", "tk-c3", "tk-c4"], ENTR = ["tk-t1", "tk-t2"];
async function ouvrir({ vp = PC, theme = "light", reduce = false } = {}) {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  const now = new Date();
  for (let i = 0; i < 4; i++) await adb.doc(`users/${u.uid}/tasks/${COURS[i]}`).set({ text: `0${i + 1} - Cours ${i + 1}`, itemKey: `s1-c${i + 1}`, completed: false, archivedAt: null, createdAt: new Date(now.getTime() + i), updatedAt: now });
  for (let i = 0; i < 2; i++) {
    await adb.doc(`users/${u.uid}/trainingItems/${1001 + i}`).set({ id: 1001 + i, titre: `QCM ${1001 + i}`, title: `QCM ${1001 + i}`, type: "colle", matiere: "s1", plat: "edni", statut: "a-faire", archivedAt: null, updatedAt: now });
    await adb.doc(`users/${u.uid}/tasks/${ENTR[i]}`).set({ text: `QCM ${1001 + i}`, itemKey: `train-${1001 + i}`, completed: false, archivedAt: null, createdAt: new Date(now.getTime() + 10 + i), updatedAt: now });
  }
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 700);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
  page.__erreurs = []; page.on("pageerror", (e) => page.__erreurs.push(String(e.message || e)));
  await waitFor(() => page.evaluate(() => document.querySelectorAll("#checklist-items .checklist-item").length === 6 && (window.userData.trainings || []).length === 2), { timeout: 25000 });
  return { u, page };
}
const ouvrirPanneau = async (page) => { await page.click("#global-todo-btn"); await page.waitForSelector("#global-todo-overlay.active", { timeout: 8000 }); await sleep(900); };
const boite = (id) => `#checklist-items [data-todo-id="${id}"] .checklist-checkbox`;
/* la case est d'abord amenée à l'écran et la page laissée se stabiliser : un défilement tardif fermerait le popover (comportement voulu) */
const cliquerBoite = async (page, id) => { await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center", behavior: "instant" }), boite(id)); await sleep(450); await page.click(boite(id)); await sleep(700); };
const etat = (page) => page.evaluate(() => {
  const cibles = [...document.querySelectorAll(".checklist-item.p1-todo-cible")].map((e) => e.getAttribute("data-todo-id"));
  const ouverts = ["checklist-choice-popup", "train-checklist-popup"].filter((i) => document.getElementById(i).classList.contains("show"));
  return { cibles, ouverts };
});
/* géométrie du popover ouvert par rapport à la ligne ciblée */
const geo = (page, id) => page.evaluate((i) => {
  const row = document.querySelector(`#checklist-items [data-todo-id="${i}"]`), box = row.querySelector(".checklist-checkbox");
  const pop = ["checklist-choice-popup", "train-checklist-popup"].map((x) => document.getElementById(x)).find((p) => p.classList.contains("show"));
  if (!pop) return null;
  const r = row.getBoundingClientRect(), p = pop.getBoundingClientRect(), b = box.getBoundingClientRect(), a = getComputedStyle(pop, "::after"), cs = getComputedStyle(box), rs = getComputedStyle(row);
  const cote = pop.getAttribute("data-side");
  const ecart = cote === "above" ? r.top - p.bottom : p.top - r.bottom;
  const chevauche = !(p.right <= r.left || p.left >= r.right || p.bottom <= r.top || p.top >= r.bottom);
  const flecheX = p.left + parseFloat(a.left) + parseFloat(a.width) / 2;
  return { id: pop.id, cote, ecart, chevauche, fleche: a.content, flecheDx: Math.abs(flecheX - (b.left + b.width / 2)), pos: a.position,
    dedans: p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight, boiteBg: cs.backgroundColor, ligneBordure: rs.borderTopColor, ligneBg: rs.backgroundColor,
    rect: { x: Math.min(r.left, p.left), y: Math.min(r.top, p.top), w: Math.max(r.right, p.right) - Math.min(r.left, p.left), h: Math.max(r.bottom, p.bottom) - Math.min(r.top, p.top) } };
}, id);
const capture = async (page, g, nom) => { if (!process.env.TODOSHOT) return; const m = 14; await page.screenshot({ path: `docs/captures-15-10/todo-cible-${nom}.png`, clip: { x: Math.max(0, g.rect.x - m), y: Math.max(0, g.rect.y - m), width: Math.min(g.rect.w + 2 * m, 1366), height: g.rect.h + 2 * m } }); };
const verifier = (g, attendu, ctx) => {
  assert(g, ctx + " : popover absent");
  assert(g.id === attendu, ctx + " : popover " + g.id);
  assert(g.fleche === '""' && g.pos === "absolute", ctx + " : flèche absente " + JSON.stringify([g.fleche, g.pos]));
  assert(g.cote === "above" || g.cote === "below", ctx + " : côté " + g.cote);
  assert(g.ecart >= 10 && g.ecart <= 16, ctx + " : écart popover / ligne " + Math.round(g.ecart));
  assert(!g.chevauche, ctx + " : le popover recouvre la ligne ciblée");
  assert(g.flecheDx <= 2, ctx + " : flèche décalée de " + g.flecheDx.toFixed(1) + " px de la case");
  assert(g.dedans, ctx + " : popover hors de l'écran");
};
const unSeul = async (page, id, ctx) => { const e = await etat(page); assert(e.cibles.length === 1 && e.cibles[0] === id, ctx + " : lignes marquées " + JSON.stringify(e.cibles) + " (attendu " + id + ")"); return e; };
const aucun = async (page, ctx) => { await sleep(500); const e = await etat(page); assert(e.cibles.length === 0, ctx + " : ligne encore marquée " + JSON.stringify(e.cibles)); assert(e.ouverts.length === 0, ctx + " : popover encore ouvert " + JSON.stringify(e.ouverts)); };

await S("TC1", "tâche d'un cours : un clic sur la case ouvre le popover, la ligne et la case sont marquées (violet), le popover est collé à la ligne sans la recouvrir, flèche pointée vers la case", async () => {
  const { page } = await ouvrir(); await ouvrirPanneau(page);
  await aucun(page, "avant le clic");
  const avant = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, boite("tk-c2"));
  await cliquerBoite(page, "tk-c2");
  const e = await unSeul(page, "tk-c2", "cours"); assert(e.ouverts.join() === "checklist-choice-popup", "popover ouvert : " + e.ouverts);
  const g = await geo(page, "tk-c2"); verifier(g, "checklist-choice-popup", "cours");
  assert(rgbOf(g.boiteBg).slice(0, 3).join() === VIOLET && rgbOf(avant).join() !== rgbOf(g.boiteBg).join(), "case : " + g.boiteBg + " (avant " + avant + ")");
  assert(rgbOf(g.ligneBordure).slice(0, 3).join() === VIOLET, "contour de la ligne : " + g.ligneBordure);
  const autres = await page.evaluate(() => [...document.querySelectorAll("#checklist-items .checklist-item:not(.p1-todo-cible) .checklist-checkbox")].map((b) => getComputedStyle(b).backgroundColor));
  assert(autres.every((c) => rgbOf(c).slice(0, 3).join() !== VIOLET), "une autre case est violette : " + autres);
  await capture(page, g, "cours-clair");
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await S("TC2", "tâche d'un entraînement : même mise en évidence, popover « Valider et changer le statut » collé à la ligne", async () => {
  const { page } = await ouvrir(); await ouvrirPanneau(page);
  await cliquerBoite(page, "tk-t1");
  const e = await unSeul(page, "tk-t1", "entraînement"); assert(e.ouverts.join() === "train-checklist-popup", "popover ouvert : " + e.ouverts);
  const g = await geo(page, "tk-t1"); verifier(g, "train-checklist-popup", "entraînement");
  assert(rgbOf(g.boiteBg).slice(0, 3).join() === VIOLET, "case : " + g.boiteBg);
  await capture(page, g, "entrainement-clair");
  /* le menu de statuts se déplie sans recouvrir la ligne */
  await page.click("#train-cl-status-option"); await sleep(700);
  const g2 = await geo(page, "tk-t1"); assert(g2 && !g2.chevauche, "popover déplié sur la ligne : " + JSON.stringify(g2 && g2.chevauche));
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await S("TC3", "passer d'une tâche à l'autre (cours → cours → entraînement → cours) : une seule ligne marquée, le popover suit ; re-clic sur la même case : fermeture", async () => {
  const { page } = await ouvrir(); await ouvrirPanneau(page);
  /* ligne dont la case n'est pas recouverte par le popover déjà ouvert */
  const libre = (exclu) => page.evaluate((ex) => [...document.querySelectorAll("#checklist-items .checklist-item .checklist-checkbox")].filter((b) => { const r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b.closest(".checklist-item").getAttribute("data-todo-id") !== ex && (h === b || b.contains(h)); }).map((b) => b.closest(".checklist-item").getAttribute("data-todo-id")), exclu);
  await cliquerBoite(page, "tk-c1"); await unSeul(page, "tk-c1", "étape 1");
  const l2 = (await libre("tk-c1")).filter((i) => /^tk-c/.test(i)); assert(l2.length, "aucune autre case de cours accessible");
  await cliquerBoite(page, l2[0]); await unSeul(page, l2[0], "étape 2 (cours → cours)");
  let e = await etat(page); assert(e.ouverts.join() === "checklist-choice-popup", "popover ouvert (cours → cours) : " + e.ouverts);
  verifier(await geo(page, l2[0]), "checklist-choice-popup", "cours → cours");
  const l3 = (await libre(l2[0])).filter((i) => /^tk-t/.test(i)); assert(l3.length, "aucune case d'entraînement accessible");
  await cliquerBoite(page, l3[0]); await unSeul(page, l3[0], "étape 3 (cours → entraînement)");
  e = await etat(page); assert(e.ouverts.join() === "train-checklist-popup", "popover ouvert (cours → entraînement) : " + e.ouverts);
  verifier(await geo(page, l3[0]), "train-checklist-popup", "cours → entraînement");
  const l4 = (await libre(l3[0])).filter((i) => /^tk-c/.test(i)); assert(l4.length, "aucune case de cours accessible (retour)");
  await cliquerBoite(page, l4[0]); await unSeul(page, l4[0], "étape 4 (entraînement → cours)");
  e = await etat(page); assert(e.ouverts.join() === "checklist-choice-popup", "popover ouvert (entraînement → cours) : " + e.ouverts);
  await cliquerBoite(page, l4[0]); await aucun(page, "re-clic sur la même case");
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await S("TC4", "le marquage disparaît à chaque fermeture : clic ailleurs, défilement de la liste, re-clic, « Valider la tâche uniquement », ouverture de la fenêtre de tour, statut d'entraînement choisi, bouton de fermeture du panneau, Échap", async () => {
  const { u, page } = await ouvrir(); await ouvrirPanneau(page);
  /* liste plus courte que son contenu (le CSS de la liste impose max-height:none !important) : elle devient défilable */
  await page.evaluate(() => { const l = document.getElementById("checklist-items"); l.style.setProperty("max-height", "230px", "important"); l.style.setProperty("flex", "none", "important"); }); await sleep(300);
  assert(await page.evaluate(() => { const l = document.getElementById("checklist-items"); return l.scrollHeight > l.clientHeight + 20; }), "la liste n'est pas défilable");
  const cas = async (nom, id, fermer, { rouvrir = false } = {}) => {
    if (rouvrir) await ouvrirPanneau(page);
    await cliquerBoite(page, id); await unSeul(page, id, nom + " (ouverture)");
    await fermer(); await aucun(page, nom);
  };
  await cas("clic ailleurs", "tk-c4", async () => { await page.click(".global-todo-head .gt-title"); });
  await cas("défilement", "tk-c4", async () => {
    const p = await page.evaluate(() => { const r = document.getElementById("checklist-items").getBoundingClientRect(); return { x: r.right - 6, y: r.top + r.height / 2 }; });
    await page.mouse.move(p.x, p.y); await page.mouse.wheel({ deltaY: 120 }); await sleep(400);
    await page.evaluate(() => { document.getElementById("checklist-items").scrollTop = 0; }); await sleep(300);
  });
  await cas("re-clic sur la case", "tk-c4", async () => { await cliquerBoite(page, "tk-c4"); });
  await cas("« Valider la tâche uniquement »", "tk-c3", async () => { await page.click("#checklist-choice-task"); });
  assert(await waitFor(async () => { const d = (await adb.doc(`users/${u.uid}/tasks/tk-c3`).get()).data(); return d && d.completed === true; }, { timeout: 15000 }), "tâche jamais validée sur le serveur");
  await cas("ouverture de la fenêtre « Enregistrer un tour » (mode Détaillé)", "tk-c1", async () => { await page.click("#checklist-choice-tour"); await sleep(1200); });
  await page.click("#confidence-close"); await sleep(900);
  await cas("statut d'entraînement", "tk-t1", async () => { await page.click("#train-cl-status-option"); await sleep(500); await page.click("#train-cl-statuts-expand .train-cl-statut-pill.fait"); await sleep(600); });
  await cas("bouton de fermeture du panneau", "tk-c4", async () => { await page.click(".global-todo-close"); await sleep(900); });
  await cas("Échap", "tk-c4", async () => { await page.keyboard.press("Escape"); await sleep(900); }, { rouvrir: true });
  await ouvrirPanneau(page); await aucun(page, "panneau rouvert");
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await S("TC5", "redessin de la liste pendant que le popover est ouvert (nouvelle tâche reçue d'un autre appareil, redessin forcé) : la ligne reste marquée ; tâche supprimée ailleurs : le popover se ferme", async () => {
  const { u, page } = await ouvrir(); await ouvrirPanneau(page);
  await cliquerBoite(page, "tk-c2"); await unSeul(page, "tk-c2", "ouverture");
  await page.evaluate(() => window.PlanningModule.renderChecklist()); await sleep(300);
  let e = await unSeul(page, "tk-c2", "après redessin forcé"); assert(e.ouverts.length === 1, "popover fermé par le redessin : " + e.ouverts);
  await adb.doc(`users/${u.uid}/tasks/tk-nouv`).set({ text: "Tâche reçue", completed: false, archivedAt: null, createdAt: new Date(), updatedAt: new Date() });
  await page.waitForFunction(() => document.querySelectorAll("#checklist-items .checklist-item").length === 7, { timeout: 15000 }); await sleep(500);
  e = await unSeul(page, "tk-c2", "après réception d'une tâche"); assert(e.ouverts.length === 1, "popover fermé par la synchronisation : " + e.ouverts);
  await adb.doc(`users/${u.uid}/tasks/tk-c2`).delete();
  await page.waitForFunction(() => !document.querySelector('#checklist-items [data-todo-id="tk-c2"]'), { timeout: 15000 });
  await aucun(page, "tâche supprimée ailleurs");
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

for (const theme of ["dark", "pastel"]) {
  await S("TC6-" + theme, `thème ${theme} : case, contour et flèche visibles et distincts du fond (cours et entraînement)`, async () => {
    const { page } = await ouvrir({ theme }); await ouvrirPanneau(page);
    for (const [id, pop] of [["tk-c2", "checklist-choice-popup"], ["tk-t1", "train-checklist-popup"]]) {
      await cliquerBoite(page, id); await unSeul(page, id, theme + " " + id);
      const g = await geo(page, id); verifier(g, pop, theme + " " + id);
      const normale = await page.evaluate((i) => { const b = [...document.querySelectorAll("#checklist-items .checklist-item:not(.p1-todo-cible) .checklist-checkbox")][0]; const r = b.closest(".checklist-item"); return { bg: getComputedStyle(b).backgroundColor, bord: getComputedStyle(r).borderTopColor, fond: getComputedStyle(r).backgroundColor }; }, id);
      assert(rgbOf(g.boiteBg).join() !== rgbOf(normale.bg).join(), theme + " : case identique à une case normale " + g.boiteBg);
      assert(g.ligneBordure !== normale.bord || g.ligneBg !== normale.fond, theme + " : ligne identique à une ligne normale");
      const verte = rgbOf(g.boiteBg); assert(!(verte[1] > verte[0] && verte[1] > verte[2]), theme + " : case verte (" + g.boiteBg + ")");
      await capture(page, g, (id === "tk-c2" ? "cours-" : "entrainement-") + theme);
      await cliquerBoite(page, id); await aucun(page, theme + " fermeture");
    }
    assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
  });
}

await S("TC7", "téléphone 375 px : popover dans l'écran, sans recouvrir la ligne ciblée, flèche sur la case ; marquage retiré à la fermeture", async () => {
  const { page } = await ouvrir({ vp: TEL }); await ouvrirPanneau(page);
  for (const [id, pop] of [["tk-c3", "checklist-choice-popup"], ["tk-t2", "train-checklist-popup"]]) {
    await page.click(boite(id)); await sleep(800); await unSeul(page, id, "tel " + id);
    const g = await geo(page, id); verifier(g, pop, "tel " + id);
    await capture(page, g, (id === "tk-c3" ? "cours-" : "entrainement-") + "tel");
    await page.click(boite(id)); await aucun(page, "tel fermeture " + id);
  }
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await S("TC8", "mouvement réduit : aucune transition sur la ligne et la case marquées", async () => {
  const { page } = await ouvrir({ reduce: true }); await ouvrirPanneau(page);
  await cliquerBoite(page, "tk-c2"); await unSeul(page, "tk-c2", "mouvement réduit");
  const t = await page.evaluate(() => { const r = document.querySelector(".checklist-item.p1-todo-cible"); return [getComputedStyle(r).transitionDuration, getComputedStyle(r.querySelector(".checklist-checkbox")).transitionDuration]; });
  assert(t.every((d) => d.split(",").every((x) => parseFloat(x) === 0)), "transitions : " + JSON.stringify(t));
});

const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
