/* ============================================================
   P1PLANNER — Preuve empirique (audit TypixClin du 2026-09-16, point 3)
   ============================================================
   Vérifie contre le VRAI émulateur Firestore (pas une supposition) le code
   d'erreur réellement renvoyé par updateDoc() / transaction.update() sur un
   document QUI N'EXISTE PAS.

   RÉSULTAT EMPIRIQUE (exécuté le 2026-09-16 contre l'émulateur local,
   firebase JS SDK 10.14.1, firestore-emulator v1.21.0) : le code réel est
   'not-found' (gRPC NOT_FOUND, "no entity to update"), PAS 'invalid-argument'
   comme l'hypothèse de départ le supposait (vérification faite à l'origine
   côté TypixClin). Sur CET émulateur/SDK, l'hypothèse de départ ne se
   reproduit donc pas — voir le message envoyé à l'utilisateur pour la
   discussion de cet écart (version d'émulateur/SDK différente ? parité
   émulateur/production ?).
   Cela ne change RIEN à la conclusion sur le filet
   `if (e.code === 'not-found')` de public/tableur.html (~ligne 24619) :
   quel que soit le bon code, ce filet est de toute façon INATTEINGABLE, le
   bloc try qui le contient ne levant plus jamais d'exception depuis que la
   vraie écriture Firestore a été neutralisée en no-op (voir commentaire
   existant juste avant, dans le fichier). Ce test documente simplement le
   comportement réel observé, pour référence future.
   Exécution : npm run emulators (dans un terminal)
               npx mocha test/point3-error-code.test.mjs --timeout 20000
   Tourne EXCLUSIVEMENT contre l'émulateur local (projectId factice).
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, updateDoc, runTransaction } from "firebase/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = "p1planner-point3-test";

let testEnv;

before(async function () {
  this.timeout(30000);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(join(__dirname, "..", "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      // ⚠️ Port décalé (2026-09-30, voir test/e2e/env-e2e.mjs) : 8080 occupé par TypixClin.
      port: 8280
    }
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("Point 3 — code d'erreur réel sur écriture d'un document inexistant", function () {
  this.timeout(20000);

  it("updateDoc() sur un document inexistant renvoie 'not-found' sur cet émulateur", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const ref = doc(db, "users", "ghost-uid", "courses", "course-does-not-exist");
      let caught = null;
      try {
        await updateDoc(ref, { tourCount: 1 });
        assert.fail("updateDoc() aurait dû lever une exception sur un document inexistant");
      } catch (e) {
        caught = e;
      }
      assert.ok(caught, "une exception doit avoir été levée");
      assert.equal(caught.code, "not-found", "code réellement observé sur cet émulateur/SDK");
    });
  });

  it("transaction.update() sur un document inexistant renvoie aussi 'not-found' sur cet émulateur", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const ref = doc(db, "users", "ghost-uid", "courses", "course-does-not-exist-2");
      let caught = null;
      try {
        await runTransaction(db, async (tx) => {
          tx.update(ref, { tourCount: 1 });
        });
        assert.fail("la transaction aurait dû échouer sur un document inexistant");
      } catch (e) {
        caught = e;
      }
      assert.ok(caught, "une exception doit avoir été levée");
      assert.equal(caught.code, "not-found", "code réellement observé sur cet émulateur/SDK");
    });
  });
});
