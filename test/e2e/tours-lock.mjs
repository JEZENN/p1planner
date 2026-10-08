/* Verrou "retour à 8 tours" + plafond du mode compact (audit 02/10, comparaison au modèle
   EDN TableurEnLigne.html — tpxItemsBeyond8/tpxUpdateExtendedToursSwitchUI). Vraie page +
   vrais émulateurs.

   C1/T2 : le plafond du mode compact (maxTours()) ne doit dépendre QUE du réglage courant
   (tpxMaxToursAllowed()), jamais de la longueur RÉELLEMENT stockée de tourConfidences (qui ne
   redescend jamais une fois étendue à 14 par padTours()) — sinon le mode compact laisse
   ajouter des tours au-delà du réglage "8 tours", invisibles en vue détaillée.

   C2/T1 : repasser à "8 tours" est refusé tant qu'un cours ACTIF a un tour enregistré à
   l'index 8 ou au-delà (T9-T14) — ces tours deviendraient invisibles. Le verrou (grisé +
   cadenas + bandeau d'une seule phrase) se lève tout seul dès que ce n'est plus le cas, y
   compris en temps réel pendant que les Paramètres sont déjà ouverts. */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

// Confiance à l'index i (0-based) : tableau de longueur `len`, rempli de 3 jusqu'à `filled`
// (exclu), null ensuite — sauf aux index listés dans `extra`, mis à 4.
function tours(len, filled, extra) {
  const arr = new Array(len).fill(null);
  for (let i = 0; i < filled; i++) arr[i] = 3;
  (extra || []).forEach((i) => { arr[i] = 4; });
  return arr;
}

async function openSettings(page) {
  await page.evaluate(() => document.getElementById("user-avatar").click());
  await sleep(150);
  await page.evaluate(() => window.openSettingsModal());
  await sleep(200);
}

async function toCompactMode(page) {
  await page.evaluate(() => document.querySelector('[data-page="cours"], [data-page="accueil"]')?.click());
  await sleep(300);
  const already = await page.evaluate(() => document.getElementById("tours-mode-switch")?.classList.contains("on"));
  if (!already) await page.evaluate(() => window.toggleToursMode());
  await sleep(400);
}

