/* Couronne Premium au coin de l'icône du logo : visible seulement pour un abonné Premium actif, cliquable (vers Compte Premium), effet de survol.
   Vraie page + émulateurs ; survol et clic à la souris (vrais événements) ; l'état Premium vient de entitlements/{uid} (jamais écrit par la page).
   Lancer : node test/e2e/logo-couronne.mjs */
import "./env-e2e.mjs";
import admin from "firebase-admin";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { BASE, launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const server = await startServer(), proxy = await startProxy(), browser = await launch();
const ts = (j) => admin.firestore.Timestamp.fromDate(new Date(Date.now() + j * 864e5));
const abonne = (uid, j = 30) => adb.doc(`entitlements/${uid}`).set({ status: "active", planType: "monthly", trialStartedAt: ts(-40), trialEndsAt: ts(-25), writeAccessUntil: ts(j), premiumUntil: ts(j) });
const degager = (page) => page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });   // présentation de bienvenue d'un compte neuf
const membre = () => document.body.classList.contains("p1-premium-member");
const etat = (page) => page.evaluate(() => {
  const c = document.getElementById("logo-crown"), ic = document.querySelector(".logo-icon"), lg = document.querySelector(".logo");
  const cs = getComputedStyle(c), r = c.querySelector("i").getBoundingClientRect(), ri = ic.getBoundingClientRect(), rl = lg.getBoundingClientRect();   // r = le dessin de la couronne lui-même
  return { visible: cs.display !== "none" && r.width > 0, href: c.getAttribute("data-href"), cx: r.left + r.width / 2, cy: r.top + r.height / 2, ix: ri.right, iy: ri.top, logoL: rl.left, logoT: rl.top, logoW: rl.width, transform: cs.transform, filter: cs.filter, hautEcran: r.top };
});

await scenario("CO1 abonné Premium actif : la couronne est au coin haut-droit de l'icône du logo, et pointe vers Compte Premium", async () => {
  const u = await mkUser({ courses: 1 }); await abonne(u.uid);
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.waitForFunction(membre, { timeout: 15000 });
    await sleep(700);
    await degager(page);
    const e = await etat(page);
    assert(e.visible, "couronne invisible : " + JSON.stringify(e));
    assert(/comptepremium\.html$/.test(e.href), "lien : " + e.href);
    assert(Math.abs(e.cx - e.ix) <= 2 && Math.abs(e.cy - e.iy) <= 2, `couronne pas exactement sur le coin haut-droit de l'icône : couronne ${Math.round(e.cx)},${Math.round(e.cy)} / coin ${Math.round(e.ix)},${Math.round(e.iy)}`);
    assert(e.hautEcran >= 0, "couronne coupée par le haut de l'écran : " + e.hautEcran);
    await page.screenshot({ path: "docs/captures-15-10/couronne-premium-logo-bureau.png", clip: { x: 0, y: 0, width: 420, height: 90 } });
  } finally { await ctx.close(); }
});

await scenario("CO2 survol à la souris : la couronne grossit et brille ; le curseur est une main ; le logo ne bouge pas", async () => {
  const u = await mkUser({ courses: 1 }); await abonne(u.uid);
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.waitForFunction(membre, { timeout: 15000 });
    await sleep(700);
    await degager(page);
    const avant = await etat(page);
    await page.hover("#logo-crown");
    await page.waitForFunction(() => document.getElementById("logo-crown").matches(":hover"), { timeout: 5000 });   // le navigateur applique le survol à l'image suivante
    await sleep(450);
    const apres = await etat(page);
    const m = (t) => { const v = /matrix\(([^)]+)\)/.exec(t); return v ? v[1].split(",").map(Number) : null; };
    const ea = Math.hypot(...m(avant.transform).slice(0, 2)), eb = Math.hypot(...m(apres.transform).slice(0, 2));
    const diag = await page.evaluate(() => { const c = document.getElementById("logo-crown"), r = c.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { hover: c.matches(":hover"), sous: e && (e.id || e.className || e.tagName), rect: [Math.round(r.left), Math.round(r.top)] }; });
    assert(eb > ea * 1.15, `pas d'agrandissement au survol : ${ea.toFixed(2)} -> ${eb.toFixed(2)} ` + JSON.stringify(diag));
    assert(avant.filter !== apres.filter, "pas de halo au survol");
    assert((await page.evaluate(() => getComputedStyle(document.getElementById("logo-crown")).cursor)) === "pointer", "curseur non cliquable");
    assert(await page.evaluate(() => { const c = document.getElementById("logo-crown"); return !c.hasAttribute("title") && !c.querySelector("title") && !c.hasAttribute("data-tooltip") && c.getAttribute("aria-label") === "Compte Premium"; }), "la couronne a une infobulle (title / data-tooltip) ou n'a plus de nom accessible");
    assert(avant.logoL === apres.logoL && avant.logoT === apres.logoT && avant.logoW === apres.logoW, "le logo a bougé au survol de la couronne");
    await page.screenshot({ path: "docs/captures-15-10/couronne-premium-logo-survol.png", clip: { x: 0, y: 0, width: 420, height: 90 } });
  } finally { await ctx.close(); }
});

