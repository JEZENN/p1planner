# P1Planner — TODO

## 0. Démarrage
- [ ] Extraire le starter pack à la racine P1Planner
- [ ] Sélectionner le dossier racine dans Claude
- [ ] Placer localement les références TypixClin utiles dans `reference-typixclin/`
- [ ] Lancer `docs/FIRST_PROMPT.md`

## 1. Audit / Architecture
- [x] Audit A/B/C/D (4 audits parallèles des références TypixClin — voir docs/ARCHITECTURE.md)
- [x] Architecture Firebase (proposition)
- [x] Schéma Firestore (proposition — 1 cours = 1 document, note générique unique)
- [x] Architecture Stripe (paiement unique N mois V1, lock anti-double Checkout repris de TypixClin)
- [x] Tours / J (relation recommandée : option 3, J pilote le rythme)
- [x] Programme de la journée (spécifié)
- [x] Planning (types/états proposés)
- [x] Risques P0/P1/P2 (17 risques listés dans docs/ARCHITECTURE.md)
- [x] **Validation humaine des décisions ouvertes** — toutes tranchées par l'utilisateur, voir `docs/DECISIONS.md` :
  - [x] Seuils de prix : 1 mois → 2,50 €/mois, 2-4 mois → 2,25 €/mois, 5+ mois → 2,00 €/mois
  - [x] Paiement unique **et** abonnement récurrent (2,50 €/mois, annulable à tout moment) coexistent dès la V1
  - [x] Presets J au feeling (rapproché/équilibré/espacé), ajustables selon usage réel
  - [x] Relation Tours/J : J optionnel (mode `j`/`libre`), Tours toujours saisis
  - [x] Pas de marge post-concours : accès max = fin du mois du concours indiqué
  - [x] Planning V1 : 5 types (Cours, Révision, Repos, Vacances, Examen)
  - [x] Contenu créateur vérifié (3ème P1 major UE2/UE3, 275e/~10500 EDN, interne anesthésie-réa Paris)
- [x] `firestore.rules` + `storage.rules` écrites (isolation uid, `entitlements`/`billingPrivate`/`userStats`/`achievements` jamais écrits par le client, soft-delete uniquement) — **22 tests Emulator réels, tous verts** (`test/firestore.rules.test.mjs`, incluant matrice A/B explicite et test de concurrence sur la validation de Tours)
- [x] **Vrai projet Firebase P1Planner connecté** (config trouvée dans `CLAUDE.md`, projectId `p1planner` vérifié explicitement dans le code avant toute utilisation) — `auth.html`, `comptepremium.html`, `tableur.html` utilisent la vraie config, plus de `REPLACE_ME`
- [x] Bootstrap utilisateur (`functions/index.js`, `onUserCreated`) — **3 tests Emulator réels, tous verts** (`test/bootstrap.test.mjs`) : création `users`/`entitlements`/`billingPrivate`/`userStats`, essai 30 jours exact, fonctionne sans displayName, idempotence prouvée
- [ ] Spécifier et implémenter `createCheckoutSession`/`createCustomerPortalSession`/`stripeWebhook` (reporté volontairement — voir mission "pas Stripe maintenant sauf besoin bloquant")
- [ ] Créer le vrai projet Stripe P1Planner (Price IDs, webhook signé)

