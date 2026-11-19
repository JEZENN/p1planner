/* Salutation éphémère du header : sur tous les écrans (téléphone, iPad, ordinateur), elle s'affiche DANS le header, en deux lignes (salutation, puis nom)
   10 px après l'icône du logo, à la place du nom « P1Planner » qui s'efface en fondu ; jamais sous le header, jamais au centre.
   Vraie page + émulateurs, échantillon à chaque image depuis le début du chargement.
   Lancer : node test/e2e/greet-logo.mjs [préfixes]   (GLSHOTS=1 pour les captures ; PUBLIC_DIR=<copie « avant »> pour la contre-épreuve) */
import "./env-e2e.mjs";
import admin from "firebase-admin";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, adb, scenario, report, assert, sleep, BASE } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const tel = (w) => ({ width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const ipad = (w) => ({ width: w, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const pc = (w) => ({ width: w, height: 900 });
const ts = (j) => admin.firestore.Timestamp.fromDate(new Date(Date.now() + j * 864e5));
const abonne = (uid) => adb.doc(`entitlements/${uid}`).set({ status: "active", planType: "monthly", trialStartedAt: ts(-40), trialEndsAt: ts(-25), writeAccessUntil: ts(30), premiumUntil: ts(30) });
const shot = async (page, name) => { if (process.env.GLSHOTS) await page.screenshot({ path: `docs/captures-15-10/${name}.png`, clip: { x: 0, y: 0, width: page.viewport().width, height: 150 } }); };

/* À chaque image : pastille (opacité, rectangles, lignes), header, barre des pages, icône et couronne du logo, couleur du nom du logo, avatar. */
const PROBE = () => {
  window.__g = { frames: [], t0: performance.now() };
  const r4 = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  (function tick() {
    const G = window.__g, pill = document.querySelector(".p1-greet-pill"), hdr = document.getElementById("header");
    const lg = document.querySelector(".logo"), cr = document.getElementById("logo-crown"), nav = document.querySelector(".app-nav");
    const f = { t: Math.round(performance.now() - G.t0), hdr: r4(hdr), icon: r4(document.querySelector(".logo-icon")), crown: cr && getComputedStyle(cr).display !== "none" ? r4(cr) : null,
      logoColor: lg ? getComputedStyle(lg).color : null, avatar: r4(document.getElementById("user-avatar")), edge: (() => { let m = Infinity; for (const e of document.querySelectorAll("#header .header-actions, #header .mobile-menu-btn, #header .nav-items > li")) { const b = e.getBoundingClientRect(), cs = getComputedStyle(e); if (b.width && b.height && cs.display !== "none" && cs.visibility !== "hidden") m = Math.min(m, b.left); } return m; })(), nav: nav && nav.getClientRects().length ? r4(nav) : null, pill: null };
    if (pill) {
      const cs = getComputedStyle(pill), hi = pill.querySelector(".p1-greet-hi"), nm = pill.querySelector(".p1-greet-name");
      f.pill = { op: parseFloat(cs.opacity), rect: r4(pill), tr: cs.translate, text: pill.textContent, hi: r4(hi), name: r4(nm), hiText: hi && hi.textContent, nameText: nm && nm.textContent,
        nameClip: nm ? { sw: nm.scrollWidth, cw: nm.clientWidth } : null, hiColor: hi ? getComputedStyle(hi).color : null, nameFont: nm ? getComputedStyle(nm).fontFamily : null, nameSize: nm ? getComputedStyle(nm).fontSize : null, hiSize: hi ? getComputedStyle(hi).fontSize : null,
        bg: cs.backgroundColor, shadow: cs.boxShadow, border: cs.borderTopWidth, clip: nm ? getComputedStyle(nm).backgroundClip : null, logoFont: lg ? getComputedStyle(lg).fontFamily : null };
    }
    G.frames.push(f);
    requestAnimationFrame(tick);
  })();
};
const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return 1; const p = m[1].split(",").map((x) => parseFloat(x)); return p.length > 3 ? p[3] : 1; };
const full = (F) => F.filter((f) => f.pill && f.pill.op > 0.95);
const seen = (F) => F.filter((f) => f.pill && f.pill.op > 0.02);

async function boot(vp, { theme = "light", reduce = false, premium = false, font = null, signIn = true } = {}) {
  const u = await mkUser({ courses: 3 }); if (premium) await abonne(u.uid);
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...(theme !== "light" ? { theme } : {}) }, { merge: true });
  const ctx = await browser.createBrowserContext(); OPEN.push(ctx); const page = await ctx.newPage();
  page.__errors = []; page.on("pageerror", (e) => page.__errors.push(String(e.message || e))); page.setDefaultNavigationTimeout(120000);
  await page.setViewport(vp);
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  if (font) await page.evaluateOnNewDocument((f) => { try { localStorage.setItem("p1-font", f); } catch (e) {} }, font);
  await page.evaluateOnNewDocument(PROBE);
  await page.goto(BASE + "/tableur.html", { waitUntil: "load" });
  if (signIn) {
    await page.waitForFunction(() => window.__authApi && window.__auth, { timeout: 30000 });
    await page.evaluate(async (e, p) => { await window.__authApi.signInWithEmailAndPassword(window.__auth, e, p); }, u.email, u.password);
  }
  return { u, page };
}
const pleine = (page) => page.waitForFunction(() => window.__g.frames.some((f) => f.pill && f.pill.op > 0.95), { timeout: 60000 });
const frames = (page) => page.evaluate(() => window.__g.frames);
const degager = (page) => page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
const noHScroll = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));

