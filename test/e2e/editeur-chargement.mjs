/* Un éditeur encore en chargement (squelette) ou en échec de chargement n'est jamais enregistré à la place de la note :
   notes d'un cours, notes d'un entraînement, cahier d'erreurs. Vraie page + émulateurs ; le proxy instable retarde / coupe Firestore
   pour LAISSER le squelette affiché pendant les actions. Les actions passent par de vrais clics et de vrais événements.
   Lancer : node test/e2e/editeur-chargement.mjs [préfixes]   (PUBLIC_DIR=<copie « avant » pour la contre-épreuve) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, adb, doc, scenario, report, assert, sleep, waitFor, proxyMode, BASE } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const OPEN = [];
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, async () => { try { return await fn(); } finally { await proxyMode("up").catch(() => {}); while (OPEN.length) { try { await OPEN.pop().close(); } catch (e) {} } } }, opts) : null);
const server = await startServer(), proxy = await startProxy(), browser = await launch();
const PC = { width: 1366, height: 900 };
const NOTE = "<p>Note existante</p>";
const PASSE = new Date(Date.now() - 3 * 864e5);

async function nouvellePage({ note = null, kind }) {
  const u = await mkUser({ courses: 1 });
  await adb.doc(`users/${u.uid}/settings/preferences`).set({ ednOnboardingVersion: 3 }, { merge: true });
  if (kind.id === "train") await adb.doc(`users/${u.uid}/trainingItems/1001`).set({ id: 1001, titre: "QCM 1001", title: "QCM 1001", type: "colle", matiere: "s1", plat: "edni", statut: "a-faire", archivedAt: null, updatedAt: new Date() });
  if (note !== null) await adb.doc(kind.path(u.uid)).set({ html: note, updatedAt: PASSE });
  const ctx = await browser.createBrowserContext(); OPEN.push(ctx); const page = await ctx.newPage();
  page.__errors = []; page.on("pageerror", (e) => page.__errors.push(String(e.message || e))); page.setDefaultNavigationTimeout(120000);
  await page.setViewport(PC);
  await page.goto(BASE + "/tableur.html", { waitUntil: "load" });
  await page.waitForFunction(() => window.__authApi && window.__auth, { timeout: 30000 });
  await page.evaluate(async (e, p) => { await window.__authApi.signInWithEmailAndPassword(window.__auth, e, p); }, u.email, u.password);
  await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0 && window.firebaseDataLoaded !== false, { timeout: 40000 });
  await sleep(1200);
  await page.evaluate(() => { const o = document.getElementById("tpx-onb-overlay"); if (o) o.remove(); if (window.__ednScrollLockOwners) window.__ednScrollLockOwners.clear(); if (window._ednScrollUnlock) window._ednScrollUnlock("onb"); });
  if (kind.id === "train") await waitFor(() => page.evaluate(() => (window.userData.trainings || []).length === 1), { timeout: 20000 });
  return { u, page };
}

const KINDS = [
  { id: "train", label: "notes d'un entraînement", open: () => window._openTrainNotes(1001), editor: "#trainNotesEditor", bold: "#tnBtnBold", close: "#trainNotesOverlay .notes-close-btn",
    path: (uid) => `users/${uid}/notesEntrainements/1001`, draft: (uid) => `trainnotes_pending_${uid}_1001`, dirty: () => window._p1TrainNotesState().dirty },
  { id: "cahier", label: "cahier d'erreurs", open: () => window.openSpeErrModal("s1"), editor: "#speNotesEditor", bold: "#seBtnBold", close: "#speErrOverlay .notes-close-btn",
    path: (uid) => `users/${uid}/errorEntries/s1`, draft: (uid) => `speerrnotes_pending_${uid}_s1`, dirty: () => window.speErrDirty },
];
const aSquelette = (page, sel) => page.evaluate((s) => !!document.querySelector(s + " .p1-skl"), sel);
const brouillonsSquelette = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => /pending|^notes__/.test(k) && /p1-skl/.test(localStorage.getItem(k) || "")));
const htmlEnLigne = async (kind, uid) => { const d = await doc(kind.path(uid)); return d ? d.html : null; };

for (const kind of KINDS) {
  /* ═════════ TS1 / TS2 : action « modifié » pendant le chargement, puis fermeture / fermeture de l'onglet ═════════ */
  for (const sortie of ["fermeture", "pagehide"]) {
    await S(`TS1-${kind.id}-${sortie}`, `${kind.label} : bouton de mise en forme pendant le chargement (drapeau « modifié »), puis ${sortie === "fermeture" ? "fermeture de la fenêtre" : "fermeture de l'onglet (pagehide)"} : la note n'est pas remplacée par le squelette`, async () => {
      const { u, page } = await nouvellePage({ note: NOTE, kind });
      await proxyMode("slow", 1500);
      await page.evaluate(kind.open);
      await sleep(400);
      assert(await aSquelette(page, kind.editor), "le squelette n'est pas affiché pendant le chargement");
      await page.click(kind.bold);
      assert(await page.evaluate(kind.dirty), "précondition : le drapeau « modifié » n'a pas été posé par le bouton");
      if (sortie === "fermeture") await page.click(kind.close);
      else await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      await sleep(7000); await proxyMode("up"); await sleep(3500);
      const h = await htmlEnLigne(kind, u.uid);
      assert(h === NOTE, "la note en ligne a été remplacée : " + JSON.stringify(h).slice(0, 200));
      const ls = await brouillonsSquelette(page);
      assert(ls.length === 0, "brouillon local contenant le squelette : " + ls.join(","));
      assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
    });
  }

  /* ═════════ TS3 : un cahier / une note déjà touchés se rouvre vide, ou sans le squelette, et reste utilisable ═════════ */
  await S(`TS3-${kind.id}`, `${kind.label} : contenu déjà enregistré avec un squelette → rouvert sans le squelette (texte voisin conservé), modifiable, enregistré normalement ensuite`, async () => {
    const { u, page } = await nouvellePage({ kind });
    const skel = await page.evaluate(() => window.p1SkelHTML("editor"));
    for (const [nom, contenu, texte] of [["squelette seul", skel, ""], ["texte + squelette", "<p>Texte à garder</p>" + skel, "Texte à garder"]]) {
      await adb.doc(kind.path(u.uid)).set({ html: contenu, updatedAt: PASSE });
      await page.evaluate(kind.open);
      const ok = await waitFor(() => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.querySelector(".p1-skl") && e.getAttribute("contenteditable") === "true"; }, kind.editor), { timeout: 25000 });
      assert(ok, `${nom} : éditeur toujours en chargement ou squelette conservé`);
      const t = await page.evaluate((s) => document.querySelector(s).innerText.trim(), kind.editor);
      assert(t === texte, `${nom} : texte affiché « ${t} » au lieu de « ${texte} »`);
      await page.click(kind.close); await sleep(1500);
    }
    await page.evaluate(kind.open);
    assert(await waitFor(() => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.querySelector(".p1-skl") && e.getAttribute("contenteditable") === "true"; }, kind.editor), { timeout: 25000 }), "éditeur non prêt");
    await page.evaluate((s) => { const e = document.querySelector(s); e.focus(); const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }, kind.editor);
    await page.keyboard.type(" Nouvelle saisie");
    await page.click(kind.close);
    const ok2 = await waitFor(async () => { const h = await htmlEnLigne(kind, u.uid); return h && /Nouvelle saisie/.test(h) ? h : false; }, { timeout: 15000 });
    assert(ok2 && !/p1-skl/.test(ok2) && /Texte à garder/.test(ok2), "enregistrement normal après nettoyage : " + JSON.stringify(ok2).slice(0, 200));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ TS4 : un brouillon local qui contient un squelette est ignoré ═════════ */
  await S(`TS4-${kind.id}`, `${kind.label} : brouillon local contenant un squelette (plus récent que la note en ligne) → ignoré, la vraie note s'affiche et n'est pas écrasée`, async () => {
    const { u, page } = await nouvellePage({ note: NOTE, kind });
    const skel = await page.evaluate(() => window.p1SkelHTML("editor"));
    await page.evaluate((k, h) => localStorage.setItem(k, JSON.stringify({ html: h, savedAt: Date.now() + 60000 })), kind.draft(u.uid), skel);
    await page.evaluate(kind.open);
    const ok = await waitFor(() => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.querySelector(".p1-skl") && e.getAttribute("contenteditable") === "true"; }, kind.editor), { timeout: 25000 });
    assert(ok, "éditeur non prêt");
    const t = await page.evaluate((s) => document.querySelector(s).innerText.trim(), kind.editor);
    assert(t === "Note existante", "texte affiché : « " + t + " »");
    await sleep(2500);
    assert((await htmlEnLigne(kind, u.uid)) === NOTE, "la note en ligne a été modifiée par le brouillon");
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  /* ═════════ TS5 : le message d'échec de chargement n'est jamais enregistré ═════════ */
  await S(`TS5-${kind.id}`, `${kind.label} : lecture impossible (réseau coupé) → message d'échec affiché ; bouton de mise en forme, réseau rétabli, fermeture de l'onglet : la vraie note n'est pas remplacée par le message`, async () => {
    const { u, page } = await nouvellePage({ kind });
    await adb.doc(kind.path(u.uid)).set({ html: NOTE, updatedAt: PASSE });   // posée après le chargement de la page : aucune copie en mémoire à servir hors ligne
    await proxyMode("down");
    await page.evaluate(kind.open);
    const msg = await waitFor(() => page.evaluate((s) => /Cette note n.a pas pu être chargée/.test(document.querySelector(s).innerText), kind.editor), { timeout: 60000 });
    assert(msg, "message d'échec de chargement jamais affiché");
    await page.click(kind.bold);
    await proxyMode("up"); await sleep(1500);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await sleep(5000);
    assert((await htmlEnLigne(kind, u.uid)) === NOTE, "la note en ligne a été remplacée par le message : " + JSON.stringify(await htmlEnLigne(kind, u.uid)).slice(0, 200));
    const ls = await page.evaluate(() => Object.keys(localStorage).filter((k) => /pending/.test(k) && /pas pu être chargée/.test(localStorage.getItem(k) || "")));
    assert(ls.length === 0, "brouillon local contenant le message : " + ls.join(","));
  });

  /* ═════════ TS6 : fonctionnement normal ═════════ */
  await S(`TS6-${kind.id}`, `${kind.label} : fonctionnement normal — texte existant + ajout tapé au clavier, fermeture : les deux sont enregistrés`, async () => {
    const { u, page } = await nouvellePage({ note: NOTE, kind });
    await page.evaluate(kind.open);
    assert(await waitFor(() => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.querySelector(".p1-skl") && e.getAttribute("contenteditable") === "true"; }, kind.editor), { timeout: 25000 }), "éditeur non prêt");
    await page.evaluate((s) => { const e = document.querySelector(s); e.focus(); const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }, kind.editor);
    await page.keyboard.type(" et ajout");
    await page.click(kind.close);
    const h = await waitFor(async () => { const v = await htmlEnLigne(kind, u.uid); return v && /et ajout/.test(v) ? v : false; }, { timeout: 15000 });
    assert(h && /Note existante/.test(h) && !/p1-skl/.test(h), "contenu enregistré : " + JSON.stringify(h).slice(0, 200));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });
}

