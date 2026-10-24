/* Mode sur-mesure : boutons des fenêtres en sombre, suppression de matière « en cours », matière présélectionnée (22/10/2026).
   Vraie page + vrais émulateurs ; l'état serveur est relu avec l'admin SDK.
   Lancer : node test/e2e/perso-retouches-22-10.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, scenario, report, assert, sleep, waitFor } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const M = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const PC = { width: 1366, height: 900 }, TEL = M(390, 844);
const THEMES = ["light", "dark", "pastel"];

const clean = async (page) => {
  await page.addStyleTag({ content: "#tpx-onb-overlay{display:none !important}" }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); window.__ednAnonymousLockCount = 0; if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); document.body.style.overflow = ""; document.documentElement.classList.remove("p1-scrollbar-hidden"); }).catch(() => {});
};
async function open(vp, { theme = "light", courses = 1, seed = null, pageName = "items" } = {}) {
  const u = await mkUser({ courses });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  if (seed) await seed(u.uid);
  const ctx = await openPage(browser, u, { wait: courses > 0 }); OPEN.push(ctx.ctx); const page = ctx.page; page.setDefaultNavigationTimeout(120000); await page.bringToFront();
  await page.setViewport(vp); await sleep(vp.isMobile ? 2500 : 500);
  await page.waitForFunction(() => window.currentUser && document.getElementById("user-avatar"), { timeout: 60000 });
  await clean(page);
  if (theme !== "light") { await page.evaluate((t) => window.p1SetTheme(t, false), theme); await sleep(400); }
  await page.evaluate((p) => document.querySelector(`[data-page="${p}"]`).click(), pageName); await sleep(1500);
  if (pageName === "items") { await page.evaluate(() => { try { window.renderItemsTable(); } catch (e) {} }); await sleep(600); }
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
const center = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const typeIn = async (page, sel, text) => { await page.evaluate((s) => { const e = document.querySelector(s); e.focus(); e.value = ""; }, sel); await page.type(sel, text); };
const css = (page, sel) => page.evaluate((s) => { const c = getComputedStyle(document.querySelector(s)); return { bg: c.backgroundColor, img: c.backgroundImage, shadow: c.boxShadow, border: c.borderTopColor, op: c.opacity }; }, sel);
const seedMany = (subjects, coursesBySubject) => async (uid) => {
  for (const [id, name] of subjects) await adb.doc(`users/${uid}/subjects/${id}`).set({ name, color: "#7c6cf6", order: 20, archivedAt: null, createdAt: new Date() });
  for (const [sid, n] of coursesBySubject) for (let i = 1; i <= n; i++) await adb.doc(`users/${uid}/courses/${sid}c${i}`).set({ subjectId: sid, name: `${sid}-Cours${i}`, order: i * 10, courseNum: i, archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date() });
};

try {
  /* ═════════ RT1 : boutons des fenêtres sur-mesure ═════════ */
  for (const [th, vp, label] of [["light", PC, "PC clair"], ["dark", PC, "PC sombre"], ["pastel", PC, "PC pastel"], ["dark", TEL, "téléphone sombre"]]) {
    await S(`RT1-${th}-${vp === PC ? "pc" : "tel"}`, `boutons (${label}) : « Enregistrer » bleu et « Supprimer définitivement » rouge en dégradé, survol visible (Annuler, Supprimer, principaux), identiques entre thèmes`, async () => {
      const touch = !!vp.isMobile;
      const { page } = await open(vp, { theme: th, courses: 2, pageName: "dashboard" });
      await page.evaluate(() => window.TPXPerso.openSpecialtyModal("s1")); await sleep(900);
      // fenêtre d'une matière : Enregistrer (principal) et Supprimer (rouge à liseré)
      const ok = await css(page, "#tpx-mat-ok");
      assert(/linear-gradient/.test(ok.img), `« Enregistrer » sans dégradé : ${ok.img} / ${ok.bg}`);
      const danger0 = await css(page, "#tpx-mat-del");
      if (!touch) {
        let c = await center(page, "#tpx-mat-ok"); await page.mouse.move(c.x, c.y); await sleep(350);
        const okH = await css(page, "#tpx-mat-ok"); assert(okH.shadow !== ok.shadow, `« Enregistrer » : pas de survol visible (${ok.shadow} → ${okH.shadow})`);
        c = await center(page, "#tpx-mat-del"); await page.mouse.move(c.x, c.y); await sleep(350);
        const dH = await css(page, "#tpx-mat-del");
        assert(dH.bg !== danger0.bg && !/rgba\(0, 0, 0, 0\)/.test(dH.bg), `« Supprimer » perd son survol rouge : ${danger0.bg} → ${dH.bg}`);
        { const m = (dH.border.match(/[0-9]+/g) || []).map(Number); assert(m.length >= 3 && m[0] - m[1] >= 50 && m[0] - m[2] >= 50, `liseré de « Supprimer » au survol non rouge : ${dH.border}`); }
        await page.mouse.move(3, 3);
      }
      // confirmation : Archiver (rouge principal) + Annuler
      await press(page, "#tpx-mat-del", touch); await sleep(900);
      const yes = await css(page, "#tpx-del-yes");
      assert(/linear-gradient/.test(yes.img), `« Archiver / Supprimer définitivement » sans dégradé rouge : ${yes.img} / ${yes.bg}`);
      { const m = (yes.img.match(/[0-9]+/g) || []).slice(1, 4).map(Number); assert(m.length === 3 && m[0] - m[1] >= 50 && m[0] - m[2] >= 50, `dégradé pas rouge : ${yes.img}`); }
      const no0 = await css(page, "#tpx-del-no");
      if (!touch) {
        let c = await center(page, "#tpx-del-yes"); await page.mouse.move(c.x, c.y); await sleep(350);
        const yH = await css(page, "#tpx-del-yes"); assert(yH.shadow !== yes.shadow, `« Archiver » : pas d'ombre au survol (${yes.shadow} → ${yH.shadow})`);
        c = await center(page, "#tpx-del-no"); await page.mouse.move(c.x, c.y); await sleep(350);
        const nH = await css(page, "#tpx-del-no"); assert(nH.bg !== no0.bg || nH.border !== no0.border, `« Annuler » : aucun survol (${no0.bg}/${no0.border} → ${nH.bg}/${nH.border})`);
        if (th === "dark") assert(nH.bg !== no0.bg, `« Annuler » en sombre : le fond ne change pas (${no0.bg})`);
      }
    });
  }

  /* ═════════ RT2 : suppression de matière « en cours » ═════════ */
  await S("RT2-pc", "suppression d'une matière avec 4 cours : 100 ms après le clic bouton inactif + icône qui tourne + « Suppression… » + opacité ≥ 0,75 + Annuler inactif ; fenêtre fermée après l'archivage ; matière et cours archivés ; double clic = une seule suppression", async () => {
    const { u, page } = await open(PC, { courses: 1, seed: seedMany([["s2", "MatSuppr"]], [["s2", 4]]), pageName: "dashboard" });
    await page.evaluate(() => { window.__before = 0; const o = window.tpxPersoFx.before; window.tpxPersoFx.before = function (t) { if (t === "spec") window.__before++; return o.apply(this, arguments); }; });
    await page.evaluate(() => window.TPXPerso.openSpecialtyModal("s2")); await sleep(900);
    await press(page, "#tpx-mat-del", false); await sleep(900);
    // la matière s2 doit être dans le state avant d'archiver
    const c = await center(page, "#tpx-del-yes");
    await page.mouse.click(c.x, c.y); await page.mouse.click(c.x, c.y);   // double clic rapide
    await sleep(100);
    const s = await page.evaluate(() => {
      const b = document.getElementById("tpx-del-yes"), n = document.getElementById("tpx-del-no"); if (!b) return { gone: true };
      const i = b.querySelector("i"); return { dis: b.disabled, busy: b.classList.contains("is-busy"), txt: b.textContent.trim(), anim: i ? getComputedStyle(i).animationName : null, spin: !!(i && i.classList.contains("fa-spin")), op: parseFloat(getComputedStyle(b).opacity), noDis: n ? n.disabled : null };
    });
    assert(!s.gone, "la fenêtre était déjà fermée 100 ms après le clic");
    assert(s.dis && s.busy && /Suppression/.test(s.txt) && s.spin && s.anim && s.anim !== "none" && s.op >= 0.75 && s.noDis === true, "état en cours : " + JSON.stringify(s));
    assert(await waitFor(async () => !(await page.evaluate(() => !!document.getElementById("tpx-del-yes"))), { timeout: 12000 }), "la fenêtre ne se ferme jamais");
    assert(await waitFor(async () => !!((await adb.doc(`users/${u.uid}/subjects/s2`).get()).data() || {}).archivedAt, { timeout: 15000 }), "matière non archivée");
    for (let i = 1; i <= 4; i++) assert(await waitFor(async () => !!((await adb.doc(`users/${u.uid}/courses/s2c${i}`).get()).data() || {}).archivedAt, { timeout: 15000 }), "cours " + i + " non archivé");
    assert((await page.evaluate(() => window.__before)) === 1, "suppression lancée " + (await page.evaluate(() => window.__before)) + " fois (double clic)");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
  await S("RT2-hors-ligne", "hors ligne (réseau coupé) : la fenêtre de suppression se ferme au plus tard après 8 s", async () => {
    const { page } = await open(PC, { courses: 1, seed: seedMany([["s2", "MatHors"]], [["s2", 2]]), pageName: "dashboard" });
    await page.evaluate(() => window.TPXPerso.openSpecialtyModal("s2")); await sleep(900);
    await press(page, "#tpx-mat-del", false); await sleep(900);
    await page.setOfflineMode(true);
    const t0 = Date.now();
    await press(page, "#tpx-del-yes", false);
    await sleep(300);
    const mid = await page.evaluate(() => { const b = document.getElementById("tpx-del-yes"); return b ? b.disabled : null; });
    const closed = await waitFor(async () => !(await page.evaluate(() => !!document.getElementById("tpx-del-yes"))), { timeout: 12000, every: 200 });
    const dt = Date.now() - t0;
    await page.setOfflineMode(false);
    assert(closed && dt <= 9500, `fenêtre fermée après ${dt} ms (max 8 s + marge) — fermée : ${closed}`);
    console.log(`    (hors ligne : bouton ${mid === true ? "inactif pendant l'attente" : "?"}, fermeture après ${dt} ms)`);
  });

  /* ═════════ RT3 : matière présélectionnée ═════════ */
  const seed3 = seedMany([["s2", "P2"], ["s3", "P3"]], [["s2", 3]]);
  const pickVal = (page) => page.evaluate(() => (document.getElementById("tpx-it-spec") || {}).getAttribute ? document.getElementById("tpx-it-spec").getAttribute("data-value") : null);
  const setFilter = (page, arr) => page.evaluate((a) => { selectedSpecialties = a; window.renderItemsTable(); }, arr);
  const openNew = async (page, touch) => { await press(page, "#tpx-btn-add-entry", touch); await page.waitForSelector("#tpx-it-spec", { timeout: 8000 }); await sleep(500); };
  const closeModal = async (page) => { await page.evaluate(() => { const o = document.getElementById("tpx-modal-overlay"); if (o) o.querySelector(".tpx-modal-close").click(); }); await sleep(600); };
  for (const [th, vp, id] of [["light", PC, "pc"], ["dark", PC, "pcsombre"], ["pastel", PC, "pcpastel"], ["light", TEL, "tel"]]) {
    await S("RT3-" + id, `liste filtrée (${id}) : P2 seule → « Nouveau cours » sur P2 (cours enregistré dans P2, numéro 4) ; deux matières / aucun filtre → 1re matière ; changer de matière dans le formulaire fonctionne ; un cours existant garde sa matière`, async () => {
      const touch = !!vp.isMobile;
      const { u, page } = await open(vp, { theme: th, courses: 1, seed: seed3, pageName: "items" });
      // aucun filtre
      await setFilter(page, []); await sleep(400); await openNew(page, touch);
      assert((await pickVal(page)) === "s1", "sans filtre : matière " + (await pickVal(page))); await closeModal(page);
      // deux matières
      await setFilter(page, ["s2", "s3"]); await sleep(400); await openNew(page, touch);
      assert((await pickVal(page)) === "s1", "deux matières : matière " + (await pickVal(page))); await closeModal(page);
      // une matière inconnue (non existante) : repli
      await setFilter(page, ["inconnue"]); await sleep(400); await openNew(page, touch);
      assert((await pickVal(page)) === "s1", "matière inconnue : " + (await pickVal(page))); await closeModal(page);
      // P2 seule
      await setFilter(page, ["s2"]); await sleep(500); await openNew(page, touch);
      assert((await pickVal(page)) === "s2", "P2 seule : matière " + (await pickVal(page)));
      const label = await page.evaluate(() => document.querySelector("#tpx-it-spec .tpx-picker-current").textContent.trim());
      assert(/P2/.test(label), "libellé du sélecteur : " + label);
      // changer de matière dans le formulaire
      await press(page, "#tpx-it-spec .tpx-picker-btn", touch); await sleep(400);
      await press(page, '#tpx-it-spec .tpx-picker-opt[data-value="s3"]', touch); await sleep(400);
      assert((await pickVal(page)) === "s3", "changement de matière : " + (await pickVal(page)));
      await press(page, "#tpx-it-spec .tpx-picker-btn", touch); await sleep(400);
      await press(page, '#tpx-it-spec .tpx-picker-opt[data-value="s2"]', touch); await sleep(400);
      assert((await pickVal(page)) === "s2", "retour sur P2 : " + (await pickVal(page)));
      await typeIn(page, "#tpx-it-name", "CoursQuatre"); await sleep(200);
      await press(page, "#tpx-it-ok", touch);
      const sv = await waitFor(async () => { const q = await adb.collection(`users/${u.uid}/courses`).where("name", "==", "CoursQuatre").get(); return q.empty ? null : q.docs[0].data().subjectId; });
      assert(sv === "s2", "cours enregistré dans la matière " + sv);
      await sleep(1500);
      const num = await page.evaluate(() => { const m = window.p1ComputeDisplayNums ? window.p1ComputeDisplayNums() : {}; const k = Object.keys(m).find((x) => /^s2\|/.test(x) && m[x] === 4); return k ? m[k] : Object.entries(m).filter(([k]) => /^s2\|/.test(k)).map(([, v]) => v).join(","); });
      assert(String(num) === "4", "numéro affiché du nouveau cours : " + num);
      // cours existant : matière verrouillée même avec un autre filtre
      await setFilter(page, ["s3"]); await sleep(400);
      await page.evaluate(() => window.TPXPerso.openItemModal("s2|s2c1", "s3")); await page.waitForSelector("#tpx-it-spec", { timeout: 8000 }); await sleep(400);
      assert((await pickVal(page)) === "s2", "cours existant : matière " + (await pickVal(page)));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }
  await S("RT3-vide", "le bouton de l'écran vide « Nouveau cours » et le « Ajouter » de « Gérer » ne présélectionnent pas (1re matière), même avec un filtre sur une matière", async () => {
    const { page } = await open(PC, { courses: 1, seed: seed3, pageName: "items" });
    await setFilter(page, ["s2"]); await sleep(400);
    await press(page, "#tpx-btn-mgr-entry", false); await sleep(900);
    await press(page, "#tpx-mgr-add", false); await page.waitForSelector("#tpx-it-spec", { timeout: 8000 }); await sleep(500);
    assert((await pickVal(page)) === "s1", "« Ajouter » de « Gérer » : " + (await pickVal(page)));
  });
} finally {
  const code = report();
  await browser.close(); await server.close?.(); await proxy.close?.();
  process.exit(code);
}
