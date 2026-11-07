/* Ajout de cours : matière proposée selon le filtre, numéro proposé à la suite, Entrée = ajout, tableau trié par N°.
   Vraie page + vrais émulateurs ; l'état serveur est relu avec l'admin SDK.
   Lancer : node test/e2e/course-add.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const PC = { width: 1366, height: 900 }, TEL = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function open(vp, seed) {
  const u = await mkUser({ courses: 1 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  if (seed) await seed(u.uid);
  const ctx = await openPage(browser, u); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden"); }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-page="items"]').click()); await sleep(1500);
  await page.evaluate(() => { try { window.renderItemsTable(); } catch (e) {} }); await sleep(600);
  return { u, page };
}
async function press(page, sel, touch) {
  let c = null;
  for (let k = 0; k < 4; k++) {
    await page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); if (r.top < 40 || r.bottom > innerHeight - 40 || r.left < 0 || r.right > innerWidth) e.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); }, sel);
    await sleep(350);
    c = await page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const h = document.elementFromPoint(x, y); return { x, y, hit: !!h && (e === h || e.contains(h) || h.contains(e)) }; }, sel);
    if (c.hit) break;
  }
  if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
}
const typeIn = async (page, sel, text) => { await page.evaluate((s) => { const e = document.querySelector(s); e.focus(); e.value = ""; }, sel); await page.type(sel, text); };
const seed = async (uid) => {
  for (const [id, name, order] of [["s2", "P2", 20], ["s3", "P3", 30]]) await adb.doc(`users/${uid}/subjects/${id}`).set({ name, color: "#7c6cf6", order, archivedAt: null, createdAt: new Date() });
  for (let i = 1; i <= 3; i++) await adb.doc(`users/${uid}/courses/s2c${i}`).set({ subjectId: "s2", name: `Cours${i}`, order: i * 10, courseNum: i, archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date() });
};
const setFilter = (page, arr) => page.evaluate((a) => { document.querySelector('.specialty-multi-option[data-value="all"]').click(); a.forEach((id) => { const o = document.querySelector('.specialty-multi-option[data-value="' + id + '"]'); if (o) o.click(); }); }, arr);
const openNew = async (page, touch) => { await press(page, "#tpx-btn-add-entry", touch); await page.waitForSelector("#tpx-it-spec", { timeout: 8000 }); await sleep(500); };
const spec = (page) => page.evaluate(() => document.getElementById("tpx-it-spec").getAttribute("data-value"));
const num = (page) => page.evaluate(() => document.getElementById("tpx-it-num").value);
const modalOpen = (page) => page.evaluate(() => !!document.getElementById("tpx-it-name"));
const closeModal = async (page) => { await page.evaluate(() => { const o = document.getElementById("tpx-modal-overlay"); if (o) o.querySelector(".tpx-modal-close").click(); }); await sleep(700); };
const pick = async (page, id, touch) => { await press(page, "#tpx-it-spec .tpx-picker-btn", touch); await sleep(400); await press(page, `#tpx-it-spec .tpx-picker-opt[data-value="${id}"]`, touch); await sleep(400); };
const courses = async (uid, name) => (await adb.collection(`users/${uid}/courses`).where("name", "==", name).get()).docs.map((d) => d.data());
const rows = (page) => page.evaluate(() => [...document.querySelectorAll("#items-table-body tr")].map((tr) => ({ n: (tr.querySelector(".item-num-value") || {}).textContent, t: tr.textContent.replace(/\s+/g, " ") })));

try {
  for (const [vp, id] of [[PC, "pc"], [TEL, "tel"]]) {
    const touch = !!vp.isMobile;
    await S("CA1-" + id, `(${id}) matière proposée selon le filtre : une matière → elle ; plusieurs → la première de la liste parmi elles ; aucun filtre → la première matière`, async () => {
      const { page } = await open(vp, seed);
      await setFilter(page, []); await sleep(300); await openNew(page, touch);
      assert((await spec(page)) === "s1", "sans filtre : " + (await spec(page))); await closeModal(page);
      await setFilter(page, ["s3"]); await sleep(300); await openNew(page, touch);
      assert((await spec(page)) === "s3", "une matière (P3) : " + (await spec(page))); await closeModal(page);
      await setFilter(page, ["s3", "s2"]); await sleep(300); await openNew(page, touch);
      assert((await spec(page)) === "s2", "P3 puis P2 cochées → première de la liste (P2) : " + (await spec(page))); await closeModal(page);
      await setFilter(page, ["s2", "s3"]); await sleep(300); await openNew(page, touch);
      assert((await spec(page)) === "s2", "P2 et P3 : " + (await spec(page)));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
    await S("CA2-" + id, `(${id}) numéro proposé à la suite : 1, 2, 3 → 4 ; matière vide → 1 ; suit la matière choisie tant qu'on n'a pas saisi le numéro, puis ne change plus`, async () => {
      const { page } = await open(vp, seed);
      await setFilter(page, ["s2"]); await sleep(300); await openNew(page, touch);
      assert((await num(page)) === "4", "P2 (1, 2, 3) : numéro " + (await num(page)));
      await pick(page, "s3", touch);
      assert((await num(page)) === "1", "P3 vide : numéro " + (await num(page)));
      await pick(page, "s2", touch);
      assert((await num(page)) === "4", "retour sur P2 : numéro " + (await num(page)));
      await typeIn(page, "#tpx-it-num", "9");
      await pick(page, "s3", touch);
      assert((await num(page)) === "9", "numéro saisi à la main conservé : " + (await num(page)));
      await closeModal(page);
      // cours existant : numéro et matière inchangés (rien n'est proposé)
      await page.evaluate(() => window.TPXPerso.openItemModal("s2|s2c2")); await page.waitForSelector("#tpx-it-name", { timeout: 8000 }); await sleep(400);
      assert((await num(page)) === "2", "cours existant : numéro " + (await num(page)));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("CA3", "Entrée dans l'intitulé (matière + numéro présents) ajoute le cours : une seule fois même en double Entrée ; Entrée dans le numéro aussi ; intitulé vide / numéro déjà pris / intitulé déjà pris → message, rien d'ajouté, la fenêtre reste ouverte", async () => {
    const { u, page } = await open(PC, seed);
    await setFilter(page, ["s2"]); await sleep(300); await openNew(page, false);
    await page.focus("#tpx-it-name"); await page.keyboard.press("Enter"); await sleep(500);
    assert(await modalOpen(page), "intitulé vide : la fenêtre doit rester ouverte");
    assert(/intitulé/i.test(await page.evaluate(() => document.getElementById("tpx-it-err").textContent)), "message d'intitulé absent");
    await typeIn(page, "#tpx-it-name", "Cours1"); await page.keyboard.press("Enter"); await sleep(500);
    assert(await modalOpen(page) && /déjà/.test(await page.evaluate(() => document.getElementById("tpx-it-err").textContent)), "intitulé déjà pris : message attendu");
    await typeIn(page, "#tpx-it-name", "Nouveau A"); await typeIn(page, "#tpx-it-num", "2"); await page.keyboard.press("Enter"); await sleep(500);
    assert(await modalOpen(page) && /numéro 2/.test(await page.evaluate(() => document.getElementById("tpx-it-err").textContent)), "numéro déjà pris : message attendu");
    assert((await courses(u.uid, "Nouveau A")).length === 0, "rien ne doit être écrit en cas d'erreur");
    await typeIn(page, "#tpx-it-num", "4"); await page.focus("#tpx-it-name");
    await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
    const ok = await waitFor(async () => (await courses(u.uid, "Nouveau A")).length > 0, { timeout: 15000 });
    assert(ok, "le cours n'a pas été ajouté avec Entrée");
    await sleep(1500);
    const docs = await courses(u.uid, "Nouveau A");
    assert(docs.length === 1 && docs[0].subjectId === "s2" && docs[0].courseNum === 4, "cours ajouté : " + JSON.stringify(docs.map((d) => [d.subjectId, d.courseNum])));
    assert(!(await modalOpen(page)), "la fenêtre doit se fermer après l'ajout");
    // Entrée dans le champ numéro
    await openNew(page, false);
    assert((await num(page)) === "5", "numéro proposé après l'ajout : " + (await num(page)));
    await typeIn(page, "#tpx-it-name", "Nouveau B"); await page.focus("#tpx-it-num"); await page.keyboard.press("Enter");
    assert(await waitFor(async () => (await courses(u.uid, "Nouveau B")).length > 0, { timeout: 15000 }), "Entrée dans le numéro : cours non ajouté");
    assert((await courses(u.uid, "Nouveau B"))[0].courseNum === 5, "numéro 5 attendu");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("CA5", "numéro laissé vide : un nouveau cours reçoit le numéro suivant et l'enregistre (case jamais vide) ; les cours sans numéro gardent leur numéro affiché (enregistré, aucun renumérotage) ; la fenêtre d'un cours sans numéro affiche son numéro", async () => {
    const seedNoNum = async (uid) => {
      await adb.doc(`users/${uid}/subjects/s2`).set({ name: "P2", color: "#7c6cf6", order: 20, archivedAt: null, createdAt: new Date() });
      for (const [id, name] of [["u1", "Charlie"], ["u2", "Alpha"], ["u3", "Bravo"]]) await adb.doc(`users/${uid}/courses/${id}`).set({ subjectId: "s2", name, order: 5, archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date() });
    };
    const { u, page } = await open(PC, seedNoNum);
    const shown = () => page.evaluate(() => { const m = window.p1ComputeDisplayNums(); return ["u1", "u2", "u3"].map((c) => m["s2|" + c]).join(); });
    assert((await shown()) === "3,1,2", "numéros affichés au départ (ordre alphabétique) : " + (await shown()));
    await page.evaluate(() => window.TPXPerso.openItemModal("s2|u2")); await page.waitForSelector("#tpx-it-name", { timeout: 8000 }); await sleep(400);
    assert((await num(page)) === "1", "cours sans numéro : la case doit afficher son numéro (1), pas rester vide : « " + (await num(page)) + " »");
    await closeModal(page);
    await setFilter(page, ["s2"]); await sleep(300); await openNew(page, false);
    assert((await num(page)) === "4", "numéro proposé : " + (await num(page)));
    await typeIn(page, "#tpx-it-name", "Delta"); await page.evaluate(() => { document.getElementById("tpx-it-num").value = ""; });
    await page.focus("#tpx-it-name"); await page.keyboard.press("Enter");
    assert(await waitFor(async () => (await courses(u.uid, "Delta")).length > 0, { timeout: 15000 }), "cours non ajouté");
    assert((await courses(u.uid, "Delta"))[0].courseNum === 4, "numéro vide : le cours doit recevoir 4, reçu " + (await courses(u.uid, "Delta"))[0].courseNum);
    const ok = await waitFor(async () => { const d = await Promise.all(["u1", "u2", "u3"].map(async (c) => (await adb.doc(`users/${u.uid}/courses/${c}`).get()).data().courseNum)); return d.join() === "3,1,2"; }, { timeout: 15000 });
    assert(ok, "les cours sans numéro doivent garder 3,1,2 (enregistrés)");
    await sleep(1200);
    assert((await shown()) === "3,1,2", "numéros affichés après l'ajout : " + (await shown()));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("CA4", "tableau trié par N° (par défaut, indicateur cohérent) : le cours ajouté arrive à la fin de sa matière, sans rechargement ; le tri N° croissant / décroissant reste cohérent", async () => {
    const { u, page } = await open(PC, seed);
    const head = await page.evaluate(() => { const th = document.querySelector('#page-items .items-table th[data-sort="num"]'); return { sorted: th.classList.contains("sorted"), desc: th.classList.contains("sort-desc") }; });
    assert(head.sorted && !head.desc, "l'en-tête N° doit être le tri actif croissant : " + JSON.stringify(head));
    const r0 = (await rows(page)).filter((r) => /Cours[123]P2/.test(r.t)).map((r) => r.n);
    assert(r0.join() === "1,2,3", "ordre initial de P2 : " + r0.join() + " | lignes : " + JSON.stringify((await rows(page)).map((r) => r.n + ":" + r.t.slice(0, 40))));
    await setFilter(page, ["s2"]); await sleep(300); await openNew(page, false);
    await typeIn(page, "#tpx-it-name", "Aaa premier alphabétique"); await page.focus("#tpx-it-name"); await page.keyboard.press("Enter");
    assert(await waitFor(async () => (await courses(u.uid, "Aaa premier alphabétique")).length > 0, { timeout: 15000 }), "cours non ajouté");
    await sleep(2000);
    const r1 = await rows(page);
    const last = r1[r1.length - 1];
    assert(r1.length === 4 && /Aaa premier alphabétiqueP2/.test(last.t) && last.n === "4", "le nouveau cours doit être le dernier, numéro 4 : " + JSON.stringify(r1.map((r) => r.n + ":" + r.t.slice(0, 30))));
    // tri par N° sur toutes les matières : P1 (s1) puis P2 ; décroissant : l'inverse
    await setFilter(page, []); await sleep(400);
    const all = await rows(page);
    assert(all.length >= 5, "lignes : " + all.length);
    const nums2 = all.filter((r) => /(Cours[123]|Aaa premier alphabétique)P2/.test(r.t)).map((r) => r.n);
    assert(nums2.join() === "1,2,3,4", "P2 dans l'ordre 1,2,3,4 : " + nums2.join());
    await page.evaluate(() => document.querySelector('#page-items .items-table th[data-sort="num"]').click()); await sleep(600);
    const desc = (await rows(page)).filter((r) => /(Cours[123]|Aaa premier alphabétique)P2/.test(r.t)).map((r) => r.n);
    assert(desc.join() === "4,3,2,1", "décroissant : " + desc.join());
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("CA6", "« Gérer » avec une longue liste : le cadre vert et la pastille « +1 cours » restent exactement sur la ligne ajoutée (même position, même taille), en bas de liste comme en haut", async () => {
    const seed40 = async (uid) => {
      await adb.doc(`users/${uid}/subjects/s2`).set({ name: "P2", color: "#7c6cf6", order: 20, archivedAt: null, createdAt: new Date() });
      const b = adb.batch();
      for (let i = 1; i <= 40; i++) b.set(adb.doc(`users/${uid}/courses/s2c${i}`), { subjectId: "s2", name: `Cours${String(i).padStart(2, "0")}`, order: i * 10, courseNum: i, archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date() });
      await b.commit();
    };
    const { u, page } = await open(PC, seed40);
    await press(page, "#tpx-btn-mgr-entry", false); await sleep(1200);
    await page.evaluate(() => { const l = document.getElementById("tpx-mgr-list"); l.scrollTop = 0; });
    await press(page, "#tpx-mgr-add", false); await page.waitForSelector("#tpx-it-spec", { timeout: 8000 }); await sleep(400);
    await pick(page, "s2", false);
    await typeIn(page, "#tpx-it-name", "ZZ cours ajouté en bas");
    await page.evaluate(() => {
      window.__fx = []; const t0 = performance.now();
      (function f() {
        const g = document.querySelector(".tpx-pfx-glow"); const row = [...document.querySelectorAll("#tpx-mgr-list .tpx-mgr-row")].find((r) => /ZZ cours ajouté en bas/.test(r.textContent));
        if (g && row) { const a = g.getBoundingClientRect(), b = row.getBoundingClientRect(); const lr = document.getElementById("tpx-mgr-list").getBoundingClientRect(); window.__fx.push({ t: Math.round(performance.now() - t0), dTop: Math.round(a.top - b.top), dH: Math.round(a.height - b.height), dL: Math.round(a.left - b.left), inList: b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1 }); }
        if (performance.now() - t0 < 6000) requestAnimationFrame(f);
      })();
    });
    await page.focus("#tpx-it-name"); await page.keyboard.press("Enter");
    await sleep(5500);
    const fx = await page.evaluate(() => window.__fx);
    assert(fx.length > 10, "cadre vert jamais vu (" + fx.length + " mesures)");
    const late = fx.filter((x) => x.t - fx[0].t > 600 && x.t - fx[0].t < 1800);
    assert(late.length > 5, "pas assez de mesures stables : " + late.length);
    const bad = late.filter((x) => Math.abs(x.dTop) > 4 || Math.abs(x.dH) > 6 || Math.abs(x.dL) > 4);
    assert(bad.length === 0, "le cadre est décalé / de taille différente de la ligne : " + JSON.stringify(bad.slice(0, 3)) + " sur " + late.length + " mesures");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  for (const theme of ["light", "dark"]) {
    await S("CA7-" + theme, `« Gérer mon programme » (${theme}) : cours classés par matière puis par numéro ; « Fermer » rouge pastel (repos, survol, appui) ; « Nouveau cours » avec survol et appui`, async () => {
      const seedMix = async (uid) => {
        for (const [id, name, order, icon] of [["s2", "P2", 20, "fa-lungs"], ["s3", "P3", 30, "fa-heart-pulse"]]) await adb.doc(`users/${uid}/subjects/${id}`).set({ name, color: "#7c6cf6", icon, order, archivedAt: null, createdAt: new Date() });
        for (const [cid, sid, n] of [["x1", "s2", 12], ["x2", "s2", 3], ["x3", "s2", 27], ["x4", "s2", 6], ["y1", "s3", 2], ["y2", "s3", 1]]) await adb.doc(`users/${uid}/courses/${cid}`).set({ subjectId: sid, name: `Nom ${cid}`, order: 5, courseNum: n, archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date() });
      };
      const { page } = await open(PC, seedMix);
      if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
      await press(page, "#tpx-btn-mgr-entry", false); await sleep(1200);
      const order = await page.evaluate(() => [...document.querySelectorAll("#tpx-mgr-list .tpx-mgr-row")].map((r) => r.querySelector(".tpx-mgr-title, .tpx-mgr-name") ? r.querySelector(".tpx-mgr-title, .tpx-mgr-name").textContent : r.textContent.slice(0, 20)));
      const nums = order.map((t) => parseInt(t, 10));
      assert(order.length === 7, "lignes : " + JSON.stringify(order));
      // s1 (cours 1) puis P2 : 3, 6, 12, 27 puis P3 : 1, 2
      const icons = await page.evaluate(() => [...document.querySelectorAll("#tpx-mgr-list .tpx-mgr-row .tpx-mgr-dot i")].map((i) => [...i.classList].find((c) => /^fa-/.test(c) && c !== "fa-solid")));
      assert(icons.slice(1).join() === "fa-lungs,fa-lungs,fa-lungs,fa-lungs,fa-heart-pulse,fa-heart-pulse", "icônes des pastilles (celle de la matière) : " + JSON.stringify(icons));
      assert(nums.join() === "1,3,6,12,27,1,2", "ordre : " + JSON.stringify(order));
      assert(!(await page.evaluate(() => !!document.getElementById("tpx-mgr-close") || [...document.querySelectorAll("#tpx-modal-overlay .tpx-modal-foot button, #tpx-modal-overlay button")].some((b) => /^Fermer$/.test(b.textContent.trim())))), "le bouton « Fermer » du pied doit avoir disparu");
      assert(await page.evaluate(() => !!document.querySelector("#tpx-modal-overlay .tpx-modal-close")), "la croix de l'en-tête doit rester");
      const css = (q) => page.evaluate((s) => { const b = document.querySelector(s), c = getComputedStyle(b); return { tf: c.transform, sh: c.boxShadow, fl: c.filter }; }, q);
      const addRest = await css("#tpx-mgr-add");
      const a = await page.evaluate(() => { const r = document.getElementById("tpx-mgr-add").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(a.x, a.y); await sleep(450);
      const addHov = await css("#tpx-mgr-add");
      assert(addHov.tf !== addRest.tf && addHov.sh !== addRest.sh, "« Nouveau cours » au survol : " + JSON.stringify({ addRest, addHov }));
      await page.mouse.down(); await sleep(350);
      const addAct = await css("#tpx-mgr-add");
      assert(addAct.tf !== addHov.tf, "« Nouveau cours » à l'appui : " + JSON.stringify({ addHov, addAct }));
      await page.mouse.move(a.x, a.y - 300); await page.mouse.up(); await sleep(300);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("CA8", "boutons principaux des fenêtres de création (« Ajouter le cours », « Créer la matière ») : survol (soulèvement, ombre plus forte, plus clair) et appui (enfoncé, plus sombre)", async () => {
    const { page } = await open(PC, seed);
    const css = (q) => page.evaluate((s) => { const b = document.querySelector(s), c = getComputedStyle(b); return { tf: c.transform, sh: c.boxShadow, fl: c.filter }; }, q);
    const probe = async (sel, label) => {
      const rest = await css(sel);
      const c = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
      await page.mouse.move(c.x, c.y); await sleep(450);
      const hov = await css(sel);
      assert(hov.tf !== rest.tf && hov.sh !== rest.sh && hov.fl !== rest.fl, label + " au survol : " + JSON.stringify({ rest, hov }));
      await page.mouse.down(); await sleep(350);
      const act = await css(sel);
      assert(act.tf !== hov.tf && act.fl !== hov.fl, label + " à l'appui : " + JSON.stringify({ hov, act }));
      await page.mouse.move(c.x, c.y - 400); await page.mouse.up(); await sleep(300);
    };
    await setFilter(page, ["s2"]); await sleep(300); await openNew(page, false);
    await probe("#tpx-it-ok", "« Ajouter le cours »");
    await closeModal(page);
    await page.evaluate(() => window.TPXPerso.openItemModal("s2|s2c1")); await page.waitForSelector("#tpx-it-del", { timeout: 8000 }); await sleep(500);
    await probe("#tpx-it-ok", "« Enregistrer »");
    const dc = await page.evaluate(() => { const r = document.getElementById("tpx-it-del").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const dcss = () => page.evaluate(() => { const b = document.getElementById("tpx-it-del"), c = getComputedStyle(b); return { bg: c.backgroundColor, fg: c.color, ic: getComputedStyle(b.querySelector("i")).color }; });
    const d0 = await dcss();
    await page.mouse.move(dc.x, dc.y); await sleep(450);
    const d1 = await dcss();
    assert(d1.bg === "rgb(239, 68, 68)" && d1.fg === "rgb(255, 255, 255)" && d1.ic === "rgb(255, 255, 255)", "« Supprimer » au survol (repos " + JSON.stringify(d0) + ") : " + JSON.stringify(d1));
    await page.mouse.down(); await sleep(350);
    const d2 = await dcss();
    assert(d2.bg === "rgb(220, 38, 38)" && d2.fg === "rgb(255, 255, 255)", "« Supprimer » à l'appui : " + JSON.stringify(d2));
    await page.mouse.move(dc.x, dc.y - 400); await page.mouse.up(); await sleep(300);
    await closeModal(page);
    await page.evaluate(() => document.querySelector('.app-nav-btn[data-page="dashboard"]').click()); await sleep(1200);
    await press(page, "#tpx-btn-add-spec", false); await page.waitForSelector("#tpx-mat-name", { timeout: 8000 }); await sleep(500);
    await probe("#tpx-mat-ok", "« Créer la matière »");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("CA9", "changement de matière d'un cours existant : le cours, sa note, ses flashcards et sa tâche suivent (un seul lot) ; les autres cours / cartes / tâches ne bougent pas ; les cours sans numéro des deux matières gardent leur numéro ; hors ligne : refus, rien n'est modifié", async () => {
    const seedMove = async (uid) => {
      for (const [id, name, order, icon] of [["s2", "P2", 20, "fa-lungs"], ["s3", "P3", 30, "fa-heart-pulse"]]) await adb.doc(`users/${uid}/subjects/${id}`).set({ name, color: "#10b981", icon, order, archivedAt: null, createdAt: new Date() });
      for (const [cid, sid, name, n] of [["m1", "s2", "Cours déplacé", 5], ["m2", "s2", "Voisin numéroté", 6], ["a1", "s2", "Bravo", null], ["a2", "s2", "Alpha", null], ["b1", "s3", "Zèbre", null], ["b2", "s3", "Yak", 1]]) {
        const d = { subjectId: sid, name, order: 5, archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date() };
        if (n != null) d.courseNum = n;
        await adb.doc(`users/${uid}/courses/${cid}`).set(d);
      }
      await adb.doc(`users/${uid}/notes/s2-m1`).set({ html: "<p>Ma note importante</p>", updatedAt: new Date() });
      await adb.doc(`users/${uid}/notes/s2-m2`).set({ html: "<p>Note voisin</p>", updatedAt: new Date() });
      const card = (o) => ({ recto: "R", verso: "V", interval: 0, nextReview: new Date(Date.now() + 5 * 86400000).toISOString(), lastReview: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...o });
      await adb.doc(`users/${uid}/flashcards/k1`).set(card({ speId: "s2", itemId: "m1" }));
      await adb.doc(`users/${uid}/flashcards/k2`).set(card({ speId: "s2", itemId: "m1" }));
      await adb.doc(`users/${uid}/flashcards/k3`).set(card({ speId: "s2", itemId: "m2" }));
      await adb.doc(`users/${uid}/flashcards/k4`).set(card({ speId: "s2", itemId: null }));
      const task = (o) => ({ completed: false, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), ...o });
      await adb.doc(`users/${uid}/tasks/t1`).set(task({ text: "5 - Cours déplacé", itemKey: "s2-m1", specialtyColor: "#10b981", specialtyName: "P2", specialtyShort: "P2" }));
      await adb.doc(`users/${uid}/tasks/t2`).set(task({ text: "6 - Voisin numéroté", itemKey: "s2-m2", specialtyColor: "#10b981", specialtyName: "P2", specialtyShort: "P2" }));
      await adb.doc(`users/${uid}/tasks/t3`).set(task({ text: "Tâche libre" }));
    };
    const { u, page } = await open(PC, seedMove);
    const snap = async () => {
      const g = async (p) => (await adb.doc(`users/${u.uid}/${p}`).get()).data();
      const out = { c: {}, k: {}, t: {} };
      for (const c of ["m1", "m2", "a1", "a2", "b1", "b2"]) { const d = await g(`courses/${c}`); out.c[c] = [d.subjectId, d.courseNum ?? null, d.name]; }
      for (const k of ["k1", "k2", "k3", "k4"]) { const d = await g(`flashcards/${k}`); out.k[k] = [d.speId, d.itemId]; }
      for (const t of ["t1", "t2", "t3"]) { const d = await g(`tasks/${t}`); out.t[t] = [d.itemKey ?? null, d.specialtyName ?? null, d.text]; }
      out.n = [(await g("notes/s2-m1")) && (await g("notes/s2-m1")).html, (await adb.doc(`users/${u.uid}/notes/s3-m1`).get()).exists ? (await g("notes/s3-m1")).html : null, (await g("notes/s2-m2")).html];
      return out;
    };
    const shown = () => page.evaluate(() => { const m = window.p1ComputeDisplayNums(); return ["s2|a1", "s2|a2", "s3|b1", "s3|b2", "s2|m2"].map((k) => m[k]).join(); });
    const before = await snap(), shownBefore = await shown();
    assert(shownBefore === "8,7,2,1,6", "numéros affichés au départ : " + shownBefore);
    // 1) hors ligne : refus, rien ne bouge
    const cdp = await page.createCDPSession(); await cdp.send("Network.enable");
    const openEdit = async () => { await page.evaluate(() => window.TPXPerso.openItemModal("s2|m1")); await page.waitForSelector("#tpx-it-name", { timeout: 8000 }); await sleep(500); };
    await openEdit();
    assert(!(await page.evaluate(() => document.querySelector("#tpx-it-spec").classList.contains("tpx-picker-locked"))), "le sélecteur de matière est encore verrouillé");
    assert((await num(page)) === "5", "numéro du cours : " + (await num(page)));
    await pick(page, "s3", false);
    assert((await num(page)) === "3", "numéro proposé dans P3 (1, 2 présents) : " + (await num(page)));
    assert(await page.evaluate(() => document.getElementById("tpx-it-move-hint").style.display !== "none"), "message « les tours, la note… le suivent » absent");
    await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await page.focus("#tpx-it-name"); await page.keyboard.press("Enter"); await sleep(3500);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(2500);
    assert(JSON.stringify(await snap()) === JSON.stringify(before), "hors ligne : des données ont changé : " + JSON.stringify(await snap()));
    const al = await page.evaluate(() => { const m = document.getElementById("custom-alert-modal"); return { on: !!m && m.classList.contains("active"), t: (document.getElementById("alert-modal-title") || {}).textContent }; });
    assert(al.on && /non déplacé/.test(al.t), "message de refus absent hors ligne : " + JSON.stringify(al));
    await page.evaluate(() => document.getElementById("alert-modal-ok").click()); await sleep(700);
    // 2) en ligne : déplacement
    await openEdit();
    await pick(page, "s3", false);
    await page.focus("#tpx-it-name"); await page.keyboard.press("Enter");
    assert(await waitFor(async () => (await adb.doc(`users/${u.uid}/courses/m1`).get()).data().subjectId === "s3", { timeout: 20000 }), "cours non déplacé");
    await sleep(1500);
    const after = await snap();
    assert(after.c.m1[0] === "s3" && after.c.m1[1] === 3 && after.c.m1[2] === "Cours déplacé", "cours : " + JSON.stringify(after.c.m1));
    assert(after.k.k1.join() === "s3,m1" && after.k.k2.join() === "s3,m1", "cartes du cours : " + JSON.stringify(after.k));
    assert(after.k.k3.join() === "s2,m2" && after.k.k4[0] === "s2" && after.k.k4[1] == null, "autres cartes modifiées : " + JSON.stringify(after.k));
    assert(after.t.t1[0] === "s3-m1" && after.t.t1[1] === "P3" && after.t.t1[2] === "3 - Cours déplacé", "tâche du cours : " + JSON.stringify(after.t.t1));
    assert(after.t.t2.join() === before.t.t2.join() && after.t.t3.join() === before.t.t3.join(), "autres tâches modifiées : " + JSON.stringify(after.t));
    assert(after.n[1] === "<p>Ma note importante</p>" && after.n[0] === "<p>Ma note importante</p>" && after.n[2] === "<p>Note voisin</p>", "notes : " + JSON.stringify(after.n));
    for (const c of ["m2", "b2"]) assert(after.c[c].join() === before.c[c].join(), "cours voisin modifié : " + c);
    assert((await shown()) === "8,7,2,1,6", "numéros affichés après le déplacement : " + (await shown()));
    assert(after.c.a1[1] === 8 && after.c.a2[1] === 7 && after.c.b1[1] === 2, "numéros des cours sans numéro enregistrés : " + JSON.stringify(after.c));
    // ouverture réelle de la note et de la liste « Gérer »
    const mgr = await page.evaluate(() => window.TPXPerso.counts());
    assert(mgr.items === 7, "nombre de cours : " + JSON.stringify(mgr));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("CA6b", "« Gérer » : après une modification, le cadre vert « Modifié » couvre toute la ligne (même largeur, même hauteur, mêmes bords) pendant toute l'animation", async () => {
    const seed6 = async (uid) => {
      await adb.doc(`users/${uid}/subjects/s2`).set({ name: "P2", color: "#7c6cf6", order: 20, archivedAt: null, createdAt: new Date() });
      for (let i = 1; i <= 8; i++) await adb.doc(`users/${uid}/courses/s2c${i}`).set({ subjectId: "s2", name: `Cours${i}`, order: i * 10, courseNum: i, archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date() });
    };
    for (const vp of [PC, TEL]) {
      const { page } = await open(vp, seed6);
      const touch = !!vp.isMobile;
      await press(page, "#tpx-btn-mgr-entry", touch); await sleep(1200);
      const key = await page.evaluate(() => document.querySelectorAll("#tpx-mgr-list .tpx-mgr-row")[3].getAttribute("data-key"));
      await press(page, `#tpx-mgr-list .tpx-mgr-row[data-key="${key}"] .tpx-mgr-act:not(.danger)`, touch); await page.waitForSelector("#tpx-it-name", { timeout: 8000 }); await sleep(500);
      await typeIn(page, "#tpx-it-name", "Nom modifié");
      await page.evaluate((k) => {
        window.__fx = []; const t0 = performance.now();
        (function f() {
          const g = document.querySelector(".tpx-pfx-glow"), row = document.querySelector(`#tpx-mgr-list .tpx-mgr-row[data-key="${k}"]`);
          if (g && row) { const a = g.getBoundingClientRect(), b = row.getBoundingClientRect(); window.__fx.push({ t: Math.round(performance.now() - t0), dL: Math.round(a.left - b.left), dR: Math.round(a.right - b.right), dT: Math.round(a.top - b.top), dB: Math.round(a.bottom - b.bottom) }); }
          if (performance.now() - t0 < 5000) requestAnimationFrame(f);
        })();
      }, key);
      await page.focus("#tpx-it-name"); await page.keyboard.press("Enter");
      await sleep(5200);
      const fx = await page.evaluate(() => window.__fx);
      assert(fx.length > 10, "cadre vert jamais vu (" + fx.length + " mesures)");
      const late = fx.filter((x) => x.t - fx[0].t > 500 && x.t - fx[0].t < 1800);
      assert(late.length > 5, "pas assez de mesures stables : " + late.length);
      const bad = late.filter((x) => Math.abs(x.dL) > 3 || Math.abs(x.dR) > 3 || Math.abs(x.dT) > 3 || Math.abs(x.dB) > 3);
      assert(bad.length === 0, `(${touch ? "téléphone" : "PC"}) le cadre ne colle pas à la ligne : ` + JSON.stringify(bad.slice(0, 3)) + " sur " + late.length + " mesures");
    }
  });
  await S("CA10", "suppression d'un cours / d'une matière : textes « définitif », « tout sera perdu » (flashcards conservées), bouton « Annuler » avec survol et appui, clair et sombre", async () => {
    for (const theme of ["light", "dark"]) {
      const { page } = await open(PC, seed);
      if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(500); }
      await press(page, "#tpx-btn-mgr-entry", false); await sleep(1200);
      const key = await page.evaluate(() => document.querySelectorAll("#tpx-mgr-list .tpx-mgr-row")[1].getAttribute("data-key"));
      await press(page, `#tpx-mgr-list .tpx-mgr-row[data-key="${key}"] .tpx-mgr-act.danger`, false); await sleep(800);
      const t = await page.evaluate(() => ({ body: document.getElementById("tpx-modal-overlay").textContent }));
      assert(/Supprimer ce cours/.test(t.body) && /définitivement/.test(t.body) && /perdus/.test(t.body) && /irréversible/.test(t.body) && !/archiv/i.test(t.body), "texte de confirmation : " + JSON.stringify(t).slice(0, 400));
      const css = (q) => page.evaluate((s) => { const b = document.querySelector(s), c = getComputedStyle(b); return { bg: c.backgroundColor, tf: c.transform, sh: c.boxShadow, bd: c.borderTopColor }; }, q);
      const rest = await css("#tpx-cf-no");
      const c = await page.evaluate(() => { const r = document.getElementById("tpx-cf-no").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(c.x, c.y); await sleep(450);
      const hov = await css("#tpx-cf-no");
      assert(hov.bg !== rest.bg && hov.tf !== rest.tf && hov.sh !== rest.sh, `« Annuler » au survol (${theme}) : ` + JSON.stringify({ rest, hov }));
      await page.mouse.down(); await sleep(350);
      const act = await css("#tpx-cf-no");
      assert(act.bg !== hov.bg && act.tf !== hov.tf, `« Annuler » à l'appui (${theme}) : ` + JSON.stringify({ hov, act }));
      await page.mouse.move(c.x, c.y - 300); await page.mouse.up(); await sleep(300);
      await press(page, "#tpx-cf-no", false); await sleep(900);
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    }
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
