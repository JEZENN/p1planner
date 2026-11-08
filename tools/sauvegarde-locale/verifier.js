#!/usr/bin/env node
'use strict';
/*
  Vérifie qu'une sauvegarde est intacte et complète : empreintes SHA-256 de chaque fichier, lecture intégrale des
  fichiers compressés, nombre de documents / comptes / fichiers conforme au manifeste, présence de chaque fichier
  Storage dans le miroir (taille, et empreinte MD5 avec --complet).

  Usage : node verifier.js [dossier-de-sauvegarde | --toutes] [--complet] [--config <fichier>]
          sans dossier : la dernière sauvegarde complète de la destination configurée.
*/
const fs = require('fs');
const path = require('path');
const C = require('./lib/commun');

function localiserObjet(dest, e, index) {
  const rel = C.cheminLocalObjet(e.nom);
  const base = path.join(dest, 'stockage');
  const cands = [];
  if (index[e.nom] && index[e.nom].generation === e.generation) cands.push(path.join(base, 'fichiers', rel));
  for (const sous of ['anciennes-versions', 'supprimes']) {
    const d = path.join(base, sous);
    if (fs.existsSync(d)) for (const n of fs.readdirSync(d).sort()) cands.push(path.join(d, n, rel));
  }
  if (!index[e.nom] || index[e.nom].generation !== e.generation) cands.push(path.join(base, 'fichiers', rel));
  return cands.filter((p) => fs.existsSync(p) && fs.statSync(p).size === e.octets);
}

async function verifier(dir, o = {}) {
  const erreurs = []; const err = (m) => erreurs.push(m);
  const journal = o.journal || console.log;
  const dest = o.dest || path.dirname(dir);
  let manif;
  try { manif = C.lireJson(path.join(dir, 'manifeste.json')); } catch (e) { return { ok: false, erreurs: ['manifeste illisible : ' + e.message] }; }
  if (manif.statut !== 'complet') err('statut du manifeste : ' + manif.statut);

  for (const [f, info] of Object.entries(manif.fichiers || {})) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) { err('fichier manquant : ' + f); continue; }
    if (fs.statSync(p).size !== info.octets) err('taille différente : ' + f);
    else if ((await C.sha256Fichier(p)) !== info.sha256) err('empreinte SHA-256 différente : ' + f);
  }

  const compter = async (f, col) => { let n = 0, mauvais = null; for await (const l of C.lireNdjson(f)) { n++; if (col && !mauvais && l.p.split('/')[0] !== col) mauvais = l.p; } return { n, mauvais }; };
  let docs = 0;
  for (const [col, info] of Object.entries((manif.firestore && manif.firestore.racines) || {})) {
    const f = path.join(dir, 'firestore', col + '.ndjson.gz');
    try {
      const { n, mauvais } = await compter(f, col); docs += n;
      if (n !== info.documents) err('Firestore ' + col + ' : ' + n + ' documents lus, ' + info.documents + ' attendus');
      if (mauvais) err('Firestore ' + col + ' : document hors collection ' + mauvais);
    } catch (e) { err('Firestore ' + col + ' illisible : ' + e.message); }
  }
  const fo = path.join(dir, 'firestore', '_orphelins.ndjson.gz');
  if (fs.existsSync(fo)) { try { docs += (await compter(fo)).n; } catch (e) { err('orphelins illisibles : ' + e.message); } }
  if (manif.firestore && docs !== manif.firestore.documents) err('Firestore : ' + docs + ' documents au total, ' + manif.firestore.documents + ' attendus');

  if (manif.auth && !manif.auth.ignore) {
    try { const { n } = await compter(path.join(dir, 'auth', 'utilisateurs.ndjson.gz')); if (n !== manif.auth.utilisateurs) err('Auth : ' + n + ' comptes lus, ' + manif.auth.utilisateurs + ' attendus'); } catch (e) { err('Auth illisible : ' + e.message); }
  }

  let objets = 0, manquants = 0, md5ko = 0;
  if (manif.stockage && !manif.stockage.ignore) {
    const fIndex = path.join(dest, 'stockage', 'index.json');
    const index = fs.existsSync(fIndex) ? JSON.parse(fs.readFileSync(fIndex, 'utf8')) : {};
    try {
      for await (const e of C.lireNdjson(path.join(dir, 'stockage.ndjson.gz'))) {
        objets++;
        const c = localiserObjet(dest, e, index);
        if (!c.length) { manquants++; if (manquants <= 20) err('fichier Storage absent du miroir : ' + e.nom); continue; }
        if (o.complet && e.md5) { let bon = false; for (const p of c) if ((await C.md5Fichier(p)) === e.md5) { bon = true; break; } if (!bon) { md5ko++; if (md5ko <= 20) err('fichier Storage altéré (MD5) : ' + e.nom); } }
      }
      if (objets !== manif.stockage.objets) err('Storage : ' + objets + ' fichiers listés, ' + manif.stockage.objets + ' attendus');
      if (manquants > 20) err('… ' + manquants + ' fichiers Storage absents au total');
    } catch (e) { err('liste Storage illisible : ' + e.message); }
  }
  const ok = erreurs.length === 0;
  journal((ok ? 'OK  ' : 'ÉCHEC  ') + path.basename(dir) + ' : ' + docs + ' documents, ' + (manif.auth && manif.auth.utilisateurs || 0) + ' comptes, ' + objets + ' fichiers Storage' + (o.complet ? ' (MD5 vérifiés)' : '') + (ok ? '' : '\n   - ' + erreurs.join('\n   - ')));
  return { ok, erreurs, docs, objets };
}

async function main() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config'); const cfgF = ci >= 0 ? args[ci + 1] : undefined;
  const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--config');
  let dirs;
  if (pos[0]) dirs = [path.resolve(pos[0])];
  else {
    const cfg = C.lireConfig(cfgF);
    const tous = C.instantanesComplets(cfg.destination);
    if (!tous.length) { console.log('Aucune sauvegarde complète dans ' + cfg.destination); return 1; }
    dirs = (args.includes('--toutes') ? tous : tous.slice(-1)).map((n) => path.join(cfg.destination, n));
  }
  let ok = true;
  for (const d of dirs) ok = (await verifier(d, { complet: args.includes('--complet') })).ok && ok;
  return ok ? 0 : 1;
}

if (require.main === module) main().then((c) => process.exit(c), (e) => { console.error(e && e.stack || e); process.exit(1); });
module.exports = { verifier, localiserObjet };
