#!/usr/bin/env node
'use strict';
/*
  Sauvegarde complète d'un projet Firebase vers un disque local — LECTURE SEULE côté Firebase.

  Contenu d'une sauvegarde (dossier AAAA-MM-JJ_HHhMM) :
    firestore/<collection>.ndjson.gz   tous les documents de la collection et de TOUTES ses sous-collections,
                                       découvertes automatiquement (aucune liste à tenir à jour)
    firestore/_orphelins.ndjson.gz     documents rangés sous un parent inexistant (s'il y en a)
    auth/utilisateurs.ndjson.gz        comptes Authentication (e-mail, fournisseurs, dates, droits personnalisés…)
    regles/                            règles de sécurité Firestore et Storage en vigueur (si la clé le permet)
    stockage.ndjson.gz                 liste des fichiers Storage à cette date (taille, empreinte, métadonnées)
    manifeste.json                     comptes, tailles, empreintes SHA-256, durée, statut « complet »
  Fichiers Storage (images, PDF) : miroir incrémental partagé dans <destination>/stockage/ — seuls les fichiers
  nouveaux ou modifiés sont téléchargés ; un fichier supprimé ou remplacé en ligne est déplacé (jamais effacé)
  dans stockage/supprimes/ ou stockage/anciennes-versions/ tant qu'une sauvegarde conservée y fait référence.

  Usage :
    node sauvegarder.js                    sauvegarde complète
    node sauvegarder.js --si-en-retard     seulement si la dernière sauvegarde complète date de plus de « seuilRetardHeures »
                                           (20 h par défaut : une sauvegarde par jour)
    node sauvegarder.js --estimer          estimation rapide du volume (rien n'est écrit sur le disque)
    options : --config <fichier>  --sans-images  --emulateur <firestore> <auth> <stockage>
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');
const C = require('./lib/commun');

const args = process.argv.slice(2);
const opt = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const NOM_ALERTE = 'SAUVEGARDE P1PLANNER EN ECHEC.txt';
function ecrireAlerte(dossier, message, fichierJournal) {
  try { fs.writeFileSync(path.join(dossier || C.bureau(), NOM_ALERTE), 'La sauvegarde P1Planner du ' + new Date().toLocaleString('fr-FR') + ' a échoué.\r\n\r\nErreur : ' + message + '\r\n\r\n' + (fichierJournal ? 'Journal : ' + fichierJournal + '\r\n\r\n' : '') + 'Les sauvegardes précédentes sont intactes. Ce fichier disparaît à la prochaine sauvegarde réussie.\r\n'); } catch (x) {}
}

async function main() {
  let cfg;
  try { cfg = C.lireConfig(val('--config')); } catch (e) { ecrireAlerte(null, e.message); throw e; }
  const ei = args.indexOf('--emulateur');
  const emulateur = ei >= 0 ? { firestore: args[ei + 1], auth: args[ei + 2], stockage: args[ei + 3] } : (cfg.emulateur || null);
  if (opt('--estimer')) return estimer(cfg, emulateur);

  const dest = cfg.destination;
  try { C.preparerDossierSauvegarde(dest, cfg.projet); } catch (e) { ecrireAlerte(cfg.alerteDossier, e.message); throw e; }
  const nom = process.env.SAUVEGARDE_NOM_TEST && C.NOM_INSTANTANE.test(process.env.SAUVEGARDE_NOM_TEST) ? process.env.SAUVEGARDE_NOM_TEST : C.horodatage();
  const journal = C.creerJournal(path.join(dest, 'journaux', nom + '.log'));
  const alerte = path.join(cfg.alerteDossier || C.bureau(), NOM_ALERTE);

  if (opt('--si-en-retard')) {
    const der = C.instantanesComplets(dest).pop();
    if (der) {
      const m = C.lireJson(path.join(dest, der, 'manifeste.json'));
      const ageH = (Date.now() - Date.parse(m.debut)) / 36e5;
      if (ageH < cfg.seuilRetardHeures) { console.log('Dernière sauvegarde complète il y a ' + (ageH < 48 ? ageH.toFixed(1) + ' h' : (ageH / 24).toFixed(1) + ' jour(s)') + ' (seuil ' + cfg.seuilRetardHeures + ' h) : rien à faire.'); try { fs.unlinkSync(journal.fichier); } catch (e) {} return 0; }
    }
  }

  const verrou = path.join(dest, 'verrou.json');
  if (fs.existsSync(verrou)) {
    const v = JSON.parse(fs.readFileSync(verrou, 'utf8') || '{}');
    let vivant = false; try { process.kill(v.pid, 0); vivant = true; } catch (e) {}
    if (vivant && Date.now() - Date.parse(v.debut) < 12 * 3600e3) { journal('Une sauvegarde est déjà en cours (processus ' + v.pid + ') : abandon.'); return 0; }
    journal('Verrou périmé retiré (processus ' + v.pid + ' disparu).');
  }
  fs.writeFileSync(verrou, JSON.stringify({ pid: process.pid, debut: new Date().toISOString() }));

  const tmp = path.join(dest, nom + '_en-cours');
  try {
    for (const n of fs.readdirSync(dest)) if (/_en-cours$/.test(n)) { journal('Sauvegarde interrompue précédente supprimée : ' + n); fs.rmSync(path.join(dest, n), { recursive: true, force: true }); }
    if (fs.existsSync(path.join(dest, nom))) throw new Error('Une sauvegarde porte déjà ce nom : ' + nom + ' (relancez dans une minute)');
    fs.mkdirSync(tmp, { recursive: true });
    journal('=== Sauvegarde ' + cfg.projet + ' → ' + path.join(dest, nom) + (emulateur ? ' (ÉMULATEUR)' : ''));
    if (C.estDansOneDrive(dest)) journal('Note : la destination est dans OneDrive (copie envoyée dans le cloud Microsoft).');

    const debut = new Date();
    const fb = C.initFirebase(cfg, { emulateur });
    const manif = { version: 1, projet: cfg.projet, debut: debut.toISOString(), emulateur: !!emulateur, outil: { node: process.version, firebaseAdmin: JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules', 'firebase-admin', 'package.json'), 'utf8')).version }, statut: 'en-cours' };

    manif.firestore = await sauverFirestore(fb, cfg, tmp, journal);
    manif.auth = cfg.auth ? await sauverAuth(fb, tmp, journal) : { ignore: true };
    manif.regles = cfg.regles ? await sauverRegles(fb, cfg, tmp, journal, !!emulateur) : { ignore: true };
    manif.stockage = (cfg.images && cfg.bucket && !opt('--sans-images')) ? await sauverStockage(fb, cfg, dest, tmp, journal, nom) : { ignore: true };

    manif.fichiers = {};
    for (const f of C.listerFichiers(tmp)) { const st = fs.statSync(path.join(tmp, f)); manif.fichiers[f] = { octets: st.size, sha256: await C.sha256Fichier(path.join(tmp, f)) }; }
    manif.fin = new Date().toISOString();
    manif.dureeSecondes = Math.round((Date.now() - debut) / 1000);
    manif.statut = 'complet';
    C.ecrireJsonAtomique(path.join(tmp, 'manifeste.json'), manif);

    const { verifier } = require('./verifier');
    const rv = await verifier(tmp, { dest, journal: () => {} });
    if (!rv.ok) throw new Error('Vérification après sauvegarde en échec : ' + rv.erreurs.slice(0, 5).join(' | '));
    fs.renameSync(tmp, path.join(dest, nom));

    const total = Object.values(manif.fichiers).reduce((a, f) => a + f.octets, 0);
    journal('Sauvegarde complète et vérifiée en ' + manif.dureeSecondes + ' s : ' + manif.firestore.documents + ' documents, ' + (manif.auth.utilisateurs ?? '-') + ' comptes, ' + (manif.stockage.objets ?? '-') + ' fichiers Storage ; instantané ' + C.humain(total) + (manif.stockage.octetsMiroir ? ', miroir Storage ' + C.humain(manif.stockage.octetsMiroir) : ''));

    rotation(dest, cfg, journal);
    for (const c of cfg.copies) copierVers(dest, c, cfg, journal);
    const avert = Object.entries(manif.firestore.controle).filter(([, c]) => c.erreur).map(([id, c]) => 'contrôle ' + id + ' : ' + c.erreur)
      .concat(Object.entries(manif.regles || {}).filter(([, r]) => r && r.erreur).map(([n, r]) => 'règles ' + n + ' : ' + r.erreur));
    if (avert.length) journal('Avertissements : ' + avert.join(' | '));
    fs.writeFileSync(path.join(dest, 'DERNIERE-SAUVEGARDE.txt'), 'Dernière sauvegarde complète : ' + nom + '\r\nDocuments : ' + manif.firestore.documents + '\r\nComptes : ' + (manif.auth.utilisateurs ?? '-') + (manif.auth.utilisateurs ? (manif.auth.empreintesMotsDePasse && manif.auth.parametresHachage && manif.auth.parametresHachage.ok ? ' (mots de passe inclus)' : ' (mots de passe non inclus : un compte recréé passera par « Mot de passe oublié »)') : '') + '\r\nFichiers Storage : ' + (manif.stockage.objets ?? '-') + '\r\nDurée : ' + manif.dureeSecondes + ' s\r\n' + (avert.length ? '\r\nAvertissements (la sauvegarde reste valide) :\r\n- ' + avert.join('\r\n- ') + '\r\n' : ''));
    try { fs.unlinkSync(alerte); } catch (e) {}
    return 0;
  } catch (e) {
    journal('ÉCHEC : ' + (e && e.stack || e));
    ecrireAlerte(cfg.alerteDossier, (e && e.message) || String(e), journal.fichier);
    return 1;
  } finally {
    try { fs.unlinkSync(verrou); } catch (e) {}
  }
}

/* ---------------- Firestore ---------------- */
async function sauverFirestore(fb, cfg, tmp, journal) {
  const { db, admin } = fb;
  const F = admin.firestore;
  const docId = F.FieldPath.documentId();
  const rpc = C.semaphore(cfg.parallelismeFirestore);
  const R = (fn, quoi) => C.avecReessais(() => rpc(fn), quoi, journal);
  const parId = {}; const vus = new Set(); let documents = 0;
  const empreinte = (p) => crypto.createHash('sha1').update(p).digest('base64').slice(0, 12);
  const ligne = (d) => ({ p: d.ref.path, c: d.createTime ? d.createTime.toDate().toISOString() : undefined, u: d.updateTime ? d.updateTime.toDate().toISOString() : undefined, d: C.encoder(d.data(), F) });

  async function sousCollections(ref, w) {
    const cols = await R(() => ref.listCollections(), 'sous-collections de ' + ref.path);
    for (const c of cols) await collection(c, w);
  }
  async function collection(col, w, racine) {
    let apres = null;
    for (;;) {
      let q = col.orderBy(docId).limit(cfg.taillePage);
      if (apres !== null) q = q.startAfter(apres);
      const snap = await R(() => q.get(), col.path);
      const refs = [];
      for (const d of snap.docs) { await w.ecrire(ligne(d)); parId[col.id] = (parId[col.id] || 0) + 1; documents++; vus.add(empreinte(d.ref.path)); refs.push(d.ref); }
      if (snap.size) apres = snap.docs[snap.size - 1].id;
      const n = snap.size;
      await C.parLots(refs, 8, (r) => sousCollections(r, w));
      if (n < cfg.taillePage) break;
    }
    /* Parents « fantômes » au premier niveau (ex. users/{uid} supprimé mais ses sous-collections encore là).
       Plus bas, les documents sous un parent inexistant sont rattrapés par le contrôle par nom de collection. */
    if (!racine) return;
    const fantomes = [];
    const tous = await R(() => col.listDocuments(), 'liste des documents de ' + col.path);
    for (const r of tous) if (!vus.has(empreinte(r.path))) fantomes.push(r);
    await C.parLots(fantomes, 8, (r) => sousCollections(r, w));
  }

  const racines = await R(() => db.listCollections(), 'collections racine');
  const res = { documents: 0, racines: {}, parCollection: parId, controle: {} };
  for (const col of racines) {
    const n0 = documents; const t0 = Date.now();
    const w = C.ecrivainNdjson(path.join(tmp, 'firestore', col.id + '.ndjson.gz'));
    await collection(col, w, true); await w.fermer();
    res.racines[col.id] = { documents: documents - n0, octetsJson: w.octets };
    journal('Firestore ' + col.id + ' : ' + (documents - n0) + ' documents (' + C.humain(w.octets) + ' de JSON) en ' + Math.round((Date.now() - t0) / 1000) + ' s');
  }

  /* Contrôle : nombre de documents par nom de collection (requêtes d'agrégation, quasi gratuites) comparé à ce qui a
     été écrit ; un écart positif déclenche une recherche des documents manquants dans le groupe de collections. */
  let ow = null;
  for (const id of Object.keys(parId).sort()) {
    let compte = null;
    try { compte = (await R(() => db.collectionGroup(id).count().get(), 'comptage ' + id)).data().count; } catch (e) { res.controle[id] = { exporte: parId[id], erreur: e.message }; continue; }
    const ctrl = { exporte: parId[id], compte };
    if (compte > parId[id]) {
      let ajout = 0, apres = null;
      try {
        for (;;) {
          let q = db.collectionGroup(id).orderBy(docId).select().limit(500);
          if (apres) q = q.startAfter(apres);
          const snap = await R(() => q.get(), 'groupe ' + id);
          const manquants = snap.docs.filter((d) => !vus.has(empreinte(d.ref.path))).map((d) => d.ref);
          if (manquants.length) {
            if (!ow) ow = C.ecrivainNdjson(path.join(tmp, 'firestore', '_orphelins.ndjson.gz'));
            const pleins = await R(() => db.getAll(...manquants), 'lecture des documents manquants ' + id);
            for (const d of pleins) if (d.exists) { await ow.ecrire(ligne(d)); vus.add(empreinte(d.ref.path)); documents++; ajout++; await sousCollections(d.ref, ow); }
          }
          if (snap.size < 500) break;
          apres = snap.docs[snap.size - 1];
        }
      } catch (e) { ctrl.erreur = e.message; journal('Contrôle ' + id + ' incomplet (sauvegarde poursuivie) : ' + e.message); }
      ctrl.ajoutes = ajout;
      if (ajout) journal('Contrôle ' + id + ' : ' + ajout + ' document(s) supplémentaire(s) récupéré(s) (écrits pendant la sauvegarde ou sous un parent inexistant)');
    }
    res.controle[id] = ctrl;
  }
  if (ow) { await ow.fermer(); res.orphelins = ow.lignes; }
  res.documents = documents;
  return res;
}

