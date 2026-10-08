/* ============================================================
   P1PLANNER — Tests Firestore Rules (Emulator)
   ============================================================
   Exécution : npm run emulators (dans un terminal)
               npm run test:rules (dans un autre)
   Ces tests tournent EXCLUSIVEMENT contre l'émulateur Firestore
   local (projectId factice), jamais contre le vrai projet
   Firebase P1Planner. Aucune donnée réelle n'est touchée.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, runTransaction, serverTimestamp
} from "firebase/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = "p1planner-rules-test";

const USER_A = "user_a_uid";
const USER_B = "user_b_uid";

let testEnv;

const future = () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 20); // +20 jours
const past = () => new Date(Date.now() - 1000 * 60 * 60 * 24 * 5); // -5 jours

before(async function () {
  this.timeout(30000);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(join(__dirname, "..", "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      // ⚠️ Port décalé (2026-09-30, voir test/e2e/env-e2e.mjs) : 8080 est occupé en parallèle par
      // les émulateurs TypixClin de Jean — démarrer avec
      // `firebase emulators:start --config firebase.emu-alt.json`.
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

/* ---------- Fixtures (posées avec les Rules désactivées = Admin SDK) ---------- */
async function seedUser(uid, { writeAccessUntil, withEntitlement = true } = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", uid), {
      displayName: "Test " + uid,
      email: uid + "@example.com",
      createdAt: new Date()
    });
    if (withEntitlement) {
      await setDoc(doc(db, "entitlements", uid), {
        status: writeAccessUntil && writeAccessUntil > new Date() ? "trial" : "expired",
        trialStartedAt: new Date(),
        trialEndsAt: writeAccessUntil,
        writeAccessUntil,
        premiumUntil: null,
        planType: null
      });
    }
    await setDoc(doc(db, "billingPrivate", uid), { stripeCustomerId: "cus_fake_" + uid });
    await setDoc(doc(db, "users", uid, "subjects", "subj1"), {
      name: "Cardiologie", color: "#7c6cf6", order: 10, archivedAt: null, createdAt: new Date()
    });
    await setDoc(doc(db, "users", uid, "courses", "course1"), {
      subjectId: "subj1", name: "Insuffisance cardiaque", order: 10,
      archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date()
    });
  });
}

function ctxFor(uid, { verified = true } = {}) {
  return uid
    ? testEnv.authenticatedContext(uid, { email_verified: verified })
    : testEnv.unauthenticatedContext();
}

/* ============================================================
   1. non connecté lit → DENY
   ============================================================ */
it("1. non connecté lit users/A → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(null).firestore();
  await assertFails(getDoc(doc(db, "users", USER_A)));
});

/* ============================================================
   2. email non vérifié lit → DENY
   ============================================================ */
it("2. email non vérifié lit ses propres données → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A, { verified: false }).firestore();
  await assertFails(getDoc(doc(db, "users", USER_A)));
  await assertFails(getDoc(doc(db, "users", USER_A, "subjects", "subj1")));
});

/* ============================================================
   3/4/5. Isolation A / B (matrice explicite demandée)
   ============================================================ */
describe("Isolation A / B", () => {
  beforeEach(async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    await seedUser(USER_B, { writeAccessUntil: future() });
  });

  it("3. user A lit users/A → ALLOW", async () => {
    const db = ctxFor(USER_A).firestore();
    await assertSucceeds(getDoc(doc(db, "users", USER_A)));
  });

  it("4. user A lit users/B → DENY", async () => {
    const db = ctxFor(USER_A).firestore();
    await assertFails(getDoc(doc(db, "users", USER_B)));
    await assertFails(getDoc(doc(db, "users", USER_B, "subjects", "subj1")));
  });

  it("4bis. user B lit users/A → DENY (symétrie)", async () => {
    const db = ctxFor(USER_B).firestore();
    await assertFails(getDoc(doc(db, "users", USER_A)));
  });

  it("5. user A écrit dans l'espace de B → DENY", async () => {
    const db = ctxFor(USER_A).firestore();
    await assertFails(setDoc(doc(db, "users", USER_B, "subjects", "hack"), {
      name: "Intrusion", color: "#000", order: 1, archivedAt: null, createdAt: new Date()
    }));
    await assertFails(updateDoc(doc(db, "users", USER_B, "courses", "course1"), { name: "Modifié par A" }));
  });
});

