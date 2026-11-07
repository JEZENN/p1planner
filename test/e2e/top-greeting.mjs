/* Haut de page : bandeau supprimé (jamais visible, styles dans le <head>), salutation éphémère dans le header, écart constant sous le header,
   squelette à la même hauteur que la vraie page. Vraie page + émulateurs, sur ordinateur (1366), tablette (820) et téléphone (390), connecté et déconnecté.
   Lancer : node test/e2e/top-greeting.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; TOPSHOTS=1 pour les captures) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, adb, scenario, report, assert, sleep, proxyMode, BASE } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { await proxyMode("up").catch(() => {}); while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const VP = { pc: { width: 1366, height: 900 }, tab: { width: 820, height: 1180 }, tel: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const shot = async (page, name) => { if (process.env.TOPSHOTS) await page.screenshot({ path: `docs/captures-15-10/${name}.png` }); };

/* sonde posée AVANT le chargement : à chaque image, bandeau visible ? pastille (opacité, texte, position, chevauchements) ? barre réelle / du squelette ? */
const PROBE = () => {
  window.__tp = { banner: null, bannerFrames: 0, frames: 0, t0: performance.now(), pill: [], hits: [], skel: null, nav: null, tallHeader: null, texts: [] };
  const vis = (e) => { if (!e) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inter = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  (function tick() {
    const T = window.__tp; T.frames++;
    for (const sel of [".page-header .page-title", ".page-header .welcome-message", ".page-header .page-subtitle"]) { const e = document.querySelector(sel); if (vis(e) && getComputedStyle(e).display !== "none") { T.bannerFrames++; T.banner = T.banner || sel + " @" + Math.round(performance.now() - T.t0); } }
    const ph = document.querySelector(".page-header"); if (ph) { const h = ph.getBoundingClientRect().height; if (h > 90 && !T.tallHeader) T.tallHeader = Math.round(h) + " @" + Math.round(performance.now() - T.t0); }
    const sk = document.querySelector("#p1-skel .p1-sk-navbar");
    if (sk && getComputedStyle(document.getElementById("p1-skel")).display !== "none") { const r = sk.getBoundingClientRect(); T.skel = { top: r.top + scrollY, height: r.height, hdr: document.getElementById("header").getBoundingClientRect().bottom }; }
    const pill = document.querySelector(".p1-greet-pill");
    if (pill) {
      const cs = getComputedStyle(pill), r = pill.getBoundingClientRect(), t = Math.round(performance.now() - T.t0), op = parseFloat(cs.opacity);
      const hdr = document.getElementById("header").getBoundingClientRect();
      T.pill.push({ t, op, ty: Math.round(r.top * 10) / 10, below: pill.classList.contains("is-below"), text: pill.textContent, role: pill.parentNode.getAttribute("role"), live: pill.parentNode.getAttribute("aria-live"), tr: cs.translate });
      if (op > 0.95) {
        const bad = [];
        for (const sel of [".logo", ".nav-items", ".header-actions", ".mobile-menu-btn", "#avatar-wrapper", "#save-indicator-header", "#p1HdrNav.is-on", ".user-auth"]) { const e = document.querySelector(sel); if (vis(e) && inter(r, e.getBoundingClientRect())) bad.push(sel); }
        if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5) bad.push("hors écran");
        if (pill.classList.contains("is-below") ? r.top < hdr.bottom - 0.5 : (r.top < hdr.top - 0.5 || r.bottom > hdr.bottom + 0.5)) bad.push("hors zone");
        if (bad.length) T.hits.push(bad.join(",") + " @" + t);
        T.last = { l: r.left, r: r.right, t: r.top, b: r.bottom, below: pill.classList.contains("is-below"), hb: hdr.bottom };
      }
    }
    const nav = document.querySelector(".app-nav");
    if (nav && vis(nav) && getComputedStyle(document.getElementById("main-content")).display !== "none") T.nav = nav.getBoundingClientRect().top;
    requestAnimationFrame(tick);
  })();
};

