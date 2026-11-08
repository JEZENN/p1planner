#!/usr/bin/env node
'use strict';
/*
  Assistant de restauration guidé (double-clic sur RESTAURER.cmd).
    1) restaurer les données d'un utilisateur (UID ou e-mail)
    2) tout restaurer (panne, données effacées en masse)
    3) voir ce que contenait un compte (extraction lisible, rien n'est modifié en ligne)
    4) annuler une restauration faite avec cet outil
  Toujours : analyse sans écriture d'abord, résumé, choix, confirmation tapée, puis écriture consignée et annulable.
  Production : clé d'écriture « cleRestauration » de config.json (par défaut %USERPROFILE%\.p1planner-sauvegarde\cle-restauration.json).
  Options de test : --config <fichier>, --emulateur <firestore> <auth> <stockage> --projet <id> --bucket <nom>.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const C = require('./lib/commun');
const R = require('./lib/restauration');

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ei = args.indexOf('--emulateur');
const EMU = ei >= 0 ? { firestore: args[ei + 1], auth: args[ei + 2], stockage: args[ei + 3] } : null;

/* ---- lecture clavier (fonctionne aussi avec une entrée redirigée) ---- */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
const file = []; const attente = []; let ferme = false;
rl.on('line', (l) => { if (attente.length) attente.shift()(l); else file.push(l); });
rl.on('close', () => { ferme = true; while (attente.length) attente.shift()(null); });
function demander(q) {
  process.stdout.write(q);
  if (file.length) { const l = file.shift(); if (!process.stdin.isTTY) process.stdout.write(l + '\n'); return Promise.resolve(l.trim()); }
  if (ferme) { process.stdout.write('\n'); return Promise.resolve(null); }
  return new Promise((res) => attente.push((l) => { if (l !== null && !process.stdin.isTTY) process.stdout.write(l + '\n'); res(l === null ? null : l.trim()); }));
}
async function choisir(q, options, defaut) {
  for (;;) {
    const r = await demander(q + (defaut ? ' [' + defaut + '] ' : ' '));
    if (r === null) throw new Arret();
    const v = r === '' && defaut ? defaut : r;
    if (options.includes(v)) return v;
    console.log('  Réponse non comprise. Tapez ' + options.join(', ') + '.');
  }
}
class Arret extends Error { constructor() { super('Abandon : rien n\'a été écrit.'); } }
const n = (x) => Number(x || 0).toLocaleString('fr-FR');
const dateLisible = (nom) => { const m = /^(\d{4})-(\d\d)-(\d\d)_(\d\d)h(\d\d)$/.exec(nom); if (!m) return nom; const d = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + m[4] + 'h' + m[5]; };
const titre = (t) => console.log('\n' + '─'.repeat(64) + '\n ' + t + '\n' + '─'.repeat(64));

/* ---- sauvegardes disponibles (destination puis copies, ex. disque externe) ---- */
function sauvegardes(cfg) {
  const vus = new Map();
  for (const d of [cfg.destination, ...cfg.copies]) {
    let liste = []; try { liste = C.instantanesComplets(d); } catch (e) {}
    for (const nom of liste) if (!vus.has(nom)) vus.set(nom, { nom, dir: path.join(d, nom), dest: d });
  }
  return [...vus.values()].sort((a, b) => (a.nom < b.nom ? 1 : -1));
}
async function choisirSauvegarde(cfg) {
  const liste = sauvegardes(cfg);
  if (!liste.length) throw new Error('Aucune sauvegarde complète trouvée dans ' + [cfg.destination, ...cfg.copies].join(' ni dans ') + '.');
  titre('Quelle sauvegarde utiliser ?');
  const max = Math.min(liste.length, 20);
  for (let i = 0; i < max; i++) {
    const s = liste[i]; let m = {}; try { m = C.lireJson(path.join(s.dir, 'manifeste.json')); } catch (e) {}
    console.log(String(i + 1).padStart(3) + ') ' + dateLisible(s.nom) + ' — ' + n(m.firestore && m.firestore.documents) + ' documents, ' + n(m.auth && m.auth.utilisateurs) + ' comptes' + (i === 0 ? '   ← la plus récente' : '') + (s.dest !== cfg.destination ? '   (' + s.dest + ')' : ''));
  }
  const c = await choisir('Numéro :', Array.from({ length: max }, (_, i) => String(i + 1)), '1');
  return liste[Number(c) - 1];
}

