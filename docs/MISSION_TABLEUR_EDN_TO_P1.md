# Mission — Reconstruire tableur.html à partir du tableur EDN TypixClin

Ce document remplace l'approche précédente ("recloner visuellement puis ajouter des
features à côté"). Nouvelle approche demandée par l'utilisateur : **partir du vrai
fichier `reference-typixclin/TableurEnLigne.html` (58 897 lignes) et le réduire/adapter**,
plutôt que de repartir d'une base neuve qui s'en inspire. Tous les mécanismes EDN
doivent survivre ; seule la couche donnée + quelques briques précises changent.

À lire avant toute exécution : `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`.

---

## 1. Ce que le tableur P1 doit faire (spec fonctionnelle)

### 1.1 Ce qui reste STRICTEMENT identique à TypixClin (mécanique, UI, UX)
Inventaire vérifié directement dans `TableurEnLigne.html` (pas de mémoire, grep réel) :

- **Table des cours** (`renderItemsTable`, `.items-table`) : recherche, tri par colonne,
  filtres par matière (chips, `initSpecialtyMultiSelect`/`renderSpecialtyOptions`) et par
  statut, vue compacte/détaillée (`buildCompactCell`), pagination (`initPagination`).
- **Bandeau de tours par ligne** : boutons de confiance colorés (`.confidence-btn`,
  couleurs `--conf-1..5`), verrouillage séquentiel, badge d'ancienneté
  (`.days-badge` : récent/modéré/ancien/jamais), durée + support affichés sous le tour,
  animation de succès (`showTourSuccessAnimation`), popup de contexte (`.tour-context-card`).
- **Modales** : `openModal`, `openSpecialtyModal`/`openItemModal` (matière/cours),
  `showCustomConfirm`/`showCustomAlert` (dialogues maison, pas `confirm()`/`alert()` natifs),
  `openHelpModal`.
- **Notes** : `loadNoteFromFirestore`/`saveNoteToFirestore`, `openNotesModal`, éditeur riche.
- **Flashcards** : `loadFlashCards`/`loadAllDueFlashCards`/`saveFlashCard`,
  `renderFlashManageView`, `openFlashEdit`, `showFlashCard`, `showFlashEndScreen`,
  `openFlashDrawer`.
- **Cahier d'erreurs des entraînements** : `notesEntrainements` (sous-collection dédiée,
  déjà séparée dans TypixClin — donc pas d'anti-pattern à corriger ici, juste à renommer/adapter).
- **Entraînements** : `saveTrainings`/`loadTrainings`/`initTrainingsData`,
  `saveTrainingsPageVisibility`.
- **Planning** : `renderCalendar`, `openStatusPopup`/`openSpecialtyPopup`,
  `saveDayNotes`, `buildPlanningLegendItems`.
- **Stats** : `renderStats`, `renderPriorityItems`, `renderSpecialtyRanking`,
  `renderDashboardSpecialties`, `initWeeklyCharts`.
- **Trophées** : `loadTrophies`/`saveTrophies`/`renderTrophies`.
- **Chronomètre de session** : `initTimer`/`saveTimerState`.
- **Sauvegardes** : `saveBackupToFirebase`/`saveCloudBackup`/`openBackupModal`
  (TypixClin a déjà ce mécanisme — donc "sauvegardes cloud + historique" n'est pas une
  nouveauté P1, c'est une ADAPTATION d'un bloc existant, à rebrancher sur le schéma P1).
- **Hors-ligne** : `initOfflineDetection`/`showOfflineNotification`/
  `showOfflineActionBlockedMessage`/`showConnectionWarning`.
- **Feedback utilisateur** : TypixClin a déjà une collection `feedbacks` — à réutiliser
  (renommer si besoin), pas besoin de la recoder comme on l'a fait dans la version précédente.

