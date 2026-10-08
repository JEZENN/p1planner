/* Proxy TCP « connexion instable » entre la page et l'émulateur Firestore.
   Écoute FS_PORT (8185 par défaut) -> cible TARGET_PORT (8280). Contrôle HTTP sur CTL_PORT
   (8186) : /mode/up | /mode/down | /mode/hang | /mode/slow?ms=N.
   Chaque changement de mode DÉTRUIT les connexions ouvertes.
     up   : transparent          down : refuse/ferme immédiatement
     hang : accepte, ne relaie rien   slow : retarde chaque paquet de N ms */
import net from "node:net";
import http from "node:http";

// ⚠️ Ports décalés (2026-09-30, voir env-e2e.mjs) : évite toute collision avec TypixClin (8085/8080/8086).
const LISTEN = Number(process.env.FS_PORT || 8185);
const TARGET = Number(process.env.TARGET_PORT || 8280);
const CTL = Number(process.env.CTL_PORT || 8186);
let mode = "up", slowMs = 0;
const conns = new Set();
const destroyAll = () => { for (const s of conns) { try { s.destroy(); } catch (e) {} } conns.clear(); };

export function startProxy() {
  const server = net.createServer((client) => {
    conns.add(client);
    client.on("close", () => { conns.delete(client); });
    client.on("error", () => {});
    if (mode === "down") { client.destroy(); return; }
    if (mode === "hang") return;
    const upstream = net.connect(TARGET, "127.0.0.1");
    conns.add(upstream);
    upstream.on("close", () => { conns.delete(upstream); setTimeout(() => client.destroy(), mode === "slow" ? slowMs + 80 : 0); });   // laisser partir les derniers paquets retardés
    upstream.on("error", () => client.destroy());
    const pipeSlow = (from, to) => from.on("data", (buf) => {
      if (mode === "slow" && slowMs > 0) setTimeout(() => { if (!to.destroyed) to.write(buf); }, slowMs);
      else to.write(buf);
    });
    pipeSlow(client, upstream); pipeSlow(upstream, client);
  });
  const ctl = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const m = u.pathname.replace("/mode/", "");
    if (["up", "down", "hang", "slow"].includes(m)) { mode = m; slowMs = Number(u.searchParams.get("ms") || 0); destroyAll(); res.end(`mode=${mode} ms=${slowMs}\n`); }
    else res.end(`mode=${mode} ms=${slowMs}\n`);
  });
  return Promise.all([
    new Promise((r) => server.listen(LISTEN, "127.0.0.1", r)),
    new Promise((r) => ctl.listen(CTL, "127.0.0.1", r))
  ]).then(() => ({ setMode: (m, ms = 0) => { mode = m; slowMs = ms; destroyAll(); }, close: () => { destroyAll(); server.close(); ctl.close(); } }));
}

if (process.argv[1]?.endsWith("flaky-proxy.mjs")) startProxy().then(() => console.log(`flaky-proxy :${LISTEN} -> :${TARGET}, contrôle :${CTL}`));
