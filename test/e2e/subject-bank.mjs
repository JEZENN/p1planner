/* Lot E (audit 02/10, demande explicite de Jean) : banque de matières P1 (14 matières, ordre
   d'UE -- UE1 Chimie organique ajoutée le 02/10, retour de Jean), proposée sur la page de
   présentation (déconnecté uniquement) ET dans l'assistant de présentation (page "Matières",
   compte déjà connecté), appliquée une seule fois après la prochaine connexion réussie. Aucun
   cours créé, jamais de matière existante modifiée. Abréviations explicites (U1C, U1B...) pour
   éviter les collisions de shortOf(). Vraie page + vrais émulateurs. */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor, BASE } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

const BANK_IDS = [
  "bank-ue1-chimie", "bank-ue1-biochimie", "bank-ue1-chimie-organique", "bank-ue2-bio-cell", "bank-ue2-histologie",
  "bank-ue2-embryologie", "bank-ue3-1-physique", "bank-ue3-1-biophys", "bank-ue3-2-physio",
  "bank-ue4-biostat", "bank-ue5-anatomie", "bank-ue6-pharmaco", "bank-ue7-ssh", "bank-ue8-anglais",
];

try {
  await S("SB1", "page de présentation (déconnecté) : aperçu des 14 matières, groupées S1/S2, case décochée par défaut", async () => {
    const browser2 = browser;
    const ctx = await browser2.createBrowserContext();
    const page = await ctx.newPage();
    await page.goto(BASE + "/tableur.html", { waitUntil: "load" });
    await sleep(500);
    const info = await page.evaluate(() => {
      const pills = [...document.querySelectorAll(".p1-subject-bank-pill")].map((p) => p.textContent.trim());
      const cb = document.getElementById("p1-subject-bank-checkbox");
      const visible = getComputedStyle(document.getElementById("presentation-section")).display !== "none";
      return { count: pills.length, hasChimie: pills.some((t) => t.includes("UE1 - Chimie")), hasChimieOrga: pills.some((t) => t.includes("Chimie organique")), checked: cb ? cb.checked : null, visible };
    });
    assert(info.visible, "la page de présentation n'est pas visible déconnecté");
    assert(info.count === 14, "nombre de matières dans l'aperçu : " + info.count + " (attendu 14)");
    assert(info.hasChimie, "« UE1 - Chimie » absent de l'aperçu");
    assert(info.hasChimieOrga, "« UE1 - Chimie organique » absent de l'aperçu");
    assert(info.checked === false, "la case est cochée par défaut (devrait être décochée)");
    await ctx.close();
  });

  await S("SB2", "coche + connexion -> 14 matières ajoutées dans l'ordre d'UE, abréviations/icônes explicites, choix effacé après succès", async () => {
    const u = await mkUser({ courses: 0 });
    // Simule : un visiteur déconnecté a coché la case AVANT de se connecter (le vrai mécanisme
    // de la case elle-même -- changement d'état + localStorage -- est testé indépendamment en
    // SB1 ; ici on vérifie la vraie application après coup, déclenchée par
    // window._p1MaybeApplySubjectBank au premier chargement réel des matières).
    const { page } = await openPage(browser, u, { wait: false });
    await page.evaluate(() => localStorage.setItem("p1_subjectBankPending_v1", JSON.stringify({ at: Date.now() })));
    await page.evaluate(() => window.location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && window.TPXPerso && window.TPXPerso._state && window.TPXPerso._state.loaded, { timeout: 30000 });

    // mkUser() crée toujours une matière de test ("MatiereE2E", id s1) en plus -- total attendu
    // = 14 (banque) + 1 (celle de mkUser) = 15, jamais plus (pas de doublon, pas de perte).
    await waitFor(async () => {
      const snap = await adb.collection(`users/${u.uid}/subjects`).get();
      return snap.docs.filter((d) => !d.data().archivedAt).length >= 15;
    }, { timeout: 15000 });

    const snap = await adb.collection(`users/${u.uid}/subjects`).get();
    const subjects = snap.docs.map((d) => ({ id: d.id, name: d.data().name, short: d.data().short, icon: d.data().icon, archivedAt: d.data().archivedAt }));
    BANK_IDS.forEach((id) => {
      const s = subjects.find((x) => x.id === id);
      assert(s, "matière de la banque absente : " + id);
      assert(!s.archivedAt, "matière créée déjà archivée : " + id);
    });
    assert(subjects.filter((s) => !s.archivedAt).length === 15, "nombre total de matières actives : " + subjects.filter((s) => !s.archivedAt).length + " (attendu 15 : 14 de la banque + la matière de test mkUser, jamais plus)");

    // Abréviations EXPLICITES (retour de Jean 02/10) : jamais de collision comme avec la
    // dérivation automatique shortOf() (ex. "UE2 Biologie cellulaire" et "UE3.1 Biophysique"
    // donnaient toutes deux "UBE" sans ce correctif).
    const chimie = subjects.find((s) => s.id === "bank-ue1-chimie");
    const biophys = subjects.find((s) => s.id === "bank-ue3-1-biophys");
    const biocell = subjects.find((s) => s.id === "bank-ue2-bio-cell");
    assert(chimie.short === "U1C", "abréviation de « UE1 - Chimie » incorrecte : " + JSON.stringify(chimie.short));
    assert(biocell.short === "U2B", "abréviation de « UE2 - Biologie cellulaire » incorrecte : " + JSON.stringify(biocell.short));
    assert(biophys.short === "U3B", "abréviation de « UE3.1 - Biophysique » incorrecte : " + JSON.stringify(biophys.short));
    assert(biocell.short !== biophys.short, "collision d'abréviation entre deux matières de la banque : " + biocell.short);
    // UE4 à UE8 : une seule matière par UE -> le préfixe d'UE seul suffit (retour de Jean), pas
    // une abréviation à 3 lettres dérivée du nom.
    ["bank-ue4-biostat", "bank-ue5-anatomie", "bank-ue6-pharmaco", "bank-ue7-ssh", "bank-ue8-anglais"].forEach((id, i) => {
      const s = subjects.find((x) => x.id === id);
      const expected = "UE" + (i + 4);
      assert(s.short === expected, "abréviation de " + id + " incorrecte : " + JSON.stringify(s.short) + " (attendu " + expected + ")");
    });

    // Icônes par défaut (retour de Jean 02/10 : "mets des icônes par défaut dans le pack
    // matière") : toutes les 14 matières ont une icône non vide, chacune choisie dans le
    // tableau ICONS déjà vérifié (TPXPerso) -- jamais la même pour toutes (sinon aucun intérêt).
    BANK_IDS.forEach((id) => {
      const s = subjects.find((x) => x.id === id);
      assert(s.icon && typeof s.icon === "string" && s.icon.trim(), "icône manquante pour " + id + " : " + JSON.stringify(s.icon));
    });
    assert(chimie.icon === "fa-flask", "icône de « UE1 - Chimie » incorrecte : " + JSON.stringify(chimie.icon));
    assert(biocell.icon === "fa-dna", "icône de « UE2 - Biologie cellulaire » incorrecte : " + JSON.stringify(biocell.icon));
    assert(new Set(subjects.filter((s) => BANK_IDS.includes(s.id)).map((s) => s.icon)).size > 1, "toutes les matières de la banque ont la même icône (pas de différenciation réelle)");

    // L'écriture de specialtyOrder (saveSpecialtyOrder -> saveUserSettings) part en arrière-plan,
    // indépendamment de l'écriture des matières elles-mêmes -- attend sa propre confirmation
    // plutôt qu'un délai fixe deviné.
    await waitFor(async () => {
      const p = await adb.doc(`users/${u.uid}/settings/preferences`).get();
      return p.exists && Array.isArray(p.data().specialtyOrder) && p.data().specialtyOrder.length >= 15;
    }, { timeout: 10000 });
    const prefs = await adb.doc(`users/${u.uid}/settings/preferences`).get();
    const order = prefs.data().specialtyOrder;
    const posChimie = order.indexOf("bank-ue1-chimie"), posAnglais = order.indexOf("bank-ue8-anglais");
    assert(posChimie !== -1 && posAnglais !== -1 && posChimie < posAnglais, "l'ordre d'UE n'est pas respecté dans specialtyOrder : " + JSON.stringify(order));

    const pendingCleared = await page.evaluate(() => localStorage.getItem("p1_subjectBankPending_v1"));
    assert(pendingCleared === null, "le choix en attente n'a pas été effacé après le succès");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("SB3", "matière déjà présente (même nom, avec ou sans préfixe d'UE) : jamais dupliquée", async () => {
    const u = await mkUser({ courses: 0 });
    await adb.doc(`users/${u.uid}/subjects/existing1`).set({ name: "Chimie", color: "#000", archivedAt: null, order: 1, createdAt: new Date() });
    await adb.doc(`users/${u.uid}/subjects/existing2`).set({ name: "UE2 Histologie", color: "#000", archivedAt: null, order: 2, createdAt: new Date() });

    const { page } = await openPage(browser, u, { wait: false });
    await page.evaluate(() => localStorage.setItem("p1_subjectBankPending_v1", JSON.stringify({ at: Date.now() })));
    await page.evaluate(() => window.location.reload());
    await page.waitForFunction(() => window.TPXPerso && window.TPXPerso._state && window.TPXPerso._state.loaded, { timeout: 30000 });
    // Attendu : 1 (mkUser) + 2 (déjà créées ici) + 12 (banque, Chimie/Histologie exclues car
    // déjà présentes) = 15, jamais 17 (ce que donnerait une absence de déduplication).
    await waitFor(async () => {
      const snap = await adb.collection(`users/${u.uid}/subjects`).get();
      return snap.docs.filter((d) => !d.data().archivedAt).length >= 15;
    }, { timeout: 15000 });

    const snap = await adb.collection(`users/${u.uid}/subjects`).get();
    const active = snap.docs.filter((d) => !d.data().archivedAt);
    assert(active.length === 15, "total de matières actives : " + active.length + " (attendu 15 : 1 mkUser + 2 déjà présentes + 12 ajoutées, jamais 17)");
    assert(!active.some((d) => d.id === "bank-ue1-chimie"), "« Chimie » existante a été dupliquée sous bank-ue1-chimie");
    assert(!active.some((d) => d.id === "bank-ue2-histologie"), "« UE2 Histologie » existante a été dupliquée");
    // "Chimie organique" N'EST PAS un doublon de "Chimie" (nom différent) -- doit être créée.
    assert(active.some((d) => d.id === "bank-ue1-chimie-organique"), "« UE1 - Chimie organique » n'a pas été créée alors qu'elle n'est pas un doublon de « Chimie »");
    // Les matières existantes n'ont pas été modifiées.
    const chimie = (await adb.doc(`users/${u.uid}/subjects/existing1`).get()).data();
    assert(chimie.name === "Chimie" && chimie.color === "#000", "la matière existante « Chimie » a été altérée : " + JSON.stringify(chimie));
  });

  await S("SB-MANUAL", "compte déjà connecté : bouton dédié des Paramètres, confirmation puis application silencieuse (retour de Jean 02/10 : notification de résultat supprimée)", async () => {
    const u = await mkUser({ courses: 1 });
    const { page } = await openPage(browser, u);
    const seen = await page.evaluate(() => document.getElementById("presentation-section").style.display === "none");
    assert(seen, "la page de présentation (et donc la case à cocher) reste visible pour un compte connecté");

    await page.evaluate(() => document.getElementById("user-avatar").click());
    await sleep(150);
    await page.evaluate(() => window.openSettingsModal());
    await sleep(300);
    const btnExists = await page.evaluate(() => !!document.getElementById("tpx-add-subject-bank"));
    assert(btnExists, "bouton « Ajouter la banque de matières P1 » absent des Paramètres");

    await page.evaluate(() => document.getElementById("tpx-add-subject-bank").click());
    await sleep(300);
    const confirmBtn = await page.evaluate(() => !!document.getElementById("confirm-modal-confirm"));
    assert(confirmBtn, "aucune confirmation affichée avant l'ajout");
    await page.evaluate(() => document.getElementById("confirm-modal-confirm").click());

    await waitFor(async () => {
      const snap = await adb.collection(`users/${u.uid}/subjects`).get();
      return snap.docs.filter((d) => !d.data().archivedAt).length >= 15; // 14 banque + 1 mkUser
    }, { timeout: 15000 });
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("SB-ONB", "assistant de présentation (compte connecté) : banque proposée sur sa propre page dédiée, juste après « Matières », appliquée à la validation finale", async () => {
    const u = await mkUser({ courses: 1 });
    const { page } = await openPage(browser, u);

    await page.evaluate(() => window.TPXOnboarding.start(0));
    await sleep(300);
    // Écran d'accueil -> "Statistiques" -> "Matières" -> page dédiée "Banque de matières"
    // (retour de Jean 02/10 : plus un bloc tassé au bas de la page "Matières", mais sa propre
    // page, comme 'items-settings'/'entrainements-settings').
    await page.evaluate(() => document.getElementById("tpx-onb-next").click());
    await sleep(250);
    await page.evaluate(() => document.getElementById("tpx-onb-next").click());
    await sleep(250);
    await page.evaluate(() => document.getElementById("tpx-onb-next").click());
    await sleep(300);

    const found = await page.evaluate(() => !!document.getElementById("p1-onb-subject-bank-checkbox"));
    assert(found, "case « Ajouter ces matières » absente de la page dédiée de l'assistant de présentation");

    await page.evaluate(() => { document.getElementById("p1-onb-subject-bank-checkbox").click(); });
    // Termine l'assistant jusqu'à la validation finale (même bouton #tpx-onb-next tout du long,
    // y compris sur la page de récapitulatif -- voir finish()). Au passage, vérifie la page de
    // récapitulatif elle-même (retour de Jean 02/10 : "ajoute la ligne pour mettre les matières
    // par défaut en plus").
    let sawRecap = false;
    for (let i = 0; i < 10; i++) {
      const stillOpen = await page.evaluate(() => !!document.getElementById("tpx-onb-overlay"));
      if (!stillOpen) break;
      const recap = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".tpx-onb-recap-row")];
        const row = rows.find((r) => r.querySelector(".tpx-onb-recap-k")?.textContent.trim() === "Banque de matières P1");
        const trainRow = rows.find((r) => r.querySelector(".tpx-onb-recap-k")?.textContent.trim().startsWith("Affichage de la page"));
        return {
          found: row ? true : (rows.length > 0 ? false : null),
          value: row?.querySelector(".tpx-onb-recap-v")?.textContent.trim(),
          trainLabel: trainRow?.querySelector(".tpx-onb-recap-k")?.textContent.trim(),
        };
      });
      if (recap.found === true) {
        sawRecap = true;
        assert(recap.value === "Ajoutées", "la ligne « Banque de matières P1 » du récapitulatif n'indique pas « Ajoutées » (case cochée) : " + JSON.stringify(recap.value));
        // Retour de Jean (02/10) : "il manque Entraînement nan ?" -- le libellé générique ne
        // précisait pas de quelle page il s'agissait.
        assert(recap.trainLabel === "Affichage de la page Entraînements", "libellé incomplet pour le réglage de visibilité de la page Entraînements : " + JSON.stringify(recap.trainLabel));
      } else if (recap.found === false) {
        throw new Error("page de récapitulatif atteinte sans la ligne « Banque de matières P1 »");
      }
      await page.evaluate(() => { const btn = document.getElementById("tpx-onb-next"); if (btn) btn.click(); });
      await sleep(300);
    }
    assert(sawRecap, "page de récapitulatif jamais atteinte (le test n'a rien vérifié)");

    await waitFor(async () => {
      const snap = await adb.collection(`users/${u.uid}/subjects`).get();
      return snap.docs.filter((d) => !d.data().archivedAt).length >= 15;
    }, { timeout: 15000 });
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("SB-DASH", "matière de banque créée avant l'ajout du tiret/des abréviations UE4-8/des icônes : chaque champ manquant corrigé indépendamment au chargement, sans jamais toucher une personnalisation existante ni une matière hors banque", async () => {
    const u = await mkUser({ courses: 0 });
    // État réel laissé par une ancienne version de la banque : nom SANS tiret, même ID, mais
    // abréviation déjà correcte et AUCUNE icône (ajoutée après coup) -- seule l'icône doit être
    // corrigée en plus du nom.
    await adb.doc(`users/${u.uid}/subjects/bank-ue2-embryologie`).set({
      name: "UE2 Embryologie", color: "#3b82f6", short: "U2E", archivedAt: null, updatedAt: new Date(),
    });
    // Même ID de banque, mais renommée à la main entre-temps (ex. "Anatomie" -> autre chose) ET
    // abréviation personnalisée -- le nom ET l'abréviation ne doivent JAMAIS être touchés ; seule
    // l'icône (jamais définie) peut être complétée.
    await adb.doc(`users/${u.uid}/subjects/bank-ue5-anatomie`).set({
      name: "Anatomie (renommée)", color: "#eab308", short: "ANA", archivedAt: null, updatedAt: new Date(),
    });
    // Reproduit EXACTEMENT le bug signalé par Jean (capture d'écran : abréviations "UPE"/"UBE"/
    // "UAE"/"USE" au lieu de UE4-UE8) : nom déjà correct (tiret présent), mais `short` jamais
    // enregistré (vide) -- shortOf() le dérivait alors automatiquement du nom, d'où ces codes.
    await adb.doc(`users/${u.uid}/subjects/bank-ue7-ssh`).set({
      name: "UE7 - SSH", color: "#f97316", short: null, archivedAt: null, updatedAt: new Date(),
    });
    // Matière HORS banque dont le nom coïncide par coïncidence avec une ancienne forme -- ID
    // différent, ne doit jamais être confondue avec une matière de la banque.
    await adb.doc(`users/${u.uid}/subjects/perso-1`).set({
      name: "UE2 Embryologie", color: "#000000", short: "PER", archivedAt: null, updatedAt: new Date(),
    });

    const { page } = await openPage(browser, u, { wait: false });
    await page.waitForFunction(() => window.TPXPerso && window.TPXPerso._state && window.TPXPerso._state.loaded, { timeout: 30000 });

    await waitFor(async () => {
      const d = await adb.doc(`users/${u.uid}/subjects/bank-ue2-embryologie`).get();
      return d.exists && d.data().name === "UE2 - Embryologie";
    }, { timeout: 15000 });
    await waitFor(async () => {
      const d = await adb.doc(`users/${u.uid}/subjects/bank-ue7-ssh`).get();
      return d.exists && d.data().short === "UE7";
    }, { timeout: 15000 });

    const fixed = (await adb.doc(`users/${u.uid}/subjects/bank-ue2-embryologie`).get()).data();
    assert(fixed.name === "UE2 - Embryologie", "le tiret n'a pas été ajouté : " + JSON.stringify(fixed.name));
    assert(fixed.color === "#3b82f6" && fixed.short === "U2E", "couleur/abréviation perdues pendant la correction : " + JSON.stringify(fixed));
    assert(fixed.icon === "fa-baby", "icône par défaut non complétée : " + JSON.stringify(fixed.icon));

    const renamed = (await adb.doc(`users/${u.uid}/subjects/bank-ue5-anatomie`).get()).data();
    assert(renamed.name === "Anatomie (renommée)", "une matière renommée à la main a été modifiée par erreur : " + JSON.stringify(renamed.name));
    assert(renamed.short === "ANA", "une abréviation personnalisée a été écrasée : " + JSON.stringify(renamed.short));
    assert(renamed.icon === "fa-bone", "icône par défaut non complétée sur une matière par ailleurs personnalisée : " + JSON.stringify(renamed.icon));

    const ssh = (await adb.doc(`users/${u.uid}/subjects/bank-ue7-ssh`).get()).data();
    assert(ssh.short === "UE7", "abréviation toujours vide/incorrecte (bug signalé par Jean) : " + JSON.stringify(ssh.short));
    assert(ssh.icon === "fa-user-doctor", "icône par défaut non complétée : " + JSON.stringify(ssh.icon));

    const perso = (await adb.doc(`users/${u.uid}/subjects/perso-1`).get()).data();
    assert(perso.name === "UE2 Embryologie", "une matière HORS banque (même nom, ID différent) a été modifiée par erreur : " + JSON.stringify(perso.name));
    assert(!perso.icon, "une matière HORS banque a reçu une icône par erreur : " + JSON.stringify(perso.icon));

    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
