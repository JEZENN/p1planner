/* Paramètres en deux colonnes + pastille « ‹ Menu » et transitions sur téléphone + bouton « Annuler » des confirmations.
   Vraie page + émulateurs. Lancer : node test/e2e/settings-split.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve ; SETSHOTS=1 pour les captures) */
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
const FM = [
  { id: "PC", label: "PC 1366", vp: { width: 1366, height: 900 }, ph: false },
  { id: "iPadP", label: "iPad portrait 820", vp: M(820, 1180), ph: false },
  { id: "iPadL", label: "iPad paysage 1180", vp: M(1180, 820), ph: false },
  { id: "tel", label: "téléphone 390", vp: M(390, 844), ph: true },
];
const shot = async (page, name) => { if (process.env.SETSHOTS) await page.screenshot({ path: `docs/captures-15-10/parametres-${name}.png` }); };
const rgb = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 4).map(Number);

async function open({ vp = FM[0].vp, theme = "light", reduce = false } = {}) {
  const u = await mkUser({ courses: 2 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 600);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
  return { u, page };
}
/* attend la fin des animations des cartes (fondu de 0,22 s) avant de mesurer une position */
const settled = async (page) => { await sleep(150); await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running" && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest("#settings-modal-overlay") && a.effect.getComputedTiming().iterations !== Infinity), { timeout: 6000 }); await sleep(80); };
const openSettings = async (page) => { await page.evaluate(() => window.openSettingsModal()); await page.waitForSelector("#settings-modal-overlay.active", { timeout: 8000 }); await sleep(1400); };
const IDS = ["grp-tours", "j-method", "p1-flash", "tpx-trainings", "p1-catalogs", "grp-theme", "tpx-actions", "grp-account"];
const LABELS = ["Mes tours", "Méthode des J", "Flashcards", "Entraînements", "Listes personnalisables", "Thème et police", "Autres actions", "Mon compte"];
const GROUPS = { "grp-tours": ["tours", "confidence-scale", "extended-tours"], "grp-theme": ["p1-theme", "p1-font"], "grp-account": ["account", "p1-onboarding"] };

try {
  /* ═════════ SP1 : PC et iPad ═════════ */
  for (const f of FM.filter((x) => !x.ph)) for (const theme of f.id === "PC" ? ["light", "dark", "pastel"] : ["light"]) {
    await S(`SP1-${f.id}-${theme}`, `Paramètres (${f.label}, ${theme}) : fenêtre de taille fixe, sommaire à gauche (8 rubriques dont 3 groupes), UNE rubrique à droite, retour en haut à chaque changement, même hauteur de départ, « Revoir la présentation » seulement avec « Mon compte »`, async () => {
      const { page } = await open({ vp: f.vp, theme });
      await openSettings(page);
      const vw = f.vp.width, vh = f.vp.height, expW = Math.min(1020, 0.94 * vw), expH = Math.min(740, 0.9 * vh);
      const bad = [];
      const first = await page.evaluate(() => ({ labels: [...document.querySelectorAll(".p1-set-it .p1-set-it-tx")].map((e) => e.textContent), ids: [...document.querySelectorAll(".p1-set-it")].map((e) => e.dataset.id), title: (document.querySelector(".p1-set-side-t") || {}).textContent, introHidden: getComputedStyle(document.querySelector(".settings-intro")).display === "none", tocHidden: !document.getElementById("p1SetToc") || getComputedStyle(document.getElementById("p1SetToc")).display === "none" }));
      if (first.ids.join() !== IDS.join() || first.labels.join() !== LABELS.join()) bad.push("rubriques : " + first.ids.join() + " / " + first.labels.join());
      if (first.title !== "Réglages") bad.push("titre du sommaire : " + first.title);
      if (!first.introHidden || !first.tocHidden) bad.push("introduction ou ancien sommaire visibles");
      const starts = [];
      for (const id of IDS) {
        await page.evaluate(() => { document.querySelector(".settings-modal-body").scrollTop = 400; });
        await page.click(`.p1-set-it[data-id="${id}"]`); await settled(page);
        const r = await page.evaluate((cardsOf) => {
          const inner = document.getElementById("settings-modal-inner").getBoundingClientRect(), body = document.querySelector(".settings-modal-body"), br = body.getBoundingClientRect();
          const shown = [...document.querySelectorAll(".settings-card")].filter((c) => getComputedStyle(c).display !== "none"), tops = shown.map((c) => c.getBoundingClientRect().top - br.top);
          const gaps = shown.slice(1).map((c, i) => Math.round(c.getBoundingClientRect().top - shown[i].getBoundingClientRect().bottom));
          return { w: inner.width, h: inner.height, shown: shown.map((c) => c.dataset.setting), start: tops[0], gaps, scroll: body.scrollTop, active: [...document.querySelectorAll(".p1-set-it.is-active")].map((b) => b.dataset.id), anim: getComputedStyle(shown[0]).animationName + "/" + getComputedStyle(shown[0]).animationDuration, pageOver: document.documentElement.scrollWidth > innerWidth + 1, bodyOver: body.scrollWidth > body.clientWidth + 1, emptyWrapVisible: [...body.children].some((e) => !e.classList.contains("settings-card") && e.querySelector && e.querySelector(".settings-card") && !e.querySelector(".settings-card.p1-set-on") && getComputedStyle(e).display !== "none"), onb: !!document.querySelector('.settings-card[data-setting="p1-onboarding"].p1-set-on') };
        }, GROUPS);
        const want = GROUPS[id] || [id];
        if (Math.abs(r.w - expW) > 1.5 || Math.abs(r.h - expH) > 1.5) bad.push(`${id}: fenêtre ${Math.round(r.w)}×${Math.round(r.h)} (attendu ${Math.round(expW)}×${Math.round(expH)})`);
        if (r.shown.join() !== want.join()) bad.push(`${id}: cartes visibles ${r.shown.join()} (attendu ${want.join()})`);
        if (r.scroll !== 0) bad.push(`${id}: pas de retour en haut (${r.scroll})`);
        if (r.active.join() !== id) bad.push(`${id}: entrée active ${r.active.join()}`);
        if (r.gaps.some((g) => g !== 16)) bad.push(`${id}: écart entre cartes ${r.gaps.join()} (attendu 16)`);
        if (!/p1SetIn\/0\.22s/.test(r.anim) && !/none/.test(r.anim)) bad.push(`${id}: fondu ${r.anim}`);
        if (r.pageOver || r.bodyOver || r.emptyWrapVisible) bad.push(`${id}: débordement / conteneur vide ${JSON.stringify({ p: r.pageOver, b: r.bodyOver, e: r.emptyWrapVisible })}`);
        if (r.onb !== (id === "grp-account")) bad.push(`${id}: « Revoir la présentation » ${r.onb ? "affichée" : "absente"}`);
        starts.push(r.start);
      }
      if (Math.max(...starts) - Math.min(...starts) > 1) bad.push("hauteurs de départ différentes : " + starts.map((x) => Math.round(x * 10) / 10).join());
      assert(!bad.length, bad.join(" ; "));
      /* style du sommaire */
      await page.click('.p1-set-it[data-id="j-method"]'); await settled(page);
      const st = await page.evaluate(() => { const side = document.querySelector(".p1-set-side"), a = document.querySelector(".p1-set-it.is-active"), b = document.querySelector('.p1-set-it[data-id="grp-tours"]'), cs = getComputedStyle(side), ac = getComputedStyle(a), p = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(); const probe = document.createElement("i"); probe.style.color = p; document.body.appendChild(probe); const pc = getComputedStyle(probe).color; probe.remove(); return { w: side.getBoundingClientRect().width, bg: cs.backgroundColor, bd: cs.borderRightColor + " " + cs.borderRightWidth, abg: ac.backgroundColor, ac: ac.color, pc, bar: getComputedStyle(a, "::before").width + "/" + getComputedStyle(a, "::before").left, ic: Math.round(a.querySelector(".p1-set-it-ic").getBoundingClientRect().width), shadow: ac.boxShadow, bAbg: getComputedStyle(b).backgroundColor, ovy: cs.overflowY }; });
      assert(Math.abs(st.w - 250) <= 1 && st.bar === "3px/0px" && st.ic === 30 && /[1-9]/.test(st.bd) && st.ovy !== "visible", "sommaire : " + JSON.stringify(st));
      if (theme === "dark") assert(rgb(st.bg).join() === "17,24,39" && rgb(st.abg).join() === "30,41,59" && rgb(st.ac).join() === "147,197,253" && rgb(st.bd).slice(0, 3).join() === "51,65,85", "sombre : " + JSON.stringify(st));
      else if (theme === "light") assert(rgb(st.abg).join() === "255,255,255" && rgb(st.ac).join() === rgb(st.pc).join() && /rgba?\(15, 23, 42/.test(st.shadow), "clair : " + JSON.stringify(st));
      /* survol, pas de contour après un clic */
      await page.hover('.p1-set-it[data-id="grp-tours"]'); await sleep(250);
      const hv = await page.evaluate(() => getComputedStyle(document.querySelector('.p1-set-it[data-id="grp-tours"]')).backgroundColor);
      assert(rgb(hv)[3] !== 0 && rgb(hv).join() !== "0,0,0,0", "pas de survol : " + hv);
      await page.click('.p1-set-it[data-id="p1-catalogs"]'); await sleep(250);
      const ol = await page.evaluate(() => getComputedStyle(document.querySelector('.p1-set-it[data-id="p1-catalogs"]')).outlineStyle);
      assert(ol === "none", "contour affiché après un clic : " + ol);
      await shot(page, `${f.id}-${theme}`);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("SP1-fonctions", "Paramètres : un réglage fonctionne toujours (thème sombre depuis « Thème et police ») ; réouverture = dernière rubrique ; p1OpenSettingsSection (id de groupe, id de carte, titre) ; scrollIntoView d'un réglage masqué ouvre sa rubrique ; « Revoir la présentation »", async () => {
    const { page } = await open();
    await openSettings(page);
    await page.click('.p1-set-it[data-id="grp-theme"]'); await sleep(400);
    await page.evaluate(() => document.querySelector('.p1-theme-opt[data-theme="dark"], .p1-theme-opt[data-p1-theme="dark"], .p1-theme-opt[data-value="dark"]').click()); await sleep(900);
    assert(await page.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark"), "le thème sombre ne s'applique pas");
    await page.evaluate(() => window.closeSettingsModal()); await sleep(600);
    await openSettings(page);
    assert(await page.evaluate(() => document.querySelector(".p1-set-it.is-active").dataset.id === "grp-theme"), "dernière rubrique non rouverte");
    const r = await page.evaluate(() => {
      const act = () => document.querySelector(".p1-set-it.is-active").dataset.id, out = {};
      out.a = [window.p1OpenSettingsSection("grp-tours"), act()];
      out.b = [window.p1OpenSettingsSection("p1-font"), act()];
      out.c = [window.p1OpenSettingsSection("Mon compte"), act()];
      out.d = [window.p1OpenSettingsSection("thème et police"), act()];
      out.e = [window.p1OpenSettingsSection("inexistante"), act()];
      window.p1OpenSettingsSection("grp-tours");
      document.querySelector('.settings-card[data-setting="p1-catalogs"] .settings-card-title').scrollIntoView(); out.f = act();
      return out;
    });
    assert(r.a.join() === "true,grp-tours" && r.b.join() === "true,grp-theme" && r.c.join() === "true,grp-account" && r.d.join() === "true,grp-theme" && r.e.join() === "false,grp-theme" && r.f === "p1-catalogs", "ouvertures : " + JSON.stringify(r));
    await page.evaluate(() => window.p1OpenSettingsSection("Mon compte")); await sleep(400);
    await page.click("#tpx-restart-onb"); await sleep(1500);
    assert(await page.evaluate(() => !!document.getElementById("tpx-onb-overlay")), "la présentation ne s'ouvre pas");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ SP2 : téléphone ═════════ */
  for (const theme of ["light", "dark"]) {
    await S("SP2-" + theme, `téléphone 390 (${theme}) : liste d'abord (cartes avec ›), rubrique seule au toucher, pastille « ‹ Menu » collée en haut, retour à la liste, fenêtre de taille fixe, rien ne déborde`, async () => {
      const { page } = await open({ vp: FM[3].vp, theme });
      await openSettings(page);
      const rect = () => page.evaluate(() => { const i = document.getElementById("settings-modal-inner").getBoundingClientRect(), b = document.querySelector(".settings-modal-body"), s = document.querySelector(".p1-set-side"); return { w: i.width, h: i.height, bodyD: getComputedStyle(b).display, sideD: getComputedStyle(s).display, cls: document.getElementById("settings-modal-inner").className.replace(/settings-modal-inner|p1-set-split/g, "").trim(), over: document.documentElement.scrollWidth > innerWidth + 1 || b.scrollWidth > b.clientWidth + 1 || s.scrollWidth > s.clientWidth + 1 }; });
      const L = await rect();
      assert(L.bodyD === "none" && L.sideD !== "none" && /ph-list/.test(L.cls) && !L.over, "liste : " + JSON.stringify(L));
      assert(Math.abs(L.h - Math.min(0.92 * 844, 900)) <= 1.5, "hauteur de la fenêtre : " + L.h);
      const items = await page.evaluate(() => [...document.querySelectorAll(".p1-set-it")].map((b) => { const cs = getComputedStyle(b); return { t: b.textContent.trim(), chev: getComputedStyle(b.querySelector(".p1-set-it-chev")).display, bd: cs.borderTopWidth, rad: cs.borderTopLeftRadius, w: Math.round(b.getBoundingClientRect().width), sw: Math.round(document.querySelector(".p1-set-side").clientWidth) }; }));
      assert(items.length === 8 && items.every((x) => x.chev !== "none" && x.bd === "1px" && parseFloat(x.rad) >= 12 && x.w >= x.sw - 60), "cartes de la liste : " + JSON.stringify(items.slice(0, 2)));
      await shot(page, `tel-liste-${theme}`);
      await page.tap('.p1-set-it[data-id="grp-theme"]'); await sleep(900);
      const S1 = await rect();
      assert(S1.sideD === "none" && S1.bodyD !== "none" && /ph-sec/.test(S1.cls) && !S1.over && Math.abs(S1.w - L.w) <= 1 && Math.abs(S1.h - L.h) <= 1, "rubrique : " + JSON.stringify({ L, S1 }));
      const shown = await page.evaluate(() => [...document.querySelectorAll(".settings-card")].filter((c) => getComputedStyle(c).display !== "none").map((c) => c.dataset.setting));
      assert(shown.join() === "p1-theme,p1-font", "cartes de la rubrique : " + shown.join());
      /* pastille de retour */
      const B = await page.evaluate(() => { const b = document.querySelector(".p1-set-back"), cs = getComputedStyle(b), r = b.getBoundingClientRect(), body = document.querySelector(".settings-modal-body").getBoundingClientRect(); return { t: b.textContent.trim(), aria: b.getAttribute("aria-label"), rad: cs.borderTopLeftRadius, pad: cs.padding, bg: cs.backgroundColor, bd: cs.borderTopColor + " " + cs.borderTopWidth, sh: cs.boxShadow, fg: cs.color, fw: cs.fontWeight, ch: !!b.querySelector("i.fa-chevron-left"), chFirst: b.firstElementChild && b.firstElementChild.tagName === "I", w: r.width, bw: body.width, top0: r.top - body.top, pos: cs.position }; });
      assert(B.t === "Menu" && B.aria === "Revenir au menu des réglages" && B.ch && B.chFirst, "libellé : " + JSON.stringify(B));
      assert(parseFloat(B.rad) >= 100 && B.pad === "8px 16px 8px 12px" && B.pos === "sticky" && B.w < B.bw - 100 && B.fw >= "700", "forme : " + JSON.stringify(B));
      if (theme === "light") assert(rgb(B.bg).join() === "239,246,255" && /rgba\(59, 130, 246, 0\.28\)/.test(B.bd) && /rgba\(15, 23, 42, 0\.08\)/.test(B.sh), "couleurs claires : " + JSON.stringify(B));
      else assert(/^rgb\(/.test(B.bg) && rgb(B.bg).join() === "35,55,89" && /rgba\(147, 197, 253, 0\.3\)/.test(B.bd) && rgb(B.fg).join() === "147,197,253", "couleurs sombres (fond opaque, le contenu ne doit pas transparaître) : " + JSON.stringify(B));
      /* collée en haut pendant le défilement */
      const t0 = await page.evaluate(() => document.querySelector(".p1-set-back").getBoundingClientRect().top);
      await page.evaluate(() => { document.querySelector(".settings-modal-body").scrollTop = 400; }); await sleep(300);
      const t1 = await page.evaluate(() => { const r = document.querySelector(".p1-set-back").getBoundingClientRect(), b = document.querySelector(".settings-modal-body").getBoundingClientRect(); return { top: r.top, bt: b.top }; });
      assert(t1.top >= t1.bt - 1 && t1.top <= t1.bt + 14, "pastille non collée en haut : " + JSON.stringify(t1) + " (départ " + t0 + ")");
      /* règles de survol / appui présentes (le mode tactile n'a pas de vrai survol) */
      const css = await page.evaluate(() => document.getElementById("p1-evol-css").textContent);   /* pas de vrai survol en mode tactile : on lit les règles du bloc */
      const rules = { hov: css.includes("@media (hover: hover) { .p1-set-split.p1-set-ph-sec .p1-set-back:hover { background: var(--primary); color: #fff;") && css.includes("0 4px 12px rgba(59, 130, 246, 0.35)"), hovDark: css.includes('@media (hover: hover) { [data-theme="dark"] .p1-set-split.p1-set-ph-sec .p1-set-back:hover { background: #3b82f6; color: #fff;'), act: css.includes(".p1-set-split.p1-set-ph-sec .p1-set-back:active { transform: scale(0.95); }") };
      assert(rules.hov && rules.hovDark && rules.act, "règles survol / appui : " + JSON.stringify(rules));
      await shot(page, `tel-rubrique-${theme}`);
      await page.tap(".p1-set-back"); await sleep(900);
      const L2 = await rect();
      assert(L2.bodyD === "none" && L2.sideD !== "none" && /ph-list/.test(L2.cls) && Math.abs(L2.w - L.w) <= 1 && Math.abs(L2.h - L.h) <= 1, "retour au menu : " + JSON.stringify(L2));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("SP3", "téléphone : transitions — le menu glisse à gauche en s'effaçant (0,18 s) puis la rubrique arrive de la droite (0,28 s) ; retour : la rubrique repart à droite (0,2 s) puis le menu revient de la gauche (0,26 s) ; bascule ~170-190 ms entre les deux ; « réduire les animations » : immédiat", async () => {
    const { page } = await open({ vp: FM[3].vp });
    await openSettings(page);
    const rec = () => page.evaluate(() => { if (window.__obs) window.__obs.forEach((o) => o.disconnect()); window.__obs = []; if (window.__iv) clearInterval(window.__iv); window.__ev = []; const t0 = performance.now(); const inner = document.getElementById("settings-modal-inner"), side = document.querySelector(".p1-set-side"), body = document.querySelector(".settings-modal-body"); const log = (n, e) => window.__ev.push([Math.round(performance.now() - t0), n, e.className.replace(/settings-modal-inner|p1-set-split|p1-set-side|settings-modal-body/g, "").trim()]); [["inner", inner], ["side", side], ["body", body]].forEach(([n, e]) => { const o = new MutationObserver(() => log(n, e)); o.observe(e, { attributes: true, attributeFilter: ["class"] }); window.__obs.push(o); }); window.__sam = []; window.__iv = setInterval(() => { const cs = getComputedStyle(side), bs = getComputedStyle(body); window.__sam.push([Math.round(performance.now() - t0), +cs.opacity, cs.transform, +bs.opacity, bs.transform, cs.display, bs.display]); }, 20); });
    const stop = () => page.evaluate(() => { clearInterval(window.__iv); return { ev: window.__ev, sam: window.__sam }; });
    const tx = (m) => { const v = String(m).match(/matrix\(([^)]+)\)/); return v ? Number(v[1].split(",")[4]) : 0; };
    await rec(); await page.tap('.p1-set-it[data-id="grp-tours"]'); await sleep(900);
    const A = await stop();
    const outAt = A.ev.find((x) => x[1] === "side" && /out-l/.test(x[2])), sw = A.ev.find((x) => x[1] === "inner" && /ph-sec/.test(x[2])), inAt = A.ev.find((x) => x[1] === "body" && /in-r/.test(x[2])), inEnd = A.ev.filter((x) => x[1] === "body").pop();
    assert(outAt && sw && inAt, "classes de transition absentes : " + JSON.stringify(A.ev));
    assert(sw[0] - outAt[0] >= 150 && sw[0] - outAt[0] <= 320, "bascule après " + (sw[0] - outAt[0]) + " ms");
    assert(inAt[0] >= sw[0] - 5 && inEnd[0] - inAt[0] >= 240 && inEnd[0] - inAt[0] <= 420, "arrivée de la rubrique : " + JSON.stringify({ sw: sw[0], inAt: inAt[0], inEnd: inEnd[0] }));
    const out = A.sam.filter((x) => x[0] >= outAt[0] && x[0] <= sw[0]), minTx = Math.min(...out.map((x) => tx(x[2]))), minOp = Math.min(...out.map((x) => x[1]));
    assert(minTx <= -12 && minOp <= 0.4, "le menu ne glisse pas à gauche en s'effaçant : tx " + minTx + " opacité " + minOp);
    const inn = A.sam.filter((x) => x[0] >= inAt[0] && x[0] <= inAt[0] + 120 && x[6] !== "none"), maxTx = Math.max(...inn.map((x) => tx(x[4])));
    assert(maxTx >= 8 && Math.min(...inn.map((x) => x[3])) <= 0.5, "la rubrique n'arrive pas de la droite : tx " + maxTx);
    assert(await page.evaluate(() => getComputedStyle(document.querySelector(".settings-modal-body")).animationName) === "none", "animation restée sur la rubrique");
    /* retour */
    await rec(); await page.tap(".p1-set-back"); await sleep(900);
    const Bk = await stop();
    const o2 = Bk.ev.find((x) => x[1] === "body" && /out-r/.test(x[2])), sw2 = Bk.ev.find((x) => x[1] === "inner" && /ph-list/.test(x[2])), in2 = Bk.ev.find((x) => x[1] === "side" && /in-l/.test(x[2]));
    assert(o2 && sw2 && in2, "classes de retour absentes : " + JSON.stringify(Bk.ev));
    assert(sw2[0] - o2[0] >= 170 && sw2[0] - o2[0] <= 340, "bascule du retour après " + (sw2[0] - o2[0]) + " ms");
    const o2s = Bk.sam.filter((x) => x[0] >= o2[0] && x[0] <= sw2[0]);
    assert(o2s.length > 2 && Math.max(...o2s.map((x) => tx(x[4]))) >= 8 && Math.min(...o2s.map((x) => x[3])) <= 0.5, "la rubrique ne repart pas vers la droite en s'effaçant : " + JSON.stringify(o2s.slice(0, 12)) + " ev " + JSON.stringify(Bk.ev.slice(0, 8)));
    const i2 = Bk.sam.filter((x) => x[0] >= in2[0] && x[0] <= in2[0] + 120 && x[5] !== "none");
    assert(Math.min(...i2.map((x) => tx(x[2]))) <= -8, "le menu ne revient pas de la gauche");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("SP3-rm", "téléphone, « réduire les animations » : le changement est immédiat, aucune classe d'animation", async () => {
    const { page } = await open({ vp: FM[3].vp, reduce: true });
    await openSettings(page);
    await page.evaluate(() => { window.__c = []; ["settings-modal-body", "p1-set-side"].forEach((c) => new MutationObserver((m) => m.forEach((r) => { const k = r.target.className; if (/p1-set-(out|in)-/.test(k)) window.__c.push(k); })).observe(document.querySelector("." + c), { attributes: true, attributeFilter: ["class"] })); });
    await page.tap('.p1-set-it[data-id="grp-tours"]'); await sleep(300);
    const a = await page.evaluate(() => document.getElementById("settings-modal-inner").classList.contains("p1-set-ph-sec"));
    await page.tap(".p1-set-back"); await sleep(300);
    const b = await page.evaluate(() => ({ list: document.getElementById("settings-modal-inner").classList.contains("p1-set-ph-list"), cls: window.__c }));
    assert(a && b.list && b.cls.length === 0, "mouvement réduit : " + JSON.stringify({ a, b }));
  });

  /* ═════════ CF : bouton « Annuler » des confirmations ═════════ */
  for (const theme of ["light", "dark"]) {
    await S("CF-" + theme, `confirmation « Ajouter la banque de matières P1 ? » (${theme}) : « Annuler » rouge pastel, survol rouge plein texte blanc ; dialogue destructif : « Annuler » reste neutre`, async () => {
      const { page } = await open({ theme });
      await page.evaluate(() => { window.__p = window._p1ApplySubjectBankManual(); }); await page.waitForSelector("#custom-confirm-modal.active", { timeout: 8000 }); await sleep(600);
      const B = "#confirm-modal-cancel";
      const st = () => page.evaluate((q) => { const cs = getComputedStyle(document.querySelector(q)); return { bg: cs.backgroundColor, fg: cs.color, bd: cs.borderTopColor, sh: cs.boxShadow, txt: document.querySelector(q).textContent.trim() }; }, B);
      const r = await st();
      if (theme === "light") assert(rgb(r.bg).join() === "254,226,226" && rgb(r.fg).join() === "239,68,68" && r.txt === "Annuler", "repos clair : " + JSON.stringify(r));
      else assert(rgb(r.bg).join() === "239,68,68,0.18" && rgb(r.fg).join() === "252,165,165", "repos sombre : " + JSON.stringify(r));
      await shot(page, `annuler-${theme}`);
      await page.hover(B); await sleep(450);
      const h = await st();
      assert(rgb(h.bg).join() === "239,68,68" && rgb(h.fg).join() === "255,255,255" && h.sh !== "none", "survol : " + JSON.stringify(h));
      await page.mouse.move(5, 5); await page.click(B); await sleep(500);
      assert(await page.evaluate(() => !document.getElementById("custom-confirm-modal").classList.contains("active")), "le dialogue ne se ferme pas avec Annuler");
      /* dialogue destructif */
      await page.evaluate(() => { window.showCustomConfirm({ type: "danger", icon: "trash", title: "Supprimer ?", message: "x", confirmText: "Supprimer", confirmClass: "danger" }); }); await sleep(600);
      const d = await st();
      assert(rgb(d.bg).join() !== "254,226,226" && rgb(d.bg).join() !== "239,68,68,0.18", "« Annuler » rouge à côté d'un « Supprimer » rouge : " + JSON.stringify(d));
      await page.click(B); await sleep(400);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