## 2. Index
- [x] Implémentation (`public/index.html` — HTML/CSS/JS monolithique, identité P1Planner, démo animée des 4 piliers, tableur mockup, planning, stats/trophées, Premium indicatif, créateur, FAQ)
- [x] QA via Browser tool : responsive mobile/desktop, console propre, hiérarchie de titres, bug de reveal-on-scroll trouvé et corrigé (filet de sécurité `getBoundingClientRect`)
- [ ] 3 passes visuelles supplémentaires (design/contenu) avant validation finale
- [ ] Relecture Product Management / UI UX Pro Max sur le contenu final
- [x] **SEO — demande explicite utilisateur : "ressortir en premier" sur "méthode des J", "méthode
  des tours", "tableur P1", "organisation P1".** Fichiers créés/modifiés :
  - **`public/robots.txt` (nouveau)** : `Allow: /` général + blocs dédiés pour les crawlers
    IA/moteurs de réponse (GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-User,
    Claude-SearchBot, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended,
    Applebot-Extended, CCBot, Amazonbot, Bytespider, Meta-ExternalAgent) — objectif explicite de
    l'utilisateur ("notices IA"), rien n'est interdit (aucune donnée privée servie par le hosting
    statique, tout passe par Firebase Auth/Firestore). Référence `Sitemap:`.
  - **`public/sitemap.xml` (nouveau)** : `/` (1.0), `/tableur.html` (0.8, sa présentation publique
    hors connexion sert de page de renvoi secondaire), `/mentions-legales.html` (0.2).
    `/auth.html` et `/comptepremium.html` volontairement EXCLUES — déjà `noindex` en méta (vérifié
    avant d'écrire le sitemap : lister une URL noindex dedans est un signal contradictoire) ;
    `/comptepremium.html` s'est avéré être une page de GESTION DE COMPTE privée (pas une page de
    tarifs publique comme le nom aurait pu le laisser penser — vérifié en lisant son `<head>`
    avant de l'inclure à tort).
  - **`public/llms.txt` (nouveau, l'équivalent "notice IA" de robots.txt)** : résumé Markdown du
    produit pour les outils IA (ChatGPT, Claude, Perplexity...), avec une section "Concepts clés"
    définissant explicitement Méthode des tours / Méthode des J / Tableur P1 / Organisation P1 —
    les 4 expressions ciblées par l'utilisateur, chacune avec sa propre définition autonome
    (pensé pour être cité/repris tel quel par un moteur de réponse IA).
  - **`public/index.html`** : `<title>`/meta description/`og:title`/`og:description` réécrits pour
    intégrer explicitement "Tableur P1" et "Méthode des tours" (déjà présent : "Méthode des J")
    sans dupliquer le titre de `tableur.html` (évite la cannibalisation de mots-clés entre les deux
    pages — positionnement différent : index = pitch produit, tableur.html = l'outil). Pilier
    "Tours" renommé "Méthode des tours" (cohérent avec la terminologie déjà utilisée dans
    `docs/ARCHITECTURE.md`/`docs/P1PLANNER_SPEC.md`, jamais inventée). "Tableur P1"/"organisation
    P1" intégrés naturellement au texte du hero et du chapô "Comment ça marche". 2 nouvelles
    questions FAQ ajoutées (répondent explicitement à "Qu'est-ce que la méthode des tours ?" et
    "Comment organiser son année de P1 avec P1Planner ?", contenu réel, pas juste des mots-clés
    posés là) + 4 blocs JSON-LD ajoutés (`WebSite`, `Organization`, `SoftwareApplication`,
    `FAQPage` — ce dernier reprenant mot pour mot les 8 questions/réponses visibles de la FAQ,
    jamais de contenu structuré divergent du contenu affiché).
  - **`public/tableur.html`** : title/meta description/og/twitter alignés sur le même thème
    ("Tableur de révision P1 — Méthode des tours & Méthode des J | P1Planner", distinct du titre
    d'index.html). JSON-LD `SoftwareApplication` existant enrichi (`alternateName: "Tableur P1"`,
    "Méthode des tours" citée explicitement dans `description`/`featureList`, plus "organisation
    de la P1"). La question FAQ "Comment fonctionnent les tours de révision ?" (HTML visible +
    JSON-LD `FAQPage`, corrigés ensemble) reformulée en "Qu'est-ce que la méthode des tours ?" —
    cible directement la requête au lieu d'une reformulation implicite.
  - **`public/mentions-legales.html`** : `<link rel="canonical">` ajouté (manquant).
  - Vérifié : les 4 blocs JSON-LD d'index.html et les 3 de tableur.html validés séparément par
    `JSON.parse()` (0 erreur) ; rendu vérifié en navigateur (`document.title`, nouvelles questions
    FAQ retrouvées dans le DOM rendu, pilier "Méthode des tours" affiché) ; `sitemap.xml` vérifié
    bien formé (balises `<url>` équilibrées). Aucune régression de syntaxe sur `tableur.html` (9/9
    faux positifs connus) ; script JS unique d'index.html toujours sans erreur.
  - **Non fait, à évaluer séparément si pertinent** : Google Search Console / Bing Webmaster Tools
    (soumission manuelle du sitemap, suivi du positionnement réel) — hors périmètre d'un simple
    lot de fichiers, nécessite un accès compte externe que je n'ai pas. Contenu de démonstration
    (screenshots produit réels dans `og:image`/Twitter Card) — actuellement aucune image `og:image`
    définie sur aucune des pages publiques, ce qui réduit le taux de clic sur les partages
    sociaux ; à ajouter une fois de vraies captures d'écran désignées comme visuel officiel.
- [x] **Essai gratuit 30 → 15 jours (demande explicite utilisateur)** : `functions/index.js`
  (`TRIAL_DAYS`, source de vérité serveur réelle utilisée par `onUserCreated`), tous les textes
  marketing (`index.html`, `tableur.html`, `auth.html`, `comptepremium.html`,
  `mentions-legales.html`, `llms.txt`) et la doc vivante (`CLAUDE.md`, `docs/ARCHITECTURE.md`,
  `docs/DECISIONS.md`, `docs/P1PLANNER_SPEC.md`, `docs/QA.md`) mis à jour en cohérence. Volontairement
  NON modifiés : `docs/FIRST_PROMPT.md` et `docs/TODO.md` (entrées historiques, pas la spec vivante).
  **⚠️ Non déployé** : `firebase deploy --only functions` requiert un GO explicite (règle
  `CLAUDE.md`), pas encore demandé — tant que ce n'est pas fait, les nouveaux comptes reçoivent
  encore 30 jours en production malgré le texte affiché.
- [x] **Contenu démo mock corrigé (mismatch EDN/Cardiologie → thème P1/Biochimie)** : mockup
  hero (`tableur.html — Cardiologie` → `— Biochimie`, 4 lignes de cours renommées : Glycolyse,
  Cycle de Krebs, Structure de l'ADN, Réplication de l'ADN), carte démo "Aujourd'hui" (mêmes
  noms de cours, "Entraînement — QCM Cardiologie" → "— QCM Biochimie"), script du stepper
  (`steps[].body`, référence "collège" retirée car spécifique EDN). Corrigé au passage : bouton
  "Faire maintenant" → "Valider" (terminologie réelle de l'appli, périmée dans le mock). Carte
  outil Flashcards enrichie d'une phrase sur la Session Flash.
- [x] **Touches d'ambiance visuelle (inspiration ponctuelle d'une référence fournie par
  l'utilisateur, pas une reprise du design)** : fond avec 3 halos radiaux discrets en couleurs
  `--primary`/`--primary-2`/`--accent` existantes (masqués <900px et sous `prefers-reduced-motion`),
  barre de progression de scroll sous le header, bouton retour-en-haut. Vérifiés en navigateur
  (capture d'écran, clic testé — scroll fluide vers le haut, barre/bouton apparaissent/disparaissent
  correctement), aucune erreur console, syntaxe JS/JSON-LD revérifiée (0 erreur).
- [x] **Lien TypixClin** cliquable ajouté dans la section dédiée d'index.html — URL fournie par
  l'utilisateur : `https://typixclin.fr/index.html` (`target="_blank" rel="noopener"`).
- [ ] Relecture complète d'index.html contre TOUTES les fonctionnalités construites cette session
  (redesign Révisions J, Session Flash, animations de menu, etc.) — seulement partiellement fait.
- [x] **Barre de défilement personnalisée** (demande explicite utilisateur) sur `index.html`,
  `auth.html`, `comptepremium.html` : `scrollbar-gutter:stable` (évite aussi les décalages de
  layout à l'apparition/disparition de la scrollbar, cf. points ci-dessous) + `::-webkit-scrollbar`
  stylée aux couleurs P1Planner (`--primary`/`--primary-2`) + `scrollbar-color`/`scrollbar-width`
  pour Firefox.
- [x] **Section active soulignée dans le header** (référence visuelle fournie par l'utilisateur) :
  scrollspy via `IntersectionObserver` (`rootMargin:"-45% 0px -50% 0px"`, déclenche autour du
  centre du viewport) sur les 6 sections ciblées par la nav (`#methode`/`#tableur`/`#outils`/
  `#premium`/`#createur`/`#faq`), classe `.is-current` posée sur le lien correspondant dans
  `.nav-desktop` (soulignement dégradé animé) ET `.mobile-nav` (barre verticale + indentation) —
  les deux gabarits gardés synchronisés. Vérifié en navigateur : le lien actif change bien en
  scrollant/en cliquant directement sur un lien de nav.
- [x] **Animation d'ouverture/fermeture des questions FAQ** (absente jusqu'ici — `<details>` natif
  n'anime pas nativement, pas de support baseline pour `interpolate-size`/
  `transition-behavior:allow-discrete` à ce jour) : ouverture/fermeture pilotées en JS
  (`max-height` mesuré via `scrollHeight` + `opacity`, garde l'attribut `open` actif pendant toute
  l'animation de fermeture pour que le contenu reste rendu — sinon `<details>` le masque
  instantanément), chevron piloté par une classe dédiée (`.is-expanded`) plutôt que directement par
  `[open]` pour une réaction immédiate au clic. Respecte `prefers-reduced-motion` (bascule instantanée,
  sans transition). Testé en navigateur : ouverture, fermeture, chevron, aucune erreur console.
- [x] Bouton "Revoir la méthode" du CTA final retiré (jugé inutile, demande explicite) — ne reste
  que "Commencer gratuitement", toujours centré (`.final-actions{justify-content:center}`).
- [x] **Bug réel trouvé et corrigé — démo animée "des 4 piliers" défilait les 7 étapes en rafale**
  (signalé : "passe de point en point sans interruption", pas de vidéo possible mais capture
  fournie). Cause : `startTimer()` ne nettoyait jamais un `setInterval` déjà en cours avant d'en
  créer un nouveau — or elle est appelée directement (pas seulement via `resetTimer()`, qui lui
  nettoie bien) par l'`IntersectionObserver` de la section, `mouseleave` et `focusout`. Chaque
  entrée/sortie de la zone (scroll, focus clavier) empilait donc un intervalle supplémentaire,
  jamais nettoyé, tous incrémentant `currentStep` indépendamment toutes les 4200ms à des instants
  décalés — after suffisamment de scroll devant la démo, ça produisait un défilement rapide et
  continu des étapes. Corrigé en faisant nettoyer systématiquement l'intervalle existant en tête de
  `startTimer()`. **Vérifié par un test de stress reproduisant le scénario exact** : 20 cycles
  enter/leave rapprochés puis mesure des changements d'étape sur 5s — avant le correctif ce test
  aurait produit de nombreux changements rapprochés, après correctif un seul, pile à 4201ms (un
  cycle normal de 4200ms, aucun intervalle fantôme).
- [x] **Transition manquante sur le switch Paiement unique / Abonnement mensuel** (jugée "moche")
  ajoutée : fondu + léger glissement vertical sur le contenu (`#uniqueBlock`/`#recurrentBlock`),
  transition de couleur sur les boutons du sélecteur. Respecte `prefers-reduced-motion` (bascule
  instantanée). Vérifié en navigateur.
- [x] **Soulignement de section active resté figé sur "Méthode" en remontant tout en haut de page**
  (bug réel, pas seulement visuel signalé) : le scrollspy (`IntersectionObserver`) ne traitait que
  les entrées `isIntersecting:true`, jamais `false` — remonter au-dessus de toutes les sections
  suivies ne déclenchait donc plus aucune mise à jour, le lien restait souligné sur la dernière
  section visitée indéfiniment. Corrigé en suivant l'ensemble des sections actuellement dans la
  bande d'observation (`currentlyIntersecting`) plutôt que la seule dernière entrée reçue — la
  liste vide au-dessus de "méthode" retire maintenant bien tout surlignage. Vérifié en navigateur :
  souligné en scrollant dans une section, plus aucun lien souligné en remontant tout en haut.
- [x] Bouton "Connexion" du header (desktop, mobile, footer) renommé "Connexion / Accès au tableur"
  (demande explicite) — vérifié, aucun débordement/retour à la ligne au niveau desktop.
- [x] **Le lien nav "Tableur" ne couvrait qu'une petite intro** — bug réel trouvé en relisant la
  structure : `<section id="tableur">` (947) se ferme après sa seule intro (972), et les 4
  sous-sections bien plus substantielles qui suivent ("La méthode des J, à ton rythme", "Ouvrir,
  voir, travailler, valider", "Le planning, semaine après semaine", "Des statistiques...") sont des
  `<section>` SŒURS sans id, donc jamais observées par le scrollspy — aucun lien ne s'allumait en
  les traversant (demande explicite de l'utilisateur : "doit concerner plus de page"). Corrigé en
  leur donnant un id chacune (`tableur-j`/`tableur-today`/`tableur-planning`/`tableur-stats`) et en
  réécrivant le scrollspy avec une carte `navKey → [ids observés]` (plusieurs éléments DOM peuvent
  désormais partager un même lien de nav) au lieu d'un mapping 1-pour-1. Même mécanisme utilisé
  pour ajouter `#demo` ("D'un cours travaillé à un trophée débloqué") au lien "Méthode" (demande
  explicite). Vérifié en navigateur.
- [x] **TypixClin fusionné dans la section Créateur, renommée "Origines"** (demande explicite) :
  l'ancienne section pleine page "Depuis TypixClin / Une expérience qui accompagne déjà des
  étudiants" est retirée en tant que section indépendante et réinsérée à la fin de la section
  `#createur` (id conservé, seul le libellé visible change), séparée par une bordure ; son titre
  passe de `<h2>` (section à part entière) à `<h3>` (sous-partie d'"Origines") pour garder une
  hiérarchie de titres correcte. Les 3 occurrences du lien de nav (desktop/mobile/footer) et le
  titre de section passent de "Créateur" à "Origines". Le scrollspy n'a pas eu besoin de changer
  (id `createur` inchangé). Vérifié en navigateur (lien actif, contenu fusionné visible).
- [x] **Bouton "Abonnement mensuel" toujours sans transition malgré un premier correctif — bug réel
  trouvé et corrigé** (signalé deux fois) : le fondu opacity ajouté au tour précédent fonctionnait
  bel et bien (vérifié frame par frame via échantillonnage direct de `getComputedStyle`), mais était
  totalement éclipsé par un SAUT DE HAUTEUR instantané du conteneur — `#uniqueBlock` (curseur +
  tableau de paliers) et `#recurrentBlock` (une ligne de prix) ont des hauteurs très différentes.
  Ajouté un conteneur `.plan-card-stage` dont la hauteur est explicitement figée puis animée en
  parallèle du fondu. **Deuxième bug trouvé pendant la vérification** (`getAnimations()` montrait
  une transition RÉELLE mais figée à la même valeur de départ et d'arrivée) : `scrollHeight`, lu sur
  un élément `overflow:hidden` dont la hauteur est déjà pinnée à l'ancienne valeur, renvoie cette
  hauteur pinnée elle-même, pas la hauteur naturelle du nouveau contenu — corrigé en levant
  temporairement la contrainte (`height:auto`) le temps de la mesure, dans le même tick synchrone
  (donc sans reflow visible), avant de la réappliquer. **Troisième bug trouvé** : le retour à
  `height:auto` en fin d'animation se faisait sur un simple `setTimeout` fixe, qui coupait parfois
  la transition CSS en cours pile avant sa fin réelle (saut résiduel) — remplacé par un écouteur
  `transitionend` (avec le `setTimeout` gardé uniquement comme filet de sécurité). Vérifié à chaque
  étape par échantillonnage direct de la hauteur image par image (`requestAnimationFrame`), pas
  seulement par capture d'écran. **Même correctif appliqué à l'identique sur `comptepremium.html`**
  ("Choisir ma formule", demande explicite) — `uniquePlanBlock`/`recurrentPlanBlock` enveloppés dans
  le même `.plan-card-stage`, `prefersReducedMotion` ajoutée (absente de ce fichier jusqu'ici).
- [x] **Le bouton switch lui-même (pas seulement le contenu en dessous) n'avait toujours aucune
  transition** (signalé une 3ᵉ fois, avec référence explicite au bon résultat déjà obtenu sur
  auth.html) : `[aria-pressed="true"]{background:...}` posait le dégradé directement sur le bouton
  actif — deux éléments DOM distincts, un `background` ne peut pas "glisser" de l'un à l'autre, il
  ne peut que sauter. Corrigé en reprenant le patron exact de la pastille glissante d'auth.html
  (`.auth-tabs-indicator`), adapté ici en JS car les deux boutons n'ont PAS la même largeur
  ("Paiement unique" vs "Abonnement mensuel", contrairement à "Connexion"/"Inscription" qui sont
  `flex:1` à largeur égale) : `left`/`width` de la pastille mesurés sur le bouton actif
  (`offsetLeft`/`offsetWidth`) et transitionnés en CSS. Repositionnée aussi au redimensionnement de
  fenêtre. Sur `comptepremium.html`, la section formule démarre `display:none` (avant résolution de
  l'état de connexion) : la pastille y est repositionnée après le premier rendu réel du compte
  (`renderAccount()`), pas seulement à l'initialisation du script — sinon elle se serait mesurée à
  0×0. Appliqué à l'identique sur `index.html` et `comptepremium.html`. Vérifié par échantillonnage
  direct de `left`/`width` image par image sur les deux pages (glissement fluide confirmé, valeurs
  finales correctement alignées sur le bouton actif) + capture d'écran.

## 3. Auth
- [x] **Suppression de la connexion Google** (demande explicite utilisateur) : boutons, imports
  SDK (`signInWithPopup`, `GoogleAuthProvider`), fonction `handleGoogle`, CSS `.google-btn`/
  `.divider` associés — tous retirés de `public/auth.html`.
- [x] Item de réassurance "Données protégées, jamais supprimées" (jugé angoissant) remplacé par
  "Sauvegarde automatique, à chaque action".
- [x] Mock du panneau de marque (`mini-sheet`) : "Valvulopathies"/"Troubles du rythme" (trop
  EDN-like) remplacés par "Glycolyse"/"Cycle de Krebs" (cohérent avec le mock déjà corrigé sur
  `index.html`).
- [x] **Décalage du panneau de gauche lors du changement d'onglet Connexion/Inscription** : même
  cause que les bugs de scrollbar déjà corrigés cette session (le formulaire Inscription, plus
  haut, fait apparaître la scrollbar verticale et pousse tout le contenu) — corrigé par
  `scrollbar-gutter:stable` sur `<html>`. Vérifié en navigateur : plus aucun décalage au switch.
- [x] **Auto-remplissage du navigateur** (fond blanc moche sur les champs) : neutralisé via
  `:-webkit-autofill` + `box-shadow` inset géant à la couleur du champ (`--bg-soft`), technique
  standard, aucun changement de comportement d'autofill lui-même.
- [x] **Mentions légales → Conditions d'utilisation, en modale** : le checkbox de consentement à
  l'inscription pointait vers "mentions légales" (identité de l'éditeur, rien à "accepter") — pas
  le bon document pour un consentement actif. Remplacé par un lien "Conditions d'utilisation" qui
  ouvre une **modale** (comme sur `auth.html` de TypixClin), avec un vrai contenu CGU écrit pour
  P1Planner (objet, description du service, compte utilisateur, essai/Premium avec le barème à
  jour, résiliation, propriété intellectuelle, responsabilité, données, droit applicable) et un
  bouton "J'accepte" qui coche la case et ferme la modale. Voir `docs/DECISIONS.md` (§ Auth —
  consentement à l'inscription) pour le raisonnement.
- [x] UX (écran scindé marque/formulaire, mêmes tokens que l'index)
- [x] Implémentation (`public/auth.html` — connexion, inscription, reset password, vérification email, anti-double submit, anti-énumération de comptes)
- [x] QA côté client via Browser tool : validation, bascules d'onglets, gestion d'erreur Firebase gracieuse (bug de mapping de code d'erreur trouvé et corrigé)
- [x] QA bout-en-bout réelle via émulateurs (inscription → vérification email → connexion → redirection tableur) — voir rapport d'implémentation
- [x] Aucune écriture Firestore côté client au signup (délibéré, cf. docs/ARCHITECTURE.md P1-9) — `onUserCreated` déployée côté émulateur et testée ; **doit être déployée en prod avant tout vrai signup**, sinon aucun profil `users/{uid}` n'est créé
- [x] **Connexion Google supprimée** (demande explicite utilisateur) : boutons, imports SDK
  (`signInWithPopup`, `GoogleAuthProvider`), fonction `handleGoogle`, CSS `.google-btn`/`.divider`
  associés — retirés.
- [x] **Bug de décalage persistant Connexion↔Inscription — cause réelle trouvée et corrigée** : le
  premier correctif (`scrollbar-gutter:stable`) n'a pas suffi, l'utilisateur a confirmé le bug
  toujours présent avec captures à l'appui. Cause réelle : les 4 panneaux (`display:none`/
  `.is-active{display:block}`) changent la hauteur de la carte selon celui affiché, donc le panneau
  de marque à gauche (centré verticalement) se recentre à une position différente. **Corrigé en
  empilant les 4 panneaux dans une grille CSS partagée** (`.auth-panels-stage{display:grid}`, tous
  les panneaux sur `grid-column/row:1`, visibilité gérée par `opacity`/`visibility` au lieu de
  `display`) : la hauteur de la grille s'aligne désormais sur le PLUS GRAND des 4 panneaux en
  permanence, actif ou non — la carte ne change plus jamais de hauteur en changeant d'onglet.
  Vérifié en navigateur (capture avant/après Connexion↔Inscription) : position du panneau de marque
  identique au pixel près.
- [x] **Checkbox de consentement redessinée** (fond blanc natif jugé "bizarre" par l'utilisateur) :
  `appearance:none` + case dessinée à la main (fond sombre, coche en dégradé au clic) — appliqué
  aussi à `comptepremium.html` (même bug potentiel sur sa checkbox de consentement au paiement).
- [x] **Modale Conditions d'utilisation — 3 corrections** :
  1. Texte "Version simplifiée ; une version détaillée pourra être publiée séparément..." retiré
     (demande explicite).
  2. Puces de liste invisibles ("on ne voit pas les points blancs") : cause = reset CSS global
     `ul{list-style:none}` qui s'appliquait aussi aux `<ul>` du contenu CGU sans override — ajouté
     `list-style:disc` + puce colorée (`::marker`) spécifiquement dans `.cgu-modal-body ul`.
  3. En-tête et bouton fermer refaits pour matcher le gabarit des modales du tableur (icône carrée
     en dégradé + titre à côté, bouton fermer ROND, ABSOLU en haut à droite, teinté "danger" —
     remplace l'en-tête `justify-content:space-between` générique d'origine).
- [x] **Animation d'ouverture/fermeture de la modale CGU** (absente jusqu'ici) : ajoutée avec le même
  gabarit d'animation que les modales du tableur (`modalOverlayIn/Out`, `modalContentIn/Out`,
  fondu + léger scale/translateY, fermeture différée de 180ms le temps de l'animation avant de
  masquer réellement — mêmes durées que `.modal.closing` du tableur pour rester cohérent).
- [x] **Prénom + Nom de famille** (demande explicite, l'inscription ne prenait que le prénom) :
  deux champs côte à côte (`.field-row-2col`, grille 2 colonnes qui repasse à 1 colonne sous
  480px), combinés en un seul `displayName` ("Prénom Nom") envoyé à `updateProfile` — aucun
  changement de schéma Firestore nécessaire, `users/{uid}.displayName` reste un champ texte unique.
  Message d'erreur du consentement corrigé au passage ("mentions légales" → "Conditions
  d'utilisation", oubli lors du renommage précédent).
- [x] **Transition sur le changement d'onglet Connexion/Inscription** (demande explicite) : pastille
  glissante derrière l'onglet actif (`.auth-tabs-indicator`, `transform:translateX`, contrôlée par
  `data-active` sur `.auth-tabs`) au lieu d'un fond posé directement sur le bouton (changement
  auparavant instantané, sans transition) ; contenu des panneaux animé en fondu + léger
  glissement vertical (`opacity` + `translateY(10px→0)`) en plus du fondu déjà en place pour le
  correctif de hauteur de carte. Les deux respectent `prefers-reduced-motion`.
- [x] **Panneau de marque (gauche) rogné en bas sur un écran PC courant** (signalé, capture non
  fournie mais reproduit : à 1440×800, le panneau a besoin de 871px de haut, la maquette mini-sheet
  décorative en bas se retrouvait coupée à moitié). Cause réelle trouvée en mesurant les hauteurs en
  direct : ce n'était PAS le contenu du panneau de marque lui-même qui manquait de place, mais la
  grille CSS qui étire les deux colonnes (marque / formulaire) à la même hauteur — hauteur dictée
  par le panneau FORMULAIRE (dont la carte est désormais figée sur la hauteur du panneau Inscription,
  le plus grand des 4, depuis le correctif anti-décalage de cette session). Réduire l'espacement du
  panneau de marque seul n'y changeait donc rien tant que le panneau restait étiré à cette hauteur.
  Corrigé en resserrant l'espacement (`@media (max-height:900px)`) ET, sur les hauteurs vraiment
  contraintes (`@media (max-height:760px)`), en masquant purement la maquette mini-sheet plutôt que
  de la laisser à moitié coupée — le texte (titre, accroche, réassurance), toujours l'essentiel,
  reste intégralement visible sans scroll dans tous les cas testés (1440×800 et 1440×680). Vérifié
  en navigateur aux deux hauteurs.

## 4. Premium
- [x] Seuils validés (voir docs/DECISIONS.md)
- [x] Paiement unique **et** récurrent coexistent (validé)
- [x] Pas de marge concours (validé)
- [x] UX pricing (`public/comptepremium.html` — statut essai/actif/lecture seule/problème de paiement, simulateur de prix, modale de consentement, portail de facturation)
- [x] QA côté client via Browser tool : tous les états de statut testés via `renderAccount()`, modale de consentement, échecs Cloud Functions gérés proprement
- [ ] Stripe TEST (nécessite le projet Stripe + Cloud Functions réels)
- [ ] QA bout-en-bout réelle (Checkout → webhook → mise à jour Firestore → affichage)
- [x] **Barème dégressif changé** (demande explicite utilisateur) : 2,50/2,25/2,00 €/mois →
  **3,00/2,50/2,25 €/mois** (1 mois / 2-4 mois / 5+ mois). Mis à jour dans `comptepremium.html`
  (`tierFor()`, tableau des paliers, prix par défaut affiché) et dans la doc vivante
  (`docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/P1PLANNER_SPEC.md`, `docs/QA.md`).
  L'abonnement récurrent était inchangé à ce moment-là (2,50 €/mois) — **changé séparément par la
  suite, dans le même barème, à 3,00 €/mois** (voir plus bas, demande explicite de l'utilisateur).
- [x] **Décalage de contenu à l'apparition de la scrollbar** (état de chargement court → contenu
  du compte plus grand) : `scrollbar-gutter:stable` sur `<html>`, même famille de correctif que le
  reste de la session.
- [x] **Header refait** : hauteur/alignements resserrés, fond qui se densifie + ombre légère au
  scroll (`.top-bar.is-scrolled`, même schéma que le header d'`index.html`), bouton "Mon tableur"
  promu en action primaire (`btn-primary`), "Déconnexion" simplifié en lien discret avec icône
  plutôt que deux boutons `btn-ghost` identiques visuellement.
- [x] **Bug "Invalid Date"** (Membre depuis le / Fin de l'essai) : `fmtDate()` appelait
  `new Date(...)` directement sur un Timestamp Firestore (objet `{seconds, nanoseconds}`, pas une
  chaîne ISO) → `Invalid Date`. Nouvelle fonction `toJsDate()` gère Date JS / chaîne ISO /
  Timestamp Firestore (`.toDate()` ou `{seconds}`) avant tout formatage ; retombe sur `—` si
  vraiment absent/invalide, plus jamais sur le texte brut "Invalid Date". Testé en navigateur avec
  un faux Timestamp Firestore (`{seconds, nanoseconds}`) injecté dans `renderAccount()`.
- [x] **Disposition du statut Premium reprise** (préférence explicite de l'utilisateur, cf. capture
  d'écran) : bandeau coloré à gauche ("Gratuit jusqu'au [date]" + icône) et 3 tuiles de métriques à
  droite (Statut / Fin de la période ou Accès jusqu'au / Jours restants — ce dernier calculé
  côté client, purement indicatif). Couleur du bandeau dépend de l'état (`tone-trial`/`tone-active`/
  `tone-expired`/`tone-warning`), toujours avec les tokens P1Planner existants (`--gradient-warm`,
  `--gradient-brand`), pas une reprise des couleurs TypixClin.
- [x] **Sélecteur de date personnalisé** remplaçant l'`input[type="date"]` natif (calendrier système
  jugé moche) pour la date de concours : bouton + popover calendrier fait main (mois/année avec
  navigation, grille lundi-premier, jour du jour souligné, jour sélectionné en dégradé, "Effacer"/
  "Aujourd'hui"), écrit une chaîne ISO dans un input caché `#examDate` — aucune autre logique
  (`btnSaveExamDate`) n'a eu besoin de changer. Testé en navigateur : ouverture, navigation de mois,
  sélection, fermeture automatique, valeur reprise par le reste du formulaire.
- [x] Libellé "12 mois max." jugé confus → simplifié en "12 mois" (le texte "1 mois" en face n'a
  jamais porté "min.", la formulation était asymétrique et n'apportait rien).
- [x] **Formules mutuellement exclusives (correction de l'utilisateur)** : l'ancienne doc
  ("coexistence, accessEnd = max(...)") était fausse — corrigée partout (`comptepremium.html`,
  `index.html` FAQ visible + JSON-LD, `docs/DECISIONS.md`) en "pas cumulables, une seule formule
  active à la fois, changement possible à tout moment".
- [x] **Backend Stripe complet — première version, adapté de la référence TypixClin fournie par
  l'utilisateur** (`tpx-billing.js` + `functions/index.js` + `functions/premiumPlans.js`) :
  - **`functions/premiumPlans.js` (nouveau)** : barème dégressif du paiement unique
    (3,00/2,50/2,25 €/mois), calcul du prix réel en centimes, calcul de `maxMonths` depuis la date
    de concours (miroir serveur de la logique déjà côté client), calcul d'`accessEnd` (fin du Nᵉ
    mois calendaire, mois en cours compté comme le mois n°1), `checkPurchaseConflict` (formules
    mutuellement exclusives, avec l'exception TypixClin reprise : un abonnement mensuel déjà résilié
    n'empêche pas de basculer immédiatement vers un paiement unique), verrou `PAYMENTS_ENABLED`
    (fermé par défaut — projet Stripe P1Planner pas encore créé).
    **Bug de date trouvé et corrigé avant tout déploiement** : la formule reliant `accessEnd` à
    `maxMonths` avait un décalage d'un mois (`+ n + 1` au lieu de `+ n`) — repéré en testant
    concrètement le cas "essai en septembre, concours en novembre" (aurait dû tomber le 30
    novembre, tombait le 31 décembre). Revérifié après correction avec plusieurs cas (1/2/3 mois,
    exam aujourd'hui, exam très loin/plafond 36 mois) : tous corrects.
  - **`functions/index.js` (complété, structure existante — onUserCreated/emails — inchangée)** :
    `createCheckoutSession` (paiement unique à durée libre OU abonnement mensuel, verrou anti-double-
    Checkout persistant `billingLocks/{uid}` repris du modèle TypixClin), `createCustomerPortalSession`,
    `stripeWebhook` (idempotence `stripeEvents/{id}`, tous les événements Checkout/subscription/
    invoice gérés, re-vérification du conflit AU MOMENT D'ÉCRIRE avec journalisation dans
    `billingConflicts/` si une course survient malgré les gardes précédentes — jamais d'écrasement
    silencieux d'un accès payé), `saveExamDate` (nouvelle callable, spécifique P1Planner — calcule et
    enregistre `maxMonths` côté serveur, jamais fait confiance au client), `sweepExpiredTrials`
    (planifiée quotidienne, filet d'affichage : sans elle un essai expiré resterait affiché "en
    cours" indéfiniment — n'affecte aucun droit d'accès réel). Origines Checkout/portail limitées au
    domaine P1Planner (`p1planner.fr`/`.web.app`/`.firebaseapp.com`) — jamais typixclin.fr (isolation
    P0). Schéma **volontairement différent** de TypixClin : `entitlements/{uid}` (accès) +
    `billingPrivate/{uid}` (identifiants Stripe) séparés, au lieu d'un `users/{uid}` plat — reprend le
    schéma déjà en place depuis `onUserCreated` (session précédente), pas celui de TypixClin.
    **Bug trouvé au passage** : le template d'email de vérification affichait encore "essai gratuit
    de 30 jours" (oublié lors du passage 30→15 jours plus tôt dans la session) — corrigé.
  - **`public/p1-billing.js` (nouveau)** : équivalent frontend de `tpx-billing.js`, source unique du
    barème/dates Premium pour l'affichage (`index.html` et `comptepremium.html` délèguent maintenant
    à `window.p1RatePerMonthForOneTime`/`p1ComputeMaxMonthsFromExamDate`/`p1ToDate` au lieu de
    dupliquer chacun leur propre copie des chiffres — exactement le risque qui a produit le bug de
    date ci-dessus si une des copies avait divergé).
  - **`comptepremium.html`** : `btnSaveExamDate` appelle réellement la Cloud Function `saveExamDate`
    (remplace le TODO/estimation-client-seule) ; `planType` envoyé à `createCheckoutSession` corrigé
    de `"recurring"` à `"monthly"` (incohérence trouvée entre le frontend déjà écrit en session et la
    convention TypixClin/nouveau backend — 5 occurrences alignées, y compris dans `renderAccount()`).
  - **Package** : dépendance `stripe` ajoutée à `functions/package.json`, installée localement
    (`npm install`), `node --check` propre sur les deux fichiers.
  - **⚠️ NON DÉPLOYÉ, NON TESTÉ EN CONDITIONS RÉELLES.** Le projet Stripe P1Planner n'existe pas
    encore (secrets `STRIPE_*` absents) — seule vérification possible : relecture, `node --check`,
    tests unitaires manuels des fonctions pures de `premiumPlans.js` (pricing, dates, conflits — tous
    corrects après correction du bug de date), et vérification en navigateur que
    `createCheckoutSession`/`saveExamDate` sont bien appelées avec les bons paramètres vers le bon
    projet Firebase (`europe-west1-p1planner.cloudfunctions.net`, confirmé, échoue seulement par
    absence de déploiement — CORS/404 attendus). Aucun vrai Checkout, webhook ou paiement testé.
    Prochaines étapes avant tout déploiement : créer le projet Stripe P1Planner, poser les secrets,
    tester avec les émulateurs Firebase, puis GO explicite de l'utilisateur (CLAUDE.md).
- [x] **Abonnement mensuel : 2,50 € → 3,00 €/mois** (demande explicite utilisateur) — mis à jour
  partout : `comptepremium.html` (bloc récurrent + résumé de la modale de consentement),
  `auth.html` (liste de réassurance CGU), `public/p1-billing.js` et `functions/premiumPlans.js`
  (`MONTHLY_RATE_EUROS`), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`. Le barème dégressif du
  paiement unique (3,00/2,50/2,25 selon la durée) est distinct et n'a pas changé.
  - [x] **Oubli trouvé et corrigé au tour suivant** (signalé par l'utilisateur, "y'a encore une
    mention 2 euro 50") : le bloc `#recurrentBlock` d'`index.html` (démo/simulateur de la page
    publique, distinct de celui de `comptepremium.html` déjà corrigé) avait son propre `2,50&nbsp;€`
    en dur, non repéré par le grep précédent car limité à une poignée de fichiers/lignes connus.
    Re-balayé l'intégralité de `public/` et `functions/` cette fois — plus aucune occurrence de
    2,50 hors du palier légitime "2 à 4 mois" du paiement unique.
- [x] **Espace excessif entre le nom et l'email/date d'adhésion** (`.account-meta`) : dû au
  `line-height` hérité (1.55 sur le body) appliqué aux `<span>` de taille réduite — resserré
  explicitement (`line-height:1.2` sur le nom, `1.5` mais `display:inline-block` sur les lignes
  email/adhésion pour un contrôle prévisible), plus un petit `margin-bottom` sous le nom.

## 5. Admin
- [x] **`public/admin.html` créé** (demande explicite : "à l'image de la page admin de TypixClin", scope choisi par l'utilisateur = parité complète). Audit préalable de la référence TypixClin (lecture seule) + des Rules/Functions P1Planner actuelles avant tout code (workflow CLAUDE.md).
  - **Rôle admin** : champ `users/{uid}.isAdmin` (booléen), sur un document déjà `allow write: if false` en intégralité — donc JAMAIS posable par le client, seulement par la Console Firebase (choix explicite de l'utilisateur pour l'activation initiale) ou une future Cloud Function. Nouveau helper `isAdminUser()` dans `firestore.rules` (relit `users/{request.auth.uid}` via `get()`, jamais un uid transmis par le client).
  - **Rules ouvertes, chemin par chemin, en lecture seule uniquement** (jamais d'écriture élargie à un admin, cf. P0 "utilisateur A pouvant modifier les données de B") :
    - `users/{uid}` : lecture ajoutée pour l'admin (liste tous les utilisateurs).
    - `users/{uid}/backups/{backupId}` : lecture ajoutée pour l'admin (onglet Sauvegardes) — écriture inchangée (propriétaire uniquement, ou Cloud Function via Admin SDK).
    - `entitlements/{uid}` : lecture ajoutée pour l'admin.
    - `billingPrivate/{uid}` : lecture ouverte à l'admin (était `if false` en lecture ET écriture ; écriture reste `if false`).
  - **Bug réel trouvé et corrigé en cours d'audit** : le tableur (`public/tableur.html`) écrit/lit RÉELLEMENT les feedbacks dans une collection `feedbacks` (PLURIEL, champ `userId`, réponses admin dans un tableau `adminReplies[{text, sentAt}]` déjà lu côté client par un système "Mes messages" complet et déjà câblé) — alors que `firestore.rules` ne définissait qu'une collection `feedback` (SINGULIER, jamais utilisée nulle part) avec un schéma différent (`uid`, pas de mécanisme de réponse). Résultat réel en production : **tout envoi de feedback échouait silencieusement** (permission-denied via le fallback fail-closed racine, message affiché à l'utilisateur : "Vérifiez votre connexion" — trompeur). Corrigé : la règle cible désormais `feedbacks` (pluriel), avec le bon champ `userId`, plus une règle d'update étroite (`hasOnly(['adminReplies'])`) pour permettre à l'admin d'ajouter une réponse sans jamais pouvoir toucher au message d'origine. Fixé aussi au passage : `appVersion: 'TableurEnLigne'` (résidu TypixClin non adapté, cf. CLAUDE.md isolation) → `'P1Planner'`.
  - **Lien "Administration" de la pastille de profil** (`#admin-menu-link` sur `tableur.html`, déjà présent en `display:none` depuis une session antérieure mais jamais câblé) : affiché désormais uniquement si `userInfo.isAdmin === true` lu au login — pas une garde de sécurité (la vraie garde est le auth-gate de `admin.html` lui-même, qui revérifie tout côté Firestore Rules), juste l'affichage du lien.
  - **Backend protégé** : `adminCreateBackup` et `adminRestoreBackup`, deux nouvelles Cloud Functions callable (`functions/index.js`) — volontairement PAS un assouplissement des Rules Firestore pour laisser un admin écrire directement chez un autre utilisateur (surface P0 trop large). `requireAdmin()` revérifie `isAdmin` côté serveur via Admin SDK, ne fait jamais confiance à un claim client. Restauration = fusion/écrasement des documents présents dans la sauvegarde (jamais de suppression de ceux créés depuis, cohérent avec le principe déjà en tête de `firestore.rules`) + sauvegarde automatique de l'état courant juste avant toute restauration (filet de sécurité anti-écrasement accidentel, non demandée explicitement mais ajoutée par prudence P0).
  - **Onglet Sauvegardes RETIRÉ de admin.html** (demande explicite de l'utilisateur, juste après la 1ère version : "Supprimes cette partie en vrai pour l'instant") — `public/tableur.html` n'écrit ENCORE aucune sauvegarde automatique (vérifié par grep : zéro occurrence de `backups`/`createBackup` dans tout le fichier), donc l'onglet aurait été vide pour tout le monde. Retiré de `admin.html` : nav sidebar, section HTML, CSS `.backup-*`, tout le JS associé (`__searchBackups`/`__createBackup`/`__restoreBackup`/`__gotoBackupsFor`), le bouton "Sauvegardes" par ligne du tableau Utilisateurs (colonne Actions supprimée), et l'import Functions SDK devenu inutile (`getFunctions`/`httpsCallable`/`connectFunctionsEmulator`) puisque plus aucun appel callable ne reste côté admin.html.
    **Les Cloud Functions `adminCreateBackup`/`adminRestoreBackup` restent dans `functions/index.js`** (rien n'a demandé de les retirer du backend, et elles sont inertes tant qu'elles ne sont pas déployées ni appelées) — orphelines de toute UI pour l'instant, à réintégrer dans admin.html (ou supprimer) le jour où la création de sauvegardes automatique sera réellement construite côté tableur.
  - **Écart assumé et signalé (2)** : pas de widget "en ligne maintenant" façon TypixClin — nécessiterait Realtime Database, un service Firebase non provisionné pour P1Planner (une intégration RTDB TypixClin avait déjà été explicitement retirée dans une session antérieure pour isolation P0, voir commentaire à la fin de `tableur.html`). Remplacé par des métriques réellement disponibles (total utilisateurs, Premium actifs).
  - **UI** : sidebar (Vue d'ensemble / Utilisateurs / Abonnements / Sauvegardes / Feedbacks) + auth-gate, identité visuelle P1Planner (tokens réutilisés d'`index.html`/`comptepremium.html`, PAS la charte TypixClin — cf. CLAUDE.md "nouvelle identité complète" pour admin.html), fonctionnellement proche de TypixClin comme demandé.
  - **QA effectuée** : `node --check` sur `functions/index.js` (OK) ; vérification manuelle de l'équilibre des accolades de `firestore.rules` (OK, pas d'émulateur disponible — Java absent de la machine, donc **les Rules n'ont PAS pu être testées par l'émulateur Firestore réel**, seulement relues attentivement) ; `admin.html` chargé dans un navigateur réel (onglet neuf) — auth-gate testé en conditions réelles (Firebase Auth réel, "Connexion requise" affiché correctement, zéro erreur console) ; rendu de chaque section (Dashboard/Utilisateurs/Abonnements/Sauvegardes/Feedbacks) vérifié visuellement avec des données de test injectées manuellement (captures d'écran) — **le parcours complet avec un vrai compte `isAdmin:true` n'a PAS été testé** (nécessite que l'utilisateur pose lui-même ce champ depuis la Console Firebase, puis un test réel avec de vraies données).
  - **Reste à faire avant un vrai GO** : poser `isAdmin:true` sur un compte de test depuis la Console Firebase ; tester le parcours complet (connexion admin → chaque onglet → une vraie création + restauration de sauvegarde sur un compte de test, JAMAIS sur un compte réel en premier essai) ; tester un aller-retour feedback réel (soumission depuis le tableur → réponse depuis admin.html → réception côté "Mes messages") ; obtenir le GO explicite avant `firebase deploy` (Rules + Functions + Hosting, aucun déploiement fait dans cette session).

## 6. Mentions légales
- [x] Page (`public/mentions-legales.html` — sommaire, cohérente avec l'identité P1Planner, testée)
- [x] Placeholders contrôlés (aucune donnée inventée, seul le nom du créateur déjà validé est utilisé)
- [x] **Informations réelles fournies par l'utilisateur — tous les `[À COMPLÉTER]` remplacés (10
  sections désormais).** Éditeur : nom commercial P1Planner, Jean ZENNARO, entrepreneur individuel
  micro-entreprise, SIRET 107 971 764 00017 / RCS Nanterre 107 971 764, TVA non applicable (art.
  293 B CGI), adresse, email `typixclin@gmail.com` (contact demandé explicitement par
  l'utilisateur, réutilisé côté données personnelles/médiation/contact) — mêmes informations que
  celles de TypixClin, la même personne physique/micro-entreprise éditant les deux produits, donc
  légitimement identiques (pas une pollution TypixClin↔P1Planner au sens de `CLAUDE.md` : identité
  légale, pas infrastructure technique).
  - **Adapté, PAS copié tel quel**, à partir du texte fourni (qui décrivait TypixClin) : nouvelle
    section "2. Services proposés" ajoutée (absente jusqu'ici), décrivant les VRAIS services
    P1Planner (tableur P1, Méthode des tours, Méthode des J, planning, Programme de la journée,
    flashcards, cahier d'erreurs, statistiques) — jamais "tableur EDN"/"tableur ECOS"/"carnet de
    stage" (contenu TypixClin fourni par l'utilisateur, qui aurait été factuellement faux ici et
    en contradiction directe avec la phrase juste au-dessus affirmant l'indépendance vis-à-vis de
    TypixClin).
  - **Hébergement volontairement PAS aligné sur le texte fourni** ("Site : GitHub, Inc.") : la
    section Hébergement de P1Planner indiquait déjà Firebase Hosting (Google Ireland Limited),
    cohérent avec `firebase.json`/`CLAUDE.md` ("Firebase Hosting servira le frontend") — inchangée,
    le texte source décrivait le hosting propre à TypixClin, différent.
  - **Cookies volontairement PAS aligné** ("Google Analytics + bannière cookies" chez TypixClin) :
    aucune preuve trouvée dans `index.html`/`tableur.html` d'un Google Analytics ou d'une bannière
    cookies sur P1Planner à ce jour — affirmer le contraire aurait été une fausse déclaration dans
    un document légal. Section laissée telle quelle ("aucun cookie de traçage tiers à ce stade").
    À signaler à l'utilisateur si Google Analytics doit finalement être ajouté.
  - Médiation de la consommation : coordonnées CM2C ajoutées telles que fournies (adresse,
    téléphone, site, email) — même médiateur, légitimement réutilisable (rattaché à l'éditeur, pas
    à un produit en particulier).
  - RGPD (droit d'accès/rectification/effacement/portabilité/opposition + réclamation CNIL) ajouté
    en section Données personnelles, à la place du paragraphe `[À COMPLÉTER]` — contenu générique
    RGPD légitimement réutilisable, adapté en "tu"/P1Planner (cohérent avec le reste de la page).
  - "Responsabilité" (méthodes de travail = aide à la planification, pas de garantie de résultat
    aux concours) **conservée telle quelle**, PAS remplacée par l'avertissement médical de
    TypixClin ("ne remplace pas un avis médical") — non pertinent en P1 (pas encore de pratique
    clinique), le texte déjà en place était plus juste pour ce public.
  - Bandeau d'intro "informations en attente" retiré (n'avait plus lieu d'être, tous les
    `[À COMPLÉTER]` étant résolus) ; note de bas de page reformulée (politique de confidentialité
    et CGV "publiées séparément avant l'ouverture de l'abonnement Premium", au lieu de laisser
    entendre que les mentions légales elles-mêmes restaient incomplètes.
  - Vérifié en navigateur : sommaire à 10 entrées correctement numéroté, contenu de chaque section
    relu en entier via extraction de texte de la page rendue (cohérent, aucune coupure, aucun
    `[À COMPLÉTER]` résiduel visible).

## 7. Tableur (`public/tableur.html`)
- [x] Audit EDN (fait pendant la phase d'audit, exploité pour ce build)
- [x] Matières / Cours — 1 document par cours, `order` espacé, listeners collection-level, realtime multi-onglets testé
- [x] **Vue Matières & Cours reclonée fidèlement depuis `TableurEnLigne.html`** suite à un 2e retour utilisateur ("la totalité doit être clonée") : CSS et structure lues directement dans la référence (`.items-table`, `.tour-badge`, `.confidence-btn`, `.days-badge`, `.tour-context-card`, `.duration-input-wrapper`, `.support-btn`) et adaptées. Palette du tableur = thème sombre officiel de TypixClin (`[data-theme="dark"]` de la référence : bleu #60a5fa, fond #0f172a), pas le violet du reste de P1Planner — le tableur reste l'exception voulue par CLAUDE.md. Table plate (recherche + tri par colonne + filtre matière en chips + filtre statut, pas de groupement collapsible), bandeau de tours en ligne (verrouillage séquentiel, couleurs de confiance EXACTES de la référence `--conf-1..5`), badge d'ancienneté recent/moderate/old/never, bouton priorité (cycle none→urgent→pas-urgent→relative), durée/support affichés sous chaque tour rempli. Colonnes volontairement non reprises : Numéro officiel et Ressources (spécifiques au programme EDN imposé, sans équivalent pour des cours créés par l'utilisateur). `tourConfidences[]`/`tourDurations[]`/`tourSupports[]` dénormalisés par cours. Bug réel trouvé et corrigé en QA (tableau à trous → `undefined` rejeté par Firestore), couvert par un test de non-régression.
- [x] Mode compact/détaillé — bascule dans la vue Matières & Cours, préférence locale namespacée uid, testée
- [x] Tours — transaction atomique, `tourNumber` sans collision (testé en concurrence réelle), historique, `targetTourCount` configurable (pas figé à 8)
- [x] Méthode des J — presets configurables, `jStepIndex` découplé de `tourCount` (pas de lien rigide Tour i+1 = J i), testé avec vraies données
- [x] Mode libre — `manualPlannedDate`, testé
- [x] Changement de mode J ↔ libre — testé, aucune perte d'historique
- [x] Programme de la journée — généré en mémoire (En retard/Aujourd'hui), Faire maintenant/Reporter
- [x] Planning — calendrier mensuel, 5 types validés, état calculé (heuristique V1 simple, documentée)
- [x] Notes — mécanique générique, éditeur riche sanitizé, anti-écrasement par `revision`, brouillon local namespacé uid
- [x] Flashcards — CRUD, session recto/verso, intervalle fail/hésitant/su, historique séparé (`reviews`)
- [x] Cahier d'erreurs — structuré (`errorEntries`), pas la fausse note de TypixClin
- [x] Entraînements — suivi externe (todo/redo/reviewed/done)
- [x] Stats — calculées en mémoire (jamais 1 query/cours), score de priorité V1
- [x] Trophées — catalogue V1 (8 trophées) calculé en mémoire depuis `courses`, jamais persisté (rien à falsifier), affiché dans Statistiques ; `achievements/{uid}` reste réservé et verrouillé en écriture côté Rules pour une V2 avec calcul serveur si un avantage y est un jour lié — testé avec vraies données (2 débloqués/8 sur le compte de test)
- [x] Sauvegarde — cache Firestore persistant natif (remplace un cache maison), garde anti-vide/anti-corruption, statut synchronisé/erreur visible
- [x] Sauvegardes cloud + historique — collection `backups` (5 dernières versions, purge auto), modale dédiée, restauration testée, isolation A/B testée (Rules + Emulator)
- [x] Chronomètre de session — widget flottant, préfilit la durée du tour si ≥60s à la validation, testé
- [x] Hors-ligne fin — `recomputeCanWrite()` combine entitlement + statut réseau, boutons `data-write-gate` réactifs en direct (testé en forçant l'expiration d'un entitlement pendant que l'onglet reste ouvert) ; dialogues personnalisés (`p1Confirm`/`p1Prompt`) remplacent `confirm()`/`prompt()` natifs partout
- [x] Cahier d'erreurs enrichi — compteur d'occurrences, tri par statut, résumé par statut
- [x] Notes riches — éditeur enrichi (couleur, surlignage, taille, image), sanitizer étendu (SPAN/IMG), bug `execCommand('foreColor')` → `<font>` non whitelisté trouvé et corrigé (`styleWithCSS`)
- [x] Programme du jour en vraie liste — tâches manuelles (`tasks`), liées ou non à un cours, complétion avec/sans tour
- [x] Planning détaillé — chips de matières par jour, remplissage semaine, types/notes
- [x] Stats avec graphiques — `dailyStats/{dayKey}` incrémenté dans la même transaction que la validation d'un Tour (jamais de scan de `tourLogs`), graphique hebdomadaire Chart.js (agrégation par semaine, label = lundi de la semaine — comportement voulu, vérifié), regression `dayKey`/`dateKey` trouvée et corrigée en QA réelle (voir rapport)
- [x] Feedback utilisateur → admin — bouton dans le header, modale, écriture dans `feedback/{id}` volontairement **non gatée par `canWrite`** (testé avec succès en lecture seule/entitlement expiré, cf. Rules + `test/firestore.rules.test.mjs`)
- [x] QA — scénario du jalon complet exécuté réellement (voir rapport), lecture seule testée, isolation multi-comptes testée
- [x] Suites de tests automatisées re-passées après cette vague de features : 34/34 `test:rules`, 3/3 `test:bootstrap`, aucune régression
- [ ] Storage (upload d'images dans les notes) — Rules préparées (`storage.rules`), bouton d'upload présent dans l'éditeur de notes, mais **jamais testé contre un vrai Storage Emulator** (Storage Emulator non démarré cette session) — chemin de code non vérifié, à tester avant toute mise en avant de cette fonctionnalité
- [x] **Vague de retours d'usage réel (11 points)** — corrigés et testés via Browser tool + Emulator :
  1. Numéro de cours affiché comme une suite de lettres — c'était l'ID de document Firestore
     affiché comme un "Numéro" ; retiré de l'en-tête de note, de la colonne du tableau et de
     l'en-tête de colonne (devenue vide), tri par défaut passé de `num` à `name` (2 endroits).
  2. "Périmètre du tableur" retiré des Paramètres (bloc HTML `data-setting="scope"` supprimé,
     `available: () => false` sur l'entrée d'onboarding correspondante — notion de collèges EDN
     sans équivalent pour des cours créés librement).
  3. Présentation (tour d'onboarding) et notification "Votre avis compte" remises à chaque
     connexion — cause racine : `markDone`/`seenVersion`/`_patchUser`/`checkAndShow` écrivaient
     et lisaient sur `users/{uid}` (backend-only, `allow write: if false`), échec silencieux
     avalé par un `.catch()`. Redirigés vers `users/{uid}/settings/preferences` (sous-document
     client autorisé par les Rules) des deux côtés (lecture ET écriture). **Testé réellement** :
     doc `settings/preferences` vidé via un script Emulator, cycle complet
     affichage → fermeture → rechargement répété deux fois, aucune réapparition, contenu du
     document vérifié après coup (`ednOnboardingDone`, `ednOnboardingVersion`, `feedbackNudgeSeen`
     bien présents).
  4. Entraînements : libellés de plateforme "EDNi"/"Asclepia" → **"Prépa"/"Tutorat"** (3 maps JS
     dupliquées + boutons + filtres), "Hypocampus"/"UNESS" masqués (attributs `data-value`
     conservés, fortement couplés au CSS des 3 thèmes).
  5. "Toutes les spécialités" → "Toutes les matières" (filtres).
  6. Bouton "Partager cette note" masqué sur les modales de notes (`display:none`, gardé dans le
     DOM car référencé par plusieurs fonctions JS existantes).
  7. Pastille "Sur-mesure" retirée de l'en-tête (un seul mode existe pour P1, la pastille n'a
     plus de sens).
  8. "Mes spécialités préférées" → "Mes matières préférées" (carte stats).
  9. "Items à revoir en priorité" → "Cours à revoir en priorité" — toutes les occurrences,
     y compris deux variantes minuscules en milieu de phrase repérées seulement en relisant
     le tour d'onboarding et le carrousel de présentation publique du tableur (non couvertes
     par le premier remplacement, qui ciblait la chaîne capitalisée des cartes stats).
  10. Planning : mention "spécialité du jour" → "matière du jour" (placeholders "+ Spécialité"
      → "+ Matière").
  11. **Bug fonctionnel réel** : le sélecteur de matière du jour, dans le Planning, utilisait une
      liste figée de 26 spécialités EDN codées en dur (`cardio`, `hge`, `gyneco`, …), totalement
      déconnectée des matières réellement créées par l'utilisateur. Remplacé par
      `syncPlanningSpecialties()`, qui reconstruit la liste depuis `SPECIALTIES_DATA`/
      `SPECIALTY_CONFIG` (les globales déjà repeuplées depuis Firestore par `tpx-perso-script`),
      appelée depuis `renderCalendar()` et `openSpecialtyPopup()` ; couleur des badges lue
      depuis `SPECIALTY_CONFIG[id].color` (pas disponible directement sur les entrées de
      `SPECIALTIES_DATA`) ; rendu des badges passé de classes CSS figées à un style inline basé
      sur cette couleur, seule façon de colorer une matière créée librement par l'utilisateur.
      **Testé réellement** : matière assignée à un jour depuis le Planning, vérifiée dans
      Firestore (`calendarDays/{date}.specialties` contient bien l'ID réel de la matière, pas
      un code EDN), couleur affichée conforme à la couleur réelle de la matière.
  Corrections annexes trouvées en testant le point 3 (mêmes symptômes, même famille de bug) :
  libellé "Spécialités" → "Matières" dans le catalogue de pages de l'onboarding, badge
  "3 réglages"/"2 réglages" figés sur les étapes Items/Entraînements devenus faux après le
  retrait des réglages "scope"/"content"/"trainings" (corrigé à `1` pour Items — valeur
  désormais stable — et le nombre figé retiré pour Entraînements, dont la disponibilité
  dépend de `hasTrainings()` au moment du rendu).
- [x] **2e vague de retours d'usage réel (6 points)** — corrigés et testés via Browser tool +
  Emulator, sur la base de nouveaux screenshots utilisateur :
  1. **Bug P0 réel : la validation d'un tour en mode compact n'enregistrait jamais rien**,
     ni en local ni sur Firestore. Cause : `doAdd()`/`compactTourRemove()` (mode compact,
     tableur.html) mutaient un objet `d` jetable (recréé à chaque appel de `getItemData()`,
     jamais une référence vivante) puis appelaient `debouncedSave()` → `saveUserData()`, qui
     écrit sur `planningRevision/{uid}` — une collection **absente de `firestore.rules`**
     (fail-closed) et déjà abandonnée pour tout le reste (checklist/planning/entraînements,
     tous migrés vers des collections dédiées). Résultat : `permission-denied` systématique,
     silencieux pour l'utilisateur (juste un tour qui ne s'enregistre jamais). Corrigé en
     branchant `doAdd()`/`compactTourRemove()` sur `p1WriteTourSlot()` (écriture réelle sur
     `courses/{fc}`, même mécanisme que le modal détaillé). Bug annexe trouvé en corrigeant
     celui-ci : `p1WriteTourSlot`/`setSaveIndicator` sont déclarés dans un
     `<script type="module">` et n'étaient jamais exposés sur `window` — invisibles depuis le
     script classique du mode compact (`ReferenceError` observé en test réel) — ajout de
     `window.p1WriteTourSlot = ...` / `window.setSaveIndicator = ...`, avec appels rendus
     tolérants (wrapper `typeof X==='function' ? X : window.X`) par prudence. `saveUserData()`
     elle-même neutralisée en no-op côté écriture Firestore (le reste de la fonction —
     retry/fallback local — n'est plus jamais atteint, laissé en l'état) : ~30 sites appellent
     encore `debouncedSave()`/`saveUserData()` dans le code hérité de TypixClin pour des
     champs (`items`/`trainings`/`checklistData`/`planningData`) qui ont chacun leur propre
     listener/writer dédié depuis les vagues de migration précédentes — cette écriture ne
     pouvait donc qu'échouer, sans plus rien persister de réel. **Testé réellement** : tour
     ajouté puis retiré en mode compact, vérifié à chaque étape dans Firestore
     (`courses/{fc}.tourConfidences`/`tourDates`/`tourCount`), aucune erreur console restante.
  2. **Bug réel, cause racine du "numéro en suite de lettres"** : le champ "Numéro" du modal
     "Nouveau cours"/"Modifier le cours" (`openItemModal`) était purement décoratif —
     `upsertItem()` n'écrivait jamais `num` sur Firestore (nouveau cours → id auto-généré par
     Firestore, ignorant ce qui était saisi/suggéré par `nextItemNumber()`), et
     `rebuildStateFromLive()` réaffecte ensuite systématiquement `num: c.id` (l'id Firestore
     réel) à la relecture. Un "1" saisi/suggéré à la création finissait donc toujours remplacé
     par un id aléatoire. Champ retiré (ainsi que "Item de référence", même symptôme :
     `reference: false` figé côté lecture, jamais écrit côté sauvegarde, pour un réglage
     "Périmètre" de toute façon désactivé). Le vrai numéro d'affichage vient maintenant de
     `p1GetDisplayNum()`/`item.displayNum` (nouveau, calculé dynamiquement par ordre
     alphabétique matière puis cours — P1 n'ayant pas de programme officiel figé, c'est la
     meilleure approximation stable disponible), utilisé à la fois dans la colonne "N°" du
     tableau et dans l'en-tête du modal de notes (`COURS N°X`, via l'attribut `data-num` lu
     par un `::after` CSS — le texte réel était caché par `font-size:0`, seul l'attribut
     compte). **Testé réellement** : nouveau cours créé sans le champ Numéro, vérifié dans
     Firestore (id auto-généré, aucun champ `num`), numéro "3" affiché correctement dans le
     tableau et dans le modal de notes, cohérent entre les deux.
  3. Bouton "Nouvel item" / titre de modal "Nouvel item"/"Modifier l'item" → "Nouveau cours"/
     "Modifier le cours" (bouton principal, état vide de la page Items, panneau "Gérer").
  4. Planning, modal "Organisation de la journée" (vue étendue d'un jour) : bouton "+
     Spécialités" et popup de sélection encore intitulés "Spécialités" → "Matières" (ratés par
     le 1er passage, qui ne couvrait que les badges des cellules calendrier et le petit popup
     inline, pas cette vue étendue) ; badges de matière sans fond (`m.class`/`sp.class`, classes
     CSS figées `spe-cardio` etc. inexistantes pour une matière créée par l'utilisateur) →
     style inline `background/color/border-color` basé sur `m.color`/`sp.color`, même correctif
     que la 1ère vague. Mini-popup spécialité (clic direct "+ Matière" sur une cellule
     calendrier) : titre statique "Spécialités" → "Matières" (HTML figé, raté par le 1er
     remplacement global qui ne touchait que le texte généré en JS).
  5. Entraînements : 3 matières fantômes ("Radiologie"/"Génétique"/"Médecine générale", RAD/
     GEN/MGE) apparaissaient systématiquement dans le sélecteur de matières de chaque
     utilisateur, qu'il les ait créées ou non. Cause : `TRAIN_EXTRA_SHORT`/`TRAIN_EXTRA_CONFIG`
     — les "matières transversales" du programme officiel EDN de TypixClin — étaient fusionnées
     sans condition dans `TRAIN_SPECIALTY_SHORT`/`TRAIN_SPECIALTY_CONFIG` à 2 endroits
     (initialisation + `rebuildTrainingConfig()`). P1 n'a pas de programme officiel : fusion
     retirée aux deux endroits, la liste ne contient plus que les matières réelles de
     l'utilisateur.
  6. Balayage complémentaire de vocabulaire "spécialité(s)" → "matière(s)" sur du texte
     réellement visible trouvé en marge des points ci-dessus : légendes du carrousel de
     présentation publique du tableur (page hors-ligne), message d'état vide "Aucune
     spécialité ne correspond" (filtre Matières).
  Note honnête : `nextItemNumber()` reste défini mais n'a plus aucun appelant (dead code
  laissé en l'état, retrait non nécessaire) ; le fait que le fichier `tableur.html` utilise des
  fins de ligne CRLF a été découvert en cours de session (source de plusieurs échecs de
  correspondance d'`Edit` sur des blocs multi-lignes, contournés via un script Node ciblé par
  numéros de ligne) — à garder en tête pour toute future édition multi-lignes de ce fichier.
- [x] **3e vague de retours d'usage réel (2 points)** — corrigés et testés via Browser tool +
  Emulator :
  1. Numéro de cours (colonne "N°" du tableau) réaffiché **au-dessus** des boutons Notes/To-do
     plutôt qu'à côté (mise en page en colonne au lieu d'une ligne) — demande directe suite au
     correctif du point précédent.
  2. **Bug réel, même famille que les correctifs Présentation/notif feedback de la vague
     précédente** : la pastille rouge "Nouveautés" (menu profil) ne disparaissait jamais après
     consultation. Cause identique : `_markSeen()`/`_checkWhatsNewNotif()` (modal Nouveautés,
     `whatsNewSeen_v4`) lisaient/écrivaient sur `users/{uid}` (backend-only, `allow write: if
     false`) au lieu de `users/{uid}/settings/preferences` — l'écriture échouait en silence
     (deux `.catch()` imbriqués), donc la lecture au chargement suivant retrouvait toujours
     "non vu" et rallumait la pastille, même si `localStorage` avait bien enregistré la vue sur
     cet appareil. Corrigé aux deux endroits. **Bug identique trouvé et corrigé au passage**
     dans `setMode()`/`_checkToursViewMode()` (préférence affichage des tours détaillé/compact,
     `toursViewMode`) : même écriture sur `users/{uid}`, jamais persistée côté Firestore — la
     préférence ne synchronisait donc jamais entre appareils (elle semblait fonctionner car
     `localStorage` la sauvait quand même sur l'appareil courant, masquant le problème).
     **Testé réellement** : modal Nouveautés ouvert, `settings/preferences.whatsNewSeen_v4:
     true` vérifié dans Firestore, page rechargée, pastille rouge confirmée absente sur
     l'avatar ET dans le menu profil.
- [x] **Barème de confiance configurable (5 ↔ 10)** — nouvelle fonctionnalité demandée par
  l'utilisateur, avec conversion automatique de toutes les données existantes.
  - Réglage `users/{uid}/settings/preferences.confidenceScale` (5 par défaut, historique).
    Nouvelle carte dans Paramètres (switch segmenté "Sur 5" / "Sur 10"), avec avertissement
    explicite affiché en permanence sous le switch ("changer de barème convertit vos
    données") en plus de la confirmation détaillée à chaque changement.
  - **Migration atomique** (`p1MigrateConfidenceScale`) : convertit `tourConfidences[]` sur
    TOUS les cours de l'utilisateur ET écrit le nouveau barème dans le MÊME `writeBatch`
    Firestore — soit tout aboutit ensemble, soit rien n'est écrit (jamais d'état incohérent
    "barème changé mais valeurs pas toutes migrées", jamais de perte de donnée : tourDates/
    tourDurations/tourSupports/tourCount et tous les autres champs des cours restent
    intouchés). Tables de conversion EXACTES fournies par l'utilisateur (5→10 :
    1→2·2→4·3→6·4→8·5→10 ; 10→5 : 1-2→1·3-4→2·5-6→3·7-8→4·9-10→5), aucun calcul par
    arrondi/proportion.
  - **Confirmation explicite avant conversion** (`showCustomConfirm`, exigence directe de
    l'utilisateur) : détaille la table de conversion complète et avertit que la conversion
    10→5 n'est pas parfaitement réversible (deux niveaux proches fusionnent). Bug réel trouvé
    et corrigé en testant : la modale de confirmation s'ouvrait bien mais restait **invisible**,
    cachée derrière le modal Paramètres (`.custom-modal-overlay` en z-index 10000 contre
    `.settings-modal-overlay` en 10200) — remontée à 10300.
  - **Couleurs** : dégradé rouge → vert propre sur 10 niveaux (`html[data-conf-scale="10"]`,
    PAS une réutilisation des 5 couleurs existantes comme préfixe — un niveau 5/10 n'est que
    le milieu de l'échelle, il ne doit pas ressortir en vert foncé comme un 5/5 "parfait" sur
    l'ancien barème), y compris thème pastel. Bug réel trouvé et corrigé en testant : la
    pastille de confiance en mode compact (`CONF_COLORS`, objet JS séparé des variables CSS)
    n'avait que les clés 1-5, un niveau 6-10 y tombait sur `undefined` → couleur grise au lieu
    de la couleur attendue.
  - **Boutons de confiance rendus dynamiquement** selon le barème courant (avant : 5 boutons
    figés en HTML), aux deux endroits où on peut noter un tour — modal détaillé
    (`#confidence-buttons`, utilisé aussi bien pour le "+" du tableau que pour la To-do list
    et le raccourci "Valider un tour" du modal de notes, qui passent tous par la même
    `openConfidenceModal()`) et popup compact (`openCompactConfPicker`, sur 2 lignes de 4-5
    pour 10 niveaux plutôt qu'une seule ligne de 10 boutons illisible). Écouteurs de clic
    passés en délégation sur le conteneur parent (au lieu d'un listener par bouton) pour
    survivre à la régénération dynamique. Testé sur mobile (375px) : les deux restent
    lisibles et tactiles (boutons resserrés via `[data-conf-scale="10"]` en cascade avec les
    media queries existantes).
  - **Stats et priorités** : toutes les mentions "/5" figées (cartes matière, stat "Ressenti
    moyen du jour", graphique hebdomadaire Chart.js — axe Y max figé à 5 corrigé) rendues
    dynamiques. La formule de score de priorité utilise déjà une normalisation min-max
    relative aux valeurs réellement observées (pas de division par 5 figée) : aucun
    changement nécessaire là, seule la valeur de repli pour un cours jamais travaillé (3,
    milieu de l'ancien barème) a été rendue proportionnelle au barème courant. Le "jour
    parfait" (trophée) et le graphique hebdomadaire recalculent déjà tout EN MÉMOIRE depuis
    `courses.tourConfidences` à chaque rendu (jamais depuis un agrégat Firestore figé) : ils
    reflètent donc la migration automatiquement, sans traitement séparé.
  - **Testé réellement, cycle complet** : 5→10 (mapping vérifié champ par champ dans
    Firestore), 10→5 (retour EXACT aux valeurs d'origine sur les nombres pairs testés,
    confirmant le calcul), confirmation annulée (aucun changement), confirmation acceptée,
    rechargement de page (barème persisté), saisie d'un tour en mode détaillé ET en mode
    compact sous barème 10 (valeurs 6 et 7 enregistrées et vérifiées dans Firestore),
    affichage mobile (375px) des deux sélecteurs.
  - Non traité, volontairement hors périmètre : le champ `lastTourConfidence` (présent sur un
    document de test mais jamais lu par aucun code du tableur — probablement une donnée de
    seed antérieure à cette session) n'est pas migré, sans impact puisque rien ne l'affiche.
- [x] **Retouches sur le barème de confiance (6 points)**, suite à un premier essai utilisateur
  réel :
  1. Modal détaillé (ajouter/modifier un tour), barème sur 10 : **2 rangées forcées de 5**
     (le `flex-wrap` naturel donnait 8+2 selon la largeur disponible) —
     `renderConfidenceButtons()` construit maintenant deux `.confidence-buttons-row`
     explicites plutôt qu'une liste à plat.
  2. **Bug numéro de cours, une occurrence oubliée** : le modal "Enregistrer/Modifier un tour"
     affichait encore `item.num` (id Firestore brut, ex. `#I8eEfRTRrTZbw1NpsaHo`) dans sa carte
     contextuelle — raté lors du correctif précédent, qui couvrait le tableau et le modal de
     notes mais pas ce troisième affichage. Corrigé via `p1GetDisplayNum()`, comme les deux
     autres.
  3. Paramètres, carte Barème de confiance : "Barème historique" → "Barème par défaut".
  4. **Modal de confirmation entièrement redessiné** : même en-tête unifié (icône + titre +
     croix de fermeture) que les autres modales du tableur (`buildModal()`/
     `.unified-modal-header`), boutons au style "TypixClin" (`.tpx-btn`/`.tpx-btn-primary`).
     Scopé à `#custom-confirm-modal` uniquement : les 2 autres appelants de
     `showCustomConfirm()` (restauration de sauvegarde locale/cloud) gagnent la même
     cohérence visuelle sans rien casser — les modales d'alerte/erreur, qui partagent la même
     classe `.custom-modal` mais gardent leur look centré d'origine, ne sont pas affectées
     (overrides scopés par ID).
  5. Mention "cette conversion n'est pas parfaitement réversible" retirée, sur demande directe.
  6. **Table de conversion redessinée en pastilles colorées** (`.cs-map-*`, nouveau) au lieu
     d'une ligne de texte brute — chaque valeur affichée dans sa vraie couleur de barème
     (palette dupliquée en JS, `CS_COLORS_5`/`CS_COLORS_10`, plutôt que lue depuis les
     variables CSS `--confidence-N` : celles-ci reflètent le barème COURANT au moment d'ouvrir
     la confirmation, donc encore l'ancien — nécessaire pour que les pastilles "départ" et
     "arrivée" ne partagent jamais la même palette par erreur).
  Bug réel trouvé et corrigé en testant ce redesign : `showCustomConfirm()` attachait ses
  gestionnaires de clic via `addEventListener` sans jamais les retirer avant qu'une nouvelle
  confirmation ne s'ouvre — deux appels qui se chevauchent (repéré en testant le va-et-vient
  5→10→5 rapidement) empilaient les gestionnaires, et un clic sur "Confirmer" résolvait alors
  DEUX promesses à la fois, déclenchant l'action deux fois (écriture Firestore en double,
  HTTP 400 côté émulateur). Remplacé par une affectation directe (`.onclick =`), qui remplace
  proprement le gestionnaire précédent au lieu de l'empiler — corrige ce cas pour les 3
  appelants de `showCustomConfirm()`, pas seulement le nouveau.
  **Testé réellement** : les 2 sens de conversion avec le nouveau design (mapping coloré
  vérifié visuellement pour les deux barèmes, y compris le regroupement "1 et 2 → 1" en
  10→5), bouton croix et bouton Annuler (aucun changement appliqué dans les deux cas,
  vérifié dans Firestore), rendu mobile (375px) du modal de confirmation, 2 rangées de 5
  confirmées dans le modal détaillé, numéro de cours "#1" vérifié dans la carte contextuelle
  du modal de tour.
- [x] **4e vague (4 points)**, retours d'usage réel sur les livrables précédents :
  1. **Popup compact, barème 10 : mise en page corrigée**. Le picker construisait encore une
     seule rangée qui se mettait à la ligne selon la largeur disponible (4+4+2 : 3 lignes,
     titre "Nouveau niveau de confiance" poussé hors du cadre visible — signalé comme
     inacceptable). Reconstruit en 2 rangées FORCÉES de 5 (même technique que le modal
     détaillé), avec les MÊMES pastilles 44px qu'à 5 (demande explicite : pas de
     resserrement), largeur inchangée (260px, déjà dimensionnée pour 5 pastilles), hauteur du
     picker augmentée (80 → 130px) pour la 2e rangée.
  2. **Bug numéro de cours dans la To-do list** : l'id Firestore brut du cours apparaissait
     tel quel dans le texte de la tâche (ex. "hFEpYtfLyf5RE2R1SiZz - Asthme"), racine commune
     à `addItemFromTable()` (tableau, priorité, raccourci du modal de notes) — corrigé en
     préfixant avec `p1GetDisplayNum()` au lieu de l'id brut. Les tâches déjà créées avant ce
     correctif gardent leur ancien texte figé (le champ `text` est stocké, pas recalculé à
     l'affichage) : il faut les retirer puis les rajouter une fois pour qu'elles reprennent le
     bon texte — pas de script de réparation automatique lancé (portée volontairement limitée
     aux nouvelles tâches).
  3. **"Impossible de sélectionner un numéro de cours" en créant un cours** : régression du
     retrait précédent du champ "Numéro" (jugé purement décoratif). Clarifié avec
     l'utilisateur : c'est bien le champ du modal "Nouveau cours"/"Modifier le cours" qui
     manquait. Réintroduit, cette fois **réellement fonctionnel** — nouveau champ Firestore
     `courses/{fc}.courseNum`, séparé de l'id du document (jamais utilisé comme clé de
     progression, donc éditable sans risque, y compris pour un cours déjà existant :
     l'ancienne restriction "verrouillé après création" n'a plus lieu d'être). Optionnel,
     unique PAR MATIÈRE (validation à la saisie), chiffres uniquement. `p1ComputeDisplayNums()`
     (nouveau, remplace la logique dupliquée de `p1GetDisplayNum()`/`renderItemsTable()`)
     calcule le numéro affiché de CHAQUE cours d'une matière en une seule passe : priorité au
     `courseNum` choisi, repli alphabétique pour les cours sans numéro choisi — casé APRÈS le
     plus grand `courseNum` de la matière pour ne jamais entrer en collision avec lui.
     Numérotation passée de globale (tous cours confondus) à **par matière**, plus cohérente
     avec ce système et avec la convention déjà en place pour `nextItemNumber()` (suggestion
     de numéro, non pré-remplie — le champ reste vide par défaut, avec l'exemple "1" en
     `placeholder`, pour bien marquer son caractère optionnel).
  **Testé réellement** : popup compact sur 10 (2 rangées de 5, pastilles pleine taille,
  titre visible, valeur sauvegardée et vérifiée dans Firestore), cours créé avec un numéro
  choisi (5) — vérifié dans Firestore (`courseNum: 5`), les 2 cours existants sans numéro
  automatiquement recalés à 6 et 7 (pas de collision), refus correct d'un numéro déjà pris
  dans la même matière, tâche To-do créée depuis ce cours affichant bien "5 - ..." et non
  l'id Firestore, suppression du cours de test → les 2 cours restants reviennent
  automatiquement à 1 et 2.
- [x] **Bug numéro brut, dernières occurrences** — signalé sur le panneau "Gérer mon
  programme" (`renderManagerList()`, liste des cours de ce panneau, distincte du tableau
  principal : affichait `i.num`, l'id Firestore, tel quel devant chaque cours). En
  corrigeant celui-ci avec `p1ComputeDisplayNums()`, un balayage complet de `item.num`/`it.num`
  dans tout le fichier a permis de trouver et corriger **3 autres occurrences du même bug**,
  jamais signalées mais bien présentes :
  - La carte "Cours à revoir en priorité" du tableau de bord (`renderPriorityItems()`)
    affichait "Item {id Firestore} — {nom}" (en profitait pour renommer "Item" → "Cours").
  - Les deux modales "Tours effectués aujourd'hui" / "Tours effectués cette semaine"
    (`collectToursToday()`/`collectToursWeek()`, deux fonctions quasi jumelles), qui
    affichaient l'id Firestore dans la pastille numérotée de chaque ligne.
  **Testé réellement** : panneau "Gérer" ("1 — Asthme"/"2 — Insuffisance cardiaque"), carte
  "Cours à revoir en priorité" ("Cours 2 — Insuffisance cardiaque", confiance "7.0/10"), et
  modale "Tours de la semaine" (pastille "1 — Asthme" au lieu de l'id Firestore, confiance
  "7.0/10") — un tour de test daté du jour même a dû être ajouté directement dans l'Emulator
  pour peupler ces deux dernières vues, puis retiré une fois la vérification faite.
- [x] **Trophées : suppression de la catégorie "Complétion du programme"** — n'avait plus de
  sens signalé par l'utilisateur. Retrait du bloc HTML (`#trophies-progress` et son
  conteneur), du tableau `progress: [...]` (6 trophées `prog_5`…`prog_90`, basés sur
  `stats.progressPercent`) dans le catalogue `TROPHIES`, de l'entrée correspondante dans
  `renderTrophies()`, et de la puce d'aide associée (qui citait au passage un total de
  "747 items" propre à l'EDN TypixClin, sans rapport avec P1). `stats.progressPercent`
  lui-même n'est PAS supprimé : toujours utilisé par l'anneau de progression de la page
  Stats, sans rapport avec les trophées.
  **Régression détectée et corrigée avant de considérer la tâche finie** : deux gardes
  d'initialisation de `TrophiesSystem.init()` (`DOMContentLoaded` + clic `.app-nav-btn`)
  testaient l'existence de `#trophies-progress` comme simple proxy « le DOM des trophées
  est-il monté ? ». Sans corriger, la suppression de cet élément aurait empêché
  `TrophiesSystem.init()` de tourner pour TOUTES les catégories restantes, pas seulement
  celle supprimée. Repointées sur `#trophies-daily`.
  **Testé réellement** (navigateur + Emulator) : `#trophies-progress` bien absent du DOM,
  `#trophies-daily`/`#trophies-weekly`/`#trophies-general` toujours peuplés (6 trophées
  chacun, régression des gardes d'init confirmée corrigée), aucune occurrence résiduelle de
  "Complétion du programme" nulle part sur la page.
- [x] **Planning : statuts remplacés par Révision / Séminaire / Repos / Examen** — l'ancien
  jeu de statuts (Stage, Révision, Garde, Repos, Autre) n'avait plus de sens pour P1Planner.
  Deux configurations indépendantes trouvées et alignées :
  - Mini popup statut sur les cases du calendrier (HTML statique `#status-popup`) : boutons
    stage/garde/autre renommés/retirés → revision/seminaire/repos/examen.
  - `STATUS_CFG`/`STATUS_ORDER` (config dynamique utilisée par `buildStatusGrid()` dans le
    modal "Organisation de la journée") : même bascule, avec des couleurs accent alignées
    sur celles du mini popup (`seminaire` orange #f97316, `revision` vert #10b981, `examen`
    rouge #ef4444, `repos` violet #8b5cf6).
  CSS mises à jour dans les 3 thèmes (clair, sombre, pastel) : `.status-mini-btn.*`,
  `.calendar-day.status-*`, `.day-status-badge.*`, `.legend-dot.*` (ce dernier bloc CSS
  écrit mais actuellement mort — aucun générateur HTML/JS ne pose la classe `legend-dot`
  dans le DOM, vérifié par recherche globale ; renommé quand même par cohérence). Carte de
  correspondance `statusLabels` (doublon de `STATUS_CFG` utilisé ailleurs dans le fichier)
  mise à jour. `fillWeekWithStatus()` (case "remplir toute la semaine" du mini popup) :
  l'ancien cas spécial "stage → 5 jours (lun-ven)" conservé et rebaptisé pour `seminaire`
  (analogie professionnelle/formation la plus proche) ; l'ancien cas "garde → 1 seul jour
  (lundi)" retiré (pas d'équivalent logique pour `examen`, qui remplit désormais les 7 jours
  comme révision/repos par défaut — à confirmer avec l'utilisateur si un comportement
  différent est attendu).
  **Testé réellement** (navigateur + Emulator) : mini popup statut sur case calendrier
  (Séminaire et Examen appliqués et retirés, couleurs/badges corrects) ET modal
  "Organisation de la journée" → dropdown Statut (Révision appliqué, en-tête/couleur mis à
  jour) — les 3 jours de test remis à "Aucun" après vérification. Thème clair uniquement
  vérifié en direct ; sombre et pastel relus dans le code mais pas testés visuellement.
- [x] **Modal Notes : suppression du switch "Notes / Reçues"** — n'avait plus de sens
  signalé par l'utilisateur (P1Planner n'a pas de système ami/partage, voir
  `docs/DECISIONS.md`). Suivi le même principe déjà en place pour `#notesShareBtn` :
  masqué via `style="display:none !important;"` plutôt que retiré du DOM, car
  `switchNotesMode()` et le compteur `#notesSharedBadge` référencent encore ces éléments à
  plusieurs endroits et gèrent déjà correctement leur absence visuelle (reset forcé sur
  `'perso'` à chaque ouverture du modal notes, déjà en place avant cette modification). Une
  passe de nettoyage complet du code mort associé (panel `#notesSharedPanel`,
  `switchNotesMode('shared')`, etc.) reste à faire séparément. Au passage, retrait du
  `padding-right: 118px` réservé pour ce switch dans la toolbar mobile/tablette de
  `#notesModalOverlay` (scindé de la règle equivalente pour `#speErrOverlay`, qui elle n'a
  jamais eu cet élément dans son DOM et reste inchangée).
  **Testé réellement** (navigateur + Emulator) : `getComputedStyle` confirme
  `display:none` sur `.notes-toolbar-switch-wrapper`, et modal Notes ouvert sur un vrai
  cours ("Cours n°1 — Asthme") — toolbar propre, switch absent, pas d'espace mort visible.
- [x] **Flashcards classées par item/cours** — portage de l'évolution EDN/ECOS, adaptée à
  l'architecture réelle de ce fichier (audit préalable, voir résumé donné à l'utilisateur :
  SDD est du code mort ici — `APP` vaut toujours `'edn'`, seul `state.items`/collection
  `courses` compte ; pas de risque de collision d'ID, les cours ont un id Firestore
  auto-généré jamais réutilisé ; la cascade de suppression de flashcards héritée d'EDN/ECOS
  était déjà morte et non appelée, comportement conservé tel quel).
  - **Modèle de données** : `itemId` ajouté au doc flashcard (`speId, recto, verso, itemId,
    interval, nextReview, lastReview, createdAt, updatedAt, source`). Jamais de migration
    massive — une carte sans `itemId` reste "Non classé" indéfiniment. Création : `itemId`
    toujours explicite (y compris `null`). Édition : `itemId` omis du payload sauf si le
    picker a été réellement touché (`itemIdTouched`), protection concurrence multi-onglets
    via `merge:true`. `_flashEffectiveItemId()`/`_flashItemExists()` traitent un `itemId`
    orphelin (item supprimé) comme réellement "Non classé", picker inclus, pas seulement à
    l'affichage.
  - **Sélecteur de classement** : nouveau `_flashItemPickerHtml()`/`_bindFlashItemPicker()`
    dans le module flashcards, réutilisant les classes CSS `.tpx-picker` existantes (pas de
    nouveau composant). "Non classé" toujours en premier, pastille numéro + nom seul (jamais
    "Item X — Nom"), bouton fermé recopie directement le DOM de l'option cliquée.
  - **Bouton Flashcard dans les Notes** : premier bouton du header (`#notesFlashBtn`,
    dégradé identique à `.flash-global-btn`), ouvre `openFlashEdit()` avec matière ET item
    verrouillés (`.tpx-picker-locked`). Check bref déclenché uniquement après confirmation
    Firestore réelle (`window.openFlashCardFromNotes(speId, itemId, onSaved)`), jamais de
    façon optimiste.
  - **Panneau Notes remplace "Objectifs de connaissance"** (demande complémentaire de
    l'utilisateur) : `OIC_DATA` confirmé vide par construction dans `data.js`
    ("aucun équivalent pour des cours créés librement") — 100% mort pour P1Planner, jamais
    un seul objectif affiché. `#notesInfoPanel`/`#oicList`/`#oicExpandBtn` conservés (CSS/JS
    d'agrandissement partagé inchangés) mais repeuplés par `window.renderNotesFlashPanel()` :
    flashcards du cours ouvert uniquement, réviser sur place, créer sans quitter la note.
  - **Cahier d'erreurs groupé par item** : `_buildFlashManageHTML()` réécrite —
    `_flashGroupCards()` regroupe par classement ("Non classé" en premier si des cartes en
    ont, puis chaque item dans l'ordre d'affichage habituel), jamais de groupe vide.
    En-tête compact (pastille numéro/nom tronqué+infobulle, pastille compteur, bouton
    "Réviser ce groupe" via `_flashStartGroup()`) qui ne mélange jamais deux items.
  - **Suppression d'item fail-closed** : `deleteItem()` appelle désormais
    `unlinkFlashCardsFromItem()` (reclasse en masse `itemId: null`, jamais de suppression)
    et **attend** le résultat avant d'archiver le cours. Échec → cours **non** archivé,
    message clair affiché, testé réellement (fonction monkey-patchée pour simuler une panne
    réseau). Suppression de matière (`deleteSpecialty()`) volontairement **non touchée** :
    audit confirmé qu'elle ne supprime déjà pas les flashcards (cascade EDN/ECOS jamais
    branchée dans ce fichier) et que le texte de confirmation ne les mentionne pas — c'est
    déjà le comportement le plus sûr, rien à changer.
  - **Bug préexistant trouvé et corrigé UNIQUEMENT sur ce nouvel appel** : `showCustomAlert()`
    attend un objet `{message, type, ...}`, mais plusieurs appelants existants (
    `deleteSpecialty`, `upsertSpecialty`, `upsertItem`, l'ancien `deleteItem`) l'appellent
    avec une chaîne + une chaîne (`showCustomAlert('...', 'error')`) — `options.type`/
    `.message` valent alors `undefined`, l'alerte s'affiche donc **vide avec une icône
    succès** au lieu du message d'erreur voulu. Repéré en testant la panne réseau simulée
    (alerte vide constatée), corrigé sur le nouvel appel de `deleteItem` seulement (objet
    correct désormais, testé réellement — icône rouge, titre et message corrects). Les
    autres appelants existants ont le même bug mais restent **hors périmètre** de cette
    mission — à corriger séparément si demandé.
  - **Session par groupe/item** : `_flashStartGroup()` (Cahier d'erreurs) et le panneau Notes
    réutilisent tous deux `startFlashSession()` existant, jamais de nouveau moteur.
  - **Nouveautés** : nouvelle section ajoutée au contenu du modal (`#whatsNewModalOverlay`)
    sans toucher à `whatsNewSeen_v4`/`whatsNew_seen_v4` — confirmé (lecture du code) que ce
    mécanisme est un simple booléen "vu/pas vu" totalement déconnecté du contenu HTML :
    aucune notification ne se déclenche pour les comptes existants.
  - **Firestore Rules** : aucune modification nécessaire (`canWrite()` ne restreint pas les
    champs) — confirmé, fichier non touché.
  - **Session Flash (tiroir multi-matières, `openFlashDrawer`) : NON portée dans cette
    passe.** Explicitement conditionnelle dans la demande ("si tu la portes"). L'ambition
    demandée (sous-panneaux par item avec bascule "Toutes les flashcards"/"Choisir des
    items", pastilles "X dues" par item, bouton "Tout sélectionner" bistable piloté par état
    explicite, cases à cocher personnalisées défensives, animations `max-height`, z-index
    dédié) est un chantier UI à part entière, distinct du modèle de données et de la
    sécurité des données qui étaient la priorité absolue de cette mission. Reporté par choix
    délibéré plutôt que livré à la hâte et non testé — voir le rapport donné à l'utilisateur
    pour le détail.
  **Testé réellement** (navigateur + Emulator, matière "Cardiologie", cours "Asthme" et
  "Insuffisance cardiaque" + un cours jetable créé puis supprimé pour le test) : les 8
  scénarios de test ci-dessous, tous passés, données vérifiées directement dans Firestore
  après chaque étape (pas seulement à l'écran) :
  1. Carte ancienne sans `itemId` → "Non classé" à l'affichage, édition texte seul →
     `itemId` toujours absent du document après sauvegarde.
  2. Carte classée, édition texte seul → classement intact (recoupé avec le test 6).
  3. Reclassement volontaire Asthme → Insuffisance cardiaque → Non classé → chaque étape
     écrite correctement, y compris le `itemId: null` explicite final.
  4. Suppression d'item avec déliaison en échec simulé (`unlinkFlashCardsFromItem`
     monkey-patchée) → cours **non** archivé (`archivedAt: null` vérifié), flashcard
     intacte, message d'erreur clair affiché (après correctif `showCustomAlert`).
  5. Suppression d'item avec déliaison réussie → cours archivé (`archivedAt` posé), la
     flashcard liée conservée avec `itemId: null` (jamais supprimée).
  6. Concurrence multi-onglets : "onglet B" simulé (écriture Firestore directe reclassant
     une carte), puis "onglet A" sauvegarde un texte sans avoir touché le picker (resté sur
     l'ancienne valeur affichée) → le classement de l'onglet B **survit**, non écrasé.
  7. Brouillon avec reclassement + panne réseau simulée (`addDoc` monkey-patché) → à la
     réouverture du formulaire "Nouvelle carte", recto/verso/classement tous restaurés
     (classement réappliqué via clic natif sur l'option, confirmé visuellement).
  8. Création depuis le bouton Flashcard des Notes → item verrouillé (pastille + cadenas
     visibles), `itemId` correctement écrit (vérifié Firestore), carte visible dans le bon
     groupe du Cahier d'erreurs et dans le panneau Notes après rafraîchissement.
  Mode custom/officiel (test 9 du prompt) : **non applicable** à P1Planner — confirmé par
  l'audit, il n'existe qu'un seul mode ici (P1 n'a jamais de programme officiel). Données de
  test nettoyées après vérification (cartes et cours jetables supprimés directement via
  script Admin SDK sur l'Emulator).
- [x] **Session Flash (tiroir multi-matières) portée** — reprise du point resté en attente de
  la mission précédente. Sous-panneau par matière cochée : "Toutes les flashcards" (défaut)
  ou "Choisir des items" (dont "Non classé"), pastille "X dues" par item uniquement si
  due > 0. État par matière (`_flashDrawerState[speId] = {checked, mode, items:Set}`),
  jamais recalculé depuis les cases à cocher :
  - "Uniquement les dues" : matières sans due décochées, matières avec due passées en
    "Choisir des items" avec seulement les items dus cochés ; ne bleuit jamais "Tout
    sélectionner" par coïncidence (état séparé, `_flashDrawerSelectAllOn`, reset explicite).
  - "Tout sélectionner" devient une vraie bascule (bistable) : tout coche/décoche, repasse
    chaque matière sur "Toutes les flashcards" (jamais de filtre "dues" résiduel), libellé et
    couleur changent en conséquence — piloté uniquement par le bouton lui-même, jamais
    recalculé depuis l'état des cases (un clic manuel sur une case le désactive).
  - Case à cocher personnalisée : **bug réel trouvé** — une règle `accent-color` plus bas
    dans le fichier (`.flash-drawer-item input[type=checkbox] { accent-color: ... }`) entrait
    en conflit avec le `appearance:none` du style personnalisé existant, rendant la coche
    invisible sur certains moteurs. Corrigé défensivement (`!important` + doublon de
    sélecteur `[type=checkbox]`/`[type="checkbox"]`, comme demandé) plutôt que de retirer la
    règle en conflit (cause exacte non traquée plus loin).
  - Animation du sous-panneau ET de la liste d'items via `max-height`+`overflow:hidden`
    (jamais `grid-template-rows`). Piège du `gap` évité : `.flash-drawer-subpanel` n'est PAS
    un flex container avec `gap` (aurait laissé un espace résiduel même à 0 de haut) — la
    marge est portée par `.flash-drawer-mode-toggle` (toujours affiché), jamais par le
    parent.
  - `z-index` dédié (`10200 !important`, cohérent avec `.flash-edit-overlay`/
    `.flash-session-overlay`) — l'ancien `var(--z-modal)` (300) passait derrière la pastille
    essai/premium (`.tpx-trial-fab`, 1300), confirmé et corrigé, revérifié via
    `elementFromPoint()` (le tiroir intercepte bien les clics par-dessus la pastille).
  - Toutes les fonctions appelées depuis le HTML généré (`window._flashDrawerMatiereToggle`,
    `window._flashDrawerSetMode`, `window._flashDrawerItemToggle`) vérifiées exposées.
  **Testé réellement** (navigateur + Emulator, matière Cardiologie avec 3 cartes réparties
  Non classé/Asthme (dues) + Insuffisance cardiaque (pas due)) : ouverture du sous-panneau à
  la coche, bascule "Choisir des items" avec pastilles dues correctes, décochage d'un item et
  mise à jour du compteur, "Uniquement les dues" (sélection correcte + bouton "Tout
  sélectionner" resté gris, vérifié via `className` JS), "Tout sélectionner" aller-retour
  (bleu/"Tout désélectionner" puis gris/"Tout sélectionner", sous-panneaux animés dans les
  deux sens), lancement réel d'une session avec le résultat attendu ("Carte 1/2"), verrou de
  scroll ouverture/fermeture, coches visibles à l'écran (bug accent-color confirmé résolu).
- [x] **Corrections diverses signalées** :
  - Scrollbar verticale ne disparaissant pas à l'ouverture du modal "Configurer les
    ressources" — `openResourcesConfigModal()`/`closeResourcesConfigModal()` ne verrouillaient
    jamais le scroll du body (contrairement aux autres modals). Ajouté le même mécanisme
    (`document.body.style.overflow='hidden'` + `window._setScrollbarComp()`). Testé réellement
    (`overflow`/`paddingRight` vérifiés avant/après ouverture ET fermeture).
  - Sélecteur de matières du modal "Organisation de la journée" vide à l'ouverture — la liste
    (`window._ednPlanningBridge.getSpecialties()`) dépendait du dernier `renderCalendar()` en
    date ; si le popup s'ouvrait avant le tout premier rendu complet du calendrier après le
    chargement des données, elle restait vide. Corrigé en resynchronisant
    (`syncPlanningSpecialties()`) à chaque appel de `getSpecialties()`, plutôt que de dépendre
    du timing d'un rendu externe. Testé réellement dès le tout premier chargement de page,
    sans navigation préalable sur Planning (le chip matière apparaît immédiatement).
  - Animation de la flèche du bouton "Réviser" (menu déroulant Tout réviser/Dues) : chevron
    figé, ne s'inversait jamais visuellement. Ajouté `.flash-review-chevron` + rotation
    `transform` sur l'état `.flash-review-btn-wrap.open`, piloté par `_flashOpenReviewDrop()`/
    `_flashCloseReviewDrop()`/le handler clic-en-dehors. Testé réellement (flèche vers le bas
    fermé, vers le haut ouvert, retour fermé).
  - Scrollbar latérale réapparaissant à l'ouverture du modal "Créer une flashcard" depuis le
    modal Notes : cause exacte non reproduite malgré plusieurs tentatives (`overflow`/
    `paddingRight` restaient corrects à chaque test), mais un vrai trou de robustesse trouvé
    en auditant le code : `_unlockBody()` (module flashcards) ne connaissait pas
    `notesModalOverlay` dans sa liste d'overlays à vérifier avant de déverrouiller, et
    `closeNotesModal()` ne connaissait pas `flashEditOverlay` — chacun des deux mécanismes de
    verrouillage ignorait l'existence de l'autre. Corrigé dans les deux sens (listes
    croisées), et `openFlashEdit()`/`_flashCloseEdit()` verrouillent/déverrouillent
    maintenant explicitement eux-mêmes (idempotent, sûr même si déjà verrouillé par Notes).
    **À reconfirmer si le symptôme réapparaît** : correctif défensif sur une incohérence
    réelle trouvée, pas une reproduction confirmée du bug exact décrit.

- [x] **Nettoyage produit et cohérence visuelle (lot autonome)** :
  - **Suppression des boutons LISA** : bouton "Ouvrir LISA" retiré du header du modal Notes
    (entre Flashcard et Tour), fonction `notesOpenLisa()` vidée (commentaire explicatif à la
    place du corps), `.btn-lisa` retiré du tableau des sélecteurs désactivés en mode hors
    ligne. Les mentions LISA du carrousel marketing/présentation publique n'ont volontairement
    pas été touchées (hors périmètre). Testé réellement : bouton absent du modal Notes, aucune
    erreur console.
  - **Chiffres autorisés dans les abréviations de matière** : le filtre de saisie
    (`openSpecialtyModal`) et la validation finale acceptaient uniquement `[A-Z]{1,3}` ;
    étendu à `[A-Z0-9]{1,3}` aux deux endroits. Testé réellement : `U2A` accepté tel quel dans
    le champ Abréviation du modal "Nouvelle matière".
  - **Harmonisation visuelle des panneaux flashcards (Notes ↔ Cahier d'erreurs)** : le
    panneau "Objectifs de connaissance" mort du modal Notes réutilisait déjà les classes
    `spe-flash-panel-*` (issu d'une demande précédente), mais leur style réel était scopé
    uniquement à `#speFlashPanel` (Cahier d'erreurs) dans une feuille dédiée — sur `#notesInfoPanel`
    le titre débordait et le bouton d'agrandissement semblait avoir disparu. Corrigé en dupliquant
    le bloc CSS scopé sous `#notesInfoPanel` (y compris variante sombre), titre raccourci
    ("Flashcards de ce cours" → "Flashcards") avec ellipsis/`min-width:0` de sécurité (absent de
    la version Cahier d'erreurs), badge de cartes dues ajouté (`#notesFlashDueBadge`, même
    logique que `updateSpeFlashBadge()`). Testé réellement, comparé côte à côte aux deux
    endroits.
  - **Suppression de la notion "cours de référence" / "collège associé"** (concept devenu sans
    objet dans le système à matières/cours libres) : bouton-filtre `#reference-dropdown` retiré
    de la barre de filtres de "Mes cours", `window._setReferenceFilterUI` et ses deux
    `addEventListener('change', ...)` supprimés, prédicat de filtrage simplifié
    (`matchReference`/`isReference`/`hasBadge` retirés de `renderItemsTable()`), rendu de ligne
    simplifié (plus de `referenceHtml`/`itemUrl` concaténés), carte statistique morte "Items de
    référence révisés" retirée de la page Stats (`#stat-ref-done`/`#stat-ref-percent`/
    `#progress-ref`) avec libellés adjacents recentrés sur le vocabulaire cours ("Items des
    collèges révisés" → "Cours révisés", "Cumulé sur tous les items" → "Cumulé sur tous les
    cours"), `refItemsWithOneTour`/`totalRefItems` retirés de `calculateStats()`, badge
    "Référence" retiré du header du modal Notes. Un bloc mort qui aurait fait planter le reset
    des filtres (`document.getElementById('filter-item-reference').value = 'all'` sans garde,
    sur un élément désormais inexistant) a été repéré et supprimé avant qu'il ne cause un
    `TypeError`. Confirmé via grep final : plus aucune référence à ce concept dans le fichier.
    Laissé intact (déjà inerte ou déjà masqué correctement) : `buildCustomEdn()` (peuple un
    objet `ref` jamais lu par l'UI), `_isReferenceItem()`, `MatiereBadgesSystem` (déjà masqué
    via `isCustom()`). Testé réellement : barre de filtres et page Stats propres, aucune erreur
    console.
  - **Retypage des entraînements** : les 5 anciens types EDN (masterclass / spé360 / annale /
    CCB / R2C) remplacés par 3 types génériques : Concours blanc (rouge `#dc2626`), Annale
    (ambre `#b45309`, couleur inchangée), Colle (violet `#7c3aed`). Mis à jour partout : options
    du filtre, boutons de sélection du modal d'ajout, toutes les tables de libellés/couleurs
    dupliquées (`TRAIN_TYPE_LBL`, `LABELS`, `TRAIN_TYPE_LABELS`, `TYPE_COLORS`, `TYPE_BG`,
    `TYPE_CLR`, `TYPE_BDR`, `TYPE_BORDER`, `TYPE_CLASSES`), CSS des pastilles/badges/boutons
    (clair + sombre + pastel), texte d'intro de la modale d'aide "entrainements", texte
    d'onboarding, placeholder du champ intitulé. Testé réellement : modal d'ajout (3 boutons,
    bonnes couleurs, sélection "Colle" fonctionnelle), dropdown de filtre à jour.
  - **Harmonisation des coins arrondis** : convention confirmée à `8px`
    (`var(--border-radius-md)`) sur les boutons interactifs du tableur (nav planning, filtres,
    pagination…). Corrigés les éléments qui utilisaient encore le rayon "pilule" complet
    (`var(--border-radius-full)`, 9999px) à tort : `.planning-year-badge` (badge année du
    header Planning), `.pagination-current` (pastille "1 / 1", 3 déclarations — base,
    `.header-pagination .pagination-current`), et le sélecteur "lignes par page"
    (`.pagination-dropdown .custom-dropdown-btn`/`.custom-dropdown-menu`, qui héritaient du
    rayon global `--border-radius-lg` à 16px sans override local) — ce dernier corrigé de façon
    scopée à `.pagination-dropdown` uniquement, pour ne pas toucher au rayon des autres
    dropdowns du site (`--border-radius-lg` reste global et inchangé). Ce correctif profite
    aussi bien à "Mes cours" qu'aux "Entraînements", les deux pages partageant les mêmes
    classes. Testé réellement sur les deux pages (`getComputedStyle` + captures) : badge année
    Planning, pastille "1/1", bouton et menu déroulant "50 / page" tous à 8px.
    **Oubli initial signalé par l'utilisateur, corrigé ensuite** : le vrai sélecteur "cases mois
    et année" du planning (`#month-dropdown`/`#year-dropdown`, deux boutons dépliants avec
    chevron, visibles uniquement en desktop large ≥ 1366px — masqués sur la fenêtre de test
    initiale, d'où l'oubli) héritait toujours du rayon global `--border-radius-lg` (16px) via la
    classe `.custom-dropdown-btn` de base. Ajouté un override scopé
    `.planning-date-selector .custom-dropdown-btn, .planning-date-selector .custom-dropdown-menu`
    à 8px (sans toucher au rayon global, ni aux autres dropdowns du site). Testé réellement en
    élargissant la fenêtre du navigateur à 1500px pour rendre le sélecteur visible : bouton et
    menu "Septembre"/"2026" confirmés à 8px via `getComputedStyle` et capture d'écran.
  - **Suppression du filtre "collège associé"** : couvert ci-dessus avec la suppression de la
    notion de cours de référence (même chantier, un seul et même bouton-filtre).
  - Tous les blocs `<script>` revérifiés après ce lot : 9/9 faux positifs connus, aucune
    régression de syntaxe.
- [x] **Correctif complémentaire coins arrondis** : le vrai sélecteur "cases mois/année" du
  Planning (`#month-dropdown`/`#year-dropdown`, visible uniquement en desktop large ≥ 1366px —
  masqué à la largeur de test initiale, d'où un premier oubli signalé par l'utilisateur)
  héritait encore du rayon global `--border-radius-lg` (16px). Corrigé de façon scopée
  (`.planning-date-selector .custom-dropdown-btn/.custom-dropdown-menu` → `--border-radius-md`,
  8px) sans toucher au rayon global des autres dropdowns du site. Testé réellement en élargissant
  la fenêtre à 1500px : bouton et menu "Septembre"/"2026" confirmés à 8px.
- [x] **Filtre "Tous les types" (Entraînements) : compteur `/5` → `/3`** : reliquat de l'ancien
  système à 5 types (retypage vers 3 types fait dans un lot précédent) — libellé HTML
  (`#train-type-counter`) et plafond de sélection réel (`_trainGenericToggle(..., maxCount=5, ...)`
  à l'appel de `trainToggleTypeFilter`) tous deux corrigés à 3. Testé réellement : affichage
  "0 / 3", sélection des 3 types qui plafonne bien à 3/3 et referme le menu, reset "Tous les
  types" fonctionnel.
- [x] **Méthode des J — implémentation complète (v1)** : GO explicite reçu de l'utilisateur pour
  le Modèle A (voir `docs/PROPOSITION_SYSTEME_J.md`, mis à jour avec le statut final) et les
  recommandations §7.1–§7.3 ; §7.4 tranché en faveur d'un réglage global uniquement pour cette
  v1. Additif pur : un seul nouveau champ `jCheckpoints` sur `courses/{fc}` (aucune nouvelle
  collection, aucune modification de `firestore.rules` nécessaire — `courses` autorise déjà
  `create/update` sans liste blanche de champs), jamais touché `tourConfidences`/`tourDates`/etc.
  - **Modèle de données** : `jCheckpoints: { presetId, anchorDate, anchorTourIndex, steps: [{
    offset, dueDate, status: 'pending'|'done'|'expired' }] }`. Presets `rapproche`/`equilibre`
    (défaut)/`espace` (`J_PRESETS`). Aucune étape jamais supprimée : au pire `expired` après 60
    jours sans traitement (écriture opportuniste, gardée anti-boucle par session cliente via
    `_jExpiredWriteGuard`).
  - **Déclenchement** : `maybeStartJSeries()` appelée juste après le SEUL vrai point d'écriture
    d'un tour validé (`p1WriteTourSlot` dans le flux de confirmation du modal Tour, jamais sur
    le flux de réinitialisation/effacement d'un tour) — ne démarre une nouvelle série que si la
    Méthode des J est activée ET qu'aucune série `pending` n'existe déjà pour ce cours (pas
    d'empilement).
  - **Actions** : `p1JCheckpointAction(fc, stepIndex, 'done'|'postpone'|'expire')` — lecture-
    modification-écriture de tout le tableau `steps` (copie profonde avant mutation, jamais
    d'altération du cache live partagé). "Faire maintenant" marque `done` sans toucher aux tours
    (geste léger, conforme au Modèle A) ; "Reporter" décale `dueDate` de +1 jour.
  - **Réglages** (`Paramètres`, nouvelle carte "Méthode des J", même gabarit visuel que le
    Barème de confiance) : bascule Activée/Désactivée (défaut : désactivée, opt-in explicite —
    jamais rétroactif sur les cours existants) + sélecteur de rythme à 3 boutons. Préférence
    stockée en localStorage (réactif) ET `users/{uid}/settings/preferences`
    (`jMethodEnabled`/`jMethodPreset`, même convention que `confidenceScale`/`toursViewMode`),
    chargée au login via `_checkJMethodPrefs()`.
  - **Programme de la journée (sidebar Planning)** : nouvelle carte "Révisions J" listant les
    étapes `pending` dues aujourd'hui ou en retard (triées, avec badge "J+N" et "En retard de X
    j" en rouge), boutons Faire maintenant/Reporter par ligne, état vide "Rien à réviser
    aujourd'hui." Carte entièrement masquée si la fonctionnalité est désactivée.
    **Bug réel trouvé et corrigé en testant** : la sidebar `.planning-sidebar` d'origine est
    `display:none !important` depuis un lot précédent (remplacée par un tiroir "To-Do List"
    plein écran, `#global-todo-body`, qui ne déplaçait que `.checklist-card` — la carte
    "Révisions J" restait donc invisible). Corrigé en déplaçant aussi `#jDueCard` dans le
    tiroir (avant la To-Do List) au même moment que `.checklist-card`, et en rafraîchissant la
    carte à l'ouverture du tiroir comme la checklist.
  - **Planning (calendrier)** : pastille passive `.day-j-badge` (icône + décompte) sur les jours
    ayant au moins une échéance `pending`, dérivée de `getJCheckpointsByDate()` — aucune action
    possible depuis le calendrier lui-même (volontaire, pour ne pas alourdir la logique de clic
    déjà dense des cases du planning) ; le traitement se fait uniquement depuis la carte
    "Révisions J". **Bug réel trouvé et corrigé en testant** : `refreshJMethodUI()` ne
    rappelait `renderCalendar()` que si la page Planning était déjà affichée au moment du
    changement Firestore — une pastille calculée pendant que l'utilisateur était sur une autre
    page restait périmée puisque rien ne re-déclenche `renderCalendar()` à la simple navigation
    (la page est seulement démasquée via une classe CSS, jamais reconstruite). Corrigé en
    rendant l'appel à `renderCalendar()` inconditionnel (sans effet visible ni coût réel quand
    la page est masquée).
  - **Bug de fuseau horaire réel trouvé et corrigé en testant** : le calcul des dates
    d'échéance passait par `new Date().toISOString().slice(0,10)`/`Date.setDate()` +
    `toISOString()`, un aller-retour par l'UTC qui décale d'un jour dès que le fuseau local est
    en avance sur UTC (confirmé en heure d'été de Paris, UTC+2 : une échéance "J+1" restait
    calculée sur le même jour que l'ancrage). Corrigé avec `_jLocalDayKey()`/`_addDaysIso()`
    entièrement en composants de date LOCAUX (mêmes `getFullYear()`/`getMonth()`/`getDate()`
    que `formatDateKey()` du Planning, jamais de passage par `toISOString()`), pour rester
    cohérent avec la notion de "aujourd'hui" utilisée partout ailleurs dans l'app.
  - **Aide contextuelle** : nouvelle entrée `helpContent['planning-j-method']`, accessible via
    le `?` du header de la carte "Révisions J".
  - **Testé réellement** (navigateur + Emulator, compte QA) : activation/désactivation +
    changement de rythme dans Paramètres (vérifié en lisant `settings/preferences` côté
    Firestore après coup) ; déclenchement d'une série via le **vrai flux UI** (mode Détaillé,
    clic sur un slot de tour vide → modal de confiance → validation) avec `jCheckpoints` créé
    correctement (dates locales cohérentes, aucun décalage) ; carte "Révisions J" dans le
    tiroir To-Do avec une étape en retard (rouge, "En retard de 3 j") et une due aujourd'hui ;
    "Faire maintenant" (passe `done`, disparaît de la liste, ne touche pas aux tours) et
    "Reporter" (+1 jour, disparaît si plus dû aujourd'hui) vérifiés avec relecture Firestore
    après chaque action ; pastille calendrier sur le bon jour futur après un rechargement de
    page sans navigation préalable sur Planning ; aucune erreur console ; 9/9 faux positifs de
    syntaxe connus, aucune régression. Données de test nettoyées après coup (tour et
    `jCheckpoints` de test retirés du cours "Asthme", réglage "Affichage des tours" remis sur
    Compact).
  - **Non fait dans cette v1** (hors périmètre du GO reçu, à reproposer si besoin) : surcharge
    du preset par cours (réglage global uniquement, §7.4) ; toute automatisation du choix de
    preset selon la confiance du dernier tour (explicitement déconseillée dans la proposition).
    (La pastille du calendrier est restée passive lors de ce premier lot, puis rendue cliquable
    juste après — voir l'entrée suivante.)
- [x] **Méthode des J — pastille cliquable + panneau dans "Organisation de la journée"** :
  demande de suivi de l'utilisateur pour rendre la pastille du calendrier interactive et
  intégrer les révisions J au modal journalier existant.
  - **Modal "Révisions J du jour"** (`#day-j-modal`) : ouvert au clic sur `.day-j-badge` d'une
    case du calendrier (guard ajouté dans le handler `.day-header-zone` pour ne pas déclencher
    le popup de statut en même temps). Réutilise le patron générique `.modal`/`.modal-content`
    (même famille que `#backup-modal`) pour rester cohérent avec le reste du site, avec
    verrouillage de scroll ajouté manuellement (`_getScrollbarWidth`/`_setScrollbarComp`, même
    correctif que sur `openResourcesConfigModal` dans un lot précédent — pas copié du patron
    `#backup-modal` qui, lui, n'a jamais verrouillé le scroll). Titre en date complète
    ("jeudi 3 septembre 2026"), fermeture par bouton, Échap implicite via le fond, et clic sur
    le fond (garde anti-fermeture pendant une sélection de texte glissée, même patron que
    `#settings-modal-overlay`).
  - **Nouvelle donnée dérivée** `getJCheckpointsForDate(dateKey)` : contrairement à
    `getDueJCheckpoints()` (dû aujourd'hui OU en retard), celle-ci ne retient que les échéances
    dont `dueDate` correspond EXACTEMENT au jour demandé — garde une correspondance 1:1 stricte
    entre le chiffre affiché sur la pastille et le contenu du modal qu'elle ouvre, quel que soit
    le jour cliqué (passé, présent ou futur).
  - **Panneau dans le modal "Organisation de la journée"** (`#pdd-j-panel`) : ajouté à droite du
    corps existant (nouveau conteneur `.pdd-content-row` en `flex-direction:row`, wrapant `.pdd-
    body` — inchangé en interne — et le nouveau panneau), passe en colonne avec le panneau en
    bas (max 38vh, bordure haute au lieu de gauche) sous 768px, même seuil que les autres
    media queries du modal. Masqué entièrement si la Méthode des J est désactivée (`.pdd-modal`
    perd sa classe `.has-j-panel`, qui élargit la modale à `min(94vw,980px)` uniquement quand le
    panneau est affiché, pour ne pas comprimer l'éditeur de notes). Rendu déclenché depuis
    `openModal(dateKey)` (point d'entrée existant du modal, un seul appel ajouté).
  - **Factorisation** : le HTML des lignes ("carte cours + J+N + Faire maintenant/Reporter"),
    dupliqué trois fois en l'état (carte sidebar, nouveau modal, nouveau panneau), extrait dans
    `_jRenderRowsHtml(list, emptyText)` — un seul endroit à maintenir, mêmes actions partout.
    Exposée aussi sur `window._jRenderRowsHtmlPublic` pour le panneau `pdd-`, défini dans une
    IIFE séparée (pont du même type que ceux déjà utilisés ailleurs dans le fichier, ex.
    `window._ednPlanningBridge`).
  - **Synchronisation temps réel étendue** : `refreshJMethodUI()` rafraîchit désormais aussi le
    modal "Révisions J du jour" (si ouvert) et le panneau `pdd-` (si ouvert, via le pont
    `window._pddRefreshJPanel`), en plus de la carte sidebar et du calendrier déjà couverts —
    une action Faire maintenant/Reporter reste cohérente quelle que soit la surface où elle est
    déclenchée.
  - **Testé réellement, sans Firestore/Java disponibles dans l'environnement de cette session**
    (l'émulateur Firestore nécessite une JVM, absente de la machine — confirmé introuvable ; seul
    l'émulateur Auth, pur Node, a pu être redémarré). Contournement légitime et suffisant pour ce
    lot : cache `_p1GetCoursesById()` remplacé temporairement par des données factices
    directement dans la page (aucune écriture réseau, jamais vers Firestore), pour vérifier le
    rendu et le câblage des clics — la logique d'écriture réelle (`p1JCheckpointAction`,
    lecture-modification-écriture de `jCheckpoints`) avait déjà été testée en profondeur contre
    un vrai émulateur Firestore dans le lot précédent et n'a pas été modifiée ici. Vérifié :
    pastille cliquable sur le jour du jour (2 échéances factices, dont une sur un autre cours à
    une date différente correctement exclue) ; modal ouvert avec le bon titre et les 2 lignes
    attendues ; clic réel sur "Faire maintenant" confirmé jusqu'au bout de la chaîne (bouton →
    `_jHandleAction` → la vraie `p1JCheckpointAction`, qui a proprement renvoyé `false` en
    l'absence de session Firestore réelle, sans planter, et le bouton s'est correctement
    redéverrouillé) ; panneau `pdd-` affiché avec le bon compteur et les bonnes lignes à
    l'ouverture du modal "Organisation de la journée" ; bascule desktop → mobile confirmée
    (panneau en colonne, pleine largeur, bordure haute, hauteur plafonnée) ; repli propre
    lorsque la Méthode des J est désactivée (panneau et pastille disparaissent). 9/9 faux
    positifs de syntaxe connus, aucune régression. Toute donnée factice nettoyée après coup
    (aucune n'a jamais atteint de backend).
  - **Non testé dans ce lot faute d'émulateur Firestore disponible** : le flux 100% réel de bout
    en bout (vraie session + vraie écriture Firestore déclenchée par un clic Faire maintenant/
    Reporter depuis ces deux nouvelles surfaces). Fortement probable de fonctionner sans
    changement, puisque les deux nouvelles surfaces appellent exactement les mêmes fonctions
    (`_jHandleAction`/`p1JCheckpointAction`) déjà validées contre un vrai backend dans le lot
    précédent — mais à confirmer par un test réel dès qu'un émulateur Firestore (ou un accès
    Firestore réel) sera de nouveau disponible.
- [x] **Méthode des J — retouche visuelle (retour utilisateur)** : deux problèmes signalés avec
  copies d'écran à l'appui après le lot précédent.
  - **Modal "Révisions J du jour" jugé trop pauvre visuellement** : remplacé le `.modal-title`
    générique (texte centré simple) par le même gabarit que `.pdd-header` (modal "Organisation
    de la journée") — icône dans un carré dégradé, titre + sous-titre empilés, croix de
    fermeture standard inchangée. Rend les deux modals du Planning visuellement apparentés,
    conformément à la demande ("en rapport avec les autres modals du site").
  - **Panneau `pdd-j-panel` moche + barre de défilement horizontale sur mobile** : en-tête du
    panneau passé d'un simple texte à un bandeau en dégradé bleu (même traitement que `.j-due-
    header` côté sidebar) avec le compteur en pastille blanche translucide ; lignes remises sur
    fond blanc avec ombre légère pour se détacher du fond gris du panneau ; panneau élargi
    (250px → 280px desktop, largeur de la modale avec panneau `min(94vw,980px)` →
    `min(95vw,1040px)`) ; boutons Faire maintenant/Reporter empilés verticalement dans ce
    panneau précis (pleine largeur chacun) au lieu de côte à côte — plus lisible dans un
    contexte étroit, et supprime tout besoin de les compresser. Cause exacte de la barre de
    défilement horizontale signalée non reproduite à l'identique (testé sans débordement à
    375px/320px avec la version précédente déjà), mais correctif défensif appliqué dans tous
    les cas : `min-width:0` sur `.j-due-item`/`.j-due-btn` (classes de base, partagées par les
    3 surfaces) pour qu'aucun enfant flex ne puisse jamais forcer un débordement de son parent,
    plus `overflow-x:hidden` sur le conteneur scrollable du panneau.
  - **Testé réellement sur téléphone ET iPad** (toujours sans Firestore/Java disponibles dans
    cette session — mêmes données factices en mémoire navigateur que le lot précédent, aucune
    écriture réseau) : 320px, 375px (mobile, panneau empilé en bas, aucun débordement
    horizontal mesuré à aucun de ces deux paliers `document.documentElement.scrollWidth ===
    clientWidth` partout) ; 768px (iPad portrait, palier exact du point de bascule — toujours
    empilé, propre) ; 1024px (iPad paysage — panneau à droite, 280px, propre). Modal "Révisions
    J du jour" revérifié à 375px également (boutons côte à côte, assez de place à cette largeur
    de modal, aucun débordement). Aucune régression de syntaxe (9/9 faux positifs connus).
- [x] **Méthode des J — animation de fermeture, mise à jour optimiste, choix du rythme au
  premier tour, nouveaux supports** : quatre demandes de suivi.
  - **Animation de fermeture du modal "Révisions J du jour"** : `closeDayJModal()` retirait
    `.active` instantanément (aucune transition ne pouvait jouer). Le patron générique
    `.modal`/`.modal-content` a pourtant déjà un état `.closing` avec ses propres animations
    (`modalOverlayOut`/`modalContentOut`, 0.18s), jamais utilisé jusqu'ici sur ce modal précis —
    corrigé pour passer par `.closing` puis un `setTimeout` avant de retirer `.active`, comme
    tous les autres modals du site. Testé réellement : `.active`+`.closing` coexistent bien
    pendant la fermeture (animation jouée), puis les deux retirés proprement après 180ms.
  - **"Faire maintenant"/"Reporter" semblaient ne rien faire** : cause réelle identifiée — aucune
    mise à jour optimiste, l'UI attendait l'aller-retour Firestore complet (écriture +
    `onSnapshot` + re-rendu) avant tout changement visuel, ce qui pouvait donner une impression
    de clic sans effet en cas de latence. Corrigé : le cache local (`_p1GetCoursesById()`, lu
    par les 3 surfaces J) est maintenant mis à jour **immédiatement et synchrone** au clic
    (extraction d'un calcul pur `_jComputeNewCheckpoints()`, partagé avec l'écriture réelle pour
    ne jamais recalculer deux fois — évitait, par ex., un double report si l'écriture relisait un
    cache déjà modifié). En cas d'échec réel de l'écriture, l'état d'origine est restauré et
    l'UI redessinée. `maybeStartJSeries()` reçoit le même traitement (série visible tout de
    suite). Testé réellement : mutation du cache confirmée **synchrone** (avant toute
    résolution de promesse, y compris avec un faux backend délibérément lent) ; restauration
    confirmée après un échec simulé.
  - **Supports de tour remplacés** : les 6 anciens choix (QCM/DP, Collèges, Lisa, Fiche perso,
    EDNi/Codex, Conf) remplacés par 4 : QCM, Fiche de cours, Conf, Fiche perso — dans le
    sélecteur du modal Tour, la légende "Supports disponibles" du planning, et les tables de
    libellés (`supportLabels`, `SUPPORT_MAP` ×2). Les anciennes valeurs (`college`/`anki`/
    `codex`) restent reconnues en LECTURE SEULE dans ces tables et leur CSS d'affichage
    (`.tour-support.*`), pour que les tours déjà enregistrés avec l'un de ces supports
    continuent de s'afficher correctement (aucune perte/casse de donnée historique) — seul le
    sélecteur de nouveaux tours ne les propose plus. Testé réellement : les 4 nouveaux boutons
    s'affichent dans le bon ordre avec les bonnes couleurs.
  - **Modal "Choisir le rythme des révisions J" au premier tour** : sur le tout premier tour
    d'un cours (`tourIndex === 0`, dans les deux flux d'écriture — modal détaillé ET clic rapide
    du mode compact, `doAdd()`), si la Méthode des J est activée globalement, un nouveau modal
    (`#j-first-tour-modal`, même gabarit que "Révisions J du jour") propose les 3 rythmes
    (réutilise `.j-preset-btns` déjà stylé dans Paramètres), pré-sélectionne le défaut de
    Paramètres, et laisse choisir un rythme différent pour ce cours précis avant toute écriture
    — "Pas cette fois" ferme sans créer de série. Sur les tours suivants, comportement silencieux
    inchangé (`maybeStartJSeries` refuse toujours d'empiler une série déjà en cours).
    `maybeStartJSeries()` accepte maintenant un `presetId` explicite optionnel (sinon replié sur
    le réglage global). Testé réellement : ouverture avec le bon nom de cours et le bon rythme
    pré-sélectionné ; changement de sélection fonctionnel ; confirmation avec un rythme différent
    du défaut ("Rapproché") suivie de la fermeture animée ; "Pas cette fois" ferme sans créer
    `jCheckpoints`.
  - **Mode "Équilibré" : deux échéances de plus** — `[1,3,7,14,30]` → `[1,3,7,14,21,30,45]` (7
    étapes au lieu de 5), mis à jour partout où le preset est listé (Paramètres, ce nouveau
    modal, `J_PRESETS`). Testé réellement : les offsets affichés dans les 3 rythmes du nouveau
    modal reflètent bien `J_PRESETS` dynamiquement (pas de texte codé en dur qui aurait pu
    diverger).
  - Toujours sans Firestore/Java disponibles dans cette session — mêmes données factices en
    mémoire navigateur, jamais d'écriture réseau réelle testée pour ce lot. Aucune régression de
    syntaxe (9/9 faux positifs connus).
- [x] **Méthode des J — correctif scroll-lock, renommage, presets élargis** : cinq retours
  utilisateur, dont un vrai bug de fond trouvé en creusant les deux premiers signalements.
  - **Cause racine des deux bugs de scrollbar** (décalage à la fermeture de "Cours à revoir ce
    jour-là", scrollbar encore visible à l'ouverture de "Planifier les révisions J") :
    `openDayJModal`/`closeDayJModal`/`openJFirstTourModal`/`closeJFirstTourModal` posaient le
    verrou de scroll "à la main" (`_getScrollbarWidth`/`_setScrollbarComp` + `overflow` direct
    sur `<body>`), sans passer par le système partagé à compteur de propriétaires déjà présent
    dans le fichier (`window._ednScrollLock`/`_ednScrollUnlock`, utilisé par tous les autres
    modals). Comme ces deux modals J s'ouvrent depuis le `.then()` de la validation d'un tour —
    **pendant que le modal Tour est encore en train de se fermer** (son propre
    `_ednScrollUnlock('tourModal')` arrive ~180ms plus tard) — son déverrouillage retardé
    effaçait le verrou tout juste posé par le modal J, sans qu'aucun système ne sache qu'un
    autre modal en avait encore besoin. Corrigé en migrant les 4 fonctions vers
    `_ednScrollLock('dayJModal')`/`_ednScrollLock('jFirstTourModal')` (propriétaires distincts,
    coexistent proprement avec `'tourModal'`), et en ne déverrouillant qu'**après** l'animation
    de fermeture (dans le `setTimeout`, jamais avant — cause du décalage visible signalé sur le
    premier modal). Testé réellement en reproduisant la course exacte (verrouiller `'tourModal'`,
    le déverrouiller avec un délai simulé, ouvrir le modal J entre les deux) : le verrou survit
    bien à la course désormais (`body`/`html` restent `overflow:hidden` malgré le déverrouillage
    concurrent) ; fermeture du modal J confirmée : `overflow:hidden` conservé pendant toute
    l'animation, relâché seulement après.
  - **Renommage "Activer" → "Planifier"** : titre ("Planifier les révisions J ?") et bouton de
    confirmation ("Planifier avec ce rythme") du modal proposé au premier tour.
  - **Rythme "Rapproché" : J+40 ajouté** — `[1,3,5,8,14,30]` → `[1,3,5,8,14,30,40]`.
  - **Rythme "Espacé" : 7 échéances au total, plafonnées à 4 mois** (un semestre de P1) —
    `[3,9,25,50]` (4 étapes, jusqu'à J+50) → `[3,9,20,35,55,80,110]` (7 étapes, jusqu'à J+110,
    sous la barre des 120 jours). Les trois rythmes mis à jour partout où ils sont affichés
    (Paramètres, modal "Planifier les révisions J", `J_PRESETS`) ; le modal calcule ses libellés
    dynamiquement à partir de `J_PRESETS` (jamais de texte codé en dur qui aurait pu diverger).
    Testé réellement : `window.J_PRESETS` confirme les 3 nouveaux tableaux ; capture d'écran du
    modal avec les bons libellés pour les 3 rythmes.
  - Toujours sans Firestore/Java disponibles dans cette session. Aucune régression de syntaxe
    (9/9 faux positifs connus).
- [x] **Méthode des J — "Faire maintenant" corrigé (v1 de ce correctif était fausse)** :
  clarifié via question posée à l'utilisateur, puis CORRIGÉ une deuxième fois sur retour direct
  ("je pense que tu as pas compris") — la première correction (reprogrammer TOUTES les étapes
  suivantes en conservant l'écart relatif) était une mauvaise interprétation. Comportement
  demandé, bien plus simple : **seule** l'étape cliquée bouge, à aujourd'hui, et reste visible
  (jamais 'done', jamais retirée des vues) ; les étapes suivantes ne changent JAMAIS de date.
  - **Comportement définitif** (`_jComputeNewCheckpoints`, action renommée `'done'` → `'today'`
    pour ne plus laisser croire à une notion de "terminé" qui n'existe plus) : `step.dueDate =
    aujourd'hui`, `step.status` reste `'pending'`. Aucune autre étape de la série n'est touchée.
    Comme `getDueJCheckpoints()`/`getJCheckpointsForDate()`/`getJCheckpointsByDate()` filtrent
    toutes sur `dueDate`, ce seul changement suffit à faire apparaître l'étape dans "Révisions J"
    (sidebar + modal + panneau) ET sur le calendrier, à la date du jour — les deux symptômes
    signalés ("ça ne s'ajoute pas à la todo", "ça n'ajoute pas de J aujourd'hui") partagent la
    même cause et le même correctif.
  - Aucun changement sur `'postpone'` (+1 jour sur l'étape elle-même) ni `'expire'` (archivage
    automatique).
  - **Testé réellement** (données factices, cache navigateur) : "Faire maintenant" sur l'étape
    J+7 d'une série à 4 étapes — vérifié que SEULE cette étape voit sa `dueDate` passer à
    aujourd'hui (reste `'pending'`) et que l'étape suivante (J+14) garde EXACTEMENT sa date
    d'origine, inchangée ; `getJCheckpointsByDate()` place bien courseA sur la date du jour après
    `renderCalendar()`. Mise à jour optimiste déjà en place (lot précédent) réutilisée sans
    modification — le recalage reste visible instantanément sur les 3 surfaces. Toujours sans
    Firestore/Java disponibles dans cette session.
- [x] **Méthode des J — rythme "Personnalisé"** : nouvelle option dans Paramètres, à côté des 3
  rythmes fixes.
  - **Modèle de données** : `getCustomJOffsets()`/`setJMethodPrefs(enabled, 'custom', offsets)` —
    stockage séparé de `J_PRESETS` (qui garde `custom: []` comme simple marqueur "identifiant
    valide", jamais la vraie liste), synchronisé localStorage + `settings/preferences
    .jMethodCustomOffsets`, même convention que `jMethodPreset`. Toute lecture d'offsets passe
    désormais par `_jResolveOffsets(presetId)` (jamais `J_PRESETS[presetId]` directement) —
    centralise le cas spécial "custom", utilisé par `buildJCheckpoints()` et le modal premier
    tour.
  - **UI Paramètres** : 4ᵉ bouton "Personnalisé" dans le sélecteur de rythme ; cliquer dessus
    affiche un champ texte ("jours séparés par des virgules") sans rien activer tant que
    "Enregistrer" n'est pas cliqué (jamais de rythme personnalisé vide activé par erreur) ;
    validation (`_jParseCustomOffsetsInput`) : entiers 1-200 uniquement, doublons supprimés, tri
    croissant, valeurs invalides ignorées silencieusement (ex. texte), liste vide bloquée avec
    message d'erreur inline. Une fois enregistré, le bouton affiche le résumé ("J+2 J+5 J+10
    J+20").
  - **Modal "Planifier les révisions J"** (premier tour) : 4ᵉ bouton "Personnalisé" ajouté,
    affiche la liste déjà enregistrée dans Paramètres ; désactivé (`.disabled`,
    `pointer-events:none`) tant qu'aucune liste n'a encore été définie, avec le rappel "Défini
    dans Paramètres".
  - **Testé réellement** : saisie volontairement sale (`"2, 5, 10, abc, 5, 300, 20"`) →
    correctement nettoyée en `[2,5,10,20]` (texte ignoré, doublon supprimé, 300 rejeté car
    > 200, triée) ; preset activé sur "custom" après enregistrement, résumé affiché
    correctement ; soumission vide bloquée sans écraser la liste déjà enregistrée ; basculer sur
    un autre rythme masque proprement l'éditeur sans perdre la liste personnalisée sauvegardée ;
    rouvrir "Personnalisé" sans re-enregistrer ne réactive pas tant que "Enregistrer" n'est pas
    cliqué ; modal premier tour : bouton "Personnalisé" activé et sélectionnable une fois une
    liste enregistrée, affiche le bon résumé. Toujours sans Firestore/Java disponibles dans
    cette session ; aucune régression de syntaxe (9/9 faux positifs connus).
- [x] **Méthode des J — cinq retours utilisateur supplémentaires** :
  - **"Personnalisé" : la case bleue ne bougeait pas immédiatement au clic** — corrigé : le clic
    déplace maintenant la sélection visuelle tout de suite (`.active` posé sur le bon bouton),
    même si rien n'est encore committé côté données tant que "Enregistrer" n'est pas cliqué
    (toujours pas de rythme personnalisé vide activé par erreur). Testé réellement : `.active`
    confirmé sur "custom" immédiatement après le clic.
  - **Nom du cours retiré des liens cliquables dans les lignes J** : `_jOpenCourse()` (ouvrait le
    modal Notes) et son `onclick` supprimés ; `.j-due-item-name` redevenu du texte simple (plus
    de curseur pointeur ni de soulignement au survol). S'applique aux 3 surfaces (sidebar,
    modal "Révisions J du jour", panneau "Organisation de la journée") puisqu'elles partagent le
    même rendu (`_jRenderRowsHtml`). Testé réellement : aucun `onclick`, `cursor:auto`.
  - **Bouton dédié "Révisions J"** : nouveau bouton bleu (`#global-jrev-btn`), même gabarit
    visuel que le bouton violet "To-Do" existant (dégradé, pastille rouge), placé à sa **gauche**
    dans la même ligne de navigation. Pastille rouge = `getDueJCheckpoints().length` (dû
    aujourd'hui ou en retard, même compte que l'en-tête de la carte). Bouton entièrement masqué
    si la Méthode des J est désactivée (`toggleVisibility()`, revérifié à chaque
    `refreshJMethodUI()`). Ouvre un tiroir dédié (`#global-jrev-overlay`/`#global-jrev-panel`,
    même patron que le tiroir To-Do : `_ednScrollLock('globalJRev')`, animation, piège de focus,
    Échap) contenant `#jDueCard`, **déplacée hors du tiroir To-Do** (elle y était nichée
    temporairement le temps que ce bouton dédié n'existe pas). Testé réellement : bouton masqué
    tant que la Méthode des J est désactivée, visible et positionné à gauche du bouton To-Do une
    fois activée (mesuré : bord droit du bouton J < bord gauche du bouton To-Do) ; pastille
    rouge correcte ; ouverture du tiroir, contenu affiché, "Faire maintenant"/"Reporter"/nouveau
    bouton tour tous fonctionnels dans ce nouveau tiroir.
  - **"Enregistrer un tour" directement depuis une ligne "Révisions J"** : nouveau 3ᵉ bouton
    (violet, `.j-due-btn-tour`) sur chaque ligne, à côté de Faire maintenant/Reporter — même
    mécanisme que `window.openTourModalFromChecklist()` (To-Do List) : trouve le prochain
    créneau de tour libre pour ce cours et ouvre directement le vrai modal Tour
    (`openConfidenceModal`), sans popup de choix intermédiaire (pas de tâche de checklist liée
    ici). `.j-due-item-actions` passé de "côte à côte" à **empilé verticalement** partout (plus
    robuste avec 3 boutons, quelle que soit la largeur du conteneur — leçon retenue du bug de
    débordement horizontal d'un lot précédent). Testé réellement : clic ouvre le vrai modal
    Tour avec le bon cours et le bon numéro de tour pré-rempli (T1), nouveaux libellés de
    support visibles.
  - **Animation de fermeture + verrou de scroll pour "Passer la confiance sur 5/10 ?"** : ces
    modals passent par le composant partagé `showCustomConfirm()`/`showCustomAlert()` (utilisé
    dans tout le site, pas seulement pour la confiance), qui n'avait NI verrou de scroll NI
    animation de fermeture depuis le début (`display:none` coupait tout instantanément). Ajout
    d'un état `.closing` avec animation de sortie (`customModalOverlayOut`/`modalSlideOut`,
    0.18s) et d'un verrou `_ednScrollLock('customConfirm')`/`_ednScrollLock('customAlert')`,
    posé à l'ouverture et relâché seulement après l'animation. Bénéficie automatiquement à
    TOUTES les confirmations/alertes du site, pas seulement au changement de barème. Testé
    réellement : `body` reste `overflow:hidden` pendant toute l'animation de fermeture (0 à
    180ms), relâché correctement ensuite une fois toute pollution de test propre nettoyée.
  - Toujours sans Firestore/Java disponibles dans cette session ; aucune régression de syntaxe
    (9/9 faux positifs connus, total de blocs `<script>` passé à 47 avec le nouveau tiroir dédié).
- [x] **Méthode des J — gros lot de retours utilisateur (redesign Valider/Reporter, séquencement,
  vue 5 jours, bague blanche, corrections diverses)** :
  - **Bague blanche "dernier niveau de confiance"** en mode Détaillé : le modal Tour marquait déjà
    `.selected` sur le niveau enregistré pour LE TOUR EN COURS d'édition, mais n'affichait jamais
    de repère pour le DERNIER tour enregistré (contrairement au picker rapide du mode compact,
    `.ct-conf-pop button.current`, qui l'avait déjà). Ajouté : `.confidence-btn.current`, même
    style (`box-shadow: inset ... rgba(255,255,255,.72)`), calculé dans `openConfidenceModal()`
    (dernière valeur non-nulle de `d.tours`, même règle que `lastTourConf()` côté compact). Comme
    ce modal est LE SEUL point d'entrée (To-Do List, "Révisions J" et clic direct sur le tableau y
    passent tous), le correctif s'applique automatiquement partout, y compris depuis la todolist
    (cas explicitement signalé comme non couvert). Testé réellement : `box-shadow` confirmé
    identique à la référence du mode compact.
  - **Check de validation après le modal "Planifier les révisions J"** (mode Détaillé) : le check
    plein écran (`showTourSuccessAnimation()`) et l'ouverture éventuelle du modal J tournaient en
    parallèle, sans ordre garanti. Restructuré : `_mayOpenJModal` calculé de façon SYNCHRONE avant
    l'écriture (ne dépend que de `tourIndex`+réglage global), le check est sauté dans le
    `setTimeout` de fermeture du modal Tour si ce cas s'applique, et déclenché à la place depuis
    `closeJFirstTourModal()` — donc après confirmation OU passage ("Pas cette fois"), jamais avant.
    `showTourSuccessAnimation` exposée sur `window` pour cet appel cross-script.
  - **Sous-menus "Valider" (2 choix) et "Reporter" (4 choix)**, remplaçant les 3 boutons "Faire
    maintenant"/"Reporter"/"Enregistrer un tour" du lot précédent : "Valider" ouvre "Valider sans
    enregistrer de tour" (action `'validate'`, `status:'done'`, retiré de toutes les vues,
    `dueDate` d'origine conservée) et "Valider et enregistrer un tour" (même validation + ouvre
    immédiatement le vrai modal Tour via `openTourModalFromJRevision`) ; "Reporter" ouvre +1J/+2J/
    +3J/+4J (`_jComputeNewCheckpoints` accepte maintenant un nombre de jours). Un seul sous-menu
    ouvert à la fois par ligne (`window._jToggleMenu`). Propagé automatiquement aux 3 surfaces
    (sidebar/tiroir dédié, modal "Révisions J du jour", panneau "Organisation de la journée")
    puisqu'elles partagent toutes `_jRenderRowsHtml`. Testé réellement : sous-menus mutuellement
    exclusifs, calcul `+2 J` vérifié exact (`aujourd'hui + 2` quand la date d'origine était déjà
    dépassée), "Valider" retiré des vues sans toucher aux autres étapes.
  - **Animation de disparition** sur Valider/Reporter : `_jAnimateRowRemoval()` ajoute
    `.j-due-item-removing` (fondu + réduction) sur la ligne cliquée, le re-rendu réel (qui
    retirait la ligne d'un coup auparavant) est retardé de `J_ROW_ANIM_MS` (220ms) pour laisser
    jouer la transition. Mise à jour optimiste des données inchangée par ailleurs (toujours
    immédiate, seul le RE-RENDU visuel patiente).
  - **Vue "Aujourd'hui" + 4 jours suivants, dépliante** dans le tiroir dédié : nouvelle
    `getJCheckpointsGroupedDays(5)` (jour 0 = mêmes règles que `getDueJCheckpoints()` — dû
    aujourd'hui ou en retard —, jours 1 à 4 = `getJCheckpointsForDate()` sur chaque jour exact).
    `renderJDueCard()` reconstruit désormais des blocs `<details>` par jour ("Aujourd'hui"
    déplié par défaut, les suivants repliés), avec mémorisation de l'état ouvert/fermé entre deux
    re-rendus (sinon une action à l'intérieur d'un jour déplié le refermerait aussitôt). Pensé
    compact replié (un seul en-tête par jour) pour ne pas prendre trop de hauteur.
  - **Header du tiroir "Révisions J" aligné sur celui de la To-Do List** (retour utilisateur : ne
    ressemblait pas au header To-Do) : icône désormais dans un carré 38px à coins arrondis en
    dégradé (au lieu d'un simple glyphe coloré), même tailles/polices/paddings que
    `.global-todo-head` trait pour trait.
  - **Numéros de cours alignés à gauche** (au lieu de centrés) dans la colonne "N°" de "Mes
    cours" : `align-items:center` → `align-items:flex-start` sur le conteneur flex de la cellule.
  - **Session Flash** : bouton "Lancer" décroché de la variable `--confidence-5` (ambiguë,
    orange selon le barème actif — cause du bug signalé), couleur verte explicite
    (`linear-gradient(135deg, #10b981, #059669)`). "Tout sélectionner"/"Tout désélectionner" :
    icône (`fa-square-check`) affichée UNIQUEMENT à l'état "Tout désélectionner", "Tout
    sélectionner" reste sans icône.
  - **Session Flash — redesign visuel du tiroir, PREMIÈRE tentative erronée puis corrigée sur
    demande explicite de l'utilisateur.** Un premier passage (liste à plat, carte bordée
    uniquement sur la matière cochée) a été fait à partir d'une seule capture d'écran, sans
    référence de code — l'utilisateur a signalé "ça ne correspond pas du tout à ce que j'avais
    demandé" et a fourni le fichier source de référence (`TypixClin/Fichiers site/
    TableurEnLigne.html`, lecture seule, fonction `renderFlashDrawerList` ~ligne 48511) plus une
    nouvelle capture. **Correction : port fidèle de l'implémentation de référence**, valeurs CSS
    reprises directement de ce fichier (noms de classes P1Planner conservés, déjà câblés côté JS
    dans `_flashDrawerSyncDom` — seules les VALEURS visuelles changent, aucun renommage) :
    - Différence structurelle principale corrigée : CHAQUE matière est une carte bordée par défaut
      (`border:1.5px solid var(--gray-200)`), y compris non cochée — pas une liste à plat avec
      carte seulement sur sélection, comme le premier essai le faisait à tort. Sélection = bord +
      fond teintés bleu dans le MÊME gabarit (pas de carte "détachée" par une marge).
    - Icône et nom repassés aux tailles exactes de la référence (26px/7px radius, nom
      0.84rem/600) — le premier essai les avait agrandis sans base réelle.
    - Sous-panneau ("Toutes les flashcards"/"Choisir des items" + liste d'items) indenté avec un
      filet gauche (`margin-left:1.6rem` + `border-left:2px solid`), comme la référence — absent
      du premier essai.
    - Badge "X due(s)"/"X cartes" : la classe `bcls` du JS existant (`due>0?'due':'none'`, déjà
      correcte, non modifiée) applique `.due` aux DEUX badges dès qu'il y a des dues, pas
      seulement au badge "due" — CSS ajusté pour que ce cas rende bien en vraie pastille rouge
      pleine sur les deux (padding/radius/poids repris des valeurs de référence), conforme à la
      nouvelle capture où "3 dues" ET "3 cartes" sont pastillés.
    - Sous-items restent à plat (pas de carte bordée par ligne) — c'était déjà correct dans le
      premier essai, conforme à la référence, inchangé.
    - Revérifié en clair ET en sombre par injection de données factices reproduisant fidèlement la
      LOGIQUE réelle de `_flashDrawerRowHtml` (bcls incluse — le premier test visuel utilisait un
      mock simplifié qui omettait cette classe, d'où un faux résultat "conforme" alors que ce
      détail précis manquait). Comparaison capture-par-capture avec la nouvelle référence :
      correspond de très près. Aucune régression de syntaxe (9/9 faux positifs connus).
  - **Décalage du header sticky de "Mes cours" à l'ouverture/fermeture du modal Tour — reproduit,
    cause identifiée, corrigé et vérifié.** Repro fiable construite dans le navigateur de test
    (page forcée active, ~40 lignes factices injectées pour rendre la page réellement scrollable,
    fenêtre redimensionnée en 1440×900 — un premier essai en fenêtre trop basse déclenchait à tort
    la règle `@media (max-height:450px)` qui force `position:relative` sur ce header, faussant le
    diagnostic). Cause confirmée par mesure directe (`getBoundingClientRect()` avant/pendant,
    `scrollTop` inchangé) : `_ednApplyScrollLock()` posait `document.documentElement.style.overflow
    = 'hidden'` — or `<html>` est l'élément qui défile réellement sur ce tableur (confirmé par
    `document.scrollingElement`) et **figer son overflow pendant qu'il est scrollé casse le calcul
    de `position:sticky` de ses descendants** : le header saute hors écran (ex. mesuré : 70px →
    -236px, alors que `scrollTop` restait strictement identique) tant que le verrou est actif, puis
    revient d'un coup à la fermeture — exactement le symptôme rapporté et montré en capture. Un
    premier correctif via la technique classique `position:fixed; top:-scrollY` a été tenté puis
    écarté : elle déplace tout autant `<html>` hors du flux et casse `position:sticky` de la même
    façon (juste avec un décalage différent), et sa restauration via `scrollTo()` s'est en plus
    révélée peu fiable à cause de `scroll-behavior:smooth` sur `<html>` (site-wide). Correctif
    retenu : `_ednApplyScrollLock()` ne touche plus jamais à l'overflow/la position de `<html>` —
    le verrou bloque uniquement les ENTRÉES qui feraient défiler le fond (`wheel`, `touchmove`,
    `keydown` sur flèches/Espace/PageUp/PageDown/Home/End, avec passage libre si la cible est dans
    une zone scrollable légitime comme le corps d'une modale ou un textarea), plus un garde sur
    l'évènement `scroll` en filet de secours (drag direct de la scrollbar native) qui replace
    instantanément le scroll à sa valeur verrouillée. `<html>` n'étant plus jamais modifié,
    `position:sticky` reste exact à tout moment. Vérifié dans le navigateur de test : header
    strictement à `top:70` avant/pendant/après ouverture ET fermeture du modal Tour
    (`openConfidenceModal`) ainsi que de `showCustomConfirm`, molette bloquée pendant le verrou
    (position de scroll inchangée), position de scroll restaurée exactement après déverrouillage,
    aucune erreur console liée, aucune régression de syntaxe (9/9 faux positifs connus). Non
    retesté formellement sur `day-j-modal`/`j-first-tour-modal`/`showCustomAlert` dans cette passe
    (même mécanisme partagé, donc même correctif s'applique, mais pas re-vérifié un par un faute de
    temps) — à surveiller si un souci de scroll y apparaît.
  - **Décalage horizontal à l'ouverture de "tous les modaux" (signalé juste après le correctif
    précédent) — cause identifiée dans ce même `_ednApplyScrollLock()`, corrigée et vérifiée.**
    L'affirmation ci-dessus ("la scrollbar n'est plus masquée, rien à compenser") reposait sur une
    hypothèse fausse : `document.body.style.overflow='hidden'`, conservé dans le verrou pour ne pas
    casser d'autres endroits du fichier qui le lisent, fait bel et bien disparaître la scrollbar
    verticale visible dans cette appli — vérifié par mesure directe
    (`document.documentElement.clientWidth` : 1430 → 1440 rien qu'avec cette seule ligne, sans
    toucher à `<html>`). Le correctif précédent avait supprimé l'appel à `_setScrollbarComp()` à
    l'ouverture en pensant qu'il n'y avait plus rien à compenser — d'où un décalage horizontal
    non compensé de la largeur de la scrollbar (~10-17px) sur TOUS les modaux passant par le verrou
    partagé (confidenceModal, day-j-modal, j-first-tour-modal, showCustomConfirm/Alert, tiroir
    Révisions J...). Correctif : réintroduction de l'appel `_setScrollbarComp(scrollbarWidth)` à
    l'ouverture (mesuré AVANT de poser `overflow:hidden`), en plus du blocage d'entrées déjà en
    place — ça ne touche que du padding sur `body`/`.header`, jamais l'overflow/la position de
    `<html>`, donc ça ne réintroduit PAS le bug `position:sticky` corrigé juste avant (vérifié : le
    header reste exactement à `top:70` pendant tout le cycle, ET la largeur/position rendue du
    tableau "Mes cours" — `getBoundingClientRect()` sur `.items-container` — reste identique au
    pixel près avant/pendant/après ouverture-fermeture). Audit complémentaire : script recherchant,
    pour chacune des ~17 AUTRES modales de ce fichier qui verrouillent le scroll par leur propre
    code ad-hoc (`document.body.style.overflow` hors `_ednScrollLock`), si un appel
    `_setScrollbarComp` existe à proximité — toutes déjà correctement compensées (confirmé aussi en
    direct sur `openResourcesConfigModal`/`closeResourcesConfigModal`), les seules occurrences sans
    compensation détectée étaient soit CE verrou (déjà corrigé), soit des branches `else` de repli
    pour le cas où `_ednScrollLock` n'existerait pas (jamais atteintes en pratique). Donc, sauf
    modale non couverte par cet audit textuel, le bug "pour tous les modaux" est traité de façon
    centralisée par cette seule correction. Aucune régression de syntaxe (9/9 faux positifs connus).
  - Toujours sans Firestore/Java disponibles dans cette session (mêmes contournements par
    données factices et copie profonde des dates pour éviter tout impact réel). Aucune
    régression de syntaxe (9/9 faux positifs connus).
  - **Gros lot de retours utilisateur (bugs + demandes UI), traité en une passe :**
    - **Session Flash** : le compteur "X carte(s)" reste désormais TOUJOURS neutre/gris, même s'il
      y a des dues (retour : les deux pastilles rouges à la fois "trop criard") — `bcls` forcé à
      `'none'` dans `_flashDrawerRowHtml()` au lieu de suivre `due>0`. Bouton "Uniquement les dues"
      rendu bistable comme "Tout sélectionner" (nouvel état `_flashDrawerDueOnlyOn`, exclusif avec
      `_flashDrawerSelectAllOn`) et actif par défaut à l'ouverture du tiroir (les matières avec
      dues étant déjà précochées à ce moment, le bouton doit refléter cet état, pas rester blanc).
      Vérifié : cycle de clics (on/off/mutuelle exclusion avec Tout sélectionner) testé directement
      contre les fonctions réelles (`window.selectDueFlashMatieres`/`selectAllFlashMatieres`), badge
      "cartes" confirmé neutre par capture.
    - **Bug z-index : le modal J (premier tour) s'ouvrait DERRIÈRE le modal "Organisation de la
      journée"** (`.pdd-overlay`, z-index 100000, volontairement très haut) quand on validait un
      tour + planifiait un J depuis ce modal — `#j-first-tour-modal`/`#day-j-modal` n'héritaient que
      du z-index générique `.modal` (~10000). Forcés à 100100 `!important`, au-dessus de `.pdd-overlay`.
    - **Espacement pastille de statut ↔ badge J** dans l'en-tête des cases du calendrier
      (`.day-header-actions`) : `margin-left` ajouté sur `.day-j-badge` uniquement quand précédé
      d'un `.day-status-badge` (sélecteur `+`), pour ne pas affecter les cases sans statut.
    - **Bug barre de nav lors de l'activation/désactivation de la Méthode des J** (capture à
      l'appui : la pill glissante de l'onglet actif restait étirée à l'ancienne taille, corrigée
      seulement en cliquant un onglet) : afficher/masquer le bouton "Révisions J" change la mise en
      page de la nav sans que `.app-nav-pill` (position/largeur mesurées au dernier clic) ne s'en
      rende compte. `refreshJMethodUI()` appelle désormais `window._syncNavPill(true)` (instantané)
      après le reflow.
    - **Scrollbar visible pendant l'animation du check vert de validation de tour** (aucun verrou
      posé jusqu'ici) : `showTourSuccessAnimation()` pose/lève désormais `_ednScrollLock('tourSuccessAnim')`
      autour de l'affichage (1.5s).
    - **Redesign "pro" complet des lignes Révisions J** (sidebar, modal "Révisions J du jour" ET
      panneau du modal "Organisation de la journée" — les trois surfaces partagent `_jRenderRowsHtml`/
      `_jRenderRowsHtmlPublic`, donc corrigées EN UNE SEULE FOIS) :
      - Chaque ligne affiche maintenant la **pastille de matière + nom de la matière + n° du
        cours** (`_jSubjectInfo()`/`p1GetDisplayNum()`, nouvelles fonctions), en plus du titre du
        cours — résolu localement (pas via le module flashcards `speCfg`/`speName`, chargé bien
        après et inaccessible par closure — pitfall déjà rencontré cette session).
      - **Dates réelles** au lieu de texte vague : "Dû ce jour-là" → "Dû le 4 septembre"
        (`_jFormatDateLabel()`, nouvelle fonction, mêmes précautions anti-UTC que `_jLocalDayKey`/
        `_addDaysIso`) ; les libellés de groupe ("Aujourd'hui", "Demain", "Dans 2 jours"...)
        affichent maintenant la date courte entre parenthèses ("Demain (5 sept.)").
      - **Bug de positionnement des sous-menus corrigé** : Valider et Reporter partageaient la même
        zone d'affichage en bas de carte (les deux menus étaient des `<div>` frères empilés au même
        endroit), donc les options de "Valider" apparaissaient visuellement sous "Reporter" quel
        que soit le bouton cliqué. Restructuré en `.j-due-item-action-group` (bouton + SON menu
        ensemble), chaque menu s'ouvre désormais directement sous son propre bouton.
      - **Redesign visuel** : carte avec liseré d'accent (rouge si en retard), options "Valider"
        en boutons riches (icône + titre + sous-texte), options "Reporter" en pastilles "segmented
        control" (+1J/+2J/+3J/+4J), meilleure hiérarchie typographique, ombres/transitions plus
        soignées. Vérifié par capture d'écran avec données factices reproduisant un cas réel
        (matière en retard + matière du jour + groupe "Demain"), boutons Valider/Reporter cliqués
        un par un pour confirmer le positionnement corrigé des sous-menus.
    - **Page "Réglages" de la présentation (onboarding)** : ajout de deux nouveaux réglages sur la
      même page que le choix "Détaillé/Compact" ("À vous de choisir : Mes cours") — **Barème de
      confiance** (5 ou 10, `SETTINGS.confidenceScale`, réutilise `window.requestConfidenceScaleChange`
      donc la conversion/confirmation existante si l'utilisateur revoit la présentation avec des
      données déjà enregistrées) et **Méthode des J** (activer/ne pas activer,
      `SETTINGS.jMethod`, réutilise `window.setJMethodPrefs`/`refreshJMethodUI`). Piège corrigé en
      testant : `get()` du barème doit renvoyer une CHAÎNE (`String(getConfidenceScale())`), pas un
      Number — comparé par `===` à `option.value` (toujours une chaîne, lue depuis un attribut DOM)
      pour la présélection initiale, sinon la bonne option n'apparaît pas cochée à l'ouverture bien
      que fonctionnellement correcte. Vérifié en ouvrant réellement la présentation
      (`window.TPXOnboarding.start()`) jusqu'à cette page précise : les deux réglages s'affichent,
      présélection correcte (5 / Ne pas activer, valeurs par défaut), clic change bien la sélection.
    - Toujours sans Firestore/Java disponibles dans cette session (données factices, `localStorage`
      renseigné directement pour `isJMethodEnabled()` — piège rencontré en testant : cette fonction
      lit `localStorage` en appel NU dans son propre script, un stub sur `window.isJMethodEnabled`
      n'a aucun effet sur cet appel-là, même pitfall de portée de module déjà documenté). Aucune
      régression de syntaxe (9/9 faux positifs connus).
    - **Page "Cours" de la présentation (onboarding) — vocabulaire + pastille de compteur
      obsolètes + contenu EDN résiduel, signalé avec capture à l'appui.** Cette page (`id: 'items'`
      dans le tableau `pages`) s'appelait encore "Items"/"La liste des items" (jamais renommée en
      "Cours" lors du passage au vocabulaire P1Planner — `id` interne inchangé, volontairement :
      pas de raison de le toucher, seuls `title`/`heading`/`intro` sont affichés). Pastille
      `introSettingsCount` figée à `1` par un ancien commentaire ("seul tours reste disponible") —
      resté stale depuis l'ajout de `confidenceScale` et `jMethod` à la page de réglages liée
      (`items-settings`, lot précédent) : recalculé à `3` (tours + confidenceScale + jMethod, les
      seuls réglages `available()` sur cette page). Un point listé "Les cours de référence sont
      cliquables et mènent directement aux fiches LiSA (après connexion à votre compte UNESS)" —
      contenu EDN/UNESS résiduel, sans équivalent en P1Planner, retiré ; la mention "les objectifs
      LiSA" dans le point suivant remplacée par "ce que vous voulez retenir". Par la même
      occasion : page "Entraînements", qui n'affichait AUCUNE pastille (`choices` absent, `[]` par
      défaut) alors que le réglage `trainingsPage` (afficher/masquer l'onglet) y est bien
      applicable — `choices: ['trainingsPage']` ajouté ; pas de nombre en dur cette fois
      (contrairement à "Cours") puisque `trainingsPage.available()` dépend de `hasTrainings()`, un
      état runtime légitimement variable — `settingsOf()` le recalcule tout seul au bon moment.
      Vérifié en ouvrant réellement la présentation (`window.TPXOnboarding.start()`) : pastilles
      "3 réglages"/"1 réglage" confirmées par capture sur la liste d'intro, page "Cours" ouverte
      individuellement (recherche du texte "LiSA" dans le DOM rendu : plus aucune occurrence
      réelle). Aucune régression de syntaxe (9/9 faux positifs connus).
    - **Non traité dans cette passe, à reprendre séparément** (portée trop large pour cette même
      session, nécessite un audit + une proposition avant modification comme le veut le workflow
      standard) : la refonte de la page de présentation publique (utilisateur déconnecté,
      "Votre tableur de révision en ligne...") en une identité propre à la P1, demandée
      explicitement par l'utilisateur et déjà prévue par `CLAUDE.md` ("Nouvelle identité complète"
      pour la présentation publique du tableur, le tableur lui-même restant proche de TypixClin).
  - **Présentation publique (`#presentation-section`, utilisateur déconnecté) — contenu réécrit
    pour la P1, suite au "continue" de l'utilisateur après le lot précédent.** Audit préalable :
    le contenu mélangeait du texte déjà adapté (FAQ, section "Informations pratiques" — déjà
    correctes, mentionnaient déjà matières/cours/tours/Méthode des J) et du texte resté copié tel
    quel depuis TypixClin/EDN, factuellement faux pour un étudiant de P1 (mentions de
    "l'externat", "items", "collèges de référence", "fiches LISA" — un outil spécifique à
    l'ECN/internat, sans équivalent en P1 — et "semaines de stage"/"été pré-EDN", des réalités
    d'externat, pas de P1). Corrigé :
    - Accroche principale ("Votre tableur de révision en ligne" → "Le tableur pensé pour ta P1")
      et son paragraphe, réécrits pour parler explicitement matières/cours/tours/partiels de P1.
    - Carte fonctionnalité "Fiches LISA" (sans équivalent en P1) remplacée par "Flashcards &
      Méthode des J" — deux fonctionnalités réelles du tableur qui n'étaient pas encore mises en
      avant dans cette grille. Descriptions des autres cartes nettoyées ("items de l'externat" →
      "cours par cours, ... avant les partiels", "semaines de stage" → "semaines de révision").
    - Grille "Pourquoi utiliser ce tableur ?" : "Vision d'ensemble sur l'externat" → "... sur
      votre année de P1", "Meilleur moyen d'anticiper l'été pré-EDN" (sans objet en P1) → "Conçu
      spécifiquement pour la P1".
    - FAQ + le bloc JSON-LD `FAQPage` correspondant (répété deux fois dans le fichier, corrigés
      ensemble) : "niveau de confiance de 1 à 5" fixé en dur, alors que le barème est configurable
      5 ou 10 depuis cette même session — reformulé en "(sur 5 ou sur 10, selon votre réglage)".
    - Suppression d'un bloc HTML mort de ~195 lignes (carrousel commenté "Aperçu de l'interface",
      captures d'écran TypixClin obsolètes — `StatsInterfaceGlobale.png` et consorts, probablement
      absentes du dossier P1Planner de toute façon) qui ne s'affichait nulle part mais polluait le
      fichier avec du contenu EDN/externat supplémentaire. Suppression faite par script Node ligne
      par ligne (délimiteurs `<!--`/`-->` confirmés avant coupe) plutôt que par l'outil d'édition,
      le bloc étant trop long à reproduire verbatim de façon fiable. CSS du carrousel volontairement
      laissée en place (non appelante, risque de casse ailleurs si retirée sans certitude absolue
      qu'elle n'est utilisée nulle part ailleurs — nettoyage cosmétique, pas prioritaire).
    - Titre, meta description, `og:description` déjà propres (vérifiés, aucune modification
      nécessaire) — seul le corps de la section portait encore du texte EDN.
    - **Volontairement pas touché** : la mise en page/CSS existante (grille de cartes, dégradés
      d'icônes, sidebar de connexion sticky) — déjà soignée visuellement (ombres, hover, dark mode,
      thème pastel, responsive), le vrai problème identifié à l'audit était le CONTENU inadapté à
      la P1, pas le design. Une refonte visuelle plus poussée reste possible sur demande explicite,
      mais n'était pas nécessaire pour résoudre ce qui rendait la page "pas en rapport avec la P1".
    - Vérifié : recherche de "externat"/"EDN"/"collège"/"LISA"/"stage" dans toute la section
      publique — plus aucune occurrence. Contenu relu en entier via extraction texte de la page
      rendue (cohérent, sans coupure). Rendu vérifié par capture d'écran à 1280px (cartes, icônes,
      dégradés tous corrects) ; l'espace vide apparaissant lors du scroll sur une largeur de test
      plus étroite a été mesuré et confirmé normal (sidebar `position:sticky` plus courte que la
      colonne principale, comportement flexbox attendu, pas un bug introduit). Aucune régression
      de syntaxe (9/9 faux positifs connus) ; les 3 blocs JSON-LD validés séparément par
      `JSON.parse()` (un bloc édité directement dans une valeur de chaîne).
  - **Petit lot de finitions Révisions J (retour utilisateur sur le lot précédent, captures à
    l'appui) :**
    - **"Aujourd'hui" avait un en-tête différent des autres jours** : le badge de compteur
      (`.j-day-group-count`) était masqué en `display:none` quand un groupe avait 0 élément — or
      c'est PORTÉ ce badge qui portait `margin-left:auto` (ce qui pousse le chevron à droite) ;
      masqué, plus rien ne poussait le chevron, qui se retrouvait collé au libellé au lieu d'être
      aligné à droite comme sur les autres jours. Corrigé en affichant toujours le badge (y compris
      à "0") — répond aussi à la demande explicite "je veux... le nombre de J à voir" pour
      Aujourd'hui. Seul "Aujourd'hui" peut valoir 0 en pratique : les autres groupes ("Dans N
      jours") ne sont de toute façon ajoutés à la liste QUE s'ils ont au moins un élément
      (`getJCheckpointsGroupedDays()`, logique déjà en place, inchangée).
    - **Animation de fermeture pour les sous-menus Valider/Reporter** (l'ouverture était déjà
      animée, la fermeture était instantanée — `[hidden]` coupe l'affichage net, aucune transition
      possible dessus). `window._jToggleMenu()` pose désormais une classe `.closing` (le CSS anime
      un fondu + léger décalage vers le haut sur `J_MENU_ANIM_MS` = 160ms) AVANT de reposer
      `[hidden]`, dans un `setTimeout` de même durée — même schéma que `.modal.closing` déjà utilisé
      partout ailleurs dans ce fichier. Revérifié : `closing` posée immédiatement au clic
      (`hidden` encore `false` à cet instant précis), menu bien cliquable en attendant.
    - **Bug z-index inverse au précédent** : depuis "Cours à revoir ce jour-là"/le panneau
      "Organisation de la journée" (`#day-j-modal`/`#j-first-tour-modal`, z-index 100100 depuis le
      lot précédent), cliquer "Valider + enregistrer un tour" ouvrait `#confidence-modal` (resté à
      10100) DERRIÈRE eux (capture à l'appui). `#confidence-modal` remonté à 100200 — toujours
      au-dessus, quel que soit le modal depuis lequel il s'ouvre (Tour direct, To-Do, ou Révisions
      J). Vérifié par mesure directe des z-index calculés (100200 > 100100) ET par capture écran
      (le modal Tour apparaît bien devant, le modal J visible flouté derrière).
    - **Décalage moche à l'apparition de la scrollbar verticale** sur le tiroir "Révisions J"
      (`.global-jrev-body`) : `scrollbar-gutter: stable` ajouté (réserve la place de la scrollbar
      en permanence, qu'elle soit visible ou non, donc son apparition/disparition — ex. en dépliant
      un groupe de jour — ne change plus la largeur utile du contenu). Même correctif appliqué par
      cohérence aux deux autres surfaces qui partagent le même rendu de lignes J
      (`.day-j-modal-body`, `.pdd-j-panel-body`) même si non explicitement signalées pour celles-ci.
      Support navigateur vérifié (`CSS.supports`-style probe direct sur `element.style.scrollbarGutter`).
    - Vérifié en direct dans le navigateur (mêmes données factices que le lot précédent, reproduites
      fidèlement — capture de référence de l'utilisateur utilisée comme cible) : en-tête
      "Aujourd'hui"/"Dans 2 Jours" désormais identiques structurellement, ouverture/fermeture du
      menu Valider testées, empilement Tour/J confirmé par capture. Aucune régression de syntaxe
      (9/9 faux positifs connus).
  - **Bordure claire autour du bandeau "Flashcards" dans le modal Notes (`#notesInfoPanel`),
    absente du cahier d'erreurs (`#speFlashPanel`)** — signalé avec deux captures comparatives.
    Cause : la règle qui retire le padding/fond du conteneur pour laisser le bandeau dégradé
    "Flashcards" s'étendre jusqu'aux bords (`.spe-flash-info-panel, .notes-info-panel.spe-flash-info-panel
    { padding:0 !important; ... }`) cible la classe `.spe-flash-info-panel`, que porte
    `#speFlashPanel` mais PAS `#notesInfoPanel` (deux id distincts, cf commentaire déjà présent
    dans le fichier : "règles dupliquées à l'identique" pour les deux panneaux — mais CETTE règle
    précise avait été oubliée dans la duplication). `#notesInfoPanel` gardait donc le padding de
    base de `.notes-info-panel` (1.1rem + fond gris) tout autour, visible comme une bordure claire
    autour du bandeau. Corrigé SANS ajouter la classe à l'élément (risque non maîtrisé : des
    dizaines d'autres règles `.spe-flash-info-panel …` existent dans le fichier, dont certaines
    ciblant des enfants — `.flash-panel-scroll`, `.flash-due-banner`... — que `#notesInfoPanel` n'a
    pas dans sa structure, contrairement à `#speFlashPanel`) et SANS copier `overflow:hidden` du
    conteneur (`#notesInfoPanel`, contrairement à `#speFlashPanel`, n'a pas de `.flash-panel-scroll`
    interne dédié — c'est le panneau lui-même qui défile via `.notes-info-panel { overflow-y:auto }`
    de base ; lui retirer aurait rendu la liste illisible dès qu'elle dépasse la hauteur visible).
    Fait "déborder" uniquement le bandeau d'en-tête du padding du parent via des marges négatives
    ciblées (`#notesInfoPanel .spe-flash-panel-header { margin:-1.1rem -1.1rem 1rem -1.1rem
    !important; width:calc(100% + 2.2rem) !important; }`), en laissant le reste du panneau (liste
    `#oicList`, défilement) totalement inchangé. Vérifié par un test isolé (élément de test
    reproduisant exactement `#notesInfoPanel > .spe-flash-panel-header`, hors du vrai modal pour
    éviter le bruit d'un layout flex dégradé dans cet environnement de test sans backend) :
    bandeau parfaitement à fleur des bords gauche/droit (`flushLeft`/`flushRight` mesurés à `true`)
    — capture à l'appui, correspond visuellement à la référence du cahier d'erreurs. Aucune
    régression de syntaxe (9/9 faux positifs connus).
  - **Check vert de validation de tour apparaissant derrière les modaux sur le Planning.** Cause :
    `.tour-success-overlay` était resté à z-index 99999, sous les trois paliers relevés dans les
    lots précédents pour régler d'autres conflits d'empilement — `.pdd-overlay` (100000),
    `#day-j-modal`/`#j-first-tour-modal` (100100), `#confidence-modal` (100200) — donc invisible
    (masqué derrière) chaque fois que le check se déclenchait pendant que l'un de ces modaux du
    Planning était encore ouvert/en cours de fermeture. Remonté à 100300, au-dessus des trois.
    Vérifié par mesure directe des z-index calculés (100300 > 100100, avec `#day-j-modal` actif en
    arrière-plan). Aucune régression de syntaxe (9/9 faux positifs connus).
  - **Scrollbar qui réapparaît + décalage quand le modal de confirmation "Passer la confiance sur
    5/10 ?" s'ouvre depuis Paramètres.** Cause : `openSettingsModal()`/`closeSettingsModal()`
    posaient directement `document.body.style.overflow='hidden'` + leur propre compensation de
    scrollbar, SANS passer par le registre à propriétaires partagé (`window._ednScrollLock`) —
    contrairement à `showCustomConfirm()` (utilisé par `requestConfidenceScaleChange` pour ce
    dialogue), qui lui l'utilise correctement. Résultat : Paramètres pose son verrou "maison"
    (invisible du registre partagé) ; la confirmation qui s'ouvre par-dessus pose SON verrou via le
    registre partagé, qui ne sait rien du verrou de Paramètres et le traite comme le seul actif ; à
    la fermeture de la confirmation, `_ednScrollUnlock` retire purement et simplement
    `overflow:hidden` + la compensation — alors que Paramètres est TOUJOURS ouvert derrière. La
    vraie scrollbar réapparaît sans que rien ne compense sa largeur : décalage de contenu visible,
    exactement le symptôme signalé. Migré `openSettingsModal`/`closeSettingsModal` vers le verrou
    partagé (`_ednScrollLock('settingsModal')`/`_ednScrollUnlock('settingsModal')`, repli sur
    l'ancien mécanisme si `_ednScrollLock` n'existe pas — jamais atteint en pratique, même
    convention que les autres migrations de cette session). Vérifié par mesure directe : Paramètres
    ouvert → confirmation ouverte PAR-DESSUS → confirmation annulée → `body.style.overflow`
    toujours `'hidden'`, padding toujours `10px`, propriétaire restant `['settingsModal']` (l'ancien
    bug aurait tout remis à zéro à cet instant) → Paramètres fermé ensuite → tout repasse
    proprement à l'état initial (`overflow:''`, padding `0px`, aucun propriétaire). Aucune
    régression de syntaxe (9/9 faux positifs connus). **Point de vigilance pour la suite** : ce
    même schéma (verrou "maison" non enregistré + `showCustomConfirm`/`showCustomAlert` ouvert par-
    dessus) existe potentiellement dans d'autres modales encore non migrées vers le verrou partagé
    (audit textuel d'une session précédente en avait recensé une quinzaine, jugées "déjà
    correctement compensées" — ce qui reste vrai pour LEUR propre ouverture/fermeture isolée, mais
    pas pour cette interaction précise avec une confirmation ouverte par-dessus, non testée à
    l'époque) — à corriger au cas par cas si signalé ailleurs.
- [x] **Clignotement de la pastille Premium/essai pendant la déconnexion** (signalé avec le
    correctif exact déjà identifié par l'utilisateur). Cause confirmée en relisant le code réel :
    le `MutationObserver` sur `#toast-logout` (ligne ~20561) qui pilote `body.tpx-logout-toast-
    showing` (masque `.tpx-premium-fab`/`.tpx-trial-fab` pendant que le toast est visible, pour
    éviter le chevauchement signalé dans un correctif antérieur) ne considérait comme "visible" que
    la classe `.show` — pas `.hide`. Or le flux réel de déconnexion (`toast.classList.remove('show')
    ; add('hide')` puis un `await` explicite de 500ms avant de repasser à `.show` avec le message
    "Déconnexion réussie") laisse le toast visuellement présent pendant tout ce fondu (`.hide` →
    `opacity:1→0` sur 500ms, pas une disparition instantanée) : la pastille se démasquait dès le
    passage à `.hide`, puis se remasquait au `.show` suivant — le clignotement observé. Corrigé en
    traitant `.hide` comme "encore visible" au même titre que `.show`. Vérifié par un test direct
    dans la page (ancienne logique vs nouvelle logique comparées sur la même séquence
    show→hide(mi-fondu)→show) : l'ancienne repassait bien à "non masqué" pendant le fondu, la
    nouvelle reste "masqué" en continu sur toute la séquence — plus de fenêtre de réapparition.
    Aucune régression de syntaxe (9/9 faux positifs connus).
- [x] **Décalage à la fermeture du modal Configurer les ressources** (scrollbar réapparaît en
  plein milieu de l'animation de fermeture) : même famille de bug que le clignotement du toast de
  déconnexion ci-dessus — `closeResourcesConfigModal()` restaurait `body.style.overflow` et la
  compensation de largeur IMMÉDIATEMENT, pas à la fin réelle de l'animation `.closing` (180ms).
  Corrigé en déplaçant la restauration dans le `setTimeout` existant. Vérifié par échantillonnage
  direct (`bodyOverflow` reste `"hidden"` sur toute la durée de `.closing`, ne repasse à `""` qu'au
  moment exact où le modal finit de disparaître).
- [x] **Ressources remplacées** (les 9 anciennes — Qi/DP sur EDNi/Hypocampus/Annales/UNESS, Fiche
  Perso — étaient toutes spécifiques aux plateformes/formats EDN) par 3 ressources génériques,
  demande explicite : **Annale**, **Tutorat (Tuto)**, **Prépa (Prépa)**. Mis à jour : le tableau
  `AVAILABLE_RESOURCES`, les couleurs par type sur les 3 thèmes (clair/sombre/pastel — réutilisation
  de teintes déjà en place : orange pour Annale, bleu pour Tutorat, violet pour Prépa), le
  commentaire de la grille CSS. Vérifié en navigateur (modal ouvert, 3 ressources affichées avec
  leurs bonnes couleurs).
- [x] **Animation "check" plein écran — désactivée en mode compact PUIS RÉTABLIE** (revirement
  explicite de l'utilisateur : "je reviens en arrière, même en mode compact je veux une animation de
  validation... aussi bien depuis la todo list que depuis révisions J que depuis le planning que
  depuis la partie mes cours"). Historique : d'abord désactivée pour le mode compact (garde en tête
  de `showTourSuccessAnimation()`), PUIS ce même message a demandé l'inverse — garde retirée, la
  fonction s'affiche désormais dans tous les cas. En creusant les 4 points d'entrée cités, un
  deuxième filtrage indépendant est apparu : `_tourValideDepuisTodo` (= tour validé depuis la Todo/
  Programme de la journée, via `pendingChecklistItemId`) supprimait spécifiquement le check dans le
  flux détaillé (modal de confiance partagé par Todo / Révisions J / Planning / Mes cours détaillé)
  quand la validation venait de la Todo — supprimé à ses 3 points d'usage (la variable, devenue
  inutile, a été retirée). Le flux compact (`doAdd()`, Mes cours en mode compact) appelait déjà
  `showTourSuccessAnimation()` sans condition propre : il était seulement bloqué par la garde interne
  ci-dessus, donc corrigé du même coup. Vérifié que Révisions J et le panneau Planning ("Organisation
  de la journée") passent par le même modal de confiance partagé — aucun code séparé à traiter.
  Vérifié en navigateur (onglet neuf, `npx serve public`) : overlay `#tour-success-overlay` déclenché
  manuellement, opacity 0→1 confirmée entre ~150ms et ~700ms puis retour à 0 vers 1,5s (capture
  d'écran à l'appui) ; baseline syntaxe re-vérifiée (51 scripts, aucune régression).
- [x] **Cartes "Révisions J" redesignées en plus compact** (demande explicite : "prend trop de
  place en hauteur", espace blanc inutilisé à droite de la matière/n°/nom de cours) : les boutons
  Valider/Reporter, auparavant deux boutons pleine largeur empilés SOUS la carte, sont déplacés
  dans cet espace resté vide — `.j-due-item-head` sépare gauche (matière + nom de cours, empilés,
  inchangés) / droite (2 boutons compacts empilés). Les sous-menus (Valider sans tour / + tour,
  options de report) restent affichés sous toute la carte une fois un bouton cliqué, inchangés dans
  leur contenu — `_jToggleMenu()` les retrouve via `.closest('.j-due-item')` + `[data-jmenu]`,
  aucune dépendance à leur position DOM exacte, donc aucun changement JS nécessaire là. Repris via
  la fonction déjà factorisée `_jRenderRowsHtml()` (carte sidebar, modal "Révisions J du jour" ET
  panneau "Organisation de la journée" partagent ce même template — un seul endroit à changer).
  Media query de repli sous 360px (empile verticalement si vraiment trop étroit).
- [x] **Couleurs "Type de journée" désormais identiques entre le calendrier et le modal
  "Organisation de la journée"** (bug signalé, capture à l'appui) : la mini-popup ouverte depuis le
  calendrier (`.status-mini-btn`) colore chaque option en permanence (vert Révision, orange
  Séminaire, violet Repos, rouge Examen), alors que la grille du modal PDD (`.pdd-status-card`) ne
  colorait QUE l'option actuellement sélectionnée (via un style inline posé par `applyStatusUI()`),
  les autres restant neutres/blanches — d'où l'impression de deux traitements différents. Corrigé
  en ajoutant les mêmes couleurs, par sélecteur d'attribut `[data-status="..."]`, directement sur
  `.pdd-status-card` (les 3 thèmes), pour qu'elles soient visibles EN PERMANENCE comme sur la
  mini-popup — la sélection reste distinguée par la bordure épaissie + ombre déjà en place.
  **Mise à jour, vérifié depuis en navigateur** (voir audit sécurité/perte de données ci-dessous,
  qui a aussi mis au jour puis corrigé un bug bloquant tout le chargement de cette grille) : élément
  `.pdd-status-card[data-status="revision"]` injecté directement, couleurs calculées confirmées
  exactement conformes (fond `#dcfce7`, bordure `#10b981`, texte `#166534`).

## 7bis. Audit sécurité des données utilisateur et risques de perte de données
Demande explicite utilisateur : "audit complet de sécurité des données des utilisateurs et des
risques de perte de données". Périmètre couvert : `firestore.rules`, `storage.rules`,
`functions/index.js`, et les chemins d'écriture réels du tableur (`public/tableur.html`).

- [x] **`firestore.rules` relu intégralement — sain.** Fail-closed par défaut, isolation par uid
  systématique, `entitlements/{uid}` et `billingPrivate/{uid}` non modifiables par le client sous
  aucune condition, `canWrite()` vérifie `writeAccessUntil` avant toute écriture applicative
  (lecture seule après expiration, jamais de suppression), suppression physique interdite partout
  sauf `backups` (filet de sécurité, pas une donnée primaire). Les nouvelles collections Stripe
  (`billingLocks`, `stripeEvents`, `billingConflicts`) créées en session précédente n'ont pas de
  règle dédiée — correctement fail-closed par le fallback `{document=**}`, uniquement accessibles
  via Admin SDK côté Cloud Functions (aucune action requise).
- [x] **`storage.rules` relu intégralement — sain.** Même schéma isolation/verrou d'accès, taille
  (5 Mo) et type (`image/*`) de fichier validés à l'écriture, aucun bucket public.
- [x] **Cloud Functions — vérifications reconfirmées** : signature webhook Stripe vérifiée
  (`stripe.webhooks.constructEvent`), `requireVerifiedUser()` (auth + email vérifié) posé sur les 3
  fonctions callable (`createCheckoutSession`, `saveExamDate`, `createCustomerPortalSession`).
  Aucune régression depuis leur écriture en session précédente.
- [x] **BUG RÉEL DE PERTE DE DONNÉES TROUVÉ ET CORRIGÉ — configuration des ressources
  (Annale/Tutorat/Prépa) jamais réellement sauvegardée.** En traçant `saveResourcesConfig()`, la
  chaîne menait à `debouncedSave()` → `saveUserData()`, une fonction explicitement neutralisée en
  no-op dans une session antérieure (`planningRevision/{uid}` n'existe pas dans l'architecture P1,
  absent de `firestore.rules`) — le toast "Configuration enregistrée !" s'affichait, mais rien
  n'était écrit sur Firestore : la sélection revenait à vide à chaque rechargement de page, sans
  erreur visible. Corrigé en écrivant réellement dans `users/{uid}/settings/preferences`
  (`p1SaveSelectedResources()`), même convention que `confidenceScale`/`toursViewMode`/
  `jMethodPrefs` déjà en place, avec chargement au login (`_checkSelectedResources()`, filtré contre
  d'éventuels anciens id EDN résiduels).
- [x] **BUG RÉEL DE PERTE DE DONNÉES TROUVÉ ET CORRIGÉ — case "ressource validée" par cours jamais
  sauvegardée, à DEUX endroits.** `getItemData()` renvoyait `resources: {}` codé en dur (jamais lu
  depuis le vrai document `courses/{fc}`) ; `window.toggleResourceValidation` (case normale) ET
  `window.toggleResourceInOverflow` (popup "···" au-delà de 3 ressources sélectionnées) mutaient
  cet objet jetable puis appelaient le même `debouncedSave()` mort — cocher "Annale faite" pour un
  cours n'était donc écrit NULLE PART, ni immédiatement (l'affichage se recalculait à partir du
  même objet toujours vide) ni après reload. Corrigé : `getItemData()` lit maintenant le vrai champ
  `c.resources`, nouvelle fonction `p1WriteResourceValidation(sId, fc, resourceId, validated)`
  (même patron que `p1WriteTourSlot` déjà en place, écriture ciblée `resources.<id>` par notation
  pointée pour ne jamais écraser les autres ressources déjà validées) appelée aux deux endroits.
- [x] **BUG RÉEL DE PERTE DE DONNÉES TROUVÉ ET CORRIGÉ — priorité d'un cours jamais sauvegardée, à
  DEUX endroits.** Même famille de bug : `window._applyNotesPriority` (popup de priorité du modal
  Notes) et `window._applyItemPriority` (bouton priorité de la table) mutaient `d.priority` sur
  l'objet jetable de `getItemData()` puis appelaient `window.debouncedSave()`/`window.saveUserData()`
  — la priorité choisie (urgent/pas urgent/relative) n'était jamais persistée. Corrigé avec une
  nouvelle fonction dédiée `p1WriteCoursePriority(fc, priority)` (même patron), appelée aux deux
  endroits ; `priority: null` explicite (pas omis) pour bien effacer une priorité déjà posée.
- [x] **Vérifié qu'aucun autre appel à `debouncedSave()`/`saveUserData()` n'est orphelin** : sur les
  seuls sites restants après les 4 corrigés ci-dessus, `saveData()` (checklistData/planningData) est
  du code mort (aucun appelant dans tout le fichier, la vraie persistance passe déjà par
  `tasks`/`calendarDays`, confirmé par un commentaire déjà présent dans le code) — rien à corriger.
  Les autres mentions de `debouncedSave` restantes dans le fichier sont soit sa propre définition,
  soit des commentaires décrivant des bugs de la MÊME famille déjà corrigés lors de sessions
  antérieures (mode compact des tours, écriture des tours en mode détaillé) — tous confirmés migrés
  vers un vrai écrivain Firestore dédié (`p1WriteTourSlot`), aucune régression.
- [x] **BUG RÉEL AUTO-INFLIGÉ TROUVÉ ET CORRIGÉ PENDANT LA VÉRIFICATION — la page ne chargeait plus
  du tout** (`"X.active is not a function"` à la console dès l'ouverture) : un commentaire ajouté
  plus tôt dans cette même session (correctif des couleurs "Type de journée", voir plus haut)
  utilisait des backticks façon markdown (`` `.active` ``) — or ce bloc CSS est en réalité un
  template literal JavaScript (`` var CSS = `...` ``), pas un vrai `<style>` statique : un backtick
  isolé dans un commentaire referme le template literal en plein milieu et transforme la suite en
  code JS réellement exécuté. Trouvé en vérifiant en navigateur APRÈS coup (jamais annoncé comme
  fonctionnel avant ce test) plutôt qu'en se fiant au `node --check` seul (qui ne détecte que les
  erreurs de syntaxe, pas ce genre d'erreur d'exécution). Corrigé (backticks retirés du
  commentaire) et reconfirmé par un rechargement complet dans un onglet neuf : plus aucune erreur,
  `p1WriteResourceValidation`/`p1WriteCoursePriority` bien exposés, page pleinement fonctionnelle.
  **Point de vigilance ajouté en commentaire dans le fichier** à cet endroit précis pour éviter la
  récidive — ce fichier contient plusieurs blocs CSS injectés via des template literals JS (au
  moins 3 repérés autour du modal "Organisation de la journée"), visuellement indiscernables d'un
  vrai `<style>` sans vérifier les balises `<script>` environnantes.
- [ ] **Non couvert par cet audit, faute de temps** : validation de la taille/du contenu des champs
  côté `firestore.rules` (un client bogué pourrait écrire un champ texte disproportionné — la
  limite Firestore de 1 Mo par document reste le seul garde-fou aujourd'hui) ; revue exhaustive des
  usages `innerHTML` avec contenu utilisateur (risque XSS, périmètre bien plus large qu'un tour de
  cette taille ne peut couvrir) ; confirmation que TOUTES les fonctionnalités du tableur (au-delà de
  ressources/priorité, dont le bug était déjà connu et documenté par un commentaire existant) sont
  bien migrées vers un écrivain Firestore réel — seuls les points explicitement signalés ou trouvés
  en traçant `debouncedSave()`/`saveUserData()` ont été vérifiés, pas une relecture ligne à ligne
  des ~60 000 lignes du fichier.

## 8. Production
- [x] **Premier déploiement réel (GO explicite reçu)** : `firestore.rules`, `storage.rules`
  et la Cloud Function `onUserCreated` sont en production sur le vrai projet `p1planner`
  (vérifié via `firebase functions:list` — `onUserCreated`, trigger `user.create`,
  `europe-west1`, nodejs20). `functions/index.js` corrigé au passage : `initializeApp()`
  était appelé au chargement du module, ce qui bloquait l'étape d'analyse locale de
  `firebase deploy` — rendu paresseux (voir commentaire dans le fichier), 3/3 tests
  Emulator toujours verts après coup.
- [ ] Tests complets (reste : QA manuelle sur le vrai projet, pas seulement Emulator)
- [x] Vérifier Firebase cible (p1planner confirmé, isolation vérifiée)
- [ ] Vérifier Stripe cible
- [ ] Domaine
- [x] GO explicite (déploiement Rules + Storage + Functions, cette session)
- [x] **Email de vérification via Brevo (compte séparé de TypixClin)** : le mailer par
  défaut de Firebase Auth s'est révélé peu fiable en délivrabilité (confirmé par
  l'utilisateur — aucun mail reçu, spam compris, sur plusieurs tentatives et fournisseurs).
  `functions/index.js` : `sendVerificationEmailOnCreate` (trigger auth, envoie
  automatiquement à l'inscription) + `resendVerificationEmail` (callable, remplace
  `sendEmailVerification()` du SDK client pour le bouton "Renvoyer" dans `auth.html`,
  avec repli sur le SDK client si la Function est indisponible). Domaine `p1planner.fr`
  authentifié chez Brevo (DKIM/DMARC/sous-domaine de marque `mail.p1planner.fr`, DNS
  posé chez GoDaddy). Clé API Brevo stockée en secret Firebase (`BREVO_API_KEY`,
  jamais dans le code/repo public). Déployé et vérifié en ligne (`firebase functions:list`).
  **Reste à confirmer** : réception réelle d'un email de bout en bout (pas encore testé
  après ce déploiement — ne jamais l'annoncer réussi avant un vrai test).