/* ============================================================
   6/7/8/9. Entitlement — trial actif / expiré / absent
   ============================================================ */
it("6. trial actif crée une matière → ALLOW", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  await assertSucceeds(setDoc(doc(db, "users", USER_A, "subjects", "subj2"), {
    name: "Pneumologie", color: "#5b8def", order: 20, archivedAt: null, createdAt: new Date()
  }));
});

it("7. trial expiré lit ses matières → ALLOW (lecture jamais coupée)", async () => {
  await seedUser(USER_A, { writeAccessUntil: past() });
  const db = ctxFor(USER_A).firestore();
  await assertSucceeds(getDoc(doc(db, "users", USER_A, "subjects", "subj1")));
  await assertSucceeds(getDoc(doc(db, "users", USER_A, "courses", "course1")));
});

it("8. trial expiré modifie une matière → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: past() });
  const db = ctxFor(USER_A).firestore();
  await assertFails(updateDoc(doc(db, "users", USER_A, "subjects", "subj1"), { name: "Renommée" }));
  await assertFails(setDoc(doc(db, "users", USER_A, "subjects", "subj2"), {
    name: "Nouvelle", color: "#000", order: 1, archivedAt: null, createdAt: new Date()
  }));
});

it("9. entitlement absent → écrit → DENY", async () => {
  await seedUser(USER_A, { withEntitlement: false });
  const db = ctxFor(USER_A).firestore();
  await assertFails(setDoc(doc(db, "users", USER_A, "subjects", "subj2"), {
    name: "Nouvelle", color: "#000", order: 1, archivedAt: null, createdAt: new Date()
  }));
});

/* ============================================================
   10/11/12/13/14. Champs backend-only
   ============================================================ */
it("10. user modifie son propre entitlement → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  await assertFails(updateDoc(doc(db, "entitlements", USER_A), { writeAccessUntil: future() }));
  await assertFails(setDoc(doc(db, "entitlements", USER_A), { status: "active" }, { merge: true }));
});

it("11. user écrit billingPrivate → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  await assertFails(setDoc(doc(db, "billingPrivate", USER_A), { stripeCustomerId: "cus_hacked" }));
});

it("12. user lit billingPrivate → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  await assertFails(getDoc(doc(db, "billingPrivate", USER_A)));
});

it("13. user écrit userStats → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  await assertFails(setDoc(doc(db, "userStats", USER_A), { toursDone: 999 }));
});

it("14. user écrit un trophée (achievements) → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  await assertFails(setDoc(doc(db, "achievements", USER_A), { unlocked: { fake: true } }));
});

/* ============================================================
   15/16. Soft delete uniquement
   ============================================================ */
it("15. user fait deleteDoc(course) → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  await assertFails(deleteDoc(doc(db, "users", USER_A, "courses", "course1")));
});

it("16. user archive un course (archivedAt) → ALLOW", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  await assertSucceeds(updateDoc(doc(db, "users", USER_A, "courses", "course1"), {
    archivedAt: new Date()
  }));
});

/* ============================================================
   17. Collection inconnue → DENY
   ============================================================ */
it("17. collection inconnue → DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  await assertFails(getDoc(doc(db, "totallyUnknownCollection", "x")));
  await assertFails(setDoc(doc(db, "totallyUnknownCollection", "x"), { a: 1 }));
});

/* ============================================================
   Bonus : tourLogs append-only, notes/flashcards/errorEntries/
   trainingItems/tasks/calendarDays isolés par uid.
   ============================================================ */
it("bonus. tourLogs : create ALLOW, update/delete DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  const logRef = doc(collection(db, "users", USER_A, "courses", "course1", "tourLogs"));
  await assertSucceeds(setDoc(logRef, { tourNumber: 1, confidence: 4, date: new Date(), createdAt: new Date() }));
  await assertFails(updateDoc(logRef, { confidence: 5 }));
  await assertFails(deleteDoc(logRef));
});

it("bonus. notes : owner peut créer/lire, autre utilisateur DENY", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  await seedUser(USER_B, { writeAccessUntil: future() });
  const dbA = ctxFor(USER_A).firestore();
  const dbB = ctxFor(USER_B).firestore();
  await assertSucceeds(setDoc(doc(dbA, "users", USER_A, "notes", "course_course1"), {
    entityType: "course", entityId: "course1", html: "<p>Note</p>", revision: 1, updatedAt: new Date()
  }));
  await assertFails(getDoc(doc(dbB, "users", USER_A, "notes", "course_course1")));
});

