/* Modal « Organisation de la journée » (pdd) -- retour de Jean (05/10) : les popovers
   « Matières » et « Statut » apparaissaient/disparaissaient SANS animation (display:none ->
   block dans la même frame : la transition CSS ne jouait jamais), le bouton ne montrait pas que
   sa fenêtre était déployée, et la flèche du Statut ne pivotait pas. Vraie page + vrais émulateurs.

   Méthode : Chrome headless ne produit pas de frames régulières (échantillonner l'opacité toutes
   les 16 ms donnait des sauts 0 -> 0.98 sans valeur intermédiaire, même pour un code correct).
   On interroge donc l'API Web Animations : `el.getAnimations()` renvoie une CSSTransition dès
   qu'un changement de classe déclenche réellement une transition -- jamais pour un simple
   display:none -> block. On la termine ensuite (`finish()`) pour lire l'état final. */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

const today = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();

// Transitions réellement en cours sur `sel` (force un recalcul de style d'abord).
const transitionsOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s); getComputedStyle(el).opacity; getComputedStyle(el).transform;
  return el.getAnimations().filter((a) => a.transitionProperty).map((a) => ({ prop: a.transitionProperty, dur: a.effect.getTiming().duration }));
}, sel);
const finishAll = (page, sel) => page.evaluate((s) => { document.querySelector(s).getAnimations().forEach((a) => a.finish()); }, sel);