/* ---------------- Authentication ---------------- */
async function sauverAuth(fb, tmp, journal) {
  const auth = fb.app.auth();
  const w = C.ecrivainNdjson(path.join(tmp, 'auth', 'utilisateurs.ndjson.gz'));
  let jeton, n = 0, avecHash = 0;
  do {
    const r = await C.avecReessais(() => auth.listUsers(1000, jeton), 'comptes', journal);
    for (const u of r.users) { const j = u.toJSON(); if (j.passwordHash && !EMPREINTE_MASQUEE.has(j.passwordHash)) avecHash++; await w.ecrire(j); n++; }
    jeton = r.pageToken;
  } while (jeton);
  await w.fermer();
  const hachage = fb.emulateur ? { indisponible: 'émulateur' } : await sauverParametresHachage(fb, tmp);
  const mdp = avecHash && hachage.ok ? 'mots de passe inclus pour ' + avecHash + ' comptes' : 'mots de passe NON inclus : un compte recréé devra passer par « mot de passe oublié »' + (hachage.erreur ? ' (' + hachage.erreur + ')' : '');
  journal('Authentication : ' + n + ' comptes — ' + mdp);
  return { utilisateurs: n, empreintesMotsDePasse: avecHash, parametresHachage: hachage };
}
const EMPREINTE_MASQUEE = new Set(['UkVEQUNURUQ=', 'UkVEQUNURUQ']);
async function sauverParametresHachage(fb, tmp) {
  try {
    const { access_token: jeton } = await fb.credential.getAccessToken();
    const r = await fetch('https://identitytoolkit.googleapis.com/admin/v2/projects/' + encodeURIComponent(fb.projet) + '/config', { headers: { Authorization: 'Bearer ' + jeton } });
    if (!r.ok) return { ok: false, erreur: 'paramètres de hachage non lisibles, HTTP ' + r.status };
    const h = ((await r.json()).signIn || {}).hashConfig;
    if (!h || h.algorithm !== 'SCRYPT' || !h.signerKey) return { ok: false, erreur: 'paramètres de hachage absents' };
    C.ecrireJsonAtomique(path.join(tmp, 'auth', 'hachage.json'), { algorithm: h.algorithm, signerKey: h.signerKey, saltSeparator: h.saltSeparator || '', rounds: h.rounds, memoryCost: h.memoryCost });
    return { ok: true };
  } catch (e) { return { ok: false, erreur: 'paramètres de hachage : ' + e.message }; }
}

