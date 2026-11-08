'use strict';
/*
  Moteur de restauration partagé par restaurer.js (ligne de commande) et assistant-restauration.js (menu).

  Principes :
  - une passe sans écriture (aperçu) classe chaque élément : absent en ligne / identique / différent ;
  - en écriture, un document absent est CRÉÉ (jamais écrasé s'il apparaît entre-temps) ; un document différent
    n'est remplacé que si on le demande ;
  - avant toute écriture, l'opération est consignée dans <destination>/restaurations/<date>_<cible>/ : documents
    créés, version en ligne des documents remplacés, fichiers et comptes recréés. annuler() s'en sert pour revenir
    en arrière, sans toucher à ce qui a été modifié depuis.
*/
const fs = require('fs');
const path = require('path');
const C = require('./commun');
const { localiserObjet } = require('../verifier');

const EMPREINTE_MASQUEE = new Set(['UkVEQUNURUQ=', 'UkVEQUNURUQ']);
const DEJA_EXISTANT = 6;
/* Documents qui portent les droits Premium et la facturation : leur remise en ligne est signalée à part. */
const DROITS_PREMIUM = /^(entitlements|billingPrivate)\//;

function selection({ uid, chemins, tout } = {}) {
  const pre = (chemins || []).map((c) => c.replace(/\/$/, ''));
  const toutSel = !!tout || (!uid && !pre.length);
  return {
    tout: toutSel, uid: uid || null, chemins: pre,
    doc: (p, d) => toutSel || C.appartientAUtilisateur(uid, p, d) || pre.some((c) => p === c || p.startsWith(c + '/')),
    objet: (nom) => toutSel || (!!uid && nom.split('/').includes(uid)) || pre.some((c) => nom.split('/').includes(c.split('/').pop())),
    libelle: toutSel ? 'tout' : uid ? 'utilisateur ' + uid : pre.join(', '),
  };
}

async function* lireLignes(f) {
  if (!fs.existsSync(f)) return;
  for await (const l of C.lignesFlux(fs.createReadStream(f))) yield JSON.parse(l);
}

/* ---- Journal d'opération (créé à la première écriture) ---- */
function journalOperation(dest, info) {
  let dir = null;
  const ouvrir = () => {
    if (dir) return dir;
    const nom = C.horodatage() + '_' + String(info.cible || 'cible').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) + '_' + Math.random().toString(36).slice(2, 6);
    dir = path.join(dest, 'restaurations', nom);
    fs.mkdirSync(dir, { recursive: true });
    C.ecrireJsonAtomique(path.join(dir, 'operation.json'), Object.assign({ statut: 'en-cours', debut: new Date().toISOString() }, info));
    return dir;
  };
  return {
    get dossier() { return dir; },
    noter(type, lignes) { if (!lignes.length) return; ouvrir(); fs.appendFileSync(path.join(dir, type + '.ndjson'), lignes.map((l) => JSON.stringify(l)).join('\n') + '\n'); },
    terminer(resultat) {
      if (!dir) return null;
      const f = path.join(dir, 'operation.json');
      C.ecrireJsonAtomique(f, Object.assign(C.lireJson(f), { statut: 'terminée', fin: new Date().toISOString(), resultat }));
      return dir;
    },
  };
}

function listerOperations(dest) {
  const base = path.join(dest, 'restaurations');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).filter((n) => fs.existsSync(path.join(base, n, 'operation.json')))
    .map((n) => Object.assign({ dossier: path.join(base, n) }, C.lireJson(path.join(base, n, 'operation.json')))).sort((a, b) => (a.debut < b.debut ? 1 : -1));
}

