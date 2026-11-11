/* Icônes dans de petites cases (pastilles) : filtres (listes simples, listes à cocher, bouton Ressources) et modales d'aide.
   Vraie page + émulateurs, trois thèmes. Le bloc CSS « #p1-pastilles » peut être désactivé (P1_PASTILLES_OFF=1) pour la contre-épreuve ;
   les hauteurs des boutons sont comparées avec et sans lui. Les listes sont ouvertes par de vrais clics.
   Lancer : node test/e2e/pastilles-filtres.mjs   (PASTSHOTS=<préfixe> pour garder les captures ; PUBLIC_DIR=<copie « avant »>) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, adb, scenario, report, assert, sleep, openPage } from "./lib.mjs";

const server = await startServer(), proxy = await startProxy(), browser = await launch();
const shot = process.env.PASTSHOTS;
const OFF = process.env.P1_PASTILLES_OFF === "1";
const THEMES = ["light", "dark", "pastel"];
const PAGES = [["dashboard", "Mes matières"], ["items", "Mes cours"], ["entrainements", "Entraînements"]];

async function ouvrir(theme) {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...(theme !== "light" ? { theme } : {}) }, { merge: true });
  const { page } = await openPage(browser, u);
  await page.evaluate((t) => { try { localStorage.setItem("theme", t); } catch (e) {} const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; if (window.p1SetTheme) window.p1SetTheme(t, false); }, theme);
  await sleep(700);
  page.__erreurs = []; page.on("pageerror", (e) => page.__erreurs.push(String(e.message || e)));
  if (OFF) await page.evaluate(() => { const s = document.getElementById("p1-pastilles"); if (s) s.disabled = true; });
  return page;
}
const aller = async (page, id) => { await page.click(`.app-nav-btn[data-page="${id}"]`); await sleep(900); };
const capture = async (page, nom) => { if (shot) await page.screenshot({ path: `docs/captures-15-10/${shot}-${nom}.png`, captureBeyondViewport: false }); };
const transparent = (bg) => !bg || bg === "transparent" || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(bg) || /color\(srgb [\d. ]+\/ 0\)/.test(bg);

/* icônes de filtre visibles de la page courante : boutons, options (listes ouvertes), listes à cocher, bouton Ressources */
const idsAide = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('[onclick*="openHelpModal("]')].map((e) => (e.getAttribute("onclick").match(/openHelpModal\('([^']+)'/) || [])[1]).filter(Boolean))]);
const iconesFiltre = (page) => page.evaluate(() => {
  const SEL = ".custom-select-btn > .custom-select-icon, .specialty-multi-btn > .specialty-multi-icon, .config-resources-btn:not(.train-add-main-btn) > i:first-child, .custom-select-option > .option-icon, .specialty-multi-option > .specialty-multi-option-icon";
  return [...document.querySelectorAll(SEL)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.offsetParent !== null; }).map((e) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return { cls: (e.parentElement.className + " > " + (e.className || e.tagName)).slice(0, 60), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, rad: parseFloat(cs.borderTopLeftRadius) || 0, bg: cs.backgroundColor };
  });
});
const hauteursBoutons = (page) => page.evaluate(() => [...document.querySelectorAll(".custom-select-btn, .specialty-multi-btn, .config-resources-btn")].filter((e) => e.offsetParent !== null).map((e) => [e.id || e.className.slice(0, 40), Math.round(e.getBoundingClientRect().height * 100) / 100]));

