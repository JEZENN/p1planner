/* ============================================================
   Sauvegarde nocturne (scheduledUserBackup) : DÉMARRAGE À FROID.
   Bug de production trouvé dans les logs Cloud Functions (07 et 08/10/2026) : « The default Firebase
   app does not exist » à chaque exécution -- _runScheduledBackups appelait getAuth() directement,
   sans qu'aucun db_()/auth_() n'ait encore initialisé l'application (instance froide). Les autres
   tests de sauvegarde passaient parce que leur harnais initialise l'app Admin AVANT de charger le code.
   Ce test charge functions/index.js dans un processus NEUF, sans aucune initialisation préalable,
   comme une vraie instance Cloud Functions, puis exécute la tâche contre l'émulateur.
   ============================================================ */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "functions");

describe("scheduledUserBackup — démarrage à froid (aucune app Admin préinitialisée)", function () {
  this.timeout(60000);
  it("s'exécute sans « default Firebase app does not exist » et sans erreur", () => {
    const script = `
      const fns = require(${JSON.stringify(path.join(FUNCTIONS_DIR, "index.js"))});
      fns.__backupTest._runScheduledBackups().then(
        (r) => { console.log("RESULT:" + JSON.stringify(r)); process.exit(0); },
        (e) => { console.log("THROWN:" + (e && e.message)); process.exit(2); });
    `;
    const r = spawnSync(process.execPath, ["-e", script], {
      cwd: FUNCTIONS_DIR, encoding: "utf8", timeout: 50000,
      env: Object.assign({}, process.env, {
        GCLOUD_PROJECT: "p1planner-coldstart-test",
        FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8280",
        FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9198",
        P1_TEST_EXPORTS: "1", STRIPE_SECRET_KEY: "sk_test_AUDIT_FAKE", STRIPE_WEBHOOK_SECRET: "whsec_AUDIT_FAKE",
        STRIPE_PRICE_MONTHLY: "price_AUDIT_MONTHLY", BREVO_API_KEY: "AUDIT_FAKE",
      }),
    });
    const out = (r.stdout || "") + (r.stderr || "");
    assert.ok(!/default Firebase app does not exist/i.test(out), "app Admin non initialisée au démarrage à froid : " + out.slice(0, 400));
    assert.equal(r.status, 0, "la tâche a échoué (code " + r.status + ") : " + out.slice(0, 400));
    const m = out.match(/RESULT:(\{.*\})/);
    assert.ok(m, "aucun résultat renvoyé : " + out.slice(0, 400));
    assert.equal(JSON.parse(m[1]).errors, 0, "des utilisateurs ont échoué : " + m[1]);
  });
});
