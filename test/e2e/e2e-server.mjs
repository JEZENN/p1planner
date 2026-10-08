/* Serveur de test E2E — sert public/ en LECTURE SEULE et patche tableur.html
   EN MÉMOIRE (aucun fichier du site n'est modifié) :
     1. CSP connect-src limitée à localhost => le navigateur bloque tout
        trafic vers la production (fetch/XHR/WebSocket) ;
     2. projectId remplacé par celui de l'émulateur (et le garde-fou
        d'isolation P0 du fichier adapté pour ce seul projet de test) ;
     3. mode émulateur activé, port Firestore = FS_PORT (proxy instable) ;
     4. window.__auth / window.__authApi exposés pour piloter la connexion.
   Variables : PORT (8901), FS_PORT (8085), PAGE_FILE (public/tableur.html).
   Isolation : aucun identifiant TypixClin ici. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = process.env.PUBLIC_DIR ? path.resolve(process.env.PUBLIC_DIR) : path.resolve(__dirname, "..", "..", "public"); // PUBLIC_DIR : copie mutante pour les contrôles de sensibilité
// ⚠️ Ports décalés (2026-09-30, voir env-e2e.mjs) : évite toute collision avec TypixClin (8901/8085/
// 9099). Storage (9199) et Functions (5001, servi par fn-bridge.mjs, pas le vrai émulateur) restent
// à leur valeur d'origine — ni l'un ni l'autre ne figure dans la liste des ports TypixClin connus,
// et 9199 ne collisionne plus avec rien depuis qu'AUTH_PORT est passé à 9198.
const PORT = Number(process.env.PORT || 8991);
const FS_PORT = Number(process.env.FS_PORT || 8185);
const AUTH_PORT = Number(process.env.AUTH_PORT || 9198);
const PAGE_FILE = process.env.PAGE_FILE ? path.resolve(process.env.PAGE_FILE) : path.join(PUBLIC, "tableur.html");
export const E2E_PROJECT = "p1planner-e2e";

const CSP = `<meta http-equiv="Content-Security-Policy" content="connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*">`;
const PRE = `${CSP}<script>try{localStorage.setItem('p1planner:useEmulator','1')}catch(e){}window.__E2E=true;</script>`;

export function patchPage(html) {
  const must = (cond, msg) => { if (!cond) throw new Error("Patch E2E impossible : " + msg); };
  must(html.includes("<head>"), "<head> introuvable");
  html = html.replace("<head>", "<head>" + PRE);
  must(html.includes('projectId: "p1planner",'), "projectId");
  html = html.replace('projectId: "p1planner",', `projectId: "${E2E_PROJECT}",`);
  must(html.includes('firebaseConfig.projectId !== "p1planner"'), "garde-fou d'isolation");
  html = html.replace('firebaseConfig.projectId !== "p1planner"', `firebaseConfig.projectId !== "${E2E_PROJECT}"`);
  must(html.includes('connectFirestoreEmulator(db, "127.0.0.1", 8080)'), "connectFirestoreEmulator");
  html = html.replace('connectFirestoreEmulator(db, "127.0.0.1", 8080)', `connectFirestoreEmulator(db, "127.0.0.1", ${FS_PORT})`);
  must(html.includes('connectAuthEmulator(auth, "http://127.0.0.1:9099"'), "connectAuthEmulator");
  html = html.replace('connectAuthEmulator(auth, "http://127.0.0.1:9099"', `connectAuthEmulator(auth, "http://127.0.0.1:${AUTH_PORT}"`);
  // ⚠️ Ancre changée (2026-09-30, D7 — cache Firestore persistant) : "const db =
  // getFirestore(app);" n'existe plus telle quelle (remplacée par un initializeFirestore()
  // try/catch, voir DECISIONS.md). "const _storage = getStorage(app);" reste un point d'ancrage
  // stable juste après, quelle que soit la branche du try/catch empruntée.
  must(html.includes("const _storage = getStorage(app);"), "point d'ancrage post-Firestore (getStorage)");
  html = html.replace("const _storage = getStorage(app);",
    "window.__db = db; window.__auth = auth; " +
    "import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js').then(function(m){window.__authApi=m;});\n" +
    "const _storage = getStorage(app);");
  return html;
}

/* Autres pages (auth, comptepremium, admin) : même garde-fou (CSP localhost) + projet de test ; leurs
   propres crochets « p1planner:useEmulator » les branchent sur Auth 9099, Firestore 8080 et Functions 5001
   (le pont fn-bridge.mjs y parle le protocole des fonctions callable). */
export const OTHER_PAGES = ["auth.html", "comptepremium.html", "admin.html"];
export function patchOtherPage(html) {
  const must = (cond, msg) => { if (!cond) throw new Error("Patch E2E impossible : " + msg); };
  must(html.includes("<head>"), "<head> introuvable");
  html = html.replace("<head>", "<head>" + PRE);
  must(html.includes('projectId: "p1planner",'), "projectId");
  html = html.replace('projectId: "p1planner",', `projectId: "${E2E_PROJECT}",`);
  must(html.includes('firebaseConfig.projectId !== "p1planner"'), "garde-fou d'isolation");
  html = html.replace('firebaseConfig.projectId !== "p1planner"', `firebaseConfig.projectId !== "${E2E_PROJECT}"`);
  if (html.includes('connectAuthEmulator(auth, "http://127.0.0.1:9099"')) {
    html = html.replace('connectAuthEmulator(auth, "http://127.0.0.1:9099"', `connectAuthEmulator(auth, "http://127.0.0.1:${AUTH_PORT}"`);
  }
  if (html.includes('connectFirestoreEmulator(db, "127.0.0.1", 8080)')) {
    html = html.replace('connectFirestoreEmulator(db, "127.0.0.1", 8080)', `connectFirestoreEmulator(db, "127.0.0.1", ${FS_PORT})`);
  }
  return html;
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json", ".xml": "application/xml" };

export function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/" || p === "/tableur" || p === "/tableur.html") {
      try {
        const html = patchPage(fs.readFileSync(PAGE_FILE, "utf8"));
        res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
        return res.end(html);
      } catch (e) { res.writeHead(500); return res.end(String(e.message)); }
    }
    const bare = p.split("/").filter(Boolean).join("/");
    if (OTHER_PAGES.includes(bare)) {
      try {
        const html = patchOtherPage(fs.readFileSync(path.join(PUBLIC, bare), "utf8"));
        res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
        return res.end(html);
      } catch (e) { res.writeHead(500); return res.end(String(e.message)); }
    }
    const file = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ""));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("e2e-server.mjs")) {
  startServer().then(() => console.log(`E2E server http://127.0.0.1:${PORT} (Firestore via :${FS_PORT})`));
}