try {
  const u = await mkUser({ courses: 2 });
  const { page } = await openPage(browser, u);

  await S("TL1", "verrou : grisé + cadenas + bandeau dès qu'un cours actif a un tour au-delà du 8e, en 14 tours", async () => {
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ extendedTours: true }, { merge: true });
    await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: tours(10, 8, [9]) }, { merge: true }); // T10 rempli
    await page.evaluate(() => window.location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(800);

    await openSettings(page);
    const st = await page.evaluate(() => ({
      lockedClass: document.querySelector('#extended-tours-switch .seg-opt-left').classList.contains("is-locked"),
      ariaDisabled: document.getElementById("extended-tours-switch").getAttribute("aria-disabled"),
      banner: document.getElementById("extended-tours-lock-banner").textContent,
      bannerShown: document.getElementById("extended-tours-lock-banner").classList.contains("is-shown"),
    }));
    assert(st.lockedClass, "option « 8 tours » pas grisée alors qu'un cours a un tour au-delà du 8e");
    assert(st.ariaDisabled === "true", "aria-disabled absent sur le switch verrouillé");
    assert(st.bannerShown, "bandeau de verrou non affiché");
    assert(/1 cours a des tours enregistrés au-delà du 8e/.test(st.banner), "texte du bandeau inattendu : " + JSON.stringify(st.banner));
    assert(!/<|•|T9|T10/.test(st.banner), "le bandeau contient une liste d'items alors qu'il doit rester UNE SEULE phrase : " + JSON.stringify(st.banner));

    // Clic sur « 8 tours » : refusé, le réglage reste sur 14, le switch secoue.
    await page.evaluate(() => document.querySelector('#extended-tours-switch .seg-opt-left').click());
    await sleep(100);
    const after = await page.evaluate(() => ({
      extended: window.getExtendedTours(),
      shaking: document.getElementById("extended-tours-switch").classList.contains("shake"),
    }));
    assert(after.extended === true, "le réglage est repassé à 8 tours alors que le verrou aurait dû refuser le clic");
    assert(after.shaking, "aucune secousse visuelle au clic refusé");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("TL2", "le verrou se lève TOUT SEUL (temps réel) dès que le dernier tour au-delà du 8e est supprimé, même Paramètres déjà ouverts", async () => {
    // Suite directe de TL1 : les Paramètres sont encore ouverts, le verrou est encore actif.
    await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: tours(8, 8, []) }, { merge: true }); // T10 retiré
    await page.waitForFunction(() => {
      const el = document.getElementById("extended-tours-lock-banner");
      return el && !el.classList.contains("is-shown");
    }, { timeout: 15000 });
    const st = await page.evaluate(() => ({
      lockedClass: document.querySelector('#extended-tours-switch .seg-opt-left').classList.contains("is-locked"),
      ariaDisabled: document.getElementById("extended-tours-switch").getAttribute("aria-disabled"),
    }));
    assert(!st.lockedClass, "option « 8 tours » encore grisée après suppression du tour au-delà du 8e");
    assert(st.ariaDisabled === "false", "aria-disabled encore vrai après la levée du verrou");

    // Le réglage « 8 tours » est maintenant accepté.
    await page.evaluate(() => document.querySelector('#extended-tours-switch .seg-opt-left').click());
    await sleep(150);
    assert(await page.evaluate(() => window.getExtendedTours() === false), "le passage à 8 tours n'a pas été accepté une fois le verrou levé");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("TL5", "sans aucun tour au-delà du 8e : 14 -> 8 -> 14 toujours libre (jamais verrouillé à tort)", async () => {
    await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: tours(5, 5, []) }, { merge: true });
    await adb.doc(`users/${u.uid}/courses/c2`).set({ tourConfidences: tours(3, 3, []) }, { merge: true });
    await page.evaluate(() => window.location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(800);
    await openSettings(page);
    assert(await page.evaluate(() => window._p1ExtendedToursLockCount() === 0), "verrou actif alors qu'aucun cours n'a de tour au-delà du 8e");

    await page.evaluate(() => document.querySelector('#extended-tours-switch .seg-opt-right').click()); // -> 14
    await sleep(100);
    assert(await page.evaluate(() => window.getExtendedTours() === true), "passage à 14 tours refusé à tort");
    await page.evaluate(() => document.querySelector('#extended-tours-switch .seg-opt-left').click()); // -> 8
    await sleep(100);
    assert(await page.evaluate(() => window.getExtendedTours() === false), "retour à 8 tours refusé à tort (aucun cours concerné)");
    await page.evaluate(() => document.querySelector('#extended-tours-switch .seg-opt-right').click()); // -> 14
    await sleep(100);
    assert(await page.evaluate(() => window.getExtendedTours() === true), "second passage à 14 tours refusé à tort");
  });

  await S("TL9", "mode compact, réglage 8 tours : « + » bloqué à 8 MÊME avec un tableau stocké de 10 cases (bug corrigé)", async () => {
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ extendedTours: false }, { merge: true });
    // Tableau stocké de longueur 10 (resté ainsi depuis un passage par 14) mais SEULEMENT 8
    // confiances réellement remplies (0..7) -- le bug consistait à autoriser quand même un 9e
    // ajout parce que l'ancien maxTours() se basait sur Math.max(10, 8) = 10.
    await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: tours(10, 8, []) }, { merge: true });
    await page.evaluate(() => window.location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(800);
    await toCompactMode(page);

    const zone = await page.evaluate(() => {
      const el = document.querySelector('[data-fc="c1"]');
      const row = el ? el.closest("tr") : null;
      const z = row ? row.querySelector(".ct-zone-r") : null;
      return z ? { disabled: z.classList.contains("ct-zone-disabled") } : null;
    });
    assert(zone, "zone « + » du cours c1 introuvable en mode compact");
    assert(zone.disabled, "la zone « + » n'est PAS désactivée alors que 8 confiances sont déjà enregistrées (réglage 8 tours) — tableau stocké de 10 cases, régression du bug corrigé");

    // Clic réel : aucun picker ne doit s'ouvrir (refus silencieux, comme avant ce correctif sur un plafond légitime).
    await page.evaluate(() => {
      const el = document.querySelector('[data-fc="c1"]');
      el.closest("tr").querySelector(".ct-zone-r").click();
    });
    await sleep(200);
    assert(!(await page.evaluate(() => !!document.querySelector(".ct-conf-pop.open"))), "un 9e tour a pu être initié malgré le réglage « 8 tours »");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("TL10", "mode compact, réglage 14 tours : un 9e tour reste possible, puis « 8 tours » se verrouille après ajout", async () => {
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ extendedTours: true }, { merge: true });
    await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: tours(8, 8, []) }, { merge: true });
    await page.evaluate(() => window.location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(800);
    await toCompactMode(page);

    await page.evaluate(() => {
      const el = document.querySelector('[data-fc="c1"]');
      el.closest("tr").querySelector(".ct-zone-r").click();
    });
    await sleep(250);
    assert(await page.evaluate(() => !!document.querySelector(".ct-conf-pop.open")), "le 9e tour est refusé alors que le réglage est « 14 tours »");
    // Valide le picker avec la 1ère confiance disponible pour écrire réellement le 9e tour.
    await page.evaluate(() => document.querySelector(".ct-conf-pop.open .ccp-row button")?.click());
    await page.waitForFunction((fc) => {
      const c = window._p1GetCoursesById()[fc];
      return c && Array.isArray(c.tourConfidences) && c.tourConfidences.filter((t) => t != null).length === 9;
    }, { timeout: 10000 }, "c1");

    await openSettings(page);
    assert(await page.evaluate(() => window._p1ExtendedToursLockCount() === 1), "le verrou ne compte pas le cours qui vient de recevoir un 9e tour");
    assert(await page.evaluate(() => document.querySelector('#extended-tours-switch .seg-opt-left').classList.contains("is-locked")), "« 8 tours » pas grisé juste après l'ajout d'un 9e tour");
  });

  await S("TL11", "tableau stocké de 14 cases, seulement 3 tours réels, réglage 8 : blocage à 8, jamais à 14", async () => {
    await adb.doc(`users/${u.uid}/settings/preferences`).set({ extendedTours: false }, { merge: true });
    await adb.doc(`users/${u.uid}/courses/c1`).set({ tourConfidences: tours(14, 3, []) }, { merge: true });
    await page.evaluate(() => window.location.reload());
    await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0, { timeout: 30000 });
    await sleep(800);
    await toCompactMode(page);

    // 5 ajouts successifs (3 -> 8) doivent tous réussir, le 6e (9e tour) doit être bloqué.
    // Attend le compte RÉEL après chaque confirmation (cache live mis à jour par l'écoute
    // onSnapshot, après l'aller-retour Firestore) plutôt qu'un délai fixe deviné : un sleep()
    // trop court ici a provoqué un faux refus intermittent (clic sur « + » avant que le
    // compte précédent n'ait fini de se propager au cache local).
    for (let i = 0; i < 5; i++) {
      const expected = 3 + i + 1;
      await page.evaluate(() => {
        const el = document.querySelector('[data-fc="c1"]');
        el.closest("tr").querySelector(".ct-zone-r").click();
      });
      await sleep(200);
      const opened = await page.evaluate(() => !!document.querySelector(".ct-conf-pop.open"));
      assert(opened, "ajout #" + (i + 1) + " refusé à tort (devrait réussir avant d'atteindre 8)");
      await page.evaluate(() => document.querySelector(".ct-conf-pop.open .ccp-row button")?.click());
      await page.waitForFunction((fc, n) => {
        const c = window._p1GetCoursesById()[fc];
        return c && Array.isArray(c.tourConfidences) && c.tourConfidences.filter((t) => t != null).length === n;
      }, { timeout: 10000 }, "c1", expected);
    }
    const zone = await page.evaluate(() => {
      const el = document.querySelector('[data-fc="c1"]');
      return el.closest("tr").querySelector(".ct-zone-r").classList.contains("ct-zone-disabled");
    });
    assert(zone, "la zone « + » n'est pas désactivée à 8 tours réels, malgré un tableau stocké de 14 cases");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
