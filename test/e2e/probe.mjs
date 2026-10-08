import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, doc, sleep } from "./lib.mjs";
const server = await startServer(); const proxy = await startProxy(); const browser = await launch();
try {
  const u = await mkUser(); const { page } = await openPage(browser, u);
  const r = await page.evaluate(async () => {
    const ref = window._fsDoc(window._fsDb, "users", window.currentUser.uid, "courses", "c1");
    const payload = {}; payload["resources.zzz"] = true; payload.updatedAt = window._fsServerTimestamp();
    await window._fsSetDoc(ref, payload, { merge: true });
    return "ok";
  });
  await sleep(1000);
  console.log("resultat evaluate:", r);
  console.log("doc serveur c1 (admin, brut):", JSON.stringify(await doc(`users/${u.uid}/courses/c1`)));
} finally { await browser.close(); proxy.close(); server.close(); }