for (const theme of THEMES) {
  /* ═════════ PF1 : filtres, page par page ═════════ */
  await scenario(`PF1-${theme} filtres (${theme}) : sur chaque page, toutes les icônes visibles (boutons, options des listes ouvertes, listes à cocher, Ressources) font au moins 24 px, fond non transparent, coins arrondis`, async () => {
    const page = await ouvrir(theme);
    let total = 0;
    for (const [id, nom] of PAGES) {
      if (id !== "dashboard") await aller(page, id);
      for (const btn of await page.$$(".app-page.active .custom-select-btn, .app-page.active .specialty-multi-btn")) { try { await btn.click(); await sleep(450); } catch (e) { continue; } const icones = await iconesFiltre(page);
        for (const i of icones) { total++; assert(i.w >= 24 && i.h >= 24 && !transparent(i.bg) && i.rad >= 4, `${nom} : icône « ${i.cls} » : ` + JSON.stringify(i)); }
        if (shot && id === "dashboard") await capture(page, `liste-${theme}`);
        await btn.click(); await sleep(250); }
      const icones = await iconesFiltre(page);
      for (const i of icones) { total++; assert(i.w >= 24 && i.h >= 24 && !transparent(i.bg) && i.rad >= 4, `${nom} : icône « ${i.cls} » : ` + JSON.stringify(i)); }
    }
    assert(total >= 12, "trop peu d'icônes de filtre examinées : " + total);
    assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
  });

  /* ═════════ PF2 : la hauteur des boutons de filtre ne change pas ═════════ */
  await scenario(`PF2-${theme} hauteur des boutons de filtre (${theme}) : identique avec et sans le bloc « #p1-pastilles »`, async () => {
    const page = await ouvrir(theme);
    for (const [id, nom] of PAGES) {
      if (id !== "dashboard") await aller(page, id);
      await page.evaluate(() => { const s = document.getElementById("p1-pastilles"); if (s) s.disabled = false; }); await sleep(200);
      const avec = await hauteursBoutons(page);
      await page.evaluate(() => { const s = document.getElementById("p1-pastilles"); if (s) s.disabled = true; }); await sleep(200);
      const sans = await hauteursBoutons(page);
      await page.evaluate(() => { const s = document.getElementById("p1-pastilles"); if (s) s.disabled = false; });
      assert(avec.length >= 1 && JSON.stringify(avec) === JSON.stringify(sans), `${nom} : hauteurs avec ${JSON.stringify(avec)} / sans ${JSON.stringify(sans)}`);
    }
    if (OFF) await page.evaluate(() => { const s = document.getElementById("p1-pastilles"); if (s) s.disabled = true; });
    assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
  });

  /* ═════════ PF3 : modales d'aide ═════════ */
  await scenario(`PF3-${theme} modales d'aide (${theme}) : pastille devant chaque titre, centrée sur les coches (≤ 1,5 px), texte du titre aligné sur celui des lignes (≤ 1,5 px), astuces en case carrée arrondie, icône animée de « Sauvegarde » : seul le pictogramme tourne`, async () => {
    const page = await ouvrir(theme);
    const ids = await idsAide(page);
        let sauvegarde = 0, astuces = 0, titres = 0;
    const toutes = ids;
    for (const id of toutes) {
      await page.evaluate((i) => window.openHelpModal(i), id); await sleep(500);
      const r = await page.evaluate(() => {
        const ov = document.querySelector(".help-modal-overlay.active") || document;
        const titres = [...ov.querySelectorAll(".help-key-points")].map((bloc) => {
          const t = bloc.querySelector(".help-key-points-title"), i = t && t.querySelector(":scope > i:first-child"), li = bloc.querySelector("li");
          if (!t || !i || !li) return null;
          const ri = i.getBoundingClientRect(), cs = getComputedStyle(i), rl = li.getBoundingClientRect();
          const rng = document.createRange(); rng.selectNodeContents(li.firstChild && li.firstChild.nodeType === 3 ? li.firstChild : li); const texteLi = rng.getBoundingClientRect().left;
          const noeud = [...t.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
          const rt = document.createRange(); if (noeud) rt.selectNodeContents(noeud); const texteTitre = noeud ? rt.getBoundingClientRect().left : null;
          const centreCoche = rl.left + 9;   // coche de 18 px calée sur le bord gauche de la ligne
          return { w: ri.width, h: ri.height, rad: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor, ecartCentre: Math.abs((ri.left + ri.width / 2) - centreCoche), ecartTexte: texteTitre === null ? null : Math.abs(texteTitre - (rl.left + 26)), anim: cs.animationName, animAvant: getComputedStyle(i, "::before").animationName, spin: i.classList.contains("fa-spin"), nom: t.textContent.trim().slice(0, 20) };
        }).filter(Boolean);
        const tips = [...ov.querySelectorAll(".help-tip > .help-tip-icon")].map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { w: r.width, h: r.height, rad: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor }; });
        return { titres, tips };
      });
      for (const t of r.titres) {
        titres++;
        assert(t.w === 24 && t.h === 24 && t.rad >= 6 && !transparent(t.bg), `${id} : pastille du titre « ${t.nom} » : ` + JSON.stringify(t));
        assert(t.ecartCentre <= 1.5, `${id} : « ${t.nom} » : pastille décentrée de ${t.ecartCentre.toFixed(2)} px par rapport aux coches`);
        assert(t.ecartTexte === null || t.ecartTexte <= 1.5, `${id} : « ${t.nom} » : texte du titre décalé de ${t.ecartTexte && t.ecartTexte.toFixed(2)} px par rapport au texte des lignes`);
        if (t.spin) { sauvegarde++; assert(t.anim === "none" && t.animAvant === "fa-spin", `${id} : icône animée : animation de la case « ${t.anim} », du pictogramme « ${t.animAvant} »`); }
      }
      for (const t of r.tips) { astuces++; assert(Math.abs(t.w - 28) < 0.6 && Math.abs(t.h - 28) < 0.6 && t.rad >= 6 && t.rad < 14 && !transparent(t.bg), `${id} : astuce : ` + JSON.stringify(t)); }
      if (shot && id === "dashboard-specialties") await capture(page, `aide-${theme}`);
      await page.evaluate(() => { const b = document.querySelector(".help-modal-overlay.active .help-modal-close") || document.querySelector(".help-modal-close"); if (b) b.click(); }); await sleep(350);
    }
    assert(toutes.length >= 8, "trop peu d'aides trouvées : " + toutes.length);
    assert(titres >= 10, "trop peu de titres examinés : " + titres);
    assert(astuces >= 3, "trop peu d'astuces examinées : " + astuces);
    assert(sauvegarde >= 1, "l'aide « Sauvegarde » (icône animée) n'a pas été trouvée");
    assert(page.__erreurs.length === 0, "erreurs JS : " + page.__erreurs.join(" | "));
  });
}

await scenario("PF4 mouvement réduit : l'icône animée de l'aide « Sauvegarde » ne tourne plus (ni la case, ni le pictogramme)", async () => {
  const page = await ouvrir("light");
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const ids = await idsAide(page);
  let vu = false;
  for (const id of ids) {
    await page.evaluate((i) => window.openHelpModal(i), id); await sleep(400);
    const r = await page.evaluate(() => { const i = document.querySelector(".help-modal-overlay.active .help-key-points-title > i.fa-spin"); return i ? { a: getComputedStyle(i).animationName, b: getComputedStyle(i, "::before").animationName } : null; });
    if (r) { vu = true; assert(r.a === "none" && r.b === "none", "animation encore active : " + JSON.stringify(r)); }
    await page.evaluate(() => { const b = document.querySelector(".help-modal-overlay.active .help-modal-close") || document.querySelector(".help-modal-close"); if (b) b.click(); }); await sleep(300);
  }
  assert(vu, "aide « Sauvegarde » introuvable");
});

const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