/* ---- Firestore ---- */
async function passeFirestore(ctx, { appliquer, ecraser, op, avantEcriture }) {
  const { dir, fb, sel } = ctx; const { db } = fb; const F = fb.admin.firestore;
  const st = { selection: 0, absents: 0, identiques: 0, differents: 0, ecrits: 0, apparusEntreTemps: 0, sensibles: 0 }; const exemplesDiff = []; const exemplesSensibles = [];
  let bw = null; const echecs = [];
  const traiter = async (lot) => {
    const snaps = await C.avecReessais(() => db.getAll(...lot.map((l) => db.doc(l.p))), 'lecture en ligne');
    const actions = [];
    snaps.forEach((s, i) => {
      const l = lot[i];
      if (!s.exists) { st.absents++; actions.push({ p: l.p, etat: 'cree', d: l.d }); return; }
      const enc = C.encoder(s.data(), F);
      if (C.canon(enc) === C.canon(l.d)) { st.identiques++; return; }
      st.differents++; if (exemplesDiff.length < 15) exemplesDiff.push(l.p);
      if (ecraser) actions.push({ p: l.p, etat: 'remplace', d: l.d, avant: enc });
    });
    for (const a of actions) if (DROITS_PREMIUM.test(a.p)) { st.sensibles++; if (exemplesSensibles.length < 5) exemplesSensibles.push(a.p); }
    if (!appliquer || !actions.length) return;
    if (avantEcriture) await avantEcriture();
    if (!bw) {
      bw = db.bulkWriter();
      bw.onWriteError((e) => {
        if (e.code === DEJA_EXISTANT) { st.apparusEntreTemps++; st.ecrits--; return false; }
        if (e.failedAttempts < 4) return true;
        echecs.push(e.documentRef.path + ' : ' + e.message); st.ecrits--; return false;
      });
    }
    if (op) op.noter('documents', actions);
    for (const a of actions) {
      const ref = db.doc(a.p); const donnees = C.decoder(a.d, F, db);
      if (a.etat === 'cree') bw.create(ref, donnees).catch(() => {}); else bw.set(ref, donnees).catch(() => {});
      st.ecrits++;
    }
    await bw.flush();
  };
  const fichiers = fs.readdirSync(path.join(dir, 'firestore')).sort((a, b) => (a[0] === '_') - (b[0] === '_') || a.localeCompare(b));
  let lot = [];
  for (const f of fichiers) for await (const l of C.lireNdjson(path.join(dir, 'firestore', f))) {
    if (!sel.doc(l.p, l.d)) continue;
    st.selection++; lot.push(l);
    if (lot.length === 200) { await traiter(lot); lot = []; }
  }
  if (lot.length) await traiter(lot);
  if (bw) await bw.close();
  if (echecs.length) throw new Error(echecs.length + ' écriture(s) en échec : ' + echecs.slice(0, 5).join(' | '));
  return Object.assign(st, { exemplesDiff, exemplesSensibles });
}

/* ---- Authentication ---- */
function lireHachage(dir) {
  const f = path.join(dir, 'auth', 'hachage.json');
  if (!fs.existsSync(f)) return null;
  const h = C.lireJson(f);
  return h.algorithm === 'SCRYPT' && h.signerKey ? h : null;
}
function versImport(u, hachage) {
  const r = { uid: u.uid, email: u.email, emailVerified: !!u.emailVerified, displayName: u.displayName, photoURL: u.photoURL, phoneNumber: u.phoneNumber, disabled: !!u.disabled, customClaims: u.customClaims,
    metadata: u.metadata ? { creationTime: u.metadata.creationTime, lastSignInTime: u.metadata.lastSignInTime || undefined } : undefined,
    providerData: (u.providerData || []).filter((p) => !['password', 'phone'].includes(p.providerId)).map((p) => ({ uid: p.uid, providerId: p.providerId, email: p.email, displayName: p.displayName, photoURL: p.photoURL })) };
  if (hachage && u.passwordHash && !EMPREINTE_MASQUEE.has(u.passwordHash)) {
    r.passwordHash = Buffer.from(u.passwordHash, 'base64');
    if (u.passwordSalt) r.passwordSalt = Buffer.from(u.passwordSalt, 'base64');
  }
  for (const k of Object.keys(r)) if (r[k] === undefined || r[k] === null) delete r[k];
  if (r.metadata && !r.metadata.lastSignInTime) delete r.metadata.lastSignInTime;
  if (r.providerData && !r.providerData.length) delete r.providerData;
  return r;
}
const optionsHachage = (h) => ({ hash: { algorithm: 'SCRYPT', key: Buffer.from(h.signerKey, 'base64'), saltSeparator: Buffer.from(h.saltSeparator || '', 'base64'), rounds: h.rounds, memoryCost: h.memoryCost } });