async function boot(vp, { signIn = true, theme = "light", reduce = false, probe = true, height = null } = {}) {
  const u = await mkUser({ courses: 3 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...(theme !== "light" ? { theme } : {}) }, { merge: true });
  const ctx = await browser.createBrowserContext(); OPEN.push(ctx); const page = await ctx.newPage();
  page.__errors = []; page.on("pageerror", (e) => page.__errors.push(String(e.message || e))); page.setDefaultNavigationTimeout(120000);
  await page.setViewport(height ? { ...vp, height } : vp);
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  if (probe) await page.evaluateOnNewDocument(PROBE);
  await page.goto(BASE + "/tableur.html", { waitUntil: "load" });
  if (signIn) {
    await page.waitForFunction(() => window.__authApi && window.__auth, { timeout: 30000 });
    await page.evaluate(async (e, p) => { await window.__authApi.signInWithEmailAndPassword(window.__auth, e, p); }, u.email, u.password);
  }
  return { u, page };
}
const ready = (page) => page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0 && window.firebaseDataLoaded !== false && !document.documentElement.classList.contains("p1-skel"), { timeout: 60000 });
const closeOnb = (page) => page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
const geom = (page) => page.evaluate(() => { const n = document.querySelector(".app-nav"), h = document.getElementById("header"); const nr = n.getBoundingClientRect(), hr = h.getBoundingClientRect(); return { navTop: nr.top, navH: nr.height, hdrBottom: hr.bottom, hdrH: hr.height, gap: nr.top - hr.bottom, sy: scrollY }; });
const noHScroll = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth }));

