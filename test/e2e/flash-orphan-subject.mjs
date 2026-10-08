/* Retour de Jean (02/10, capture d'écran du tiroir "Session Flash") : des groupes nommés par
   un ID Firestore brut ("bank-ue2-bio-c...", "r1nKM5MCGbuajO...") apparaissaient dans le
   sélecteur multi-matières. Cause réelle, confirmée en lisant le code : deleteSpecialty()
   archive la matière et ses cours mais n'a JAMAIS touché aux flashcards qui leur sont liées
   (speId inchangé) -- fidèle au principe "jamais de suppression physique" déjà en place
   ailleurs, mais loadAllFlashCards()/loadAllDueFlashCards() ne filtraient pas ces cartes
   orphelines, et le tiroir ajoutait explicitement TOUT speId rencontré même hors
   SPECIALTIES_DATA (renderFlashDrawerList). speName()/speShort() retombent sur l'ID brut
   quand la matière est introuvable -- d'où le nom affiché.

   FC1 : une matière supprimée (jamais présente dans SPECIALTIES_DATA, cartes orphelines
         simulées directement en base) n'apparaît plus comme groupe dans le tiroir, et ses
         cartes dues ne gonflent plus le badge global -- la matière ACTIVE reste, elle,
         inchangée (pas de sur-correction).
   Vraie page + vrais émulateurs. */
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
  await S("FC1", "flashcards d'une matière supprimée : absentes du tiroir Session Flash et du badge global, la matière active reste intacte", async () => {
    const u = await mkUser({ courses: 0 }); // mkUser crée déjà la matière active "s1" / "MatiereE2E"

    const now = new Date().toISOString();
    // Carte ORPHELINE : speId d'une matière qui n'existe plus (jamais dans SPECIALTIES_DATA,
    // simule exactement l'état laissé par deleteSpecialty() -- la matière est archivée/disparue
    // mais sa carte, elle, n'a jamais été touchée).
    await adb.doc(`users/${u.uid}/flashcards/fc-orphan`).set({
      speId: "deleted-subject-xyz", recto: "<p>Orpheline</p>", verso: "<p>R</p>", itemId: null,
      interval: 0, nextReview: now, lastReview: null, createdAt: now, updatedAt: now, source: "manuel",
    });
    // Carte LÉGITIME : rattachée à la matière active créée par mkUser.
    await adb.doc(`users/${u.uid}/flashcards/fc-active`).set({
      speId: "s1", recto: "<p>Active</p>", verso: "<p>R</p>", itemId: null,
      interval: 0, nextReview: now, lastReview: null, createdAt: now, updatedAt: now, source: "manuel",
    });

    // mkUser({ courses: 0 }) : aucun cours créé -- l'attente par défaut d'openPage()
    // (Object.keys(_p1GetCoursesById()).length > 0) ne se résoudrait donc jamais. On attend à
    // la place le vrai signal de chargement des matières (même pattern que SB2).
    const { page } = await openPage(browser, u, { wait: false });
    await page.waitForFunction(() => window.TPXPerso && window.TPXPerso._state && window.TPXPerso._state.loaded, { timeout: 30000 });

    // loadAllFlashCards()/loadAllDueFlashCards() : la carte orpheline ne doit plus en ressortir.
    const loaded = await page.evaluate(async () => {
      const all = await window.loadAllFlashCards();
      const due = await window.loadAllDueFlashCards();
      return { allSpeIds: all.map((c) => c.speId), dueSpeIds: due.map((c) => c.speId) };
    });
    assert(loaded.allSpeIds.includes("s1"), "la carte de la matière ACTIVE a disparu de loadAllFlashCards() (sur-correction)");
    assert(!loaded.allSpeIds.includes("deleted-subject-xyz"), "la carte ORPHELINE est toujours renvoyée par loadAllFlashCards() : " + JSON.stringify(loaded.allSpeIds));
    assert(loaded.dueSpeIds.includes("s1"), "la carte due de la matière ACTIVE a disparu de loadAllDueFlashCards()");
    assert(!loaded.dueSpeIds.includes("deleted-subject-xyz"), "la carte ORPHELINE due est toujours comptée : " + JSON.stringify(loaded.dueSpeIds));

    // Badge global (#flashGlobalDueCount) : ne doit compter QUE la carte due active (1), jamais
    // la carte orpheline en plus (sinon 2).
    await page.evaluate(() => window.updateFlashGlobalCount());
    await waitFor(async () => (await page.evaluate(() => document.getElementById("flashGlobalDueCount").textContent)) !== "", { timeout: 5000 });
    const badge = await page.evaluate(() => document.getElementById("flashGlobalDueCount").textContent);
    assert(badge === "1", "badge global incorrect : " + JSON.stringify(badge) + " (attendu \"1\", la matière orpheline ne doit pas être comptée)");

    // Tiroir "Session Flash" réel : aucune ligne pour la matière supprimée, une ligne pour la
    // matière active.
    await page.evaluate(() => window.openFlashDrawer());
    await waitFor(async () => (await page.evaluate(() => document.querySelectorAll("#flashDrawerList .flash-drawer-item-wrap").length)) > 0, { timeout: 5000 });
    const rows = await page.evaluate(() => [...document.querySelectorAll("#flashDrawerList .flash-drawer-item-wrap")].map((w) => w.getAttribute("data-spe")));
    assert(rows.includes("s1"), "la matière active est absente du tiroir : " + JSON.stringify(rows));
    assert(!rows.includes("deleted-subject-xyz"), "la matière supprimée apparaît encore comme groupe dans le tiroir : " + JSON.stringify(rows));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
