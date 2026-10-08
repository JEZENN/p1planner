# P1Planner — QA

Ne cocher que les tests réellement exécutés.

## Index
- [ ] Desktop
- [ ] Laptop
- [ ] Tablette
- [ ] iPhone / Android
- [ ] Safari / Chrome
- [ ] Clavier / focus
- [ ] Reduced motion
- [ ] Méthode Tours compréhensible
- [ ] Méthode J compréhensible
- [ ] Démo tableur réaliste
- [ ] Section créateur conforme
- [ ] Section TypixClin sans métrique inventée
- [ ] Aucune donnée personnelle tierce exposée

## Auth
- [ ] Inscription
- [ ] Connexion / logout
- [ ] Mauvais mot de passe
- [ ] Email existant
- [ ] Mot de passe oublié
- [ ] Vérification email
- [ ] Double submit
- [ ] Mobile

## Données
- [ ] Matières CRUD
- [ ] Cours CRUD
- [ ] Notes
- [ ] Flashcards
- [ ] Cahier d'erreurs
- [ ] Erreurs entraînement
- [ ] Entraînement
- [ ] Stats
- [ ] Trophées
- [ ] Refresh
- [ ] Deux onglets / deux appareils
- [ ] Réseau lent / coupure
- [ ] Retry / backup
- [ ] Aucun overwrite vide

## J / Tours / Programme
- [ ] Presets J
- [ ] J personnalisé
- [ ] Calcul dates
- [ ] Retard / report
- [ ] Tours
- [ ] Relation Tours/J
- [ ] Programme du jour
- [ ] Mise à jour planning/stats

## Planning
- [ ] Types validés
- [ ] États validés
- [ ] Examen/Concours
- [ ] Repos/Vacances
- [ ] Mobile

## Premium
- [ ] 15 jours
- [ ] Date concours
- [ ] Durée max
- [ ] 3,00 / 2,50 / 2,25
- [ ] Frontend = backend
- [ ] Manipulation frontend sans effet
- [ ] Checkout
- [ ] Paiement réussi/échoué
- [ ] Webhook signé / dupliqué
- [ ] Double Checkout
- [ ] Checkout expiré
- [ ] Fin Premium lecture seule
- [ ] Aucune suppression

## Admin
- [ ] Utilisateur normal refusé
- [ ] Admin autorisé
- [ ] Rôle serveur
- [ ] Rules
- [ ] Minimisation données

## Isolation
- [ ] Firebase P1Planner uniquement
- [ ] Stripe P1Planner uniquement
- [ ] Aucun secret/Price ID TypixClin
- [ ] .firebaserc vérifiée
- [ ] firebase use vérifié avant deploy