it("bonus. calendarDays : lecture seule en trial expiré, écriture bloquée", async () => {
  await seedUser(USER_A, { writeAccessUntil: past() });
  const db = ctxFor(USER_A).firestore();
  await assertFails(setDoc(doc(db, "users", USER_A, "calendarDays", "2026-09-01"), {
    plannedType: "revision", updatedAt: new Date()
  }));
});

/* ============================================================
   Item 41/73 — double validation quasi simultanée d'un Tour
   (deux onglets/appareils). Reproduit exactement la transaction
   de public/tableur.html (validateTour) contre l'émulateur, avec
   les Rules ACTIVÉES (contexte authentifié réel, pas un bypass
   admin) : lecture course → tourNumber suivant → écriture tourLog
   + mise à jour du résumé course, dans une seule transaction.
   Attendu : aucune collision de tourNumber, tourCount final = 2.
   ============================================================ */
async function validateTourLikeApp(db, uid, courseId, confidence) {
  const courseRef = doc(db, "users", uid, "courses", courseId);
  const tourLogRef = doc(collection(courseRef, "tourLogs"));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(courseRef);
    const data = snap.data();
    const nextTourNumber = (data.tourCount || 0) + 1;
    const tourConfidences = Array.isArray(data.tourConfidences) ? data.tourConfidences.slice() : [];
    while (tourConfidences.length < nextTourNumber - 1) tourConfidences.push(null);
    tourConfidences[nextTourNumber - 1] = confidence;
    tx.set(tourLogRef, { tourNumber: nextTourNumber, confidence, date: new Date(), createdAt: serverTimestamp() });
    tx.update(courseRef, { tourCount: nextTourNumber, lastTourAt: new Date(), lastTourConfidence: confidence, tourConfidences, updatedAt: serverTimestamp() });
    return nextTourNumber;
  });
}

it("41/73. deux validations de Tour quasi simultanées → pas de collision", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  const [n1, n2] = await Promise.all([
    validateTourLikeApp(db, USER_A, "course1", 4),
    validateTourLikeApp(db, USER_A, "course1", 5)
  ]);
  assert.notEqual(n1, n2, "les deux tours ne doivent jamais recevoir le même tourNumber");
  assert.deepEqual([n1, n2].sort(), [1, 2]);

  // Lecture toujours autorisée pour le propriétaire (lecture jamais coupée),
  // pas besoin de désactiver les Rules pour vérifier le résultat final.
  const finalSnap = await getDoc(doc(db, "users", USER_A, "courses", "course1"));
  assert.equal(finalSnap.data().tourCount, 2, "tourCount final doit refléter les 2 tours, sans perte d'écriture");
});

/* ============================================================
   Régression : un cours dont tourCount avance sans que
   tourConfidences ait été rempli à chaque étape (ex. données
   créées avant l'ajout de ce champ) ne doit jamais produire un
   tableau à "trous" (undefined) — Firestore refuse ce genre de
   valeur au moment de l'écriture. Bug réel trouvé en QA manuelle,
   corrigé, couvert ici pour ne jamais régresser.
   ============================================================ */
it("régression — tourConfidences sans trou même si le champ n'existait pas encore", async () => {
  await seedUser(USER_A, { writeAccessUntil: future() });
  const db = ctxFor(USER_A).firestore();
  // Simule un cours déjà à 2 tours mais sans tourConfidences (données
  // antérieures à l'ajout du champ) — comme rencontré en conditions réelles.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", USER_A, "courses", "course1"), { tourCount: 2 }, { merge: true });
  });

  await assertSucceeds(validateTourLikeApp(db, USER_A, "course1", 1));

  const finalSnap = await getDoc(doc(db, "users", USER_A, "courses", "course1"));
  const confidences = finalSnap.data().tourConfidences;
  assert.equal(confidences.length, 3);
  assert.equal(confidences[2], 1);
  assert.ok(confidences.every((v) => v !== undefined), "aucun élément du tableau ne doit être undefined");
});

