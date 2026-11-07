/* Captures du haut de page (connecté et déconnecté, ordinateur / tablette / téléphone, avec la salutation) pour comparer deux versions.
   Lancer : TOPLABEL=avant|apres node test/e2e/top-captures.mjs   (PUBLIC_DIR=<copie « avant »> pour la version d'avant) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, adb, sleep, BASE } from "./lib.mjs";

const label = process.env.TOPLABEL || "apres";
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const VP = { PC: { width: 1366, height: 800 }, tablette: { width: 820, height: 900 }, tel: { width: 390, height: 760, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const out = (n) => `docs/captures-15-10/haut-page-${label}-${n}.png`;
try {
  for (const [k, vp] of Object.entries(VP)) {
    for (const theme of ["clair", "sombre"]) {
      const u = await mkUser({ courses: 3 });
      await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3, ...(theme === "sombre" ? { theme: "dark" } : {}) }, { merge: true });
      const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); page.setDefaultNavigationTimeout(120000);
      await page.setViewport(vp);
      await page.goto(BASE + "/tableur.html", { waitUntil: "load" });
      await page.waitForFunction(() => window.__authApi && window.__auth, { timeout: 30000 });
      if (theme === "sombre") await page.evaluate(() => { try { localStorage.setItem("theme", "dark"); } catch (e) {} });
      await page.evaluate(async (e, p) => { await window.__authApi.signInWithEmailAndPassword(window.__auth, e, p); }, u.email, u.password);
      await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0 && !document.documentElement.classList.contains("p1-skel"), { timeout: 60000 });
      await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; });
      if (theme === "sombre") { await page.evaluate(() => window.p1SetTheme && window.p1SetTheme("dark", false)); }
      await sleep(700);
      await page.screenshot({ path: out(`${k}-${theme}-connecte`) });
      if (theme === "clair") {
        /* avec la salutation, si la version la propose : se reconnecter juste avant la capture */
        await page.evaluate(() => { const e = document.getElementById("welcome-message"); window.__wm = e.innerHTML; e.innerHTML = ""; }); await sleep(300);
        await page.evaluate(() => { document.getElementById("welcome-message").innerHTML = window.__wm; }); await sleep(900);
        await page.screenshot({ path: out(`${k}-${theme}-salutation`) });
      }
      await ctx.close();
    }
    const ctx2 = await browser.createBrowserContext(); const p2 = await ctx2.newPage(); await p2.setViewport(vp);
    await p2.goto(BASE + "/tableur.html", { waitUntil: "load" });
    await p2.waitForFunction(() => !document.documentElement.classList.contains("p1-skel"), { timeout: 40000 }); await sleep(900);
    await p2.screenshot({ path: out(`${k}-deconnecte`) }); await ctx2.close();
  }
} finally { await browser.close(); await server.close?.(); await proxy.close?.(); process.exit(0); }
