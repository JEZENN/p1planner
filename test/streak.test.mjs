/* Flammes et vies (2026-10-12) — tests du VRAI code de la page : le <script id="p1-streak-js"> de public/tableur.html est
   extrait et exécuté dans `vm`, avec un faux Firestore (transactions) et un stockage local PIÈGE qui lève une erreur au
   moindre accès (rien de ce système ne doit être gardé sur l'appareil).
   Lancer : npx mocha test/streak.test.mjs */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = process.env.PAGE_FILE || path.join(here, "..", "public", "tableur.html");
const html = fs.readFileSync(PAGE, "utf8");
const m = /<script id="p1-streak-js">([\s\S]*?)<\/script>/.exec(html);
if (!m) throw new Error("module p1-streak-js introuvable dans la page");
const SRC = m[1];

const trap = () => { throw new Error("ACCÈS AU STOCKAGE LOCAL INTERDIT"); };
function load(opts = {}) {
  const store = opts.store || {};
  const env = { offline: false, rejectOnce: false, calls: 0, writes: [], store };
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const window = {
    currentUser: { uid: "u1" }, _fsDb: {},
    _fsDoc: (db, ...p) => ({ path: p.join("/") }),
    _fsRunTransaction: async (db, fn) => {
      env.calls++;
      if (env.offline) throw new Error("client hors ligne");
      const staged = [];
      await fn({
        get: async (ref) => ({ exists: () => store[ref.path] !== undefined, data: () => clone(store[ref.path]) }),
        set: (ref, d) => staged.push([ref.path, clone(d)])
      });
      if (env.rejectOnce) { env.rejectOnce = false; throw new Error("permission-denied"); }
      staged.forEach(([p, d]) => { store[p] = d; env.writes.push(p); });
    },
    _fsUpdateDoc: async (ref, patch) => { store[ref.path] = Object.assign({}, store[ref.path], clone(patch)); env.writes.push(ref.path + "#upd"); }
  };
  const sandbox = { window, console, setInterval: () => 0, clearInterval: () => {}, setTimeout, clearTimeout, Date, Math, JSON, Object, Promise, Error };
  Object.defineProperty(sandbox, "localStorage", { get: trap });
  Object.defineProperty(sandbox, "sessionStorage", { get: trap });
  Object.defineProperty(sandbox, "indexedDB", { get: trap });
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  // Objets créés dans le contexte vm : prototypes d'un autre « realm » -> on renvoie des copies JSON pour deepStrictEqual.
  const raw = window.p1Streak, P = Object.assign({}, raw, { step: (a, b) => { const r = raw.step(a, b); return r && JSON.parse(JSON.stringify(r)); }, state: () => { const r = raw.state(); return r && JSON.parse(JSON.stringify(r)); } });
  return { P, window, env, store };
}
const S = (over = {}) => ({ last: "2026-10-12", count: 5, best: 6, lives: 5, week: "2026-10-12", used: null, gift: null, anim: null, ...over });
// 2026-10-12 est un lundi
const { P } = load();