### 1.2 Ce qui est NOUVEAU pour P1 (n'existe pas dans TypixClin)
- **Méthode des J intégrée au Programme de la journée.** TypixClin n'a pas cette mécanique.
  À porter depuis l'implémentation déjà codée et testée dans l'ancien `public/tableur.html` :
  `jStepIndex`, `jAnchorDate`, `jHistory[]`, `J_PRESETS` (rapproché/équilibré/espacé/personnalisé),
  bascule J ↔ feeling ↔ planification manuelle par cours, `advanceJ` dans la transaction de
  validation d'un tour. Voir `docs/DECISIONS.md` section "Tours / J" pour les règles exactes
  (J optionnel, Tours toujours saisis, pas de lien rigide Tour i+1 = J i sauf via ce flag).
- **Programme de la journée** doit fusionner : échéances J dues/en retard + tâches manuelles
  + planification manuelle libre — dans une seule liste actionnable (Faire maintenant/Reporter).

### 1.3 Ce qui est EXCLU (avec justification — à confirmer, voir §4)
- **Numéro officiel / Ressources** (colonnes item EDN) : spécifiques au programme national
  imposé, sans équivalent pour des cours créés librement par l'utilisateur. Décision déjà
  actée précédemment.
- **Constructeur de programme EDN/ECOS** (`buildCustomEdn`, `buildCustomEcos`,
  `loadContentSpes`, import du référentiel officiel) : suppose un curriculum imposé fixe.
  P1 fonctionne avec des Matières/Cours créés librement par l'utilisateur — cette brique
  n'a pas d'équivalent utile. **Bucket C (supprimer).**
- **Système social / amis / partage** (`renderFriendsList`, `renderRequestsPanels`,
  `showSearchResult`, `sharedNotes`, `loadSharedNotesForItem`, `showShareToast`, `showNudge`,
  `showImportToast`) et **classement entre utilisateurs** (`initPodiumWatch`) :
  contredit la décision déjà actée explicitement ("juste le feedback utilisateur → admin,
  pas de système ami/partage"). Chaque brique sociale élargit la surface d'attaque P0
  ("utilisateur A accède aux données de B"). **Proposé en bucket C, à confirmer.**
- **Stripe/Billing TypixClin** (`tpx-billing.js`, `premiumPlans.js`, tout code Checkout/webhook
  inline) : remplacé plus tard par l'intégration Stripe propre à P1 (hors périmètre actuel,
  cf. `CLAUDE.md` "pas Stripe maintenant sauf besoin bloquant"). Le tableur P1 doit seulement
  *lire* `entitlements/{uid}.writeAccessUntil`, jamais réimplémenter la logique de paiement.

### 1.4 Vocabulaire (renommage progressif, priorité au texte visible utilisateur)
| TypixClin | P1Planner |
|---|---|
| spécialité | matière (`subject`) |
| item | cours (`course`) |
| todo | Programme de la journée (`schedule`) |
| (EDN) tour | tour (`tour`, conservé tel quel) |
| — | révision (`revision`), entraînement (`training`) |

---

## 2. Plan d'exécution étape par étape

### Étape 0 — Sauvegarde du travail existant
- `public/tableur.html` actuel (recloné + fonctionnalités P1 déjà testées : dailyStats,
  feedback, backups, tasks, offline) est renommé `public/tableur.reference-p1.html` et
  gardé comme référence de câblage Firestore — **il ne sert plus de page servie, uniquement
  de documentation vivante du branchement `subjects/courses/tourLogs/...` déjà écrit et testé.**
- Ne rien supprimer : `test/firestore.rules.test.mjs`, `test/bootstrap.test.mjs`,
  `firestore.rules`, `storage.rules`, `functions/index.js` ne changent pas — le schéma
  backend déjà construit et testé (34+3 tests verts) reste la cible, seule la façade
  change de base.

### Étape 1 — Copie de la base EDN
- Copier `reference-typixclin/TableurEnLigne.html` → `public/tableur.html`.
- Ne pas encore toucher au contenu : premier commit = copie brute, pour avoir un diff
  propre ensuite.

