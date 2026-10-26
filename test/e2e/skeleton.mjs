/* Chargement en squelette (25/10/2026) : tableur (ouverture + chargements locaux) et Compte Premium, graphique de ressenti.
   Vraie page + émulateurs ; le proxy instable (flaky-proxy) sert à retarder / couper Firestore pour LAISSER VOIR le squelette.
   Lancer : node test/e2e/skeleton.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; SKELSHOTS=1 pour les captures) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, adb, scenario, report, assert, sleep, waitFor, proxyMode, BASE } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { await proxyMode("up").catch(() => {}); while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const M = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const PC = { width: 1366, height: 900 }, TEL = M(390, 844);
const shot = async (page, name) => { if (process.env.SKELSHOTS) await page.screenshot({ path: `docs/captures-15-10/${name}.png` }); };

/* sonde posée AVANT le chargement : à chaque image, ancien écran visible ? squelette visible ? contenu cliquable sous le squelette ? */
const PROBE = () => {
  window.__sk = { loaderSeen: false, skelSeen: false, firstSkelAt: null, hitOk: true, hitChecks: 0, mainWhileSkel: false, headerAtFirst: null, t0: performance.now(), skelGone: null, presVisibleAt: null };
  (function tick() {
    const S = window.__sk, l = document.getElementById("loader");
    if (l) { const cs = getComputedStyle(l); if (cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.05) S.loaderSeen = true; }
    const sk = document.getElementById("p1-skel");
    if (sk && getComputedStyle(sk).display !== "none") {
      S.skelSeen = true;
      if (S.firstSkelAt == null) { S.firstSkelAt = Math.round(performance.now() - S.t0); const h = document.querySelector(".header"); S.headerAtFirst = h ? Math.round(h.getBoundingClientRect().height) : 0; }
      const card = sk.querySelector(".p1-sk-card") || sk; const r = card.getBoundingClientRect();
      const e = document.elementFromPoint(Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), Math.min(innerHeight - 2, Math.max(2, r.top + Math.min(r.height / 2, 60))));
      S.hitChecks++; if (!(e && e.closest("#p1-skel, .img-lightbox-scroll"))) { S.hitOk = false; S.hitBad = S.hitBad || ((e && (e.id || e.className)) + " @" + Math.round(r.left + r.width / 2) + "," + Math.round(r.top) + " t=" + Math.round(performance.now() - S.t0)); }
      const m = document.getElementById("main-content"); if (m && getComputedStyle(m).display !== "none") S.mainWhileSkel = true;
    } else if (S.skelSeen && S.skelGone == null) S.skelGone = Math.round(performance.now() - S.t0);
    const p = document.getElementById("presentation-section"); if (p && S.presVisibleAt == null && getComputedStyle(p).display !== "none" && p.getBoundingClientRect().height > 50) S.presVisibleAt = Math.round(performance.now() - S.t0);
    requestAnimationFrame(tick);
  })();
};
/* Compte Premium : la silhouette ne reste visible que quelques dizaines de ms avant la page « compte » → on la mesure à la première image où elle est affichée */
const PREM_PROBE = () => {
  (function tick() {
    const s = document.getElementById("stateLoading");
    if (s && !window.__pskel) {
      const r = s.getBoundingClientRect();
      if (r.height > 100 && s.querySelector(".account-row") && s.querySelector(".account-row").getBoundingClientRect().height > 0) {
        const m = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top + scrollY, left: b.left, width: b.width, height: b.height }; };
        window.__pskel = { acc: m(s.querySelector(".account-row")), hero: m(s.querySelector(".status-hero")), left: m(s.querySelector(".status-hero-left")), right: m(s.querySelector(".status-hero-right")) };
        window.__pskelShot = true;
      }
    }
    requestAnimationFrame(tick);
  })();
};
async function newUserPage(vp, { theme = "light", courses = 3, signIn = true } = {}) {
  const u = await mkUser({ courses });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...(theme !== "light" ? { theme } : {}) }, { merge: true });
  const ctx = await browser.createBrowserContext(); OPEN.push(ctx); const page = await ctx.newPage();
  page.__errors = []; page.on("pageerror", (e) => page.__errors.push(String(e.message || e))); page.setDefaultNavigationTimeout(120000);
  await page.setViewport(vp);
  await page.goto(BASE + "/tableur.html", { waitUntil: "load" });
  if (signIn) {
    await page.waitForFunction(() => window.__authApi && window.__auth, { timeout: 30000 });
    await page.evaluate(async (e, p) => { await window.__authApi.signInWithEmailAndPassword(window.__auth, e, p); }, u.email, u.password);
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0 && window.firebaseDataLoaded !== false, { timeout: 40000 });
    await sleep(1200);
    await page.evaluate((t) => { try { localStorage.setItem("theme", t); } catch (e) {} }, theme);
  }
  return { u, page };
}
const skelGone = (page, ms = 30000) => page.waitForFunction(() => !document.documentElement.classList.contains("p1-skel") && !document.getElementById("p1-skel"), { timeout: ms });
const pillCheck = (page) => page.evaluate(() => { const p = document.querySelector(".app-nav-pill"), b = document.querySelector(".app-nav-btn.active"); if (!p || !b) return { ok: false, why: "pastille ou onglet actif introuvable" }; const pr = p.getBoundingClientRect(), br = b.getBoundingClientRect(); return { ok: Math.abs(pr.left - br.left) <= 2 && Math.abs(pr.width - br.width) <= 2 && parseFloat(getComputedStyle(p).opacity) >= 0.99, dl: pr.left - br.left, dw: pr.width - br.width, op: getComputedStyle(p).opacity }; });