describe("Flammes et vies — calcul pur", () => {
  it("lundi() : semaine du lundi, dont dimanche et changement d'année", () => {
    assert.equal(P.monday("2026-10-12"), "2026-10-12");   // lundi
    assert.equal(P.monday("2026-10-18"), "2026-10-12");   // dimanche
    assert.equal(P.monday("2026-10-14"), "2026-10-12");
    assert.equal(P.monday("2027-01-01"), "2026-12-28");
  });
  it("jamais compté (absent) : 1 flamme, 5 vies, semaine du jour", () => {
    assert.deepEqual(P.step(null, "2026-10-14"), { last: "2026-10-14", count: 1, best: 1, lives: 5, week: "2026-10-12", used: null, gift: null, anim: null });
    assert.deepEqual(P.step(undefined, "2026-10-14").count, 1);
  });
  it("hier : +1, vies inchangées", () => {
    const r = P.step(S({ last: "2026-10-13", count: 4, lives: 2, week: "2026-10-12" }), "2026-10-14");
    assert.equal(r.count, 5); assert.equal(r.lives, 2); assert.equal(r.used, null); assert.equal(r.gift, null);
  });
  it("UNE vie par ABSENCE, quelle que soit sa durée : 1 jour manqué (2 vies) -> reste 1 ; 2 jours (3 vies) -> reste 2 ; 10 jours (2 vies) -> reste 1 ; flammes +1 une seule fois", () => {
    const cases = [[1, 2, 1], [2, 3, 2], [10, 2, 1], [3, 5, 4], [30, 1, 0]];
    for (const [missed, lives, left] of cases) {
      const last = new Date(2026, 9, 14 - 1 - missed);   // jours manqués = écart - 1
      const lk = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
      const r = P.step(S({ last: lk, count: 7, best: 7, lives, week: "2026-10-12" }), "2026-10-14");
      assert.equal(r.count, 8, `${missed} jours manqués / ${lives} vies : +1 seulement (les jours manqués ne rapportent rien)`);
      assert.equal(r.lives, left, `${missed} jours manqués / ${lives} vies`);
      assert.deepEqual(r.used, { day: "2026-10-14", n: 1 });
    }
  });
  it("absence avec 0 vie : la série repart à 1, le record est gardé", () => {
    const r = P.step(S({ last: "2026-10-03", count: 12, best: 12, lives: 0, week: "2026-10-12" }), "2026-10-14");
    assert.equal(r.count, 1); assert.equal(r.best, 12); assert.equal(r.lives, 0); assert.equal(r.used, null);
  });
  it("nouvelle semaine : +1 vie, plafonné à 5 ; 8 semaines d'absence : +5 seulement (pas +8), puis UNE vie utilisée pour le trou", () => {
    const a = P.step(S({ last: "2026-10-18", count: 3, lives: 1, week: "2026-10-12" }), "2026-10-19");
    assert.equal(a.lives, 2); assert.equal(a.gift, "2026-10-19"); assert.equal(a.week, "2026-10-19"); assert.equal(a.count, 4);
    const b = P.step(S({ last: "2026-10-18", count: 3, lives: 5, week: "2026-10-12" }), "2026-10-19");
    assert.equal(b.lives, 5); assert.equal(b.gift, null, "pas de don au-delà de 5");
    const c = P.step(S({ last: "2026-10-12", count: 9, best: 9, lives: 0, week: "2026-10-12" }), "2026-12-07");   // 8 semaines
    assert.equal(c.gift, "2026-12-07"); assert.equal(c.lives, 4, "5 vies offertes (pas 8), une utilisée"); assert.equal(c.count, 10); assert.deepEqual(c.used, { day: "2026-12-07", n: 1 });
  });
  it("la vie offerte pendant l'absence compte AVANT de couvrir le trou : 0 vie + 1 jour manqué + nouvelle semaine => série sauvée", () => {
    const r = P.step(S({ last: "2026-10-17", count: 12, best: 12, lives: 0, week: "2026-10-12" }), "2026-10-19");   // samedi -> lundi : dimanche manqué
    assert.equal(r.count, 13); assert.equal(r.lives, 0); assert.deepEqual(r.used, { day: "2026-10-19", n: 1 }); assert.equal(r.gift, "2026-10-19");
  });
  it("déjà compté aujourd'hui, ou horloge d'un appareil en avance : null (rien à écrire, rien ne casse)", () => {
    assert.equal(P.step(S({ last: "2026-10-14" }), "2026-10-14"), null);
    assert.equal(P.step(S({ last: "2026-10-20" }), "2026-10-14"), null);
  });
  it("données abîmées : repart à 1 avec 5 vies ; record et anim du jour conservés ; vies hors bornes ramenées dans 0..3", () => {
    for (const bad of [{ last: "n'importe quoi" }, { last: 20261012 }, { count: 0 }, { count: "5" }, { last: "2026-02-31" }]) {
      const r = P.step(S({ ...bad, best: 8 }), "2026-10-14");
      assert.equal(r.count, 1); assert.equal(r.lives, 5); assert.equal(r.best, 8); assert.equal(r.used, null);
    }
    assert.equal(P.step({ last: "x", best: 4, anim: "2026-10-14" }, "2026-10-14").anim, "2026-10-14");
    assert.equal(P.step(S({ last: "2026-10-13", lives: 9 }), "2026-10-14").lives, 5);
    assert.equal(P.step(S({ last: "2026-10-12", lives: -2, week: "2026-10-12" }), "2026-10-14").lives, 0);   // 1 jour manqué avec 0 vie : série repart
    assert.equal(P.step(S({ last: "2026-10-12", lives: -2, week: "2026-10-12" }), "2026-10-14").count, 1);
    assert.equal(P.step(S({ last: "2026-10-13", lives: "beaucoup" }), "2026-10-14").lives, 5);
    assert.equal(P.step(S({ last: "2026-10-13", week: "bizarre" }), "2026-10-14").week, "2026-10-12", "semaine illisible : on repart de la semaine courante, sans don");
  });
  for (const tz of ["Europe/Paris", "America/New_York", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
    it(`changements d'heure et fuseaux (${tz}) : les écarts de jours restent exacts`, () => {
      const prev = process.env.TZ; process.env.TZ = tz;
      try {
        const { P: P2 } = load();
        assert.equal(P2.days("2026-03-28", "2026-03-30"), 2);   // printemps (Paris)
        assert.equal(P2.days("2026-10-24", "2026-10-26"), 2);   // automne (Paris)
        assert.equal(P2.days("2026-11-01", "2026-11-02"), 1);   // New York
        assert.equal(P2.monday("2026-03-29"), "2026-03-23");
        const r = P2.step(S({ last: "2026-03-28", count: 3, lives: 3, week: "2026-03-23" }), "2026-03-30");
        assert.equal(r.count, 4); assert.deepEqual(r.used, { day: "2026-03-30", n: 1 });
      } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
    });
  }
});

describe("Flammes et vies — synchro (faux Firestore)", () => {
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  it("nouveau compte : une transaction, état créé (1 flamme, 5 vies) ; un 2e appel le même jour n'écrit RIEN", async () => {
    const { P, env, store } = load();
    await P.sync();
    assert.equal(store["users/u1/streak/state"].count, 1); assert.equal(store["users/u1/streak/state"].lives, 5);
    assert.equal(env.writes.length, 1);
    await P.sync();
    assert.equal(env.writes.length, 1, "deuxième synchro du jour : aucune écriture");
  });
  it("deux appareils le même jour (même serveur) : +1 une seule fois, jamais +2", async () => {
    const store = { "users/u1/streak/state": S({ last: ago(1), count: 4, lives: 3, week: "2000-01-03" }) };
    const A = load({ store }), B = load({ store });
    await Promise.all([A.P.sync(), B.P.sync()]);
    await A.P.sync(); await B.P.sync();
    assert.equal(store["users/u1/streak/state"].count, 5);
  });
  it("jour manqué : une seule vie utilisée, même si deux appareils synchronisent", async () => {
    const store = { "users/u1/streak/state": S({ last: ago(2), count: 4, lives: 3, week: "2000-01-03" }) };
    const A = load({ store }), B = load({ store });
    await A.P.sync(); await B.P.sync();
    const st = store["users/u1/streak/state"];
    assert.equal(st.count, 5); assert.equal(st.used.n, 1);
    assert.equal(st.lives, 4, "5 vies (dont les vies offertes) moins UNE : " + JSON.stringify(st));
  });
  it("serveur illisible (hors ligne) : AUCUNE écriture, aucun calcul de mémoire ; un essai ultérieur réussit", async () => {
    const { P, env, store } = load();
    env.offline = true;
    await P.sync();
    assert.equal(env.writes.length, 0); assert.equal(Object.keys(store).length, 0); assert.equal(P.state(), undefined);
    env.offline = false;
    await P.sync();
    assert.equal(store["users/u1/streak/state"].count, 1);
  });
  it("écriture refusée puis réessai : la série n'est pas perdue et UNE SEULE vie est consommée", async () => {
    const store = { "users/u1/streak/state": S({ last: ago(2), count: 4, lives: 3, week: "2000-01-03" }) };
    const { P, env } = load({ store });
    env.rejectOnce = true;
    await P.sync();
    assert.equal(store["users/u1/streak/state"].count, 4, "refus : rien n'a changé côté serveur");
    await P.sync();
    const st = store["users/u1/streak/state"];
    assert.equal(st.count, 5); assert.equal(st.used.n, 1);
    assert.equal(st.lives, 4, "une seule vie consommée au total : " + JSON.stringify(st));
  });
  it("changement de compte : l'état de l'ancien compte disparaît, le nouveau est lu (et rien d'écrit chez l'ancien)", async () => {
    const store = { "users/u1/streak/state": S({ last: today(), count: 9, best: 9 }), "users/u2/streak/state": S({ last: today(), count: 2, best: 2 }) };
    const { P, window, env } = load({ store });
    await P.sync();
    assert.equal(P.state().count, 9);
    window.currentUser = { uid: "u2" };
    await P.sync();
    assert.equal(P.state().count, 2);
    assert.equal(env.writes.length, 0);
  });
  it("déconnexion : l'état en mémoire est remis à zéro", async () => {
    const { P } = load({ store: { "users/u1/streak/state": S({ last: today(), count: 9, best: 9 }) } });
    await P.sync(); assert.equal(P.state().count, 9);
    P.stop(); assert.equal(P.state(), undefined);
  });
  it("sans utilisateur connecté : aucun appel serveur", async () => {
    const { P, window, env } = load();
    window.currentUser = null; await P.sync();
    assert.equal(env.calls, 0);
  });
  it("RIEN n'est gardé sur l'appareil : aucune mention de localStorage / sessionStorage / indexedDB / cookie dans le code, et le stockage piège n'a jamais été touché", async () => {
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./.test(SRC), "mention de stockage local dans le module");
    const { P } = load({ store: { "users/u1/streak/state": S({ last: ago(1), count: 3, week: "2000-01-03" }) } });
    await P.sync();   // lèverait « ACCÈS AU STOCKAGE LOCAL INTERDIT » au moindre accès
    assert.equal(P.state().count, 4);
  });
});
