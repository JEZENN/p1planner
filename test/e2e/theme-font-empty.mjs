/* Thème + police dans les Paramètres, écran vide des récapitulatifs « Tours du jour / de la semaine ». Vraie page + vrais émulateurs ;
   les réglages sont relus SUR LE SERVEUR (users/{uid}/settings/preferences).
   Formats : PC clair / sombre / pastel, iPad portrait et paysage, téléphone 390 et 360.
   Lancer : node test/e2e/theme-font-empty.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
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
const FORMATS = [
  { id: "PCclair", label: "PC clair", vp: { width: 1366, height: 900 }, theme: "light" },
  { id: "PCsombre", label: "PC sombre", vp: { width: 1366, height: 900 }, theme: "dark" },
  { id: "PCpastel", label: "PC pastel", vp: { width: 1366, height: 900 }, theme: "pastel" },
  { id: "iPadportrait", label: "iPad portrait", vp: M(820, 1180), theme: "light" },
  { id: "iPadpaysage", label: "iPad paysage", vp: M(1180, 820), theme: "light" },
  { id: "tel390", label: "téléphone 390", vp: M(390, 844), theme: "light" },
  { id: "tel360", label: "téléphone 360", vp: M(360, 780), theme: "light" },
];
/* Mesures du header de la version d'AVANT le retrait du bouton (relevées sur cette version, bouton présent) : [x, y, largeur, hauteur] */
const BASE = {
  1366: { header: 70, logo: [24, 12], avatar: [1302, 15, 40, 40] }, 820: { header: 70, logo: [24, 12], avatar: [750, 16, 38, 38] },
  1180: { header: 70, logo: [24, 12], avatar: [1116, 15, 40, 40] }, 390: { header: 70, logo: [8, 12], avatar: [338, 17, 36, 36] }, 360: { header: 70, logo: [8, 12], avatar: [308, 17, 36, 36] },
};
const OVERFLOW_360 = 360;   // (à 360 px la page « Matières » débordait de 11 px AVANT ces changements : corrigé par p1-dashboard-narrow-css)

async function user(vp, opts = {}) {
  const u = await mkUser({ courses: 1 });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (vp) await page.setViewport(vp);
  await sleep(vp && vp.isMobile ? 2500 : 400);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await clean(page);
  return { u, page };
}
const clean = async (page) => {
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {});
  await page.waitForSelector("#tpx-onb-overlay", { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock(); document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden"); });
};
const openSettings = async (page) => { await page.evaluate(() => window.openSettingsModal()); await page.waitForSelector('.settings-card[data-setting="p1-font"]', { timeout: 15000 }); await sleep(800); };
const pref = async (uid, k) => { const d = (await adb.doc(`users/${uid}/settings/preferences`).get()).data(); return d ? d[k] : null; };
const waitPref = async (uid, k, v, ms = 15000) => { const t0 = Date.now(); let x; while (Date.now() - t0 < ms) { x = await pref(uid, k); if (x === v) return x; await sleep(300); } return x; };
const attr = (page, a) => page.evaluate((n) => document.documentElement.getAttribute(n), a);
const cardOrder = (page) => page.evaluate(() => [...document.querySelectorAll(".settings-modal-body .settings-card")].map((c) => c.getAttribute("data-setting")));
const pick = async (page, sel, touch) => {
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ behavior: "instant", block: "center" }), sel); await sleep(500);
  const c = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
  await sleep(500);
};