/* ═════════ TS7 : notes d'un cours ═════════ */
const OUVRIR_COURS = () => window.openNotesModal(1, "s1", "c1", "Cours1");
const PRET_COURS = (page) => waitFor(() => page.evaluate(() => { const e = document.getElementById("notesEditorArea"); return !!e && !e.querySelector(".p1-skl") && e.getAttribute("contenteditable") === "true" && window._notesKey && window._notesLastHtml !== null; }), { timeout: 30000 });
await S("TS7-cours-chargement", "notes d'un cours : fermeture et fermeture de l'onglet pendant le chargement → rien n'est enregistré, aucun brouillon avec squelette", async () => {
  const { u, page } = await nouvellePage({ kind: KINDS[0] });
  await page.evaluate(OUVRIR_COURS);
  assert(await PRET_COURS(page), "notes du cours non prêtes");
  const cle = await page.evaluate(() => window._notesKey);
  await page.click("#notesModalOverlay .notes-close-btn"); await sleep(1200);
  await adb.doc(`users/${u.uid}/notes/${cle}`).set({ html: NOTE, updatedAt: PASSE });
  await proxyMode("slow", 1500);
  await page.evaluate(OUVRIR_COURS);
  await sleep(400);
  assert(await aSquelette(page, "#notesEditorArea"), "le squelette n'est pas affiché pendant le chargement");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.click("#notesModalOverlay .notes-close-btn");
  await sleep(7000); await proxyMode("up"); await sleep(3500);
  const d = await doc(`users/${u.uid}/notes/${cle}`);
  assert(d && d.html === NOTE, "la note en ligne a été remplacée : " + JSON.stringify(d).slice(0, 200));
  assert((await brouillonsSquelette(page)).length === 0, "brouillon local contenant le squelette");
  assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
});
await S("TS7-cours-releve", "notes d'un cours : note déjà enregistrée avec un squelette → rouverte sans le squelette (texte voisin conservé), modifiable, enregistrée normalement ensuite", async () => {
  const { u, page } = await nouvellePage({ kind: KINDS[0] });
  await page.evaluate(OUVRIR_COURS);
  assert(await PRET_COURS(page), "notes du cours non prêtes");
  const cle = await page.evaluate(() => window._notesKey);
  const skel = await page.evaluate(() => window.p1SkelHTML("editor"));
  await page.click("#notesModalOverlay .notes-close-btn"); await sleep(1200);
  await adb.doc(`users/${u.uid}/notes/${cle}`).set({ html: "<p>Texte à garder</p>" + skel, updatedAt: PASSE });
  await page.evaluate(OUVRIR_COURS);
  assert(await PRET_COURS(page), "notes du cours non prêtes après réouverture");
  const t = await page.evaluate(() => document.getElementById("notesEditorArea").innerText.trim());
  assert(t === "Texte à garder", "texte affiché : « " + t + " »");
  await page.evaluate(() => { const e = document.getElementById("notesEditorArea"); e.focus(); const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); });
  await page.keyboard.type(" et ajout");
  await page.click("#notesModalOverlay .notes-close-btn");
  const h = await waitFor(async () => { const d = await doc(`users/${u.uid}/notes/${cle}`); return d && /et ajout/.test(d.html) ? d.html : false; }, { timeout: 15000 });
  assert(h && /Texte à garder/.test(h) && !/p1-skl/.test(h), "contenu enregistré : " + JSON.stringify(h).slice(0, 200));
  assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
});