try {
  const u = await mkUser({ courses: 1 });
  const { page } = await openPage(browser, u);
  await page.bringToFront();
  await page.evaluate((d) => window.openPlanningDayDetailModal(d), today);
  await sleep(500);

  await S("P1", "popover « Matières » : vraie transition à l'ouverture ET à la fermeture, bouton marqué « ouvert »", async () => {
    assert(await page.evaluate(() => getComputedStyle(document.getElementById("pdd-spec-pop")).visibility) === "hidden", "popover visible avant ouverture");
    await page.evaluate(() => document.getElementById("pdd-spec-btn").click());
    const opening = await transitionsOf(page, "#pdd-spec-pop");
    assert(opening.some((t) => t.prop === "opacity" && t.dur > 0) && opening.some((t) => t.prop === "transform" && t.dur > 0), "aucune transition opacity+transform à l'OUVERTURE (apparition instantanée) : " + JSON.stringify(opening));
    await finishAll(page, "#pdd-spec-pop"); await finishAll(page, "#pdd-spec-btn");
    const open = await page.evaluate(() => { const b = document.getElementById("pdd-spec-btn"); const cs = getComputedStyle(b); const p = getComputedStyle(document.getElementById("pdd-spec-pop")); return { cls: b.classList.contains("is-open"), aria: b.getAttribute("aria-expanded"), shadow: cs.boxShadow, border: cs.borderTopColor, op: +p.opacity, vis: p.visibility }; });
    assert(open.cls && open.aria === "true", "bouton Matières pas marqué ouvert : " + JSON.stringify(open));
    assert(open.border === "rgb(59, 130, 246)" && open.shadow !== "none", "bouton Matières sans bordure/anneau bleu ouvert : " + JSON.stringify(open));
    assert(open.op > 0.99 && open.vis === "visible", "popover pas pleinement affiché : " + JSON.stringify(open));
    await page.evaluate(() => document.getElementById("pdd-spec-ok").click());
    const closing = await transitionsOf(page, "#pdd-spec-pop");
    assert(closing.some((t) => t.prop === "opacity" && t.dur > 0), "aucune transition à la FERMETURE (disparition instantanée) : " + JSON.stringify(closing));
    const midVis = await page.evaluate(() => getComputedStyle(document.getElementById("pdd-spec-pop")).visibility);
    assert(midVis === "visible", "popover masqué IMMÉDIATEMENT à la fermeture (visibility sans délai : le fondu ne serait jamais vu)");
    await finishAll(page, "#pdd-spec-pop");
    await sleep(50);
    const closed = await page.evaluate(() => ({ cls: document.getElementById("pdd-spec-btn").classList.contains("is-open"), vis: getComputedStyle(document.getElementById("pdd-spec-pop")).visibility }));
    assert(!closed.cls && closed.vis === "hidden", "état fermé incorrect : " + JSON.stringify(closed));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("P2", "popover « Statut » : vraie transition, bouton marqué « ouvert », flèche qui pivote à 180° puis revient (animées)", async () => {
    const caret = () => page.evaluate(() => { const m = new DOMMatrix(getComputedStyle(document.querySelector("#pdd-status-btn .pdd-caret")).transform); return Math.abs(Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI)); });
    assert((await caret()) === 0, "flèche déjà pivotée avant ouverture");
    await page.evaluate(() => document.getElementById("pdd-status-btn").click());
    const menuT = await transitionsOf(page, "#pdd-status-menu");
    const caretT = await transitionsOf(page, "#pdd-status-btn .pdd-caret");
    assert(menuT.some((t) => t.prop === "opacity" && t.dur > 0), "aucune transition sur le menu Statut à l'ouverture : " + JSON.stringify(menuT));
    assert(caretT.some((t) => t.prop === "transform" && t.dur > 0), "la flèche pivote SANS transition (rotation instantanée) : " + JSON.stringify(caretT));
    await finishAll(page, "#pdd-status-menu"); await finishAll(page, "#pdd-status-btn .pdd-caret"); await finishAll(page, "#pdd-status-btn");
    assert((await caret()) === 180, "flèche pas à 180° une fois ouvert : " + (await caret()));
    const st = await page.evaluate(() => { const b = document.getElementById("pdd-status-btn"); const m = getComputedStyle(document.getElementById("pdd-status-menu")); return { cls: b.classList.contains("is-open"), aria: b.getAttribute("aria-expanded"), shadow: getComputedStyle(b).boxShadow, vis: m.visibility, op: +m.opacity }; });
    assert(st.cls && st.aria === "true" && st.shadow !== "none", "bouton Statut pas marqué ouvert : " + JSON.stringify(st));
    assert(st.vis === "visible" && st.op > 0.99, "menu Statut pas pleinement affiché : " + JSON.stringify(st));

    await page.evaluate(() => document.getElementById("pdd-status-btn").click()); // referme
    assert((await transitionsOf(page, "#pdd-status-btn .pdd-caret")).some((t) => t.prop === "transform"), "la flèche revient SANS transition à la fermeture");
    assert(await page.evaluate(() => getComputedStyle(document.getElementById("pdd-status-menu")).visibility) === "visible", "menu masqué IMMÉDIATEMENT à la fermeture (le fondu ne se verrait jamais)");
    await finishAll(page, "#pdd-status-menu"); await finishAll(page, "#pdd-status-btn .pdd-caret");
    await sleep(50);
    assert((await caret()) === 0, "flèche pas revenue à 0°");
    const after = await page.evaluate(() => ({ cls: document.getElementById("pdd-status-btn").classList.contains("is-open"), vis: getComputedStyle(document.getElementById("pdd-status-menu")).visibility }));
    assert(!after.cls && after.vis === "hidden", "état fermé incorrect : " + JSON.stringify(after));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("P3", "menu Statut fermé = intouchable (aucun clic fantôme sur ses cartes)", async () => {
    const r = await page.evaluate(() => { const c = document.querySelector("#pdd-status-grid .pdd-status-card"); const b = c.getBoundingClientRect(); const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!(at && at.closest("#pdd-status-menu")); });
    assert(!r, "le menu Statut fermé reçoit encore des évènements souris");
  });

  // Retour de Jean (08/10, constaté sur TypixClin) : popover « Matières » ouvert, le backdrop
  // transparent plein écran (clic dehors = fermeture) recouvre AUSSI le bouton activé : la souris
  // y reste une flèche alors qu'un clic le referme. Statut n'a pas de backdrop (menu ancré +
  // écouteur document) : son bouton reste au-dessus, déjà une main.
  await S("P4", "popover « Matières » ouvert : main au survol de son bouton (pas ailleurs sur le fond) ; un clic dessus referme sans rouvrir, la journée reste ouverte", async () => {
    const cursorAt = async (x, y) => { await page.mouse.move(x, y); await sleep(30); return page.evaluate((px, py) => { const el = document.elementFromPoint(px, py); return { cursor: getComputedStyle(el).cursor, id: el.id || el.className }; }, x, y); };
    await page.evaluate(() => document.getElementById("pdd-spec-btn").click());
    await sleep(300);
    const rect = await page.evaluate(() => { const r = document.getElementById("pdd-spec-btn").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const inBtn = await cursorAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
    assert(inBtn.cursor === "pointer", "souris sur le bouton Matières activé : curseur « " + inBtn.cursor + " » au lieu de la main (backdrop qui recouvre le bouton : " + inBtn.id + ")");
    const outside = await cursorAt(rect.x + rect.w / 2, rect.y + rect.h + 400);
    assert(outside.cursor !== "pointer", "souris ailleurs sur le fond : la main ne doit pas apparaître (« " + outside.cursor + " »)");
    const nearBtn = await cursorAt(rect.x - 30, rect.y + rect.h / 2);
    assert(nearBtn.cursor !== "pointer", "souris juste à côté du bouton : la main ne doit pas apparaître (« " + nearBtn.cursor + " »)");
    // Revenir sur le bouton après être sorti : la main doit réapparaître.
    const back = await cursorAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
    assert(back.cursor === "pointer", "main absente en revenant sur le bouton");

    await page.mouse.click(rect.x + rect.w / 2, rect.y + rect.h / 2);
    await sleep(300);
    const st = await page.evaluate(() => ({ pop: document.getElementById("pdd-spec-pop").classList.contains("active"), bd: document.getElementById("pdd-spec-backdrop").classList.contains("active"), modal: document.getElementById("pdd-overlay").classList.contains("active") }));
    assert(!st.pop && !st.bd, "le clic sur le bouton activé n'a pas refermé la fenêtre (ou l'a rouverte) : " + JSON.stringify(st));
    assert(st.modal, "la fenêtre de la journée s'est refermée : " + JSON.stringify(st));
    // Backdrop inactif : le curseur résiduel ne doit pas survivre à la réouverture suivante.
    await page.evaluate(() => document.getElementById("pdd-spec-btn").click());
    await sleep(300);
    const away = await cursorAt(rect.x + rect.w / 2, rect.y + rect.h + 400);
    assert(away.cursor !== "pointer", "curseur main résiduel après réouverture, souris hors du bouton");
    await page.evaluate(() => document.getElementById("pdd-spec-ok").click());
    await sleep(300);
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
