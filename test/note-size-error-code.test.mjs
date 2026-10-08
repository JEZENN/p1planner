/* Preuve empirique : code/message RÉELS renvoyés par Firestore quand un
   document dépasse 1 Mo (note avec images en base64). Sert à écrire la
   détection "note trop volumineuse" sans rien supposer.
   Exécution : npm run emulators (Firestore) puis
               npx mocha test/note-size-error-code.test.mjs --timeout 30000 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
let testEnv;

before(async function () {
  this.timeout(30000);
  testEnv = await initializeTestEnvironment({
    projectId: "p1planner-note-size-test",
    // ⚠️ Port décalé (2026-09-30, voir test/e2e/env-e2e.mjs) : 8080 occupé par TypixClin.
    firestore: { rules: readFileSync(join(__dirname, "..", "firestore.rules"), "utf8"), host: "127.0.0.1", port: 8280 }
  });
});
after(async () => { if (testEnv) await testEnv.cleanup(); });

describe("Note dépassant 1 Mo", function () {
  it("l'écriture est refusée avec un code/message identifiables", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const html = '<img src="data:image/jpeg;base64,' + "A".repeat(1_200_000) + '">';
      let caught = null;
      try { await setDoc(doc(db, "users", "u1", "notes", "n1"), { html, updatedAt: new Date() }); }
      catch (e) { caught = e; }
      assert.ok(caught, "l'écriture aurait dû échouer");
      console.log("      code    :", caught.code);
      console.log("      message :", String(caught.message).slice(0, 200));
      assert.equal(caught.code, "invalid-argument");
      assert.match(caught.message, /longer than|exceeds|too large|size/i);
    });
  });

  it("un document sous la limite est accepté", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "u1", "notes", "n2"), { html: "A".repeat(100_000) });
    });
  });
});