/* ---------------- Règles de sécurité ---------------- */
async function sauverRegles(fb, cfg, tmp, journal, emulateur) {
  if (emulateur) return { indisponible: 'émulateur' };
  const out = {};
  const sr = fb.app.securityRules();
  for (const [nom, fn] of [['firestore', () => sr.getFirestoreRuleset()], ['storage', () => sr.getStorageRuleset(cfg.bucket)]]) {
    try {
      const rs = await fn();
      fs.mkdirSync(path.join(tmp, 'regles'), { recursive: true });
      for (const f of rs.source) fs.writeFileSync(path.join(tmp, 'regles', nom + '--' + path.basename(f.name)), f.content);
      out[nom] = { ruleset: rs.name, cree: rs.createTime };
    } catch (e) { out[nom] = { erreur: e.message }; journal('Règles ' + nom + ' non sauvegardées (droit « Firebase Rules Viewer » manquant ?) : ' + e.message); }
  }
  return out;
}

/* ---------------- Storage (miroir incrémental) ---------------- */
async function sauverStockage(fb, cfg, dest, tmp, journal, nom) {
  const bucket = fb.app.storage().bucket(cfg.bucket);
  const base = path.join(dest, 'stockage');
  const dirF = path.join(base, 'fichiers');
  const fIndex = path.join(base, 'index.json');
  fs.mkdirSync(dirF, { recursive: true });
  const index = fs.existsSync(fIndex) ? JSON.parse(fs.readFileSync(fIndex, 'utf8')) : {};
  const w = C.ecrivainNdjson(path.join(tmp, 'stockage.ndjson.gz'));
  const presents = new Set(); const aTelecharger = [];
  let objets = 0, octets = 0, jeton;
  do {
    const [files, suivant] = await C.avecReessais(() => bucket.getFiles({ autoPaginate: false, maxResults: 1000, pageToken: jeton }), 'liste Storage', journal);
    for (const f of files) {
      const m = f.metadata;
      if (m.name.endsWith('/') && Number(m.size) === 0) continue;
      const e = { nom: m.name, octets: Number(m.size), md5: m.md5Hash || null, crc32c: m.crc32c || null, generation: String(m.generation), type: m.contentType || null, cacheControl: m.cacheControl || null, contentDisposition: m.contentDisposition || null, contentEncoding: m.contentEncoding || null, contentLanguage: m.contentLanguage || null, metadonnees: m.metadata || null, cree: m.timeCreated, maj: m.updated };
      await w.ecrire(e); presents.add(m.name); objets++; octets += e.octets;
      const loc = path.join(dirF, C.cheminLocalObjet(m.name));
      const anc = index[m.name];
      if (!anc || anc.generation !== e.generation || anc.md5 !== e.md5 || !fs.existsSync(loc) || fs.statSync(loc).size !== e.octets) aTelecharger.push({ f, e, loc, remplace: !!anc && fs.existsSync(loc) });
      else index[m.name] = Object.assign(anc, { metadonnees: e.metadonnees, type: e.type });
    }
    jeton = suivant && suivant.pageToken;
  } while (jeton);
  await w.fermer();

  const deplacer = (loc, sous) => { const cible = path.join(base, sous, nom, path.relative(dirF, loc)); fs.mkdirSync(path.dirname(cible), { recursive: true }); fs.renameSync(loc, cible); };
  let nouveaux = 0, modifies = 0, telecharges = 0, k = 0;
  const sauverIndex = () => C.ecrireJsonAtomique(fIndex, index);
  await C.parLots(aTelecharger, cfg.parallelismeImages, async ({ f, e, loc, remplace }) => {
    fs.mkdirSync(path.dirname(loc), { recursive: true });
    const part = loc + '.part';
    await C.avecReessais(async () => {
      await f.download({ destination: part, validation: false });
      const st = fs.statSync(part);
      if (st.size !== e.octets) throw new Error('taille inattendue pour ' + e.nom + ' (' + st.size + ' au lieu de ' + e.octets + ')');
      if (e.md5 && (await C.md5Fichier(part)) !== e.md5) throw new Error('empreinte MD5 différente pour ' + e.nom);
    }, 'téléchargement ' + e.nom, journal);
    if (remplace) { deplacer(loc, 'anciennes-versions'); modifies++; } else nouveaux++;
    fs.renameSync(part, loc);
    index[e.nom] = { generation: e.generation, md5: e.md5, octets: e.octets, type: e.type, metadonnees: e.metadonnees, sauvegarde: nom };
    telecharges += e.octets;
    if (++k % 200 === 0) { sauverIndex(); journal('  Storage : ' + k + '/' + aTelecharger.length + ' fichiers téléchargés'); }
  });
  let supprimes = 0;
  for (const n of Object.keys(index)) if (!presents.has(n)) {
    const loc = path.join(dirF, C.cheminLocalObjet(n));
    if (fs.existsSync(loc)) deplacer(loc, 'supprimes');
    delete index[n]; supprimes++;
  }
  sauverIndex();
  let octetsMiroir = 0; for (const n of Object.keys(index)) octetsMiroir += index[n].octets;
  journal('Storage : ' + objets + ' fichiers (' + C.humain(octets) + ') — ' + nouveaux + ' nouveaux, ' + modifies + ' modifiés, ' + supprimes + ' supprimés en ligne (conservés), ' + C.humain(telecharges) + ' téléchargés');
  return { objets, octets, nouveaux, modifies, supprimes, octetsTelecharges: telecharges, octetsMiroir };
}

