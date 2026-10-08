/* ============================================================
   P1PLANNER — Audit sauvegardes/pertes (2026-09-30, demande explicite de Jean)
   Tests du VRAI code de functions/index.js (adminCreateBackup / adminRestoreBackup /
   _runScheduledBackups), via fns.<nom>.run() / fns.__backupTest, contre l'ÉMULATEUR
   Firestore + Auth réels. Couvre D1 (sauvegarde automatique nocturne), D2 (contenu
   incomplet — notesEntrainements/settings.preferences absents), D3 (notes retirées
   au-delà de 750 Ko) et D5 (restauration "compléter" vs "remplacer").
   ============================================================ */
import assert from "node:assert/strict";
import admin from "firebase-admin";
import { fns, db, auth } from "./lib/referral-harness.mjs";

const tokenFor = (uid, verified) => ({ email: uid + "@test.fr", email_verified: verified, name: uid });
const callAsAdmin = (name, adminUid, data) => fns[name].run({
  data: data || {}, auth: { uid: adminUid, token: tokenFor(adminUid, true) }, rawRequest: {}
});

async function seedAdmin(uid) {
  await db.doc(`users/${uid}`).set({ email: uid + "@test.fr", displayName: "Admin " + uid, isAdmin: true, createdAt: new Date() }, { merge: true });
}
async function seedTargetUser(uid) {
  await db.doc(`users/${uid}`).set({ email: uid + "@test.fr", displayName: uid, createdAt: new Date() }, { merge: true });
}
async function clearBackupTestCollections() {
  const collections = ["users", "backups"]; // "backups" est une sous-collection : purge récursive via users
  const usersSnap = await db.collection("users").get();
  for (const u of usersSnap.docs) {
    for (const sub of ["backups", "courses", "subjects", "notes", "notesEntrainements", "trainingItems", "tasks", "calendarDays", "dailyStats", "flashcards", "errorEntries"]) {
      const subSnap = await db.collection(`users/${u.id}/${sub}`).get();
      for (const d of subSnap.docs) {
        const partsSnap = await d.ref.collection("parts").get().catch(() => ({ docs: [] }));
        for (const p of partsSnap.docs) await p.ref.delete();
        await d.ref.delete();
      }
    }
    await db.doc(`users/${u.id}/settings/preferences`).delete().catch(() => {});
    await u.ref.delete();
  }
}

