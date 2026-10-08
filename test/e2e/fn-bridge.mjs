/* PONT « Cloud Functions » LOCAL pour les tests E2E des pages (2026-09-26).
   Sert le protocole des fonctions « callable » de Firebase (celui que parle
   httpsCallable) sur 127.0.0.1:5001 en exécutant le VRAI code de
   functions/index.js, dans ce processus, contre l'émulateur Firestore (Stripe
   simulé, voir test/lib/referral-harness.mjs). L'émulateur Functions est jugé
   peu fiable dans cet environnement (docs/QA.md) ; ce pont le remplace SANS
   remplacer la réponse des fonctions par des réponses écrites à la main : la
   page appelle réellement le code serveur.
   Fait comme le vrai runtime : lit Authorization: Bearer <idToken> -> request.auth
   {uid, token: claims} ; renvoie {result} ou {error:{message,status}} avec les
   codes HTTP de Firebase ; répond au CORS. Ne fait pas : vérifier la signature
   du jeton (l'émulateur Auth émet des jetons non signés) ni App Check.
   Leviers de test : setDelay(nom, ms) (latence), setFail(nom, true) (panne 503).
   Émulateurs uniquement : rien ne sort de la machine. */
import "./env-e2e.mjs";
import http from "node:http";
import { fns } from "../lib/referral-harness.mjs";

const STATUS = {
  "invalid-argument": [400, "INVALID_ARGUMENT"], "failed-precondition": [400, "FAILED_PRECONDITION"], "out-of-range": [400, "OUT_OF_RANGE"],
  "unauthenticated": [401, "UNAUTHENTICATED"], "permission-denied": [403, "PERMISSION_DENIED"], "not-found": [404, "NOT_FOUND"],
  "aborted": [409, "ABORTED"], "already-exists": [409, "ALREADY_EXISTS"], "resource-exhausted": [429, "RESOURCE_EXHAUSTED"],
  "cancelled": [499, "CANCELLED"], "data-loss": [500, "DATA_LOSS"], "unknown": [500, "UNKNOWN"], "internal": [500, "INTERNAL"],
  "unimplemented": [501, "UNIMPLEMENTED"], "unavailable": [503, "UNAVAILABLE"], "deadline-exceeded": [504, "DEADLINE_EXCEEDED"]
};

function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8")); } catch (e) { return null; }
}

export function startBridge(port = 5001) {
  const calls = [];
  const delays = {}, fails = {};
  const server = http.createServer((req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "authorization,content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "600", "Vary": "Origin"
    };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    const send = (status, obj) => { res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors)); res.end(JSON.stringify(obj)); };
    const m = /^\/([^/]+)\/([^/]+)\/([A-Za-z0-9_]+)$/.exec((req.url || "").split("?")[0]);
    if (req.method !== "POST" || !m) { send(404, { error: { message: "Fonction introuvable (pont E2E).", status: "NOT_FOUND" } }); return; }
    const name = m[3];
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", async () => {
      const entry = { fn: name, uid: null, data: null, http: 0, at: Date.now() };
      calls.push(entry);
      try {
        if (delays[name]) await new Promise((r) => setTimeout(r, delays[name]));
        if (fails[name]) { entry.http = 503; entry.error = "panne simulée"; send(503, { error: { message: "Service indisponible (panne simulée).", status: "UNAVAILABLE" } }); return; }
        const fn = fns[name];
        if (!fn || typeof fn.run !== "function") { entry.http = 404; entry.error = "introuvable"; send(404, { error: { message: "Function " + name + " introuvable.", status: "NOT_FOUND" } }); return; }
        let body = {}; try { body = JSON.parse(raw || "{}"); } catch (e) { /* corps vide */ }
        const data = body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : undefined;
        entry.data = data;
        let auth;
        const h = String(req.headers.authorization || "");
        if (/^Bearer /i.test(h)) {
          const claims = decodeJwt(h.replace(/^Bearer /i, ""));
          if (claims && (claims.user_id || claims.sub)) { auth = { uid: claims.user_id || claims.sub, token: claims }; entry.uid = auth.uid; }
        }
        const result = await fn.run({ data, auth, rawRequest: { headers: req.headers } });
        entry.http = 200; entry.result = result;
        send(200, { result: result === undefined ? null : result });
      } catch (e) {
        const code = (e && e.code) || "internal";
        const [status, label] = STATUS[code] || STATUS.internal;
        entry.http = status; entry.error = code + " : " + (e && e.message);
        if (!STATUS[code]) console.error("[pont] erreur non HttpsError dans " + name + " :", e);
        send(status, { error: { message: (e && e.message) || "Erreur interne.", status: label } });
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({
      calls,
      setDelay: (name, ms) => { delays[name] = ms; },
      setFail: (name, on) => { fails[name] = !!on; },
      reset: () => { calls.length = 0; for (const k of Object.keys(delays)) delete delays[k]; for (const k of Object.keys(fails)) delete fails[k]; },
      close: () => new Promise((r) => server.close(r))
    }));
  });
}