/* ---------------- Rotation ---------------- */
/* Sauvegardes gardées (noms AAAA-MM-JJ_HHhMM) :
     quotidiennes : la dernière de chacun des « garderQuotidien » derniers jours qui ont une sauvegarde
                    (PC éteint un jour → on garde quand même 3 jours de sauvegardes, pas 3 jours de calendrier) ;
     hebdomadaires : la dernière de chacune des « garderHebdo » dernières semaines (lundi → dimanche) ;
     mensuelles   : la dernière de chacun des « garderMensuel » derniers mois.
   Une même sauvegarde peut compter dans plusieurs catégories. La plus récente est toujours gardée. */
function semaineIso(n) {
  const d = new Date(Date.UTC(+n.slice(0, 4), +n.slice(5, 7) - 1, +n.slice(8, 10)));
  const j = (d.getUTCDay() + 6) % 7;   /* lundi = 0 */
  d.setUTCDate(d.getUTCDate() - j + 3);   /* jeudi de la même semaine */
  const an = d.getUTCFullYear(), jeudi1 = new Date(Date.UTC(an, 0, 4));
  const s = 1 + Math.round(((d - jeudi1) / 864e5 - 3 + ((jeudi1.getUTCDay() + 6) % 7)) / 7);
  return an + '-S' + String(s).padStart(2, '0');
}
function aGarder(noms, cfg) {
  const tri = noms.slice().sort().reverse();
  const garde = new Set(tri.slice(0, 1));
  const derniereDe = (cle) => { const m = new Map(); for (const n of tri) { const k = cle(n); if (!m.has(k)) m.set(k, n); } return [...m.values()]; };
  derniereDe((n) => n.slice(0, 10)).slice(0, cfg.garderQuotidien || 0).forEach((n) => garde.add(n));
  derniereDe(semaineIso).slice(0, cfg.garderHebdo || 0).forEach((n) => garde.add(n));
  derniereDe((n) => n.slice(0, 7)).slice(0, cfg.garderMensuel || 0).forEach((n) => garde.add(n));
  return garde;
}
function rotation(dest, cfg, journal) {
  const complets = C.instantanesComplets(dest);
  const garde = aGarder(complets, cfg);
  for (const n of complets) if (!garde.has(n)) {
    const p = path.join(dest, n);
    if (!C.NOM_INSTANTANE.test(n) || !C.dansDossier(p, dest)) continue;
    fs.rmSync(p, { recursive: true, force: true }); journal('Rotation : ancienne sauvegarde retirée ' + n);
  }
  /* Fichiers Storage supprimés / remplacés : gardés tant qu'une sauvegarde conservée est antérieure à leur retrait. */
  const plusAncienne = [...garde].sort()[0];
  for (const sous of ['supprimes', 'anciennes-versions']) {
    const d = path.join(dest, 'stockage', sous);
    if (!fs.existsSync(d) || !plusAncienne) continue;
    for (const n of fs.readdirSync(d)) if (C.NOM_INSTANTANE.test(n) && n <= plusAncienne) { fs.rmSync(path.join(d, n), { recursive: true, force: true }); journal('Rotation : stockage/' + sous + '/' + n + ' retiré (plus aucune sauvegarde conservée n\'en a besoin)'); }
  }
  const jd = path.join(dest, 'journaux');
  if (fs.existsSync(jd)) for (const n of fs.readdirSync(jd)) { const p = path.join(jd, n); if (Date.now() - fs.statSync(p).mtimeMs > 400 * 864e5) fs.unlinkSync(p); }
}