/* ============================================================
   backups/{backupId} — filet de sécurité SERVEUR UNIQUEMENT.
   ⚠️ Audit perte de données (2026-09-30) : avant ce correctif, le propriétaire pouvait
   créer ET supprimer ses propres sauvegardes (`canWrite(uid)`), pensé pour un système de
   sauvegarde côté client qui n'a jamais existé — un bug ou un script aurait pu supprimer
   les vraies sauvegardes. Seules les Cloud Functions (Admin SDK, contournent ces Rules)
   écrivent désormais dans backups/ et backups/{id}/parts/ ; le client n'a plus QUE la
   lecture (propriétaire ou admin). Ces tests DOIVENT échouer sur l'ancienne règle
   (`allow create/delete: if canWrite(uid)`) — c'est exactement ce qu'ils prouvent.
   ============================================================ */
describe("Sauvegardes (backups)", () => {
  beforeEach(async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    await seedUser(USER_B, { writeAccessUntil: future() });
  });

  it("trial actif : le propriétaire ne peut PLUS créer de sauvegarde lui-même → DENY", async () => {
    const db = ctxFor(USER_A).firestore();
    const ref = doc(db, "users", USER_A, "backups", "b1");
    await assertFails(setDoc(ref, { createdAt: new Date(), snapshot: { subjects: 1 }, isManual: false }));
  });

  it("trial actif : le propriétaire ne peut PLUS supprimer une sauvegarde existante → DENY", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", USER_A, "backups", "b1"), { createdAt: new Date() });
    });
    const db = ctxFor(USER_A).firestore();
    await assertFails(deleteDoc(doc(db, "users", USER_A, "backups", "b1")));
  });

  it("le propriétaire peut LIRE ses propres sauvegardes (transparence) → ALLOW", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", USER_A, "backups", "b1"), { createdAt: new Date() });
    });
    const db = ctxFor(USER_A).firestore();
    await assertSucceeds(getDoc(doc(db, "users", USER_A, "backups", "b1")));
  });

  it("modifier une sauvegarde existante → DENY (immuable)", async () => {
    const db = ctxFor(USER_A).firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", USER_A, "backups", "b1"), { createdAt: new Date() });
    });
    await assertFails(updateDoc(doc(db, "users", USER_A, "backups", "b1"), { createdAt: new Date() }));
  });

  it("user B ne peut ni lire ni supprimer une sauvegarde de A → DENY", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", USER_A, "backups", "b1"), { createdAt: new Date() });
    });
    const dbB = ctxFor(USER_B).firestore();
    await assertFails(getDoc(doc(dbB, "users", USER_A, "backups", "b1")));
    await assertFails(deleteDoc(doc(dbB, "users", USER_A, "backups", "b1")));
  });

  it("admin (isAdmin=true) peut LIRE la sauvegarde d'un autre utilisateur → ALLOW", async () => {
    await seedAdmin("admin1");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", USER_A, "backups", "b1"), { createdAt: new Date() });
    });
    const dbAdmin = ctxFor("admin1").firestore();
    await assertSucceeds(getDoc(doc(dbAdmin, "users", USER_A, "backups", "b1")));
  });

  it("backups/{id}/parts/{partId} : ni le propriétaire ni un tiers ne peuvent écrire → DENY, lecture propriétaire → ALLOW", async () => {
    // ⚠️ Piège SDK trouvé en écrivant ce test (@firebase/rules-unit-testing + firebase JS SDK) :
    // appeler ctx.firestore() DEUX FOIS dans le même withSecurityRulesDisabled(), la 2e fois sur
    // une sous-collection, casse tout appel .firestore() ULTÉRIEUR sur un autre contexte avec
    // "Firestore has already been started and its settings can no longer be changed" — même avec
    // des Rules triviales sur un projet jetable, rien à voir avec la logique de ce fichier.
    // Réutiliser la MÊME instance résout le problème.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(doc(fs, "users", USER_A, "backups", "b1"), { createdAt: new Date() });
      await setDoc(doc(fs, "users", USER_A, "backups", "b1", "parts", "0"), { chunk: "x" });
    });
    await assertFails(setDoc(doc(ctxFor(USER_A).firestore(), "users", USER_A, "backups", "b1", "parts", "1"), { chunk: "y" }));
    await assertFails(deleteDoc(doc(ctxFor(USER_A).firestore(), "users", USER_A, "backups", "b1", "parts", "0")));
    await assertSucceeds(getDoc(doc(ctxFor(USER_A).firestore(), "users", USER_A, "backups", "b1", "parts", "0")));
  });
});

