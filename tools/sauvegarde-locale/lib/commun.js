'use strict';
/* Outils communs : configuration, initialisation Firebase (lecture seule), encodage fidèle des valeurs Firestore,
   écriture/lecture NDJSON compressé, limitation du parallélisme, journal, garde-fous sur les dossiers. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');

const OUTIL = path.resolve(__dirname, '..');
const MARQUEUR = '.p1planner-sauvegarde';
const REPO = path.resolve(OUTIL, '..', '..');
const PROJET_PRODUCTION = 'p1planner';
const BUCKET_PRODUCTION = 'p1planner.firebasestorage.app';
const DOSSIER_CLES = path.join(os.homedir(), '.p1planner-sauvegarde');
const HOTE_LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const NOM_INSTANTANE = /^\d{4}-\d{2}-\d{2}_\d{2}h\d{2}$/;

/* ---------- configuration ---------- */
function lireConfig(fichier) {
  const f = path.resolve(fichier || path.join(OUTIL, 'config.json'));
  if (!fs.existsSync(f)) throw new Error('Configuration introuvable : ' + f + ' (copiez config.exemple.json en config.json)');
  const c = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
  const def = { garderQuotidien: 3, garderHebdo: 8, garderMensuel: 12, seuilRetardHeures: 20, images: true, auth: true, regles: true, copies: [], parallelismeFirestore: 16, parallelismeImages: 8, taillePage: 100 };
  const cfg = Object.assign({}, def, c, { _fichier: f });
  /* %USERPROFILE% et autres variables Windows acceptées dans les chemins ; clés rangées par défaut dans DOSSIER_CLES */
  const etendre = (v) => (typeof v === 'string' ? v.replace(/%([A-Za-z_]+)%/g, (m, nom) => process.env[nom] || m) : v);
  for (const k of ['cle', 'cleRestauration', 'destination', 'alerteDossier']) cfg[k] = etendre(cfg[k]);
  cfg.copies = (cfg.copies || []).map(etendre);
  if (!cfg.cle) cfg.cle = path.join(DOSSIER_CLES, 'cle-lecture-seule.json');
  if (!cfg.cleRestauration) cfg.cleRestauration = path.join(DOSSIER_CLES, 'cle-restauration.json');
  for (const k of ['garderQuotidien', 'garderHebdo', 'garderMensuel']) { const n = Number(cfg[k]); if (!Number.isInteger(n) || n < 0) throw new Error('config : « ' + k + ' » doit être un nombre entier ≥ 0'); cfg[k] = n; }
  if (cfg.garderQuotidien + cfg.garderHebdo + cfg.garderMensuel < 1) throw new Error('config : garderQuotidien, garderHebdo et garderMensuel sont tous à 0 (au moins une sauvegarde doit être gardée)');
  if (!(Number(cfg.seuilRetardHeures) > 0)) throw new Error('config : « seuilRetardHeures » doit être un nombre > 0');
  cfg.seuilRetardHeures = Number(cfg.seuilRetardHeures);
  if (!cfg.projet) throw new Error('config : « projet » manquant');
  if (!cfg.destination) throw new Error('config : « destination » manquant');
  cfg.destination = path.resolve(cfg.destination);
  cfg.copies = (cfg.copies || []).map((x) => path.resolve(x));
  return cfg;
}

const dansDossier = (enfant, parent) => { const r = path.relative(path.resolve(parent), path.resolve(enfant)); return r === '' || (!!r && !r.startsWith('..') && !path.isAbsolute(r)); };
const dossiersOneDrive = () => [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial, path.join(os.homedir(), 'OneDrive')].filter(Boolean);
const estDansOneDrive = (p) => dossiersOneDrive().some((o) => dansDossier(p, o));

/* Un dossier de sauvegarde n'est utilisé (et nettoyé par la rotation) que s'il est vide ou porte notre marqueur :
   jamais de suppression dans un dossier qui contiendrait autre chose. */
