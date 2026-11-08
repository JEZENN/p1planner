#!/usr/bin/env node
'use strict';
/*
  Extrait d'une sauvegarde, en JSON lisible, toutes les données d'un utilisateur (ou d'un chemin) — sans rien
  écrire dans Firebase. Utile pour vérifier ce qu'un utilisateur avait à une date donnée, ou lui renvoyer ses données.

  Usage : node extraire.js [dossier-de-sauvegarde] --uid <UID> [--sortie <dossier>] [--avec-fichiers]
          node extraire.js [dossier-de-sauvegarde] --chemin <préfixe> [--sortie <dossier>]
          sans dossier : la dernière sauvegarde complète de la destination configurée.
*/
const fs = require('fs');
const path = require('path');
const C = require('./lib/commun');
const { localiserObjet } = require('./verifier');

async function main() {
  const args = process.argv.slice(2);
  const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const uid = val('--uid'), chemin = val('--chemin');
  if (!uid && !chemin) throw new Error('Précisez --uid <UID> ou --chemin <préfixe>.');
  let dir = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
  if (!dir) { const cfg = C.lireConfig(val('--config')); const der = C.instantanesComplets(cfg.destination).pop(); if (!der) throw new Error('Aucune sauvegarde complète.'); dir = path.join(cfg.destination, der); }
  const dest = path.dirname(dir);
  const choisi = (p, d) => (uid ? C.appartientAUtilisateur(uid, p, d) : (p === chemin || p.startsWith(chemin.replace(/\/$/, '') + '/')));
  const out = { sauvegarde: path.basename(dir), selection: uid ? { uid } : { chemin }, documents: {}, compte: null, fichiersStorage: [] };
  for (const f of fs.readdirSync(path.join(dir, 'firestore')).sort()) for await (const l of C.lireNdjson(path.join(dir, 'firestore', f))) if (choisi(l.p, l.d)) out.documents[l.p] = Object.assign({ _cree: l.c, _modifie: l.u }, C.lisible(l.d));
  const fa = path.join(dir, 'auth', 'utilisateurs.ndjson.gz');
  if (uid && fs.existsSync(fa)) for await (const u of C.lireNdjson(fa)) if (u.uid === uid) { delete u.passwordHash; delete u.passwordSalt; out.compte = u; }
  const fs0 = path.join(dir, 'stockage.ndjson.gz');
  const objets = [];
  if (fs.existsSync(fs0)) for await (const e of C.lireNdjson(fs0)) if (choisi(e.nom)) { objets.push(e); out.fichiersStorage.push({ nom: e.nom, octets: e.octets, type: e.type, cree: e.cree }); }
  const sortie = path.resolve(val('--sortie') || path.join(process.cwd(), 'extraction-' + (uid || chemin.replace(/[\\/:*?"<>|]/g, '_')) + '-' + path.basename(dir)));
  fs.mkdirSync(sortie, { recursive: true });
  fs.writeFileSync(path.join(sortie, 'donnees.json'), JSON.stringify(out, null, 2));
  if (args.includes('--avec-fichiers')) {
    const fIndex = path.join(dest, 'stockage', 'index.json');
    const index = fs.existsSync(fIndex) ? JSON.parse(fs.readFileSync(fIndex, 'utf8')) : {};
    for (const e of objets) { const loc = localiserObjet(dest, e, index)[0]; if (!loc) continue; const c = path.join(sortie, 'fichiers', C.cheminLocalObjet(e.nom)); fs.mkdirSync(path.dirname(c), { recursive: true }); fs.copyFileSync(loc, c); }
  }
  console.log(Object.keys(out.documents).length + ' documents, ' + (out.compte ? '1 compte, ' : '') + out.fichiersStorage.length + ' fichiers Storage → ' + sortie);
  return 0;
}
main().then((c) => process.exit(c), (e) => { console.error('ERREUR : ' + (e && e.message || e)); process.exit(1); });
