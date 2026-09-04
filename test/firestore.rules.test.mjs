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
      port: 8080
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
   backups/{backupId} — filet de sécurité : create/read/delete
   autorisés (trial actif), update jamais, isolation A/B respectée.
   ============================================================ */
describe("Sauvegardes (backups)", () => {
  beforeEach(async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    await seedUser(USER_B, { writeAccessUntil: future() });
  });

  it("trial actif : créer puis supprimer une sauvegarde → ALLOW", async () => {
    const db = ctxFor(USER_A).firestore();
    const ref = doc(db, "users", USER_A, "backups", "b1");
    await assertSucceeds(setDoc(ref, { createdAt: new Date(), snapshot: { subjects: 1 }, isManual: false }));
    await assertSucceeds(deleteDoc(ref));
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
});

/* ============================================================
   feedback/{feedbackId} — envoyable même en lecture seule
   (pas gaté par canWrite), immuable, lecture strictement propriétaire.
   ============================================================ */
describe("Feedback utilisateur", () => {
  it("envoyer un feedback même avec un entitlement expiré → ALLOW", async () => {
    await seedUser(USER_A, { writeAccessUntil: past() });
    const db = ctxFor(USER_A).firestore();
    await assertSucceeds(setDoc(doc(db, "feedback", "f1"), {
      uid: USER_A, message: "Un souci avec la méthode des J.", createdAt: new Date()
    }));
  });

  it("usurper l'uid d'un autre dans un feedback → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    const db = ctxFor(USER_A).firestore();
    await assertFails(setDoc(doc(db, "feedback", "f2"), {
      uid: "quelquun-dautre", message: "Usurpation", createdAt: new Date()
    }));
  });

  it("message vide ou trop long → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    const db = ctxFor(USER_A).firestore();
    await assertFails(setDoc(doc(db, "feedback", "f3"), { uid: USER_A, message: "", createdAt: new Date() }));
    await assertFails(setDoc(doc(db, "feedback", "f4"), { uid: USER_A, message: "x".repeat(2001), createdAt: new Date() }));
  });

  it("lire le feedback d'un autre utilisateur → DENY ; modifier/supprimer le sien → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    await seedUser(USER_B, { writeAccessUntil: future() });
    const dbA = ctxFor(USER_A).firestore();
    await setDoc(doc(dbA, "feedback", "f5"), { uid: USER_A, message: "Bonjour", createdAt: new Date() });
    await assertSucceeds(getDoc(doc(dbA, "feedback", "f5")));
    const dbB = ctxFor(USER_B).firestore();
    await assertFails(getDoc(doc(dbB, "feedback", "f5")));
    await assertFails(updateDoc(doc(dbA, "feedback", "f5"), { message: "Modifié" }));
    await assertFails(deleteDoc(doc(dbA, "feedback", "f5")));
  });

  it("email non vérifié envoie un feedback → DENY", async () => {
    await seedUser(USER_A, { writeAccessUntil: future() });
    const db = ctxFor(USER_A, { verified: false }).firestore();
    await assertFails(setDoc(doc(db, "feedback", "f6"), { uid: USER_A, message: "Test", createdAt: new Date() }));
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