/* ============================================================
   feedbacks/{feedbackId} — envoyable même en lecture seule
   (pas gaté par canWrite), immuable, lecture strictement propriétaire.
   Bug de test corrigé (incohérence trouvée en auditant les Rules à la
   demande de l'utilisateur) : ce bloc ciblait "feedback" au singulier,
   qui ne correspond ni à firestore.rules (match /feedbacks/{feedbackId},
   PLURIEL — voir son commentaire, déjà corrigé dans une session
   précédente) ni au code client réel (tableur.html : addDoc(collection(db,
   'feedbacks'), ...)). Comme "feedback" singulier ne correspond à AUCUNE
   règle, il retombait sur le fallback fail-closed racine : tous les
   assertSucceeds() ci-dessous auraient dû ÉCHOUER si ce fichier avait
   tourné contre les Rules actuelles — need aussi utiliser le champ réel
   `userId` (pas `uid`, voir le commentaire de firestore.rules) pour que
   les règles d'égalité avec request.auth.uid s'appliquent correctement. */
describe("Feedback utilisateur", () => {
  it("envoyer un feedback même avec un entitlement expiré → ALLOW", async () => {
    await seedUser(USER_A, { writeAccessUntil: past() });
    const db = ctxFor(USER_A).firestore();
    await assertSucceeds(setDoc(doc(db, "feedbacks", "f1"), {
      userId: USER_A, message: "Un souci avec la méthode des J.", createdAt: new Date()
    }));
  });

  it("usurper l'uid d'un autre dans un feedback → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    const db = ctxFor(USER_A).firestore();
    await assertFails(setDoc(doc(db, "feedbacks", "f2"), {
      userId: "quelquun-dautre", message: "Usurpation", createdAt: new Date()
    }));
  });

  it("message vide ou trop long → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    const db = ctxFor(USER_A).firestore();
    await assertFails(setDoc(doc(db, "feedbacks", "f3"), { userId: USER_A, message: "", createdAt: new Date() }));
    await assertFails(setDoc(doc(db, "feedbacks", "f4"), { userId: USER_A, message: "x".repeat(2001), createdAt: new Date() }));
  });

  it("lire le feedback d'un autre utilisateur → DENY ; modifier/supprimer le sien → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    await seedUser(USER_B, { writeAccessUntil: future() });
    const dbA = ctxFor(USER_A).firestore();
    await setDoc(doc(dbA, "feedbacks", "f5"), { userId: USER_A, message: "Bonjour", createdAt: new Date() });
    await assertSucceeds(getDoc(doc(dbA, "feedbacks", "f5")));
    const dbB = ctxFor(USER_B).firestore();
    await assertFails(getDoc(doc(dbB, "feedbacks", "f5")));
    await assertFails(updateDoc(doc(dbA, "feedbacks", "f5"), { message: "Modifié" }));
    await assertFails(deleteDoc(doc(dbA, "feedbacks", "f5")));
  });

  it("email non vérifié envoie un feedback → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    const db = ctxFor(USER_A, { verified: false }).firestore();
    await assertFails(setDoc(doc(db, "feedbacks", "f6"), { userId: USER_A, message: "Test", createdAt: new Date() }));
  });
});

/* ============================================================
   dailyStats/{dayKey} — agrégats pour les graphiques, écriture
   gatée par canWrite comme le reste des données applicatives,
   pas de suppression, isolation A/B.
   ============================================================ */
describe("Agrégats quotidiens (dailyStats)", () => {
  it("trial actif : créer/mettre à jour un agrégat du jour → ALLOW", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    const db = ctxFor(USER_A).firestore();
    const ref = doc(db, "users", USER_A, "dailyStats", "2026-09-01");
    await assertSucceeds(setDoc(ref, { tourCount: 1, minutes: 45 }));
    await assertSucceeds(updateDoc(ref, { tourCount: 2, minutes: 90 }));
  });

  it("trial expiré : écrire un agrégat → DENY, lire → ALLOW", async () => {
    await seedUser(USER_A, { writeAccessUntil: past() });
    const db = ctxFor(USER_A).firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", USER_A, "dailyStats", "2026-09-01"), { tourCount: 1 });
    });
    await assertSucceeds(getDoc(doc(db, "users", USER_A, "dailyStats", "2026-09-01")));
    await assertFails(setDoc(doc(db, "users", USER_A, "dailyStats", "2026-09-02"), { tourCount: 1 }));
  });

  it("user B ne peut pas lire les agrégats de A → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    await seedUser(USER_B, { writeAccessUntil: future() });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", USER_A, "dailyStats", "2026-09-01"), { tourCount: 1 });
    });
    const dbB = ctxFor(USER_B).firestore();
    await assertFails(getDoc(doc(dbB, "users", USER_A, "dailyStats", "2026-09-01")));
  });
});