async function passeAuth(ctx, { appliquer, op, avantEcriture }) {
  const { dir, fb, sel } = ctx;
  const f = path.join(dir, 'auth', 'utilisateurs.ndjson.gz');
  if (!fs.existsSync(f)) return null;
  const auth = fb.app.auth();
  const hachage = fb.emulateur ? null : lireHachage(dir);
  const comptes = [];
  for await (const u of C.lireNdjson(f)) if (sel.tout || (sel.uid && u.uid === sel.uid)) comptes.push(u);
  const st = { selection: comptes.length, presents: 0, absents: 0, conflits: [], recrees: 0, avecMotDePasse: 0, sansMotDePasse: 0, refuses: [] };
  let absents = [];
  for (let i = 0; i < comptes.length; i += 100) {
    const lot = comptes.slice(i, i + 100);
    const r = await C.avecReessais(() => auth.getUsers(lot.map((u) => ({ uid: u.uid }))), 'comptes en ligne');
    const vus = new Set(r.users.map((u) => u.uid));
    for (const u of lot) if (vus.has(u.uid)) st.presents++; else absents.push(u);
  }
  const avecEmail = absents.filter((u) => u.email);
  const prisPar = new Map();
  for (let i = 0; i < avecEmail.length; i += 100) {
    const r = await C.avecReessais(() => auth.getUsers(avecEmail.slice(i, i + 100).map((u) => ({ email: u.email }))), 'e-mails en ligne');
    for (const x of r.users) prisPar.set(String(x.email).toLowerCase(), x.uid);
  }
  absents = absents.filter((u) => {
    const autre = u.email && prisPar.get(u.email.toLowerCase());
    if (autre && autre !== u.uid) { st.conflits.push(u.email + ' (sauvegarde : ' + u.uid + ', en ligne : ' + autre + ')'); return false; }
    return true;
  });
  st.absents = absents.length;
  const recs = absents.map((u) => versImport(u, hachage));
  for (const r of recs) if (r.passwordHash) st.avecMotDePasse++; else st.sansMotDePasse++;
  if (appliquer && recs.length) {
    if (avantEcriture) await avantEcriture();
    if (op) op.noter('comptes', recs.map((r) => ({ uid: r.uid, email: r.email || null, motDePasse: !!r.passwordHash })));
    const groupes = [recs.filter((r) => r.passwordHash), recs.filter((r) => !r.passwordHash)];
    for (const [g, avecH] of [[groupes[0], true], [groupes[1], false]]) for (let i = 0; i < g.length; i += 1000) {
      const part = g.slice(i, i + 1000);
      const res = await C.avecReessais(() => (avecH ? auth.importUsers(part, optionsHachage(hachage)) : auth.importUsers(part)), 'import de comptes');
      st.recrees += res.successCount;
      for (const e of res.errors) st.refuses.push(part[e.index].uid + ' : ' + (e.error && e.error.message));
    }
  }
  return st;
}

/* ---- Storage ---- */
async function passeStockage(ctx, { appliquer, op, avantEcriture }) {
  const { dir, dest, fb, cfg, sel } = ctx;
  const fl = path.join(dir, 'stockage.ndjson.gz');
  if (!fs.existsSync(fl) || !cfg.bucket) return null;
  const bucket = fb.app.storage().bucket(cfg.bucket);
  const fIndex = path.join(dest, 'stockage', 'index.json');
  const index = fs.existsSync(fIndex) ? JSON.parse(fs.readFileSync(fIndex, 'utf8')) : {};
  const st = { selection: 0, presents: 0, absents: 0, introuvables: 0, remis: 0 };
  const liste = [];
  for await (const e of C.lireNdjson(fl)) if (sel.objet(e.nom)) liste.push(e);
  st.selection = liste.length;
  const aEnvoyer = [];
  await C.parLots(liste, 8, async (e) => {
    const [existe] = await C.avecReessais(() => bucket.file(e.nom).exists(), 'présence ' + e.nom);
    if (existe) { st.presents++; return; }
    st.absents++;
    const loc = localiserObjet(dest, e, index)[0];
    if (!loc) { st.introuvables++; return; }
    aEnvoyer.push({ e, loc });
  });
  if (appliquer && aEnvoyer.length) {
    if (avantEcriture) await avantEcriture();
    if (op) op.noter('fichiers', aEnvoyer.map(({ e }) => ({ nom: e.nom, md5: e.md5 })));
    await C.parLots(aEnvoyer, 8, async ({ e, loc }) => {
      const meta = { contentType: e.type || undefined, cacheControl: e.cacheControl || undefined, contentDisposition: e.contentDisposition || undefined, contentEncoding: e.contentEncoding || undefined, contentLanguage: e.contentLanguage || undefined, metadata: e.metadonnees || undefined };
      for (const k of Object.keys(meta)) if (meta[k] === undefined) delete meta[k];
      await C.avecReessais(() => bucket.upload(loc, { destination: e.nom, resumable: false, metadata: meta, validation: false, preconditionOpts: { ifGenerationMatch: 0 } }), 'envoi ' + e.nom);
      st.remis++;
    });
  }
  return st;
}