await scenario("CO3 clic à la souris sur la couronne : ouvre la page Compte Premium (et pas l'accueil)", async () => {
  const u = await mkUser({ courses: 1 }); await abonne(u.uid);
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.waitForFunction(membre, { timeout: 15000 });
    await sleep(500);
    await degager(page);
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }), page.click("#logo-crown")]);
    assert(/\/comptepremium\.html/.test(page.url()), "page atteinte : " + page.url());
  } finally { await ctx.close(); }
});

await scenario("CO4 clic sur le logo lui-même : toujours l'accueil (la couronne n'a pas pris sa place)", async () => {
  const u = await mkUser({ courses: 1 }); await abonne(u.uid);
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.waitForFunction(membre, { timeout: 15000 });
    await sleep(500);
    await degager(page);
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }), page.click(".logo-icon")]);
    assert(/\/index\.html/.test(page.url()) || /:\d+\/$/.test(page.url()), "page atteinte : " + page.url());
  } finally { await ctx.close(); }
});

await scenario("CO4b clavier : Entrée sur la couronne ouvre Compte Premium ; Ctrl + clic l'ouvre dans un nouvel onglet sans quitter le tableur", async () => {
  const u = await mkUser({ courses: 1 }); await abonne(u.uid);
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.waitForFunction(membre, { timeout: 15000 });
    await sleep(500); await degager(page);
    const url0 = page.url();
    const nouvelle = new Promise((res) => ctx.once("targetcreated", res));
    await page.keyboard.down("Control"); await page.click("#logo-crown"); await page.keyboard.up("Control");
    const t = await Promise.race([nouvelle, sleep(5000).then(() => null)]);
    assert(t, "aucun nouvel onglet avec Ctrl + clic");
    assert(page.url() === url0, "le tableur a été quitté avec Ctrl + clic : " + page.url());
    await page.focus("#logo-crown");
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }), page.keyboard.press("Enter")]);
    assert(/\/comptepremium\.html/.test(page.url()), "page atteinte : " + page.url());
  } finally { await ctx.close(); }
});

await scenario("CO4c la couronne reste exactement sur le coin quand la taille de police change (x1,5) et en thème pastel", async () => {
  const u = await mkUser({ courses: 1 }); await abonne(u.uid);
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.waitForFunction(membre, { timeout: 15000 });
    await sleep(600);
    await page.evaluate(() => { document.documentElement.style.fontSize = "24px"; });
    await sleep(300);
    let e = await etat(page);
    assert(Math.abs(e.cx - e.ix) <= 2 && Math.abs(e.cy - e.iy) <= 2, `police x1,5 : couronne ${Math.round(e.cx)},${Math.round(e.cy)} / coin ${Math.round(e.ix)},${Math.round(e.iy)}`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; document.documentElement.setAttribute("data-theme", "pastel"); });
    await sleep(300);
    e = await etat(page);
    assert(Math.abs(e.cx - e.ix) <= 2 && Math.abs(e.cy - e.iy) <= 2, `pastel : couronne ${Math.round(e.cx)},${Math.round(e.cy)} / coin ${Math.round(e.ix)},${Math.round(e.iy)}`);
  } finally { await ctx.close(); }
});

