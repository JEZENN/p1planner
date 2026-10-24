/* Date de fin d'essai / d'accès affichée sur comptepremium.html : toujours à l'heure de Paris, quel que soit le fuseau du visiteur (24/10/2026).
   Vraie page + émulateurs ; le navigateur est réglé sur Indian/Reunion (UTC+4) puis Pacific/Auckland (UTC+12 / +13).
   Lancer : node test/e2e/trial-date-tz.mjs   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, adb, scenario, report, assert, sleep, BASE } from "./lib.mjs";
import admin from "firebase-admin";

const server = await startServer(), proxy = await startProxy(), browser = await launch();
const ts = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));

async function login(page, user) {
  await page.goto(`${BASE}/auth.html?redirect=${encodeURIComponent("/comptepremium.html")}`, { waitUntil: "load" });
  await page.waitForSelector("#loginEmail");
  await page.type("#loginEmail", user.email); await page.type("#loginPassword", user.password);
  await page.click("#btnLogin");
  await page.waitForFunction(() => location.pathname.endsWith("/comptepremium.html"), { timeout: 30000 });
}

/* [instant UTC de l'échéance, date courte attendue, date longue attendue] — 23:30 à Paris en heure d'été, 23:30 en hiver (22:30 UTC) */
const CASES = [
  ["été", "2027-07-14T21:30:00Z", "14/07/2027", "14 juillet 2027"],
  ["hiver", "2026-12-15T22:30:00Z", "15/12/2026", "15 décembre 2026"],
];
try {
  for (const tz of ["Indian/Reunion", "Pacific/Auckland"]) {
    for (const [saison, iso, court, long] of CASES) {
      await scenario(`TZ1-${tz}-${saison} échéance ${iso} (23:30 à Paris) : « Gratuit jusqu'au ${court} » et « ${long} », pas la date du fuseau du visiteur`, async () => {
        const u = await mkUser({ courses: 0 });
        await adb.doc(`entitlements/${u.uid}`).set({ status: "trial", trialStartedAt: ts("2026-10-01T10:00:00Z"), trialEndsAt: ts(iso), writeAccessUntil: ts(iso), premiumUntil: null, planType: null });
        const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
        page.__errors = []; page.on("pageerror", (e) => page.__errors.push(String(e.message || e)));
        try {
          await page.emulateTimezone(tz);
          await page.setViewport({ width: 1280, height: 900 });
          await login(page, u);
          await page.waitForFunction((c) => (document.body.innerText || "").indexOf("Gratuit jusqu'au") >= 0, { timeout: 30000 });
          await sleep(500);
          const txt = await page.evaluate(() => document.body.innerText);
          const local = await page.evaluate((i) => new Date(i).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }), iso);
          assert(txt.indexOf("Gratuit jusqu'au " + court) >= 0, `pastille : « ${(txt.match(/Gratuit jusqu'au [^\n]*/) || [""])[0]} » au lieu de « Gratuit jusqu'au ${court} » (le fuseau du visiteur donnerait ${local})`);
          assert(txt.indexOf(long) >= 0, `« Fin de la période » : « ${long} » absent`);
          assert(local !== court, "test mal posé : le fuseau du visiteur donne la même date que Paris (" + local + ")");
          assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
        } finally { await ctx.close(); }
      });
    }
  }
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
