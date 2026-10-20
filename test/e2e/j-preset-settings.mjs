/* Paramètres > Méthode des J : choix du rythme (Rapproché / Équilibré / Espacé / Personnalisé). Vraie page + émulateurs, vrais clics souris.
   Bug : après un clic sur « Personnalisé » (non enregistré) puis sur « Équilibré » (le rythme déjà enregistré), la case bleue restait sur « Personnalisé ».
   Lancer : node test/e2e/j-preset-settings.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, scenario, report, assert, sleep } from "./lib.mjs";

const server = await startServer(), proxy = await startProxy(), browser = await launch();
const OPEN = [];
const S = (id, title, fn) => scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } });

async function user() {
  const u = await mkUser({ courses: 1 });
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000);
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; });
  return { u, page };
}
const openSettings = async (page, preset, offsets) => {
  await page.evaluate((p, o) => { window.setJMethodPrefs(true, p, o); window.openSettingsModal(); }, preset, offsets || undefined);
  await page.waitForSelector("#j-preset-row .j-preset-btn", { visible: true, timeout: 15000 }); await sleep(900);
};
const click = async (page, id) => {
  const c = await page.evaluate((i) => { const b = document.querySelector(`#j-preset-row .j-preset-btn[data-jpreset="${i}"]`); b.scrollIntoView({ block: "center", behavior: "instant" }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  await page.mouse.click(c.x, c.y); await sleep(500);
};
const state = (page) => page.evaluate(() => ({
  active: [...document.querySelectorAll("#j-preset-row .j-preset-btn.active")].map((b) => b.getAttribute("data-jpreset")),
  saved: window.getJPreset(), customRowShown: document.getElementById("j-custom-row").style.display !== "none",
}));

try {
  await S("J1", "rythme enregistré « Équilibré » : clic sur « Personnalisé » (non enregistré) puis « Équilibré » → la case revient sur « Équilibré », éditeur replié", async () => {
    const { page } = await user();
    await openSettings(page, "equilibre");
    let s = await state(page); assert(s.active.join() === "equilibre" && s.saved === "equilibre", "départ : " + JSON.stringify(s));
    await click(page, "custom");
    s = await state(page); assert(s.active.join() === "custom" && s.customRowShown, "après « Personnalisé » : " + JSON.stringify(s));
    await click(page, "equilibre");
    s = await state(page); assert(s.active.join() === "equilibre", "après « Équilibré », case sur : " + s.active.join() + " " + JSON.stringify(s));
    assert(!s.customRowShown && s.saved === "equilibre", "éditeur ou rythme enregistré incorrect : " + JSON.stringify(s));
  });
  await S("J2", "rythme enregistré « Personnalisé » : passage à « Équilibré » → sélectionné ET enregistré", async () => {
    const { page } = await user();
    await openSettings(page, "custom", [2, 6, 15]);
    let s = await state(page); assert(s.active.join() === "custom" && s.saved === "custom", "départ : " + JSON.stringify(s));
    await click(page, "equilibre");
    s = await state(page); assert(s.active.join() === "equilibre" && s.saved === "equilibre" && !s.customRowShown, "après « Équilibré » : " + JSON.stringify(s));
    const ls = await page.evaluate(() => localStorage.getItem("jMethodPreset__" + window.currentUser.uid)); assert(ls === "equilibre", "localStorage : " + ls);
  });
  await S("J3", "rythme « Rapproché » enregistré : « Personnalisé » puis retour sur « Rapproché », puis « Espacé » enregistré", async () => {
    const { page } = await user();
    await openSettings(page, "rapproche");
    await click(page, "custom"); await click(page, "rapproche");
    let s = await state(page); assert(s.active.join() === "rapproche" && !s.customRowShown, "retour : " + JSON.stringify(s));
    await click(page, "espace");
    s = await state(page); assert(s.active.join() === "espace" && s.saved === "espace", "espacé : " + JSON.stringify(s));
  });
} finally {
  const code = report(); await browser.close(); await server.close?.(); await proxy.close?.(); process.exit(code);
}