function preparerDossierSauvegarde(dest, projet) {
  for (const i of [REPO]) if (dansDossier(dest, i) || dansDossier(i, dest)) throw new Error('Destination refusée (dossier du dépôt P1Planner, ou dossier qui le contient) : ' + dest);
  if (path.parse(dest).root === dest) throw new Error('Destination refusée (racine d\'un disque) : ' + dest + ' — choisissez un sous-dossier');
  const m = path.join(dest, MARQUEUR);
  if (fs.existsSync(dest)) {
    const contenu = fs.readdirSync(dest);
    const etranger = contenu.find((n) => /^\.[\w-]+-sauvegarde$/.test(n) && n !== MARQUEUR);
    if (etranger) throw new Error('Destination refusée : ' + dest + ' appartient à un autre outil de sauvegarde (' + etranger + ').');
    if (contenu.length && !fs.existsSync(m)) throw new Error('Destination refusée : ' + dest + ' contient déjà d\'autres fichiers. Choisissez un dossier vide ou dédié.');
    if (fs.existsSync(m)) {
      const info = JSON.parse(fs.readFileSync(m, 'utf8') || '{}');
      if (info.projet && projet && info.projet !== projet) throw new Error('Destination refusée : elle contient les sauvegardes du projet « ' + info.projet + ' », pas « ' + projet + ' ».');
    }
  }
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(m)) fs.writeFileSync(m, JSON.stringify({ projet, cree: new Date().toISOString(), role: 'Dossier géré par l\'outil Sauvegarde-locale. Ne rien y ranger d\'autre.' }, null, 2));
}

/* ---------- Firebase ---------- */
function initFirebase(cfg, opts) {
  const A = require('firebase-admin/app');
  const FM = require('firebase-admin/firestore');
  const o = { projectId: cfg.projet };
  if (cfg.bucket) o.storageBucket = cfg.bucket;
  if (opts && opts.emulateur) {
    const e = opts.emulateur;
    for (const h of [e.firestore, e.auth, e.stockage]) if (h && !HOTE_LOCAL.test(h)) throw new Error('Émulateur refusé : « ' + h + ' » n\'est pas une adresse locale.');
    if (e.firestore) process.env.FIRESTORE_EMULATOR_HOST = e.firestore;
    if (e.auth) process.env.FIREBASE_AUTH_EMULATOR_HOST = e.auth;
    if (e.stockage) process.env.FIREBASE_STORAGE_EMULATOR_HOST = e.stockage;
  } else {
    for (const k of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) delete process.env[k];
    const cle = opts && opts.cle ? opts.cle : cfg.cle;
    if (!cle) throw new Error('config : « cle » manquant (chemin du fichier de clé du compte de service)');
    if (!fs.existsSync(cle)) throw new Error('Clé introuvable : ' + cle);
    if (estDansOneDrive(cle) && !cfg.cleDansOneDriveAutorisee) throw new Error('Clé refusée : elle est dans OneDrive (' + cle + '). Rangez-la hors de OneDrive, par exemple dans ' + DOSSIER_CLES);
    if (cfg.projet !== PROJET_PRODUCTION) throw new Error('Connexion refusée : le projet « ' + cfg.projet + ' » n\'est pas « ' + PROJET_PRODUCTION + ' ».');
    if (cfg.bucket && cfg.bucket !== BUCKET_PRODUCTION) throw new Error('Connexion refusée : le bucket « ' + cfg.bucket + ' » n\'est pas « ' + BUCKET_PRODUCTION + ' ».');
    let sa; try { sa = JSON.parse(fs.readFileSync(cle, 'utf8')); } catch (e) { throw new Error('Clé illisible : ' + cle); }
    if (sa.project_id !== cfg.projet) throw new Error('La clé appartient au projet « ' + sa.project_id + ' », la configuration indique « ' + cfg.projet + ' ».');
    const role = opts && opts.role === 'restauration' ? 'restauration' : 'sauvegarde-locale';
    const attendu = role + '@' + cfg.projet + '.iam.gserviceaccount.com';
    if (sa.client_email !== attendu) throw new Error('Clé refusée : elle appartient à « ' + sa.client_email + ' », pas à « ' + attendu + ' ».');
    o.credential = A.cert(sa);
  }
  const app0 = A.initializeApp(o, 'sauvegarde-' + process.pid + '-' + Math.random().toString(36).slice(2));
  const db = FM.getFirestore(app0);
  db.settings({ ignoreUndefinedProperties: true });
  const app = {
    auth: () => require('firebase-admin/auth').getAuth(app0),
    storage: () => require('firebase-admin/storage').getStorage(app0),
    securityRules: () => require('firebase-admin/security-rules').getSecurityRules(app0),
  };
  return { admin: { firestore: FM }, app, db, credential: o.credential || null, projet: cfg.projet, emulateur: !!(opts && opts.emulateur) };
}

