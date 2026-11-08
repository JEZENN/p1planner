#!/usr/bin/env node
'use strict';
/*
  Restauration en ligne de commande. Pour un usage courant, préférez RESTAURER.cmd (menu guidé).
  PAR DÉFAUT RIEN N'EST ÉCRIT : l'outil affiche ce qu'il ferait. Il faut ajouter --appliquer pour écrire.

  1) Vers un émulateur (consulter une sauvegarde ou tester une restauration, sans risque) :
     node restaurer.js <dossier> --emulateur 127.0.0.1:8080 127.0.0.1:9099 127.0.0.1:9199 --projet demo-test --appliquer

  2) Vers la PRODUCTION — clé AVEC droits d'écriture (différente de la clé de sauvegarde) et confirmation tapée :
     node restaurer.js <dossier> --production --cle-ecriture <fichier.json> --uid <UID>             (aperçu)
     node restaurer.js <dossier> --production --cle-ecriture <fichier.json> --uid <UID> --appliquer
     Sélection : --uid <UID> (tout document dont le chemin contient cet identifiant : users/UID/**, entitlements/UID…, plus les codes de parrainage et retours qui lui appartiennent)
                 --chemin <préfixe> (répétable), ou --tout.
     Par défaut seuls les éléments ABSENTS sont recréés. --ecraser remplace aussi les documents différents.
     --images : remet aussi les fichiers Storage absents (en production ; toujours fait vers un émulateur sauf --sans-images).
     Comptes : les comptes absents sont recréés (même UID) ; --sans-auth pour ne pas y toucher.
     Chaque restauration appliquée est consignée dans <destination>/restaurations/ et peut être annulée (RESTAURER.cmd, menu 4).
*/
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const C = require('./lib/commun');
const R = require('./lib/restauration');

const args = process.argv.slice(2);
const opt = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const vals = (n) => args.map((a, i) => (a === n ? args[i + 1] : null)).filter(Boolean);

async function demander(q) { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); const r = await new Promise((res) => rl.question(q, res)); rl.close(); return r.trim(); }