describe("Sauvegardes/restauration — Cloud Functions (vrai code)", function () {
  this.timeout(60000);
  beforeEach(async () => { await clearBackupTestCollections(); });

  describe("D2/D3 — contenu de la sauvegarde", () => {
    it("D2 : notesEntrainements ET settings/preferences sont bien inclus dans la sauvegarde (absents avant ce correctif)", async () => {
      await seedAdmin("ADM1");
      await seedTargetUser("U1");
      await db.doc("users/U1/notesEntrainements/train1").set({ html: "<p>Erreur fréquente sur les tours</p>" });
      await db.doc("users/U1/settings/preferences").set({ customResources: [{ id: "r1", label: "Ma ressource", color: "#fff", archived: false }], deletedDefaultIds: [42] });

      const res = await callAsAdmin("adminCreateBackup", "ADM1", { targetUid: "U1" });
      assert.ok(res.backupId, "aucun backupId renvoyé");

      const snapshot = await fns.__backupTest._readBackupSnapshot(await db.doc(`users/U1/backups/${res.backupId}`).get());
      assert.ok(Array.isArray(snapshot.notesEntrainements) && snapshot.notesEntrainements.length === 1, "notesEntrainements absent de la sauvegarde : " + JSON.stringify(snapshot.notesEntrainements));
      assert.equal(snapshot.notesEntrainements[0].data.html, "<p>Erreur fréquente sur les tours</p>");
      assert.ok(snapshot.settingsPreferences && Array.isArray(snapshot.settingsPreferences.customResources), "settingsPreferences absent de la sauvegarde : " + JSON.stringify(snapshot.settingsPreferences));
      assert.deepEqual(snapshot.settingsPreferences.deletedDefaultIds, [42]);
    });

    it("D3 : une sauvegarde volumineuse (>1,5 Mo de notes) n'est JAMAIS tronquée — découpée en plusieurs parties reconstituées à l'identique", async () => {
      await seedAdmin("ADM2");
      await seedTargetUser("U2");
      // ~1,6 Mo répartis sur 3 notes distinctes (bien au-delà de l'ancien seuil de 750 Ko qui
      // aurait purement et simplement RETIRÉ "notes" de la sauvegarde).
      const bigText = "X".repeat(550000);
      await db.doc("users/U2/notes/n1").set({ html: bigText, courseId: "c1" });
      await db.doc("users/U2/notes/n2").set({ html: bigText, courseId: "c2" });
      await db.doc("users/U2/notes/n3").set({ html: bigText, courseId: "c3" });

      const res = await callAsAdmin("adminCreateBackup", "ADM2", { targetUid: "U2" });
      const headSnap = await db.doc(`users/U2/backups/${res.backupId}`).get();
      const head = headSnap.data();
      assert.equal(head.format, "v2", "format v2 attendu");
      assert.ok(head.partCount > 1, "une seule partie pour ~1,6 Mo : le découpage n'a pas eu lieu (partCount=" + head.partCount + ")");

      const snapshot = await fns.__backupTest._readBackupSnapshot(headSnap);
      assert.ok(Array.isArray(snapshot.notes) && snapshot.notes.length === 3, "notes RETIRÉES de la sauvegarde volumineuse (régression du bug D3) : " + JSON.stringify(snapshot.notes && snapshot.notes.length));
      const n1 = snapshot.notes.find((n) => n.id === "n1");
      assert.equal(n1.data.html.length, bigText.length, "contenu de la note n1 tronqué/corrompu après réassemblage des parties");
      assert.equal(n1.data.html, bigText, "contenu de la note n1 différent après réassemblage (corruption)");
    });
  });

  describe("D5 — restauration : mode « compléter » (par défaut) vs « remplacer »", () => {
    it("mode compléter (défaut) : ne touche JAMAIS un document présent/actif/non-vide, désarchive un document archivé, remplit une note vide", async () => {
      await seedAdmin("ADM3");
      await seedTargetUser("U3");
      // État AU MOMENT DE LA SAUVEGARDE : c2 encore ACTIF (pas archivé).
      await db.doc("users/U3/courses/c1").set({ name: "Cours actif", archivedAt: null, tourCount: 1 });
      await db.doc("users/U3/courses/c2").set({ name: "Cours à réapparaître", archivedAt: null, tourCount: 3 });
      await db.doc("users/U3/notes/n1").set({ html: "Contenu original", courseId: "c1" });
      const backupRes = await callAsAdmin("adminCreateBackup", "ADM3", { targetUid: "U3" });

      // État APRÈS la sauvegarde, avant restauration :
      // - c1 modifié par un VRAI travail plus récent de l'utilisateur (ne doit PAS être écrasé) ;
      await db.doc("users/U3/courses/c1").set({ name: "Cours actif", archivedAt: null, tourCount: 4 }, { merge: true });
      // - c2 archivé DEPUIS la sauvegarde (ex. supprimé par erreur) -> doit être désarchivé ;
      await db.doc("users/U3/courses/c2").set({ archivedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      // - n1 vidé (suppression accidentelle de son contenu) -> doit être rempli.
      await db.doc("users/U3/notes/n1").set({ html: "", courseId: "c1" }, { merge: true });

      const restoreRes = await callAsAdmin("adminRestoreBackup", "ADM3", { targetUid: "U3", backupId: backupRes.backupId });
      assert.equal(restoreRes.mode, "merge");

      const c1After = (await db.doc("users/U3/courses/c1").get()).data();
      assert.equal(c1After.tourCount, 4, "le mode compléter a écrasé un cours présent/actif avec une valeur plus ANCIENNE de la sauvegarde — ce n'est PAS ce que 'compléter' doit faire");

      const c2After = (await db.doc("users/U3/courses/c2").get()).data();
      assert.equal(c2After.archivedAt, null, "le cours archivé depuis la sauvegarde n'a pas été désarchivé par le mode compléter : " + JSON.stringify(c2After.archivedAt));
      assert.equal(c2After.tourCount, 3, "le contenu du cours désarchivé n'a pas été restauré");

      const n1After = (await db.doc("users/U3/notes/n1").get()).data();
      assert.equal(n1After.html, "Contenu original", "la note vidée n'a pas été remplie par le mode compléter : " + JSON.stringify(n1After.html));
    });

    it("document absent au moment de la restauration : recréé même en mode compléter", async () => {
      await seedAdmin("ADM4");
      await seedTargetUser("U4");
      await db.doc("users/U4/courses/c1").set({ name: "Cours à recréer", archivedAt: null, tourCount: 2 });
      const backupRes = await callAsAdmin("adminCreateBackup", "ADM4", { targetUid: "U4" });
      await db.doc("users/U4/courses/c1").delete(); // suppression physique directe (jamais via l'appli, mais simule une perte)

      await callAsAdmin("adminRestoreBackup", "ADM4", { targetUid: "U4", backupId: backupRes.backupId });
      const c1After = await db.doc("users/U4/courses/c1").get();
      assert.ok(c1After.exists, "le document absent n'a pas été recréé par le mode compléter");
      assert.equal(c1After.data().tourCount, 2);
    });

    it("mode remplacer (explicite) : réécrit même un document présent/actif — comportement historique préservé", async () => {
      await seedAdmin("ADM5");
      await seedTargetUser("U5");
      await db.doc("users/U5/courses/c1").set({ name: "Cours", archivedAt: null, tourCount: 1 });
      const backupRes = await callAsAdmin("adminCreateBackup", "ADM5", { targetUid: "U5" });
      await db.doc("users/U5/courses/c1").set({ name: "Cours", archivedAt: null, tourCount: 99 }, { merge: true });

      const restoreRes = await callAsAdmin("adminRestoreBackup", "ADM5", { targetUid: "U5", backupId: backupRes.backupId, mode: "replace" });
      assert.equal(restoreRes.mode, "replace");
      const c1After = (await db.doc("users/U5/courses/c1").get()).data();
      assert.equal(c1After.tourCount, 1, "le mode remplacer n'a pas réécrit un document pourtant présent (régression du comportement historique)");
    });

    it("settings/preferences : recréé s'il est absent (compléter), toujours réécrit en mode remplacer", async () => {
      await seedAdmin("ADM6");
      await seedTargetUser("U6");
      await db.doc("users/U6/settings/preferences").set({ deletedDefaultIds: [7] });
      const backupRes = await callAsAdmin("adminCreateBackup", "ADM6", { targetUid: "U6" });
      await db.doc("users/U6/settings/preferences").delete();

      await callAsAdmin("adminRestoreBackup", "ADM6", { targetUid: "U6", backupId: backupRes.backupId });
      const prefsAfter = (await db.doc("users/U6/settings/preferences").get()).data();
      assert.deepEqual(prefsAfter.deletedDefaultIds, [7], "settings/preferences absent n'a pas été recréé par le mode compléter");
    });
  });

  describe("A6/L6 (audit 02/10) — restauration « compléter » : fusion des catalogues personnalisables", () => {
    it("settings/preferences DÉJÀ PRÉSENT (cas quasi systématique) : une entrée de catalogue perdue depuis la sauvegarde est RESTAURÉE par fusion, jamais ignorée (bug corrigé)", async () => {
      await seedAdmin("ADM8");
      await seedTargetUser("U8");
      await db.doc("users/U8/settings/preferences").set({
        customResources: [{ id: "r1", label: "Annale perso", color: "#fff", archived: false, u: 1000 }],
        deletedDefaultIds: [10]
      });
      const backupRes = await callAsAdmin("adminCreateBackup", "ADM8", { targetUid: "U8" });

      // Depuis la sauvegarde : r1 a été perdue (bug/écrasement client, voir L1), un AUTRE
      // réglage (deletedDefaultIds) a lui reçu un ajout légitime plus récent entre-temps.
      await db.doc("users/U8/settings/preferences").set({ customResources: [], deletedDefaultIds: [10, 20] });

      await callAsAdmin("adminRestoreBackup", "ADM8", { targetUid: "U8", backupId: backupRes.backupId });
      const after = (await db.doc("users/U8/settings/preferences").get()).data();
      assert.ok(Array.isArray(after.customResources) && after.customResources.some((r) => r.id === "r1"),
        "AVANT ce correctif : settings/preferences déjà présent -> la sauvegarde n'était JAMAIS consultée, r1 restait perdue pour toujours. Après : " + JSON.stringify(after.customResources));
      assert.deepEqual(after.deletedDefaultIds.slice().sort(), [10, 20], "l'ajout fait APRÈS la sauvegarde (20) a été écrasé par la fusion — ce n'est pas ce que « compléter » doit faire : " + JSON.stringify(after.deletedDefaultIds));
    });

    it("conflit sur le MÊME id : la version la plus RÉCENTE (horodatage u) gagne, dans les deux sens", async () => {
      await seedAdmin("ADM9");
      await seedTargetUser("U9");
      await db.doc("users/U9/settings/preferences").set({
        customResources: [{ id: "r1", label: "Nom au moment de la sauvegarde", color: "#111", archived: false, u: 5000 }]
      });
      const backupRes = await callAsAdmin("adminCreateBackup", "ADM9", { targetUid: "U9" });

      // Renommage réel plus récent qu'au moment de la sauvegarde -> doit SURVIVRE à la fusion.
      await db.doc("users/U9/settings/preferences").set({
        customResources: [{ id: "r1", label: "Nom renommé APRÈS la sauvegarde", color: "#111", archived: false, u: 9000 }]
      });
      await callAsAdmin("adminRestoreBackup", "ADM9", { targetUid: "U9", backupId: backupRes.backupId });
      const after1 = (await db.doc("users/U9/settings/preferences").get()).data();
      assert.equal(after1.customResources.find((r) => r.id === "r1").label, "Nom renommé APRÈS la sauvegarde",
        "une version PLUS RÉCENTE que la sauvegarde a été écrasée par la fusion (sens 1)");

      // Sens inverse : la sauvegarde elle-même est la plus récente (ex. une édition locale
      // malheureuse plus ancienne, horodatage plus petit) -> la sauvegarde doit l'emporter.
      await db.doc("users/U9/settings/preferences").set({
        customResources: [{ id: "r1", label: "Nom renommé APRÈS la sauvegarde", color: "#111", archived: false, u: 1 }]
      });
      await callAsAdmin("adminRestoreBackup", "ADM9", { targetUid: "U9", backupId: backupRes.backupId });
      const after2 = (await db.doc("users/U9/settings/preferences").get()).data();
      assert.equal(after2.customResources.find((r) => r.id === "r1").label, "Nom au moment de la sauvegarde",
        "la version la PLUS RÉCENTE (celle de la sauvegarde, u=5000 > 1) n'a pas gagné (sens 2)");
    });

    it("aucun changement nécessaire (catalogues déjà identiques ou plus complets) : aucune écriture inutile", async () => {
      await seedAdmin("ADM10");
      await seedTargetUser("U10");
      await db.doc("users/U10/settings/preferences").set({
        customResources: [{ id: "r1", label: "Stable", color: "#111", archived: false, u: 10 }],
        theme: "dark"
      });
      const backupRes = await callAsAdmin("adminCreateBackup", "ADM10", { targetUid: "U10" });
      const restoreRes = await callAsAdmin("adminRestoreBackup", "ADM10", { targetUid: "U10", backupId: backupRes.backupId });
      // settingsPreferences ne doit pas être compté comme "restauré" si rien n'a réellement changé.
      assert.ok(!restoreRes.perCollectionCounts || !restoreRes.perCollectionCounts.settingsPreferences,
        "une écriture a eu lieu alors qu'aucun catalogue n'avait changé : " + JSON.stringify(restoreRes.perCollectionCounts));
      const after = (await db.doc("users/U10/settings/preferences").get()).data();
      assert.equal(after.theme, "dark", "un réglage hors périmètre (thème) a été altéré par ce correctif");
    });
  });

  describe("D1 — sauvegarde automatique nocturne (_runScheduledBackups)", () => {
    async function importUser(uid, { daysAgo }) {
      const lastSignInTime = new Date(Date.now() - daysAgo * 86400000).toUTCString();
      const result = await auth.importUsers([{
        uid, email: uid + "@test.fr", emailVerified: true,
        metadata: { lastSignInTime, creationTime: lastSignInTime }
      }]);
      assert.equal(result.failureCount, 0, "échec import utilisateur test : " + JSON.stringify(result.errors));
      await seedTargetUser(uid);
      await db.doc(`users/${uid}/courses/c1`).set({ name: "Cours", archivedAt: null });
    }
    async function deleteAuthUser(uid) { try { await auth.deleteUser(uid); } catch (e) {} }

    it("crée une sauvegarde automatique pour un utilisateur ACTIF (<3j), aucune pour un INACTIF (>3j)", async () => {
      await importUser("ACTIVE1", { daysAgo: 1 });
      await importUser("OLD1", { daysAgo: 10 });
      try {
        const result = await fns.__backupTest._runScheduledBackups();
        assert.ok(result.checked >= 1, "aucun utilisateur actif examiné : " + JSON.stringify(result));

        const activeBackups = await db.collection("users/ACTIVE1/backups").where("createdBy", "==", "auto").get();
        assert.equal(activeBackups.size, 1, "aucune sauvegarde automatique créée pour l'utilisateur actif");

        const oldBackups = await db.collection("users/OLD1/backups").where("createdBy", "==", "auto").get();
        assert.equal(oldBackups.size, 0, "une sauvegarde a été créée pour un utilisateur inactif depuis >3 jours (ne devrait pas)");
      } finally {
        await deleteAuthUser("ACTIVE1"); await deleteAuthUser("OLD1");
      }
    });

    it("respecte les 72h : un 2e passage immédiat ne recrée PAS de sauvegarde", async () => {
      await importUser("ACTIVE2", { daysAgo: 0 });
      try {
        await fns.__backupTest._runScheduledBackups();
        await fns.__backupTest._runScheduledBackups();
        const backups = await db.collection("users/ACTIVE2/backups").where("createdBy", "==", "auto").get();
        assert.equal(backups.size, 1, "un 2e passage dans les 72h a recréé une sauvegarde (devrait être ignoré) : " + backups.size);
      } finally {
        await deleteAuthUser("ACTIVE2");
      }
    });

    it("ne garde que les 5 dernières sauvegardes AUTOMATIQUES, sans jamais toucher les manuelles/pré-restauration", async () => {
      await seedAdmin("ADM7");
      await importUser("ACTIVE3", { daysAgo: 0 });
      // Repart d'un état propre : ACTIVE3 est un identifiant FIXE réutilisé d'une exécution à l'autre, ses sauvegardes
      // résiduelles (19 auto observées) faussaient le décompte attendu (faux échec, pas un bug de purge).
      for (const d of (await db.collection("users/ACTIVE3/backups").get()).docs) {
        for (const p of (await d.ref.collection("parts").get()).docs) await p.ref.delete();
        await d.ref.delete();
      }
      try {
        // 7 fausses sauvegardes automatiques déjà anciennes (>72h, pour ne pas être re-déduppliquées).
        for (let i = 0; i < 7; i++) {
          const built = await fns.__backupTest._buildBackupSnapshot("ACTIVE3");
          const ref = db.collection("users/ACTIVE3/backups").doc();
          await ref.set({ createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - (10 - i) * 86400000), createdBy: "auto", format: "v2", partCount: built.parts.length, docCount: built.docCount });
          for (let j = 0; j < built.parts.length; j++) await ref.collection("parts").doc(String(j)).set({ chunk: built.parts[j] });
        }
        // Une sauvegarde MANUELLE et une "avant restauration", jamais concernées par la purge.
        await callAsAdmin("adminCreateBackup", "ADM7", { targetUid: "ACTIVE3", label: "Manuelle témoin" });
        const preRestoreRef = db.collection("users/ACTIVE3/backups").doc();
        await preRestoreRef.set({ createdAt: new Date(), createdBy: "admin_auto_pre_restore", format: "v2", partCount: 1 });
        await preRestoreRef.collection("parts").doc("0").set({ chunk: "{}" });

        await fns.__backupTest._runScheduledBackups(); // crée la 8e auto (utilisateur actif, aucune récente) + purge

        const autoBackups = await db.collection("users/ACTIVE3/backups").where("createdBy", "==", "auto").get();
        assert.equal(autoBackups.size, 5, "la purge ne garde pas exactement 5 sauvegardes automatiques : " + autoBackups.size);

        const manualBackups = await db.collection("users/ACTIVE3/backups").where("createdBy", "==", "admin").get();
        assert.equal(manualBackups.size, 1, "une sauvegarde MANUELLE a été purgée par erreur");
        const preRestoreBackups = await db.collection("users/ACTIVE3/backups").where("createdBy", "==", "admin_auto_pre_restore").get();
        assert.equal(preRestoreBackups.size, 1, "une sauvegarde 'avant restauration' a été purgée par erreur");
      } finally {
        await deleteAuthUser("ACTIVE3");
      }
    });
  });
});
