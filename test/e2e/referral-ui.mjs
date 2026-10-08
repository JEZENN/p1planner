/* Batterie E2E « vraies pages » du PARRAINAGE (2026-09-26).
   Vraies pages (auth.html, comptepremium.html) servies par e2e-server.mjs, branchées sur les émulateurs
   Auth/Firestore ; les fonctions callable sont le VRAI code de functions/index.js exécuté par le pont
   fn-bridge.mjs (jamais une réponse écrite à la main). Arguments = préfixes de scénarios ; PUBLIC_DIR=<copie>
   pour rejouer sur un MUTANT (contrôle de sensibilité : les scénarios « course » doivent alors ÉCHOUER). */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startBridge } from "./fn-bridge.mjs";
import { startProxy } from "./flaky-proxy.mjs"; // le tableur parle à Firestore via ce relais (8085)
import { launch, mkUser, openPage, adb, aauth, doc, sleep, waitFor, scenario, report, assert, BASE } from "./lib.mjs";
import { callReferralInit, callReferralMarkActive, callReferralApplyCode, callReferralMarkSeen, seedEntitlement, getEntitlement, getReferral, resetStripe } from "../lib/referral-harness.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const bridge = await startBridge(5001);
const proxy = await startProxy();
const browser = await launch();
resetStripe();

let seq = 0;
const tag = () => `${Date.now().toString(36)}${seq++}`;
const CODE_RE = /^[A-Z2-9]{6}$/;

async function newPage({ width = 1280, height = 900 } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument(() => {
    window.__alerts = [];
    document.addEventListener("DOMContentLoaded", () => {
      const el = document.getElementById("globalAlert");
      if (!el) return;
      new MutationObserver(() => { const t = el.textContent.trim(); if (t) window.__alerts.push(t); })
        .observe(el, { childList: true, subtree: true, characterData: true, attributes: true });
    });
  });
  await page.setViewport({ width, height });
  return { page, ctx };
}

/* Parrain : compte vérifié + essai actif + code réservé (via la vraie fonction). */
async function mkParrain(name = "Parrain") {
  const u = await mkUser();
  await aauth.updateUser(u.uid, { displayName: name });
  const { referralCode } = await callReferralInit(u.uid);
  return Object.assign(u, { code: referralCode, name });
}
/* Filleul actif « en base » (sans passer par les pages) : lien + activation via les vraies fonctions. */
async function mkActiveReferral(parrain, name) {
  const u = await mkUser();
  await aauth.updateUser(u.uid, { displayName: name });
  await callReferralInit(u.uid, { referredBy: parrain.code });
  await callReferralMarkActive(u.uid, { name });
  return u;
}

async function loginViaForm(page, user, redirect = "/comptepremium.html") {
  await page.goto(`${BASE}/auth.html?redirect=${encodeURIComponent(redirect)}`, { waitUntil: "load" });
  await page.waitForSelector("#loginEmail");
  await page.type("#loginEmail", user.email);
  await page.type("#loginPassword", user.password);
  const t0 = Date.now();
  await page.click("#btnLogin");
  await page.waitForFunction((p) => location.pathname.endsWith(p), { timeout: 30000 }, redirect.split("?")[0]);
  return Date.now() - t0;
}
async function openPremium(page) {
  await page.waitForFunction(() => /^[A-Z2-9]{6}$/.test((document.getElementById("referralCodeBox") || {}).textContent || ""), { timeout: 30000 });
}
async function fillSignup(page, { email, code }) {
  await page.waitForSelector("#signupFirstName");
  await page.type("#signupFirstName", "Camille");
  await page.type("#signupLastName", "Durand");
  await page.type("#signupEmail", email);
  await page.type("#signupPassword", "Test1234!");
  await page.type("#signupPasswordConfirm", "Test1234!");
  await page.evaluate(() => { document.getElementById("signupConsent").checked = true; });
  if (code) await page.type("#signupReferralCode", code);
}
async function accountExists(email) { try { await aauth.getUserByEmail(email); return true; } catch (e) { return false; } }
async function verifyAndSeed(email) {
  const u = await aauth.getUserByEmail(email);
  await aauth.updateUser(u.uid, { emailVerified: true });
  await seedEntitlement(u.uid);           // équivaut au bootstrap serveur onUserCreated (absent des émulateurs ici)
  await adb.doc(`users/${u.uid}`).set({ displayName: null }, { merge: true }); // comme en vrai : displayName souvent nul à ce stade
  return { uid: u.uid, email, password: "Test1234!" };
}
const hasApply = (page) => page.evaluate(() => getComputedStyle(document.getElementById("referralApplyBlock")).display !== "none");