/* ---------- encodage fidèle des valeurs Firestore en JSON ---------- */
function encoder(v, F) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? { $t: 'num', v: '-0' } : v) : { $t: 'num', v: String(v) };
  if (Array.isArray(v)) return v.map((x) => encoder(x, F));
  if (v instanceof F.Timestamp) return { $t: 'ts', s: v.seconds, n: v.nanoseconds };
  if (v instanceof F.GeoPoint) return { $t: 'geo', lat: v.latitude, lng: v.longitude };
  if (v instanceof F.DocumentReference) return { $t: 'ref', p: v.path };
  if (F.VectorValue && v instanceof F.VectorValue) return { $t: 'vec', v: v.toArray() };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { $t: 'bytes', b64: Buffer.from(v).toString('base64') };
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = encoder(v[k], F);
    return Object.prototype.hasOwnProperty.call(o, '$t') ? { $t: 'map', v: o } : o;
  }
  throw new Error('Type de valeur inattendu : ' + typeof v);
}
function decoder(v, F, db) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => decoder(x, F, db));
  switch (v.$t) {
    case 'num': return Number(v.v);
    case 'ts': return new F.Timestamp(v.s, v.n);
    case 'geo': return new F.GeoPoint(v.lat, v.lng);
    case 'ref': return db.doc(v.p);
    case 'vec': return F.FieldValue.vector(v.v);
    case 'bytes': return Buffer.from(v.b64, 'base64');
    case 'map': { const o = {}; for (const k of Object.keys(v.v)) o[k] = decoder(v.v[k], F, db); return o; }
    default: { const o = {}; for (const k of Object.keys(v)) o[k] = decoder(v[k], F, db); return o; }
  }
}
/* Version lisible (dates ISO, références en chemin) pour les extractions destinées à être lues par un humain. */
function lisible(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(lisible);
  switch (v.$t) {
    case 'num': return v.v;
    case 'ts': return new Date(v.s * 1000 + Math.floor(v.n / 1e6)).toISOString();
    case 'geo': return { latitude: v.lat, longitude: v.lng };
    case 'ref': return 'ref:' + v.p;
    case 'vec': return v.v;
    case 'bytes': return 'octets(base64):' + v.b64;
    case 'map': { const o = {}; for (const k of Object.keys(v.v)) o[k] = lisible(v.v[k]); return o; }
    default: { const o = {}; for (const k of Object.keys(v)) o[k] = lisible(v[k]); return o; }
  }
}
/* Un document appartient à un utilisateur si son identifiant figure dans son chemin (users/<uid>/..., entitlements/<uid>...),
   ou si le champ propriétaire du document le désigne (codes de parrainage, retours). */
const CHAMP_PROPRIETAIRE = { referralCodes: 'uid', feedbacks: 'userId' };
function appartientAUtilisateur(uid, chemin, donnees) {
  if (!uid) return false;
  const seg = chemin.split('/');
  if (seg.includes(uid)) return true;
  const champ = CHAMP_PROPRIETAIRE[seg[0]];
  return !!champ && seg.length === 2 && !!donnees && donnees[champ] === uid;
}
/* JSON canonique (clés triées) pour comparer deux contenus. */
function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

/* ---------- NDJSON compressé ---------- */
function ecrivainNdjson(fichier) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const gz = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(fichier);
  gz.pipe(out);
  let lignes = 0, octets = 0, erreur = null;
  gz.on('error', (e) => { erreur = e; }); out.on('error', (e) => { erreur = e; });
  return {
    get lignes() { return lignes; }, get octets() { return octets; },
    async ecrire(obj) {
      if (erreur) throw erreur;
      const s = JSON.stringify(obj) + '\n'; lignes++; octets += Buffer.byteLength(s);
      if (!gz.write(s)) await new Promise((r) => gz.once('drain', r));
    },
    fermer() { return new Promise((res, rej) => { if (erreur) return rej(erreur); out.once('finish', res); out.once('error', rej); gz.end(); }); },
  };
}
/* Coupe uniquement sur \n : readline couperait aussi sur U+2028 et U+2029, que JSON.stringify laisse tels quels dans les textes. */
async function* lignesFlux(flux) {
  flux.setEncoding('utf8');
  let reste = '';
  for await (const morceau of flux) {
    const parts = (reste + morceau).split('\n');
    reste = parts.pop();
    for (const l of parts) if (l.trim()) yield l;
  }
  if (reste.trim()) yield reste;
}
async function* lireNdjson(fichier) {
  for await (const l of lignesFlux(fs.createReadStream(fichier).pipe(zlib.createGunzip()))) yield JSON.parse(l);
}