/* ---- connexion ---- */
function connecter(cfg) {
  if (EMU) {
    const c = { projet: val('--projet') || cfg.projet, bucket: val('--bucket') || cfg.bucket };
    return { fb: C.initFirebase(c, { emulateur: EMU }), cible: c, libelle: 'émulateur (projet ' + c.projet + ')', prod: false };
  }
  const cle = cfg.cleRestauration || path.join(C.DOSSIER_CLES, 'cle-restauration.json');
  if (!fs.existsSync(cle)) {
    throw new Error('Clé de restauration introuvable : ' + cle + '\n\n  Elle permet d\'écrire dans Firebase ; la clé de sauvegarde, elle, ne peut que lire.\n  Créez-la en suivant « Le jour où il faut restaurer » dans GUIDE.html, puis relancez.\n  En attendant, le menu 3 (« voir ce que contenait un compte ») fonctionne sans clé.');
  }
  return { fb: C.initFirebase(Object.assign({}, cfg, { cleDansOneDriveAutorisee: false }), { cle, role: 'restauration' }), cible: cfg, libelle: 'PRODUCTION (' + cfg.projet + ')', prod: true };
}

/* ---- recherche d'un utilisateur dans la sauvegarde ---- */
async function trouverUtilisateur(s, saisie) {
  const q = saisie.trim(); const ql = q.toLowerCase();
  const f = path.join(s.dir, 'auth', 'utilisateurs.ndjson.gz');
  if (fs.existsSync(f)) for await (const u of C.lireNdjson(f)) if (u.uid === q || (u.email && u.email.toLowerCase() === ql)) return { uid: u.uid, compte: u };
  if (q.includes('@')) return null;
  for (const fic of fs.readdirSync(path.join(s.dir, 'firestore'))) for await (const l of C.lireNdjson(path.join(s.dir, 'firestore', fic))) if (l.p.split('/').includes(q)) return { uid: q, compte: null };
  return null;
}

function resumer(r, mode) {
  const f = r.firestore;
  console.log('\n  Données (Firestore)');
  console.log('   • ' + n(f.absents).padStart(7) + ' élément(s) manquent en ligne            → seront remis');
  console.log('   • ' + n(f.differents).padStart(7) + ' élément(s) ont changé depuis la sauvegarde → au choix ci-dessous');
  console.log('   • ' + n(f.identiques).padStart(7) + ' élément(s) identiques                    → rien à faire');
  if (f.sensibles) console.log('   ⚠ ' + n(f.sensibles) + ' élément(s) concernent les droits Premium et la facturation (' + f.exemplesSensibles.join(', ') + (f.sensibles > f.exemplesSensibles.length ? ', …' : '') + ') : ils seront remis tels que dans la sauvegarde. Vérifiez ensuite dans Stripe que l\'abonnement correspond.');
  if (f.exemplesDiff.length) console.log('     Exemples d\'éléments changés : ' + f.exemplesDiff.slice(0, 5).join(', ') + (f.differents > 5 ? '…' : ''));
  if (r.stockage) console.log('\n  Images\n   • ' + n(r.stockage.absents).padStart(7) + ' manquant(s) en ligne → seront remis avec leur lien d\'origine' + (r.stockage.introuvables ? ' (' + r.stockage.introuvables + ' introuvable(s) dans la sauvegarde)' : '') + '\n   • ' + n(r.stockage.presents).padStart(7) + ' déjà présent(s)       → rien à faire');
  if (r.auth) {
    const a = r.auth;
    console.log('\n  Comptes de connexion');
    if (mode === 'utilisateur') console.log('   • ' + (a.presents ? 'le compte existe en ligne → rien à faire' : a.absents ? 'le compte n\'existe plus en ligne → il sera recréé avec le même identifiant' + (a.avecMotDePasse ? ' et son mot de passe' : ' (sans mot de passe : l\'utilisateur cliquera « Mot de passe oublié »)') : 'aucun compte dans la sauvegarde'));
    else console.log('   • ' + n(a.absents).padStart(7) + ' compte(s) disparu(s) → seront recréés (' + n(a.avecMotDePasse) + ' avec mot de passe, ' + n(a.sansMotDePasse) + ' via « Mot de passe oublié »)\n   • ' + n(a.presents).padStart(7) + ' compte(s) présents  → rien à faire');
    if (a.conflits.length) console.log('   ⚠ Adresse déjà utilisée par un autre compte, non recréé : ' + a.conflits.slice(0, 5).join(', '));
  }
}