try {
  /* ═════════ SK1 : ouverture du tableur ═════════ */
  for (const [id, vp, th, label] of [["pc-clair", PC, "light", "PC clair"], ["pc-sombre", PC, "dark", "PC sombre"], ["tel-clair", TEL, "light", "téléphone clair"], ["tel-sombre", TEL, "dark", "téléphone sombre"]]) {
    await S("SK1-" + id, `ouverture du tableur, rechargement (${label}) : en-tête + squelette immédiats, ancien écran jamais visible, contenu non cliquable, squelette retiré aux données, pastille de l'onglet actif alignée`, async () => {
      const { u, page } = await newUserPage(vp, { theme: th });
      await page.evaluateOnNewDocument(PROBE);
      await proxyMode("slow", 1200);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__sk && window.__sk.skelSeen, { timeout: 15000 });
      await sleep(500);
      await shot(page, `squelette-tableur-${id}-chargement`);
      const mid = await page.evaluate(() => ({ cards: document.querySelectorAll("#p1-skel .p1-sk-card").length, pills: document.querySelectorAll("#p1-skel .p1-sk-navbar > .p1-sk").length, on: [...document.querySelectorAll("#p1-skel .p1-sk-navbar > .p1-sk")].findIndex((e) => e.classList.contains("on")), tabs: document.querySelectorAll(".app-nav .app-nav-btn").length, realActive: [...document.querySelectorAll(".app-nav .app-nav-btn")].findIndex((e) => e.classList.contains("active")) }));
      assert(mid.cards === 8 || (vp.isMobile && mid.cards >= 3), "cartes du squelette : " + mid.cards);
      assert(mid.pills === mid.tabs && mid.on === mid.realActive, `pastilles du squelette (${mid.pills}, actif ${mid.on}) ≠ onglets réels (${mid.tabs}, actif ${mid.realActive})`);
      await proxyMode("up");
      await skelGone(page);
      await sleep(900);
      await shot(page, `squelette-tableur-${id}-charge`);
      const S = await page.evaluate(() => window.__sk);
      assert(S.skelSeen && S.firstSkelAt < 1500, `squelette absent ou tardif (${S.firstSkelAt} ms)`);
      assert(S.headerAtFirst > 40, "en-tête non affiché avec le squelette : " + S.headerAtFirst);
      assert(!S.loaderSeen, "l'ancien écran « logo + rond » a été visible");
      assert(S.hitOk && S.hitChecks > 20, `le contenu n'est pas masqué / cliquable sous le squelette (${S.hitChecks} mesures ; 1er écart : ${S.hitBad})`);
      assert(!S.mainWhileSkel, "le contenu réel était affiché pendant le squelette");
      assert(await page.evaluate(() => !document.getElementById("p1-skel") && document.getElementById("loader") && getComputedStyle(document.getElementById("loader")).display === "none"), "squelette non retiré ou ancien écran affiché");
      const p = await pillCheck(page); assert(p.ok, "pastille de l'onglet actif mal placée : " + JSON.stringify(p));
      assert(await page.evaluate(() => document.querySelectorAll(".specialty-card").length > 0), "données absentes après le squelette");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  await S("SK2", "réseau qui ne répond jamais (Firestore suspendu, aucun cache local, session connue) : le squelette ne reste jamais plus de 16 s ; ancien écran jamais visible", async () => {
    const { page } = await newUserPage(PC);   // session créée, puis on efface le cache local Firestore (la session reste)
    await page.goto(BASE + "/p1-premium-status.js", { waitUntil: "load" });
    await page.evaluate(async () => { const dbs = await indexedDB.databases(); await Promise.all(dbs.filter((d) => /firestore/i.test(d.name || "")).map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r(); }))); });
    await page.evaluateOnNewDocument(PROBE);
    await proxyMode("slow", 60000);   // Firestore ne répond jamais (requêtes suspendues)
    const t0 = Date.now();
    await page.goto(BASE + "/tableur.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__sk && window.__sk.skelSeen, { timeout: 15000 });
    await skelGone(page, 25000);
    const dt = Date.now() - t0;
    const S = await page.evaluate(() => window.__sk);
    assert(dt <= 16500, "squelette resté " + dt + " ms");
    assert(dt >= 8000, "squelette retiré trop tôt (" + dt + " ms) : le filet doit attendre jusqu'à 15 s quand les données n'arrivent pas");
    assert(!S.loaderSeen, "ancien écran visible");
    console.log("    (squelette retiré après " + dt + " ms, données jamais arrivées)");
  });

  await S("SK3", "déconnecté : la présentation s'affiche en moins de 3 s, sans squelette durable ni ancien écran", async () => {
    const ctx = await browser.createBrowserContext(); OPEN.push(ctx); const page = await ctx.newPage(); page.setDefaultNavigationTimeout(120000);
    await page.setViewport(PC);
    await page.evaluateOnNewDocument(PROBE);
    await page.goto(BASE + "/tableur.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__sk && window.__sk.presVisibleAt != null, { timeout: 8000 });
    const S = await page.evaluate(() => window.__sk);
    assert(S.presVisibleAt < 3000, "présentation visible après " + S.presVisibleAt + " ms");
    assert(!S.loaderSeen, "ancien écran visible");
    assert(!(await page.evaluate(() => document.documentElement.classList.contains("p1-skel"))), "squelette toujours actif");
    await shot(page, "squelette-tableur-deconnecte");
  });

  /* ═════════ SK4 : géométrie du squelette = vraie page ═════════ */
  for (const [w, mobile] of [[390, true], [820, true], [1180, false], [1366, false], [1920, false]]) {
    await S("SK4-" + w, `géométrie à ${w} px : même nombre de colonnes, barre d'onglets à ±14 px, grille à ±48 px`, async () => {
      const vp = mobile ? M(w, w < 500 ? 844 : 1180) : { width: w, height: 1000 };
      const { page } = await newUserPage(vp);
      const meas = (sk) => page.evaluate((sk) => {
        const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; };
        if (sk) { const g = document.querySelector(".p1-sk-grid"); return { cols: getComputedStyle(g).gridTemplateColumns.split(" ").length, nav: r(document.querySelector(".p1-sk-navbar")), grid: r(g), todo: r(document.querySelector(".p1-sk-todo")) }; }
        const g = document.querySelector(".specialties-grid"); const nav = document.querySelector(".app-nav");
        const btn = document.querySelector(".app-nav-btn"); const bar = btn.parentElement;
        return { cols: getComputedStyle(g).gridTemplateColumns.split(" ").length, nav: r(nav), grid: r(g), bar: r(bar) };
      }, sk);
      await proxyMode("slow", 60000);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => { const s = document.getElementById("p1-skel"); return s && getComputedStyle(s).display !== "none"; }, { timeout: 15000 });
      await sleep(700);
      const a = await meas(true);
      await proxyMode("up");
      await page.reload({ waitUntil: "load" });
      await skelGone(page); await sleep(900);
      const b = await meas(false);
      assert(a.cols === b.cols, `colonnes : squelette ${a.cols}, réel ${b.cols}`);
      assert(Math.abs(a.nav.height - b.nav.height) <= 14 && Math.abs(a.nav.top - b.nav.top) <= 14, `barre d'onglets : squelette ${Math.round(a.nav.top)}+${Math.round(a.nav.height)}, réelle ${Math.round(b.nav.top)}+${Math.round(b.nav.height)}`);
      assert(Math.abs(a.grid.top - b.grid.top) <= 48 && Math.abs(a.grid.left - b.grid.left) <= 48, `grille : squelette (${Math.round(a.grid.left)},${Math.round(a.grid.top)}), réelle (${Math.round(b.grid.left)},${Math.round(b.grid.top)})`);
      console.log(`    (${w} px : colonnes ${a.cols}/${b.cols} ; barre ${Math.round(a.nav.height)}/${Math.round(b.nav.height)} ; haut de grille ${Math.round(a.grid.top)}/${Math.round(b.grid.top)})`);
    });
  }

  /* ═════════ SK8 : barre de navigation du squelette = 5 cases + case « Révisions J » (si activée) + case « Programme de la journée », à toutes les largeurs ═════════ */
  for (const jOn of [true, false]) {
    await S("SK8-" + (jOn ? "avec-J" : "sans-J"), `barre de navigation du squelette (${jOn ? "Méthode des J activée : 5 cases + case J + case To-do" : "Méthode des J désactivée : 5 cases + case To-do, pas de case J"}) : mêmes positions et largeurs que les vrais boutons de 320 à 1920 px (iPad et téléphone compris)`, async () => {
      const { u, page } = await newUserPage(PC);
      await page.evaluate((uid, on) => { try { if (on) localStorage.setItem("jMethodEnabled__" + uid, "1"); else localStorage.removeItem("jMethodEnabled__" + uid); } catch (e) {} }, u.uid, jOn);
      const WIDTHS = [1920, 1366, 1024, 820, 700, 600, 480, 420, 390, 360, 320];
      const rects = (sk) => page.evaluate((sk) => {
        const r = (e) => { if (!e || getComputedStyle(e).display === "none") return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top + scrollY, width: b.width, height: b.height }; };
        if (sk) return { cells: document.querySelectorAll("#p1-skel .p1-sk-navbar > .p1-sk").length, nav: r(document.querySelector("#p1-skel .p1-sk-navbar")), j: r(document.querySelector("#p1-skel .p1-sk-j")), todo: r(document.querySelector("#p1-skel .p1-sk-todo")) };
        return { cells: document.querySelectorAll(".app-nav .app-nav-btn").length, nav: r(document.querySelector(".app-nav")), j: r(document.querySelector("#global-jrev-btn")), todo: r(document.querySelector("#global-todo-btn")) };
      }, sk);
      await proxyMode("slow", 60000);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => { const s = document.getElementById("p1-skel"); return s && getComputedStyle(s).display !== "none"; }, { timeout: 15000 });
      const SK = {};
      for (const w of WIDTHS) { await page.setViewport({ width: w, height: 900 }); await sleep(250); SK[w] = await rects(true); }
      for (const w of [390, 820, 1366]) { await page.setViewport({ width: w, height: 700 }); await sleep(200); await shot(page, "squelette-nav-" + (jOn ? "avec-J" : "sans-J") + "-" + w); }
      await proxyMode("up");
      await page.setViewport({ width: 1366, height: 900 });
      await skelGone(page, 40000); await sleep(900);
      const bad = [];
      for (const w of WIDTHS) {
        await page.setViewport({ width: w, height: 900 }); await sleep(450);
        const R = await rects(false), K = SK[w];
        if (K.cells !== 5 || R.cells !== 5) bad.push(`${w}: cases de la barre ${K.cells} (réel ${R.cells})`);
        if (!!K.j !== jOn || !!R.j !== jOn) bad.push(`${w}: case J ${!!K.j} / réelle ${!!R.j} (attendu ${jOn})`);
        if (!K.todo || !R.todo) { bad.push(`${w}: case To-do absente`); continue; }
        const d = (n, a, b, t) => { if (Math.abs(a - b) > t) bad.push(`${w}: ${n} ${Math.round(a)} / réel ${Math.round(b)}`); };
        d("barre largeur", K.nav.width, R.nav.width, 8); d("barre gauche", K.nav.left, R.nav.left, 10); d("barre haut", K.nav.top, R.nav.top, 14); d("barre hauteur", K.nav.height, R.nav.height, 6);
        d("To-do largeur", K.todo.width, R.todo.width, 6); d("To-do gauche", K.todo.left, R.todo.left, 10); d("To-do hauteur", K.todo.height, R.todo.height, 6);
        if (jOn) { d("J largeur", K.j.width, R.j.width, 6); d("J gauche", K.j.left, R.j.left, 10); d("J hauteur", K.j.height, R.j.height, 6); }
      }
      assert(!bad.length, bad.join(" ; "));
    });
  }

  /* ═════════ SK5 : chargements locaux ═════════ */
  const watch = (page) => page.evaluate(() => {
    window.__skl = { kinds: {}, spinners: [], editable: [], pe: [] };
    const WATCH = "#notesEditorArea, #trainNotesEditor, #speNotesEditor, #oicList, #flashDrawerList, #notesFlashPanel, .friends-list, #notesShareFriendsList";
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      const sk = n.matches(".p1-skl") ? n : n.querySelector(".p1-skl");
      if (sk) { const host = sk.closest(WATCH); const kind = [...sk.classList].find((c) => /^p1-skl-(editor|list|flash|oic)$/.test(c)); (window.__skl.kinds[kind] = window.__skl.kinds[kind] || []).push(host ? (host.id || host.className) : "?"); window.__skl.editable.push(sk.getAttribute("contenteditable")); window.__skl.pe.push(getComputedStyle(sk).pointerEvents); }
      const sp = n.matches(".fa-spinner") ? n : n.querySelector(".fa-spinner"); if (sp && sp.closest(WATCH)) window.__skl.spinners.push((sp.closest(WATCH).id || "?"));
    } }).observe(document.body, { childList: true, subtree: true });
  });
  const sk5 = (id, label, openFn, selector, kind, extra) => S("SK5-" + id, `${label} avec un réseau lent (~1 s par requête) : squelette visible, jamais de rond qui tourne, ni éditable ni cliquable, puis le vrai contenu`, async () => {
    const { page } = await newUserPage(PC, { courses: 1 });
    await adb.doc(`users/${(await page.evaluate(() => window.currentUser.uid))}/trainingItems/1001`).set({ id: 1001, titre: "QCM 1001", title: "QCM 1001", type: "colle", matiere: "s1", plat: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() });
    await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
    if (id === "entrainement") await waitFor(() => page.evaluate(() => (window.userData.trainings || []).length === 1), { timeout: 20000 });
    await watch(page);
    await proxyMode("slow", 1000);
    await page.evaluate(openFn);
    await sleep(900);
    await shot(page, `squelette-local-${id}`);
    // le réseau reste lent : on attend (40 s max) que le vrai contenu remplace le squelette, puis encore 2 s (le panneau des flashcards d'un cours se charge APRÈS la note)
    await waitFor(() => page.evaluate((sel) => { const e = document.querySelector(sel); return !!e && !e.querySelector(".p1-skl") && (!document.querySelector("#notesModalOverlay.active") || !document.querySelector("#oicList .p1-skl")); }, selector || "body"), { timeout: 40000, every: 300 });
    await sleep(2000);
    await proxyMode("up");
    const s2 = await page.evaluate(() => window.__skl);
    assert(s2.kinds[kind] && s2.kinds[kind].length >= 1, `squelette « ${kind} » jamais vu (${JSON.stringify(s2.kinds)})`);
    assert(s2.spinners.length === 0, "rond qui tourne vu dans : " + s2.spinners.join(","));
    assert(s2.editable.every((v) => v === "false") && s2.pe.every((v) => v === "none"), "squelette éditable ou cliquable : " + JSON.stringify({ e: s2.editable, p: s2.pe }));
    if (selector) {
      const fin = await page.evaluate((sel) => { const e = document.querySelector(sel); return e ? { skl: !!e.querySelector(".p1-skl"), ce: e.getAttribute("contenteditable") } : null; }, selector);
      assert(fin && !fin.skl, "squelette toujours là après le chargement : " + JSON.stringify(fin));
      if (extra === "editable") assert(fin.ce === "true", "l'éditeur n'est pas redevenu éditable : " + fin.ce);
    }
  });
  await sk5("notes-cours", "notes d'un cours", () => window.openNotesModal(1, "s1", "c1", "Cours1"), "#notesEditorArea", "p1-skl-editor", "editable");
  await sk5("entrainement", "notes d'un entraînement", () => window._openTrainNotes(1001), "#trainNotesEditor", "p1-skl-editor", "editable");
  await sk5("cahier", "cahier d'erreurs", () => window.openSpeErrModal("s1"), "#speNotesEditor", "p1-skl-editor", "editable");
  await sk5("flash-notes", "panneau flashcards des notes", () => window.openNotesModal(1, "s1", "c1", "Cours1"), "#oicList", "p1-skl-flash", null);
  await sk5("flashcards", "liste des flashcards", () => window.openFlashDrawer(), "#flashDrawerList", "p1-skl-flash", null);

  /* ═════════ SK6 : Compte Premium ═════════ */
  for (const [id, vp, dark, label] of [["pc-clair", PC, false, "PC clair"], ["pc-sombre", PC, true, "PC sombre"], ["ipad", M(820, 1180), false, "iPad 820"], ["tel", TEL, false, "téléphone 390"]]) {
    await S("SK6-" + id, `Compte Premium (${label}) : silhouette aux mêmes positions que la vraie page, puis vraie page ; parrainage sans « Chargement… »`, async () => {
      const u = await mkUser({ courses: 0 });
      const ts = (d) => new Date(Date.now() + d * 864e5);
      await adb.doc(`entitlements/${u.uid}`).set({ status: "trial", trialStartedAt: new Date(Date.now() - 2 * 864e5), trialEndsAt: ts(13), writeAccessUntil: ts(13), premiumUntil: null, planType: null });
      const ctx = await browser.createBrowserContext(); OPEN.push(ctx); const page = await ctx.newPage(); page.setDefaultNavigationTimeout(120000);
      page.__errors = []; page.on("pageerror", (e) => page.__errors.push(String(e.message || e)));
      await page.setViewport(vp);
      if (dark) await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
      await page.goto(`${BASE}/auth.html?redirect=${encodeURIComponent("/comptepremium.html")}`, { waitUntil: "load" });
      await page.waitForSelector("#loginEmail"); await page.type("#loginEmail", u.email); await page.type("#loginPassword", u.password);
      await page.evaluateOnNewDocument(PREM_PROBE);
      await proxyMode("slow", 3500);   // Firestore lent : on voit la silhouette pendant le chargement du compte
      await page.click("#btnLogin");
      await page.waitForFunction(() => location.pathname.endsWith("/comptepremium.html"), { timeout: 30000 });
      await page.waitForFunction(() => window.__pskel, { timeout: 15000 });
      const meas = () => page.evaluate(() => { const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top + scrollY, left: b.left, width: b.width, height: b.height }; }; const root = (document.getElementById("stateLoading").style.display !== "none" ? document.getElementById("stateLoading") : document.getElementById("stateAccount")); return { acc: r(root.querySelector(".account-row")), hero: r(root.querySelector(".status-hero")), left: r(root.querySelector(".status-hero-left")), right: r(root.querySelector(".status-hero-right")) }; });
      const sk = await page.evaluate(() => window.__pskel);
      await proxyMode("up");
      await page.waitForFunction(() => { const a = document.getElementById("stateAccount"); return a && a.style.display !== "none"; }, { timeout: 40000 });
      await sleep(900);
      await shot(page, `squelette-premium-${id}-charge`);
      if (process.env.SKELSHOTS) { await page.evaluate(() => { document.getElementById("stateAccount").style.display = "none"; document.getElementById("stateLoading").style.display = ""; }); await sleep(300); await shot(page, `squelette-premium-${id}-chargement`); await page.evaluate(() => { document.getElementById("stateLoading").style.display = "none"; document.getElementById("stateAccount").style.display = ""; }); }
      const real = await meas();
      console.log("    (" + id + " : compte " + Math.round(sk.acc.top) + "+" + Math.round(sk.acc.height) + " / " + Math.round(real.acc.top) + "+" + Math.round(real.acc.height) + " ; bandeau " + Math.round(sk.hero.top) + "+" + Math.round(sk.hero.height) + " / " + Math.round(real.hero.top) + "+" + Math.round(real.hero.height) + " ; gauche " + Math.round(sk.left.height) + "/" + Math.round(real.left.height) + " ; droite " + Math.round(sk.right.height) + "/" + Math.round(real.right.height) + ")");
      const tol = (a, b, n, t) => assert(Math.abs(a - b) <= t, `${n} : squelette ${Math.round(a)}, réel ${Math.round(b)} (±${t})`);
      tol(sk.acc.top, real.acc.top, "haut de la carte compte", 6); tol(sk.acc.height, real.acc.height, "hauteur de la carte compte", 6);
      tol(sk.hero.top, real.hero.top, "haut du bandeau de statut", 8); tol(sk.hero.height, real.hero.height, "hauteur du bandeau de statut", 8);
      tol(sk.acc.width, real.acc.width, "largeur de la carte compte", 2);
      const ref = await page.evaluate(() => { const i = document.getElementById("referralLinkInput"); return i ? { v: i.value, vis: getComputedStyle(document.getElementById("referralSection")).display } : null; });
      assert(ref && !/Chargement/.test(ref.v), "parrainage : « " + (ref && ref.v) + " »");
      assert(await page.evaluate(() => !document.querySelector("#stateAccount .skeleton")), "barre de squelette restée dans la page chargée");
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ SK7 : point du graphique de ressenti au maximum ═════════ */
  await S("SK7", "graphique de ressenti : le point à la note maximale n'est pas rogné (au repos et au survol) — marge au-dessus de la zone de tracé ≥ rayon + bordure", async () => {
    const { u, page } = await newUserPage(PC, { courses: 1 });
    const iso = new Date().toISOString();
    await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: [5], tourDates: [iso], tourDurations: ["1:00"], tourSupports: [null], tourCount: 1 }, { merge: true });
    await sleep(1500);
    await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); });
    await page.evaluate(() => document.querySelector('[data-page="stats"]').click()); await waitFor(() => page.evaluate(() => !!(window.Chart && Chart.getChart(document.getElementById("chart-feeling-weekly")))), { timeout: 20000 }); await sleep(1500);
    const g = await page.evaluate(() => {
      const ch = (window.Chart && Chart.getChart) ? Chart.getChart(document.getElementById("chart-feeling-weekly")) : null;
      if (!ch) return { err: "graphique introuvable" };
      const ds = ch.data.datasets[0]; const ca = ch.chartArea, ymax = ch.scales.y.max;
      return { top: ca.top, bottom: ca.bottom, ymax, vals: ds.data, clip: ds.clip, r: ds.pointRadius, hr: ds.pointHoverRadius, bw: ds.pointBorderWidth, hbw: ds.pointHoverBorderWidth };
    });
    assert(!g.err, g.err);
    const need = g.hr + g.hbw;   // 7 + 3 = 10 px au-dessus du centre au survol
    assert(g.clip === false, "clip du jeu de données : " + g.clip);
    assert(g.top >= need - 0.5, `marge au-dessus de la zone de tracé : ${g.top.toFixed(1)} px < ${need} px (point rogné par le canevas)`);
    // mesure AUX PIXELS du canevas (infobulle désactivée) : le point à la note maximale dépasse au-dessus de chartArea.top ET n'est pas rogné par le bord du canevas, au repos et au survol
    const px = await page.evaluate(() => {
      const ch = Chart.getChart(document.getElementById("chart-feeling-weekly"));
      ch.options.plugins.tooltip.enabled = false; ch.update("none");
      const idx = ch.data.datasets[0].data.findIndex((v) => v === ch.scales.y.max);
      if (idx < 0) return { err: "aucun jour à la note maximale (" + JSON.stringify(ch.data.datasets[0].data) + ")" };
      const pt = ch.getDatasetMeta(0).data[idx], dpr = ch.currentDevicePixelRatio || window.devicePixelRatio || 1, ca = ch.chartArea;
      const scan = () => {
        const cv = ch.canvas, g = cv.getContext("2d"), W = cv.width, H = cv.height;
        const x0 = Math.max(0, Math.floor((pt.x - 16) * dpr)), x1 = Math.min(W, Math.ceil((pt.x + 16) * dpr));
        const d = g.getImageData(x0, 0, x1 - x0, H).data; const rows = [];
        for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < x1 - x0; x++) if (d[(y * (x1 - x0) + x) * 4 + 3] > 40) n++; rows.push(n); }
        const cy = Math.round(pt.y * dpr), top = Math.round(ca.top * dpr);
        // lignes occupées par le point : celles proches de son centre, groupées
        let a = cy; while (a > 0 && rows[a - 1] > 2) a--; let b = cy; while (b < H - 1 && rows[b + 1] > 2) b++;
        return { firstRowOpaque: rows[0] > 0, spanTop: a / dpr, spanBottom: b / dpr, centre: pt.y, above: (pt.y - a / dpr), below: (b / dpr - pt.y), areaTop: ca.top };
      };
      const rest = scan();
      ch.setActiveElements([{ datasetIndex: 0, index: idx }]); ch.update("none");
      const hover = scan();
      ch.setActiveElements([]); ch.update("none");
      return { rest, hover };
    });
    assert(!px.err, px.err);
    for (const k of ["rest", "hover"]) {
      assert(!px[k].firstRowOpaque, "point rogné par le haut du canevas (" + k + ")");
      assert(px[k].above >= px[k].below - 1.5, `point rogné (${k}) : ${px[k].above.toFixed(1)} px au-dessus du centre, ${px[k].below.toFixed(1)} px en dessous`);
    }
    console.log(`    (pixels : au repos ${px.rest.above.toFixed(1)} / ${px.rest.below.toFixed(1)} px au-dessus / en dessous du centre ; au survol ${px.hover.above.toFixed(1)} / ${px.hover.below.toFixed(1)})`);
    console.log(`    (zone de tracé à ${g.top.toFixed(1)} px du haut du canevas ; besoin ${need} px ; max de l'axe ${g.ymax})`);
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
