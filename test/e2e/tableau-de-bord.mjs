/* « Statistiques » → « Tableau de bord » ; « Stats du jour / des 7 derniers jours / générales » → « Ma journée de travail / Ma semaine de travail / Mon année en bref » (25/10/2026).
   Vraie page + émulateurs. Vérifie le nouveau nom partout (onglet, titres, fenêtres d'aide, formulaire d'avis) ET que rien ne déborde ni ne prend plus de place
   (barre d'onglets, titres sur une ligne), de 320 à 1920 px, avec et sans la Méthode des J.
   Lancer : node test/e2e/tableau-de-bord.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const WIDTHS = [1920, 1366, 1180, 1024, 820, 768, 700, 600, 480, 420, 390, 360, 320];
const NEW = ["Ma journée de travail", "Ma semaine de travail", "Mon année en bref"];
const OLD = /Stats du Jour|Stats des (5|7) derniers jours|Stats générales|Statistiques (Quotidiennes|hebdomadaires|Générales)/i;
/* hauteur de la barre d'onglets AVANT le renommage (mesurée sur la version d'avant, mêmes largeurs) */
const NAVH = (w) => (w > 1366 ? 65 : w > 768 ? 62 : w >= 600 ? 76 : 68);

async function open(theme = "light") {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000);
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(400); }
  return { u, page };
}