/* ---- Restauration complète (aperçu ou écriture) ---- */
async function restaurer(ctx, { appliquer = false, ecraser = false, auth = true, images = true, avantEcriture = null, info = {} } = {}) {
  const op = appliquer ? journalOperation(ctx.dest, Object.assign({ sauvegarde: path.basename(ctx.dir), projet: ctx.cfg.projet, selection: ctx.sel.libelle, ecraser }, info)) : null;
  let dejaConfirme = false;
  const garde = async () => { if (dejaConfirme) return; if (avantEcriture) await avantEcriture(); dejaConfirme = true; };
  const r = {};
  try {
    r.firestore = await passeFirestore(ctx, { appliquer, ecraser, op, avantEcriture: garde });
    r.auth = auth ? await passeAuth(ctx, { appliquer, op, avantEcriture: garde }) : null;
    r.stockage = images ? await passeStockage(ctx, { appliquer, op, avantEcriture: garde }) : null;
  } catch (e) {
    if (op && op.dossier) { const f = path.join(op.dossier, 'operation.json'); C.ecrireJsonAtomique(f, Object.assign(C.lireJson(f), { statut: 'interrompue', erreur: e.message })); }
    e.dossierOperation = op && op.dossier; throw e;
  }
  r.dossierOperation = op ? op.terminer({ documents: r.firestore.ecrits, comptes: r.auth ? r.auth.recrees : 0, fichiers: r.stockage ? r.stockage.remis : 0 }) : null;
  return r;
}

/* ---- Annulation d'une restauration ---- */
async function annuler(dossierOp, fb, cfg, { appliquer = false, avantEcriture = null } = {}) {
  const { db } = fb; const F = fb.admin.firestore;
  const st = { documents: 0, aAnnuler: 0, annules: 0, dejaRevenus: 0, modifiesDepuis: [], fichiers: 0, fichiersRetires: 0, fichiersModifies: [], comptes: [] };
  const entrees = [];
  for await (const e of lireLignes(path.join(dossierOp, 'documents.ndjson'))) entrees.push(e);
  st.documents = entrees.length;
  const actions = [];
  for (let i = 0; i < entrees.length; i += 200) {
    const lot = entrees.slice(i, i + 200);
    const snaps = await C.avecReessais(() => db.getAll(...lot.map((e) => db.doc(e.p))), 'lecture en ligne');
    snaps.forEach((s, k) => {
      const e = lot[k];
      const enLigne = s.exists ? C.canon(C.encoder(s.data(), F)) : null;
      const revenu = e.etat === 'cree' ? enLigne === null : enLigne === C.canon(e.avant);
      if (revenu) { st.dejaRevenus++; return; }
      if (enLigne !== C.canon(e.d)) { st.modifiesDepuis.push(e.p); return; }
      actions.push(e);
    });
  }
  st.aAnnuler = actions.length;
  const fichiers = []; for await (const f of lireLignes(path.join(dossierOp, 'fichiers.ndjson'))) fichiers.push(f);
  for await (const c of lireLignes(path.join(dossierOp, 'comptes.ndjson'))) st.comptes.push(c.email || c.uid);
  st.fichiers = fichiers.length;
  const bucket = fichiers.length && cfg.bucket ? fb.app.storage().bucket(cfg.bucket) : null;
  const aRetirer = [];
  for (const f of bucket ? fichiers : []) {
    const [existe] = await bucket.file(f.nom).exists();
    if (!existe) continue;
    const [m] = await bucket.file(f.nom).getMetadata();
    if (f.md5 && m.md5Hash !== f.md5) { st.fichiersModifies.push(f.nom); continue; }
    aRetirer.push(f);
  }
  if (appliquer && (actions.length || aRetirer.length)) {
    if (avantEcriture) await avantEcriture();
    const bw = db.bulkWriter(); const echecs = [];
    bw.onWriteError((e) => { if (e.failedAttempts < 4) return true; echecs.push(e.documentRef.path + ' : ' + e.message); return false; });
    for (const e of actions) { if (e.etat === 'cree') bw.delete(db.doc(e.p)).catch(() => {}); else bw.set(db.doc(e.p), C.decoder(e.avant, F, db)).catch(() => {}); }
    await bw.close();
    if (echecs.length) throw new Error(echecs.length + ' annulation(s) en échec : ' + echecs.slice(0, 5).join(' | '));
    st.annules = actions.length;
    for (const f of aRetirer) { await C.avecReessais(() => bucket.file(f.nom).delete(), 'retrait ' + f.nom); st.fichiersRetires++; }
    const fo = path.join(dossierOp, 'operation.json');
    C.ecrireJsonAtomique(fo, Object.assign(C.lireJson(fo), { statut: 'annulée', annulee: new Date().toISOString() }));
  }
  return st;
}

module.exports = { selection, restaurer, annuler, listerOperations, versImport, optionsHachage, lireHachage, EMPREINTE_MASQUEE };