/* ---------- parallélisme ---------- */
function semaphore(n) {
  let libres = n; const file = [];
  const prendre = () => (libres > 0 ? (libres--, Promise.resolve()) : new Promise((r) => file.push(r)));
  const rendre = () => { const r = file.shift(); if (r) r(); else libres++; };
  return async (fn) => { await prendre(); try { return await fn(); } finally { rendre(); } };
}
async function parLots(liste, n, fn) {
  let i = 0; const travailleurs = [];
  for (let k = 0; k < Math.min(n, liste.length); k++) travailleurs.push((async () => { while (i < liste.length) { const j = i++; await fn(liste[j], j); } })());
  await Promise.all(travailleurs);
}
async function avecReessais(fn, quoi, journal, essais = 4) {
  let derniere;
  for (let k = 1; k <= essais; k++) {
    try { return await fn(); } catch (e) {
      derniere = e;
      const code = e && (e.code || (e.response && e.response.status));
      const definitif = [3, 5, 7, 9, 16, 'invalid-argument', 'permission-denied', 'not-found', 401, 403, 404].includes(code);
      if (definitif || k === essais) break;
      if (journal) journal('  nouvel essai ' + k + '/' + (essais - 1) + ' (' + quoi + ') : ' + (e.message || e));
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(3, k - 1)));
    }
  }
  throw derniere;
}

/* ---------- fichiers ---------- */
const sha256Fichier = (f) => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const md5Fichier = (f) => new Promise((res, rej) => { const h = crypto.createHash('md5'); fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => res(h.digest('base64'))).on('error', rej); });
const lireJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
function ecrireJsonAtomique(f, obj) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj, null, 2)); fs.renameSync(t, f); }
function listerFichiers(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listerFichiers(p, base, acc); else acc.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc;
}
/* Nom d'objet Storage → chemin local valable sous Windows (caractères interdits, noms réservés, points finaux). */
const RESERVES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
function cheminLocalObjet(nom) {
  return nom.split('/').map((seg) => {
    let s = seg.replace(/[%<>:"\\|?*\x00-\x1f]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase());
    if (s === '' ) s = '%00vide';
    if (s === '.' || s === '..') s = s.replace(/\./g, '%2E');
    s = s.replace(/[. ]$/, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    if (RESERVES.test(s)) s = '%' + s;
    return s;
  }).join(path.sep);
}

/* ---------- journal ---------- */
function creerJournal(fichier) {
  if (fichier) fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const f = (msg) => { const l = new Date().toLocaleString('fr-FR') + '  ' + msg; console.log(l); if (fichier) fs.appendFileSync(fichier, l + '\r\n'); };
  f.fichier = fichier; return f;
}
const horodatage = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + 'h' + p(d.getMinutes()); };
const humain = (o) => (o >= 1e9 ? (o / 1e9).toFixed(2) + ' Go' : o >= 1e6 ? (o / 1e6).toFixed(1) + ' Mo' : o >= 1e3 ? (o / 1e3).toFixed(0) + ' ko' : o + ' o');
function bureau() {
  for (const c of [...dossiersOneDrive().flatMap((o) => [path.join(o, 'Bureau'), path.join(o, 'Desktop')]), path.join(os.homedir(), 'Desktop'), path.join(os.homedir(), 'Bureau')]) if (fs.existsSync(c)) return c;
  return os.homedir();
}
function instantanesComplets(dest) {
  if (!fs.existsSync(dest)) return [];
  return fs.readdirSync(dest).filter((n) => NOM_INSTANTANE.test(n)).filter((n) => {
    try { return lireJson(path.join(dest, n, 'manifeste.json')).statut === 'complet'; } catch (e) { return false; }
  }).sort();
}

module.exports = { appartientAUtilisateur, REPO, PROJET_PRODUCTION, BUCKET_PRODUCTION, DOSSIER_CLES, lireJson, lignesFlux, OUTIL, MARQUEUR, NOM_INSTANTANE, lireConfig, dansDossier, estDansOneDrive, preparerDossierSauvegarde, initFirebase, encoder, decoder, lisible, canon, ecrivainNdjson, lireNdjson, semaphore, parLots, avecReessais, sha256Fichier, md5Fichier, ecrireJsonAtomique, listerFichiers, cheminLocalObjet, creerJournal, horodatage, humain, bureau, instantanesComplets };