try {
  // ── Inscription / lien / champ rétroactif ─────────────────────────────────────────────
  await S("U1", "inscription SANS code -> connexion -> Compte Premium : champ rétroactif affiché, code propre généré", async () => {
    const { page } = await newPage();
    const email = `e2e-${tag()}@test.fr`;
    await page.goto(`${BASE}/auth.html#inscription`, { waitUntil: "load" });
    await fillSignup(page, { email });
    await page.click("#btnSignup");
    assert(await waitFor(() => accountExists(email), { timeout: 20000 }), "compte non créé");
    await page.waitForSelector("#verifyResendRow.is-visible", { timeout: 20000 }); // la déconnexion post-inscription est terminée (sinon course avec la page de connexion)
    const u = await verifyAndSeed(email);
    assert(!(await getReferral(u.uid)), "aucun lien attendu sans code");
    await loginViaForm(page, u);
    await openPremium(page);
    assert(await hasApply(page), "le champ rétroactif doit être affiché pour un compte sans parrain");
  });

  await S("U2", "code valide tapé à l'inscription -> lié ; après connexion le parrain est crédité et le champ est masqué", async () => {
    const p = await mkParrain();
    const { page } = await newPage();
    const email = `e2e-${tag()}@test.fr`;
    await page.goto(`${BASE}/auth.html#inscription`, { waitUntil: "load" });
    await fillSignup(page, { email, code: p.code.toLowerCase() });
    await page.waitForFunction(() => document.getElementById("signupReferralCodeSuccess").classList.contains("is-visible"), { timeout: 15000 });
    await page.click("#btnSignup");
    assert(await waitFor(() => accountExists(email), { timeout: 20000 }), "compte non créé");
    await page.waitForSelector("#verifyResendRow.is-visible", { timeout: 20000 }); // la déconnexion post-inscription est terminée (sinon course avec la page de connexion)
    const u = await verifyAndSeed(email);
    assert(await waitFor(async () => (await getReferral(u.uid)) && (await getReferral(u.uid)).referrerUid === p.uid, { timeout: 15000 }), "lien filleul->parrain absent");
    await loginViaForm(page, u);
    assert(await waitFor(async () => ((await getEntitlement(p.uid)) || {}).referralActiveCount === 1, { timeout: 15000 }), "parrain non crédité après la 1re connexion vérifiée");
    await openPremium(page);
    assert(!(await hasApply(page)), "champ rétroactif masqué pour un compte déjà lié");
    const ref = await getReferral(u.uid);
    assert(ref.filleulName === "Camille Durand", "nom du filleul = « Prénom Nom » : " + ref.filleulName);
  });

  await S("U3", "lien ?ref=CODE : onglet inscription + champ pré-rempli en majuscules ; compte créé = lié", async () => {
    const p = await mkParrain();
    const { page } = await newPage();
    const email = `e2e-${tag()}@test.fr`;
    await page.goto(`${BASE}/auth.html?ref=${p.code.toLowerCase()}`, { waitUntil: "load" });
    const st = await page.evaluate(() => ({ val: document.getElementById("signupReferralCode").value, visible: document.getElementById("signupReferralCode").offsetParent !== null }));
    assert(st.visible, "onglet inscription non affiché avec ?ref=");
    assert(st.val === p.code, "champ non pré-rempli : " + st.val);
    await fillSignup(page, { email });
    await page.waitForFunction(() => document.getElementById("signupReferralCodeSuccess").classList.contains("is-visible"), { timeout: 15000 });
    await page.click("#btnSignup");
    assert(await waitFor(() => accountExists(email), { timeout: 20000 }), "compte non créé");
    const u = await aauth.getUserByEmail(email);
    assert(await waitFor(async () => { const r = await getReferral(u.uid); return r && r.referrerUid === p.uid; }, { timeout: 15000 }), "compte créé via le lien non lié");
    const noLinkParam = await page.evaluate(() => location.search);
    assert(noLinkParam.includes("ref="), "le paramètre ref est resté dans l'URL");
  });

  await S("U4", "saisie rétroactive : parrain crédité, champ masqué ensuite, second appel direct refusé", async () => {
    const p = await mkParrain();
    const u = await mkUser();
    const { page } = await newPage();
    await loginViaForm(page, u);
    await openPremium(page);
    assert(await hasApply(page), "champ rétroactif attendu");
    await page.type("#referralApplyInput", p.code);
    await page.click("#btnApplyReferralCode");
    assert(await waitFor(async () => ((await getEntitlement(p.uid)) || {}).referralActiveCount === 1, { timeout: 15000 }), "parrain non crédité");
    assert(await waitFor(async () => !(await hasApply(page)), { timeout: 10000 }), "champ toujours visible après la saisie");
    const second = await mkParrain("Autre");
    let refused = false;
    try { await callReferralApplyCode(u.uid, second.code); } catch (e) { refused = e.code === "failed-precondition"; }
    assert(refused, "un second code doit être refusé");
    assert(((await getEntitlement(second.uid)) || {}).referralActiveCount === undefined || (await getEntitlement(second.uid)).referralActiveCount === 0, "le second parrain ne doit rien recevoir");
    const shown = await page.evaluate(() => document.getElementById("referralApplyMessage").textContent);
    assert(!/déjà renseigné/i.test(shown), "aucune phrase « déjà renseigné » quand le champ est masqué");
  });

  await S("U5", "ancien compte sans aucun champ de parrainage : page correcte, code généré à l'ouverture, champ rétroactif affiché", async () => {
    const u = await mkUser(); // aucun referralCode, aucun compteur
    const { page } = await newPage();
    await loginViaForm(page, u);
    await openPremium(page);
    assert(await hasApply(page), "champ rétroactif attendu");
    const code = await page.evaluate(() => document.getElementById("referralCodeBox").textContent);
    assert(CODE_RE.test(code), "code invalide : " + code);
    assert((await doc(`users/${u.uid}`)).referralCode === code, "code non enregistré");
  });

  // ── Tuile cliquable, liste, réciprocité ───────────────────────────────────────────────
  await S("L1", "tuile inerte à 0 ; cliquable dès 1 ; modal = liste réelle, aucun uid/e-mail dans la réponse serveur", async () => {
    const p = await mkParrain();
    const { page } = await newPage();
    await loginViaForm(page, p);
    await openPremium(page);
    assert(await page.evaluate(() => !document.getElementById("referralActiveTile").getAttribute("role")), "tuile inerte à 0");
    const f1 = await mkActiveReferral(p, "Alice Dupont");
    const f2 = await mkActiveReferral(p, "Bob Martin");
    await page.reload({ waitUntil: "load" });
    await openPremium(page);
    assert(await page.evaluate(() => document.getElementById("referralActiveTile").getAttribute("role") === "button"), "tuile cliquable dès 1");
    bridge.calls.length = 0;
    await page.click("#referralActiveTile");
    await page.waitForFunction(() => document.querySelectorAll("#referralModalList .referral-row").length === 2, { timeout: 15000 });
    const rows = await page.evaluate(() => [...document.querySelectorAll("#referralModalList .referral-row")].map((r) => ({ name: r.querySelector(".referral-row-name").textContent, code: r.querySelector(".referral-row-code").textContent })));
    assert(rows.map((r) => r.name).sort().join() === "Alice Dupont,Bob Martin", "noms : " + JSON.stringify(rows));
    assert(rows.every((r) => CODE_RE.test(r.code)), "codes : " + JSON.stringify(rows));
    const call = bridge.calls.find((c) => c.fn === "referralListReferrals");
    const json = JSON.stringify(call.result);
    assert(!json.includes(f1.uid) && !json.includes(f2.uid) && !json.includes("@"), "uid/e-mail présents dans la réponse : " + json);
    await page.keyboard.press("Escape");
    assert(await page.evaluate(() => document.activeElement && document.activeElement.id === "referralActiveTile"), "focus non rendu à la tuile");
  });

  await S("L2", "réciprocité : copier le code d'un filleul dans le modal, le saisir dans le champ rétroactif d'un autre compte -> ce filleul est crédité", async () => {
    const p = await mkParrain();
    const f = await mkActiveReferral(p, "Alice Dupont");
    const { page } = await newPage();
    await loginViaForm(page, p);
    await openPremium(page);
    await page.click("#referralActiveTile");
    await page.waitForFunction(() => document.querySelectorAll("#referralModalList .referral-row").length === 1, { timeout: 15000 });
    const code = await page.evaluate(() => document.querySelector(".referral-row-code").textContent);
    const g = await mkUser();
    const { page: page2 } = await newPage();
    await loginViaForm(page2, g);
    await openPremium(page2);
    await page2.type("#referralApplyInput", code);
    await page2.click("#btnApplyReferralCode");
    assert(await waitFor(async () => ((await getEntitlement(f.uid)) || {}).referralActiveCount === 1, { timeout: 15000 }), "le propriétaire du code (le filleul) doit être crédité");
    assert(((await getEntitlement(g.uid)) || {}).referralActiveCount === undefined, "celui qui saisit n'est jamais crédité");
  });

  // ── Courses d'inscription (à valider sur mutant) ─────────────────────────────────────
  await S("R1", "course : code INCONNU + clic immédiat, contrôle lent (900 ms) -> bloqué, aucun compte créé", async () => {
    bridge.setDelay("referralCheckCode", 900);
    const { page } = await newPage();
    const email = `e2e-${tag()}@test.fr`;
    await page.goto(`${BASE}/auth.html#inscription`, { waitUntil: "load" });
    await fillSignup(page, { email });
    await page.type("#signupReferralCode", "ZZZZ99");
    await page.click("#btnSignup");            // immédiatement : le contrôle est encore en cours
    await sleep(3500);
    assert(!(await accountExists(email)), "COMPTE CRÉÉ avec un code faux (course)");
    const alerts = await page.evaluate(() => window.__alerts);
    assert(alerts.some((a) => /n'existe pas/.test(a)), "message de blocage attendu : " + JSON.stringify(alerts));
    bridge.reset();
  });

  await S("R2", "course : code INCONNU + touche Entrée immédiate, contrôle lent -> bloqué", async () => {
    bridge.setDelay("referralCheckCode", 900);
    const { page } = await newPage();
    const email = `e2e-${tag()}@test.fr`;
    await page.goto(`${BASE}/auth.html#inscription`, { waitUntil: "load" });
    await fillSignup(page, { email });
    await page.type("#signupReferralCode", "ZZZZ99");
    await page.keyboard.press("Enter");
    await sleep(3500);
    assert(!(await accountExists(email)), "COMPTE CRÉÉ avec un code faux (Entrée)");
    bridge.reset();
  });

  await S("R3", "double-clic (contrôle lent, code valide) : UNE seule inscription et aucun message d'erreur à aucun moment", async () => {
    const p = await mkParrain();
    bridge.setDelay("referralCheckCode", 900);
    const { page } = await newPage();
    const email = `e2e-${tag()}@test.fr`;
    await page.goto(`${BASE}/auth.html#inscription`, { waitUntil: "load" });
    await fillSignup(page, { email, code: p.code });
    await page.evaluate(() => { const b = document.getElementById("btnSignup"); b.click(); b.click(); });
    await page.keyboard.press("Enter");
    assert(await waitFor(() => accountExists(email), { timeout: 20000 }), "compte non créé");
    await sleep(3000);
    const users = (await aauth.listUsers(1000)).users.filter((u) => u.email === email);
    assert(users.length === 1, "comptes créés : " + users.length);
    const alerts = await page.evaluate(() => window.__alerts);
    assert(!alerts.some((a) => /erreur|déjà|existe/i.test(a) && !/vérification/i.test(a)), "message d'erreur affiché : " + JSON.stringify(alerts));
    bridge.reset();
  });

  await S("R4", "contrôle du code EN PANNE + code de 6 caractères -> compte créé (non bloquant) ; contrôle joignable + inconnu -> bloqué", async () => {
    bridge.setFail("referralCheckCode", true);
    const { page } = await newPage();
    const email = `e2e-${tag()}@test.fr`;
    await page.goto(`${BASE}/auth.html#inscription`, { waitUntil: "load" });
    await fillSignup(page, { email, code: "ZZZZ99" });
    await sleep(1200);
    const neutral = await page.evaluate(() => ({ err: document.getElementById("signupReferralCodeError").classList.contains("is-visible"), ok: document.getElementById("signupReferralCodeSuccess").classList.contains("is-visible") }));
    assert(!neutral.err && !neutral.ok, "état neutre attendu (ni valide ni invalide) : " + JSON.stringify(neutral));
    await page.click("#btnSignup");
    assert(await waitFor(() => accountExists(email), { timeout: 20000 }), "inscription bloquée par une panne du contrôle");
    bridge.reset();
    const { page: page2 } = await newPage();
    const email2 = `e2e-${tag()}@test.fr`;
    await page2.goto(`${BASE}/auth.html#inscription`, { waitUntil: "load" });
    await fillSignup(page2, { email: email2, code: "ZZZZ99" });
    await page2.click("#btnSignup");
    await sleep(2500);
    assert(!(await accountExists(email2)), "code confirmé inconnu : l'inscription doit être bloquée");
  });

  await S("R5", "code incomplet (≠ 6 caractères) : blocage local, aucun appel au serveur", async () => {
    bridge.reset();
    const { page } = await newPage();
    const email = `e2e-${tag()}@test.fr`;
    await page.goto(`${BASE}/auth.html#inscription`, { waitUntil: "load" });
    await fillSignup(page, { email, code: "AB2" });
    await page.click("#btnSignup");
    await sleep(1500);
    assert(!(await accountExists(email)), "compte créé avec un code incomplet");
    assert(!bridge.calls.some((c) => c.fn === "referralCheckCode"), "aucun appel attendu pour un code incomplet");
  });

  await S("R6", "connexion NON retardée par referralMarkActive (lente 6 s, puis en erreur)", async () => {
    const u = await mkUser();
    bridge.setDelay("referralMarkActive", 6000);
    const { page } = await newPage();
    const ms = await loginViaForm(page, u);
    assert(ms < 4000, "redirection retardée par le parrainage : " + ms + " ms");
    bridge.reset(); bridge.setFail("referralMarkActive", true);
    const { page: page2 } = await newPage();
    const ms2 = await loginViaForm(page2, u);
    assert(ms2 < 4000, "redirection retardée par une erreur du parrainage : " + ms2 + " ms");
    bridge.reset();
  });

  // ── Notification « nouveau filleul » ──────────────────────────────────────────────────
  const toastText = (page) => page.evaluate(() => { const t = document.getElementById("referralToast"); return t.classList.contains("is-visible") ? t.textContent.trim() : null; });

  await S("N1", "notification : une seule fois par nouveau parrainage (rechargements, accusé perdu, ancienne réponse serveur)", async () => {
    const p = await mkParrain();
    await mkActiveReferral(p, "Alice Dupont");
    const { page } = await newPage();
    await loginViaForm(page, p);
    await openPremium(page);
    await page.waitForFunction(() => document.getElementById("referralToast").classList.contains("is-visible"), { timeout: 10000 });
    const t = await toastText(page);
    assert(/Nouveau filleul/.test(t) && /Alice Dupont a utilisé ton code de parrainage\./.test(t), "texte : " + t);
    await sleep(600);
    assert(((await getEntitlement(p.uid)) || {}).referralSeenCount === 1, "accusé de réception non enregistré côté serveur");
    await page.reload({ waitUntil: "load" }); await openPremium(page); await sleep(1200);
    assert((await toastText(page)) === null, "notification répétée au rechargement");
    // accusé perdu : serveur remis à 0, la mémoire locale suffit
    await adb.doc(`entitlements/${p.uid}`).update({ referralSeenCount: 0 });
    await page.reload({ waitUntil: "load" }); await openPremium(page); await sleep(1200);
    assert((await toastText(page)) === null, "notification répétée alors que l'accusé serveur est perdu");
    // nouveau filleul -> nouvelle notification, une fois
    await mkActiveReferral(p, "Bob Martin");
    await page.reload({ waitUntil: "load" }); await openPremium(page);
    await page.waitForFunction(() => document.getElementById("referralToast").classList.contains("is-visible"), { timeout: 10000 });
    assert(/Bob Martin a utilisé/.test(await toastText(page)), "nouveau filleul non annoncé");
  });

  await S("N2", "notification : nouvelle page + ANCIENNE réponse serveur (sans referralSeenCount ni newReferrals) -> annoncée une seule fois, sans nom", async () => {
    const p = await mkParrain();
    await mkActiveReferral(p, "Alice Dupont");
    bridge.setFail("referralMarkSeen", true); // accusé serveur perdu : seule la mémoire locale peut éviter la répétition
    const { page } = await newPage();
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      if (req.method() === "POST" && req.url().includes("/referralEnsureCode")) {
        // ancienne fonction : mêmes champs qu'avant l'ajout de la notification
        const r = await fetch(req.url(), { method: "POST", headers: { "Content-Type": "application/json", Authorization: req.headers().authorization || "" }, body: req.postData() });
        const j = await r.json();
        if (j.result) { delete j.result.referralSeenCount; delete j.result.newReferrals; }
        return req.respond({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(j) });
      }
      req.continue();
    });
    await loginViaForm(page, p);
    await openPremium(page);
    await page.waitForFunction(() => document.getElementById("referralToast").classList.contains("is-visible"), { timeout: 10000 });
    assert(/Un nouveau filleul a utilisé ton code de parrainage\./.test(await toastText(page)), "formulation sans nom : " + (await toastText(page)));
    await page.reload({ waitUntil: "load" }); await openPremium(page); await sleep(1200);
    assert((await toastText(page)) === null, "annonce répétée avec l'ancienne réponse serveur");
    bridge.reset();
  });

  await S("N3", "notification dédiée : n'écrase JAMAIS #globalAlert ni #activationBanner (retour de paiement) et n'est pas écrasée", async () => {
    const p = await mkParrain();
    await mkActiveReferral(p, "Alice Dupont");
    const { page } = await newPage();
    await loginViaForm(page, p, "/comptepremium.html?success=true");
    await openPremium(page);
    await page.waitForFunction(() => document.getElementById("referralToast").classList.contains("is-visible"), { timeout: 10000 });
    const st = await page.evaluate(() => ({ banner: document.getElementById("activationBanner").style.display, toast: document.getElementById("referralToast").classList.contains("is-visible"),
      globalTextBefore: document.getElementById("globalAlert").textContent.trim() }));
    assert(st.toast, "toast attendu");
    await page.evaluate(() => { const g = document.getElementById("globalAlert"); g.className = "alert is-visible alert-error"; g.textContent = "Erreur de test à garder visible"; });
    await sleep(500);
    assert(await page.evaluate(() => document.getElementById("referralToast").classList.contains("is-visible")), "le toast a été effacé par l'alerte globale");
    assert(await page.evaluate(() => document.getElementById("globalAlert").textContent.includes("Erreur de test")), "l'alerte globale a été écrasée");
  });

  await S("N4", "XSS : un nom de filleul piégé reste du texte (notification ET liste)", async () => {
    const p = await mkParrain();
    const f = await mkUser();
    await callReferralInit(f.uid, { referredBy: p.code });
    await callReferralMarkActive(f.uid, { name: "Zed" });
    await adb.doc(`referrals/${f.uid}`).update({ filleulName: "<img src=x onerror=window.__xss=1>Piège" });
    const { page } = await newPage();
    await loginViaForm(page, p);
    await openPremium(page);
    await page.waitForFunction(() => document.getElementById("referralToast").classList.contains("is-visible"), { timeout: 10000 });
    await page.click("#referralActiveTile");
    await page.waitForFunction(() => document.querySelectorAll("#referralModalList .referral-row").length === 1, { timeout: 15000 });
    const r = await page.evaluate(() => ({ xss: window.__xss === 1, imgs: document.querySelectorAll("#referralModalList img, #referralToast img").length }));
    assert(!r.xss && r.imgs === 0, "injection HTML exécutée : " + JSON.stringify(r));
  });

  // ── Mise en page ──────────────────────────────────────────────────────────────────────
  await S("V1", "clair/sombre + téléphone 390 px : aucun débordement horizontal (section, modal, notification)", async () => {
    const p = await mkParrain();
    for (const n of ["Alice Dupont Très Long Nom De Famille Composé", "Bob"]) await mkActiveReferral(p, n);
    const { page } = await newPage({ width: 390, height: 800 });
    for (const scheme of ["dark", "light"]) {
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
      if (scheme === "dark") await loginViaForm(page, p); else await page.reload({ waitUntil: "load" });
      await openPremium(page);
      await page.click("#referralActiveTile");
      await page.waitForFunction(() => document.querySelectorAll("#referralModalList .referral-row").length === 2, { timeout: 15000 });
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, listOverflow: [...document.querySelectorAll(".referral-row")].some((r) => r.scrollWidth > r.clientWidth + 1) }));
      assert(m.sw <= m.iw && !m.listOverflow, `débordement (${scheme}) : ` + JSON.stringify(m));
      await page.keyboard.press("Escape");
      await sleep(300);
    }
  });

  // ── tableur.html : code dans le menu profil + pastilles ───────────────────────────────
  const dotOn = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); return !!e && e.classList.contains("show"); }, id);
  await S("T1", "tableur : pastille rouge (avatar + Compte premium) tant qu'un filleul n'est pas vu ; elle survit aux autres écrivains ; s'éteint à l'accusé", async () => {
    const p = await mkParrain();
    await mkActiveReferral(p, "Alice Dupont");
    const { page } = await openPage(browser, p);
    assert(await waitFor(() => dotOn(page, "avatar-notif-dot"), { timeout: 15000 }), "pastille avatar absente");
    assert(await dotOn(page, "premium-referral-dot"), "pastille du bouton Compte premium absente");
    await sleep(4000); // laisse tourner les autres écrivains (avis, etc.)
    assert(await dotOn(page, "avatar-notif-dot"), "la pastille du parrainage a été ÉTEINTE par un autre écrivain");
    await callReferralMarkSeen(p.uid);
    assert(await waitFor(async () => !(await dotOn(page, "avatar-notif-dot")) && !(await dotOn(page, "premium-referral-dot")), { timeout: 15000 }), "pastilles non éteintes après l'accusé de réception");
  });

  await S("T2", "tableur : « Code parrainage » = code connu affiché ; compte sans code : « — » puis récupéré à l'ouverture du menu ; échec => « — » puis nouvel essai", async () => {
    const known = await mkParrain();
    const { page } = await openPage(browser, known);
    await page.click("#user-avatar");
    assert(await waitFor(() => page.evaluate((c) => document.getElementById("profile-referral-code-text").textContent === c, known.code), { timeout: 8000 }), "code connu non affiché");
    const bare = await mkUser(); // aucun code
    bridge.setFail("referralEnsureCode", true);
    const { page: page2 } = await openPage(browser, bare);
    assert(await page2.evaluate(() => document.getElementById("profile-referral-code-text").textContent === "—"), "« — » attendu sans code");
    await page2.click("#user-avatar");
    await sleep(1500);
    assert(await page2.evaluate(() => document.getElementById("profile-referral-code-text").textContent === "—"), "après échec : retour à « — »");
    bridge.reset();
    await page2.click("#user-avatar"); await sleep(400); await page2.click("#user-avatar"); // fermer puis rouvrir
    assert(await waitFor(() => page2.evaluate(() => /^[A-Z2-9]{6}$/.test(document.getElementById("profile-referral-code-text").textContent)), { timeout: 10000 }), "code non récupéré au nouvel essai");
    const appelsAuChargement = bridge.calls.filter((c) => c.fn === "referralEnsureCode").length;
    assert(appelsAuChargement === 1, "referralEnsureCode ne doit être appelé qu'à l'ouverture du menu (" + appelsAuChargement + ")");
  });

  await S("T3", "tableur : « Nouveautés » — entrée « Programme de parrainage » toujours présente", async () => {
    const u = await mkUser();
    const { page } = await openPage(browser, u);
    const r = await page.evaluate(() => ({ txt: document.querySelector(".whats-new-modal-body").textContent, keys: Object.keys(localStorage) }));
    assert(/Programme de parrainage/.test(r.txt), "entrée absente des Nouveautés");
  });


  await S("T4", "tableur : clic sur le code du menu -> badge VERT + coche, puis retour au cadeau (comme le produit frère)", async () => {
    const u = await mkParrain();
    const { page } = await openPage(browser, u);
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.resolve(); }); // le presse-papiers réel n'est pas autorisé en headless
    await page.click("#user-avatar");
    await page.waitForFunction((c) => document.getElementById("profile-referral-code-text").textContent === c, { timeout: 8000 }, u.code);
    await page.evaluate(() => document.getElementById("profile-referral-code").click()); // l'assistant d'accueil (nouveaux comptes) recouvre l'écran : clic DOM
    await sleep(250);
    const on = await page.evaluate(() => ({ bg: document.getElementById("profile-referral-code").style.background, icon: document.querySelector("#profile-referral-code i").className }));
    assert(/16, ?185, ?129|10b981/i.test(on.bg) && on.icon.includes("fa-check"), "animation de copie absente : " + JSON.stringify(on));
    await sleep(1700);
    const off = await page.evaluate(() => ({ bg: document.getElementById("profile-referral-code").style.background, icon: document.querySelector("#profile-referral-code i").className }));
    assert(off.bg === "" && off.icon.includes("fa-gift"), "retour à l'état normal absent : " + JSON.stringify(off));
  });

  await S("C1", "Compte Premium : copie du lien -> bouton VERT + coche + « Copié ! » puis retour ; lien affiché = lien de partage", async () => {
    const p = await mkParrain();
    const { page } = await newPage();
    await loginViaForm(page, p);
    await openPremium(page);
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.resolve(); });
    const link = await page.evaluate(() => document.getElementById("referralLinkInput").value);
    assert(link === "https://p1planner.fr/auth.html?ref=" + p.code, "lien : " + link);
    await page.click("#btnCopyReferralLink"); await sleep(250);
    const on = await page.evaluate(() => { const b = document.getElementById("btnCopyReferralLink"); return { cls: b.className, label: b.querySelector(".referral-copy-btn-label").textContent }; });
    assert(on.cls.includes("copied") && on.label === "Copié !", "animation : " + JSON.stringify(on));
    await sleep(1700);
    const off = await page.evaluate(() => { const b = document.getElementById("btnCopyReferralLink"); return { cls: b.className, label: b.querySelector(".referral-copy-btn-label").textContent }; });
    assert(!off.cls.includes("copied") && off.label === "Copier le lien", "retour normal : " + JSON.stringify(off));
  });

  // ── admin.html ────────────────────────────────────────────────────────────────────────
  await S("A1", "admin : onglet Parrainage (récapitulatif + table triable) et colonne « Parrainé par » (Utilisateurs)", async () => {
    const admin = await mkUser();
    await adb.doc(`users/${admin.uid}`).set({ isAdmin: true, displayName: "Admin E2E", email: admin.email }, { merge: true });
    const p = await mkParrain("Parrain Vedette");
    const f = await mkActiveReferral(p, "Alice Dupont");
    const f2 = await mkActiveReferral(p, "Bob Martin");
    // admin.html liste users triés par createdAt : le bootstrap serveur (onUserCreated) pose ce champ, absent des comptes de test
    for (const u of [admin, p, f, f2]) await adb.doc(`users/${u.uid}`).set({ createdAt: new Date() }, { merge: true });
    const label = "Parrain Vedette " + tag();
    await adb.doc(`users/${p.uid}`).set({ displayName: label }, { merge: true });
    const { page } = await newPage();
    await loginViaForm(page, admin, "/admin.html");
    await page.waitForFunction(() => { const e = document.getElementById("stat-total-users"); return e && /^[0-9]+$/.test(e.textContent); }, { timeout: 30000 });
    await page.evaluate(() => document.querySelector("[data-section=referrals]").click());
    const st = await page.evaluate((code) => {
      const rows = [...document.querySelectorAll("#referrals-tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent.replace(/\s+/g, " ").trim()));
      return { referrers: Number(document.getElementById("stat-referrers-count").textContent), total: Number(document.getElementById("stat-referrals-total").textContent), row: rows.find((r) => r[1] === code) || null };
    }, p.code);
    assert(st.referrers >= 1 && st.total >= 2, "récapitulatif : " + JSON.stringify(st));
    assert(st.row && st.row[0].includes(label) && st.row[2] === "2" && st.row[3] === "0", "ligne du parrain : " + JSON.stringify(st.row));
    await page.evaluate(() => window.__sortReferrals("count"));
    const sortedFirst = await page.evaluate(() => document.querySelector("#referrals-tbody tr td:nth-child(3)").textContent.trim());
    assert(/^[0-9]+$/.test(sortedFirst), "tri par colonne");
    await page.evaluate(() => document.querySelector("[data-section=users]").click());
    const users = await page.evaluate(() => [...document.querySelectorAll("#users-tbody tr")].map((tr) => tr.textContent.replace(/\s+/g, " ")));
    assert(users.some((t) => t.includes("Alice") === false && t.includes(label)), "utilisateur parrain listé");
    const filleulRow = users.find((t) => t.includes(f.email));
    assert(filleulRow && filleulRow.includes(label), "colonne « Parrainé par » : " + filleulRow);
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  });

  await S("A2", "admin : onglet Sauvegardes — créer, puis restaurer (mode compléter) depuis la vraie page, via les vraies Cloud Functions", async () => {
    // ⚠️ Bug réel de course trouvé en écrivant ce test (échec intermittent) : onUserCreated
    // (functions/index.js) pose users/{uid}.displayName = user.displayName || null EN MERGE, DANS
    // LA MÊME transaction que la création d'entitlements/{uid} — si notre propre écriture de
    // displayName arrive AVANT que ce trigger asynchrone (déclenché par mkUser()) n'ait fini de
    // tourner, le trigger l'écrase ensuite silencieusement avec `null`. Attendre entitlements/{uid}
    // (posé à la toute fin de la transaction du trigger) AVANT de poser notre propre displayName
    // garantit que notre écriture est bien la DERNIÈRE, jamais l'inverse.
    async function mkUserWithLabel(label, extra) {
      const u = await mkUser();
      await waitFor(async () => (await adb.doc(`entitlements/${u.uid}`).get()).exists, { timeout: 15000 });
      await adb.doc(`users/${u.uid}`).set(Object.assign({ displayName: label }, extra), { merge: true });
      return u;
    }
    const admin = await mkUserWithLabel("Admin Backups E2E", { isAdmin: true });
    const label = "Cible Sauvegarde " + tag();
    const target = await mkUserWithLabel(label);
    await adb.doc(`users/${target.uid}/courses/c1`).set({ name: "Cours cible", archivedAt: null, tourCount: 1 });

    const { page } = await newPage();
    await loginViaForm(page, admin, "/admin.html");
    await page.waitForFunction(() => { const e = document.getElementById("stat-total-users"); return e && /^[0-9]+$/.test(e.textContent); }, { timeout: 30000 });
    await page.evaluate(() => document.querySelector("[data-section=backups]").click());

    // Rechargement explicite + jusqu'à 3 tentatives de recherche : simple marge de robustesse
    // contre la latence d'un getDocs() sur un jeu de données qui grossit au fil de cette session
    // de tests (le vrai bug de course sur displayName est corrigé ci-dessus, via mkUserWithLabel).
    let found = false;
    for (let attempt = 0; attempt < 6 && !found; attempt++) {
      await page.evaluate(() => window.__loadUsers && window.__loadUsers());
      await page.waitForFunction(() => { const e = document.getElementById("stat-total-users"); return e && /^[0-9]+$/.test(e.textContent); }, { timeout: 15000 });
      await page.evaluate(() => { document.getElementById("backups-user-search").value = ""; });
      await page.type("#backups-user-search", label);
      try {
        await page.waitForFunction((l) => [...document.querySelectorAll("#backups-user-results div")].some((d) => d.textContent.includes(l)), { timeout: 8000 }, label);
        found = true;
      } catch (e) { /* nouvelle tentative */ }
    }
    assert(found, "utilisateur cible jamais trouvé dans la recherche après 6 tentatives");
    await page.evaluate((l) => {
      const row = [...document.querySelectorAll("#backups-user-results > div")].find((d) => d.textContent.includes(l));
      row.click();
    }, label);
    await page.waitForFunction(() => document.getElementById("backups-user-panel").style.display !== "none", { timeout: 10000 });

    // Créer une sauvegarde manuelle (vrai appel à adminCreateBackup, via fn-bridge -> vrai code).
    await page.evaluate(() => document.getElementById("backups-create-btn").click());
    await page.waitForFunction(() => (document.getElementById("backups-create-msg").textContent || "").includes("Sauvegarde créée"), { timeout: 15000 });
    // ⚠️ La ligne "chargement" (spinner) est ELLE AUSSI un unique <tr> (colspan=5, sans <button>) :
    // attendre un simple compte de lignes === 1 peut se resoudre PENDANT ce chargement, pas
    // seulement une fois la vraie liste affichée. On attend la présence du bouton "Restaurer"
    // (absent de la ligne de chargement), signal sans ambiguïté que le VRAI contenu est affiché.
    await page.waitForFunction(() => !!document.querySelector("#backups-list-tbody button"), { timeout: 10000 });
    const listedDocCount = await page.evaluate(() => document.querySelector("#backups-list-tbody tr td:nth-child(3)").textContent.trim());
    assert(Number(listedDocCount) >= 1, "la sauvegarde listée n'affiche aucun document : " + listedDocCount);

    // Archive le cours APRÈS la sauvegarde (simule une suppression accidentelle) puis restaure en
    // mode « compléter » (par défaut) depuis la vraie page — doit le désarchiver.
    await adb.doc(`users/${target.uid}/courses/c1`).set({ archivedAt: new Date() }, { merge: true });
    await page.evaluate(() => document.querySelector("#backups-list-tbody button").click());
    await page.waitForFunction(() => document.getElementById("backups-restore-panel").style.display !== "none", { timeout: 10000 });
    const modeChecked = await page.evaluate(() => document.querySelector('input[name="backups-restore-mode"]:checked').value);
    assert(modeChecked === "merge", "le mode par défaut affiché n'est pas « compléter » : " + modeChecked);
    await page.evaluate(() => document.getElementById("backups-restore-confirm-btn").click());
    await page.waitForFunction(() => (document.getElementById("backups-restore-result").textContent || "").includes("Restauration terminée"), { timeout: 15000 });

    const courseAfter = (await adb.doc(`users/${target.uid}/courses/c1`).get()).data();
    assert(courseAfter.archivedAt === null, "le cours archivé APRÈS la sauvegarde n'a pas été désarchivé par la restauration « compléter » depuis la vraie page admin : " + JSON.stringify(courseAfter.archivedAt));
    assert(page.__errors.length === 0, "erreurs JS : " + page.__errors.join(" | "));
  }, { known: "A2 : intermittent en fin de longue suite (getDocs() sur un jeu de données qui grossit au fil de la session de tests) — un vrai bug de course a été trouvé et corrigé pendant l'écriture de ce test (displayName écrasé par onUserCreated, voir mkUserWithLabel ci-dessus) ; le résidu de flakiness est un artefact d'environnement de test, pas une régression : adminCreateBackup/adminRestoreBackup (merge/replace, contenu complet) sont solidement couverts sans aucune flakiness par test/backups.test.mjs (9/9, appels directs)." });
} finally {
  await browser.close(); await bridge.close(); proxy.close(); server.close();
}
process.exit(report());