### Étape 2 — Isolation Firebase (P0, prioritaire absolue)
- Supprimer tout `firebaseConfig` TypixClin (`typixclin-b5fa9`), le remplacer par la vraie
  config P1Planner (déjà validée dans `CLAUDE.md`), avec le même garde-fou déjà utilisé dans
  `auth.html`/`comptepremium.html` (vérification explicite `projectId === "p1planner"`
  + refus si `typixclin` apparaît dans la config, avant toute utilisation).
- Supprimer les imports `tpx-billing.js`/`premiumPlans.js` et tout appel Stripe direct.
- Grep de contrôle final sur tout le fichier : `typixclin`, `tpx-`, `stripe` → doit
  ressortir vide (hors commentaires explicatifs éventuels).

### Étape 3 — Suppression des briques hors-périmètre non couplées aux données (bucket C, §1.3)
Uniquement ce qui peut être retiré sans toucher au moteur de rendu principal :
- Système social/amis/partage/podium (décision tranchée §4 : retiré).
- Colonnes Numéro officiel / Ressources dans `renderItemsTable`/`buildCompactCell`
  (juste des colonnes en moins, pas une dépendance structurelle).

**Correction après audit réel** : `data.js` (le programme des 367 items EDN,
`SPECIALTIES_DATA`/`SPECIALTY_SHORT`/`window.DEFAULT_TRAININGS`) n'est PAS une brique
isolable — quasiment toutes les fonctions de rendu (`renderItemsTable`, `renderStats`,
`renderSpecialtyRanking`, `renderDashboardSpecialties`, `initSpecialtyMultiSelect`, etc.)
lisent directement ce tableau figé. Le retirer et rebrancher sur les vraies données
utilisateur (`subjects`/`courses`) EST l'étape 4, pas une étape séparée avant. Constaté
en testant le fichier après l'étape 2 (page charge sans erreur de syntaxe, mais
`SPECIALTIES_DATA is not defined` partout dès que `data.js` — jamais copié dans P1,
404 — est absent).

### Étape 4 — Remplacement du modèle de données (le plus gros morceau, le vrai risque)
Le cœur du travail : TypixClin lit/écrit **un seul document géant** `users/{uid}`
(`loadUserData`/`saveUserData`, `loadData`/`saveData`) contenant tout en mémoire.
P1 utilise déjà un schéma décomposé et testé (1 document par cours, collections séparées)
— ce choix reste, il n'est pas remis en cause par cette mission (c'était une correction
volontaire de l'anti-pattern TypixClin, pas une différence gratuite).

Pour chaque brique fonctionnelle de §1.1, remplacer sa source de données :
1. Repérer la fonction de rendu EDN (ex. `renderItemsTable`) et sa fonction de lecture
   (ex. dans `loadUserData`, quelle clé du gros doc alimente cette table).
