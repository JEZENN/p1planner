/* "Révisions J" (sidebar Planning) -- 2 retours de Jean dans le même message (03/10) :
   1. "le menu qui apparait pour chaque jour apparait et disparait sans transition c'est
      moche mets une animation discrète stp" -- l'ouverture/fermeture des groupes-jour
      (<details>/<summary> natifs) était instantanée, sans aucune transition possible en CSS
      pur (display:none appliqué d'un coup par le navigateur). Voir _jToggleDayGroup/
      .j-day-group-body/.j-day-expanded.
   2. "j'aime pas les séparations entre les différents jours... tout se confond" -- aucun
      contour/relief ne délimitait un groupe-jour avant (juste une nuance de fond d'en-tête),
      "Aujourd'hui" et "Demain" se touchaient visuellement. Voir .j-day-group (bordure +
      ombre légère + marge entre groupes). Vraie page + vrais émulateurs. */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

// Même logique que _jLocalDayKey/_addDaysIso côté app (composants locaux, jamais UTC) --
// recalculée ici pour écrire des échéances aux bonnes clés de jour sans dépendre du DOM.
function localDayKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addDays(dayKey, days) {
  const [y, m, dd] = dayKey.split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  d.setDate(d.getDate() + days);
  return localDayKey(d);
}

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

