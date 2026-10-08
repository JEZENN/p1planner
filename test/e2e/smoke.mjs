import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, course, tours, validateTour, resetTour, waitFor, scenario, report, assert, sleep } from "./lib.mjs";

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();
try {
  await scenario("S0 ajout puis suppression d'un tour (réseau normal)", async () => {
    const u = await mkUser();
    const { page } = await openPage(browser, u);
    await validateTour(page, "c1", 0, 4);
    assert(await waitFor(async () => tours(await course(u.uid))[0] === 4), "tour 0 absent du serveur");
    await resetTour(page, "c1", 0);
    assert(await waitFor(async () => tours(await course(u.uid))[0] === null), "suppression non persistée");
    assert(page.__errors.length === 0, "erreurs JS: " + page.__errors.join(" | "));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