async function main() {
  const dir = path.resolve(args[0] || '');
  if (!args[0] || !fs.existsSync(path.join(dir, 'manifeste.json'))) throw new Error('Indiquez le dossier d\'une sauvegarde complète en premier argument.');
  const manif = C.lireJson(path.join(dir, 'manifeste.json'));
  if (manif.statut !== 'complet') throw new Error('Sauvegarde incomplète : ' + dir);
  const dest = path.dirname(dir);
  const appliquer = opt('--appliquer'), ecraser = opt('--ecraser');
  const ei = args.indexOf('--emulateur');
  const prod = opt('--production');
  if (prod === (ei >= 0)) throw new Error('Choisissez une cible : --emulateur <firestore> <auth> <stockage> ou --production.');

  const uid = val('--uid'); const chemins = vals('--chemin'); const tout = opt('--tout');
  if (prod && !uid && !chemins.length && !tout) throw new Error('En production, précisez --uid, --chemin ou --tout.');
  const sel = R.selection({ uid, chemins, tout });

  let cfg, fb;
  if (prod) {
    const cle = val('--cle-ecriture');
    if (!cle) throw new Error('En production, --cle-ecriture <fichier> est obligatoire (la clé de sauvegarde est en lecture seule, c\'est voulu).');
    cfg = C.lireConfig(val('--config'));
    if (manif.projet !== cfg.projet) throw new Error('La sauvegarde vient du projet ' + manif.projet + ', la configuration vise ' + cfg.projet + '.');
    cfg = Object.assign({}, cfg, { cleDansOneDriveAutorisee: false });
    fb = C.initFirebase(cfg, { cle, role: 'restauration' });
  } else {
    cfg = { projet: val('--projet') || manif.projet, bucket: val('--bucket') };
    try { const c0 = C.lireConfig(val('--config')); if (!cfg.bucket) cfg.bucket = c0.bucket; } catch (e) {}
    if (!cfg.bucket) cfg.bucket = cfg.projet + '.firebasestorage.app';
    fb = C.initFirebase(cfg, { emulateur: { firestore: args[ei + 1], auth: args[ei + 2], stockage: args[ei + 3] } });
  }
  const cible = prod ? 'PRODUCTION ' + cfg.projet : 'émulateur ' + args[ei + 1] + ' (projet ' + cfg.projet + ')';
  console.log('Sauvegarde : ' + path.basename(dir) + ' (projet ' + manif.projet + ')\nCible      : ' + cible + '\nSélection  : ' + sel.libelle + '\nMode       : ' + (appliquer ? 'ÉCRITURE' : 'aperçu (rien n\'est écrit)') + (ecraser ? ', documents différents remplacés' : ', documents existants conservés'));

  const avantEcriture = prod ? async () => {
    if (!process.stdin.isTTY) throw new Error('Confirmation impossible (pas de clavier) : abandon.');
    const attendu = 'RESTAURER ' + (uid || (tout ? 'TOUT' : chemins[0]));
    const r = await demander('\n⚠ Écriture en PRODUCTION sur ' + cfg.projet + '. Tapez exactement « ' + attendu + ' » pour continuer : ');
    if (r !== attendu) throw new Error('Confirmation refusée : rien n\'a été écrit.');
  } : null;
  const avecImages = prod ? opt('--images') : !opt('--sans-images');
  const avecAuth = !opt('--sans-auth') && manif.auth && !manif.auth.ignore;
  const ctx = { dir, dest, fb, cfg, sel };
  const r = await R.restaurer(ctx, { appliquer, ecraser, auth: avecAuth, images: avecImages && manif.stockage && !manif.stockage.ignore, avantEcriture, info: { cible: prod ? cfg.projet : 'emulateur-' + cfg.projet, outil: 'restaurer.js' } });

  const s = r.firestore;
  console.log('\nFirestore : ' + s.selection + ' documents sélectionnés — ' + s.absents + ' absents de la cible, ' + s.identiques + ' identiques, ' + s.differents + ' différents' + (appliquer ? ' → ' + s.ecrits + ' écrits' + (s.apparusEntreTemps ? ' (' + s.apparusEntreTemps + ' apparus entre-temps, laissés)' : '') : ' → ' + (s.absents + (ecraser ? s.differents : 0)) + ' seraient écrits'));
  if (s.sensibles) console.log('Droits Premium et facturation (entitlements, billingPrivate) : ' + s.sensibles + ' document(s) ' + (appliquer ? 'remis' : 'seraient remis') + ' d\'après la sauvegarde (' + s.exemplesSensibles.join(', ') + (s.sensibles > s.exemplesSensibles.length ? ', …' : '') + '). Vérifiez dans Stripe que l\'abonnement correspond.');
  if (s.exemplesDiff.length) console.log('  Documents différents dans la cible' + (ecraser ? ' (remplacés)' : ' (conservés, ajoutez --ecraser pour les remplacer)') + ' :\n   ' + s.exemplesDiff.join('\n   ') + (s.differents > s.exemplesDiff.length ? '\n   …' : ''));
  if (r.auth) {
    const a = r.auth;
    console.log('Comptes : ' + a.selection + ' dans la sauvegarde — ' + a.presents + ' présents, ' + a.absents + ' absents' + (appliquer ? ' → ' + a.recrees + ' recréés' : ' → seraient recréés') + (a.absents ? ' (' + a.avecMotDePasse + ' avec mot de passe, ' + a.sansMotDePasse + ' sans)' : '') + (a.conflits.length ? '\n  E-mail déjà pris par un autre compte (non recréé) : ' + a.conflits.join(', ') : '') + (a.refuses.length ? '\n  Refusés : ' + a.refuses.slice(0, 5).join(' | ') : ''));
  }
  if (r.stockage) { const t = r.stockage; console.log('Storage : ' + t.selection + ' fichiers sélectionnés — ' + t.presents + ' déjà présents (laissés tels quels), ' + t.absents + ' absents' + (t.introuvables ? ' dont ' + t.introuvables + ' introuvables dans le miroir' : '') + (appliquer ? ' → ' + t.remis + ' remis en ligne' : '')); }
  if (r.dossierOperation) console.log('\nOpération consignée (annulable) : ' + r.dossierOperation);
  if (!appliquer) console.log('\nAperçu seulement. Ajoutez --appliquer pour écrire.');
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error('ERREUR : ' + (e && e.message || e)); process.exit(1); });