2. La remplacer par un ou plusieurs listeners `onSnapshot` sur les collections P1
   correspondantes (`subjects`, `courses`, `courses/{id}/tourLogs`, `notes`, `flashcards`,
   `flashcards/{id}/reviews`, `errorEntries`, `trainingItems`, `trainingItems/{id}/attempts`,
   `tasks`, `calendarDays`, `dailyStats`, `backups`, `feedback`) — le code de câblage exact
   existe déjà, testé, dans `public/tableur.reference-p1.html` (issu de l'étape 0) :
   `startListeners`, `validateTour`, `state`/`dataState`, à copier-coller/adapter plutôt
   qu'à réécrire de zéro.
3. Garder la fonction de rendu EDN quasi telle quelle : elle doit juste lire une variable
   en mémoire de même forme, peu importe qu'elle vienne d'un gros doc ou de plusieurs
   collections.
4. Écritures : remplacer chaque `saveUserData(...)`/écriture dans le gros doc par
   `setDoc`/`updateDoc`/`runTransaction` sur le document précis concerné, gaté par
   `canWrite(uid)` côté Rules (déjà écrit, déjà testé) — ne pas dupliquer la logique de
   permission côté client, les Rules restent la seule source de vérité.

**État réel (mis à jour au fil du travail)** :
- [x] Zone 1 — Matières/Cours : le module `tpx-perso-script` (mode sur-mesure déjà présent dans TypixClin) a été gardé comme moteur, patché pour être toujours actif (`supported()`/`canWrite` forcés, plus de programme officiel à protéger), et rebranché sur `subjects`/`courses` de P1 (listeners `onSnapshot` temps réel au lieu du doc unique `users/{uid}/content/edn`, écritures `setDoc`/`updateDoc` par document avec `merge:true`, archivage `archivedAt` au lieu de suppression). Testé réellement : création matière, création cours, archivage matière avec cascade correcte sur ses cours (et uniquement les siens), le tout vérifié directement dans Firestore (Emulator), pas juste à l'écran. Dialogues de confirmation corrigés (annonçaient une suppression "définitive" alors que c'est un archivage — texte maintenant honnête).
- [x] Zone 2 — Table principale et validation des tours (le cœur de l'usage quotidien) : `getItemData(sId, fc)` lit désormais en direct le cache `courses` de P1 (alimenté par onSnapshot) au lieu de l'ancien `userData.items[key]` — tout le moteur de rendu EDN (table, badges, couleurs de confiance) continue de fonctionner sans modification, juste avec une vraie source de données. Écriture d'un tour (`p1WriteTourSlot`, nouvelle fonction) : écrit directement `courses/{fc}` (merge:true, tableaux à 8 slots), remplace le "mute l'objet local + debouncedSave() du gros document" de TypixClin. Testé réellement de bout en bout : validation d'un tour (confiance 3) sur un cours neuf → vérifié dans Firestore ET à l'écran (badge coloré, "0J"), effacement du même tour → vérifié dans Firestore (tout repasse à null). Le cours existant avec tout son historique (tours 1-7, durées, supports) continue de s'afficher correctement.
  - Écart connu : `window.tpxPremiumLocked` (blocage Premium de TypixClin) n'est plus jamais vrai depuis le retrait de `tpx-billing.js` — les écritures ne sont donc pas encore bloquées en lecture seule par ce mécanisme précis. Le blocage réel de P1 (`entitlements/{uid}.writeAccessUntil`) reste à brancher sur ce point d'entrée précis (actuellement uniquement actif côté Firestore Rules, qui refusent bien l'écriture en base — donc pas de risque de perte/incohérence de données, juste pas encore de message clair à l'écran).
  - Reste non converti (autres consommateurs de l'ancien `userData`/`debouncedSave` : priorité, planning/checklist, trophées, entraînements) — prochaine sous-étape.
- [x] Passe de nettoyage TypixClin → P1 (suite retour utilisateur) : SEO/meta/JSON-LD, loader, logo, dropdowns "Outils/Fiches/Ressources" du header et du menu mobile (pointaient vers des pages TypixClin inexistantes dans P1), footer entier réécrit, toasts de déconnexion, onboarding ("Bienvenue sur le tableur EDN" → P1Planner), modale "Nouveautés" (tout le changelog TypixClin remplacé par un contenu P1 honnête), paramètres (carte "Programme officiel/Sur-mesure" et "Sélection TypixClin" retirées — mortes, P1 n'a qu'un seul mode), système "amis" désactivé (plus de point d'entrée UI, plus d'appel Firestore), vocabulaire visible (spécialité→matière, item→cours sur les libellés principaux, placeholders d'exemple "Cardiologie"→"UE2"/"Membrane plasmique"). Au passage : bug réel trouvé et corrigé (`dur.split is not a function` — anciennes données de test avec durée en minutes/nombre au lieu du format "H:MM"/chaîne désormais standard, 4 sites non protégés corrigés).
- [x] Notes / Cahier d'erreurs / Flashcards : bien meilleure surprise que prévu — TypixClin n'utilise PAS le gros document pour ces trois-là, déjà 1 document par note/carte dans des collections dédiées (`notes`, `FlashCards`, `ErreurSpe`), via des bridges `window._notesFirestore`/`window._flashFirestore` déjà correctement branchés sur le vrai `db`/`currentUser` du module principal. Le seul vrai bug : `TPXC(name)` suffixait `_perso` (mécanique officiel/sur-mesure de TypixClin, sans objet pour P1) et gardait des noms anglais différents des Rules P1 (`FlashCards`→`flashcards`, `ErreurSpe`→`errorEntries`) — corrigé par une table de correspondance central. Bug additionnel trouvé et corrigé au passage : `OIC_DATA` (objectifs LISA officiels) jamais déclaré dans le stub `data.js`, faisait planter *tout* le chargement d'une note (pas juste le panneau objectifs) via un `.catch()` qui écrasait un état "vide" légitime en "erreur de connexion". Et un second bug trouvé par test réel : mon remplacement du bloc "Nouveautés" avait supprimé une balise `</div>` fermante, imbriquant silencieusement TOUTE la suite du fichier (dont la modale Notes) dans la modale Nouveautés masquée — corrigé.
  Testé réellement, écrit et relu directement dans Firestore : une note, une entrée de cahier d'erreurs, une flashcard.
  - Le Cahier d'erreurs de TypixClin est **un document par matière** (tout le texte riche en un bloc), pas structuré par entrée individuelle — différent de ce qui était envisagé à l'origine pour P1, mais fonctionne et reste cohérent avec la décision de cette session de garder les mécaniques EDN telles quelles.
- [x] Programme de la journée (checklist → `tasks`) : `loadUserData`/`saveUserData` de TypixClin visent un document racine `planningRevision/{uid}` (hors du schéma `users/{uid}/...` protégé par mes Rules — cause racine de tout le bruit `permission-denied` vu depuis le début de cette session). Décision explicite de l'utilisateur : décomposer proprement plutôt qu'autoriser ce document. `checklistData` reste un tableau en mémoire de même forme (aucune fonction de rendu touchée), mais peuplé par une vraie écoute temps réel sur `tasks/{id}` (nouveau : `PlanningModule.startTasksListener(uid)`/`stopTasksListener()`), et chaque mutation (`addItemFromTable`, `completeChecklistItem`, `toggleChecklistItem`, `deleteChecklistItem`, `handleChecklistChoice`) écrit directement le document au lieu de muter le tableau + `saveData()`/`debouncedSave()`. Suppression = archivage (`archivedAt`), jamais de `delete` (Rules `tasks` : delete toujours refusé).
  Trois bugs réels trouvés et corrigés en testant (pas supposés) :
  1. `onclick="...toggleChecklistItem(${item.id}, event)"` non guillemeté : marchait avec l'ancien id numérique (`Date.now()`), cassait en erreur de syntaxe JS avec le nouvel id Firestore (chaîne).
  2. `parseInt(popup.dataset.itemId)` dans `handleChecklistChoice` : même cause, tronquait/`NaN`ifiait l'id.
  3. Course entre `updateUserUI` (démarre l'écoute tasks) et `PlanningModule.init()` (appelé indépendamment 100 ms après `DOMContentLoaded`, écrasait `checklistData` en `[]` juste après qu'il ait été peuplé) — `loadData()` ne touche plus `checklistData`, exclusivement propriété de l'écoute Firestore désormais.
  Testé réellement de bout en bout : création d'une tâche liée à un cours → vérifiée dans Firestore et à l'écran → complétée via le popup "tâche uniquement" → vérifiée (`completed:true`) → supprimée → vérifiée (`archivedAt` posé, plus de `delete`).
- [x] Planning (`planningData` → `calendarDays`) : même principe que Programme de la journée — `planningData` reste un objet en mémoire de même forme (`{ [dateKey]: {status?, specialties?, notes?} }`), tous les rendus (`renderCalendar`, `updateDayCell`) intacts, peuplé par `PlanningModule.startCalendarListener(uid)` sur `calendarDays/{dateKey}`. 6 points d'écriture rebranchés (`setDayStatus`, `fillWeekWithStatus`, `fillWeekWithSpecialties`, `setDaySpecialties`, `saveDayNotes`, `_ednSaveDayNotesRich`) vers `p1SaveDay(dateKey)`. Un point manqué trouvé au passage : `addChecklistItem` (ajout manuel de tâche texte libre) utilisait encore l'ancien mécanisme, également corrigé.
  Testé réellement : statut "Stage" posé sur un jour → vérifié dans `calendarDays/{date}` (`status:"stage"`).
- [x] Entraînements (`userData.trainings` → `trainingItems`) : contrairement aux autres zones, 25+ sites LISENT `userData.trainings` directement (fonctions non exposées, éparpillées) mais un seul point d'ÉCRITURE partagé existe déjà : `saveTrainings()`, appelé par tous ces sites après avoir muté le tableau. Stratégie : ne toucher AUCUN de ces 25+ sites — `userData.trainings` reste un tableau en mémoire de même forme, peuplé par `p1StartTrainingsListener(uid)` (écoute `trainingItems`), et `saveTrainings()` réécrit pour comparer l'état courant du tableau à l'état Firestore connu et synchroniser la différence (items nouveaux/modifiés écrits par document, items disparus du tableau archivés). `window.userData` était `null` en permanence avant ce correctif (le chargement `planningRevision` échouant toujours) ; les fonctions défensives déjà existantes (`initTrainingsData`) le transforment en objet réel, donc aucun risque de `null.trainings`.
  Testé réellement : création d'un entraînement via le vrai modal → vérifiée dans `trainingItems/{id}` → suppression via le vrai bouton → vérifiée (`archivedAt` posé).
- [x] Trophées : **aucune conversion nécessaire, vérifié fonctionnel tel quel.** `loadTrophies()`/`saveTrophies()` ne font *aucun* appel Firestore (juste un cache mémoire pour détecter les déblocages) — cohérent avec la décision "jamais persisté". Le vrai sujet soulevé par l'utilisateur (complétion du programme = % basé sur un total figé de 367 items) s'est avéré **déjà résolu** : `TOTAL_ITEMS`/`SPECIALTIES_DATA` sont recalculés dynamiquement depuis les vraies matières/cours de l'utilisateur (fait aux zones 1-2), donc `progressPercent` et tous les seuils de trophées ("5% des items", "50% des items"...) portent déjà sur le programme réel de l'utilisateur, pas sur un total imposé. Vérifié à l'écran avec le compte de test (1 matière, 2 cours → "1/2 items", trophées 5/10/25/50% correctement débloqués).
  **Nettoyage restant trouvé et fait au passage** : plusieurs textes visibles (présentation, FAQ, aide statistiques, bannière Premium) mentionnaient encore "367 items"/"747 items"/"collèges de référence" — remplacés par une formulation qui ne suppose plus un total figé.
  - **Reste volontairement non fait** (mécanique, pas fonctionnel, priorité plus basse) : le CSS/HTML/JS mort du système amis (des centaines de lignes, inaccessible mais toujours présent dans le fichier) ; la colonne "Numéro" du tableau (affiche l'id Firestore, pas un vrai numéro — décidé à retirer mais pas encore fait structurellement) ; les images de la présentation marketing (Spé1.png etc., n'existent pas dans P1) ; vocabulaire "spécialité/item" encore présent dans des recoins moins visibles (commentaires de code, variables internes).

**Ordre de conversion recommandé** (une zone à la fois, testée avant de passer à la
suivante — ne pas tout convertir d'un coup, trop de risque de casse invisible sur
58 897 lignes) :
1. `SPECIALTIES_DATA`/`data.js` → `state.subjects`/`state.courses` (Matières/Cours) :
   la fondation, tout le reste en dépend.
2. Table principale (`renderItemsTable`, tri/filtres/recherche, bandeau de tours,
   `validateTour`).
3. Programme de la journée + méthode des J (étape 5, mais dépend de 1 et 2).
4. Notes, Cahier d'erreurs entraînements, Entraînements.
5. Flashcards.
6. Planning.
7. Stats, trophées, graphiques.
8. Sauvegardes, hors-ligne, chronomètre.
9. Feedback.

À chaque zone : convertir, recharger dans le navigateur, vérifier la console, tester
l'interaction réellement (pas juste "ça compile") avant de passer à la suivante.

### Étape 5 — Injection de la méthode des J
- Porter `J_PRESETS`, `jStepIndex`/`jAnchorDate`/`jHistory[]`, le sélecteur de mode
  (J / feeling / manuel) par cours, et l'intégration dans `validateTour` (`advanceJ`)
  depuis `public/tableur.reference-p1.html` vers le nouveau fichier.
- Étendre le Programme de la journée EDN (probablement basé sur `loadTrainings`/todo)
  pour fusionner échéances J + tâches manuelles + planification manuelle, avec
  Faire maintenant/Reporter.

### Étape 6 — Renommage vocabulaire visible
- Passe sur les libellés UI (pas nécessairement sur chaque nom de variable interne) :
  "spécialité" → "matière", "item" → "cours", "EDN"/"ECOS" retirés du texte utilisateur.

### Étape 7 — Reliure avec les autres pages déjà construites
- `index.html` : vérifier que le(s) call-to-action ("Accéder au tableur", démo) pointent
  bien vers `tableur.html`.
- `auth.html` : la redirection post-connexion/vérification (`redirect=%2Ftableur.html`)
  ne change pas de cible, juste le contenu de la cible change.
- `comptepremium.html` : lien retour vers le tableur inchangé ; vérifier que le statut
  affiché (`entitlements/{uid}`) est bien ce que le nouveau tableur lit aussi pour son
  bandeau lecture-seule.
- `mentions-legales.html` : pas de lien direct à changer, simple cohérence de navigation
  globale (header commun) à vérifier visuellement.

### Étape 8 — Tests réels (Emulators, comme d'habitude)
- `npm run test:rules` et `npm run test:bootstrap` ne testent pas le frontend — ils
  doivent rester verts sans modification (le schéma backend ne change pas).
- QA manuelle complète via le Browser tool sur le nouveau `tableur.html`, en reprenant
  la checklist déjà validée sur l'ancienne version : création matière/cours, validation
  de tour (transaction + `dailyStats`), méthode des J (bascule de mode, échéance,
  report), notes riches, flashcards, cahier d'erreurs, entraînements, planning,
  stats + graphique, trophées, sauvegardes (créer/restaurer), hors-ligne (accès expiré
  → boutons désactivés en direct), feedback (y compris en lecture seule).
- Ne jamais annoncer un test réussi sans l'avoir exécuté (règle `CLAUDE.md`).

### Étape 9 — Documentation
- Mettre à jour `docs/TODO.md` (nouvelle base du tableur) et `docs/ARCHITECTURE.md`
  (préciser que la façade vient désormais du fichier EDN réel, schéma Firestore inchangé).

---

## 3. Ce qui NE change PAS dans cette mission
- Le schéma Firestore (`users/{uid}/subjects|courses|...`, `entitlements`, `billingPrivate`,
  `userStats`, `achievements`, `feedback`) et les Rules associées : **déjà construits,
  déjà testés (34 tests), ne sont pas à réécrire.**
- La Cloud Function `onUserCreated` : inchangée.
- `index.html`, `auth.html`, `comptepremium.html`, `mentions-legales.html` : inchangés
  dans cette mission (seulement vérifiés en bout de chaîne, étape 7).
- Aucun déploiement (`firebase deploy`) sans GO explicite — toujours valable.

## 4. Décision tranchée (confirmée par l'utilisateur)
Le système social/amis/partage de notes/podium (`renderFriendsList`, `sharedNotes`,
`initPodiumWatch`, `showNudge`, `showImportToast`, etc.) est **retiré**, conformément à la
décision initiale ("juste le feedback utilisateur → admin, pas de système ami/partage").
Bucket C confirmé, pas de Rules d'accès croisé à écrire. §1.3 s'applique donc en entier,
sans exception.