try {
  const u = await mkUser({ courses: 2 });
  const today = localDayKey(new Date());
  const tomorrow = addDays(today, 1);

  // c1 : une échéance 'pending' due aujourd'hui (groupe "Aujourd'hui").
  await adb.doc(`users/${u.uid}/courses/c1`).update({
    jCheckpoints: { presetId: "equilibre", anchorDate: today, anchorTourIndex: 0,
      steps: [{ offset: 1, dueDate: today, status: "pending" }] },
  });
  // c2 : une échéance 'pending' due demain (groupe "Demain").
  await adb.doc(`users/${u.uid}/courses/c2`).update({
    jCheckpoints: { presetId: "equilibre", anchorDate: today, anchorTourIndex: 0,
      steps: [{ offset: 1, dueDate: tomorrow, status: "pending" }] },
  });

  const { page } = await openPage(browser, u);
  // Active la méthode des J (préférence locale, lue par isJMethodEnabled()) puis
  // reconstruit la carte -- équivalent de ce que fait l'interrupteur des réglages.
  await page.evaluate(() => { window.setJMethodPrefs(true, "equilibre"); window.renderJDueCard(); });
  await sleep(200);

  await S("J1", "séparation visuelle : chaque groupe-jour a un contour complet + marge, pas juste une nuance de fond", async () => {
    const info = await page.evaluate(() => {
      const groups = [...document.querySelectorAll("#jDueBody .j-day-group")];
      return groups.map((g) => {
        const cs = getComputedStyle(g);
        return { border: cs.borderTopWidth, boxShadow: cs.boxShadow, marginTop: cs.marginTop, daykey: g.getAttribute("data-daykey") };
      });
    });
    assert(info.length === 2, "nombre de groupes-jour inattendu : " + JSON.stringify(info));
    assert(info[0].border !== "0px", "le groupe « Aujourd'hui » n'a aucune bordure visible : " + JSON.stringify(info[0]));
    assert(info[0].boxShadow !== "none", "le groupe « Aujourd'hui » n'a aucun relief (box-shadow) : " + JSON.stringify(info[0]));
    assert(info[1].marginTop !== "0px", "aucune marge entre les deux groupes-jour, ils se touchent toujours : " + JSON.stringify(info[1]));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("J2", "« Aujourd'hui » est déplié par défaut, SANS jouer l'animation d'ouverture au premier rendu", async () => {
    const first = await page.evaluate(() => {
      const g = document.querySelector('#jDueBody .j-day-group[data-daykey]');
      return { open: g.hasAttribute("open"), expanded: g.classList.contains("j-day-expanded"), rows: getComputedStyle(g.querySelector(".j-day-group-body")).gridTemplateRows };
    });
    assert(first.open, "« Aujourd'hui » n'est pas ouvert par défaut");
    assert(first.expanded, "la classe .j-day-expanded n'est pas posée dès le rendu initial (l'ouverture par défaut rejouerait l'animation)");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("J3", "clic sur l'en-tête « Demain » (fermé) : ouverture ANIMÉE -- pas de saut instantané vers l'état final", async () => {
    const closedDaykey = await page.evaluate(() => {
      const groups = [...document.querySelectorAll("#jDueBody .j-day-group")];
      const g = groups.find((x) => !x.hasAttribute("open"));
      return g ? g.getAttribute("data-daykey") : null;
    });
    assert(closedDaykey, "aucun groupe fermé trouvé (« Demain » devrait l'être par défaut)");

    await page.evaluate((dk) => document.querySelector(`.j-day-group[data-daykey="${dk}"] .j-day-group-summary`).click(), closedDaykey);

    // Immédiatement après le clic : `open` déjà posé (contenu mesurable), mais la classe qui
    // déclenche la transition n'est PAS encore là (ajoutée seulement aux frames suivantes) --
    // sinon le navigateur sauterait directement à l'état ouvert sans transition visible.
    const justAfter = await page.evaluate((dk) => {
      const g = document.querySelector(`.j-day-group[data-daykey="${dk}"]`);
      return { open: g.hasAttribute("open"), expanded: g.classList.contains("j-day-expanded") };
    }, closedDaykey);
    assert(justAfter.open, "l'attribut `open` n'est pas posé immédiatement au clic");
    assert(!justAfter.expanded, "la classe .j-day-expanded est posée AVANT même la frame suivante : aucune transition ne pourra être observée (saut instantané)");

    await sleep(350);
    const after = await page.evaluate((dk) => {
      const g = document.querySelector(`.j-day-group[data-daykey="${dk}"]`);
      return { open: g.hasAttribute("open"), expanded: g.classList.contains("j-day-expanded"), rows: getComputedStyle(g.querySelector(".j-day-group-body")).gridTemplateRows };
    }, closedDaykey);
    assert(after.open && after.expanded, "le groupe n'est pas resté ouvert après l'animation : " + JSON.stringify(after));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("J4", "clic sur l'en-tête ouvert : fermeture ANIMÉE -- le contenu reste peint pendant la transition, `open` n'est retiré qu'après", async () => {
    const openDaykey = await page.evaluate(() => {
      const g = document.querySelector('#jDueBody .j-day-group[open]');
      return g ? g.getAttribute("data-daykey") : null;
    });
    assert(openDaykey, "aucun groupe ouvert trouvé avant ce scénario");

    await page.evaluate((dk) => document.querySelector(`.j-day-group[data-daykey="${dk}"] .j-day-group-summary`).click(), openDaykey);

    // Juste après le clic de fermeture : la classe .j-day-expanded a déjà disparu (la
    // transition vers 0fr démarre), MAIS `open` est ENCORE présent -- sinon <details> masquerait
    // tout instantanément (display:none) et aucune transition ne serait visible.
    const justAfter = await page.evaluate((dk) => {
      const g = document.querySelector(`.j-day-group[data-daykey="${dk}"]`);
      return { open: g.hasAttribute("open"), expanded: g.classList.contains("j-day-expanded") };
    }, openDaykey);
    assert(!justAfter.expanded, "la classe .j-day-expanded n'a pas été retirée immédiatement au clic de fermeture");
    assert(justAfter.open, "l'attribut `open` a été retiré INSTANTANÉMENT à la fermeture (aucune transition possible) -- régression du bug signalé par Jean");

    await sleep(350);
    const after = await page.evaluate((dk) => {
      const g = document.querySelector(`.j-day-group[data-daykey="${dk}"]`);
      return { open: g.hasAttribute("open") };
    }, openDaykey);
    assert(!after.open, "l'attribut `open` n'a jamais été retiré après le délai d'animation de fermeture");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