await scenario("CO5 essai gratuit, ou Premium expiré : aucune couronne", async () => {
  const u = await mkUser({ courses: 1 });   // essai actif
  const { page, ctx } = await openPage(browser, u);
  try {
    let e = await etat(page);
    assert(!e.visible, "couronne visible pendant l'essai : " + JSON.stringify(e));
    await abonne(u.uid, -3);   // formule payante mais accès terminé
    await sleep(1500);
    e = await etat(page);
    assert(!e.visible, "couronne visible alors que l'accès est terminé : " + JSON.stringify(e));
  } finally { await ctx.close(); }
});

await scenario("CO6 en direct : l'abonnement devient actif (la couronne apparaît sans recharger), puis se termine (elle disparaît)", async () => {
  const u = await mkUser({ courses: 1 });
  const { page, ctx } = await openPage(browser, u);
  try {
    assert(!(await etat(page)).visible, "couronne visible avant l'abonnement");
    await abonne(u.uid);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("logo-crown")).display !== "none", { timeout: 10000 });
    await adb.doc(`entitlements/${u.uid}`).update({ status: "canceled", writeAccessUntil: ts(-1), premiumUntil: ts(-1) });
    await page.waitForFunction(() => getComputedStyle(document.getElementById("logo-crown")).display === "none", { timeout: 10000 });
  } finally { await ctx.close(); }
});

await scenario("CO7 déconnexion d'un abonné : la couronne disparaît ; visiteur jamais connecté : aucune couronne", async () => {
  const u = await mkUser({ courses: 1 }); await abonne(u.uid);
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.waitForFunction(membre, { timeout: 15000 });
    await page.evaluate(async () => { await window.__authApi.signOut(window.__auth); });
    await page.waitForFunction(() => !document.body.classList.contains("p1-premium-member"), { timeout: 10000 });
    assert(!(await etat(page)).visible, "couronne visible après déconnexion");
  } finally { await ctx.close(); }
  const c2 = await browser.createBrowserContext(), p2 = await c2.newPage();
  try {
    await p2.setViewport({ width: 1280, height: 900 });
    await p2.goto(BASE + "/tableur.html", { waitUntil: "load" }); await sleep(2500);
    assert(!(await etat(p2)).visible, "couronne visible pour un visiteur");
  } finally { await c2.close(); }
});

await scenario("CO8 pendant le squelette de chargement, la couronne n'est pas affichée ; elle apparaît avec la page", async () => {
  const u = await mkUser({ courses: 2 }); await abonne(u.uid);
  const { page, ctx } = await openPage(browser, u);
  try {
    await page.evaluateOnNewDocument(() => {
      window.__C = [];
      const loop = () => { const c = document.getElementById("logo-crown"); if (c) window.__C.push({ skel: document.documentElement.classList.contains("p1-skel"), vis: getComputedStyle(c).display !== "none" }); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("p1-premium-member") && !document.documentElement.classList.contains("p1-skel"), { timeout: 30000 });
    await sleep(600);
    const C = await page.evaluate(() => window.__C);
    assert(C.some((s) => s.skel), "squelette jamais observé");
    assert(!C.some((s) => s.skel && s.vis), "couronne affichée devant le squelette");
    assert(C.some((s) => !s.skel && s.vis), "couronne jamais affichée après le squelette");
  } finally { await ctx.close(); }
});

for (const [w, h, nom] of [[390, 844, "mobile"], [768, 1024, "tablette"]]) {
  await scenario(`CO9-${w} (${nom}) la couronne reste au coin de l'icône, dans l'écran, sans décaler le logo`, async () => {
    const u = await mkUser({ courses: 1 }); await abonne(u.uid);
    const { page, ctx } = await openPage(browser, u);
    try {
      await page.setViewport({ width: w, height: h });
      await page.waitForFunction(membre, { timeout: 15000 });
      await sleep(600);
      const e = await etat(page);
      assert(e.visible, "invisible");
      assert(Math.abs(e.cx - e.ix) <= 2 && Math.abs(e.cy - e.iy) <= 2, `pas au coin : ${Math.round(e.cx)},${Math.round(e.cy)} / ${Math.round(e.ix)},${Math.round(e.iy)}`);
      assert(e.hautEcran >= 0, "coupée par le haut : " + e.hautEcran);
      if (w === 390) { await degager(page); await sleep(300); } if (w === 390) await page.screenshot({ path: "docs/captures-15-10/couronne-premium-logo-mobile.png", clip: { x: 0, y: 0, width: 390, height: 80 } });
    } finally { await ctx.close(); }
  });
}
const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