/* ---------------- Copie secondaire (disque externe…) ---------------- */
function copierVers(dest, copie, cfg, journal) {
  if (!fs.existsSync(path.parse(copie).root)) { journal('Copie secondaire ignorée : ' + copie + ' (disque absent)'); return; }
  try { C.preparerDossierSauvegarde(copie, cfg.projet); } catch (e) { journal('Copie secondaire refusée : ' + e.message); return; }
  const r = spawnSync('robocopy', [dest, copie, '/MIR', '/R:2', '/W:5', '/NP', '/NFL', '/NDL', '/NJH', '/XF', 'verrou.json'], { encoding: 'utf8' });
  if (r.status === null || r.status >= 8) journal('Copie secondaire vers ' + copie + ' en ÉCHEC (code ' + r.status + ') : ' + String(r.stdout || r.error || '').slice(-400));
  else journal('Copie secondaire à jour : ' + copie);
}

/* ---------------- Estimation ---------------- */
async function estimer(cfg, emulateur) {
  const fb = C.initFirebase(cfg, { emulateur });
  const { db } = fb;
  console.log('Estimation (lecture d\'un échantillon, rien n\'est écrit)…');
  const ids = new Map(); let docs = 0, octets = 0;
  const racines = await db.listCollections();
  for (const col of racines) {
    const n = (await col.count().get()).data().count;
    const ech = await col.limit(30).get();
    const moy = ech.size ? ech.docs.reduce((a, d) => a + JSON.stringify(C.encoder(d.data(), fb.admin.firestore)).length, 0) / ech.size : 0;
    docs += n; octets += n * moy;
    console.log('  ' + col.id.padEnd(30) + String(n).padStart(9) + ' docs   ~' + C.humain(n * moy));
    for (const d of ech.docs) for (const sc of await d.ref.listCollections()) if (!ids.has(sc.id)) ids.set(sc.id, sc);
  }
  for (const [id, sc] of ids) {
    const n = (await db.collectionGroup(id).count().get()).data().count;
    const ech = await sc.limit(30).get();
    const moy = ech.size ? ech.docs.reduce((a, d) => a + JSON.stringify(C.encoder(d.data(), fb.admin.firestore)).length, 0) / ech.size : 0;
    docs += n; octets += n * moy;
    console.log('  (sous-collection) ' + id.padEnd(18) + String(n).padStart(9) + ' docs   ~' + C.humain(n * moy));
  }
  let objets = 0, oct = 0;
  if (cfg.bucket) { let jeton; do { const [files, s] = await fb.app.storage().bucket(cfg.bucket).getFiles({ autoPaginate: false, maxResults: 1000, pageToken: jeton }); for (const f of files) { objets++; oct += Number(f.metadata.size); } jeton = s && s.pageToken; } while (jeton); }
  let comptes = 0; { let j; do { const r = await fb.app.auth().listUsers(1000, j); comptes += r.users.length; j = r.pageToken; } while (j); }
  const gz = octets / 15;
  console.log('\nFirestore : ~' + docs + ' documents, ~' + C.humain(octets) + ' de JSON, soit ~' + C.humain(gz) + ' compressé par sauvegarde (taux constaté 15 à 25×)');
  console.log('Storage   : ' + objets + ' fichiers, ' + C.humain(oct) + ' (téléchargés une seule fois, puis seulement les nouveaux)');
  console.log('Comptes   : ' + comptes);
  const n = cfg.garderQuotidien + cfg.garderHebdo + cfg.garderMensuel;
  console.log('\nPlace estimée avec ' + cfg.garderQuotidien + ' quotidiennes + ' + cfg.garderHebdo + ' hebdomadaires + ' + cfg.garderMensuel + ' mensuelles (au plus ' + n + ' sauvegardes) : ~' + C.humain(gz * n + oct) + ' aujourd\'hui (hors croissance)');
  return 0;
}

if (require.main === module) main().then((c) => process.exit(c || 0), (e) => { console.error(e && e.stack || e); process.exit(1); });
module.exports = { aGarder, semaineIso };