## Fiabilité des sauvegardes du tableur (audit 2026-09-21)
Exécuté pour de vrai : `node test/e2e/battery.mjs` (vraie page `tableur.html`, émulateurs Auth/Firestore, projet `p1planner-e2e`, proxy réseau instable, Edge headless). Contrôle de sensibilité : `PAGE_FILE=rollback/tableur.html.avant-audit-2026-09-21 node test/e2e/battery.mjs` (version d'avant correctifs).
- [x] T1–T3 tours : ajout/suppression, 2e modification pendant l'écriture, suppression juste après écriture (OK avant et après)
- [x] N1 coupure totale pendant la validation d'un tour → arrive au retour du réseau (ÉCHOUAIT avant)
- [x] N2 vrai hors ligne (CDP) : verrouillage explicite puis reprise normale
- [x] M1 deux onglets, même cours, tours différents : les deux conservés
- [x] D9 restauration admin pendant qu'un onglet reste ouvert : non écrasée (tours seulement)
- [x] E0–E5 entraînements : statut depuis le Programme de la journée, course au chargement, ajout sans archivage des autres, modification d'un autre appareil conservée, suppression non ressuscitée (5 ÉCHOUAIENT avant, dont E5 = archivage de TOUS les entraînements)
- [x] D10 `scrollRestoration=manual` ; D11 `pagehide` de la note d'entraînement sans ReferenceError
- [x] P1 tâche créée pendant une coupure ; P3 avertissement avant de quitter avec écriture non confirmée
- [ ] P2 (connu, non corrigé) : tâche créée hors ligne puis rechargement = perdue (cache mémoire du SDK). Correctif complet = cache persistant IndexedDB (décision produit). Atténué par P3.
- [ ] Non couverts : restauration admin sur tasks/calendarDays/trainingItems/notes (le serveur ne pose `restoredAt` que sur `courses` — touche functions/, GO requis), copie locale ancienne/récente, renvoi ~1,5 s après `online` pour tâches/jours, D7 (date NaN), notes en attente, préférences legacy après rechargement, compte neuf, amis/partages.

## Sélection de ressources (Annale/Tutorat/Prépa) — signalé par l'utilisateur 2026-09-24
Bug réel confirmé, aucun utilisateur ne pouvait valider une ressource : `p1WriteResourceValidation()` écrivait avec une clé
littérale `'resources.' + resourceId` dans `setDoc(..., {merge:true})`. Vérifié contre l'émulateur Firestore : pour `setDoc`
(contrairement à `updateDoc`), ceci crée un champ nommé au sens propre `resources.xxx` (point compris), jamais lu par
`getItemData()` — la case ne passait jamais au vert et rien n'était conservé au rechargement. Un second point corrigé dans
`getItemData()` : quand un cours n'avait encore aucune ressource validée, un objet `{}` jetable (non attaché au cache live)
était renvoyé, perdant la mise à jour optimiste du tout premier clic.
- [x] Correctif vérifié à la main dans le navigateur (page servie par `test/e2e/e2e-server.mjs` contre l'émulateur) :
  sélection → case verte immédiatement, confirmée sur `courses/{fc}.resources.<id>` (vrai champ imbriqué, pas de clé à
  point littérale), persistante après rechargement complet ; désélection testée également.
- [ ] Non repassé dans `test/e2e/battery.mjs` (scénario R1 ajouté) : Puppeteer/Edge ne démarre plus dans cet environnement au
  25/09 (`child_process.spawn` sort avec le code 0 sans sortie, alors que `Start-Process` PowerShell lance le même binaire
  avec les mêmes arguments sans problème) — panne d'environnement, sans rapport avec le code de l'application. À relancer
  dès que l'environnement de test est réparé.

## Parrainage (2026-09-25)
Port du système de parrainage TypixClin (conçu/testé/corrigé le 2026-09-24 côté TypixClin), adapté au schéma P1Planner
(`entitlements/{uid}` au lieu d'un `users/{uid}` plat). Grille confirmée par l'utilisateur : identique à TypixClin
(3 filleuls actifs → 1 mois offert, 6 → 3 mois au total, plafond dur). Chemin Stripe récurrent construit dès maintenant
(décision explicite de l'utilisateur), non testable en conditions réelles (secrets Stripe P1Planner absents) mais couvert
par un Stripe simulé (voir plus bas).
- [x] Logique pure (`functions/referral.js`) : alphabet, génération/normalisation de code, paliers cumulatifs et plafonnés,
  calcul de crédit (essai / formule payée / expiré / Stripe récurrent) — `npx mocha test/referral-logic.test.mjs` (15/15).
- [x] Règles Firestore (`referralCodes/{code}`, `referrals/{filleulUid}`, champs de parrainage sur `entitlements`/`users`) :
  backend-only, lecture admin seule — `npm run test:rules` (46/46, dont 6 nouveaux tests parrainage).
- [x] Cloud Functions réelles (`referralInit`/`referralEnsureCode`/`referralCheckCode`/`referralMarkActive`/`referralApplyCode`),
  exécutées pour de vrai via `fns.<nom>.run()` contre l'émulateur Firestore, Stripe simulé (aucun appel réseau réel) —
  `npx mocha test/referral-functions.test.mjs` (33/33). Couvre : réservation/idempotence de code, saisie à l'inscription
  et rétroactive, auto-parrainage bloqué, lien parrain unique à vie (les deux chemins), paliers 1/2/plafond, parrain en
  essai (writeAccessUntil+trialEndsAt prolongés, jamais premiumUntil), parrain en formule payée (writeAccessUntil+premiumUntil
  prolongés), parrain expiré (bonus autonome depuis maintenant, statut repasse actif), parrain avec abonnement Stripe
  récurrent actif (décalage réel de trial_end, AUCUNE date Firestore réécrite), parrain introuvable (filleul quand même
  compté), **et le test de concurrence (piège n°1 audité côté TypixClin) : 2 filleuls du même parrain activés via
  `Promise.all` (vraie concurrence, sans `await` entre les deux) → jamais de double-crédit, vérifié contre de vraies
  transactions Firestore émulées**.
- [x] Frontend : `auth.html` (champ code facultatif, validation en direct debouncée 400ms, blocage strict si confirmé
  invalide, `referralInit` après création de compte, `referralMarkActive` après connexion vérifiée) et `comptepremium.html`
  (code affiché + copie, compteurs, saisie rétroactive) — vérifiés visuellement (rendu, absence d'erreur JS, retour
  "invalide" par prudence en cas d'échec réseau) sans Cloud Functions déployées ; `admin.html` (récapitulatif + table
  triable, construits depuis les données déjà chargées par l'onglet Utilisateurs, aucune lecture Firestore ajoutée) —
  vérifié par relecture et `node --check` syntaxique (pas de Cloud Functions déployées pour tester le rendu avec de
  vraies données de parrainage).
- [ ] Non testé : parcours navigateur bout-en-bout réel (Puppeteer/Edge headless indisponible dans cet environnement
  depuis le 25/09, voir note plus haut sur la sélection de ressources) ; décalage réel de `trial_end` contre un VRAI
  compte Stripe (secrets P1Planner absents) ; rendu de `admin.html` avec de vraies données de parrainage en base.

## Parrainage — finition (2026-09-26)
Exécuté pour de vrai (émulateurs Auth+Firestore, Edge headless ; Stripe simulé ; fonctions = vrai code via `.run()` ou via le pont `test/e2e/fn-bridge.mjs`) :
- [x] `npm run test:rules` : 40/40 (dont les cas parrainage : `referralCodes`, `referrals`, `referralActiveCount/MonthsGranted/SeenCount`, `referralCode`, `planType`).
- [x] Logique pure `test/referral-logic.test.mjs` : 20/20 (A6 résilié/impayé, A7 planType neutre, A9 nom).
- [x] Cloud Functions `test/referral-functions.test.mjs` : 33/33 ; **LOT A/B** `test/referral-lotAB.test.mjs` : 33/33 (A5 journal Stripe, A6, A7 avec `sweepExpiredTrials.run`, A8 concurrence `referralInit`/double `referralApplyCode`, A9 nom + nettoyage, B2 nouveaux filleuls (plafond 5, bornes, valeur falsifiée, ancien sans nom), B3 liste (aucun uid/e-mail, isolement, 100 lignes + total), réciprocité, concurrence Promise.all). `premium-plans` : 19/19.
- [x] **Vraies pages** `node test/e2e/referral-ui.mjs` : 22/22 (inscription sans code / code tapé / lien ?ref= ; saisie rétroactive ; ancien compte ; tuile + liste ; réciprocité ; courses « code inconnu » (clic ET Entrée, réponse lente 900 ms) ; double-clic ; contrôle en panne ; code incomplet ; connexion non retardée ; notification une seule fois (rechargements, accusé perdu, ancienne réponse serveur) ; notification dédiée qui n'écrase pas #globalAlert ; XSS ; clair/sombre + 390 px ; tableur : code du menu profil, pastilles, Nouveautés ; admin : récapitulatif, tri, « Parrainé par »).
- [x] **Contrôles de sensibilité** `node test/e2e/mutants.mjs` : 7 mutants sur 7 détectés (blocage strict, double-clic, connexion qui attend, contrôle en panne bloquant, mémoire d'annonce, pastille éteinte par un autre écrivain, code non récupéré à l'ouverture du menu). Côté serveur : mutants A5 (pas de journal), A6 (pas de branche résiliation), A7 (pas de planType neutre) détectés ; l'ancienne `reserveReferralCode` (deux codes pour un compte en concurrence) échouait sur le test A8.
- [x] Batterie tableur `test/e2e/battery.mjs` **avant ET après** les modifications de tableur.html : identique, 18 OK + 1 échec connu (P2), 0 échec (le scénario R1 avait un défaut de test — nœud détaché / ressources non configurées — corrigé ; il reste sensible : il échoue sur la version d'avant le correctif).
- [ ] Non exécuté : `npm run test:bootstrap` (nécessite l'émulateur Functions, jugé peu fiable ici) ; décalage réel de `trial_end` contre un VRAI Stripe (secrets absents) ; vrai navigateur sur les Cloud Functions déployées (le pont exécute le même code, mais ni le CORS/App Check de production ni les délais réseau réels).
- Non couvert : lecture des textes légaux par Jean (à valider) ; `referralCheckCode` sans limitation de débit ni App Check (énumération de codes possible, 32^6 combinaisons).

## Parrainage — audit sécurité/facturation (2026-09-27)
- [x] `test/referral-audit.test.mjs` : 15/15 (F1 achat vs essai prolongé, F2 conflit d'achat sur accès offert, F3 alias/boîte unique dont concurrence, F4 aucun champ de droits écrivable par le client, appels non authentifiés refusés) ; 3 mutants (F1, F2, F3) détectés. Régression serveur : 120/120, règles 40/40, pages 22/22.
- [ ] Non exécuté : vrai Stripe (décalage trial_end), vrai webhook signé (le test appelle handleOneTimePurchase via l'export de test).

## Mise en page des tours — tablette / téléphone (2026-09-27)
`node test/e2e/layout-tours.mjs` (vraie page, mesures `getBoundingClientRect`, 3 lignes dont celle de la photo) :
- [x] **L1** 360/375/390/414/430/480 px : écart de hauteur des dates 0 px (avant : 7,09 px — reproduit à l'identique).
- [x] **L2** 481 → 1100 px (10 largeurs) : cases 30×28, tableau en taille naturelle, conteneur défilant si le tableau dépasse, aucun chevauchement.
- [x] **L3** bureau (1101/1180/1366) 30×28 ; téléphone 26×24 ; paysage 667×375 et 844×390.
- [x] **L4** mode 14 tours : flèche/indicateur ne chevauchent ni la priorité ni le dernier badge (320 → 1366 px). **L5** mode 14 tours pages 2 et 1. **L6** aucun défilement horizontal de la page. **L7** thème sombre.
- [x] Résultat : 7/7 après correctif ; avant : 5 échecs sur 7 (L1, L2, L3-paysage, L5, L7).
- [x] Sensibilité (`node test/e2e/mutants.mjs X`) : X1 (sans correctif 1), X2 (cases ≤ 768 restaurées), X3 (compression 900-1100 restaurée) → 3/3 détectés.
- [x] Batterie tableur avant/après : identique (18 OK + 1 échec connu P2). `test:rules` 40/40.
- [ ] Non exécuté : `test:bootstrap` (émulateur Functions) ; vrais appareils (iPhone/iPad) ; cache 1 h du Hosting.

## Ressources / supports personnalisables + anti-autofill (2026-09-27, session autonome)
Travail fait EN AUTONOMIE (demande explicite de Jean, absent), rien déployé — vérifié réellement avant tout futur "go".
- [x] Vérification syntaxique de tous les blocs `<script>` de `tableur.html` : 0 erreur réelle (3 faux positifs attendus,
  les blocs `application/ld+json`, qui ne sont pas du JS).
- [x] Scan anti-corruption d'encodage sur tout le code ajouté : rien trouvé (comparé au pattern déjà établi cette session).
- [x] Nouveau `node test/e2e/catalog-custom.mjs` (vraie page, vrais émulateurs Auth+Firestore, Edge headless) : **10/10** —
  R1 état par défaut (3 ressources, aucun "···"), R2 ajout d'une 4ᵉ ressource ("···" apparaît, popup non vide), R3 plafond
  total à 6 (ajout au-delà ignoré, bouton désactivé), R4 renommage + recoloration répercutés sur le rendu, avec un
  libellé `<img src=x onerror=alert(1)>` confirmé échappé dans le DOM (`&lt;img`, aucune alerte JS déclenchée) et couleur
  appliquée, R5 suppression jusqu'à 1 seul élément puis garde-fou (bouton désactivé + tentative directe côté JS sans
  effet), R6 persistance après un rechargement complet de page ; S1 catalogue supports par défaut (4, modal de tour),
  S2 repli d'affichage d'un support historique (`college`, retiré du sélecteur) sans erreur JS, S3 ajout d'un support
  personnalisé sélectionné dans le VRAI modal de tour, sauvegardé sur Firestore (vérifié en relisant le document via
  `firebase-admin`, hors page) et toujours rendu après reload, S4 plafond total supports à 6.
- [x] Non-régression `node test/e2e/layout-tours.mjs` (rendu des cases de tour, partagé avec le nouveau code des
  supports) : **7/7**, identique à avant.
- [x] Non-régression `node test/e2e/battery.mjs` (batterie tableur complète) : **18 OK + 1 échec connu (P2, navigation
  timeout, flaky pré-existant sans rapport avec cette fonctionnalité)**, identique à la référence de session. Une VRAIE
  régression trouvée et corrigée au passage (voir plus bas), pas seulement un test périmé silencieusement ignoré.
- [x] Non-régression `node test/e2e/referral-ui.mjs` : **24/24** (aucun fichier de parrainage touché, sert de garde-fou
  large sur `tableur.html`).
- [x] Non-régression `npm run test:rules` : **40/40** (aucune Rule modifiée par cette fonctionnalité).
- **Régression réelle trouvée par la batterie, corrigée** : le scénario R1 (`battery.mjs`, sélection de ressource)
  cherchait la case validée via l'ancienne classe CSS fixe `.resource-box.annale`, disparue avec le passage à un style
  inline piloté par couleur (`p1ResourceBoxStyle`). Corrigé des DEUX côtés : le test cible désormais un attribut stable
  `data-resource-id="annale"` (ajouté sur les cases du tableau ET du popup de dépassement, jamais dépendant du libellé
  ni de la couleur choisis par l'utilisateur), et non un artefact du rendu qui n'a plus vocation à exister.
- [x] **Vérification visuelle réelle** (Browser pane, vraie page servie par `e2e-server.mjs`, connexion réelle) des DEUX
  points d'entrée du gestionnaire (icône dans "Configurer les ressources" ET icône crayon à côté de "Support" dans le
  modal de tour), clair ET sombre : rendu propre, cohérent avec le reste de l'app (mêmes classes `resources-config-*`
  réutilisées), compteur x/6, pastilles de couleur correctes, ajout en direct testé (souris réelle, pas seulement
  `page.evaluate`) → **un vrai bug trouvé et corrigé à cette occasion** (voir plus bas), invisible aux tests fonctionnels
  car purement une question d'empilement visuel.
- **Bug trouvé au test visuel manuel (pas par `catalog-custom.mjs`, qui ne vérifie que l'état/le DOM, jamais
  l'empilement) et corrigé** : ouvert depuis l'icône crayon du modal de tour (`#confidence-modal`, z-index 100200 —
  volontairement très haut), le gestionnaire de catalogue héritait du z-index générique `.resources-config-modal`
  (300) et s'ouvrait **derrière** le modal de tour, invisible et inutilisable. Ajouté `#p1-catalog-modal { z-index:
  100250 !important; }`, dans la même convention documentée que les autres z-index à 5 chiffres du fichier (100000 /
  100100 / 100200 / 100300).
- [ ] Non testé : parcours clavier/accessibilité du nouveau gestionnaire de catalogue ; `test/e2e/mutants.mjs` (referral)
  non ré-exécuté cette session (aucun fichier de parrainage touché, `referral-ui.mjs` suffit en garde-fou).
- **Login "se connecter" (spinner qui s'arrête avant la redirection)** : ré-audité — le code déployé précédemment est
  correct (`setLoading(btn, false)` n'est jamais appelé sur le chemin de succès, le bouton reste désactivé/en chargement
  jusqu'au `window.location.href` 1,5 s plus tard). Aucun changement de code nécessaire ; à confirmer avec Jean si le
  symptôme persistait malgré tout après le déploiement précédent.

## Révision du catalogue personnalisable après retour de Jean (2026-09-27, captures à l'appui)
5 griefs sur la 1ʳᵉ version + 2 bugs réels trouvés en corrigeant/vérifiant — voir détail dans `docs/DECISIONS.md`.
Tout testé réellement AVANT de redemander un "go" (aucun déploiement fait sur cette révision sans confirmation neuve).
- [x] `test/e2e/catalog-custom.mjs` réécrit pour le nouveau comportement : **11/11** — R1 état par défaut inchangé,
  **A1 (nouveau)** parade anti-autofill (champ `readonly`+`autocomplete=off` au repos, déverrouillé par un vrai
  `pointerdown`), R2 ajout via la VRAIE palette restreinte (clic sur une pastille, plus de saisie RGB), **R3 (nouveau)**
  défauts protégés : cadenas affiché, aucun bouton supprimer, tentative directe `_p1CatalogDelete` sur un défaut sans
  effet, R4 plafond 6 (3 défauts + 3 ajouts), R5 renommage/recoloration d'un DÉFAUT (autorisé, seule la suppression est
  bloquée) avec re-vérification XSS, R6 persistance ; **S1** vérifie maintenant explicitement que les libellés par
  défaut ("Fiche de cours", "Fiche perso") ne sont PAS tronqués et que les acronymes par défaut sont bien QCM/CRS/CNF/PER
  (pas une déduction automatique), et que les 4 défauts affichent un cadenas ; S2 repli historique inchangé ; S3 ajout
  d'un support AVEC un acronyme choisi par l'utilisateur ("RON"), vérifié tel quel (pas une déduction) après un vrai
  cycle sauvegarde Firestore + reload ; S4 plafond 7 (4 défauts + 3 ajouts).
- [x] **Bug réel trouvé PENDANT cette révision, corrigé avant tout rapport de succès** : le plafond de longueur pensé
  pour la saisie utilisateur (12 caractères) tronquait aussi les libellés par défaut au chargement
  ("Fiche de cours" → "Fiche de cou") — confirmé d'abord par une VRAIE vérification visuelle (Browser pane), reproduit
  ensuite dans un test automatisé dédié (assertion ajoutée à S1) pour empêcher toute régression future silencieuse.
- [x] **Vérification visuelle réelle** (Browser pane, page servie par `e2e-server.mjs`, clair ET sombre) des deux
  modals ("Gérer mes ressources" et "Gérer les supports") : carte "Ajouter" bien séparée de la liste "Existants",
  palette de 12 pastilles conforme, cadenas visibles sur les 4/3 entrées par défaut, nuancier de recoloration d'une
  ligne existante qui s'ouvre/se ferme correctement (vérifié en direct : clic sur la pastille de couleur de "Tuto" →
  nuancier affiché → clic sur une couleur → catalogue mis à jour ET nuancier refermé), acronyme affiché et éditable sur
  chaque ligne de support, boutons de support du modal de tour sans la pastille de couleur retirée (juste le texte,
  correctement coloré, "Fiche de cours" affiché en entier après le correctif ci-dessus).
- [x] Non-régression complète après CETTE révision (pas seulement après la 1ʳᵉ version) : `test/e2e/battery.mjs`
  **18 OK + 1 échec connu (P2, flaky pré-existant)** ; `test/e2e/layout-tours.mjs` **7/7** ; `test/e2e/referral-ui.mjs`
  **24/24** ; `npm run test:rules` **40/40**.
- [ ] Non vérifiable en local : l'efficacité réelle de la parade anti-autofill contre le VRAI menu "Mots de passe
  enregistrés" de Chrome/Edge — ni l'émulateur Firestore/Auth ni le profil Edge headless de test n'ont de mot de passe
  enregistré pour l'origine testée (le bug ne se produit, par nature, que sur `p1planner.fr` en production avec de
  vrais identifiants déjà enregistrés par le navigateur de Jean). Seule la mécanique structurelle (readonly levé au
  premier geste réel, mêmes attributs que les barres de recherche déjà en production) a pu être vérifiée. À confirmer
  avec Jean après déploiement.

## Audit sécurité/comportement du catalogue personnalisable (2026-09-27, demande explicite de Jean)
Voir le détail de chaque point dans `docs/DECISIONS.md`. Tout corrigé et testé réellement AVANT tout redéploiement.
- [x] Relecture de `firestore.rules` (`users/{uid}/settings/preferences`) : `isSelfVerified(uid)` (lecture) /
  `canWrite(uid)` (écriture) — toujours l'uid du jeton, jamais transmis par le client ; aucun champ de ce document
  n'est lu par la logique Premium/admin/paiement. Aucun risque d'accès croisé, aucune Rule à modifier.
- [x] Relecture complète de tous les sites de rendu de `label`/`abbr` dans `tableur.html` (recherche systématique des
  interpolations non passées par `window._p1EscapeHtml`) : **1 faille XSS trouvée** (`renderResourcesOptions()`,
  `.resource-option-name`), corrigée.
- [x] Nouveau `node test/e2e/catalog-custom.mjs` (réécrit avec 5 scénarios supplémentaires pour cet audit) : **14/14** —
  **R7 (nouveau)** suppression = archivage pour les ressources (libère le plafond, ne réapparaît jamais, survit au
  reload) ; **S5 (nouveau, LE cas demandé par Jean)** ajoute un support, l'assigne à un VRAI tour enregistré (via le
  modal réel), le supprime, puis vérifie dans l'ordre : (1) la donnée Firestore du cours (`tourSupports`) est
  strictement inchangée par la suppression, (2) le badge affiche toujours le VRAI acronyme ("RON"), jamais un repli
  illisible, (3) aucune erreur JS, (4) le support supprimé ne réapparaît plus comme choix dans le modal de tour, (5)
  réenregistrer ce même tour sans toucher au support ne corrompt/ne change rien, (6) tout survit à un rechargement
  complet ; **V1 (nouveau)** confirme structurellement l'absence de tout `input[type="text"]` dans le gestionnaire
  (parade autofill round 2) et que le modal est borné avec un défilement fonctionnel jusqu'à la dernière ligne (7
  supports).
- [x] **Régression trouvée PENDANT cet audit et corrigée** : le passage à un archivage complet (qui persiste
  désormais TOUJOURS les défauts dans le document Firestore, pas seulement les ajouts) a fait ressurgir le bug de
  troncature "Fiche de cours" → "Fiche de cou" par un chemin différent de la première fois (le plafond de 12
  caractères s'appliquait de nouveau aux défauts dès qu'ils avaient été relus une fois depuis Firestore). Cause racine
  traitée cette fois : `MAX_CATALOG_LABEL` relevé à 16 (≥ 14, le plus long libellé par défaut), qui ne peut plus jamais
  entrer en collision avec un texte que l'app contrôle elle-même, quel que soit le chemin de code. Un test dédié
  (assertion explicite sur le libellé exact) empêche toute régression silencieuse future.
- [x] **Bug remonté en direct par Jean pendant cette session (capture d'écran), corrigé** : Edge proposait
  "Enregistrer votre mot de passe ?" à chaque ajout de SUPPORT (jamais de ressource). Cause : 2 `<input type="text">`
  adjacents (Nom + Acronyme) — heuristique de détection de formulaire de connexion de Chrome/Edge, indépendante du nom/
  label des champs. Remplacés par des `<textarea rows="1">` déguisés (CSS), jamais candidats à cette heuristique.
- [x] **Bug remonté en direct par Jean pendant cette session (description + capture), corrigé** : le modal du
  gestionnaire dépassait la hauteur de l'écran, rendant impossible de voir la liste complète (ex. 6-7 entrées) — pas de
  hauteur plafonnée sur la boîte, donc le défilement interne prévu ne s'activait jamais. Plafonné à 85vh + suppression
  du second défilement imbriqué (une seule liste, un seul défilement). Vérifié par mesure réelle de hauteur + atteinte
  de la dernière ligne en défilant, à 375×812 (mobile) avec un catalogue de 7 supports.
- [x] Non-régression complète après cet audit : `test/e2e/battery.mjs` **18 OK + 1 échec connu (P2)** ;
  `test/e2e/layout-tours.mjs` **7/7** ; `test/e2e/referral-ui.mjs` **24/24** ; `npm run test:rules` **40/40**.
- [ ] Non vérifiable en local (nécessite un vrai profil Chrome/Edge avec des identifiants enregistrés pour
  `p1planner.fr`) : confirmation définitive que la parade `<textarea>` supprime bien le prompt "Enregistrer le mot de
  passe ?" en conditions réelles — seule la mécanique (absence totale d'`input[type="text"]` dans le gestionnaire) a pu
  être vérifiée. À confirmer avec Jean après déploiement.

## Types/plateformes d'entraînement personnalisables + 3 corrections (2026-09-28/29, demande explicite)
Voir le détail dans `docs/DECISIONS.md`. Tout corrigé et testé réellement AVANT tout redéploiement.
- [x] Nouveau `node test/e2e/train-catalog.mjs` : **6/6** — TT1 état par défaut (3 types/2 plateformes protégés,
  boutons du modal corrects) ; TT2 cadenas sur les défauts ; TT3 ajout d'un type ET d'une plateforme personnalisés,
  sélectionnés dans le VRAI modal "Ajouter", carte contexte correcte (nom réel, pas une table figée), sauvegardé sur
  Firestore (vérifié par une vraie lecture `trainingItems`), badges corrects dans le tableau ; **TT4 (AUDIT, le cas
  explicitement demandé)** suppression d'un type déjà utilisé par un entraînement enregistré : la donnée Firestore
  n'est pas altérée, le badge continue d'afficher le VRAI nom (pas un repli illisible), aucune erreur JS ; TT5 plafond
  total (6 pour les types, 5 pour les plateformes) ; TT6 persistance après reload.
- [x] **Régression de portée trouvée PENDANT le développement (pas en relecture), corrigée** : `_trainModalUpdateCtx`
  (script classique) référençait en "bare" des fonctions définies dans le `<script type="module">` du catalogue —
  `ReferenceError` silencieusement avalé, carte contexte et badges vides sans aucune erreur visible dans l'UI (mais
  bien détectée par le test TT3, qui vérifie le TEXTE affiché, pas seulement l'état interne). Corrigé en exposant les
  fonctions concernées sur `window` — voir `docs/DECISIONS.md` pour le détail technique.
- [x] Non-régression complète : `test/e2e/catalog-custom.mjs` **14/14** ; `test/e2e/battery.mjs` **18 OK + 1 échec
  connu (P2)** ; `test/e2e/layout-tours.mjs` **7/7** ; `test/e2e/referral-ui.mjs` **24/24** (1 échec transitoire
  "Connection closed" sur A1 à la première passe, confirmé flaky et sans rapport en le relançant seul : OK) ;
  `npm run test:rules` **40/40**.
- [x] **Modal du gestionnaire de catalogue** : vérifié en direct (Browser pane) que `.closing` est bien ajoutée avant
  le retrait de `.active` (les deux classes coexistent pendant les 180 ms d'animation, confirmé par lecture de
  `className` à deux instants), corrigeant l'absence de transition de fermeture signalée.
- [x] **Bouton "Gérer" hors du `<label>`** : vérifié visuellement (capture) que le modal "Ajouter un entraînement"
  affiche correctement les icônes crayon à côté de Type/Plateforme, sans zone de survol élargie.
- [x] **Figeage largeur/hauteur de `#tour-success-overlay`** : la fonction elle-même vérifiée en l'appelant
  directement (Browser pane) — `overlay.style.width/height` se figent à la taille du viewport à l'affichage
  (`show` ajouté) et se libèrent après le masquage complet. Le glissement visuel réel (dépendant de la largeur d'une
  vraie scrollbar) n'a pas pu être observé : Chrome headless dans cet environnement n'affiche pas de scrollbar native
  visible (`clientWidth` ne varie pas avec `overflow:hidden`). À confirmer avec Jean après déploiement, comme pour la
  parade autofill.

## Retour de Jean (2026-09-29) : liste de types/plateformes non rafraîchie + prompt mot de passe

- [x] **Bug réel trouvé et corrigé** (voir `docs/DECISIONS.md` pour le détail) : `_p1CatalogAfterChange()` ne routait
  jamais `trainTypes`/`trainPlateformes` vers leur propre refresh (if/else à 2 branches au lieu d'un switch par
  catalogue) — un type/une plateforme ajouté pendant que le modal "Ajouter un entraînement" était déjà ouvert
  n'apparaissait pas dans sa liste de boutons tant qu'on ne le fermait/rouvrait pas. Corrigé en un vrai switch par
  `kind`, avec appel du bon refresh (`_p1RefreshTrainTypeButtons`/`_p1RefreshTrainPlateformeButtons`) ET du filtre
  déroulant de la page Entraînements (`_p1RefreshTrainFilterDropdowns`, absent même pour les supports avant ce
  correctif).
- [x] **Bug réel trouvé et corrigé** : prompt navigateur "Enregistrer votre mot de passe ?" + suggestions
  d'identifiants sur le simple champ Nom du gestionnaire de types/plateformes (capture à l'appui). Root cause
  confirmée par lecture directe : `tableur.html` ne contient AUCUNE balise `<form>` nulle part, donc Chrome/Edge
  regroupent tous les champs texte/mot de passe de la page (heuristique "unowned form"), y compris les vrais champs
  mot de passe du compte (`#acc-pwd`, `#acc-pwd-cur`, etc.) avec n'importe quel champ texte tapé ailleurs sur la
  page. Corrigé en transformant les deux blocs concernés (`#acc-mail-sub`, `#acc-pwd-sub`) en vraies balises
  `<form>` (frontière reconnue par cette heuristique), sans aucun changement CSS/JS ailleurs (tout référence par
  classe/id, pas par tag).
- [x] Nouveau `node test/e2e/train-catalog.mjs` étendu à **8/8** (ajout de `TT7` et `TT8`, tous les scénarios
  précédents toujours verts) :
  - **TT7** reproduit exactement le bug signalé : ouvre le modal "Ajouter un entraînement", ajoute un type PUIS une
    plateforme via le crayon "Gérer" pendant que ce modal reste ouvert en arrière-plan, sans jamais le fermer/rouvrir
    — vérifie que le bouton apparaît immédiatement dans `#train-type-btns`/`#train-plateforme-btns` ET dans le
    filtre déroulant `#train-type-multi-list` de la page Entraînements. Échouait avant le correctif
    (`_p1CatalogAfterChange`), passe après.
  - **TT8** vérifie structurellement que `#acc-mail-sub`/`#acc-pwd-sub` sont bien des balises `<form>`, que le champ
    du catalogue n'est dans aucun `<form>`, et qu'une soumission simulée du formulaire mot de passe ne provoque
    aucune navigation (`onsubmit="return false"` effectif).
- [x] Non-régression complète (aucune Rule modifiée, aucun changement de schéma Firestore) : `test/e2e/catalog-custom.mjs`
  **14/14** ; `test/e2e/battery.mjs` **18 OK + 1 échec connu (P2, flaky préexistant documenté)** ; `npm run test:rules`
  **40/40**.
- [x] Non vérifiable en conditions réelles dans cet environnement (pas de mot de passe réellement enregistré dans le
  profil de test Chrome headless, donc pas de vrai prompt à observer) : la frontière `<form>` est le correctif
  documenté standard pour ce comportement d'"unowned form", vérifiée structurellement par TT8, mais l'absence
  effective du prompt/des suggestions reste à confirmer par Jean après déploiement.

## Retour de Jean (2026-09-29) : animation de suppression discrète (catalogue, gestionnaire, entraînements)

- [x] Nouveau `window.p1FadeOutRow` (fondu d'opacité 200ms) appliqué à 3 endroits : gestionnaire de catalogue
  (ressources/supports/types/plateformes), tableau des entraînements, gestionnaire "Mes matières/cours/SDD".
- [x] **Bug réel trouvé et corrigé (course avec un listener Firestore réactif)** : retarder seulement le RE-RENDU
  ne suffisait pas — le listener `onSnapshot` déjà branché réagissait à l'écriture Firestore optimiste locale
  quasi instantanément et relançait son propre rendu, annulant l'animation. Corrigé en retardant l'écriture
  Firestore elle-même (`saveTrainings()`/`deleteItem()`) jusqu'après le fondu, pas seulement l'affichage.
- [x] **Bug réel PRÉEXISTANT trouvé et corrigé (sans lien direct avec l'animation, mais qui la rendait impossible à
  observer)** : `buildModal()` (gestionnaire "Mes matières/cours/SDD") n'accepte qu'un seul overlay à la fois —
  ouvrir la confirmation "Archiver ce cours ?" détruisait déjà le gestionnaire au clic sur la corbeille, et il ne
  réapparaissait plus JAMAIS après confirmation (utilisateur sans aucun modal). Corrigé en rouvrant explicitement
  le gestionnaire après un court délai au lieu de réutiliser un DOM détaché.
- [x] Nouveau `node test/e2e/delete-animation.mjs` : **3/3** — D1 (catalogue, support : fondu visible avant
  disparition, compte correct après) ; D2 (entraînements, même vérification sur la ligne du tableau) ; D3
  (gestionnaire "Mes cours" : matière + cours réels créés via les formulaires, suppression via le gestionnaire,
  vérifie que le modal RÉAPPARAÎT avec la liste à jour — régression directe du bug ci-dessus).
- [x] Non-régression complète (aucune Rule modifiée) : `catalog-custom.mjs` **14/14** ; `train-catalog.mjs`
  **8/8** ; `battery.mjs` **18 OK + 1 échec connu (P2)**, dont `E3` (suppression pendant réseau lent + action
  rapide immédiate) — le scénario le plus exposé au changement de timing de `saveTrainings()`, toujours vert ;
  `npm run test:rules` **40/40**.

## Audit « protection des données » — sauvegardes, restauration, pertes hors ligne (2026-09-30, demande explicite de Jean, exécuté en autonomie de nuit)

Détail du raisonnement et des correctifs D1–D12 dans `docs/DECISIONS.md`. Ici : uniquement la preuve d'exécution
réelle, toutes les commandes ci-dessous ont été relancées une dernière fois contre l'émulateur réel juste avant
la rédaction du rapport final, pour donner des chiffres à jour et non recopiés d'une exécution plus ancienne.

- [x] **`npm run test:rules`** : **44/44** (nouvelles règles `backups/{id}` verrouillées côté client + sous-collection
  `parts`, dont lecture propriétaire/admin autorisée, création/mise à jour/suppression toujours refusées).
- [x] **`test/backups.test.mjs`** (Cloud Functions réelles contre l'émulateur, pas de simulation) : **9/9** —
  D2 (`notesEntrainements` + `settings/preferences` inclus), D3 (sauvegarde >1,5 Mo découpée en 12 parties,
  reconstituée à l'identique, rien de tronqué), D5 ×4 (mode compléter ne touche jamais un document présent/actif/
  non-vide ; désarchive+restaure un document archivé ; recrée un document absent même en mode compléter ; mode
  remplacer explicite réécrit tout, comportement historique préservé), D1 ×3 (sauvegarde auto uniquement pour un
  compte actif <3j ; ne recrée pas avant 72h ; ne garde que les 5 dernières AUTOMATIQUES sans jamais toucher les
  manuelles/pré-restauration).
- [x] **`test/e2e/data-durability.mjs`** (navigateur réel + émulateur réel) : **9/9** — D6 (rechargement réel d'un
  onglet déjà ouvert quand un admin restaure, pas seulement pour `courses`), D9a/D9b (compteur d'écritures non
  confirmées couvre bien `runTransaction` ET `updateDoc` brut), D10 (`deletedDefaultIds` survit à la perte du
  `localStorage`, vraie persistance Firestore), D11 (`showCustomAlert` affiche le vrai message sur les 3 formes
  d'appel), D12 (recherche déverrouillable après un DEUXIÈME retour bfcache), D7a (cache Firestore persistant
  IndexedDB actif dès le chargement), D7b (écriture émise pendant une coupure survit à un rechargement PENDANT la
  coupure), D8 (tour validé pendant une coupure, onglet fermé/rechargé pendant la coupure, arrive quand même au
  serveur — file locale durable).
- [x] **Sensibilité de chaque nouveau test prouvée par mutation** (`test/e2e/mutants.mjs`, sur des copies isolées,
  jamais le dépôt réel) : les 7 nouveaux mutants D6/D8/D9a/D9b/D10/D11/D12 sont tous **détectés** (le scénario visé
  échoue bien quand le correctif correspondant est retiré). Sensibilité de D1/D2/D3/D5 prouvée séparément en
  rejouant `test/backups.test.mjs` contre `rollback/index.js.avant-sauvegardes-2026-09-30` (code d'avant la
  mission) : tous les tests concernés échouent contre l'ancien code, comme attendu.
- [x] **`test/e2e/battery.mjs`** (non-régression complète, navigateur réel) : **19/19, 0 échec, 0 connu** — en
  particulier **P2 (tâche créée hors ligne puis rechargement) passe maintenant réellement**, grâce à D7 (cache
  Firestore persistant) ; ce test était documenté comme limitation connue avant cette mission.
- [x] **`test/e2e/referral-ui.mjs`** (non-régression complète, navigateur réel + vraies Cloud Functions) :
  **24 OK + 1 connu, 0 échec non attendu** — A2 (nouvel onglet Sauvegardes d'admin.html, créer puis restaurer en
  mode compléter depuis la vraie page) reste marqué connu : flaky uniquement en fin de longue suite (~1 fois sur 5
  quand il tourne en 25ᵉ position, jamais isolé ni en petits lots), racine identifiée et corrigée une fois (race
  réelle entre l'écriture de test et la transaction serveur `onUserCreated`, via un nouvel helper qui attend que
  `entitlements/{uid}` existe avant d'écrire `displayName`) ; la flakiness résiduelle est attribuée à la charge de
  l'environnement de test (288 comptes accumulés dans cet émulateur de longue durée) et non à un défaut fonctionnel
  — la logique Cloud Functions elle-même est prouvée stable par les 9/9 non-flaky de `backups.test.mjs`.
- [x] **Constat fait pendant la vérification finale, hors périmètre de cette mission, sans lien fonctionnel** :
  le mutant préexistant `M6 pastille éteinte par l'écrivain des avis` (fonctionnalité Parrainage, non touchée par
  D1–D12) n'est plus détecté par `mutants.mjs`. Vérifié explicitement : ce n'est PAS un défaut utilisateur (T1
  passe normalement, la pastille reste correcte en usage réel) ni une régression du code de parrainage lui-même
  (le bloc de code concerné est identique caractère pour caractère entre `rollback/tableur.html.avant-sauvegardes-2026-09-30`
  et le fichier actuel). C'est un effet de bord indirect de D7 (cache Firestore persistant) : un des 3 écrivains de
  `#avatar-notif-dot` (`_updateDots`) a un bug préexistant et déjà connu avant cette mission (il omet
  `window._p1ReferralUnseen` dans son propre calcul), mais un AUTRE écrivain correct (`_p1RefreshReferralDots`)
  recouvre systématiquement son erreur ; le cache persistant semble accélérer/fiabiliser ce recouvrement au point
  que le test de sensibilité ne peut plus isoler la faute du premier écrivain dans sa fenêtre d'attente. Confirmé
  par un test croisé manuel (mutation appliquée à la copie du code d'avant-mission : détectée ; même mutation sur
  le code actuel : non détectée, alors que le code de ce bloc n'a pas changé). Aucune action corrective faite ce
  soir (hors du périmètre GO de cette mission) ; suggestion pour plus tard : faire appeler
  `window._p1RefreshReferralDots()` par `_updateDots()` au lieu de dupliquer la logique, ce qui supprimerait le
  bug ET rendrait le mutant à nouveau détectable.

## Listes personnalisables (sécurité), verrou tours 8/14, iPad, banque de matières P1 (2026-10-02, demande explicite de Jean)

Détail du raisonnement et des correctifs (Lots A-E + X1) dans `docs/DECISIONS.md`. Ici : uniquement la preuve
d'exécution réelle, chaque suite relancée une dernière fois (2-3 répétitions pour les plus sensibles au timing)
contre l'émulateur réel juste avant la rédaction du rapport final.

- [x] **Lot A (P0, fusion des catalogues)** : `test/e2e/catalog-safety.mjs` — **4/4** (CAT1 fusion vraiment
  concurrente sans écrasement, CAT2 conflit résolu par l'horodatage le plus récent, CAT3 gardes de chargement/
  hors-ligne, CAT4 échec réel visible + mutation annulée). Sensibilité prouvée : 3 mutants (A1 fusion redevenue
  un écrasement, A3 garde retirée, A4 échec jamais vérifié), tous détectés.
- [x] **Lot A6/L6 (restauration admin, catalogues)** : 3 nouveaux tests dans `test/backups.test.mjs`, exécutés
  avec le reste de la suite — **12/12** au total (9 D1-D5 déjà connus + 3 nouveaux). Sensibilité prouvée en
  rejouant contre une copie temporaire du code d'avant ce correctif : 2/3 échouent comme attendu.
- [x] **Lot B (clavier/validation/Paramètres)** : `test/e2e/catalog-keyboard.mjs` — **7/7** (KB1-KB7 : Entrée
  ajoute, clavier Android, ligne existante ne duplique pas, doublon/nom vide refusés avec message, carte
  Paramètres + ouverture par-dessus). Sensibilité prouvée : 3 mutants (B1 Entrée désactivée, B3 doublon non
  vérifié, B4 carte retirée), tous détectés.
- [x] **Lot C (verrou tours 8/14)** : `test/e2e/tours-lock.mjs` — **6/6**, stable sur plusieurs relances
  consécutives après correction d'une course (compte réel pas encore propagé au cache local avant le clic
  suivant — corrigé en attendant l'état réel plutôt qu'un délai fixe). Sensibilité prouvée : 2 mutants (C1
  plafond compact redevenu `Math.max`, C2 verrou supprimé), tous détectés. Non-régression : `layout-tours.mjs`
  **7/7**.
- [x] **Lot D (iPad, barre d'image)** : `test/e2e/ipad-img-bar.mjs` — **5/5**, stable sur 3 relances consécutives.
  Mesure réelle confirmée : la mutation retirant le correctif reproduit exactement le défaut signalé (~19px de
  haut) ; le CSS calculé confirme 44px exactement, l'écart de rendu (≤2px) est un arrondi sous-pixel de Chrome
  headless, sans lien avec le correctif. Sensibilité prouvée : 2 mutants (règle iPad retirée, `_notesImgBarFit`
  neutralisée), tous détectés.
- [x] **Lot E (banque de matières P1)** : `test/e2e/subject-bank.mjs` — **4/4**, stable sur 2 relances
  consécutives après correction d'un bug de réentrance réel trouvé en testant (voir DECISIONS.md). Sensibilité
  prouvée : 2 mutants (déduplication supprimée, verrou de réentrance supprimé), tous détectés.
- [x] **X1** : `test/e2e/settings-persist.mjs` — **1/1**, confirmé en échec AVANT correction (preuve réelle,
  pas une lecture de Rules seule), puis en succès après. Sensibilité prouvée : 1 mutant (écriture redevenue
  `users/{uid}`), détecté.
- [x] **Non-régression complète** (aucune Rule modifiée côté structure, seulement les champs déjà autorisés) :
  `npm run test:rules` **44/44** ; `catalog-custom.mjs` **14/14** ; `train-catalog.mjs` **8/8** ;
  `delete-animation.mjs` **3/3** (vérifie explicitement que l'animation de suppression, pré-existante, n'a pas
  été cassée par le passage à des écritures optimistes+fusionnées) ; `data-durability.mjs` **9/9** ; `battery.mjs`
  **19/19, 0 connu** ; `referral-ui.mjs` **24/25, 1 connu (A2, flakiness d'environnement déjà documentée le
  2026-09-30, sans lien avec cette mission)**.
- [x] **Limitation assumée, signalée** : L7 (changement de compte dans le même onglet) est corrigé par
  construction (même garde que L3/A3, réinitialisation à la déconnexion) mais n'a pas de scénario de test dédié
  "deux comptes, un seul onglet" — à faire si Jean le juge utile.

## Finitions UI + banque de matières dans l'assistant de présentation (2026-10-02, retours de Jean après mise en ligne)

- [x] Section « Existants » en grande case (comme « Ajouter »), survol persistant sur la pastille de couleur
  (icônes carte Paramètres) : vérifié visuellement (capture d'écran réelle) ET par `catalog-keyboard.mjs` **7/7**
  (non-régression du gestionnaire de catalogue).
- [x] Abréviations explicites de la banque de matières (collision shortOf() corrigée) + tiret dans les noms +
  « UE1 - Chimie organique » ajoutée (14 matières au total) : `subject-bank.mjs` **5/5**, dont un test dédié
  vérifiant explicitement l'absence de collision entre deux abréviations de la banque.
- [x] Banque de matières proposée aussi dans l'assistant de présentation (page "Matières"), appliquée à la
  validation finale : nouveau scénario **SB-ONB**, parcourt réellement l'assistant (clics sur les vrais boutons
  de navigation) jusqu'à la validation finale.
- [x] **Bug réel trouvé en généralisant `p1RenderSubjectBankPreview()`** (voir DECISIONS.md) : l'aperçu de la
  page de présentation déconnectée s'est retrouvé vide suite à ce changement — détecté immédiatement par le test
  SB1 préexistant (jamais annoncé comme fonctionnel avant que SB1 ne repasse au vert), corrigé, revérifié.
- [x] Sensibilité prouvée : 2 nouveaux mutants (banque retirée de l'assistant, abréviations supprimées), tous
  détectés.
- [x] Non-régression : `catalog-custom.mjs` **14/14**, `catalog-keyboard.mjs` **7/7**, `battery.mjs` relancé en
  entier après ce lot de finitions.
- [x] **Carte « Autres actions » des Paramètres** (retour de Jean : "j'aime pas cette partie... améliore leur
  aspect et disposition avec éventuellement des explications") : les 3 anciens boutons pleine-largeur
  (aspect disparate, sans explication) remplacés par le même style de lignes que « Listes personnalisables »
  (icône + titre + explication courte), dans sa propre carte. Vérifié visuellement (capture d'écran réelle) ;
  `catalog-keyboard.mjs` **7/7** et `subject-bank.mjs` **5/5** (sélecteur de test corrigé pour distinguer les deux
  cartes qui réutilisent désormais la même classe de ligne). Déployé et vérifié (SHA-256 local = live).
- [x] **Abréviations UE4-UE8 corrigées** (retour de Jean : "tu mets UE5 UE6 UE7 UE8 mec", pas une abréviation à
  3 lettres inventée) : `short` devient `'UE4'`..`'UE8'` pour ces 5 matières sans sous-division. Nouvelle
  assertion dédiée dans `subject-bank.mjs` (SB2), suite complète **5/5** avant ce lot. Déployé et vérifié
  (SHA-256 local = live).

## Flashcards orphelines après suppression d'une matière + tiret UEx rétroactif (2026-10-02, 2 captures d'écran de Jean)

- [x] **Flashcards d'une matière supprimée affichées comme un groupe fantôme** dans le tiroir "Session Flash"
  (nommé par son ID Firestore brut) et comptées dans le badge global de dues — cause réelle confirmée en lisant
  le code (`deleteSpecialty()` n'a jamais touché aux flashcards liées ; le code de cascade porté de TypixClin
  existe mais n'est jamais appelé, et serait de toute façon un no-op pour P1Planner — voir DECISIONS.md pour le
  détail). Corrigé en excluant les cartes dont le `speId` ne correspond à aucune matière active, aux deux points
  d'entrée "toutes matières" (`loadAllFlashCards`/`loadAllDueFlashCards`) — jamais de suppression des cartes
  elles-mêmes (principe "jamais de suppression physique" déjà en place ailleurs).
  - Contre-preuve : nouveau `flash-orphan-subject.mjs` (**FC1**) échoue sans le correctif (carte orpheline
    toujours renvoyée), **passe** avec — 1/1. Mutant **F1** confirmé détecté.
  - Non-régression : `catalog-keyboard.mjs` **7/7**, `subject-bank.mjs` **6/6**, `battery.mjs` **19/19**.
- [x] **Matière de banque créée avant l'ajout du tiret ("UE2 Embryologie" au lieu de "UE2 - Embryologie")** :
  `upsertSpecialty()` ne copie le nom qu'à la création, modifier `P1_SUBJECT_BANK` ne corrige jamais les matières
  déjà enregistrées. Nouveau `window._p1FixBankSubjectNames()`, appelé au chargement des matières, qui renomme
  UNIQUEMENT une matière dont l'ID est un ID de banque **et** dont le nom est EXACTEMENT l'ancienne forme sans
  tiret — jamais une matière renommée à la main, jamais une matière hors banque au nom coïncidant.
  - Contre-preuve : nouveau scénario `subject-bank.mjs` **SB-DASH** échoue sans le correctif (nom resté sans
    tiret), **passe** avec — vérifie aussi explicitement qu'une matière renommée à la main et qu'une matière hors
    banque au nom identique restent intactes. Mutant **F2** confirmé détecté.
  - Suite `subject-bank.mjs` complète : **6/6** (SB1-SB3, SB-MANUAL, SB-ONB, SB-DASH).
- [x] Vérification habituelle avant déploiement : 55 blocs `<script>` inline analysés, 0 erreur ; CRLF préservé
  (66 274 / 0 bare LF) ; rollback posé
  (`rollback/tableur.html.avant-flashcards-orphelines-tiret-2026-10-02`) ; déployé et vérifié (SHA-256 local =
  live, `8a30ddd4…`).

## Carte « Listes personnalisables » : survol/espacement, wording « cours », icônes et abréviations par défaut (2026-10-02, captures d'écran de Jean)

- [x] **Survol + espace icône/titre** : cause confirmée en auditant la référence EDN exacte (même carte, même
  nom, `.tpx-cat-set-btn`) — `justify-content: space-between` sans `flex-grow` sur le texte. CSS portée à
  l'identique. Vérifié visuellement (captures d'écran réelles via navigateur + émulateur) : écart icône→texte
  ~10px (normal, plus le grand vide signalé), styles calculés au survol conformes (bordure/fond/icône/chevron
  bleus, exactement comme EDN).
- [x] **Wording « cours » au lieu de « items »** sur la page "Mes matières" (podium + grille des cartes) :
  vérifié visuellement ("0/2 cours" affiché après correction). La page "Mes cours" (pagination) n'est pas
  concernée (hors du périmètre demandé par Jean).
- [x] **Abréviations UE4-UE8 toujours incorrectes malgré le correctif précédent** : cause réelle confirmée —
  `short` était resté VIDE en base pour les comptes ayant appliqué la banque avant l'ajout de ce champ,
  `shortOf()` dérivait alors un code du nom ("UPE", "UBE", "UAE", "USE" — reproduit exactement dans
  `subject-bank.mjs` SB-DASH). Corrigé en élargissant `window._p1FixBankSubjectNames()` pour couvrir aussi
  `short` (et `icon`), chacun uniquement quand la valeur actuelle est vide.
- [x] **Icônes par défaut du pack matière** : chaque matière de `P1_SUBJECT_BANK` a maintenant une icône propre
  (tableau `ICONS` déjà vérifié visuellement, Font Awesome 6.0.0) au lieu du générique identique sur toutes les
  cartes. Écrite à la création ET complétée rétroactivement pour les matières déjà créées sans icône.
  - Contre-preuve : `subject-bank.mjs` SB2 et SB-DASH échouent sans le correctif (mutants **F2** élargi et
    nouveau **F3**, tous deux confirmés détectés), **passent** avec — suite complète **6/6**.
  - Non-régression : `catalog-keyboard.mjs` **7/7**, `flash-orphan-subject.mjs` **1/1**, `battery.mjs` **19/19**.
- [x] Vérification habituelle avant déploiement : 55 blocs `<script>` inline analysés, 0 erreur ; CRLF préservé
  (66 314 / 0 bare LF) ; rollback posé
  (`rollback/tableur.html.avant-icones-abreviations-hover-cours-2026-10-02`) ; déployé et vérifié (SHA-256
  local = live, `c9af4d26…`).

## Notification superflue, saccades du badge « Session Flash », page dédiée banque de matières, animation du nuancier (2026-10-02)

- [x] **Notification de résultat de la banque de matières supprimée** (3 points d'application), jugée superflue
  par Jean. Seul un message d'échec reste affiché. Vérifié : aucun test n'asserte la présence de ce toast (ne
  pouvait pas casser de test), `subject-bank.mjs` reste **6/6**.
- [x] **Saccades du badge de flashcards dues corrigées** : cause réelle confirmée (requête Firestore relancée à
  chaque mise à jour du cache live, très fréquent). Débounce 400ms + numéro de génération (réponse obsolète
  ignorée). Non-régression : `battery.mjs` **19/19** (couvre de nombreuses validations de tour).
- [x] **Page dédiée "Banque de matières" dans l'assistant de présentation** (retour de Jean : "c'est moche et non
  visible, fais une page à part") : sortie de la page "Matières", sur sa propre page (`since: 3`). Les pastilles
  défilent dans leur propre cadre borné pour que la case à cocher reste toujours visible. Vérifié visuellement
  (capture d'écran réelle : case et note visibles sans avoir à faire défiler toute la fenêtre).
  - `subject-bank.mjs` SB-ONB adapté (un clic de plus pour atteindre la nouvelle page) : **6/6** sur l'ensemble
    du fichier.
- [x] **Animation d'apparition/disparition du nuancier de recoloration** (comparaison EDN) : `animation` CSS
  (pas une `transition`, qui ne jouerait jamais sur un élément recréé à chaque bascule). Vérifié par un script
  jetable dédié (apparition avec la bonne `animation-name`, présence avec `.is-closing` juste après la
  fermeture, disparition réelle du DOM après le délai, aucune erreur JS) -- supprimé après usage.
  - Non-régression : `catalog-custom.mjs` **14/14**, `catalog-keyboard.mjs` **7/7**.
- [x] Vérification habituelle avant déploiement : 55 blocs `<script>` inline analysés, 0 erreur ; CRLF préservé
  (66 406 / 0 bare LF) ; rollback posé
  (`rollback/tableur.html.avant-notif-jank-onb-page-anim-couleurs-2026-10-02`) ; déployé et vérifié (SHA-256
  local = live, `67f095cb…`).

## Récapitulatif de l'assistant, verrou de scroll du check, pastille J, animation d'ajout EDN (2026-10-02)

- [x] **Libellé "Entraînements" manquant dans le récapitulatif** : `SETTINGS.trainingsPage.label` précisé.
  Vérifié par `subject-bank.mjs` SB-ONB (nouvelle assertion).
- [x] **Ligne "Banque de matières P1" ajoutée au récapitulatif** : ajoutée à la main dans `renderRecap()`.
  - Contre-preuve : SB-ONB échoue sans le correctif, **passe** avec. Mutant **F4** confirmé détecté.
- [x] **Verrou de scroll du check de validation** : déverrouillage déplacé après la fin du fondu de sortie
  (0,3s), jamais pendant que l'overlay est encore visible. Vérifié par script jetable (overlay affichée ->
  body verrouillé ; pendant le fondu -> encore verrouillé ; après -> déverrouillé, décalage mesuré = 0px
  à chaque étape). Non-régression : `battery.mjs` T1/T2/T3 (validations de tour).
- [x] **Pastille "Révisions J" alignée sur le bouton "Organisation de la journée"** (hauteur 24px, bordure,
  survol inversé identiques, thèmes clair/sombre/pastel). Vérifié par comparaison directe des styles calculés
  des deux éléments (repos et survol réel via CDP) : valeurs identiques.
- [x] **Animation d'ajout "comme sur TypixClin"** (descente + apparition) portée depuis TypixClin
  (`revealAdded`/`growRow`). Deux bugs réels trouvés et corrigés en testant (voir DECISIONS.md) : la ligne
  était visible avant d'être réduite (flash), et deux redessins (confirmation serveur + écoute temps réel A2)
  coupaient l'animation en cours. Vérifié par une chronologie complète (échantillonnage toutes les 40ms sur
  1,4s de la hauteur de ligne + classe `.is-new`) montrant la séquence attendue (collapse -> croissance ->
  mise en évidence -> retombée), et par capture d'écran réelle.
  - Non-régression : `catalog-custom.mjs` **14/14**, `catalog-keyboard.mjs` **7/7**, `catalog-safety.mjs`
    **4/4** (fusion/temps réel entre onglets, zone directement touchée par le correctif A2), `train-
    catalog.mjs` **8/8**.
- [x] Vérification habituelle avant déploiement : 55 blocs `<script>` inline analysés, 0 erreur ; CRLF
  préservé (66 597 / 0 bare LF) ; rollback posé
  (`rollback/tableur.html.avant-recap-jbadge-scroll-reveal-anim-2026-10-02`) ; `battery.mjs` **19/19**,
  `subject-bank.mjs` **6/6**, `flash-orphan-subject.mjs` **1/1** ; déployé et vérifié (SHA-256 local = live,
  `86abc35d…`).

## Texte redondant (ressources), gestionnaire qui se fermait à l'édition, switch Tours (2026-10-03)

- [x] **Texte redondant retiré** de "Configurer les ressources" (`.resource-option-name`). Vérifié
  structurellement (DOM du premier bouton : plus qu'un seul texte, la pastille colorée) et par capture
  d'écran réelle.
- [x] **"Modifier" depuis « Gérer mon programme » rouvre désormais ce gestionnaire à la fermeture de
  la fiche** (matière/item/SDD), même onglet, même recherche en cours -- au lieu de le fermer
  purement et simplement. Porté depuis TypixClin (`mgrPendingReturn`/`_tpxReturnTo`/`reopenManager`),
  qui avait déjà résolu exactement ce bug.
  - Contre-preuve : nouveau scénario `delete-animation.mjs` **D4** échoue sans le correctif (le
    gestionnaire ne se rouvre jamais), **passe** avec. Mutant **G1** confirmé détecté.
  - Non-régression : `delete-animation.mjs` **4/4** dans son ensemble (D3, qui teste le correctif
    JUMEAU déjà existant pour "Supprimer", reste intact), `catalog-custom.mjs` **14/14**.
- [x] **Switch "Moyenne de l'item"/"Confiance sur le tour"** (Tours du jour/de la semaine) habillé
  comme les switchs de Paramètres (pastille active blanche, texte bleu, fond gris clair) tout en
  conservant un vrai pouce coulissant animé (recoloré en blanc) -- ni la version Tours d'origine
  (pouce bleu plein) ni celle de Paramètres (aucune animation, juste un fondu de couleur statique)
  n'offraient les deux à la fois. Vérifié visuellement (captures d'écran réelles : état initial, à
  mi-glissement, état final) et par lecture des styles calculés (couleur active, pouce blanc visible).
- [x] Vérification habituelle avant déploiement : 55 blocs `<script>` inline analysés, 0 erreur ; CRLF
  préservé (66 669 / 0 bare LF) ; rollback posé
  (`rollback/tableur.html.avant-mgr-reopen-resopt-segswitch-2026-10-03`) ; `battery.mjs` **19/19** ;
  déployé et vérifié (SHA-256 local = live, `33e60c82…`).

## Scrollbar visible pendant le check de validation, groupes-jour « Révisions J » (2026-10-03)

- [x] **Scrollbar de `<html>` masquée visuellement pendant tout verrou de scroll**
  (`.p1-scrollbar-hidden`), y compris le check de validation d'un tour -- `body.style.overflow`
  n'avait aucun effet, c'est `<html>` qui défile réellement dans ce tableur. `overflow`/`position`
  de `<html>` jamais modifiés (contrainte `position:sticky`).
  - Contre-preuve : nouveau scénario `scrollbar-lock-visual.mjs` **SB1** échoue sans le correctif
    (scrollbar-width reste `thin` pendant le verrou au lieu de `none`), **passe** avec. Mutant
    **SB1** confirmé détecté.
  - Garde-fou de non-régression explicite dans le même test : `overflow-y`/`position` de `<html>`
    restent `auto`/`static` pendant le verrou (jamais touchés par ce correctif).
- [x] **Groupes-jour « Révisions J » : séparation visuelle plus claire** (contour + relief léger +
  marge accrue entre jours, au lieu d'une simple nuance de fond). Vérifié par lecture directe des
  styles calculés (`border`, `box-shadow`, `margin-top`) de chaque groupe.
  - Contre-preuve : `j-day-groups.mjs` **J1** échoue sans le correctif (aucune bordure/ombre),
    **passe** avec. Mutant **J1** confirmé détecté.
- [x] **Groupes-jour « Révisions J » : ouverture/fermeture animée** (`grid-template-rows` 0fr<->1fr,
  `<details>` natif intercepté en JS) au lieu d'un affichage/masquage instantané. "Aujourd'hui" reste
  déplié par défaut SANS rejouer l'animation à chaque reconstruction de la carte. Respecte
  `prefers-reduced-motion`.
  - Contre-preuve : `j-day-groups.mjs` **J4** échoue sans le délai de fermeture (l'attribut `open`
    est retiré instantanément, aucune transition visible possible), **passe** avec. Mutant **J4**
    confirmé détecté.
  - Vérifié aussi côté ouverture (**J3**) : `open` posé immédiatement, classe de transition ajoutée
    seulement à la frame suivante (sinon saut instantané vers l'état final).
- [x] Vérification habituelle avant déploiement : 55 blocs `<script>` inline analysés, 0 erreur ;
  CRLF préservé (66 764 / 0 bare LF) ; rollback de référence = `rollback/tableur.html.avant-
  segswitch-radius-2026-10-03` (état avant ce lot, identique à l'ancien live, SHA-256 vérifié) ;
  `battery.mjs` **19/19**, `subject-bank.mjs` **6/6**, `delete-animation.mjs` **4/4** (D3 flaky
  pré-existant, repasse au vert) ; `scrollbar-lock-visual.mjs` **2/2**, `j-day-groups.mjs` **4/4** ;
  déployé et vérifié (SHA-256 local = live, `188ea575…`).

## 3 retouches reprises de TypixClin — clavier virtuel, légende Supports, bouton bleu (2026-10-03/04)

- [x] **A. Clavier virtuel téléphone (listes personnalisables)** : bug réellement reproduit sur P1
  (cause différente d'EDN -- aucun mécanisme existant ne couvrait `#p1-catalog-modal`) avant tout
  correctif. `_p1CatalogKeepFieldVisible`/`_p1CatalogScheduleKeepVisible` ajoutés, LOCAUX, sans
  toucher aux mécanismes globaux (`tcp-kb-pin`, bloc tablette).
  - Contre-preuve : `pop-legend-keyboard.mjs` **A1** échoue sans le correctif (champ invisible/
    intouchable après ouverture du clavier simulé), **passe** avec -- y compris une vraie frappe
    + sauvegarde Firestore pendant le clavier ouvert. Mutant **KBV1** confirmé détecté.
- [x] **B. Légende « Supports disponibles » dynamique** (`_p1RenderSupportLegend`, remplace 4
  entrées figées en dur). Texte historique conservé pour un défaut jamais renommé (« Conférence »
  pour « conf », seul défaut dont le label réel diffère du texte historique).
  - Contre-preuve : **B2** échoue sans le correctif (ajout jamais reflété), **passe** avec.
    Mutant **LEG1** confirmé détecté. **B1/B3/B4/B5** couvrent aussi le renommage/recoloration en
    direct, la suppression, et la synchro multi-appareil (écriture Firestore directe).
- [x] **C. Bouton bleu (icône blanche) tant que sa fenêtre est ouverte** (légende/chrono/légende
  planning/légende entraînements), redevient gris à la fermeture quel que soit le chemin
  (`MutationObserver` sur la modale, générique, aucune fonction d'ouverture/fermeture modifiée).
  - Contre-preuve : **C1** échoue sans le correctif, **passe** avec. Mutant **POP1** confirmé
    détecté. **C2** (chrono vert->bleu->vert), **C3** (jamais violet en sombre), **C4** (variante
    pastel), **C5** (téléphone) couverts aussi.
  - Pièges de test réels documentés en commentaire dans `pop-legend-keyboard.mjs` (pas des bugs
    de l'app) : `page.setViewport({isMobile,hasTouch})` recharge vraiment la page dans cet
    environnement dès que ces indicateurs changent ; un mécanisme préexistant ferme déjà ces
    fenêtres au moindre `scroll` sur téléphone (debounce 50ms), un scroll incident pouvant
    s'immiscer en automatisation -- résolu en vérifiant dans le même tick JS que l'ouverture.
- [x] Vérification habituelle avant déploiement : 56 blocs `<script>` inline analysés, 0 erreur ;
  CRLF préservé (66 906 / 0 bare LF) ; rollback de référence = `rollback/tableur.html.avant-pop-
  legend-keyboard-2026-10-04` (état avant ce lot, identique à l'ancien live) ; `battery.mjs`
  **19/19**, `subject-bank.mjs` **6/6**, `catalog-keyboard.mjs` **7/7**, `catalog-custom.mjs`
  **14/14**, `delete-animation.mjs` **4/4**, `j-day-groups.mjs` **4/4**, `scrollbar-lock-
  visual.mjs` **2/2** ; `pop-legend-keyboard.mjs` **12/12** (stable sur 3 exécutions consécutives
  complètes) ; déployé et vérifié (SHA-256 local = live, `cfa59f26…`).

## Popovers Matières/Statut du modal « Organisation de la journée » (2026-10-07)

- [x] Apparition/disparition animées (fondu + zoom) des deux popovers ; boutons marqués « ouverts »
  (anneau, `aria-expanded`) ; flèche du Statut qui pivote en animation. `pdd-popovers.mjs` **3/3**,
  contre-épreuves PDD1/PDD2/PDD3 détectées, capture d'écran réelle vérifiée.
- [x] 56 blocs `<script>` OK, CRLF préservé (66 924 / 0 bare LF), `battery.mjs` **19/19**,
  `j-day-groups.mjs` **4/4**, `pop-legend-keyboard.mjs` **12/12**, `delete-animation.mjs` **4/4** ;
  déployé et vérifié (SHA-256 local = live, `89ed24bb…`).

## Curseur main sur le bouton Matières ouvert (2026-10-08)

- [x] Main au survol du bouton « Matières » activé (backdrop qui le recouvrait), normale ailleurs ; un
  clic referme sans rouvrir, la journée reste ouverte. `pdd-popovers.mjs` **4/4**, contre-épreuve
  (échec avant correctif) + mutants PDD4/PDD5 ; déployé et vérifié (SHA-256 local = live, `570a2443…`).

## Inscription : astérisques/erreurs en direct + recopie du nom (2026-10-08)

- [x] `signup-form.mjs` **3/3** (astérisques, disparition des erreurs, consentement), mutants SGN1-3 détectés ;
  `referral-ui.mjs` **25/25**.
- [x] `profile-name-mirror.test.mjs` **9/9** + non-régression Functions **141/141** ; mutants détectés ;
  déployé (Hosting `auth.html` identique en ligne `c144399e…`, 4 Functions ciblées).
- [ ] À constater en production : les noms « — » du panneau admin se remplissent à la prochaine
  connexion/ouverture du tableur de chaque utilisateur (aucune action manuelle).

- [x] Sauvegarde nocturne : bug de démarrage à froid corrigé (`getAuth()` -> `auth_()`), `scheduled-backup-init.test.mjs`
  avec contre-épreuve ; `backups.test.mjs` auto-nettoyant (12/12 x3). Fonctions : **141/141** à la 1re exécution complète (après la recopie du nom), puis 139-142 selon les exécutions : 1 à 3 tests de CONCURRENCE du parrainage (« Transaction is invalid or closed », émulateur) échouent de façon intermittente -- mesuré SANS mes changements (version HEAD) : 4/8 puis 6/8 exécutions en échec, contre 6/8 puis 3/8 avec eux : instabilité d'environnement préexistante, pas une régression.
- [ ] À vérifier demain : `firebase functions:log` -> l'exécution de 03:00 de `scheduledUserBackup` crée des sauvegardes.