try {
  for (const jOn of [false, true]) {
    await S("TB1-" + (jOn ? "avec-J" : "sans-J"), `onglet « Tableau de bord » (${jOn ? "avec" : "sans"} Méthode des J) de 320 à 1920 px : bon libellé, rien ne déborde, barre d'onglets de la MÊME hauteur qu'avant, pas de défilement horizontal`, async () => {
      const { u, page } = await open();
      await page.evaluate((uid, on) => { try { if (on) localStorage.setItem("jMethodEnabled__" + uid, "1"); else localStorage.removeItem("jMethodEnabled__" + uid); } catch (e) {} if (window.refreshJMethodUI) window.refreshJMethodUI(); }, u.uid, jOn);
      await sleep(600);
      const bad = [];
      for (const w of WIDTHS) {
        await page.setViewport({ width: w, height: 900 }); await sleep(450);
        const r = await page.evaluate(() => {
          const nav = document.querySelector(".app-nav"), btn = document.querySelector('.app-nav-btn[data-page="stats"]'), sp = btn.querySelector("span");
          const nb = nav.getBoundingClientRect(), spCs = getComputedStyle(sp);
          const btns = [...nav.querySelectorAll(".app-nav-btn")].map((b) => { const s = b.querySelector("span"), cs = getComputedStyle(s); return { shown: cs.display !== "none" && s.getBoundingClientRect().width > 0, clipped: cs.display !== "none" && s.scrollWidth > s.clientWidth + 1, over: b.scrollWidth > b.clientWidth + 1 }; });
          return { txt: sp.textContent.trim(), shown: spCs.display !== "none" && sp.getBoundingClientRect().width > 0, navH: nb.height, navOver: nav.scrollWidth > nav.clientWidth + 1, pageOver: document.documentElement.scrollWidth > innerWidth + 1, btns, labelsHidden: btns.filter((b) => !b.shown).length };
        });
        if (r.txt !== "Tableau de bord") bad.push(`${w}: libellé « ${r.txt} »`);
        if (r.navOver) bad.push(`${w}: la barre d'onglets déborde`);
        if (r.pageOver) bad.push(`${w}: défilement horizontal de la page`);
        if (r.btns.some((b) => b.clipped || b.over)) bad.push(`${w}: un onglet rogne son texte`);
        if (Math.abs(r.navH - NAVH(w)) > 1.5) bad.push(`${w}: hauteur de la barre ${r.navH.toFixed(1)} (avant : ${NAVH(w)})`);
      }
      assert(!bad.length, bad.join(" ; "));
    });
  }

  await S("TB2", "titres de la page (« Ma journée de travail », « Ma semaine de travail », « Mon année en bref ») : présents, anciens absents, UNE seule ligne avec leur « ? », sans débordement, de 320 à 1920 px", async () => {
    const { page } = await open();
    await page.evaluate(() => document.querySelector('[data-page="stats"]').click()); await sleep(1500);
    const bad = [];
    for (const w of [1920, 1366, 820, 600, 480, 390, 360, 320]) {
      await page.setViewport({ width: w, height: 900 }); await sleep(450);
      const r = await page.evaluate(() => {
        const out = {}; for (const k of ["daily", "weekly", "general"]) { const e = document.querySelector(".stats-section-title." + k); const b = e.getBoundingClientRect(); const q = e.querySelector(".help-icon").getBoundingClientRect(); const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.4; out[k] = { txt: e.textContent.replace(/\\s+/g, " ").replace("?", "").trim(), h: b.height, w: b.width, over: e.scrollWidth > e.clientWidth + 1, helpIn: q.right <= b.right + 1 && q.left >= b.left - 1, lh }; }
        return { t: out, pageOver: document.documentElement.scrollWidth > innerWidth + 1, text: document.querySelector("#page-stats").innerText };
      });
      for (const [i, k] of ["daily", "weekly", "general"].entries()) {
        const x = r.t[k];
        if (x.txt !== NEW[i]) bad.push(`${w}: titre ${k} « ${x.txt} »`);
        if (x.over || !x.helpIn) bad.push(`${w}: titre ${k} déborde`);
        if (x.h > x.lh * 2.2 + 24) bad.push(`${w}: titre ${k} sur plusieurs lignes (${Math.round(x.h)} px)`);
      }
      if (OLD.test(r.text)) bad.push(`${w}: ancien titre encore présent : ${(r.text.match(OLD) || [])[0]}`);
      if (r.pageOver) bad.push(`${w}: défilement horizontal`);
    }
    assert(!bad.length, bad.join(" ; "));
  });

  await S("TB3", "fenêtres d'aide « ? » des trois sections : nouveaux titres, anciens absents, titre qui ne déborde pas sur téléphone", async () => {
    const { page } = await open();
    await page.evaluate(() => document.querySelector('[data-page="stats"]').click()); await sleep(1200);
    const bad = [];
    for (const w of [1366, 390, 360, 320]) {
      await page.setViewport({ width: w, height: 800 }); await sleep(400);
      for (const [id, exp] of [["stats-daily", NEW[0]], ["stats-weekly", NEW[1]], ["stats-general", NEW[2]]]) {
        await page.evaluate((i) => openHelpModal(i), id); await sleep(500);
        const r = await page.evaluate(() => { const t = document.getElementById("helpModalTitle"), ov = document.getElementById("helpModalOverlay"), box = ov.querySelector(".help-modal-inner, .help-modal") || ov.firstElementChild; const b = t.getBoundingClientRect(), vb = box.getBoundingClientRect(); return { txt: t.textContent.trim(), over: t.scrollWidth > t.clientWidth + 1 || b.right > vb.right + 1 || b.right > innerWidth, body: ov.innerText, active: ov.classList.contains("active") }; });
        if (!r.active) bad.push(`${w} ${id}: fenêtre non ouverte`);
        if (r.txt !== exp) bad.push(`${w} ${id}: titre « ${r.txt} » (attendu « ${exp} »)`);
        if (r.over) bad.push(`${w} ${id}: le titre déborde`);
        if (OLD.test(r.body)) bad.push(`${w} ${id}: ancien nom encore dans l'aide`);
        await page.evaluate(() => { if (typeof closeHelpModal === "function") closeHelpModal({ target: document.getElementById("helpModalOverlay"), currentTarget: document.getElementById("helpModalOverlay") }); }); await sleep(400);
      }
    }
    assert(!bad.length, bad.join(" ; "));
  });

  await S("TB4", "formulaire « Un avis ? » : le bouton de la page s'appelle « Tableau » (valeur envoyée : « Tableau de bord »), tient sur sa ligne, de 320 à 1366 px", async () => {
    const { page } = await open();
    const bad = [];
    for (const w of [1366, 390, 320]) {
      await page.setViewport({ width: w, height: 900 }); await sleep(400);
      await page.evaluate(() => window.openFeedbackModal()); await sleep(700);
      const r = await page.evaluate(() => { const b = document.querySelector('.feedback-page-btn[data-page="Tableau de bord"]'); if (!b) return null; const g = b.closest(".feedback-page-grid").getBoundingClientRect(), r = b.getBoundingClientRect(); return { txt: b.textContent.trim(), over: b.scrollWidth > b.clientWidth + 1 || r.right > g.right + 1 || r.left < g.left - 1, h: r.height, others: [...document.querySelectorAll(".feedback-page-btn")].map((x) => Math.round(x.getBoundingClientRect().height)) }; });
      if (!r) bad.push(`${w}: bouton absent`); else { if (r.txt !== "Tableau") bad.push(`${w}: libellé « ${r.txt} »`); if (r.over) bad.push(`${w}: le bouton déborde`); if (Math.max(...r.others) - Math.min(...r.others) > 2) bad.push(`${w}: hauteurs des boutons inégales ${JSON.stringify(r.others)}`); }
      await page.evaluate(() => { const o = document.getElementById("feedback-modal-overlay"); const c = o && o.querySelector(".notes-close-btn, .feedback-close, [data-close]"); if (c) c.click(); else if (typeof window.closeFeedbackModal === "function") window.closeFeedbackModal(); }); await sleep(500);
    }
    assert(!bad.length, bad.join(" ; "));
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
