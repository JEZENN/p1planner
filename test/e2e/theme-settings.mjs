/* Le thème se choisit dans Paramètres → carte « Thème » (sous « Listes personnalisables ») ; le bouton du header n'existe plus et le header reste aligné
   (PC, iPad, téléphone). Vraie page + vrais émulateurs ; l'enregistrement est relu SUR LE SERVEUR.
   Lancer : node test/e2e/theme-settings.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const PHONE = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

async function user(vp) {
  const u = await mkUser({ courses: 1 });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; await page.bringToFront();
  if (vp) await page.setViewport(vp);
  await sleep(vp && vp.isMobile ? 2500 : 400);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 30000 });
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" });
  await page.waitForSelector("#tpx-onb-overlay", { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock(); document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden"); });
  return { u, page };
}
const openSettings = async (page) => {
  await page.evaluate(() => window.openSettingsModal());
  await page.waitForSelector('.settings-card[data-setting="p1-theme"]', { timeout: 10000 }); await sleep(900);
};
const serverTheme = async (uid) => { const d = (await adb.doc(`users/${uid}/settings/preferences`).get()).data(); return d ? d.theme : null; };
const waitServerTheme = async (uid, t, ms = 12000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await serverTheme(uid); if (v === t) return v; await sleep(300); } return v; };
const cur = (page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const checked = (page) => page.evaluate(() => [...document.querySelectorAll(".p1-theme-opt")].filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.getAttribute("data-p1-theme")));
const center = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const clickOpt = async (page, t, touch) => {
  await page.evaluate((x) => document.querySelector(`.p1-theme-opt[data-p1-theme="${x}"]`).scrollIntoView({ behavior: "instant", block: "center" }), t); await sleep(500);
  const c = await center(page, `.p1-theme-opt[data-p1-theme="${t}"]`);
  if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
  await sleep(500);
};

try {
  /* ── le header : plus de bouton, rien ne se décale ── */
  for (const [label, vp] of [["PC 1366", { width: 1366, height: 900 }], ["PC 1024", { width: 1024, height: 768 }], ["iPad 820", PHONE(820, 1180)], ["tablette 768", PHONE(768, 1024)], ["téléphone 390", PHONE(390, 844)], ["téléphone 360", PHONE(360, 780)]]) {
    await S("TH1-" + label.replace(/\s/g, ""), `header sans bouton de thème, aligné, sans débordement (${label})`, async () => {
      const { page } = await user(vp);
      const g = await page.evaluate(() => {
        const r = (e) => e && e.getBoundingClientRect();
        const logo = r(document.querySelector("#header .logo")), av = r(document.getElementById("user-avatar")), mm = document.querySelector("#header .mobile-menu-btn"), mr = mm && getComputedStyle(mm).display !== "none" ? r(mm) : null, h = r(document.getElementById("header"));
        return { toggle: !!document.getElementById("theme-toggle"), oldIcon: !!document.querySelector("#header .fa-sun, #header .fa-moon, #header .fa-cloud-sun"),
          overflowX: document.documentElement.scrollWidth - innerWidth, logoLeft: Math.round(logo.left), avRight: Math.round(innerWidth - av.right), avInside: av.right <= innerWidth && av.left >= 0,
          overlap: !!(mr && !(mr.right <= av.left || mr.left >= av.right)), mmInside: mr ? mr.right <= innerWidth : null, hh: Math.round(h.height), logoVsAvatarY: Math.round(Math.abs((logo.top + logo.height / 2) - (av.top + av.height / 2))) };
      });
      assert(!g.toggle && !g.oldIcon, "le bouton de thème est encore dans le header : " + JSON.stringify(g));
      assert(g.avInside, "avatar hors de l'écran : " + JSON.stringify(g));
      /* à 360 px la page Matières déborde de 11 px AVANT ce changement déjà (bouton « réinitialiser les filtres » de .quick-actions, sans rapport avec le header) : on exige « pas pire qu'avant » */
      assert(g.overflowX <= (vp.width === 360 ? 11 : 0), "débordement horizontal : " + JSON.stringify(g));
      assert(!g.overlap && g.mmInside !== false, "éléments du header qui se chevauchent : " + JSON.stringify(g));
      /* marges du header : l'avatar est à 8 px de plus du bord droit que le logo du bord gauche en dessous de 992 px, comme AVANT ce changement (pas pire) */
      assert(g.avRight - g.logoLeft <= 8 && g.avRight - g.logoLeft >= 0, "marges du header (logo " + g.logoLeft + " px du bord gauche, avatar à " + g.avRight + " px du droit) : " + JSON.stringify(g));
      assert(g.logoVsAvatarY <= 3, "logo et avatar pas alignés verticalement : " + JSON.stringify(g));
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

  /* ── la carte dans les Paramètres ── */
  await S("TH2", "Paramètres : carte « Thème » juste sous « Listes personnalisables », 3 thèmes présentés avec une phrase, le thème en cours indiqué", async () => {
    const { page } = await user({ width: 1366, height: 900 });
    await openSettings(page);
    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".settings-modal-body .settings-card")].map((c) => c.getAttribute("data-setting"));
      const opts = [...document.querySelectorAll(".p1-theme-opt")].map((b) => { const n = b.querySelector(".p1-theme-name"), d = b.querySelector(".p1-theme-desc"), br = b.getBoundingClientRect(); return { t: b.getAttribute("data-p1-theme"), name: n.textContent.replace("Actif", "").trim(), desc: d.textContent.trim(), h: Math.round(br.height), role: b.getAttribute("role"), cut: d.scrollWidth > d.clientWidth + 1 || n.scrollWidth > n.clientWidth + 1, chk: Math.round(+getComputedStyle(b.querySelector(".p1-theme-check")).opacity * 100) / 100, cols: getComputedStyle(document.querySelector(".p1-theme-grid")).gridTemplateColumns.split(" ").length }; });
      return { cards, opts, group: document.querySelector(".p1-theme-grid").getAttribute("role"), title: document.querySelector('.settings-card[data-setting="p1-theme"] .settings-card-title').textContent };
    });
    const i = r.cards.indexOf("p1-catalogs"), j = r.cards.indexOf("p1-theme");
    assert(i >= 0 && j === i + 1, "ordre des cartes : " + JSON.stringify(r.cards));
    assert(r.title === "Thème" && r.group === "radiogroup", "titre / groupe : " + JSON.stringify([r.title, r.group]));
    assert(r.opts.map((o) => o.name).join() === "Clair,Sombre,Pastel", "thèmes : " + JSON.stringify(r.opts.map((o) => o.name)));
    assert(r.opts.every((o) => o.desc.length >= 20 && o.role === "radio" && o.h >= 56 && !o.cut) && r.opts[0].cols === 3, "phrases / tailles / texte coupé / 3 colonnes sur PC : " + JSON.stringify(r.opts));
    const on = r.opts.filter((o) => o.chk > 0.9);
    assert(on.length === 1 && on[0].t === (await cur(page)), "thème en cours non indiqué (coche) : " + JSON.stringify(r.opts.map((o) => [o.t, o.chk])));
    assert((await checked(page)).join() === (await cur(page)), "aria-checked : " + (await checked(page)).join());
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("TH3", "choisir un thème : appliqué tout de suite, indiqué dans la carte, enregistré SUR LE SERVEUR, conservé au rechargement", async () => {
    const { u, page } = await user({ width: 1366, height: 900 });
    await openSettings(page);
    for (const t of ["dark", "pastel", "light", "dark"]) {
      await clickOpt(page, t, false);
      assert((await cur(page)) === t, `clic « ${t} » : data-theme = ` + (await cur(page)));
      assert((await checked(page)).join() === t, `carte après « ${t} » : ` + (await checked(page)).join());
      const ls = await page.evaluate(() => localStorage.getItem("theme")); assert(ls === t, `localStorage = ${ls}`);
      const sv = await waitServerTheme(u.uid, t); assert(sv === t, `serveur : theme = ${sv} (attendu ${t})`);
    }
    // rechargement : le thème choisi revient, et la carte l'indique
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 30000 }); await sleep(2500);
    assert((await cur(page)) === "dark", "après rechargement : data-theme = " + (await cur(page)));
    await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window._ednScrollUnlock) window._ednScrollUnlock(); document.body.style.overflow = ""; });
    await openSettings(page);
    assert((await checked(page)).join() === "dark", "carte après rechargement : " + (await checked(page)).join());
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("TH4", "clavier : flèches = thème précédent / suivant (groupe radio), un seul élément dans l'ordre de tabulation", async () => {
    const { page } = await user({ width: 1366, height: 900 });
    await openSettings(page);
    const tabs = await page.evaluate(() => [...document.querySelectorAll(".p1-theme-opt")].filter((b) => b.tabIndex === 0).length);
    assert(tabs === 1, "éléments tabulables : " + tabs);
    await page.evaluate(() => document.querySelector('.p1-theme-opt[aria-checked="true"]').focus());
    await page.keyboard.press("ArrowDown"); await sleep(400);
    assert((await cur(page)) === "dark" && (await checked(page)).join() === "dark", "ArrowDown : " + (await cur(page)));
    await page.keyboard.press("ArrowDown"); await sleep(400);
    assert((await cur(page)) === "pastel", "ArrowDown (2) : " + (await cur(page)));
    await page.keyboard.press("ArrowRight"); await sleep(400);
    assert((await cur(page)) === "light", "ArrowRight (retour au début) : " + (await cur(page)));
    await page.keyboard.press("ArrowUp"); await sleep(400);
    assert((await cur(page)) === "pastel", "ArrowUp : " + (await cur(page)));
    const foc = await page.evaluate(() => document.activeElement.getAttribute("data-p1-theme")); assert(foc === "pastel", "focus : " + foc);
  });

  for (const [label, vp, touch] of [["iPad 820", PHONE(820, 1180), true], ["téléphone 390", PHONE(390, 844), true], ["téléphone 360", PHONE(360, 780), true]]) {
    await S("TH5-" + label.replace(/\s/g, ""), `carte Thème au toucher (${label}) : rien ne déborde, cibles >= 56 px, un toucher change le thème`, async () => {
      const { u, page } = await user(vp);
      await openSettings(page);
      const g = await page.evaluate(() => { const b = document.querySelector(".settings-modal-body"), m = document.getElementById("settings-modal-inner"), rows = [...document.querySelectorAll(".p1-theme-opt")]; const mr = m.getBoundingClientRect();
        return { bodyOver: b.scrollWidth > b.clientWidth + 1, pageOver: document.documentElement.scrollWidth > innerWidth, minH: Math.round(Math.min(...rows.map((x) => x.getBoundingClientRect().height))), inside: rows.every((x) => { const r = x.getBoundingClientRect(); return r.left >= mr.left - 1 && r.right <= mr.right + 1; }), cut: rows.some((x) => [".p1-theme-desc", ".p1-theme-name"].some((s) => { const e = x.querySelector(s); return e.scrollWidth > e.clientWidth + 1; })) }; });
      assert(!g.bodyOver && (!g.pageOver || vp.width === 360) && g.inside && !g.cut && g.minH >= 56, "mise en page : " + JSON.stringify(g));   // (à 360 px la page Matières déborde de 11 px depuis AVANT : voir TH1)
      await clickOpt(page, "pastel", touch);
      assert((await cur(page)) === "pastel" && (await checked(page)).join() === "pastel", "toucher « Pastel » : " + (await cur(page)));
      assert((await waitServerTheme(u.uid, "pastel")) === "pastel", "serveur non à jour");
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

  await S("TH6", "lisibilité de la carte dans les 3 thèmes (contraste du nom et de la phrase >= 4,5) ; un thème reçu du serveur met la carte à jour", async () => {
    const { u, page } = await user({ width: 1366, height: 900 });
    await openSettings(page);
    const ratio = (page) => page.evaluate(() => {
      const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
      const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };   // normalise aussi color(srgb …) / color-mix
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const bgOf = (e) => { let n = e; const layers = []; while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.a > 0) layers.push(c); if (c.a >= 1) break; n = n.parentElement; } let base = { r: 255, g: 255, b: 255 }; for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; base = { r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a) }; } return base; };
      const cr = (e) => { const fg = rgb(getComputedStyle(e).color), bg = bgOf(e), a = lum(fg), b = lum(bg); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10; };
      const out = {}; document.querySelectorAll(".p1-theme-opt").forEach((o) => { out[o.getAttribute("data-p1-theme")] = { name: cr(o.querySelector(".p1-theme-name")), desc: cr(o.querySelector(".p1-theme-desc")) }; });
      const t = document.querySelector('.settings-card[data-setting="p1-theme"] .settings-card-title'), s = document.querySelector('.settings-card[data-setting="p1-theme"] .settings-card-sub'); out.title = cr(t); out.sub = cr(s);
      return out;
    });
    for (const t of ["light", "dark", "pastel"]) {
      await page.evaluate((x) => window.p1SetTheme(x), t); await sleep(900);
      const c = await ratio(page);
      /* « sub » = sous-titre des cartes EXISTANTES (3,4 en pastel depuis avant ce changement) : relevé, non exigé ; nos phrases et noms doivent être lisibles (>= 4,5) */
      const bad = Object.entries(c).filter(([k, v]) => (k === "title" ? v < 4.5 : k === "sub" ? false : (v.name < 4.5 || v.desc < 4.5)));
      assert(!bad.length, `contraste insuffisant en thème ${t} : ` + JSON.stringify(c));
    }
    // thème reçu du serveur (autre appareil) : la carte suit
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ theme: "pastel" }, { merge: true });
    const t0 = Date.now(); let v; while (Date.now() - t0 < 12000) { v = await cur(page); if (v === "pastel") break; await sleep(300); }
    await page.evaluate((x) => window.p1SetTheme(x), "dark"); await sleep(600);
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ theme: "light" }, { merge: true });
    const t1 = Date.now(); let w; while (Date.now() - t1 < 12000) { w = await cur(page); if (w === "light") break; await sleep(300); }
    assert(w === "light" && (await checked(page)).join() === "light", "thème reçu du serveur : data-theme = " + w + ", carte = " + (await checked(page)).join());
  });
} finally { await browser.close(); proxy.close(); server.close(); }
process.exit(report());
