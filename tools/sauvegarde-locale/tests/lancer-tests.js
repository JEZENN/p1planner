#!/usr/bin/env node
'use strict';
/*
  Lance tous les tests de l'outil de sauvegarde, UNIQUEMENT sur émulateurs locaux (projets « demo-… ») :
    1. démarre les émulateurs Auth / Firestore / Storage sur des ports réservés à ce test
       (Firestore 8380, Auth 9398, Storage 9498, hub 4800, journal 4900, websocket Firestore 9550) ;
       si l'un de ces ports est déjà pris, le test s'arrête sans rien toucher ;
    2. exécute tests/test-emulateur.js ;
    3. exécute tests/test-mise-en-place.ps1 (fausses clés dans un dossier temporaire) ;
    4. arrête uniquement les processus lancés ici.
  Usage : node tests/lancer-tests.js
*/
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const DOSSIER = __dirname;
const PORTS = { firestore: 8380, auth: 9398, storage: 9498, hub: 4800, logging: 4900, websocket: 9550 };
const sonde = (port) => new Promise((res) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });

(async () => {
  for (const [nom, port] of Object.entries(PORTS)) if (await sonde(port)) { console.error('Port ' + port + ' (' + nom + ') déjà utilisé : arrêt sans rien lancer.'); process.exit(2); }
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-sauvegarde-test-'));
  console.log('Dossier de travail : ' + travail);
  const emu = spawn('firebase emulators:start --only auth,firestore,storage --config firebase.test.json --project demo-p1sauv', { cwd: DOSSIER, shell: true, stdio: ['ignore', fs.openSync(path.join(travail, 'emulateurs.log'), 'w'), fs.openSync(path.join(travail, 'emulateurs.err'), 'w')] });
  const arreter = () => { try { spawnSync('taskkill', ['/PID', String(emu.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} };
  process.on('SIGINT', () => { arreter(); process.exit(130); });
  let code = 1;
  try {
    for (let i = 0; i < 240; i++) {
      if (await sonde(PORTS.firestore) && await sonde(PORTS.auth) && await sonde(PORTS.storage)) break;
      if (i === 239) throw new Error('Émulateurs non démarrés (voir ' + path.join(travail, 'emulateurs.log') + ')');
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log('Émulateurs prêts.\n');
    const r1 = spawnSync(process.execPath, [path.join(DOSSIER, 'test-emulateur.js'), path.join(travail, 'essai'), '127.0.0.1:' + PORTS.firestore, '127.0.0.1:' + PORTS.auth, '127.0.0.1:' + PORTS.storage], { stdio: 'inherit' });
    console.log('\n=== Mise en place (fausses clés) ===');
    const r2 = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(DOSSIER, 'test-mise-en-place.ps1')], { stdio: 'inherit' });
    code = r1.status === 0 && r2.status === 0 ? 0 : 1;
    console.log('\n' + (code === 0 ? 'TOUS LES TESTS SONT VERTS' : 'ÉCHEC : sauvegarde/restauration = ' + r1.status + ', mise en place = ' + r2.status));
  } catch (e) { console.error(e && e.message || e); } finally {
    arreter();
    await new Promise((r) => setTimeout(r, 1500));
    for (const [nom, port] of Object.entries(PORTS)) if (await sonde(port)) console.error('Attention : le port ' + port + ' (' + nom + ') répond encore.');
    try { fs.rmSync(travail, { recursive: true, force: true }); } catch (e) {}
  }
  process.exit(code);
})();
