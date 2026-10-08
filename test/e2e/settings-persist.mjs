/* X1 (audit 02/10) : saveUserSettings() écrit dans users/{uid}, backend-only côté Rules
   (`allow write: if false`, voir firestore.rules). specialtyOrder, thème, NbrItemsPage,
   NbrEntrainementsPage et matiereBadges échouaient donc TOUJOURS côté serveur, en silence
   (`.catch` qui se contente d'un console.warn) — seul le localStorage de l'appareil les
   gardait, perdus sur tout autre appareil/navigateur. Correctif : ces réglages vivent
   désormais dans users/{uid}/settings/preferences (autorisé par les Rules, canWrite). */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

try {
  const u = await mkUser({ courses: 1 });
  const { page } = await openPage(browser, u);

  await S("X1", "specialtyOrder/thème survivent réellement à un AUTRE appareil (nouvelle page, même compte) — avant ce correctif : perdu, seul le localStorage le gardait", async () => {
    await page.evaluate(() => window._saveUserSettings({ specialtyOrder: ["zzz", "s1"], theme: "dark" }));
    await sleep(600);

    // Preuve directe, indépendante de la page : le document users/{uid} lui-même reste
    // backend-only (jamais écrit par le client, même après ce correctif) -- la vraie
    // persistance doit se trouver dans settings/preferences.
    const serverUserDoc = await adb.doc(`users/${u.uid}`).get();
    const userDocData = serverUserDoc.data() || {};
    assert(!Array.isArray(userDocData.specialtyOrder), "users/{uid} a été écrit directement par le client (devrait rester backend-only, voir firestore.rules) : " + JSON.stringify(userDocData.specialtyOrder));

    const prefsDoc = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const prefsData = prefsDoc.data() || {};
    assert(Array.isArray(prefsData.specialtyOrder) && prefsData.specialtyOrder[0] === "zzz",
      "specialtyOrder absent de settings/preferences -- la sauvegarde a échoué (régression de X1) : " + JSON.stringify(prefsData.specialtyOrder));
    assert(prefsData.theme === "dark", "thème absent de settings/preferences : " + JSON.stringify(prefsData.theme));

    // "Un autre appareil" = une page toute neuve, même compte : doit lire la vraie valeur
    // persistée, pas un repli local (nouveau profil navigateur = localStorage vide).
    const { page: page2 } = await openPage(browser, u);
    await waitFor(() => page2.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark"), { timeout: 10000 });
    assert(await page2.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark"), "le thème n'a pas été repris sur un « autre appareil » (nouvelle page, même compte)");
    assert(page.__errors.length === 0, "erreurs JS (page 1) : " + JSON.stringify(page.__errors));
    assert(page2.__errors.length === 0, "erreurs JS (page 2) : " + JSON.stringify(page2.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
