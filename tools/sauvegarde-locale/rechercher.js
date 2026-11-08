#!/usr/bin/env node
'use strict';
/*
  Cherche un texte dans les documents Firestore de la sauvegarde locale, SANS rien modifier (ni en ligne, ni dans la sauvegarde),
  et indique, pour chaque document trouvé, dans quelles sauvegardes il contient ce texte et laquelle est la dernière qui ne le contient pas
  (version à récupérer avec extraire.js). Les sauvegardes de l'application rangées dans la base (users/<uid>/backups/...) sont des documents
  comme les autres : elles apparaissent dans la recherche.

  Usage : node rechercher.js --texte <texte> [--chemin <préfixe>] [--toutes] [--max <n>] [--config <fichier>]
          sans --toutes : seulement la dernière sauvegarde complète de la destination configurée.
  Exemple : node rechercher.js --texte p1-skl --toutes
            (documents où un écran de chargement a été enregistré à la place d'une note)
  Le texte est cherché dans le contenu encodé du document : préférez un texte simple, sans guillemets ni retour à la ligne.
*/
const path = require('path');
const fs = require('fs');
const C = require('./lib/commun');

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

async function* documents(dir, prefixe) {
  const d = path.join(dir, 'firestore');
  for (const f of fs.readdirSync(d).sort()) for await (const l of C.lireNdjson(path.join(d, f))) if (!prefixe || l.p === prefixe || l.p.startsWith(prefixe.replace(/\/$/, '') + '/')) yield l;
}

async function main() {
  const texte = val('--texte');
  if (!texte) throw new Error('Précisez --texte <texte à chercher>.');
  const prefixe = val('--chemin');
  const max = Number(val('--max') || 200);
  const cfg = C.lireConfig(val('--config'));
  const tous = C.instantanesComplets(cfg.destination);
  if (!tous.length) throw new Error('Aucune sauvegarde complète dans ' + cfg.destination);
  const noms = args.includes('--toutes') ? tous : tous.slice(-1);

  const trouves = new Map();   /* chemin → { sauvegarde → true (contient) / false (présent sans le texte) } */
  const touches = new Set();
  for (const nom of noms) {
    let n = 0;
    for await (const l of documents(path.join(cfg.destination, nom), prefixe)) if (JSON.stringify(l.d).includes(texte)) { touches.add(l.p); n++; }
    console.log(nom + ' : ' + n + ' document(s) contiennent « ' + texte + ' »');
  }
  if (!touches.size) { console.log('\nAucun document concerné dans les sauvegardes examinées.'); return 0; }
  for (const nom of noms) {
    for await (const l of documents(path.join(cfg.destination, nom), prefixe)) if (touches.has(l.p)) {
      if (!trouves.has(l.p)) trouves.set(l.p, {});
      trouves.get(l.p)[nom] = JSON.stringify(l.d).includes(texte);
    }
  }
  console.log('\n' + touches.size + ' document(s) concerné(s)' + (touches.size > max ? ' (' + max + ' affichés)' : '') + ' :');
  let i = 0;
  for (const [p, etat] of [...trouves.entries()].sort()) {
    if (++i > max) break;
    const propres = noms.filter((n) => etat[n] === false);
    const abimes = noms.filter((n) => etat[n] === true);
    console.log('  ' + p);
    console.log('     contient le texte dans : ' + (abimes.join(', ') || '-'));
    console.log('     version sans le texte  : ' + (propres.length ? 'dernière = ' + propres[propres.length - 1] + '  →  node extraire.js ' + path.join(cfg.destination, propres[propres.length - 1]) + ' --chemin ' + p : 'aucune dans les sauvegardes examinées'));
  }
  return 0;
}
main().then((c) => process.exit(c), (e) => { console.error('ERREUR : ' + (e && e.message || e)); process.exit(1); });