try {
  for (const [k, vp] of Object.entries(VP)) {
    /* ═════════ TP1 : bandeau absent, styles dans le <head>, écart au chargement ═════════ */
    await S("TP1-" + k, `(${vp.width} px, connecté) bandeau jamais visible (chargement, squelette, page), styles de masquage dans le <head>, message de bienvenue conservé dans le DOM, barre d'onglets à 10 px sous le header`, async () => {
      const { page } = await boot(vp);
      await ready(page); await closeOnb(page); await sleep(900);
      const T = await page.evaluate(() => window.__tp);
      assert(!T.banner, "bandeau visible : " + T.banner + " (" + T.bannerFrames + " images)");
      assert(!T.tallHeader, "la section du bandeau a une hauteur de bandeau : " + T.tallHeader);
      const inHead = await page.evaluate(() => {
        for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.selectorText && r.selectorText.includes(".page-header .page-title") && /display:\s*none/.test(r.cssText)) return { head: sh.ownerNode.parentNode === document.head, id: sh.ownerNode.id || null }; } catch (e) {} }
        return null;
      });
      assert(inHead && inHead.head, "règle de masquage absente du <head> : " + JSON.stringify(inHead));
      const w = await page.evaluate(() => { const e = document.getElementById("welcome-message"); return e ? { text: e.textContent, cls: e.className, disp: getComputedStyle(e).display } : null; });
      assert(w && w.text.trim().length > 3 && w.disp === "none", "message de bienvenue : doit rester dans le DOM, rempli, masqué : " + JSON.stringify(w));
      const g = await geom(page);
      assert(g.hdrH === 70 && Math.abs(g.gap - 10) <= 0.5, "écart barre / header au chargement : " + JSON.stringify(g));
      await shot(page, "haut-page-apres-" + k + "-clair");
      const hs = await noHScroll(page); assert(hs.sw <= hs.iw && hs.bw <= hs.iw, "défilement horizontal : " + JSON.stringify(hs));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });

    /* ═════════ TP2 : déconnecté ═════════ */
    await S("TP2-" + k, `(${vp.width} px, déconnecté) bandeau jamais visible, aucune salutation, pas de défilement horizontal`, async () => {
      const { page } = await boot(vp, { signIn: false });
      await page.waitForFunction(() => !document.documentElement.classList.contains("p1-skel"), { timeout: 40000 }); await sleep(3500);
      const T = await page.evaluate(() => window.__tp);
      assert(!T.banner, "bandeau visible : " + T.banner);
      assert(T.pill.length === 0, "salutation affichée sans connexion : " + JSON.stringify(T.pill[0]));
      const pr = await page.evaluate(() => { const p = document.getElementById("presentation-section"); const h = document.getElementById("header").getBoundingClientRect(); const i = document.querySelector(".presentation-intro, .login-sidebar-card"); return { vis: !!p && getComputedStyle(p).display !== "none", hb: h.bottom, introTop: i ? i.getBoundingClientRect().top : null }; });
      assert(pr.vis, "présentation non affichée");
      const hs = await noHScroll(page); assert(hs.sw <= hs.iw && hs.bw <= hs.iw, "défilement horizontal : " + JSON.stringify(hs));
      await shot(page, "haut-page-apres-" + k + "-deconnecte");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });

    /* ═════════ TP3 : salutation ═════════ */
    for (const theme of ["light", "dark"]) {
      await S(`TP3-${k}-${theme}`, `(${vp.width} px, ${theme}) salutation : texte sans « ! », pastille ≈ 2,8 s, rôle status, aucun chevauchement, ${k === "tel" ? "sous le header, entièrement à l'écran" : "dans le header, centrée entre le logo et les menus"}, effacée ensuite`, async () => {
        const { page } = await boot(vp, { theme });
        await page.waitForFunction(() => window.__tp && window.__tp.pill.some((p) => p.op > 0.95), { timeout: 60000 });
        if (theme !== "light") await page.evaluate((t) => { try { window.p1SetTheme && window.p1SetTheme(t, false); } catch (e) {} }, theme);
        await sleep(450); await shot(page, `haut-page-salutation-${k}-${theme}`);
        const expected = await page.evaluate(() => document.getElementById("welcome-message").textContent.replace(/\s+/g, " ").trim().replace(/\s*!\s*$/, ""));
        await sleep(3600);
        const T = await page.evaluate(() => window.__tp);
        const seen = T.pill.filter((p) => p.op > 0.05);
        assert(seen.length > 20, "pastille trop peu visible : " + seen.length + " images");
        const dur = seen[seen.length - 1].t - seen[0].t;
        assert(dur >= 2000 && dur <= 3300, "durée affichée ≈ 2–3 s attendue : " + dur + " ms");
        const p0 = T.pill[0];
        assert(p0.text === expected && !/!/.test(p0.text) && /^(Bonjour|Bon après-midi|Bonsoir), /.test(p0.text), `texte : « ${p0.text} » (attendu « ${expected} »)`);
        assert(p0.role === "status" && p0.live === "polite", "rôle / aria-live : " + p0.role + " / " + p0.live);
        assert(T.hits.length === 0, "chevauchement ou hors écran : " + T.hits.slice(0, 3).join(" | "));
        assert(T.last && (k === "tel" ? T.last.below === true : T.last.below === false), "emplacement : " + JSON.stringify(T.last));
        const ys = seen.filter((p) => p.op > 0.95).map((p) => p.ty); assert(ys.length > 20, "pastille pleinement visible trop brève");
        const after = await page.evaluate(() => ({ pills: document.querySelectorAll(".p1-greet-pill").length, host: !!document.getElementById("p1-greet") }));
        assert(after.pills === 0 && after.host, "pastille non retirée à la fin : " + JSON.stringify(after));
        const hs = await noHScroll(page); assert(hs.sw <= hs.iw, "défilement horizontal : " + JSON.stringify(hs));
        assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
      });
    }

    /* ═════════ TP4 : écart constant, clic en haut de page, clic plus bas, retour en haut ═════════ */
    await S("TP4-" + k, `(${vp.width} px) écart barre / header : 10 px au chargement, identique à chaque image pendant un clic sur un onglet en haut de page (aucun saut), puis après un clic depuis le bas et après le bouton « retour en haut »`, async () => {
      const { page } = await boot(vp);
      await ready(page); await closeOnb(page); await sleep(2500);
      await page.evaluate(() => { const d = document.createElement("div"); d.id = "tp-filler"; d.style.height = "2600px"; (document.querySelector("footer") || document.body).appendChild(d); }); await sleep(300);
      const g0 = await geom(page);
      assert(g0.sy === 0 && Math.abs(g0.gap - 10) <= 0.5, "départ : " + JSON.stringify(g0));
      const pages = await page.evaluate(() => [...document.querySelectorAll(".app-nav-btn")].filter((b) => b.getClientRects().length).map((b) => b.dataset.page));
      const targets = pages.filter((p) => p !== "dashboard").slice(0, 3);
      for (const tg of targets) {
        await page.evaluate(() => { window.__nt = []; const t0 = performance.now(); (function f() { const n = document.querySelector(".app-nav"); window.__nt.push({ t: Math.round(performance.now() - t0), top: n.getBoundingClientRect().top, sy: scrollY }); if (performance.now() - t0 < 1200) requestAnimationFrame(f); })(); });
        await page.click(`.app-nav-btn[data-page="${tg}"]`); await sleep(1400);
        const N = await page.evaluate(() => window.__nt);
        const tops = N.map((x) => x.top), sys = N.map((x) => x.sy);
        assert(Math.max(...tops) - Math.min(...tops) <= 0.5 && Math.max(...sys) === 0, `saut de la barre au clic sur « ${tg} » : tops ${Math.min(...tops)}–${Math.max(...tops)}, défilement max ${Math.max(...sys)}`);
      }
      const g1 = await geom(page); assert(Math.abs(g1.gap - 10) <= 0.5, "après clics en haut : " + JSON.stringify(g1));
      for (const tg of ["items", "stats"]) {
        await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" })); await sleep(500);
        await page.evaluate((p) => document.querySelector(`.app-nav-btn[data-page="${p}"]`).click(), tg); await sleep(1800);
        const g2 = await geom(page); assert(Math.abs(g2.gap - 10) <= 1 && g2.sy <= 1, `après un clic sur « ${tg} » depuis le bas : ` + JSON.stringify(g2));
      }
      await page.evaluate(() => window.scrollTo({ top: 1000, behavior: "instant" })); await sleep(600);
      const hasBtt = await page.evaluate(() => { const b = document.getElementById("back-to-top"); if (b) b.click(); return !!b; });
      if (hasBtt) { await sleep(1800); const g3 = await geom(page); assert(Math.abs(g3.gap - 10) <= 1 && g3.sy <= 1, "après « retour en haut » : " + JSON.stringify(g3)); }
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });

    /* ═════════ TP5 : squelette ═════════ */
    await S("TP5-" + k, `(${vp.width} px) squelette : barre à la même position et à la même hauteur que la vraie page, bandeau absent pendant le squelette`, async () => {
      const { u, page } = await boot(vp);
      await ready(page); await closeOnb(page); await sleep(1200);
      await proxyMode("slow", 1500);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__tp && window.__tp.skel, { timeout: 20000 });
      await ready(page); await closeOnb(page); await sleep(900);
      const T = await page.evaluate(() => window.__tp), g = await geom(page);
      assert(T.skel, "squelette jamais vu");
      assert(!T.banner, "bandeau visible pendant le chargement : " + T.banner);
      const dTop = Math.abs(T.skel.top - g.navTop - 0), dH = Math.abs(T.skel.height - g.navH), skGap = T.skel.top - T.skel.hdr;
      assert(dTop <= 0.5 && Math.abs(skGap - 10) <= 0.5, `position haute : squelette ${T.skel.top} / réelle ${g.navTop} (écart ${skGap} px sous le header)`);
      assert(dH <= 1, `hauteur de la barre : squelette ${T.skel.height} / réelle ${g.navH}`);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ TP6 : barre de raccourcis ═════════ */
  await S("TP6a", "(1366 px) la barre de raccourcis qui apparaît retire la salutation tout de suite", async () => {
    const { page } = await boot(VP.pc);
    await page.waitForFunction(() => window.__tp && window.__tp.pill.some((p) => p.op > 0.95), { timeout: 60000 });
    await closeOnb(page);
    await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "2600px"; (document.querySelector("footer") || document.body).appendChild(d); });
    await page.evaluate(() => { window.__gone = null; const t0 = performance.now(); window.scrollTo({ top: 900, behavior: "instant" }); (function f() { if (!document.querySelector(".p1-greet-pill")) { window.__gone = Math.round(performance.now() - t0); return; } if (performance.now() - t0 < 3000) requestAnimationFrame(f); })(); });
    await sleep(900);
    const r = await page.evaluate(() => ({ gone: window.__gone, on: !!document.querySelector("#p1HdrNav.is-on") }));
    assert(r.on, "raccourcis non affichés"); assert(r.gone !== null && r.gone < 500, "salutation non retirée tout de suite : " + r.gone + " ms");
  });
  await S("TP6b", "(1366 px) raccourcis déjà visibles : aucune salutation ; une salutation par connexion ; nom remis en forme pendant l'affichage mis à jour", async () => {
    const { u, page } = await boot(VP.pc, { signIn: true });
    await page.waitForFunction(() => window.__tp && window.__tp.pill.some((p) => p.op > 0.95), { timeout: 60000 });
    /* nom remis en forme pendant l'affichage (même modification que le code de profil) */
    await page.evaluate(() => { const un = document.querySelector("#welcome-message .user-name"); un.textContent = "Zoé DURAND"; });
    await sleep(200);
    const live = await page.evaluate(() => (document.querySelector(".p1-greet-pill") || {}).textContent);
    assert(/Zoé DURAND$/.test(live || ""), "texte non mis à jour : " + live);
    await sleep(3400);
    assert(await page.evaluate(() => !document.querySelector(".p1-greet-pill")), "pastille encore là");
    /* même connexion : le message est réécrit → pas de nouvelle salutation */
    await page.evaluate(() => { const e = document.getElementById("welcome-message"); e.innerHTML = e.innerHTML; });
    await sleep(700);
    assert(await page.evaluate(() => !document.querySelector(".p1-greet-pill")), "seconde salutation dans la même connexion");
    /* déconnexion réelle puis nouvelle connexion : salue de nouveau */
    await closeOnb(page);
    await page.evaluate(() => document.getElementById("user-avatar").click()); await sleep(300);
    await page.evaluate(() => document.getElementById("logout-btn").click());
    await page.waitForFunction(() => !document.getElementById("welcome-message").textContent.trim(), { timeout: 20000 });
    await sleep(500);
    assert(await page.evaluate(() => !document.querySelector(".p1-greet-pill")), "pastille restée après la déconnexion");
    await page.evaluate(async (e, p) => { await window.__authApi.signInWithEmailAndPassword(window.__auth, e, p); }, u.email, u.password);
    await page.waitForFunction(() => { const p = document.querySelector(".p1-greet-pill"); return p && parseFloat(getComputedStyle(p).opacity) > 0.9; }, { timeout: 30000 });
  });
  await S("TP6c", "(1366 px) page déjà défilée : les raccourcis sont visibles, la salutation n'apparaît pas", async () => {
    const u = await mkUser({ courses: 3 });
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
    const ctx = await browser.createBrowserContext(); OPEN.push(ctx); const page = await ctx.newPage(); page.__errors = [];
    page.on("pageerror", (e) => page.__errors.push(String(e.message || e))); page.setDefaultNavigationTimeout(120000);
    await page.setViewport(VP.pc); await page.evaluateOnNewDocument(PROBE);
    await page.goto(BASE + "/tableur.html", { waitUntil: "load" });
    await page.waitForFunction(() => window.__authApi && window.__auth, { timeout: 30000 });
    await page.evaluate(async (e, p) => { await window.__authApi.signInWithEmailAndPassword(window.__auth, e, p); }, u.email, u.password);
    await ready(page); await closeOnb(page);
    await page.evaluate(() => { const e = document.getElementById("welcome-message"); const h = e.innerHTML; e.innerHTML = ""; window.__wm = h; });
    await page.waitForFunction(() => !document.querySelector(".p1-greet-pill"), { timeout: 6000 }); await sleep(500);
    await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "2600px"; (document.querySelector("footer") || document.body).appendChild(d); window.scrollTo({ top: 900, behavior: "instant" }); });
    await page.waitForFunction(() => document.querySelector("#p1HdrNav.is-on"), { timeout: 5000 });
    await page.evaluate(() => { const e = document.getElementById("welcome-message"); e.innerHTML = window.__wm; });
    await sleep(900);
    assert(await page.evaluate(() => !document.querySelector(".p1-greet-pill")), "salutation affichée alors que les raccourcis sont visibles");
  });

  /* ═════════ TP7 : mouvement réduit ═════════ */
  await S("TP7", "(1366 px) « réduire les animations » : fondu seul, la pastille ne bouge pas", async () => {
    const { page } = await boot(VP.pc, { reduce: true });
    await page.waitForFunction(() => window.__tp && window.__tp.pill.some((p) => p.op > 0.95), { timeout: 60000 });
    await sleep(3600);
    const T = await page.evaluate(() => window.__tp), seen = T.pill.filter((p) => p.op > 0.02);
    assert(seen.length > 20, "pastille invisible");
    const ys = seen.map((p) => p.ty); assert(Math.max(...ys) - Math.min(...ys) <= 0.2, "la pastille bouge (reduced-motion) : " + Math.min(...ys) + "–" + Math.max(...ys));
    assert(seen.every((p) => p.tr === "none" || p.tr === "0px" || p.tr === "0px 0px"), "translation en mouvement réduit : " + [...new Set(seen.map((p) => p.tr))].join(","));
    assert(seen.some((p) => p.op > 0.05 && p.op < 0.95), "pas de fondu");
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