try {
  /* ═════ GL1 : sur tous les écrans, salutation dans le header à droite de l'icône : deux lignes, barre des pages non recouverte, nom du logo effacé puis revenu, icône et couronne immobiles ═════ */
  const verifLogo = async (vp) => {
      const w = vp.width, { page } = await boot(vp, { premium: true });
      await pleine(page); await sleep(500);
      if (!vp.isMobile && w === 1366 || vp.isMobile && w === 820) await shot(page, `salutation-logo-${w}-clair-pendant`);
      await page.waitForFunction(() => window.__g.frames.slice(-1)[0].pill === null, { timeout: 15000 }); await sleep(900);
      const F = await frames(page), V = seen(F), P = full(F);
      assert(P.length > 40, "pastille pleinement visible trop brève : " + P.length + " images");
      assert(P.every((f) => f.pill.hiText && f.pill.nameText), "pas en deux lignes");
      assert(!P.some((f) => f.pill.text && /^\s/.test(f.pill.text)), "texte vide / espaces");
      const bad = [];
      for (const f of V) {
        const p = f.pill.rect;
        if (p.b > f.hdr.b + 0.5 || p.t < f.hdr.t - 0.5) bad.push("hors header @" + f.t);
        if (f.nav && p.b > f.nav.t + 0.5) bad.push("barre recouverte @" + f.t);
        if (p.l < f.icon.r + 6 - 0.5) bad.push(`trop près de l'icône (${(p.l - f.icon.r).toFixed(1)}) @${f.t}`);
        if (p.l > f.icon.r + 14 + 0.5) bad.push(`trop loin de l'icône (${(p.l - f.icon.r).toFixed(1)}) @${f.t}`);
        if (f.edge < Infinity && p.r > f.edge - 6 + 0.5) bad.push(`trop près du premier menu (${(f.edge - p.r).toFixed(1)}) @${f.t}`);
        if (f.avatar && p.r > f.avatar.l - 6 + 0.5) bad.push(`trop près de l'avatar (${(f.avatar.l - p.r).toFixed(1)}) @${f.t}`);
        if (p.l < 0 || p.r > w + 0.5) bad.push("hors écran @" + f.t);
      }
      assert(!bad.length, [...new Set(bad)].slice(0, 4).join(" | "));
      const a = P[Math.floor(P.length / 2)].pill;
      assert(a.hiText && /^(Bonjour|Bon après-midi|Bonsoir),$/.test(a.hiText), "ligne 1 : « " + a.hiText + " »");
      assert(a.nameText && a.nameText.length > 3, "ligne 2 : « " + a.nameText + " »");
      assert(a.hi.b <= a.name.t + 1 && Math.abs(a.hi.l - a.name.l) <= 0.5, "lignes non empilées / non alignées à gauche : " + JSON.stringify([a.hi, a.name]));
      assert(a.hiSize === "12.16px" && a.nameSize === "18.56px", "tailles : " + a.hiSize + " / " + a.nameSize);
      assert(a.bg === "rgba(0, 0, 0, 0)" && a.shadow === "none" && a.border === "0px", "fond / ombre / bordure : " + [a.bg, a.shadow, a.border]);
      assert(/text/.test(a.clip), "nom sans dégradé (background-clip) : " + a.clip);
      assert(a.text === a.hiText + " " + a.nameText, "texte annoncé : « " + a.text + " »");
      /* nom du logo : transparent pendant l'affichage, revenu ensuite */
      assert(P.slice(10, -10).some((f) => alpha(f.logoColor) < 0.02), "nom du logo non effacé : " + P[Math.floor(P.length / 2)].logoColor);
      const dernier = F[F.length - 1]; assert(alpha(dernier.logoColor) > 0.99, "nom du logo non revenu : " + dernier.logoColor);
      const iFin = F.findIndex((f) => f.pill && f.pill.op > 0.95); const premiere = F[iFin];
      const retour = F.find((f) => f.t > premiere.t && !f.pill) ; assert(retour, "pastille jamais retirée");
      /* icône et couronne : même position avant, pendant et après */
      const c0 = F.find((f) => f.crown && f.icon); assert(c0, "couronne jamais affichée (compte Premium)");
      const ref = F.find((f) => f.crown && f.t >= c0.t + 700);   /* l'apparition de la couronne (0,4 s) est antérieure à la salutation et ne compte pas */
      assert(ref, "couronne : repère stable introuvable");
      const pendant = F.filter((f) => f.crown && f.t >= ref.t && f.pill && f.pill.op > 0.95).length;
      assert(pendant > 10, "couronne stable présente seulement " + pendant + " images pendant la salutation");
      const dev = F.filter((f) => f.crown && f.t >= ref.t).map((f) => Math.max(Math.abs(f.icon.l - ref.icon.l), Math.abs(f.icon.t - ref.icon.t), Math.abs(f.crown.l - ref.crown.l), Math.abs(f.crown.t - ref.crown.t)));
      assert(Math.max(...dev) <= 0.3, "icône / couronne déplacées : " + Math.max(...dev).toFixed(2) + " px");
      const devIcon = F.filter((f) => f.t >= c0.t).map((f) => Math.max(Math.abs(f.icon.l - ref.icon.l), Math.abs(f.icon.t - ref.icon.t)));
      assert(Math.max(...devIcon) <= 0.3, "icône déplacée : " + Math.max(...devIcon).toFixed(2) + " px");
      assert(F.slice(F.indexOf(ref)).every((f) => f.crown), "couronne disparue pendant l'affichage");
      const hs = await noHScroll(page); assert(hs.sw <= hs.iw, "défilement horizontal : " + JSON.stringify(hs));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  };
  for (const w of [360, 390, 430, 600]) await S("GL1-" + w, `(${w} px, téléphone tactile, Premium) salutation dans le header à droite de l'icône : deux lignes, barre des pages non recouverte, nom du logo effacé puis revenu, icône et couronne immobiles`, () => verifLogo(tel(w)));
  for (const w of [768, 820, 1024, 1180]) await S("GL11-" + w, `(${w} px, iPad tactile, Premium) à la place du nom du logo : 6 à 14 px après l'icône, fin avant le premier menu, dans le header, barre des pages non recouverte, nom du logo effacé puis revenu, icône et couronne immobiles`, () => verifLogo(ipad(w)));
  for (const w of [700, 1024, 1100, 1280, 1366, 1920]) await S("GL6-" + w, `(${w} px, ordinateur, Premium) à la place du nom du logo : 6 à 14 px après l'icône, fin avant le premier menu, dans le header, barre des pages non recouverte, nom du logo effacé puis revenu, icône et couronne immobiles`, () => verifLogo(pc(w)));

  /* ═════ GL2 : nom très long remis en forme pendant l'affichage ═════ */
  const LONG = "Alexandre-Maximilien DE LA TOUR D'AUVERGNE-LAURAGUAIS";
  const nomLong = async (vp, { entier, coupeOk }) => {
    const { page } = await boot(vp);
    await pleine(page);
    await page.evaluate((n) => { const un = document.querySelector("#welcome-message .user-name"); un.textContent = n; }, LONG);
    await sleep(500);
    const F = await frames(page), L = F.filter((f) => f.pill && f.pill.op > 0.95 && /AUVERGNE/.test(f.pill.nameText || ""));
    assert(L.length > 5, "nom long jamais affiché : " + L.length);
    const f = L[L.length - 1], p = f.pill, clipped = p.nameClip.sw > p.nameClip.cw;
    if (entier) assert(!clipped, "nom coupé alors qu'il tient : " + JSON.stringify(p.nameClip) + " (place " + Math.round(f.edge - 10 - p.rect.l) + " px)");
    else assert(coupeOk || !clipped, "nom coupé");
    assert(p.rect.r <= f.edge - 6 + 0.5, "touche le premier menu : " + (f.edge - p.rect.r).toFixed(1));
    assert(f.avatar && p.rect.r <= f.avatar.l - 6 + 0.5, "touche l'avatar : " + (f.avatar.l - p.rect.r).toFixed(1));
    assert(p.rect.b <= f.hdr.b && (!f.nav || p.rect.b <= f.nav.t), "déborde sous le header");
    assert(p.rect.t >= f.hdr.t, "déborde au-dessus du header");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    return { clipped };
  };
  for (const w of [360, 390]) await S("GL2-" + w, `(${w} px) nom très long (remis en forme pendant l'affichage) : coupé par « … » sans toucher l'avatar, dans le header`, async () => { const r = await nomLong(tel(w), { entier: false, coupeOk: true }); assert(r.clipped, "nom non coupé"); });
  await S("GL2-1366", "(1366 px) nom très long : affiché en entier, dans le header, sans toucher les menus", () => nomLong(pc(1366), { entier: true }));
  await S("GL2-768", "(768 px, iPad tactile) nom très long : entier, ou coupé par « … » avant les menus", () => nomLong(ipad(768), { entier: false, coupeOk: true }));

  /* ═════ GL3 : thèmes clair / sombre / pastel, police choisie ═════ */
  const themeCase = async (vp, theme) => {
      const { page } = await boot(vp, { theme, premium: true });
      await pleine(page); await sleep(700);
      const during = await page.evaluate(() => {
        const lg = document.querySelector(".logo"), ic = document.querySelector(".logo-icon"), cr = document.getElementById("logo-crown");
        return { logo: getComputedStyle(lg).color, icon: getComputedStyle(ic).color, iconI: getComputedStyle(ic.querySelector("i")).color, crown: cr ? getComputedStyle(cr).color : null, theme: document.documentElement.getAttribute("data-theme") || document.body.getAttribute("data-theme"), cls: document.getElementById("header").className };
      });
      assert(alpha(during.logo) < 0.02, `nom du logo non transparent (${theme}) : ${during.logo} [${during.theme}]`);
      assert(alpha(during.icon) > 0.99 && alpha(during.iconI) > 0.99 && during.iconI !== "rgba(0, 0, 0, 0)", "icône sans couleur : " + JSON.stringify(during));
      assert(during.crown && alpha(during.crown) > 0.99 && during.crown !== "rgba(0, 0, 0, 0)", "couronne sans couleur : " + during.crown);
      assert(/p1-hi-logo/.test(during.cls), "classe du header : " + during.cls);
      if (vp.width === 390) await shot(page, `salutation-logo-390-${theme === "light" ? "clair" : theme === "dark" ? "sombre" : "pastel"}-pendant`);
      await page.waitForFunction(() => !document.querySelector(".p1-greet-pill"), { timeout: 15000 }); await sleep(700);
      const after = await page.evaluate(() => ({ logo: getComputedStyle(document.querySelector(".logo")).color, cls: document.getElementById("header").className }));
      assert(alpha(after.logo) > 0.99 && !/p1-hi-logo/.test(after.cls), "nom du logo non revenu : " + JSON.stringify(after));
      if (vp.width === 390) await shot(page, `salutation-logo-390-${theme === "light" ? "clair" : theme === "dark" ? "sombre" : "pastel"}-apres`);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  };
  for (const theme of ["light", "dark", "pastel"]) await S("GL3-" + theme, `(390 px, ${theme}) nom du logo effacé (même devant les règles de thème), icône et couronne gardent leurs couleurs, nom en dégradé, retour du nom ensuite`, () => themeCase(tel(390), theme));
  for (const theme of ["dark", "pastel"]) await S("GL3b-" + theme, `(1366 px, ${theme}) nom du logo effacé (même devant les règles de thème), icône et couronne gardent leurs couleurs, retour du nom ensuite`, () => themeCase(pc(1366), theme));
  await S("GL3-font", "(390 px, police « serif ») le nom suit la police du logo", async () => {
    const { page } = await boot(tel(390), { font: "serif" });
    await pleine(page); await sleep(500);
    const F = await frames(page), p = full(F)[0].pill;
    assert(p.nameFont === p.logoFont, `police du nom « ${p.nameFont} » ≠ logo « ${p.logoFont} »`);
    assert(/Outfit/.test(p.logoFont), "le logo n'a pas sa police : " + p.logoFont);
  });

  /* ═════ GL4 : mouvement réduit ═════ */
  await S("GL4", "(390 px, mouvement réduit) fondu seul : la pastille ne bouge pas, le nom du logo revient", async () => {
    const { page } = await boot(tel(390), { reduce: true });
    await pleine(page); await page.waitForFunction(() => window.__g.frames.slice(-1)[0].pill === null, { timeout: 15000 }); await sleep(900);
    const F = await frames(page), V = seen(F);
    assert(V.length > 20, "pastille invisible");
    assert(V.every((f) => f.pill.tr === "none" || /^0px( 0px)?$/.test(f.pill.tr)), "translation en mouvement réduit : " + [...new Set(V.map((f) => f.pill.tr))].join(","));
    const ys = V.map((f) => f.pill.rect.t); assert(Math.max(...ys) - Math.min(...ys) <= 0.2, "la pastille bouge : " + Math.min(...ys) + "–" + Math.max(...ys));
    assert(V.some((f) => f.pill.op > 0.05 && f.pill.op < 0.95), "pas de fondu");
    assert(alpha(F[F.length - 1].logoColor) > 0.99, "nom du logo non revenu");
  });

  /* ═════ GL5 : déroulé : apparition (montée de 8 px, ≈ 0,5 s), affichage ≈ 3 s, fondu ; nom du logo qui revient ≈ 0,14 s après le début du fondu ═════ */
  await S("GL5", "(390 px) apparition en fondu avec montée de 8 px, affichage ≈ 3 s, fondu de sortie ; le nom du logo revient peu après le début de l'effacement de la salutation", async () => {
    const { page } = await boot(tel(390));
    await pleine(page);
    const anim = await page.evaluate(() => { const p = document.querySelector(".p1-greet-pill"), an = p && p.getAnimations()[0]; if (!an) return null; const kf = an.effect.getKeyframes(), d = an.effect.getTiming().duration, k1 = kf.find((k) => parseFloat(k.opacity) === 1); return { n: an.animationName, easing: kf[0].easing, rise: Math.round(k1.computedOffset * d), dur: d }; });
    await page.waitForFunction(() => window.__g.frames.slice(-1)[0].pill === null, { timeout: 15000 }); await sleep(800);
    const F = await frames(page), V = seen(F), P = full(F);
    const t0 = V[0].t, tPleine = P[0].t, tFinPleine = P[P.length - 1].t, tFin = V[V.length - 1].t;
    assert(anim && anim.n === "p1GreetLogoLife" && anim.easing === "cubic-bezier(0.22, 1, 0.36, 1)" && anim.rise >= 450 && anim.rise <= 560, "animation : " + JSON.stringify(anim));   /* durée de la montée lue sur l'animation (la courbe rend l'opacité presque pleine très tôt) */
    assert(tPleine - t0 <= 600, "apparition trop lente : " + (tPleine - t0) + " ms");
    assert(tFinPleine - tPleine >= 2400 && tFinPleine - tPleine <= 3400, "affichage ≈ 3 s attendu : " + (tFinPleine - tPleine) + " ms");
    assert(tFin - tFinPleine >= 250 && tFin - tFinPleine <= 700, "fondu de sortie : " + (tFin - tFinPleine) + " ms");
    const y0 = V[0].pill.rect.t, yFin = P[0].pill.rect.t;
    assert(y0 - yFin >= 4 && y0 - yFin <= 8.5, "montée attendue ≈ 8 px : " + (y0 - yFin).toFixed(1));
    /* retour du nom : début du retour (alpha qui remonte) par rapport au début du fondu de la salutation */
    const sortie = F.find((f) => f.t > tFinPleine && f.pill && f.pill.op < 0.9);
    const retour = F.find((f) => f.t > tFinPleine - 600 && alpha(f.logoColor) > 0.05 && f.t > tPleine + 1000);
    assert(sortie && retour, "repères introuvables");
    const d = retour.t - sortie.t; assert(d >= 0 && d <= 450, "retour du nom : " + d + " ms après le début du fondu de la salutation");
  });

  /* ═════ GL7 : Paramètres ouverts puis fermés pendant l'affichage : salutation immobile ═════ */
  for (const [k, vp] of [["tel", tel(390)], ["ipad", ipad(820)], ["pc", pc(1100)], ["pc1366", pc(1366)]]) {
    await S("GL7-" + k, `(${vp.width} px) Paramètres ouverts puis fermés pendant l'affichage : la salutation ne bouge pas`, async () => {
      const { page } = await boot(vp);
      await pleine(page);
      await page.evaluate(() => { window.__gp = []; (function f() { const p = document.querySelector(".p1-greet-pill"); if (p) { const r = p.getBoundingClientRect(); window.__gp.push({ l: r.left, t: r.top, op: parseFloat(getComputedStyle(p).opacity) }); } requestAnimationFrame(f); })(); });
      await sleep(500);
      await page.evaluate(() => window.openSettingsModal && window.openSettingsModal()); await sleep(500);
      await page.evaluate(() => window.closeSettingsModal && window.closeSettingsModal()); await sleep(500);
      const G = (await page.evaluate(() => window.__gp)).filter((g) => g.op > 0.95);
      assert(G.length > 15, "pas assez d'images : " + G.length);
      const dl = Math.max(...G.map((g) => g.l)) - Math.min(...G.map((g) => g.l)), dt = Math.max(...G.map((g) => g.t)) - Math.min(...G.map((g) => g.t));
      assert(dl <= 0.5 && dt <= 0.5, `salutation déplacée : ${dl.toFixed(2)} / ${dt.toFixed(2)} px`);
    });
  }

  /* ═════ GL8 : redimensionnement : la position suit (mêmes options tactiles avant et après : Puppeteer recharge la page si isMobile / hasTouch change) ═════ */
  await S("GL8", "(390 → 1100 → 390, tactile) redimensionnement pendant l'affichage : la position suit l'icône du logo, toujours dans le header, nom du logo effacé", async () => {
    const { page } = await boot(tel(390));
    await pleine(page);
    const lire = () => page.evaluate(() => { const p = document.querySelector(".p1-greet-pill"), h = document.getElementById("header").getBoundingClientRect(), ic = document.querySelector(".logo-icon").getBoundingClientRect(); if (!p) return null; const r = p.getBoundingClientRect(); return { dx: r.left - ic.right, inHdr: r.top >= h.top - 0.5 && r.bottom <= h.bottom + 0.5, r: r.right, iw: innerWidth, cls: /p1-hi-logo/.test(document.getElementById("header").className), deux: p.children.length }; });
    await page.setViewport({ ...tel(1100) }); await sleep(400);
    const a = await lire(); assert(a && a.deux === 2 && a.inHdr && a.cls && Math.abs(a.dx - 10) <= 1 && a.r <= a.iw, "à 1100 px : " + JSON.stringify(a));
    await page.setViewport(tel(390)); await sleep(400);
    const b = await lire(); assert(b && b.deux === 2 && b.inHdr && b.cls && Math.abs(b.dx - 10) <= 1 && b.r <= b.iw, "retour à 390 px : " + JSON.stringify(b));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════ GL9 : raccourcis du header qui apparaissent, déconnexion / reconnexion, message sans nom ═════ */
  await S("GL9a", "(1366 px) la barre de raccourcis qui apparaît retire la salutation et rend le nom du logo tout de suite", async () => {
    const { page } = await boot({ width: 1366, height: 900 });
    await pleine(page); await degager(page);
    await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "2600px"; (document.querySelector("footer") || document.body).appendChild(d); window.scrollTo({ top: 900, behavior: "instant" }); });
    await page.waitForFunction(() => !document.querySelector(".p1-greet-pill"), { timeout: 3000 });
    assert(await page.evaluate(() => !/p1-hi-logo/.test(document.getElementById("header").className)), "classe du header restée");
  });
  await S("GL9b", "(390 px) un événement « raccourcis affichés » retire la salutation et rend le nom du logo tout de suite", async () => {
    const { page } = await boot(tel(390));
    await pleine(page); await sleep(300);
    assert(await page.evaluate(() => /p1-hi-logo/.test(document.getElementById("header").className)), "classe absente pendant l'affichage");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("p1:hdr-shortcuts", { detail: { on: true } })));
    await sleep(100);
    const r = await page.evaluate(() => ({ pill: !!document.querySelector(".p1-greet-pill"), cls: document.getElementById("header").className }));
    assert(!r.pill && !/p1-hi-logo/.test(r.cls), "non retirée : " + JSON.stringify(r));
    await sleep(500); assert(alpha(await page.evaluate(() => getComputedStyle(document.querySelector(".logo")).color)) > 0.99, "nom du logo non revenu");
  });
  await S("GL9c", "(390 px) déconnexion puis reconnexion : nouvelle salutation en mode logo ; nom du logo revenu entre les deux", async () => {
    const { u, page } = await boot(tel(390));
    await pleine(page); await degager(page);
    await page.evaluate(() => document.getElementById("user-avatar").click()); await sleep(300);
    await page.evaluate(() => document.getElementById("logout-btn").click());
    await page.waitForFunction(() => !document.getElementById("welcome-message").textContent.trim(), { timeout: 20000 }); await sleep(600);
    const r = await page.evaluate(() => ({ pill: !!document.querySelector(".p1-greet-pill"), cls: document.getElementById("header").className, c: getComputedStyle(document.querySelector(".logo")).color }));
    assert(!r.pill && !/p1-hi-logo/.test(r.cls) && alpha(r.c) > 0.99, "état après déconnexion : " + JSON.stringify(r));
    await page.evaluate(async (e, p) => { await window.__authApi.signInWithEmailAndPassword(window.__auth, e, p); }, u.email, u.password);
    await page.waitForFunction(() => { const p = document.querySelector(".p1-greet-pill"); return p && parseFloat(getComputedStyle(p).opacity) > 0.9; }, { timeout: 30000 });
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("GL9d", "(390 px) message sans nom : une seule ligne, dans le header", async () => {
    const { page } = await boot(tel(390));
    await pleine(page);
    await page.evaluate(() => { document.getElementById("welcome-message").textContent = "Bonjour !"; });
    await sleep(400);
    const r = await page.evaluate(() => { const p = document.querySelector(".p1-greet-pill"), h = document.getElementById("header").getBoundingClientRect(), b = p.getBoundingClientRect(); return { lines: p.children.length, text: p.textContent, ok: b.top >= h.top && b.bottom <= h.bottom }; });
    assert(r.lines === 1 && r.text === "Bonjour" && r.ok, "une ligne attendue : " + JSON.stringify(r));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════ GL10 : déconnecté : aucune salutation ═════ */
  await S("GL10", "(390 px) visiteur déconnecté : aucune salutation, nom du logo intact", async () => {
    const { page } = await boot(tel(390), { signIn: false });
    await page.waitForFunction(() => !document.documentElement.classList.contains("p1-skel"), { timeout: 40000 }); await sleep(3000);
    const F = await frames(page);
    assert(F.every((f) => !f.pill) && F.every((f) => alpha(f.logoColor) > 0.99), "salutation ou logo modifié sans connexion");
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