/* ============================================================
   PARRAINAGE — referralCodes/{code} et referrals/{filleulUid}.
   Entièrement backend-only : jamais d'écriture cliente (comme
   billingPrivate), lecture réservée à l'admin (comme billingPrivate).
   ============================================================ */
async function seedAdmin(uid) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid), {
      displayName: "Admin " + uid, email: uid + "@example.com", createdAt: new Date(), isAdmin: true
    });
  });
}

describe("Parrainage (referralCodes / referrals)", () => {
  it("referralCodes/{code} : propriétaire du code lui-même ne peut PAS le lire → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "referralCodes", "AB23DE"), { uid: USER_A, createdAt: new Date() });
    });
    const db = ctxFor(USER_A).firestore();
    await assertFails(getDoc(doc(db, "referralCodes", "AB23DE")));
  });

  it("referralCodes/{code} : admin peut lire ; écriture cliente refusée même pour l'admin", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    await seedAdmin("admin1");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "referralCodes", "AB23DE"), { uid: USER_A, createdAt: new Date() });
    });
    const dbAdmin = ctxFor("admin1").firestore();
    await assertSucceeds(getDoc(doc(dbAdmin, "referralCodes", "AB23DE")));
    await assertFails(setDoc(doc(dbAdmin, "referralCodes", "ZZ99ZZ"), { uid: "admin1", createdAt: new Date() }));
    await assertFails(updateDoc(doc(dbAdmin, "referralCodes", "AB23DE"), { uid: "admin1" }));
    await assertFails(deleteDoc(doc(dbAdmin, "referralCodes", "AB23DE")));
  });

  it("referrals/{filleulUid} : ni le filleul ni le parrain ne peuvent le lire ou l'écrire → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() }); // filleul
    await seedUser(USER_B, { writeAccessUntil: future() }); // parrain
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "referrals", USER_A), {
        referrerUid: USER_B, code: "AB23DE", createdAt: new Date(), active: false, activatedAt: null
      });
    });
    const dbA = ctxFor(USER_A).firestore(), dbB = ctxFor(USER_B).firestore();
    await assertFails(getDoc(doc(dbA, "referrals", USER_A)));
    await assertFails(getDoc(doc(dbB, "referrals", USER_A)));
    await assertFails(updateDoc(doc(dbA, "referrals", USER_A), { active: true }));
    await assertFails(setDoc(doc(dbB, "referrals", "fake"), { referrerUid: USER_B, code: "ZZ99ZZ", createdAt: new Date(), active: true }));
  });

  it("referrals/{filleulUid} : admin peut lire", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    await seedAdmin("admin1");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "referrals", USER_A), {
        referrerUid: "someone", code: "AB23DE", createdAt: new Date(), active: true, activatedAt: new Date()
      });
    });
    const dbAdmin = ctxFor("admin1").firestore();
    await assertSucceeds(getDoc(doc(dbAdmin, "referrals", USER_A)));
  });

  it("entitlements/{uid} : les champs de parrainage restent bloqués en écriture cliente comme le reste du document", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    const db = ctxFor(USER_A).firestore();
    await assertFails(updateDoc(doc(db, "entitlements", USER_A), { referralActiveCount: 99, referralMonthsGranted: 99 }));
    await assertFails(updateDoc(doc(db, "entitlements", USER_A), { referralSeenCount: 99 })); // accusé de la notification : serveur seulement
    await assertFails(updateDoc(doc(db, "entitlements", USER_A), { planType: "referral", status: "active" }));
  });

  it("users/{uid} : le champ referralCode reste bloqué en écriture cliente comme le reste du document", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    const db = ctxFor(USER_A).firestore();
    await assertFails(updateDoc(doc(db, "users", USER_A), { referralCode: "ZZ99ZZ" }));
  });
});