async function restaurerGuide(cfg, mode) {
  const s = await choisirSauvegarde(cfg);
  let sel, libelle, attendu;
  if (mode === 'utilisateur') {
    let u = null;
    for (;;) {
      const q = await demander('\nUID de l\'utilisateur (ou son e-mail) : ');
      if (q === null || q === '') throw new Arret();
      u = await trouverUtilisateur(s, q);
      if (u) break;
      console.log('  Introuvable dans la sauvegarde du ' + dateLisible(s.nom) + '. Vérifiez l\'orthographe, ou choisissez une sauvegarde plus ancienne (relancez).');
    }
    console.log('  → ' + (u.compte ? (u.compte.email || '(sans e-mail)') + ', compte créé le ' + new Date(u.compte.metadata && u.compte.metadata.creationTime).toLocaleDateString('fr-FR') : 'aucun compte dans la sauvegarde, données trouvées') + ' — UID ' + u.uid);
    sel = R.selection({ uid: u.uid }); libelle = (u.compte && u.compte.email) || u.uid; attendu = 'RESTAURER';
  } else { sel = R.selection({ tout: true }); libelle = 'tout'; attendu = 'TOUT RESTAURER'; }

  const cx = connecter(cfg);
  const ctx = { dir: s.dir, dest: s.dest, fb: cx.fb, cfg: cx.cible, sel };
  titre('Analyse : sauvegarde du ' + dateLisible(s.nom) + ' comparée à ' + cx.libelle);
  console.log('  Lecture seule, rien n\'est modifié. ' + (mode === 'tout' ? 'Cela peut prendre plusieurs minutes.' : 'Quelques secondes.'));
  const apercu = await R.restaurer(ctx, { appliquer: false });
  resumer(apercu, mode);
  const manque = apercu.firestore.absents + (apercu.stockage ? apercu.stockage.absents - apercu.stockage.introuvables : 0) + (apercu.auth ? apercu.auth.absents : 0);
  const diff = apercu.firestore.differents;
  if (!manque && !diff) { console.log('\n✔ Rien ne manque et rien n\'a changé : tout est déjà comme dans cette sauvegarde.'); return; }

  titre('Que faire ?');
  const opts = ['0'];
  if (manque) { console.log('  1) Remettre seulement ce qui manque (recommandé : rien de ce qui existe n\'est touché)'); opts.push('1'); }
  if (diff) { console.log('  2) Remettre ce qui manque ET l\'ancienne version des ' + n(diff) + ' élément(s) changé(s)\n     (seulement si la version en ligne est abîmée : les modifications faites depuis le ' + dateLisible(s.nom).replace(/ à .*/, '') + ' seront perdues)'); opts.push('2'); }
  console.log('  0) Ne rien faire');
  const c = await choisir('Votre choix :', opts, manque ? '1' : '0');
  if (c === '0') throw new Arret();
  const ecraser = c === '2';

  console.log('\n  Une copie de l\'état actuel des éléments touchés est gardée : vous pourrez revenir en arrière (menu 4).');
  if (cx.prod && !process.stdin.isTTY) throw new Error('Confirmation impossible sans clavier : abandon.');
  const r0 = await demander('  Écriture sur ' + cx.libelle + '. Tapez ' + attendu + ' pour lancer : ');
  if (r0 === null || r0.toUpperCase() !== attendu) throw new Arret();

  titre('Restauration en cours…');
  const r = await R.restaurer(ctx, { appliquer: true, ecraser, info: { cible: (mode === 'tout' ? 'tout' : libelle) + (cx.prod ? '' : '-emulateur'), libelle, outil: 'assistant' } });
  const f = r.firestore;
  const lignes = [
    'Restauration du ' + new Date().toLocaleString('fr-FR') + ' — ' + (mode === 'tout' ? 'toute la base' : 'utilisateur ' + libelle),
    'Sauvegarde utilisée : ' + dateLisible(s.nom) + ' — cible : ' + cx.libelle,
    'Données : ' + n(f.ecrits) + ' élément(s) remis' + (ecraser ? ' (dont anciennes versions)' : '') + (f.apparusEntreTemps ? ', ' + f.apparusEntreTemps + ' recréé(s) entre-temps par l\'utilisateur (laissés)' : ''),
  ];
  if (r.stockage) lignes.push('Images : ' + n(r.stockage.remis) + ' remis');
  if (r.auth) lignes.push('Comptes : ' + n(r.auth.recrees) + ' recréé(s)' + (r.auth.recrees && r.auth.sansMotDePasse ? ' — ' + (r.auth.avecMotDePasse ? r.auth.sansMotDePasse + ' sans mot de passe : ' : '') + 'mot de passe à refaire via « Mot de passe oublié »' : '') + (r.auth.refuses.length ? ' — refusés : ' + r.auth.refuses.join(' | ') : ''));
  if (r.dossierOperation) { lignes.push('Détail et annulation possible : ' + r.dossierOperation); fs.writeFileSync(path.join(r.dossierOperation, 'RAPPORT.txt'), lignes.join('\r\n') + '\r\n'); }
  console.log('\n✔ Terminé.\n  ' + lignes.slice(2).join('\n  '));
  if (mode === 'utilisateur') console.log('\n  L\'utilisateur doit recharger la page (ou se reconnecter) pour voir ses données.');
}