/* ═════════ TS8 : les deux fonctions utilitaires ═════════ */
await S("TS8", "p1HtmlPasNote / p1RetirerSquelette : squelette et message d'échec détectés, texte ordinaire jamais touché, contenu normal rendu tel quel", async () => {
  const { page } = await nouvellePage({ kind: KINDS[1] });
  const r = await page.evaluate(() => {
    const sk = window.p1SkelHTML("editor"), liste = window.p1SkelHTML("list");
    const echec = "<div style=\"opacity:.75;\"><i class=\"fas fa-cloud-arrow-down\" style=\"margin-right:6px;\"></i>Cette note n'a pas pu être chargée. Vérifiez votre connexion et rouvrez le cahier.</div>";
    const normal = "<p>Texte <b>gras</b> et <img src=\"x.png\"> sans squelette</p>";
    return {
      pasNote: [sk, liste, echec, "<p>a</p>" + sk, "<p>a</p>" + echec].map(window.p1HtmlPasNote),
      note: [normal, "", "<p>Cette note n'a pas pu être chargée</p>", "<p>p1 skl</p>"].map(window.p1HtmlPasNote),
      sansBloc: [window.p1RetirerSquelette(sk), window.p1RetirerSquelette("<p>a</p>" + sk + "<p>b</p>"), window.p1RetirerSquelette("<p>a</p>" + echec)],
      identique: window.p1RetirerSquelette(normal) === normal && window.p1RetirerSquelette("") === "",
    };
  });
  assert(r.pasNote.every((v) => v === true), "détection : " + JSON.stringify(r.pasNote));
  assert(r.note.every((v) => v === false), "faux positif : " + JSON.stringify(r.note));
  assert(r.sansBloc[0] === "" && r.sansBloc[1] === "<p>a</p><p>b</p>" && r.sansBloc[2] === "<p>a</p>", "nettoyage : " + JSON.stringify(r.sansBloc));
  assert(r.identique, "un contenu normal doit être rendu tel quel");
});

const code = report();
await browser.close(); await server.close?.(); await proxy.close?.();
process.exit(code);