try {
  /* ═════════════ TH1 : thème ═════════════ */
  for (const f of FORMATS) {
    await S("TH1-" + f.id, `thème (${f.label}) : en-tête sans bouton, mêmes positions et même hauteur qu'avant, carte sous « Listes personnalisables », choix enregistré, carte qui suit, rechargement`, async () => {
      const { u, page } = await user(f.vp); const touch = !!f.vp.isMobile;
      if (f.theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t), f.theme); await waitPref(u.uid, "theme", f.theme); await sleep(500); }
      const g = await page.evaluate(() => { const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
        return { toggle: !!document.getElementById("theme-toggle"), hh: r(document.getElementById("header"))[3], logo: r(document.querySelector("#header .logo")), av: r(document.getElementById("user-avatar")), sw: document.documentElement.scrollWidth, vw: innerWidth }; });
      const b = BASE[f.vp.width];
      assert(!g.toggle, "le bouton de thème est encore dans l'en-tête");
      assert(g.hh === b.header, `hauteur de l'en-tête ${g.hh} (avant : ${b.header})`);
      assert(Math.abs(g.logo[0] - b.logo[0]) <= 1 && Math.abs(g.logo[1] - b.logo[1]) <= 1, `logo ${g.logo} (avant : ${b.logo})`);
      assert(g.av.every((v, i) => Math.abs(v - b.avatar[i]) <= 1), `avatar ${g.av} (avant : ${b.avatar})`);
      assert(g.sw <= g.vw, `débordement horizontal : ${g.sw} > ${g.vw}`);
      await openSettings(page);
      const o = await cardOrder(page); const i = o.indexOf("p1-catalogs");
      assert(i >= 0 && o[i + 1] === "p1-theme", "carte Thème pas juste sous « Listes personnalisables » : " + o.join());
      const st = await page.evaluate(() => { const on = [...document.querySelectorAll(".p1-theme-opt")].filter((b) => b.getAttribute("aria-checked") === "true"); return { n: on.length, t: on[0] && on[0].getAttribute("data-p1-theme"), radios: document.querySelectorAll('.p1-theme-opt[role="radio"]').length, group: !!document.querySelector('.p1-theme-grid[role="radiogroup"]'), sub: document.querySelector('.settings-card[data-setting="p1-theme"] .settings-card-sub').textContent.trim() }; });
      assert(st.n === 1 && st.t === f.theme && st.radios === 3 && st.group, "carte au départ : " + JSON.stringify(st));
      assert(st.sub === "Choisissez l’apparence du tableur. Votre choix est gardé sur votre compte.", "phrase de la carte : " + st.sub);
      for (const t of ["light", "dark", "pastel"].filter((x) => x !== f.theme).concat(["dark"])) {
        await pick(page, `.p1-theme-opt[data-p1-theme="${t}"]`, touch);
        assert((await attr(page, "data-theme")) === t, `clic « ${t} » : data-theme = ` + (await attr(page, "data-theme")));
        assert((await page.evaluate(() => localStorage.getItem("theme"))) === t, "localStorage non à jour");
        assert((await waitPref(u.uid, "theme", t)) === t, `serveur : theme = ${await pref(u.uid, "theme")} (attendu ${t})`);
        const c = await page.evaluate(() => [...document.querySelectorAll(".p1-theme-opt")].filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.getAttribute("data-p1-theme")));
        assert(c.join() === t, "carte après le clic : " + c.join());
      }
      // re-clic sur le thème actif : rien (aucune nouvelle écriture)
      const before = await page.evaluate(() => performance.now()), w0 = (await adb.doc(`users/${u.uid}/settings/preferences`).get()).updateTime.toMillis();
      await pick(page, '.p1-theme-opt[data-p1-theme="dark"]', touch); await sleep(1500);
      const w1 = (await adb.doc(`users/${u.uid}/settings/preferences`).get()).updateTime.toMillis();
      assert(w1 === w0 && (await attr(page, "data-theme")) === "dark", "re-clic sur le thème actif : le réglage a été réécrit ou le thème a changé");
      // thème changé ailleurs : la carte suit
      await adb.doc(`users/${u.uid}/settings/preferences`).set({ theme: "pastel" }, { merge: true });
      const t0 = Date.now(); while (Date.now() - t0 < 15000 && (await attr(page, "data-theme")) !== "pastel") await sleep(300);
      const c2 = await page.evaluate(() => [...document.querySelectorAll(".p1-theme-opt")].filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.getAttribute("data-p1-theme")));
      assert((await attr(page, "data-theme")) === "pastel" && c2.join() === "pastel", "thème reçu du compte : data-theme = " + (await attr(page, "data-theme")) + ", carte = " + c2.join());
      // rechargement : thème gardé
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 }); await sleep(2500); await clean(page);
      assert((await attr(page, "data-theme")) === "pastel", "après rechargement : " + (await attr(page, "data-theme")));
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

  /* ═════════════ FN1 : police ═════════════ */
  const FONTS = { default: { body: "Space Grotesk", title: "Outfit", name: "Classique", css: null }, serif: { body: "Lora", title: "Lora", name: "Journal", css: "16px Lora" }, round: { body: "Comfortaa", title: "Comfortaa", name: "Arrondie", css: "16px Comfortaa" } };
  const fam = (s) => String(s).split(",")[0].replace(/["']/g, "").trim();
  for (const f of FORMATS) {
    await S("FN1-" + f.id, `police (${f.label}) : carte juste sous « Thème » sans description, 3 polices appliquées (corps, titres, fichier chargé, logo inchangé), enregistrées, gardées au rechargement`, async () => {
      const { u, page } = await user(f.vp); const touch = !!f.vp.isMobile;
      if (f.theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t), f.theme); await sleep(600); }
      await openSettings(page);
      const o = await cardOrder(page); const i = o.indexOf("p1-theme");
      assert(i >= 0 && o[i + 1] === "p1-font" && o[i - 1] === "p1-catalogs", "ordre des cartes : " + o.join());
      const c = await page.evaluate(() => { const card = document.querySelector('.settings-card[data-setting="p1-font"]'), opts = [...card.querySelectorAll(".p1-font-opt")];
        return { title: card.querySelector(".settings-card-title").textContent, sub: card.querySelector(".settings-card-sub").textContent.trim(), n: opts.length, names: opts.map((x) => x.querySelector(".p1-font-name").textContent), desc: !!card.querySelector(".p1-font-desc, .p1-theme-desc"), kids: opts.map((x) => x.children.length), aa: opts.map((x) => !!x.querySelector(".fp-aa")), radios: card.querySelectorAll('[role="radio"]').length, group: !!card.querySelector('[role="radiogroup"]'), checked: opts.filter((x) => x.getAttribute("aria-checked") === "true").map((x) => x.getAttribute("data-p1-font")),
          cols: getComputedStyle(card.querySelector(".p1-font-grid")).gridTemplateColumns.split(" ").length, num: opts.map((x) => getComputedStyle(x.querySelector(".fp-num")).display) }; });
      assert(c.title === "Police d’écriture" && c.sub === "Choisissez la police du tableur. Votre choix est gardé sur votre compte.", "titre / phrase : " + JSON.stringify([c.title, c.sub]));
      assert(c.n === 3 && c.names.join() === "Classique,Journal,Arrondie" && !c.desc && c.kids.every((k) => k === 3) && c.aa.every(Boolean) && c.radios === 3 && c.group && c.checked.join() === "default", "vignettes : " + JSON.stringify(c));
      assert(f.vp.width <= 560 ? (c.cols === 1 && c.num.every((d) => d === "none")) : c.cols === 3, "disposition : " + JSON.stringify([c.cols, c.num]));
      for (const k of ["serif", "round", "default", "round"]) {
        await pick(page, `.p1-font-opt[data-p1-font="${k}"]`, touch);
        const ex = FONTS[k];
        assert((await attr(page, "data-font")) === (k === "default" ? null : k), `data-font après « ${k} » : ` + (await attr(page, "data-font")));
        const r = await page.evaluate(async (css) => { if (css) await document.fonts.load(css); return { body: getComputedStyle(document.body).fontFamily, h2: getComputedStyle(document.querySelector("h2")).fontFamily, logo: getComputedStyle(document.querySelector("#header .logo")).fontFamily, ok: css ? document.fonts.check(css) : true, ls: localStorage.getItem("p1-font") }; }, ex.css);
        assert(fam(r.body) === ex.body && fam(r.h2) === ex.title && fam(r.logo) === "Outfit" && r.ok && r.ls === k, `police « ${k} » : ` + JSON.stringify(r));
        assert((await waitPref(u.uid, "font", k)) === k, `serveur : font = ${await pref(u.uid, "font")} (attendu ${k})`);
        const chk = await page.evaluate(() => [...document.querySelectorAll(".p1-font-opt")].filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.getAttribute("data-p1-font")));
        assert(chk.join() === k, "carte : " + chk.join());
      }
      // police de départ posée avant l'affichage, puis gardée au rechargement
      await pick(page, '.p1-font-opt[data-p1-font="serif"]', touch); await waitPref(u.uid, "font", "serif");
      await page.evaluateOnNewDocument(() => { document.addEventListener("DOMContentLoaded", () => { window.__fontAtDCL = document.documentElement.getAttribute("data-font"); }); });
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 }); await sleep(2000);
      const at = await page.evaluate(() => ({ dcl: window.__fontAtDCL, now: document.documentElement.getAttribute("data-font") }));
      assert(at.dcl === "serif" && at.now === "serif", "après rechargement : " + JSON.stringify(at));
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

  /* FN2 : aucune police ne fait déborder ni bouger l'en-tête, sur chaque onglet */
  for (const [label, vp] of [["PC 1366", { width: 1366, height: 900 }], ["PC 1024", { width: 1024, height: 768 }], ["iPad 820", M(820, 1180)], ["téléphone 360", M(360, 780)]]) {
    await S("FN2-" + label.replace(/\s/g, ""), `police sur chaque onglet (${label}) : 3 polices, pas pire que la police d'origine en débordement, même hauteur d'en-tête`, async () => {
      const { page } = await user(vp);
      const tabs = ["dashboard", "items", "entrainements", "planning", "stats"], base = {};
      for (const k of ["default", "serif", "round"]) {
        await page.evaluate((x) => window.p1ApplyFont(x, false), k);
        await page.evaluate(() => document.fonts.ready); await sleep(500);
        for (const t of tabs) {
          await page.evaluate((p) => document.querySelector(`[data-page="${p}"]`).click(), t); await sleep(700);
          const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, hh: Math.round(document.getElementById("header").getBoundingClientRect().height) }));
          if (k === "default") base[t] = m.sw; else assert(m.sw <= m.vw, `[${k}] onglet ${t} : scrollWidth ${m.sw} > ${m.vw} (police d'origine : ${base[t]})`);
          if (k === "default") assert(m.sw <= m.vw, `[défaut] onglet ${t} : scrollWidth ${m.sw} > ${m.vw}`);
          assert(m.hh === 70, `[${k}] onglet ${t} : hauteur de l'en-tête ${m.hh}`);
        }
      }
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

  /* FN3 : la police du compte s'applique sur un autre appareil (rien en local) */
  await S("FN3", "autre contexte de navigation sans rien en local : la police du compte s'applique", async () => {
    const { u, page } = await user({ width: 1366, height: 900 });
    await openSettings(page);
    await pick(page, '.p1-font-opt[data-p1-font="round"]', false); await waitPref(u.uid, "font", "round");
    const ctx2 = await openPage(browser, u); OPEN.push(ctx2.ctx);
    const p2 = ctx2.page; p2.setDefaultNavigationTimeout(120000);
    // on retire la police gardée en local (openPage a déjà reçu celle du compte) et on recharge : plus rien en local au départ
    await p2.evaluate(() => { localStorage.removeItem("p1-font"); });
    await p2.evaluateOnNewDocument(() => { document.addEventListener("DOMContentLoaded", () => { window.__fontAtDCL = document.documentElement.getAttribute("data-font"); }); });
    await p2.reload({ waitUntil: "load" });
    const dcl = await p2.evaluate(() => window.__fontAtDCL); assert(dcl === null, "une police était déjà posée au départ : " + dcl);
    const t0 = Date.now(); while (Date.now() - t0 < 20000 && (await attr(p2, "data-font")) !== "round") await sleep(300);
    assert((await attr(p2, "data-font")) === "round", "police du compte non appliquée : " + (await attr(p2, "data-font")));
    assert((await p2.evaluate(() => localStorage.getItem("p1-font"))) === "round", "police du compte non mémorisée localement");
  });

  /* ═════════════ HV1 : survol des boutons « + » des cartes Temps de travail et Entraînements, dans les 3 thèmes ═════════════ */
  for (const theme of ["light", "dark", "pastel"]) {
    await S("HV1-" + theme, `boutons « + » (Temps de travail, Entraînements) en thème ${theme} : au survol fond en dégradé + icône blanche + bordure effacée, retour à l'état de repos en sortant`, async () => {
      const { page } = await user({ width: 1366, height: 900 });
      await page.evaluate((t) => window.p1SetTheme(t), theme); await sleep(900);
      await page.evaluate(() => document.querySelector('[data-page="stats"]').click()); await sleep(1000);
      for (const [id, grad] of [["p1TrCardPlus", "139, 92, 246"], ["p1WsCardPlus", "245, 158, 11"]]) {
        await page.evaluate((i) => document.getElementById(i).scrollIntoView({ behavior: "instant", block: "center" }), id); await sleep(900);
        const c = await page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
        const st = () => page.evaluate((i) => { const cs = getComputedStyle(document.getElementById(i)); return { img: cs.backgroundImage, color: cs.color, bd: cs.borderTopColor }; }, id);
        await page.mouse.move(c.x + 200, c.y + 200); await sleep(500);
        const rest = await st();
        await page.mouse.move(c.x, c.y);
        let h, ok = false; const t0 = Date.now();
        while (Date.now() - t0 < 3000) { h = await st(); if (h.img.startsWith("linear-gradient") && h.color === "rgb(255, 255, 255)" && /rgba\(0, 0, 0, 0\)|transparent/.test(h.bd)) { ok = true; break; } await sleep(80); }
        assert(ok, `[${theme}] #${id} au survol : ` + JSON.stringify(h) + " (repos : " + JSON.stringify(rest) + ")");
        assert(!rest.img.startsWith("linear-gradient"), `[${theme}] #${id} au repos déjà en dégradé : ` + JSON.stringify(rest));
        await page.mouse.move(c.x + 200, c.y + 200); await sleep(600);
        const back = await st(); assert(!back.img.startsWith("linear-gradient") && back.color !== "rgb(255, 255, 255)", `[${theme}] #${id} ne revient pas au repos : ` + JSON.stringify(back));
      }
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

  /* ═════════════ FL1 : tiroir « Session Flash », aucun libellé coupé sur deux lignes, quelle que soit la police ═════════════ */
  for (const [label, vp] of [["PC 1366", { width: 1366, height: 900 }], ["iPad 820", M(820, 1180)], ["téléphone 390", M(390, 844)], ["téléphone 360", M(360, 780)]]) {
    await S("FL1-" + label.replace(/\s/g, ""), `tiroir Session Flash (${label}) : « Tout sélectionner », « Uniquement les dues », « Toutes les flashcards », « Choisir des items » sur UNE ligne avec les 3 polices, sans débordement`, async () => {
      const u = await mkUser({ courses: 2 }); const now = new Date().toISOString();
      for (const [id, item] of [["fc1", null], ["fc2", "c1"]]) await adb.doc(`users/${u.uid}/flashcards/${id}`).set({ speId: "s1", recto: "<p>Question</p>", verso: "<p>Réponse</p>", itemId: item, interval: 0, nextReview: now, lastReview: null, createdAt: now, updatedAt: now, source: "manuel" });
      const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront(); await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 500);
      await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 }); await clean(page);
      for (const font of ["default", "serif", "round"]) {
        await page.evaluate((f) => window.p1ApplyFont(f, false), font); await page.evaluate(() => document.fonts.ready); await sleep(800);
        await page.evaluate(() => window.openFlashDrawer()); await sleep(1500);
        const r = await page.evaluate(() => {
          const lines = (e) => { const rg = document.createRange(), tops = new Set(); [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).forEach((n) => { rg.selectNodeContents(n); [...rg.getClientRects()].forEach((x) => { if (x.width > 0) tops.add(Math.round(x.top / 4)); }); }); return tops.size; };
          const dr = document.getElementById("flashDrawer").getBoundingClientRect();
          const els = [document.getElementById("flashDrawerSelectAllBtn").querySelector("span"), document.getElementById("flashDrawerDueOnlyBtn"), ...document.querySelectorAll(".flash-drawer-mode-btn")];
          const btns = [document.getElementById("flashDrawerSelectAllBtn"), document.getElementById("flashDrawerDueOnlyBtn"), ...document.querySelectorAll(".flash-drawer-mode-btn")];
          const modes = [...document.querySelectorAll(".flash-drawer-mode-btn")].map((b) => Math.round(b.getBoundingClientRect().top));
          return { n: els.length, lines: els.map(lines), out: btns.some((b) => { const r = b.getBoundingClientRect(); return r.right > dr.right + 1 || r.left < dr.left - 1 || b.scrollWidth > b.clientWidth + 1; }), modes, nModes: modes.length };
        });
        assert(r.nModes >= 2, `[${font}] sous-panneau « Toutes les flashcards / Choisir des items » absent : ` + JSON.stringify(r));
        assert(r.lines.every((n) => n === 1), `[${font}] libellé coupé sur plusieurs lignes : ` + JSON.stringify(r));
        assert(!r.out, `[${font}] un bouton déborde du tiroir : ` + JSON.stringify(r));
        if (vp.width !== 360) assert(Math.abs(r.modes[0] - r.modes[1]) <= 2, `[${font}] « Toutes les flashcards » et « Choisir des items » sur deux rangées : ` + JSON.stringify(r.modes));
        await page.evaluate(() => window.closeFlashDrawer && window.closeFlashDrawer()); await sleep(700);
      }
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

  /* ═════════════ NV1 : Nouveautés — l'entrée est là, sans nouvelle notification ═════════════ */
  await S("NV1", "Nouveautés : entrée « Police et thème dans les Paramètres » en tête, sans étiquette « Cette semaine » ni émojis dans les titres ; un compte qui a déjà lu les Nouveautés ne revoit AUCUNE pastille ; la clé « vu » n'a pas changé", async () => {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ whatsNewSeen_v7: true }, { merge: true });
    const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
    await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 }); await sleep(4000); await clean(page);
    const r = await page.evaluate(() => { const s = [...document.querySelectorAll(".whats-new-modal-body .whats-new-section")][1];   // 1re entrée = « Méthode Pomodoro » (27/10) ; « Police et thème » est maintenant la 2e
      return { h: s.querySelector("h4").textContent, p: s.querySelector("p").textContent.replace(/\s+/g, " ").trim(), ic: s.querySelector(".whats-new-section-icon i").className, badge: document.getElementById("whats-new-badge").classList.contains("show"), dot: document.getElementById("avatar-whatsnew-dot").classList.contains("show"), tags: [...document.querySelectorAll(".whats-new-version-tag")].map((t) => t.textContent.trim()), titles: [...document.querySelectorAll(".whats-new-modal-body .whats-new-section h4")].map((h) => h.textContent), first: document.querySelector(".whats-new-modal-body").firstElementChild.className }; });
    assert(r.h === "Police et thème dans les Paramètres", "titre : " + r.h);
    assert(r.p === "Dans Paramètres, choisis ta police d'écriture (Classique, Journal ou Arrondie) et ton thème (clair, sombre ou pastel). Le bouton du thème n'est plus dans l'en-tête : tout se règle au même endroit, et ton choix te suit sur tous tes appareils.", "texte : " + r.p);
    assert(r.ic.includes("fa-font"), "icône : " + r.ic);
    assert(!r.tags.some((t) => /Cette semaine/.test(t)) && r.first === "whats-new-section", "l'étiquette « Cette semaine » est encore là : " + JSON.stringify([r.tags, r.first]));
    assert(r.titles.length >= 6 && r.titles.every((t) => !/\p{Extended_Pictographic}/u.test(t)), "émojis dans les titres : " + JSON.stringify(r.titles));
    assert(!r.badge && !r.dot, "une pastille de notification est apparue : " + JSON.stringify(r));
    const keys = Object.keys((await adb.doc(`users/${u.uid}/settings/preferences`).get()).data()).filter((k) => /^whatsNew/.test(k));
    assert(keys.join() === "whatsNewSeen_v7", "clés « vu » : " + keys.join());
    // ouvrir la fenêtre ne réécrit rien d'autre et la même clé reste la seule
    await page.evaluate(() => window.openWhatsNewModal && window.openWhatsNewModal()); await sleep(700);
    const vis = await page.evaluate(() => { const o = document.getElementById("whatsNewModalOverlay"); const h = o.querySelector(".whats-new-section h4").getBoundingClientRect(); return o.classList.contains("active") && h.height > 0; });
    assert(vis, "la fenêtre Nouveautés ne s'affiche pas");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  /* ═════════════ EM1 : écran vide des récapitulatifs ═════════════ */
  for (const f of FORMATS.filter((x) => ["PCclair", "PCsombre", "PCpastel", "tel390", "tel360"].includes(x.id))) {
    await S("EM1-" + f.id, `écran vide « Tours du jour » et « Tours de la semaine » (${f.label}) : nouveau dessin, ancien absent, bouton visible ; le bouton ferme la fenêtre et ouvre « Mes cours »`, async () => {
      const { page } = await user(f.vp); const touch = !!f.vp.isMobile;
      if (f.theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t), f.theme); await sleep(800); }
      for (const [kind, open, ov, title, text, icon] of [
        ["today", "openToursTodayModal", "toursTodayModalOverlay", "Aucun tour aujourd'hui", "Cochez un tour dans Mes cours : il s'affichera ici automatiquement.", "fa-rotate-right"],
        ["week", "openToursWeekModal", "toursWeekModalOverlay", "Aucun tour cette semaine", "Aucun tour sur les 7 derniers jours. Cochez un tour dans Mes cours : il s'affichera ici.", "fa-calendar-week"]]) {
        await page.evaluate((p) => { document.querySelector('[data-page="stats"]').click(); window[p](); }, open);
        await page.waitForSelector(`#${ov}.active .p1-empty`, { timeout: 10000 }); await sleep(700);
        const e = await page.evaluate((id) => { const o = document.getElementById(id), b = o.querySelector(".p1-empty-cta"), r = b.getBoundingClientRect(), m = o.querySelector(".tours-today-modal").getBoundingClientRect();
          return { old: !!o.querySelector(".tours-today-empty, .fa-mug-hot"), title: o.querySelector(".p1-empty-title").textContent, text: o.querySelector(".p1-empty-text").textContent, ico: o.querySelector(".p1-empty-ico i").className, cta: b.textContent.replace(/\s+/g, " ").trim(), arrow: !!b.querySelector(".fa-arrow-right"), list: !!b.querySelector(".fa-list-check"),
            visible: r.width > 0 && r.top >= m.top && r.bottom <= m.bottom + 1 && r.left >= 0 && r.right <= innerWidth, w: Math.round(r.width), mw: Math.round(m.width), tile: o.querySelector(".p1-empty-ico").offsetWidth, rot: getComputedStyle(o.querySelector(".p1-empty-ico")).transform, grad: getComputedStyle(b).backgroundImage.startsWith("linear-gradient") || getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)", avail: (() => { const p = o.querySelector(".p1-empty"), cs = getComputedStyle(p); return Math.round(p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)); })() }; }, ov);   // (en thème sombre --primary-gradient est un violet uni : fond plein, pas de dégradé)
        assert(!e.old, "l'ancien écran vide (tasse de café) est encore présent");
        assert(e.title === title && e.text === text && e.ico.includes(icon) && e.cta === "Mes cours" && e.arrow && e.list && e.grad && e.tile === 58 && e.rot !== "none", `[${kind}] contenu : ` + JSON.stringify(e));
        assert(e.visible, `[${kind}] bouton non visible dans la fenêtre : ` + JSON.stringify(e));
        if (f.vp.width <= 480) assert(e.w >= Math.min(320, e.avail) - 2, `[${kind}] bouton pas pleine largeur sur téléphone : ` + JSON.stringify(e));
        const c = await page.evaluate((id) => { const r = document.getElementById(id).querySelector(".p1-empty-cta").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ov);
        if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
        await sleep(1800);
        const r = await page.evaluate((id) => { const nav = document.querySelector(".app-nav").getBoundingClientRect(); return { open: document.getElementById(id).classList.contains("active") || document.getElementById(id).classList.contains("closing"), tab: document.querySelector('.app-nav-btn[data-page="items"]').classList.contains("active"), page: getComputedStyle(document.getElementById("page-items")).display, lock: getComputedStyle(document.body).overflow === "hidden", navTop: Math.round(nav.top), vh: innerHeight, cls: document.documentElement.className }; }, ov);
        assert(!r.open && r.tab && r.page !== "none" && !r.lock && r.navTop >= 0 && r.navTop < r.vh, `[${kind}] après le clic : ` + JSON.stringify(r));
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), 60); await sleep(300);
        assert((await page.evaluate(() => Math.round(window.pageYOffset))) >= 1, `[${kind}] la page ne défile plus (verrou de défilement resté)`);
      }
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }
} finally { await browser.close(); proxy.close(); server.close(); }
process.exit(report());