async function extraireGuide(cfg) {
  const s = await choisirSauvegarde(cfg);
  const q = await demander('\nUID de l\'utilisateur (ou son e-mail) : ');
  if (!q) throw new Arret();
  const u = await trouverUtilisateur(s, q);
  if (!u) { console.log('  Introuvable dans cette sauvegarde.'); return; }
  const nom = 'P1Planner - ' + ((u.compte && u.compte.email) || u.uid).replace(/[\\/:*?"<>|]/g, '_') + ' - ' + s.nom;
  const sortie = path.join(val('--sortie-extraction') || C.bureau(), nom);
  const r = spawnSync(process.execPath, [path.join(__dirname, 'extraire.js'), s.dir, '--uid', u.uid, '--sortie', sortie, '--avec-fichiers'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim());
  console.log('\n✔ ' + r.stdout.trim() + '\n  Ouvrez « donnees.json » (texte lisible) et le dossier « fichiers » (images, PDF). Rien n\'a été modifié en ligne.');
}

async function annulerGuide(cfg) {
  const ops = [];
  for (const d of [cfg.destination, ...cfg.copies]) for (const o of R.listerOperations(d)) if (!ops.some((x) => path.basename(x.dossier) === path.basename(o.dossier))) ops.push(o);
  ops.sort((a, b) => (a.debut < b.debut ? 1 : -1));
  if (!ops.length) { console.log('\nAucune restauration enregistrée.'); return; }
  titre('Quelle restauration annuler ?');
  const max = Math.min(ops.length, 15);
  for (let i = 0; i < max; i++) { const o = ops[i]; console.log(String(i + 1).padStart(3) + ') ' + new Date(o.debut).toLocaleString('fr-FR') + ' — ' + (o.libelle || o.selection) + ' — ' + o.statut + (o.resultat ? ' (' + n(o.resultat.documents) + ' éléments, ' + n(o.resultat.fichiers) + ' fichiers)' : '')); }
  const c = await choisir('Numéro (0 pour quitter) :', ['0', ...Array.from({ length: max }, (_, i) => String(i + 1))], '0');
  if (c === '0') throw new Arret();
  const o = ops[Number(c) - 1];
  if (o.statut === 'annulée') { console.log('  Déjà annulée le ' + new Date(o.annulee).toLocaleString('fr-FR') + '.'); return; }
  const cx = connecter(cfg);
  if (o.projet && cx.prod && o.projet !== cx.cible.projet) throw new Error('Cette restauration visait le projet ' + o.projet + '.');
  const a = await R.annuler(o.dossier, cx.fb, cx.cible, { appliquer: false });
  console.log('\n  ' + n(a.aAnnuler) + ' élément(s) seront remis comme avant la restauration, ' + n(a.dejaRevenus) + ' le sont déjà.');
  if (a.modifiesDepuis.length) console.log('  ' + n(a.modifiesDepuis.length) + ' élément(s) modifié(s) depuis par l\'utilisateur : laissés tels quels (' + a.modifiesDepuis.slice(0, 5).join(', ') + (a.modifiesDepuis.length > 5 ? '…' : '') + ')');
  if (a.fichiers) console.log('  Fichiers remis lors de la restauration : ' + n(a.fichiers) + ' — ils seront retirés s\'ils n\'ont pas changé.');
  if (a.comptes.length) console.log('  Comptes recréés (' + a.comptes.length + ') : laissés en place (' + a.comptes.slice(0, 5).join(', ') + ').');
  if (!a.aAnnuler && !a.fichiers) { console.log('\n  Rien à annuler.'); return; }
  if (cx.prod && !process.stdin.isTTY) throw new Error('Confirmation impossible sans clavier : abandon.');
  const r0 = await demander('  Tapez ANNULER pour revenir en arrière : ');
  if (r0 === null || r0.toUpperCase() !== 'ANNULER') throw new Arret();
  const b = await R.annuler(o.dossier, cx.fb, cx.cible, { appliquer: true });
  console.log('\n✔ Annulée : ' + n(b.annules) + ' élément(s) remis comme avant, ' + n(b.fichiersRetires) + ' fichier(s) retiré(s).');
}

async function main() {
  const cfg = C.lireConfig(val('--config'));
  titre('Restauration P1Planner' + (EMU ? ' — MODE TEST (émulateur)' : ''));
  console.log('  1) Restaurer les données d\'un utilisateur (il a perdu des notes, des cours, des flashcards, son planning…)');
  console.log('  2) Tout restaurer (panne, données effacées en masse)');
  console.log('  3) Voir ce que contenait un compte (copie lisible sur le Bureau, rien n\'est modifié en ligne)');
  console.log('  4) Annuler une restauration faite avec cet outil');
  console.log('  0) Quitter');
  const c = await choisir('Votre choix :', ['0', '1', '2', '3', '4']);
  if (c === '1') await restaurerGuide(cfg, 'utilisateur');
  else if (c === '2') await restaurerGuide(cfg, 'tout');
  else if (c === '3') await extraireGuide(cfg);
  else if (c === '4') await annulerGuide(cfg);
  return 0;
}

main().then((c) => { rl.close(); process.exit(c); }, (e) => {
  rl.close();
  if (e instanceof Arret) { console.log('\n' + e.message); process.exit(0); }
  console.error('\nERREUR : ' + (e && e.message || e) + (e && e.dossierOperation ? '\nCe qui a déjà été écrit est consigné dans ' + e.dossierOperation + ' (menu 4 pour annuler).' : ''));
  process.exit(1);
});
