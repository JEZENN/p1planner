#!/usr/bin/env node
'use strict';
/*
  Test de bout en bout, UNIQUEMENT sur émulateurs (projets « demo-… », aucune connexion au vrai projet) :
  sauvegarde complète, incrémentale, interrompue, en panne, rotation, garde-fous, restauration vers un autre projet
  puis comparaison exacte (Firestore, Auth, Storage avec métadonnées), restauration partielle d'un utilisateur, extraction.

  Prérequis : émulateurs Firestore / Auth / Storage lancés (firebase emulators:start) sans « singleProjectMode ».
  Usage : node tests/test-emulateur.js <dossier-de-travail-vide> [firestore=127.0.0.1:8380] [auth=127.0.0.1:9398] [stockage=127.0.0.1:9498]
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');
const C = require('../lib/commun');
const { aGarder, semaineIso } = require('../sauvegarder');

const T = path.resolve(process.argv[2] || '');
if (!process.argv[2]) { console.error('Dossier de travail manquant'); process.exit(2); }
const [FS, AU, ST] = [process.argv[3] || '127.0.0.1:8380', process.argv[4] || '127.0.0.1:9398', process.argv[5] || '127.0.0.1:9498'];
const EMU = { firestore: FS, auth: AU, stockage: ST };
const OUTIL = path.resolve(__dirname, '..');
const res = []; const check = (n, ok, d) => { res.push(!!ok); console.log('   ' + (ok ? '✔' : '✘') + ' ' + n + (ok ? '' : ' — ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700))); return ok; };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const PA = 'demo-p1sauv', PB = 'demo-cible';
const BA = PA + '.firebasestorage.app', BB = PB + '.firebasestorage.app';
fs.rmSync(T, { recursive: true, force: true }); fs.mkdirSync(T, { recursive: true });
const ALERTE = path.join(T, 'alerte'); fs.mkdirSync(ALERTE);
const ecrireCfg = (nom, o) => { const f = path.join(T, nom); fs.writeFileSync(f, JSON.stringify(Object.assign({ emulateur: EMU, alerteDossier: ALERTE, garderHebdo: 3, garderMensuel: 2, taillePage: 100 }, o), null, 2)); return f; };
const CFG_A = ecrireCfg('cfgA.json', { projet: PA, bucket: BA, destination: path.join(T, 'dest'), copies: [path.join(T, 'copie')] });
const CFG_B = ecrireCfg('cfgB.json', { projet: PB, bucket: BB, destination: path.join(T, 'destB') });
const lancer = (script, a, env) => spawnSync(process.execPath, [path.join(OUTIL, script), ...a], { encoding: 'utf8', env: Object.assign({}, process.env, env || {}), timeout: 600000 });
const sauv = (cfg, nom, extra) => lancer('sauvegarder.js', ['--config', cfg, ...(extra || [])], { SAUVEGARDE_NOM_TEST: nom });
const sortie = (r) => (r.stdout || '') + (r.stderr || '');

async function viderEmulateurs(projet, bucketNom, fb) {
  await fetch('http://' + FS + '/emulator/v1/projects/' + projet + '/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://' + AU + '/emulator/v1/projects/' + projet + '/accounts', { method: 'DELETE' });
  const b = fb.app.storage().bucket(bucketNom);
  try { const [fl] = await b.getFiles(); for (const f of fl) await f.delete(); } catch (e) {}
}

async function lireExport(dir) {
  const m = new Map();
  for (const f of fs.readdirSync(path.join(dir, 'firestore'))) for await (const l of C.lireNdjson(path.join(dir, 'firestore', f))) { if (m.has(l.p)) throw new Error('doublon ' + l.p); m.set(l.p, C.canon(l.d)); }
  return m;
}

(async () => {
  const A = C.initFirebase({ projet: PA, bucket: BA }, { emulateur: EMU });
  const B = C.initFirebase({ projet: PB, bucket: BB }, { emulateur: EMU });
  const F = A.admin.firestore;
  try {
    await viderEmulateurs(PA, BA, A); await viderEmulateurs(PB, BB, B);
    const db = A.db;
    /* ---------- jeu de données ---------- */
    const chemins = [];
    const ecrire = async (p, d) => { await db.doc(p).set(d); chemins.push(p); };
    const tousTypes = { texte: 'é ü 漢字 😀', vrai: true, nul: null, entier: 9007199254740991, decimal: 3.5, negatifZero: -0, pasUnNombre: NaN, infini: Infinity, moinsInfini: -Infinity,
      date: new F.Timestamp(1730000000, 123456789), geo: new F.GeoPoint(48.85, 2.35), ref: db.doc('users/u01'), octets: Buffer.from([0, 1, 2, 250, 255]),
      tableau: [1, 'a', { x: [null, { y: new F.Timestamp(1, 2) }] }, {}], tableauVide: [], vide: {}, piege: { $t: 'ts', s: 1, n: 2 }, imbrique: { a: { b: { c: { d: 'profond' } } } } };
    await ecrire('types/tous', tousTypes);
    for (let i = 0; i < 30; i++) {
      const u = 'u' + String(i).padStart(2, '0');
      await ecrire('users/' + u, { email: u + '@exemple.fr', cree: F.Timestamp.now(), referralCode: 'CODE-' + u, reglages: { theme: i % 2 ? 'dark' : 'light' } });
      for (let k = 0; k < 5; k++) await ecrire('users/' + u + '/notes/n' + k, { html: '<p>note ' + k + ' de ' + u + '</p>'.repeat(20) + '  séparateurs collés depuis un PDF', maj: F.Timestamp.now() });
      for (let k = 0; k < 3; k++) await ecrire('users/' + u + '/errorEntries/e' + k, { texte: 'erreur ' + k + ' avec séparateur collé' });
      await ecrire('users/' + u + '/subjects/s0', { name: 'Cardiologie', color: '#ef4444' });
      await ecrire('users/' + u + '/courses/c0', { subjectId: 's0', title: 'Cours 1', number: 1 });
      await ecrire('users/' + u + '/courses/c0/tourLogs/t0', { tour: 1, at: F.Timestamp.now() });
      await ecrire('users/' + u + '/trainingItems/tr0', { title: 'Entraînement 1', score: 14.5 });
      await ecrire('users/' + u + '/trainingItems/tr0/attempts/a0', { score: 12 });
      await ecrire('users/' + u + '/notesEntrainements/tr0', { html: '<p>cahier entraînements </p>' });
      await ecrire('users/' + u + '/tasks/tk0', { title: 'Tâche', done: false });
      await ecrire('users/' + u + '/calendarDays/2026-11-08', { entries: [{ t: 'Révisions', m: 30 }] });
      await ecrire('users/' + u + '/dailyStats/2026-11-08', { minutes: 30 });
      await ecrire('users/' + u + '/workSessions/w0', { minutes: 25 });
      await ecrire('users/' + u + '/streak/state', { count: 3 });
      await ecrire('users/' + u + '/settings/preferences', { theme: i % 2 ? 'dark' : 'light' });
      await ecrire('users/' + u + '/backups/b0', { createdBy: 'auto', createdAt: F.Timestamp.now() });
      await ecrire('users/' + u + '/backups/b0/parts/p0', { n: 0, data: 'x'.repeat(2000) });
      await ecrire('entitlements/' + u, { writeAccessUntil: new F.Timestamp(1893456000, 0), plan: 'essai' });
      await ecrire('billingPrivate/' + u, { stripeCustomerId: 'cus_test_' + u });
      await ecrire('achievements/' + u, { trophees: ['premier-tour'] });
      await ecrire('referralCodes/CODE-' + u, { uid: u, createdAt: F.Timestamp.now() });
      await ecrire('feedbacks/f_' + u, { userId: u, message: 'Bonjour merci ', createdAt: F.Timestamp.now() });
      await ecrire('userStats/' + u, { cases: Array.from({ length: 300 }, (_, j) => ({ j, tours: [j % 4, j % 7], txt: 'x'.repeat(40) })) });
    }
    const bw = db.bulkWriter();
    for (let k = 0; k < 120; k++) { const p = 'users/u00/flashcards/c' + String(k).padStart(3, '0'); bw.set(db.doc(p), { recto: 'Q' + k, verso: 'R', interval: k, nextReview: new F.Timestamp(1730000000 + k, 0) }); chemins.push(p); }
    for (let k = 0; k < 2500; k++) { const p = 'bulk/d' + String(k).padStart(5, '0'); bw.set(db.doc(p), { k, h: sha(String(k)) }); chemins.push(p); }
    await bw.close();
    await ecrire('userStats/gros', { blob: 'a'.repeat(900000) });
    await ecrire('users/u01/errorEntries/e0/historique/h0', { niveau: 2 });
    await ecrire('users/u01/errorEntries/e0/historique/h0/details/d0', { niveau: 3 });
    await ecrire('users/u01/errorEntries/e0/historique/h0/details/d0/encore/x0', { niveau: 4 });
    await ecrire('Unicode é ü/doc à espace', { ok: true });
    await ecrire('users/u03/notesEntrainements/trX', { html: '<p>vraie note</p>', updatedAt: F.Timestamp.now() });
    await ecrire('users/fantome/notes/n1', { orphelin: 'parent racine inexistant' });
    await ecrire('users/u00/flashcards/c000/reviews/r0', { note: 4 });
    await ecrire('users/u02/flashcards/absente/reviews/r1', { orphelin: 'parent profond inexistant' });
    console.log('Jeu de données : ' + chemins.length + ' documents');
    const verite = new Map();
    for (let i = 0; i < chemins.length; i += 300) { const s = await db.getAll(...chemins.slice(i, i + 300).map((p) => db.doc(p))); for (const d of s) verite.set(d.ref.path, C.canon(C.encoder(d.data(), F))); }

    const auth = A.app.auth();
    for (let i = 0; i < 25; i++) await auth.createUser({ uid: 'u' + String(i).padStart(2, '0'), email: 'u' + i + '@exemple.fr', password: 'motdepasse' + i, displayName: i === 3 ? 'Zoé Ñúñez' : 'U' + i, emailVerified: i % 2 === 0, disabled: i === 7 });
    await auth.setCustomUserClaims('u00', { admin: true, niveau: 3 });

    const bucket = A.app.storage().bucket(BA);
    const objets = new Map();
    const envoyer = async (nom, contenu, type) => { const jeton = crypto.randomUUID(); await bucket.file(nom).save(contenu, { resumable: false, metadata: { contentType: type, cacheControl: 'private, max-age=60', metadata: { firebaseStorageDownloadTokens: jeton, auteur: 'test' } } }); objets.set(nom, { sha: sha(contenu), jeton, type }); };
    for (let i = 0; i < 40; i++) await envoyer('users/u' + String(i % 10).padStart(2, '0') + '/notesImages/' + (1730000000000 + i) + '_x' + i + '.jpg', crypto.randomBytes(10000 + i * 3000), 'image/jpeg');
    await envoyer('communs/partage.png', crypto.randomBytes(5000), 'image/png');
    await envoyer('users/u01/documents/123_mon fichier é.pdf', crypto.randomBytes(300000), 'application/pdf');
    await envoyer('bizarre/a:b*c?.txt', Buffer.from('caractères interdits sous Windows'), 'text/plain');
    await envoyer('CON/aux.txt', Buffer.from('noms réservés'), 'text/plain');
    await envoyer('x/fin.', Buffer.from('point final'), 'text/plain');
    await envoyer('vide.bin', Buffer.alloc(0), 'application/octet-stream');

    /* ---------- 1. sauvegarde complète ---------- */
    console.log('\n1. Sauvegarde complète');
    let r = sauv(CFG_A, '2026-01-04_03h00');
    const DEST = path.join(T, 'dest'), S1 = path.join(DEST, '2026-01-04_03h00');
    check('code de sortie 0', r.status === 0, sortie(r).slice(-1500));
    const m1 = JSON.parse(fs.readFileSync(path.join(S1, 'manifeste.json'), 'utf8'));
    const ex1 = await lireExport(S1);
    const manque = [...verite.keys()].filter((p) => !ex1.has(p)); const enTrop = [...ex1.keys()].filter((p) => !verite.has(p));
    const diff = [...verite.keys()].filter((p) => ex1.has(p) && ex1.get(p) !== verite.get(p));
    check('tous les documents sauvegardés, y compris parents inexistants (racine et profond) et profondeur 6 : ' + ex1.size + '/' + verite.size, !manque.length && !enTrop.length, { manque, enTrop });
    check('contenu identique au document près (tous les types, « $t » piège, NaN, -0, octets, dates)', !diff.length, diff.slice(0, 5));
    let lt; for await (const l of C.lireNdjson(path.join(S1, 'firestore', 'types.ndjson.gz'))) lt = l;
    const dec = C.decoder(lt.d, F, db);
    check('décodage fidèle : Timestamp à la microseconde (précision Firestore), GeoPoint, référence, octets, NaN, -0, Infinity', dec.date.nanoseconds === 123456000 && dec.geo.latitude === 48.85 && dec.ref.path === 'users/u01' && Buffer.compare(dec.octets, Buffer.from([0, 1, 2, 250, 255])) === 0 && Number.isNaN(dec.pasUnNombre) && Object.is(dec.negatifZero, -0) && dec.infini === Infinity && dec.piege.$t === 'ts' && !(dec.piege instanceof F.Timestamp), Object.keys(dec));
    check('manifeste : ' + m1.firestore.documents + ' documents, ' + m1.auth.utilisateurs + ' comptes, ' + m1.stockage.objets + ' fichiers', m1.statut === 'complet' && m1.firestore.documents === verite.size && m1.auth.utilisateurs === 25 && m1.stockage.objets === objets.size, m1);
    let auOk = 0; for await (const u of C.lireNdjson(path.join(S1, 'auth', 'utilisateurs.ndjson.gz'))) { if (u.uid === 'u00' && u.customClaims && u.customClaims.admin === true) auOk++; if (u.uid === 'u07' && u.disabled) auOk++; if (u.uid === 'u03' && u.displayName === 'Zoé Ñúñez') auOk++; }
    check('comptes : droits personnalisés, compte désactivé, nom accentué', auOk === 3, auOk);
    let stOk = 0; const idx = JSON.parse(fs.readFileSync(path.join(DEST, 'stockage', 'index.json'), 'utf8'));
    for (const [nom, o] of objets) { const loc = path.join(DEST, 'stockage', 'fichiers', C.cheminLocalObjet(nom)); if (fs.existsSync(loc) && sha(fs.readFileSync(loc)) === o.sha && idx[nom].metadonnees.firebaseStorageDownloadTokens === o.jeton) stOk++; }
    check('Storage : ' + stOk + '/' + objets.size + ' fichiers identiques octet pour octet + jeton de lien conservé (noms Windows interdits, accents, fichier vide)', stOk === objets.size, stOk);
    r = lancer('verifier.js', [S1, '--complet']);
    check('vérification complète (SHA-256 + MD5) : OK', r.status === 0, sortie(r));
    check('copie secondaire identique', fs.existsSync(path.join(T, 'copie', '2026-01-04_03h00', 'manifeste.json')) && fs.existsSync(path.join(T, 'copie', 'stockage', 'fichiers', 'vide.bin')), fs.existsSync(path.join(T, 'copie')) ? fs.readdirSync(path.join(T, 'copie')) : 'absente');
    check('pas d\'alerte d\'échec', !fs.existsSync(path.join(ALERTE, 'SAUVEGARDE P1PLANNER EN ECHEC.txt')));

    /* ---------- 2. incrémentale ---------- */
    console.log('\n2. Sauvegarde incrémentale (fichiers ajoutés, supprimés, remplacés)');
    const [supp1, supp2, rempl] = [...objets.keys()].filter((n) => n.includes('/notesImages/')).slice(0, 3);
    const ancienRempl = objets.get(rempl).sha;
    await bucket.file(supp1).delete(); await bucket.file(supp2).delete(); objets.delete(supp1); objets.delete(supp2);
    await envoyer(rempl, crypto.randomBytes(7777), 'image/jpeg');
    for (let k = 0; k < 3; k++) await envoyer('users/u20/notesImages/nouveau' + k + '.jpg', crypto.randomBytes(4000), 'image/jpeg');
    await db.doc('users/u05/notes/n0').update({ html: 'modifiée' }); await db.doc('users/u05/notes/n1').delete();
    r = sauv(CFG_A, '2026-01-11_03h00');
    const S2 = path.join(DEST, '2026-01-11_03h00');
    const m2 = JSON.parse(fs.readFileSync(path.join(S2, 'manifeste.json'), 'utf8'));
    check('code 0 ; 3 nouveaux, 1 remplacé, 2 supprimés ; seuls ' + C.humain(m2.stockage.octetsTelecharges) + ' téléchargés', r.status === 0 && m2.stockage.nouveaux === 3 && m2.stockage.modifies === 1 && m2.stockage.supprimes === 2 && m2.stockage.octetsTelecharges === 7777 + 3 * 4000, m2.stockage);
    const pSupp = path.join(DEST, 'stockage', 'supprimes', '2026-01-11_03h00', C.cheminLocalObjet(supp1));
    const pAnc = path.join(DEST, 'stockage', 'anciennes-versions', '2026-01-11_03h00', C.cheminLocalObjet(rempl));
    check('fichier supprimé en ligne conservé (supprimes/), ancienne version conservée (anciennes-versions/)', fs.existsSync(pSupp) && fs.existsSync(pAnc) && sha(fs.readFileSync(pAnc)) === ancienRempl);
    r = lancer('verifier.js', ['--toutes', '--complet', '--config', CFG_A]);
    check('les DEUX sauvegardes restent vérifiables et complètes (l\'ancienne retrouve ses fichiers)', r.status === 0 && (sortie(r).match(/^OK /gm) || []).length === 2, sortie(r));

    /* ---------- 3. interruption brutale ---------- */
    console.log('\n3. Sauvegarde coupée net en plein travail');
    const enfant = spawn(process.execPath, [path.join(OUTIL, 'sauvegarder.js'), '--config', CFG_A], { env: Object.assign({}, process.env, { SAUVEGARDE_NOM_TEST: '2026-01-18_03h00' }), stdio: 'ignore' });
    for (let i = 0; i < 100 && !fs.existsSync(path.join(DEST, '2026-01-18_03h00_en-cours', 'firestore')); i++) await new Promise((r2) => setTimeout(r2, 100));
    await new Promise((r2) => setTimeout(r2, 150)); enfant.kill('SIGKILL'); await new Promise((r2) => enfant.once('exit', r2));
    check('après coupure : dossier « _en-cours » non validé, aucune sauvegarde « complète » créée, les précédentes intactes', fs.existsSync(path.join(DEST, '2026-01-18_03h00_en-cours')) && !fs.existsSync(path.join(DEST, '2026-01-18_03h00')) && C.instantanesComplets(DEST).length === 2);
    r = sauv(CFG_A, '2026-01-18_03h05');
    check('la sauvegarde suivante nettoie (verrou périmé, dossier partiel) et réussit', r.status === 0 && !fs.existsSync(path.join(DEST, '2026-01-18_03h00_en-cours')) && /Verrou périmé|interrompue/.test(sortie(r)) && C.instantanesComplets(DEST).includes('2026-01-18_03h05'), sortie(r).slice(-800));
    r = sauv(CFG_A, '2026-01-18_03h06', ['--si-en-retard']);
    check('--si-en-retard : rien à faire si la dernière date de moins de 20 h', r.status === 0 && /rien à faire/.test(sortie(r)) && !fs.existsSync(path.join(DEST, '2026-01-18_03h06')), sortie(r));

    /* ---------- 4. panne réseau / serveur ---------- */
    console.log('\n4. Firebase injoignable');
    const CFG_P = ecrireCfg('cfgPanne.json', { projet: PA, bucket: BA, destination: DEST, emulateur: { firestore: '127.0.0.1:1', auth: AU, stockage: ST } });
    const t0 = Date.now(); r = sauv(CFG_P, '2026-01-25_03h00');
    check('échec propre (code 1) après nouveaux essais (' + Math.round((Date.now() - t0) / 1000) + ' s), alerte posée, rien de validé, précédentes intactes', r.status === 1 && fs.existsSync(path.join(ALERTE, 'SAUVEGARDE P1PLANNER EN ECHEC.txt')) && !fs.existsSync(path.join(DEST, '2026-01-25_03h00')) && C.instantanesComplets(DEST).length === 3, sortie(r).slice(-600));
    r = sauv(CFG_A, '2026-01-25_03h10');
    check('sauvegarde réussie suivante : alerte retirée', r.status === 0 && !fs.existsSync(path.join(ALERTE, 'SAUVEGARDE P1PLANNER EN ECHEC.txt')));

    /* ---------- 5. rotation ---------- */
    console.log('\n5. Rotation');
    const noms = []; for (let d = new Date('2024-06-02T03:00:00'); d < new Date('2026-01-01'); d.setDate(d.getDate() + 7)) noms.push(C.horodatage(d));
    const g = [...aGarder(noms, { garderHebdo: 8, garderMensuel: 12 })].sort();
    const moisGardes = new Set(g.map((n) => n.slice(0, 7)));
    check('8 hebdomadaires + 12 mensuelles : ' + g.length + ' gardées (les 8 dernières semaines + la dernière de chacun des 12 derniers mois)', noms.slice(-8).every((n) => g.includes(n)) && moisGardes.size === 12 && g.length <= 20 && g.length >= 12, g);
    await db.doc('users/u03/notesEntrainements/trX').set({ html: '<div class="p1-skl p1-skl-editor" contenteditable="false" aria-busy="true"><span class="p1-sk p1-skl-line"></span></div>', updatedAt: F.Timestamp.now() });
    r = sauv(CFG_A, '2026-02-01_03h00');
    const restants = C.instantanesComplets(DEST);
    check('rotation réelle (3 hebdo + 2 mensuelles) : ' + restants.join(', '), r.status === 0 && restants.length === 3 && !restants.includes('2026-01-04_03h00') && !restants.includes('2026-01-11_03h00') && restants.includes('2026-01-25_03h10') && restants.includes('2026-02-01_03h00'), restants);
    check('fichiers supprimés plus nécessaires purgés seulement quand plus aucune sauvegarde gardée n\'en dépend', fs.existsSync(path.join(DEST, 'stockage', 'supprimes', '2026-01-11_03h00')) === restants.some((n) => n < '2026-01-11_03h00'), fs.readdirSync(path.join(DEST, 'stockage', 'supprimes')));
    r = lancer('verifier.js', ['--toutes', '--complet', '--config', CFG_A]);
    check('toutes les sauvegardes restantes vérifiées', r.status === 0, sortie(r));

    /* ---------- 5 bis. sauvegarde quotidienne, 3 derniers jours ---------- */
    console.log('\n5 bis. Sauvegarde quotidienne : 3 derniers jours');
    const jours = []; for (let d = new Date('2026-08-01T03:00:00'); d < new Date('2026-11-09'); d.setDate(d.getDate() + 1)) jours.push(C.horodatage(d));
    const jours2 = jours.filter((n) => n.slice(0, 10) !== '2026-11-06').concat(['2026-11-08_21h30']);   /* PC éteint le 06, deux sauvegardes le 08 */
    const g3 = [...aGarder(jours2, { garderQuotidien: 3, garderHebdo: 0, garderMensuel: 0 })].sort();
    check('3 jours seulement : la dernière de chacun des 3 derniers jours AYANT une sauvegarde (' + g3.join(', ') + ')', JSON.stringify(g3) === JSON.stringify(['2026-11-05_03h00', '2026-11-07_03h00', '2026-11-08_21h30']), g3);
    const gT = [...aGarder(jours, { garderQuotidien: 3, garderHebdo: 8, garderMensuel: 12 })].sort();
    const semG = new Set(gT.map(semaineIso)), moisG = new Set(gT.map((n) => n.slice(0, 7)));
    check('3 quotidiennes + 8 hebdomadaires + 12 mensuelles : ' + gT.length + ' gardées (3 derniers jours, dernière de chaque semaine, dernière de chaque mois)', ['2026-11-06_03h00', '2026-11-07_03h00', '2026-11-08_03h00'].every((n) => gT.includes(n)) && semG.size >= 8 && moisG.size === 4 && gT.length <= 23 && gT.includes('2026-08-31_03h00') && gT.includes('2026-11-01_03h00'), gT);
    check('semaines lundi → dimanche (ISO), changement d\'année compris', semaineIso('2026-01-04_03h00') === '2026-S01' && semaineIso('2026-01-05_03h00') === '2026-S02' && semaineIso('2024-12-30_03h00') === '2025-S01' && semaineIso('2021-01-03_03h00') === '2020-S53', [semaineIso('2026-01-04_03h00'), semaineIso('2024-12-30_03h00')]);
    const DESTJ = path.join(T, 'destJ');
    const CFG_J = ecrireCfg('cfgJ.json', { projet: PA, bucket: BA, destination: DESTJ, garderQuotidien: 3, garderHebdo: 0, garderMensuel: 0 });
    for (const n of ['2026-03-01_03h00', '2026-03-02_03h00', '2026-03-03_03h00', '2026-03-03_20h00', '2026-03-04_03h00']) { r = sauv(CFG_J, n); if (r.status !== 0) break; }
    const resteJ = C.instantanesComplets(DESTJ);
    check('5 sauvegardes sur 4 jours, réglage « 3 jours » : il reste la dernière de chacun des 3 derniers jours (' + resteJ.join(', ') + ')', r.status === 0 && JSON.stringify(resteJ) === JSON.stringify(['2026-03-02_03h00', '2026-03-03_20h00', '2026-03-04_03h00']), { resteJ, sortie: sortie(r).slice(-600) });
    r = lancer('verifier.js', ['--toutes', '--complet', '--config', CFG_J]);
    check('les 3 sauvegardes gardées sont complètes et vérifiées (images partagées comprises)', r.status === 0 && (sortie(r).match(/^OK /gm) || []).length === 3, sortie(r));
    r = sauv(CFG_J, '2026-03-04_03h20', ['--si-en-retard']);
    check('--si-en-retard juste après une sauvegarde : rien à faire (seuil 20 h)', r.status === 0 && /rien à faire/.test(sortie(r)) && /seuil 20 h/.test(sortie(r)) && !C.instantanesComplets(DESTJ).includes('2026-03-04_03h20'), sortie(r));
    r = sauv(ecrireCfg('cfgJ2.json', { projet: PA, bucket: BA, destination: DESTJ, garderQuotidien: 3, garderHebdo: 0, garderMensuel: 0, seuilRetardHeures: 0.0001 }), '2026-03-05_03h00', ['--si-en-retard']);
    const resteJ2 = C.instantanesComplets(DESTJ);
    check('--si-en-retard quand la dernière est plus vieille que le seuil : sauvegarde faite, rotation à 3 jours (' + resteJ2.join(', ') + ')', r.status === 0 && JSON.stringify(resteJ2) === JSON.stringify(['2026-03-03_20h00', '2026-03-04_03h00', '2026-03-05_03h00']), { resteJ2, sortie: sortie(r).slice(-500) });
    /* (lu directement : un fichier de réglages illisible pose l'alerte sur le vrai Bureau, à éviter dans un test) */
    let errCfg = ''; try { C.lireConfig(ecrireCfg('cfgJ0.json', { projet: PA, bucket: BA, destination: DESTJ, garderQuotidien: 0, garderHebdo: 0, garderMensuel: 0 })); } catch (e) { errCfg = e.message; }
    let errCfg2 = ''; try { C.lireConfig(ecrireCfg('cfgJ1.json', { projet: PA, bucket: BA, destination: DESTJ, garderQuotidien: -1 })); } catch (e) { errCfg2 = e.message; }
    check('réglages absurdes (tout à 0, nombre négatif) : refusés à la lecture, avant toute sauvegarde ou rotation', /tous à 0/.test(errCfg) && /entier ≥ 0/.test(errCfg2) && C.instantanesComplets(DESTJ).length === 3, { errCfg, errCfg2 });

    /* ---------- 6. garde-fous ---------- */
    console.log('\n6. Garde-fous');
    check('lecture des fichiers NDJSON : aucun module n\'utilise « readline » (il couperait aussi sur U+2028 et U+2029)', ['lib/commun.js', 'lib/restauration.js', 'verifier.js', 'extraire.js', 'sauvegarder.js'].every((f) => !/require\((['"])readline\1\)/.test(fs.readFileSync(path.join(OUTIL, f), 'utf8'))));
    const etranger = path.join(T, 'dossier-perso'); fs.mkdirSync(etranger); fs.writeFileSync(path.join(etranger, 'important.docx'), 'x');
    r = sauv(ecrireCfg('cfgE.json', { projet: PA, bucket: BA, destination: etranger }), '2026-02-01_04h00');
    check('destination contenant d\'autres fichiers : refusée, rien touché, alerte posée', r.status === 1 && /contient déjà d'autres fichiers/.test(sortie(r)) && fs.readdirSync(etranger).length === 1 && fs.existsSync(path.join(ALERTE, 'SAUVEGARDE P1PLANNER EN ECHEC.txt')), sortie(r).slice(-300));
    fs.unlinkSync(path.join(ALERTE, 'SAUVEGARDE P1PLANNER EN ECHEC.txt'));
    const dansDepot = path.join(C.REPO, 'sauvegardes-refusees');
    r = sauv(ecrireCfg('cfgS.json', { projet: PA, bucket: BA, destination: dansDepot }), '2026-02-01_04h01');
    check('destination dans le dépôt P1Planner : refusée, rien créé', r.status === 1 && /dépôt P1Planner/.test(sortie(r)) && !fs.existsSync(dansDepot), sortie(r).slice(-300));
    r = sauv(ecrireCfg('cfgS2.json', { projet: PA, bucket: BA, destination: path.dirname(C.REPO) }), '2026-02-01_04h01');
    check('destination qui CONTIENT le dépôt (dossier parent) : refusée', r.status === 1 && /dépôt P1Planner/.test(sortie(r)), sortie(r).slice(-300));
    const autreOutil = path.join(T, 'dossier-autre-outil'); fs.mkdirSync(autreOutil); fs.writeFileSync(path.join(autreOutil, '.autre-projet-sauvegarde'), JSON.stringify({ projet: 'autre-projet' }));
    r = sauv(ecrireCfg('cfgAO.json', { projet: PA, bucket: BA, destination: autreOutil }), '2026-02-01_04h01');
    check('destination d\'un autre outil de sauvegarde (autre marqueur) : refusée, rien ajouté', r.status === 1 && /autre outil de sauvegarde/.test(sortie(r)) && fs.readdirSync(autreOutil).join() === '.autre-projet-sauvegarde', sortie(r).slice(-300));
    fs.unlinkSync(path.join(ALERTE, 'SAUVEGARDE P1PLANNER EN ECHEC.txt'));
    r = sauv(ecrireCfg('cfgX.json', { projet: 'demo-autre', bucket: BA, destination: DEST }), '2026-02-01_04h02');
    check('destination d\'un autre projet : refusée', r.status === 1 && /projet « demo-p1sauv »/.test(sortie(r)), sortie(r).slice(-300));
    const cleFactice = path.join(OUTIL, 'tests', 'cle-factice-test.json'); fs.writeFileSync(cleFactice, JSON.stringify({ project_id: PA }));
    r = sauv(ecrireCfg('cfgK.json', { projet: PA, bucket: BA, destination: path.join(T, 'destK'), emulateur: null, cle: cleFactice }), '2026-02-01_04h03');
    fs.unlinkSync(cleFactice);
    if (C.estDansOneDrive(OUTIL)) check('clé rangée dans OneDrive : refusée avant toute connexion', r.status === 1 && /dans OneDrive/.test(sortie(r)), sortie(r).slice(-300));
    else console.log('   (dépôt hors OneDrive : contrôle « clé dans OneDrive » ignoré)');
    const fausseCle = (nom, o) => { const f = path.join(T, nom); fs.writeFileSync(f, JSON.stringify(Object.assign({ type: 'service_account', project_id: 'p1planner', client_email: 'sauvegarde-locale@p1planner.iam.gserviceaccount.com', private_key: 'x' }, o))); return f; };
    const prod = (nom, o, cle) => sauv(ecrireCfg(nom + '.json', Object.assign({ projet: 'p1planner', bucket: 'p1planner.firebasestorage.app', destination: path.join(T, 'dest' + nom), emulateur: null, cle }, o)), '2026-02-01_04h10');
    r = prod('cfgG1', { projet: PA, bucket: BA }, fausseCle('cle1.json'));
    check('connexion réelle avec un autre projet que « p1planner » : refusée avant toute connexion', r.status === 1 && /n'est pas « p1planner »/.test(sortie(r)), sortie(r).slice(-300));
    r = prod('cfgG2', { bucket: 'autre.firebasestorage.app' }, fausseCle('cle2.json'));
    check('connexion réelle avec un autre bucket : refusée', r.status === 1 && /bucket/.test(sortie(r)) && /p1planner\.firebasestorage\.app/.test(sortie(r)), sortie(r).slice(-300));
    r = prod('cfgG3', {}, fausseCle('cle3.json', { project_id: 'autre-projet' }));
    check('clé d\'un autre projet : refusée', r.status === 1 && /appartient au projet « autre-projet »/.test(sortie(r)), sortie(r).slice(-300));
    r = prod('cfgG4', {}, fausseCle('cle4.json', { client_email: 'firebase-adminsdk-abc12@p1planner.iam.gserviceaccount.com' }));
    check('clé d\'un autre compte (par exemple administrateur) : refusée', r.status === 1 && /Clé refusée/.test(sortie(r)) && /sauvegarde-locale@p1planner/.test(sortie(r)), sortie(r).slice(-300));
    r = prod('cfgG5', {}, fausseCle('cle5.json', { client_email: 'restauration@p1planner.iam.gserviceaccount.com' }));
    check('la clé de restauration (écriture) ne peut pas servir à la sauvegarde : refusée', r.status === 1 && /Clé refusée/.test(sortie(r)), sortie(r).slice(-300));
    for (const f of fs.readdirSync(ALERTE)) fs.unlinkSync(path.join(ALERTE, f));
    check('aucune sauvegarde créée par ces tentatives', ['cfgG1', 'cfgG2', 'cfgG3', 'cfgG4', 'cfgG5'].every((n) => !fs.existsSync(path.join(T, 'dest' + n)) || C.instantanesComplets(path.join(T, 'dest' + n)).length === 0));
    const SDER = path.join(DEST, C.instantanesComplets(DEST).pop());
    r = lancer('restaurer.js', [SDER, '--production', '--tout']);
    check('restauration production sans clé d\'écriture explicite : refusée', r.status === 1 && /cle-ecriture/.test(sortie(r)), sortie(r));
    r = lancer('restaurer.js', [SDER, '--production', '--cle-ecriture', fausseCle('cle6.json', { client_email: 'restauration@p1planner.iam.gserviceaccount.com' }), '--uid', 'u01', '--config', ecrireCfg('cfgG6.json', { projet: 'p1planner', bucket: 'p1planner.firebasestorage.app', destination: DEST, emulateur: null })]);
    check('restauration en production d\'une sauvegarde venue d\'un autre projet : refusée', r.status === 1 && /La sauvegarde vient du projet demo-p1sauv/.test(sortie(r)), sortie(r));
    r = lancer('restaurer.js', [SDER, '--production']);
    check('restauration production sans sélection : refusée', r.status === 1 && /précisez --uid/.test(sortie(r)), sortie(r));
    try { fs.unlinkSync(path.join(ALERTE, 'SAUVEGARDE P1PLANNER EN ECHEC.txt')); } catch (e) {}

    /* ---------- 7. restauration complète vers un autre projet + comparaison exacte ---------- */
    console.log('\n7. Restauration complète vers un projet vierge, puis re-sauvegarde et comparaison');
    const SN = path.join(DEST, '2026-02-01_03h00');
    r = lancer('restaurer.js', [SN, '--emulateur', FS, AU, ST, '--projet', PB, '--bucket', BB]);
    check('aperçu : rien écrit', r.status === 0 && /Aperçu seulement/.test(sortie(r)) && (await B.db.listCollections()).length === 0, sortie(r).slice(-400));
    r = lancer('restaurer.js', [SN, '--emulateur', FS, AU, ST, '--projet', PB, '--bucket', BB, '--appliquer']);
    check('restauration appliquée', r.status === 0, sortie(r).slice(-800));
    r = sauv(CFG_B, '2026-02-01_05h00');
    const SB = path.join(T, 'destB', '2026-02-01_05h00');
    const exA = await lireExport(SN), exB = await lireExport(SB);
    const dA = [...exA.keys()].filter((p) => exB.get(p) !== exA.get(p)); const dB = [...exB.keys()].filter((p) => !exA.has(p));
    check('Firestore restauré identique : ' + exB.size + '/' + exA.size + ' documents, contenus égaux', r.status === 0 && !dA.length && !dB.length, { dA: dA.slice(0, 5), dB: dB.slice(0, 5) });
    const lst = async (dir) => { const m = new Map(); for await (const e of C.lireNdjson(path.join(dir, 'stockage.ndjson.gz'))) m.set(e.nom, e); return m; };
    const sA = await lst(SN), sB = await lst(SB); let sOk = 0;
    for (const [n, e] of sA) { const f = sB.get(n); if (f && f.md5 === e.md5 && f.octets === e.octets && f.type === e.type && f.cacheControl === e.cacheControl && f.metadonnees && f.metadonnees.firebaseStorageDownloadTokens === e.metadonnees.firebaseStorageDownloadTokens) sOk++; }
    check('Storage restauré : ' + sOk + '/' + sA.size + ' fichiers identiques avec type, cache et jeton de lien d\'origine (les liens dans les notes restent valides)', sOk === sA.size && sB.size === sA.size, { sOk, a: sA.size, b: sB.size });
    const uA = new Map(), uB = new Map();
    for await (const u of C.lireNdjson(path.join(SN, 'auth', 'utilisateurs.ndjson.gz'))) uA.set(u.uid, u);
    for await (const u of C.lireNdjson(path.join(SB, 'auth', 'utilisateurs.ndjson.gz'))) uB.set(u.uid, u);
    const uKo = [...uA.values()].filter((u) => { const v = uB.get(u.uid); return !v || v.email !== u.email || v.disabled !== u.disabled || v.emailVerified !== u.emailVerified || v.displayName !== u.displayName || JSON.stringify(v.customClaims || null) !== JSON.stringify(u.customClaims || null); });
    check('comptes restaurés (émulateur) : ' + uB.size + '/' + uA.size + ' identiques (e-mail, vérifié, désactivé, nom, droits)', !uKo.length && uB.size === uA.size, uKo.map((u) => u.uid));

    /* ---------- 8. restauration partielle d'un utilisateur ---------- */
    console.log('\n8. Restauration d\'un seul utilisateur (cas réel « j\'ai perdu mes notes »)');
    await B.db.doc('users/u03/notes/n0').delete(); await B.db.doc('users/u03/notes/n1').update({ html: 'modifiée depuis' });
    await B.db.doc('users/u04/notes/n0').delete();
    const imgU03 = [...sA.keys()].find((n) => n.startsWith('users/u03/notesImages/'));
    await B.app.storage().bucket(BB).file(imgU03).delete();
    r = lancer('restaurer.js', [SN, '--emulateur', FS, AU, ST, '--projet', PB, '--bucket', BB, '--uid', 'u03', '--sans-auth']);
    check('aperçu --uid u03 : 1 absent, 1 différent signalés, rien écrit', r.status === 0 && /1 absents de la cible/.test(sortie(r)) && /1 différents/.test(sortie(r)) && !(await B.db.doc('users/u03/notes/n0').get()).exists, sortie(r));
    r = lancer('restaurer.js', [SN, '--emulateur', FS, AU, ST, '--projet', PB, '--bucket', BB, '--uid', 'u03', '--sans-auth', '--appliquer']);
    const n0 = await B.db.doc('users/u03/notes/n0').get(), n1 = await B.db.doc('users/u03/notes/n1').get();
    const [imgOk] = await B.app.storage().bucket(BB).file(imgU03).exists();
    check('--appliquer : note supprimée recréée, note modifiée CONSERVÉE, image remise, autre utilisateur non touché', r.status === 0 && n0.exists && n1.data().html === 'modifiée depuis' && imgOk && !(await B.db.doc('users/u04/notes/n0').get()).exists, sortie(r));
    r = lancer('restaurer.js', [SN, '--emulateur', FS, AU, ST, '--projet', PB, '--bucket', BB, '--uid', 'u03', '--sans-auth', '--sans-images', '--appliquer', '--ecraser']);
    check('--ecraser : la note modifiée reprend sa version sauvegardée', r.status === 0 && (await B.db.doc('users/u03/notes/n1').get()).data().html !== 'modifiée depuis', sortie(r));
    const [md] = await B.app.storage().bucket(BB).file(imgU03).getMetadata();
    check('image remise avec son jeton de lien d\'origine', md.metadata && md.metadata.firebaseStorageDownloadTokens === sA.get(imgU03).metadonnees.firebaseStorageDownloadTokens, md.metadata);

    /* ---------- 9. extraction lisible ---------- */
    console.log('\n9. Extraction lisible d\'un utilisateur');
    const X = path.join(T, 'extraction');
    r = lancer('extraire.js', [SN, '--uid', 'u01', '--sortie', X, '--avec-fichiers']);
    const xj = JSON.parse(fs.readFileSync(path.join(X, 'donnees.json'), 'utf8'));
    const ps = Object.keys(xj.documents);
    check('extraction u01 : ' + ps.length + ' documents (fiche, notes, cahiers, profondeur 6, planning), compte sans empreinte de mot de passe, ' + xj.fichiersStorage.length + ' fichiers copiés', r.status === 0 && ps.includes('users/u01') && ps.includes('userStats/u01') && ps.includes('entitlements/u01') && ps.includes('billingPrivate/u01') && ps.includes('referralCodes/CODE-u01') && ps.includes('feedbacks/f_u01') && ps.includes('users/u01/errorEntries/e0/historique/h0/details/d0/encore/x0') && !ps.some((p) => p.includes('u02')) && xj.compte && xj.compte.uid === 'u01' && !('passwordHash' in xj.compte) && xj.fichiersStorage.length > 0 && fs.existsSync(path.join(X, 'fichiers')), sortie(r));
    check('dates lisibles (ISO) dans l\'extraction', /^\d{4}-\d\d-\d\dT/.test(xj.documents['users/u01'].cree), xj.documents['users/u01']);

    /* ---------- 9 bis. recherche d'un texte ---------- */
    console.log('\n9 bis. Recherche d\'un texte dans les sauvegardes (lecture seule)');
    const avantRech = JSON.stringify(C.listerFichiers(DEST).sort());
    r = lancer('rechercher.js', ['--texte', 'p1-skl', '--toutes', '--config', CFG_A]);
    check('recherche : le document touché est trouvé, avec la dernière sauvegarde qui contient encore la vraie note ; les autres documents ne sont pas cités', r.status === 0 && /1 document\(s\) concerné\(s\)/.test(sortie(r)) && /users\/u03\/notesEntrainements\/trX/.test(sortie(r)) && /dernière = 2026-01-25_03h10/.test(sortie(r)) && !/users\/u04\//.test(sortie(r)), sortie(r).slice(-900));
    r = lancer('rechercher.js', ['--texte', 'p1-skl', '--chemin', 'users/u04', '--config', CFG_A]);
    check('recherche limitée à un chemin sans document concerné : « Aucun document »', r.status === 0 && /Aucun document concerné/.test(sortie(r)), sortie(r));
    r = lancer('rechercher.js', ['--config', CFG_A]);
    check('recherche sans texte : refusée', r.status === 1 && /--texte/.test(sortie(r)), sortie(r));
    check('la recherche n\'a rien écrit dans la destination', JSON.stringify(C.listerFichiers(DEST).sort()) === avantRech);

    /* ---------- 10. estimation ---------- */
    console.log('\n10. Estimation');
    r = lancer('sauvegarder.js', ['--config', CFG_A, '--estimer']);
    check('--estimer fonctionne et n\'écrit rien', r.status === 0 && /Place estimée/.test(sortie(r)) && C.instantanesComplets(DEST).length === 3, sortie(r).slice(-900));
    console.log(sortie(r).split('\n').slice(-6).join('\n'));

    /* ---------- 11. assistant guidé : un utilisateur ---------- */
    console.log('\n11. Assistant guidé : un utilisateur (compte supprimé, notes et image perdues), puis annulation');
    const assistant = (entree) => spawnSync(process.execPath, [path.join(OUTIL, 'assistant-restauration.js'), '--config', CFG_A, '--emulateur', FS, AU, ST, '--projet', PB, '--bucket', BB, '--sortie-extraction', T], { input: entree, encoding: 'utf8', timeout: 600000 });
    const existe = async (p) => (await B.db.doc(p).get()).exists;
    await B.app.auth().deleteUser('u05');
    await B.db.doc('users/u05/notes/n2').delete(); await B.db.doc('users/u05/notes/n4').delete();
    await B.db.doc('users/u05/notes/n3').update({ html: 'modifiée par l\'utilisateur' });
    await B.db.doc('entitlements/u05').delete(); await B.db.doc('referralCodes/CODE-u05').delete(); await B.db.doc('feedbacks/f_u05').delete();
    const imgU05 = [...sA.keys()].find((x) => x.startsWith('users/u05/notesImages/'));
    await B.app.storage().bucket(BB).file(imgU05).delete();
    r = assistant('1\n\nu5@exemple.fr\n0\n');
    check('analyse : manques et changements annoncés, choix « ne rien faire » → rien écrit', r.status === 0 && /\b5 élément\(s\) manquent/.test(sortie(r)) && /droits Premium et la facturation/.test(sortie(r)) && /\b1 élément\(s\) ont changé/.test(sortie(r)) && /sera recréé/.test(sortie(r)) && !(await existe('users/u05/notes/n2')), sortie(r).slice(-1500));
    r = assistant('1\n\nu5@exemple.fr\n1\nnon\n');
    check('confirmation mal tapée → abandon, rien écrit', r.status === 0 && /Abandon/.test(sortie(r)) && !(await existe('users/u05/notes/n2')), sortie(r).slice(-600));
    r = assistant('1\n\nu05\n1\nRESTAURER\n');
    const [imgOk5] = await B.app.storage().bucket(BB).file(imgU05).exists();
    let compte5 = null; try { compte5 = await B.app.auth().getUser('u05'); } catch (e) {}
    check('restauration : notes remises, note modifiée CONSERVÉE, image remise, compte recréé (même UID, même e-mail), autre utilisateur non touché', r.status === 0 && (await existe('users/u05/notes/n2')) && (await existe('users/u05/notes/n4')) && (await B.db.doc('users/u05/notes/n3').get()).data().html === 'modifiée par l\'utilisateur' && imgOk5 && compte5 && compte5.email === 'u5@exemple.fr' && !(await existe('users/u04/notes/n0')), sortie(r).slice(-1500));
    const n2 = (await B.db.doc('users/u05/notes/n2').get()).data();
    check('restauration par UID : droits Premium, code de parrainage et retour de l\'utilisateur remis (champ propriétaire) ; textes avec U+2028 / U+2029 intacts', (await existe('entitlements/u05')) && (await existe('referralCodes/CODE-u05')) && (await existe('feedbacks/f_u05')) && n2.html.includes('\u2028') && n2.html.includes('\u2029') && !(await existe('referralCodes/CODE-u04x')), n2);
    const ops = require('../lib/restauration').listerOperations(DEST);
    const fJournal = path.join(ops[0].dossier, 'documents.ndjson'); const lignesJ = [];
    for await (const l of C.lignesFlux(fs.createReadStream(fJournal))) lignesJ.push(JSON.parse(l));
    let lignesRl = 0; for await (const l of require('readline').createInterface({ input: fs.createReadStream(fJournal), crlfDelay: Infinity })) if (l.trim()) lignesRl++;
    check('journal de restauration relu sans coupure sur U+2028 / U+2029 : ' + lignesJ.length + ' lignes valides, séparateurs bien présents dans le fichier (information : un lecteur par ligne en verrait ' + lignesRl + ')', lignesJ.length >= 5 && lignesJ.every((x) => typeof x.p === 'string') && fs.readFileSync(fJournal, 'utf8').includes('\u2028'), { lignes: lignesJ.length, lignesRl });
    check('opération consignée (rapport + état d\'avant)', ops.length && ops[0].statut === 'terminée' && fs.existsSync(path.join(ops[0].dossier, 'RAPPORT.txt')) && fs.existsSync(path.join(ops[0].dossier, 'documents.ndjson')), ops[0]);
    await B.db.doc('users/u05/notes/n4').update({ html: 'retouchée après restauration' });
    r = assistant('4\n1\nANNULER\n');
    const [imgApres] = await B.app.storage().bucket(BB).file(imgU05).exists();
    check('annulation : retour à l\'état d\'avant (note n2 et image retirées), la note retouchée depuis est GARDÉE', r.status === 0 && !(await existe('users/u05/notes/n2')) && (await B.db.doc('users/u05/notes/n4').get()).data().html === 'retouchée après restauration' && !imgApres && /modifié\(s\) depuis/.test(sortie(r)), sortie(r).slice(-1200));
    r = assistant('3\n\nu1@exemple.fr\n');
    const dossX = fs.readdirSync(T).find((x) => x.startsWith('P1Planner - u1@exemple.fr'));
    check('consultation (menu 3) : copie lisible créée, rien en ligne', r.status === 0 && dossX && fs.existsSync(path.join(T, dossX, 'donnees.json')), sortie(r).slice(-600));

    /* ---------- 12. assistant guidé : tout restaurer ---------- */
    console.log('\n12. Assistant guidé : tout restaurer après une perte massive');
    await B.db.doc('bulk/d00007').delete(); await B.db.doc('users/u10').delete(); await B.db.doc('userStats/u11').delete();
    for (let k = 0; k < 120; k++) await B.db.doc('users/u00/flashcards/c' + String(k).padStart(3, '0')).delete();
    await B.app.auth().deleteUser('u12');
    await B.app.storage().bucket(BB).file('communs/partage.png').delete();
    r = assistant('2\n\n1\nTOUT RESTAURER\n');
    let compte12 = null; try { compte12 = await B.app.auth().getUser('u12'); } catch (e) {}
    const [partage] = await B.app.storage().bucket(BB).file('communs/partage.png').exists();
    check('tout restauré : documents, 120 cartes, compte, image partagée ; ce qui avait changé est conservé', r.status === 0 && (await existe('bulk/d00007')) && (await existe('users/u10')) && (await existe('userStats/u11')) && (await existe('users/u00/flashcards/c119')) && (await existe('users/u04/notes/n0')) && compte12 && partage && (await B.db.doc('users/u05/notes/n4').get()).data().html === 'retouchée après restauration', sortie(r).slice(-1500));
    r = assistant('2\n\n0\n');
    check('nouvelle analyse : plus rien ne manque', r.status === 0 && /\b0 élément\(s\) manquent/.test(sortie(r)) && /\b0 manquant/.test(sortie(r)), sortie(r).slice(-1200));

    /* ---------- 13. comptes avec mot de passe ---------- */
    console.log('\n13. Recréation d\'un compte avec son empreinte de mot de passe');
    const RR = require('../lib/restauration');
    const h = { algorithm: 'SCRYPT', signerKey: Buffer.alloc(64, 7).toString('base64'), saltSeparator: 'Bw==', rounds: 8, memoryCost: 14 };
    const rec = RR.versImport({ uid: 'hx1', email: 'hx1@exemple.fr', passwordHash: Buffer.alloc(64, 3).toString('base64url'), passwordSalt: Buffer.from('sel').toString('base64'), providerData: [{ providerId: 'password', uid: 'hx1@exemple.fr' }], metadata: { creationTime: new Date().toUTCString() } }, h);
    const resImp = await B.app.auth().importUsers([rec], RR.optionsHachage(h));
    const masque = RR.versImport({ uid: 'hx2', passwordHash: 'UkVEQUNURUQ=' }, h);
    check('import avec paramètres SCRYPT accepté ; empreinte masquée par Google ignorée (compte sans mot de passe)', resImp.successCount === 1 && Buffer.isBuffer(rec.passwordHash) && !('passwordHash' in masque), resImp.errors);
  } catch (e) { check('EXCEPTION ' + (e && e.stack || e), false, ''); }
  const ok = res.filter(Boolean).length;
  console.log('\n' + (ok === res.length ? 'TOUT EST VERT' : 'ÉCHECS') + ' — ' + ok + '/' + res.length + ' vérifications');
  process.exit(ok === res.length ? 0 : 1);
})();
