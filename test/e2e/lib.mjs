/* Outils E2E « vraie page » P1Planner : navigateur sans interface (Edge/Chrome)
   + émulateurs Auth/Firestore. Aucun identifiant TypixClin. L'état serveur est
   relu INDÉPENDAMMENT de la page (firebase-admin, règles contournées). */
// ⚠️ Ports décalés (2026-09-30, voir env-e2e.mjs) : évite toute collision avec les émulateurs
// TypixClin de Jean tournant en parallèle sur 8080/9099/8085/8086/8901.
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9198";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8280";
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import admin from "firebase-admin";

export const PROJECT = "p1planner-e2e";
export const BASE = process.env.E2E_BASE || "http://127.0.0.1:8991";
const PROXY_CTL = process.env.PROXY_CTL || "http://127.0.0.1:8186";
const CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

const app = admin.apps.find((a) => a.name === "e2e") || admin.initializeApp({ projectId: PROJECT }, "e2e");
export const adb = admin.firestore(app);
export const aauth = admin.auth(app);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error("Aucun navigateur trouvé (Edge/Chrome).");
  return puppeteer.launch({ executablePath, headless: "new", args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,900"] });
}

export async function proxyMode(mode, ms = 0) {
  const r = await fetch(`${PROXY_CTL}/mode/${mode}${mode === "slow" ? "?ms=" + ms : ""}`);
  return (await r.text()).trim();
}

let seq = 0;
/* Compte neuf : e-mail vérifié, essai actif, 1 matière, N cours. */
export async function mkUser({ courses = 1, restoredAt = null } = {}) {
  const tag = `${Date.now().toString(36)}${seq++}`;
  const email = `e2e-${tag}@test.fr`, password = "Test1234!";
  const user = await aauth.createUser({ email, password, emailVerified: true, displayName: "E2E " + tag });
  const uid = user.uid;
  const future = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 20 * 864e5));
  const past = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 2 * 864e5));
  await adb.doc(`users/${uid}`).set({ email, displayName: "E2E " + tag });
  await adb.doc(`entitlements/${uid}`).set({ status: "trial", trialStartedAt: past, trialEndsAt: future, writeAccessUntil: future, premiumUntil: null, planType: null });
  await adb.doc(`users/${uid}/subjects/s1`).set({ name: "MatiereE2E", color: "#7c6cf6", order: 10, archivedAt: null, createdAt: new Date() });
  for (let i = 1; i <= courses; i++) {
    const c = { subjectId: "s1", name: "Cours" + i, order: i * 10, courseNum: i, archivedAt: null, revisionMode: "libre", tourCount: 0, createdAt: new Date() };
    if (restoredAt) c.restoredAt = admin.firestore.Timestamp.fromDate(restoredAt);
    await adb.doc(`users/${uid}/courses/c${i}`).set(c);
  }
  return { uid, email, password };
}

/* Ouvre une page (contexte isolé), vérifie le garde-fou « rien vers la
   production », se connecte et attend que les cours soient chargés. */
export async function openPage(browser, user, { wait = true } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.__logs = []; page.__errors = [];
  page.on("console", (m) => page.__logs.push(m.text()));
  page.on("pageerror", (e) => page.__errors.push(String(e.message || e)));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE + "/tableur.html", { waitUntil: "load" });
  // Garde-fou : la page pointe l'émulateur, et un fetch vers la production est bloqué.
  const guard = await page.evaluate(async () => {
    let blocked = false;
    try { await fetch("https://firestore.googleapis.com/v1/projects/p1planner/databases/(default)/documents/x", { mode: "no-cors" }); } catch (e) { blocked = true; }
    return { emulator: localStorage.getItem("p1planner:useEmulator") === "1", blocked, project: (window.__db && window.__db.app && window.__db.app.options.projectId) || null };
  });
  if (!guard.emulator || !guard.blocked || guard.project !== PROJECT) throw new Error("GARDE-FOU E2E ÉCHEC : " + JSON.stringify(guard));
  await page.waitForFunction(() => window.__authApi && window.__auth, { timeout: 30000 });
  await page.evaluate(async (e, p) => { await window.__authApi.signInWithEmailAndPassword(window.__auth, e, p); }, user.email, user.password);
  if (wait) await page.waitForFunction(() => window._p1GetCoursesById && Object.keys(window._p1GetCoursesById()).length > 0 && window.firebaseDataLoaded !== false, { timeout: 30000 });
  await sleep(1500);
  return { page, ctx };
}

export const course = async (uid, id = "c1") => (await adb.doc(`users/${uid}/courses/${id}`).get()).data() || null;
export const doc = async (path) => { const s = await adb.doc(path).get(); return s.exists ? s.data() : null; };
export const tours = (c) => ((c && c.tourConfidences) || []).map((v) => (v == null ? null : v));

/* Valide un tour par le VRAI modal (openConfidenceModal -> confiance -> #btn-save-tour). */
export async function validateTour(page, courseId, tourIndex, conf = 3) {
  await page.evaluate((cid, ti, cf) => {
    const badge = document.querySelector(`.tour-badge[data-fc="${cid}"][data-tour="${ti}"]`);
    if (!badge) throw new Error("case de tour introuvable " + ti);
    badge.click();
    document.querySelector(`.confidence-btn[data-confidence="${cf}"]`).click();
    document.getElementById("btn-save-tour").click();
  }, courseId, tourIndex, conf);
}
export async function resetTour(page, courseId, tourIndex) {
  await page.evaluate((cid, ti) => {
    const badge = document.querySelector(`.tour-badge[data-fc="${cid}"][data-tour="${ti}"]`);
    badge.click();
    document.getElementById("btn-reset-tour").click();
  }, courseId, tourIndex);
}
export async function waitFor(fn, { timeout = 15000, every = 200 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = await fn(); if (v) return v; await sleep(every); }
  return false;
}

/* Mini-runner de scénarios (chaque scénario = un contexte navigateur). */
export const results = [];
export async function scenario(name, fn, { known = null } = {}) {
  const t0 = Date.now();
  await proxyMode("up").catch(() => {});   // chaque scénario repart d'un réseau sain
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`  ✔ ${name} (${Date.now() - t0} ms)`); }
  catch (e) {
    results.push({ name, ok: false, known, err: String(e.message || e), ms: Date.now() - t0 });
    console.log(`  ${known ? "≈ ÉCHEC CONNU" : "✘"} ${name} — ${String(e.message || e).slice(0, 300)}`);
  }
}
export function report() {
  const bad = results.filter((r) => !r.ok && !r.known);
  console.log(`\n${results.length} scénarios : ${results.filter((r) => r.ok).length} OK, ${bad.length} ÉCHEC, ${results.filter((r) => !r.ok && r.known).length} connus`);
  return bad.length === 0 ? 0 : 1;
}
export function assert(cond, msg) { if (!cond) throw new Error(msg); }
