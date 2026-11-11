/* La To-Do a sa propre icône (fa-clipboard-check, glyphe U+F46C), distincte de « Mes cours » (fa-list-check, U+F0AE).
   Vraie page + émulateurs ; le glyphe est lu sur le pseudo-élément ::before (ce que Font Awesome dessine vraiment).
   Lancer : node test/e2e/todo-icone.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; TODOSHOT=<fichier> pour la capture du menu) */
import "./env-e2e.mjs";
import fs from "node:fs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, adb, scenario, report, assert, sleep, waitFor, openPage, BASE } from "./lib.mjs";

const server = await startServer(), proxy = await startProxy(), browser = await launch();
const COURS = "f0ae", TODO = "f46c";

async function ouvrir() {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  const { page } = await openPage(browser, u);
  await page.setViewport({ width: 1500, height: 900 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
  await sleep(700);
  page.__erreurs = []; page.on("pageerror", (e) => page.__erreurs.push(String(e.message || e)));
  return page;
}
/* classe et glyphe (code hexadécimal) du premier élément visible qui correspond au sélecteur */
const icone = (page, sel) => page.evaluate((s) => {
  const e = [...document.querySelectorAll(s)].find((x) => x.offsetParent !== null && x.getBoundingClientRect().width > 0);
  if (!e) return null;
  const c = getComputedStyle(e, "::before").content.replace(/^["']|["']$/g, "");
  return { cls: [...e.classList].filter((k) => /^fa-/.test(k) && k !== "fa-fw").join(" "), glyphe: c ? c.codePointAt(0).toString(16) : null };
}, sel);

await scenario("TI1 « Mes cours » garde fa-list-check (onglet et titre de section) ; le bouton To-Do du menu affiche fa-clipboard-check, un glyphe différent", async () => {
  const page = await ouvrir();
  const onglet = await icone(page, '.app-nav-btn[data-page="items"] i');
  assert(onglet && onglet.cls === "fa-list-check" && onglet.glyphe === COURS, "onglet Mes cours : " + JSON.stringify(onglet));
  await page.click('.app-nav-btn[data-page="items"]'); await sleep(900);
  const titre = await icone(page, "#page-items .section-title > i");
  assert(titre && titre.cls === "fa-list-check" && titre.glyphe === COURS, "titre de la section Mes cours : " + JSON.stringify(titre));
  const todo = await icone(page, "#global-todo-btn i");
  assert(todo && todo.cls === "fa-clipboard-check" && todo.glyphe === TODO, "bouton To-Do : " + JSON.stringify(todo));
  assert(todo.glyphe !== onglet.glyphe, "la To-Do a le même glyphe que Mes cours");
  const f = process.env.TODOSHOT;
  if (f) { const r = await page.evaluate(() => { const n = document.querySelector(".edn-nav-row") || document.querySelector(".app-nav"); const b = n.getBoundingClientRect(); return { x: Math.max(0, b.left - 8), y: Math.max(0, b.top - 8), width: Math.min(1500, b.width + 16), height: b.height + 16 }; }); await page.screenshot({ path: f, clip: r, captureBeyondViewport: false }); }
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await scenario("TI2 panneau To-Do ouvert (vrai clic) : en-tête fa-clipboard-check ; son aide (vrai clic sur « ? ») : icône fa-clipboard-check", async () => {
  const page = await ouvrir();
  await page.click("#global-todo-btn"); await sleep(900);
  const entete = await icone(page, "#global-todo-panel .gt-icon i");
  assert(entete && entete.cls === "fa-clipboard-check" && entete.glyphe === TODO, "en-tête du panneau : " + JSON.stringify(entete));
  await page.click("#global-todo-panel .global-todo-help"); await sleep(800);
  const aide = await icone(page, "#helpModalIcon i");
  assert(aide && aide.cls === "fa-clipboard-check" && aide.glyphe === TODO, "icône de l'aide : " + JSON.stringify(aide));
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await scenario("TI3 le titre « To-Do List » de la carte du planning (masqué quand la carte est dans le panneau To-Do) porte fa-clipboard-check, ni fa-tasks ni fa-list-check", async () => {
  const page = await ouvrir();
  const r = await page.evaluate(() => { const i = document.querySelector(".checklist-title > i"); return i ? [...i.classList].filter((k) => /^fa-/.test(k)).join(" ") : null; });
  assert(r === "fa-clipboard-check", "titre de la carte To-Do : " + r);
  await page.click("#global-todo-btn"); await sleep(900);
  const r2 = await page.evaluate(() => { const i = document.querySelector("#global-todo-panel .checklist-title > i"); return i ? [...i.classList].filter((k) => /^fa-/.test(k)).join(" ") : null; });
  assert(r2 === "fa-clipboard-check", "titre de la carte dans le panneau : " + r2);
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await scenario("TI4 bouton To-Do de l'en-tête compact (apparaît quand la barre d'onglets passe sous l'en-tête) : fa-clipboard-check", async () => {
  const page = await ouvrir();
  await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "2600px"; document.querySelector("footer, body").appendChild(d); }); await sleep(300);
  await page.evaluate(() => window.scrollTo(0, 700)); await sleep(900);
  assert(await waitFor(() => page.evaluate(() => document.getElementById("p1HdrNav") && document.getElementById("p1HdrNav").classList.contains("is-on")), { timeout: 8000 }), "l'en-tête compact n'est pas apparu");
  const t = await icone(page, "#p1HdrNav .p1-hdr-b.todo i");
  assert(t && t.cls === "fa-clipboard-check" && t.glyphe === TODO, "bouton To-Do de l'en-tête compact : " + JSON.stringify(t));
  assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
});

await scenario("TI5 le fichier ne contient plus d'icône de To-Do en fa-list-check ou fa-tasks ; les occurrences restantes sont toutes hors To-Do ; les entrées Nouveautés et guide de démarrage de la To-Do utilisent fa-clipboard-check", async () => {
  const src = await (await fetch(BASE + "/tableur.html")).text();
  const restes = [];
  for (const m of src.matchAll(/fa-list-check|fa-tasks/g)) {
    const avant = src.slice(Math.max(0, m.index - 220), m.index), apres = src.slice(m.index, m.index + 260);
    const autour = avant + apres;
    if (/to-?do/i.test(apres.slice(0, 200)) || /to-?do/i.test(avant.slice(-120))) restes.push({ icone: m[0], contexte: autour.replace(/\s+/g, " ").slice(120, 330) });
  }
  assert(restes.length === 0, "icône de To-Do restée en fa-list-check / fa-tasks : " + JSON.stringify(restes.slice(0, 3)));
  const nouveautes = /icon: 'fa-clipboard-check', text: 'Une <strong>To-Do list quotidienne<\/strong>/.test(src);
  const guide = (src.match(/icon: 'fa-clipboard-check',\s*text: 'La <strong>To-Do List<\/strong>/g) || []).length;
  assert(nouveautes, "entrée Nouveautés de la To-Do : icône inchangée");
  assert(guide === 2, "entrées du guide de démarrage : " + guide + " sur 2");
  const compact = /ti \? ti\.className : 'fas fa-clipboard-check'/.test(src);
  assert(compact, "valeur de secours du bouton To-Do compact inchangée");
});

const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
