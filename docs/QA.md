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

## Sessions de travail, entraînements, graphique, Paramètres, copie Premium (2026-10-11) — local, rien déployé

- [x] `test/e2e/work-sessions.mjs` : F1/F2/E1/A1-A4 (lots d'origine), S1-S7, C1, N1, G1, T1 (switchs Paramètres, clair + sombre, 2 tailles),
  P1-P3 (pastilles : souris réelle, sombre, tactile 390). Contre-épreuves faites sur l'ancienne version (F1, F2, E1, A1-A3, T1, N1, S1 échouent).
  Les pastilles du complément n'ont pas de contre-épreuve « avant » (aucun instantané pris avant ce complément).
- [x] `referral-ui.mjs` C2 (jamais deux « Copié ! ») : échoue sur l'ancienne page, passe ; `T/C/V` 7/7.
- [x] Mocha : `firestore.rules.test.mjs` **51/51** (contre-épreuve : règles d'origine → 4 échecs sur les 7 tests workSessions),
  `backups.test.mjs` **13/13** (contre-épreuves : sans `workSessions` dans la sauvegarde, sans `deletedAt` dans la restauration).
- [x] Non-régression e2e : `battery` 19/19, `tours-lock` (5 passés avant l'arrêt de ma session de test), `layout-tours` 7/7, `pdd-popovers` 4/4,
  `j-day-groups` 4/4, `delete-animation` 4/4, `signup-form` 3/3, `pop-legend-keyboard` 12/12, `settings-persist` 1/1.
- [ ] Non rejoués après cette session : `test:bootstrap`, `catalog-*`, `subject-bank`, `train-catalog`, `data-durability`, `smoke`, `flash-orphan-subject`,
  `ipad-img-bar`, `scrollbar-lock-visual`, mutants permanents (`mutants.mjs` non étendu).
- [ ] Sans test dédié : captures iPad (portrait/paysage) des nouvelles cartes/fenêtres ; bouton « Du jour » de la page Entraînements (≤ 480 px,
  chevauchement avec « ? »/pagination) ; `<script>` : 57 blocs, 0 erreur ; trap de focus clavier des fenêtres non implémenté.

## Flammes et vies + retouches du 12/10 — local, rien déployé

- [x] `test/streak.test.mjs` **21/21** (vrai code de la page dans `vm`, faux Firestore transactionnel, stockage local PIÈGE) ; 6 mutants du calcul
  tous détectés (don de vie, `<=`, `>=`, plafond 3, vie double, `localStorage`) ; la page d'avant échoue (module absent).
- [x] `test/firestore.rules.test.mjs` **57/57** (6 tests `streak`, dont compte en lecture seule autorisé) ; sans le bloc de règles : 3 échecs.
- [x] `test/backups.test.mjs` **14/14** (`streak` sauvegardée, jamais de retour en arrière en compléter/remplacer) ; sans `streak` : échec.
- [x] `test/e2e/streak.mjs` **9/9** (E1 nouveau compte + rechargement + aucun stockage local, E2 hier 4→5 « +1 », E3 2e navigateur sans animation,
  E4 cœur brisé / « Série sauvée », E5 série qui repart, E6 vie offerte, E7 téléphone 390 sombre, E8 mouvements réduits, E9 place/aria-label) ;
  la page d'avant échoue. E7 a échoué une fois (carte hors écran → animation jamais jouée) : test corrigé (grande hauteur).
- [x] `work-sessions.mjs` : H-A (fondu), H-B (hauteurs fixes, PC/iPad/390/360), H-C, H-D1/H-D2 (compact) ; contre-épreuves : H-A, H-B, H-D1, H-D2 échouent
  sur la version d'avant, **H-C passe aussi sur l'ancienne (rien à retirer dans P1)**. Plusieurs tests rendus déterministes (lecture des transitions
  plutôt que minuteurs) : ce Chrome sans GPU décale les animations de plusieurs centaines de ms quand il est chargé.
- [x] Non-régression : `battery` 19/19 ; `work-sessions` (F, E, A, S, C, N, G, H, P, E3) tous passés au moins une fois en isolation — **en suite
  longue, C1, H-A et H-B ont échoué de façon intermittente (lenteur de l'environnement, pas de défaut reproductible)**.
- [ ] Non rejoués : `test:bootstrap`, `test/*.test.mjs` hors rules/backups/streak, e2e `catalog-*`, `subject-bank`, `train-catalog`, `data-durability`,
  `smoke`, `referral-ui` complet, `tours-lock` complet, `layout-tours` (non relancés après les derniers changements de CSS).
- [ ] Non testé : iPad pour la carte « Flammes » ; téléphone 360 px ; thème pastel ; hors ligne réel de la synchro (couvert seulement par le faux Firestore).

## Complément du 12/10 (soir) : 5 vies, une vie par absence — local, rien déployé

- [x] `test/streak.test.mjs` **22/22** (nouvelles règles : 1/2/10 jours manqués, 0 vie, 8 semaines d'absence = +5 puis 1 utilisée, plafond 5, vie offerte qui sauve,
  données abîmées/9 vies → 5, fuseaux) ; 7 mutants détectés ; la page d'avant échoue (7 échecs).
- [x] `firestore.rules.test.mjs` **57/57** (`lives: 5` accepté, `6` et `9` refusés, `used.n: 2` refusé) ; avec les règles d'avant : 2 échecs.
- [x] `backups.test.mjs` 14/14 ; trio rules + streak + backups : **93/93**.
- [x] `test/e2e/streak.mjs` **13/13** (E1 5 cœurs, E4 un seul cœur brisé de ≥ 0,9 s puis flamme ≥ 0,85 s après, E5 absence à 0 vie, E10 10 jours / 2 vies → 13 flammes /
  1 vie, E11 360 px sombre, H1 aides, N2 Nouveautés) ; la page d'avant échoue sur E1, E4, E10, E11, H1, N2. L'échantillonneur (15 ms) tourne DANS la page.
- [x] `work-sessions.mjs` N1 (Flammes 1re, Sessions 2e), S1, G1, H-A, H-D1 ; `battery` : voir ci-dessous.
- [ ] Non rejoués : `test:bootstrap`, autres `test/*.test.mjs`, e2e `catalog-*`, `subject-bank`, `train-catalog`, `data-durability`, `smoke`, `referral-ui` complet, `tours-lock`, `layout-tours`.

## Harmonisation de l'interface (2026-10-14) — local, rien déployé

- [x] `test/e2e/work-ui.mjs` (nouveau, remplace les scénarios sessions/entraînements de `work-sessions.mjs`) : S1-S7, C1-C2, G1, H-A, H-B, H-C, H-D1/D2, N1, P1 (clair/sombre), P2, P3, E3 — tous passés au moins une fois ;
  en suite longue H-A (animation du graphique) a échoué une fois (Chrome sans GPU lent) et passe 3/3 seul. Contre-épreuve : la version d'avant échoue (S1, C2 ; E1, E10, E11 flammes).
- [x] `test/e2e/streak.mjs` **13/13** (cœur qui bat puis se fend, « −1 », flamme APRÈS le cœur, mouvements réduits, 360 px, aides, Nouveautés). `streak.test.mjs` 22/22 (7 mutants détectés), rules 57/57, backups 14/14, battery 19/19,
  `work-sessions.mjs` F/E/A 9/9, layout-tours 7/7, pdd-popovers 4/4, delete-animation 4/4, tours-lock 6/6, j-day-groups 4/4, referral-ui T/C 6/6 ; `pop-legend-keyboard` A1 a échoué une fois en suite et passe 2/2 seul.
- [ ] Non rejoués : `test:bootstrap`, `T1` (switchs des Paramètres) après ces changements, e2e `catalog-*`, `subject-bank`, `train-catalog`, `data-durability`, `smoke` ; pas de captures iPad ; thème pastel non vérifié.

## Retouches du 2026-10-15 — local, rien déployé

Exécuté pour de vrai (vraie page, émulateurs Auth+Firestore, Chrome headless ; la sauvegarde est relue SUR LE SERVEUR en attendant 1 à 6 s) :
- [x] `node test/e2e/note-checklist.mjs` : **19/19** (CK1-CK9 liste à cocher dont deux appareils et note vide, ST1 clair/pastel, HD1 ×3 thèmes, SP1, CL1 ×3 thèmes, NR1 barre d'outils / compteur / hors ligne). Contre-épreuve sur la version d'avant : 18 échecs sur 19 attendus
  (CL1 sombre passe aussi sur l'ancienne version : le sombre n'avait pas le défaut ; NR1 échoue sur l'ancienne uniquement faute de cases, la barre d'outils et le compteur y passent).
- [x] `node test/e2e/retouches-15-10.mjs` : **12/12** (jours depuis la révision à 00 h 30 et 12 h 00 heure de Paris, horloge simulée ; jour local des statistiques ; trophée fantôme ; couronne Premium ; suppression de tâche ×2 ;
  graduations entières ; « Mes amis » ; icône des titres PC + téléphone ; changement d'onglet avec 100 lignes par page). Version d'avant : 10 échecs ; passent aussi : « 12 h 00 » et « jour local des statistiques » (défauts absents à ces cas).
- [x] `npm run test:rules` **57/57** ; `mocha test/streak.test.mjs test/backups.test.mjs` **36/36** ; e2e `delete-animation` 4/4, `pdd-popovers` 4/4, `battery` 19/19, `j-day-groups` 4/4, `layout-tours` 7/7, `tours-lock` 6/6,
  `catalog-custom` 14/14, `subject-bank` 6/6, `smoke`, `settings-persist`, `streak` 13/13 ; `work-ui` et `work-sessions` : échecs intermittents en suite longue (S6, H-B, P1, P3, T1), TOUS verts rejoués seuls (S6, H-B, P1, P3 sur la nouvelle ET l'ancienne version ; T1 sur la nouvelle seulement).
- [x] `test:bootstrap` **3/3** (émulateurs P1 avec Functions, `FUNCTIONS_DISCOVERY_TIMEOUT=60` : le délai par défaut de 10 s est trop court sur cette machine). Le fichier attend le projet `p1planner` alors que les émulateurs e2e tournent sous `p1planner-e2e` : exécuté via une copie temporaire pointée sur `p1planner-e2e` (supprimée), le test d'origine n'a pas été modifié.
- [ ] Non testé : iPad, Safari/iPhone réel (le correctif du trophée fantôme est vérifié par styles calculés, pas sur Safari 26), 360 px pour la liste à cocher (seulement 390 px) ; les titres sont mesurés à 360 px sans débordement (HD1).
- Captures : `docs/captures-15-10/` (PC + téléphone, clair / sombre / pastel). Script : `test/e2e/captures-15-10.mjs`.

- Complément du 17/10 : rapprochement avec la version de référence (lecture seule) → deux écarts réels corrigés : (1) sur une note VIDE, les boutons « puces » et « cases » ne créaient rien (`notesInput` effaçait la liste vide aussitôt créée) — défaut reproduit (CK9, la version d'avant échoue) puis corrigé ; (2) couronne / bouton d'essai masqués aussi en paysage téléphone et par le verrou de défilement ; mouvements de la suppression de tâche et de « Mes amis » alignés sur la référence. Rejoué : `retouches-15-10.mjs` 12/12 (ancienne : 10 échecs), `note-checklist.mjs` 19/19, rules 57/57, streak+backups 36/36, battery 19/19, streak 13/13, delete-animation, pdd-popovers, j-day-groups, layout-tours, tours-lock, catalog-custom, subject-bank, smoke, settings-persist verts ; `work-ui` : 6 échecs en suite longue, 6/6 verts rejoués seuls.

### Passage final du 17/10 (suites restantes) — local, rien déployé
- [x] 360×780 : `note-checklist.mjs` CK4 + CK7 et `retouches-15-10.mjs` FB1 + IC1 téléphone verts (variables `PHONE_W=360 PHONE_H=780`).
- [x] e2e verts : `catalog-keyboard` 7/7, `data-durability` 9/9, `flash-orphan-subject` 1/1, `train-catalog` 8/8, `ipad-img-bar` 5/5, `pop-legend-keyboard` 12/12, `scrollbar-lock-visual` 2/2, `signup-form` 3/3, `referral-ui` 26/26, `catalog-safety` 4/4 (CAT2/CAT3 : délai de navigation en suite, verts seuls, y compris sur la version d'avant), `work-sessions` T1 (échoue en suite longue, vert seul).
- [x] mocha : premium-plans, profile-name-mirror, referral-audit/functions/logic/lotAB, scheduled-backup-init, note-size-error-code, point3-error-code : 134 tests, 1 échec intermittent (`referral-lotAB`, « 3e ET 4e filleul en Promise.all », ≈ 1 passage sur 5) = erreur de l'émulateur « Transaction is invalid or closed » sous contention ; code de parrainage non modifié dans l'arbre de travail.
- [ ] Jamais testé : Safari / iPhone réel, iPad, production (aucune donnée de production consultée).

### Annale / Colle / Concours blanc en QCM, barre de sauvegarde, flammes (2026-10-18) — local, rien déployé
- [x] `node test/e2e/epreuves-qcm.mjs` **2/2** (20 + 30 + 50 QCM = 3 annales / 100 QCM ; détail par épreuve ; cartes, semaine, récap ; QCM inchangé ; « − » retire la dernière épreuve ; colle + concours blanc sur téléphone 390 sans défilement horizontal) ; la version d'avant échoue 2/2.
- [x] `node test/e2e/save-bar.mjs` **5/5** (bleu qui avance, vert puis effacée, rouge si refusée, orange réseau muet puis vert au retour, 3 thèmes) ; la version d'avant échoue 5/5.
- [x] Flammes : reproduit avec les règles du dernier commit chargées dans l'émulateur (flammes « – », session refusée) ; avec les règles du dépôt : flamme 1, session acceptée.
- [x] Non-régression : `work-ui` adapté (C2, P2 : nouvelle sémantique) — verts, y compris H-B (hauteurs identiques), S6, G1, H-A, P1, P3 rejoués seuls (instables en suite longue, comme avant) ; `streak` 13/13, `battery` 19/19, `note-checklist` 19/19, `retouches-15-10` 12/12 (échecs ponctuels de DEL1, battery T1/T3 quand une suite en suit une autre, verts rejoués seuls).
- [ ] Jamais testé : Safari / iPhone réel, iPad, production.
- [x] 19/10 : présélections du concours blanc = celles de l'annale (epreuves-qcm.mjs 2/2 : vérifie les pastilles de QCM et de temps de l'annale et du concours blanc ; la version d'avant échoue sur le concours blanc ; work-ui C1, C2, P2, H-B verts). Local seulement à ce stade.

### Thème dans les Paramètres (2026-10-19) — local, rien déployé
- [x] `node test/e2e/theme-settings.mjs` **13/13** : header sans bouton et sans décalage (PC 1366 et 1024, iPad 820, tablette 768, téléphone 390 et 360) ; carte placée juste sous « Listes personnalisables », 3 thèmes avec phrase, thème en cours coché ; clic = appliqué + indiqué + enregistré SUR LE SERVEUR + conservé au rechargement ; clavier (flèches) ; toucher iPad / 390 / 360 sans débordement, cibles >= 56 px ; contraste du nom et de la phrase >= 4,5 dans les 3 thèmes ; thème reçu du serveur reflété dans la carte. La version d'avant échoue 13/13.
- [x] Non-régression : `catalog-keyboard` 7/7, `catalog-custom` 14/14, `subject-bank` 6/6, `settings-persist`, `pdd-popovers` 4/4, `work-sessions` T1 (Paramètres), `note-checklist` 19/19 et `retouches-15-10` 12/12 (3 thèmes), `save-bar` 5/5, `epreuves-qcm` 2/2.
- [ ] Jamais testé : Safari / iPhone réel, iPad réel.

### Police, écran vide, thème (2026-10-19, suite) — local, rien déployé
- [x] `node test/e2e/theme-font-empty.mjs` **24/24** : TH1 thème ×7 formats (PC clair / sombre / pastel, iPad portrait et paysage, téléphone 390 et 360 : en-tête sans bouton, mêmes positions et hauteur qu'AVANT, carte sous « Listes personnalisables », un seul actif, clic = appliqué + localStorage + settings/preferences.theme relu côté serveur, re-clic sans réécriture, thème reçu du compte, rechargement) ; FN1 police ×7 (carte sous « Thème » sans description, police de départ avant DOMContentLoaded, corps / titres / `document.fonts.check` / logo Outfit / localStorage / settings/preferences.font, rechargement) ; FN2 ×4 (3 polices × 5 onglets sur PC 1366, PC 1024, iPad 820, téléphone 360 : scrollWidth <= largeur, en-tête de 70 px) ; FN3 (autre contexte sans rien en local : police du compte) ; EM1 ×5 (jour + semaine, 3 thèmes PC, téléphone 390 et 360 : nouvel écran, ancien absent, bouton visible, clic = fenêtre fermée + « Mes cours » actif + page défilable + onglets en vue). **La version d'avant échoue 24/24.**
- [x] Non-régression : `theme-settings` 13/13, `catalog-keyboard` 7/7, `catalog-custom` 14/14, `subject-bank` 6/6, `settings-persist`, `note-checklist` 19/19, `retouches-15-10` 12/12, `save-bar` 5/5, `epreuves-qcm` 2/2, `battery` 19/19, `layout-tours` 7/7, `pdd-popovers` 4/4, `delete-animation` 4/4, `j-day-groups`, `tours-lock`, `streak` 13/13, `smoke`, `data-durability` 9/9, `train-catalog` 8/8, `pop-legend-keyboard` 12/12, `signup-form`, `referral-ui`, `ipad-img-bar`, `catalog-safety`, `flash-orphan-subject`, `scrollbar-lock-visual`. `work-ui` : 5 échecs en suite longue (S6, H-B, P1, P3), verts rejoués seuls (P1-dark vert au 2ᵉ passage, vert aussi sur la version d'avant).
- [ ] Non exécutés cette fois : `test:rules` / mocha (règles et Functions non modifiées). Jamais testé : Safari / iPhone réel, iPad réel.
- [x] 19/10 : entrée Nouveautés « Police et thème » sans notification — `theme-font-empty.mjs` NV1 vert (compte ayant lu la v7 : aucune pastille, aucun point d'avatar, seule clé « vu » = `whatsNewSeen_v7`, texte exact) et échoue sur la version d'avant ; `streak.mjs` N2 et `work-ui.mjs` N1 adaptés à l'ordre (Police et thème, Flammes, Sessions) et verts. Capture : `docs/captures-15-10/nouveautes-police-theme.png`.
- [x] 19/10 : Nouveautés sans émojis dans les titres et sans étiquette « Cette semaine » — NV1 (vérifie aussi l'absence d'émojis dans tous les titres), streak N2 et work-ui N1 verts ; NV1 échoue sur la version d'avant.
- [x] 19/10 : tiroir Session Flash — `theme-font-empty.mjs` FL1 ×4 (PC 1366, iPad 820, téléphone 390 et 360 × 3 polices : « Tout sélectionner », « Uniquement les dues », « Toutes les flashcards », « Choisir des items » sur une seule ligne, rien ne déborde du tiroir, les deux pastilles sur la même rangée sauf à 360 px) verts ; sans le correctif : 3 échecs sur 4 (le cas de Jean reproduit). `flash-orphan-subject` et `work-sessions` A1-A4 (flashcards) verts. Captures : `docs/captures-15-10/tiroir-flash-arrondie-{pc,tel360}.png`. Autres zones des flashcards non rescannées au-delà du tiroir et du tableau de bord (scan « coupé seulement en Arrondie » : aucune autre).
- [x] 19/10 : survol des « + » en sombre — `theme-font-empty.mjs` HV1 ×3 (clair, sombre, pastel × les 2 boutons : au survol dégradé + icône blanche + bordure effacée, retour au repos en sortant) verts ; sans le correctif HV1-sombre échoue (clair et pastel passent). Capture : `docs/captures-15-10/plus-survol-sombre.png`. Autres boutons à règle sombre de même spécificité non recensés un à un.

### Tour enregistré / modifié / supprimé : animation sur place (2026-10-19) — local, rien déployé
- [x] `node test/e2e/tour-fx.mjs` **18/18** (lancé en deux passes : 11 + 7 scénarios, tous verts) : FX1 nouveau tour ×5 (PC 1366 clair / sombre / pastel, iPad 820, téléphone 390 : classe `p1-tour-pop`, 2 ondes, 10 rayons, pastille « +1 tour », ≥ 20 confettis, ligne `p1-row-added`, contour lumineux dans la partie visible de la ligne, aucun grand check, animation partie APRÈS la fermeture de la fenêtre, calque à z-index 30, calques retirés après 1,8 à 3,3 s, serveur à jour) ; FX2 modification (« Modifié », 0 confetti) ; FX3 suppression ×3 (PC clair / sombre, téléphone : fantôme à la classe de l'ancienne couleur avec le numéro de la case, « Tour supprimé », case vide, ligne `p1-row-removed`, serveur vidé) ; FX4 case hors écran (60 cours, fenêtre ouverte depuis « Révisions J » : la page défile, case centrée à ±120 px, animation ≥ 450 ms plus tard) ; FX5a autre onglet, FX5b mode compact (grand check joué UNE fois, aucun calque), FX5c écriture refusée (vrai refus : cours « restauré » après le chargement) et FX5d suppression refusée : ni animation ni check ; FX6a / FX6b Méthode des J (rien pendant la fenêtre J, animation à sa fermeture, « Planifier » comme « Pas cette fois ») ; FX7 mouvement réduit (aucun calque, ligne teintée) ; ERR1 aucune erreur JS.
- [x] Contre-épreuve sur la copie d'AVANT (`PUBLIC_DIR`) : **14 échecs sur 18** (FX1 ×5, FX2, FX3 ×3, FX4, FX5c — l'ancienne version jouait le check même quand l'écriture échouait —, FX6 ×2, FX7) ; seuls FX5a, FX5b, FX5d et ERR1 passent aussi sur l'ancienne (comportement de repli inchangé, voulu).
- [x] Non-régression (Chrome, un lot de 15 suites) : `layout-tours` 7/7, `delete-animation` 4/4, `j-day-groups` 4/4, `pdd-popovers` 4/4, `battery` 19/19, `smoke`, `settings-persist`, `theme-font-empty` 32/32, `theme-settings` 13/13, `save-bar` 5/5, `streak` 13/13, `epreuves-qcm` 2/2, `note-checklist` 19/19 ; `tours-lock` TL11 en échec dans le lot mais **6/6 rejoué seul** (et 6/6 sur l'ancienne version) ; `retouches-15-10` 11/12 : DEL1 (animation de suppression d'une TÂCHE, échantillonnage temporel) échoue **à l'identique sur la version d'avant** avec Chrome — sans lien avec cette modification.
- [ ] Non testé : Safari / iPhone réel, iPad réel (seulement l'émulation 820 px), 360 px. Non relancés : `test:rules` / mocha (règles et Functions non modifiées). À 390 px, la pastille « Tour supprimé » peut être coupée par le bord droit de l'écran quand la case est près de ce bord (comportement identique à la référence).
- Captures : `docs/captures-15-10/tour-fx-*.png` (nouveau tour PC clair + sombre + téléphone, modification PC, suppression PC + téléphone). Script : `test/e2e/tour-fx.mjs` (`TOURFX_SHOTS=1` pour les captures).

### Rythme des J dans les Paramètres (2026-10-20) — local, rien déployé
- [x] `node test/e2e/j-preset-settings.mjs` **3/3** (vrais clics : J1 « Personnalisé » non enregistré puis « Équilibré » ; J2 personnalisé enregistré → « Équilibré » enregistré ; J3 « Rapproché » → « Personnalisé » → retour → « Espacé »). Copie d'AVANT : J1 et J3 échouent (case restée sur « Personnalisé », rythme enregistré inchangé), J2 passe.
- [x] Non-régression : `settings-persist`, `theme-settings`, `j-day-groups`, `catalog-custom` verts (voir sortie ci-dessus lors de la session).
- [ ] Jamais testé : Safari / iPhone réel.

### Liste à cocher, texte barré (2026-10-21) — local, rien déployé
- [x] `node test/e2e/note-checklist.mjs` **36/36** (BR1 ×16 : fenêtre de la journée et case du planning × dernière ligne cochée / non cochée × clair, sombre, pastel + téléphone 390 : Entrée, Entrée, texte → jamais barré, ni à l'écran ni dans le HTML enregistré ; BR2 : coche = barré gris + trait animé, décoche = plus de trait, Entrée sur ligne cochée = nouvelle ligne décochée non barrée, état conservé au rechargement). Copie d'AVANT : **17 échecs sur 17** (bug reproduit). Un premier passage complet a subi un plantage du navigateur de test (« Connection closed ») : rejoué en deux lots, tout vert.
- [ ] Jamais testé : Safari / iPhone réel (le bug venait justement de la façon dont Chrome et Safari recopient le style).

### Animations du mode sur-mesure, des entraînements et menu « Gérer » (2026-10-21) — local, rien déployé
- [x] `node test/e2e/perso-fx.mjs` **28/28** (lancé par lots) : PF1 ×4 (60 cours, n° 61 sur la page 2 : PC clair / sombre / pastel + téléphone 390 — page 2, descente, cadre vert jusqu'au bout à droite, « +1 cours », confettis, page arrêtée, aucune barre horizontale) ; PF2 ×2 (30 matières, PC + téléphone) ; PF3 (depuis « Gérer » : animation sur la ligne du gestionnaire à z-index 10200, page immobile derrière, descente à la fermeture) ; PF4 ×4 (couleurs au repos / survol / appui, aucune infobulle, fondu entre onglets, `scrollbar-gutter`, textes vides) ; PF5 ×2 (240 entraînements : ajout, modification, aucune notification) ; PF5s ×3 (suppression au milieu : la ligne s'anime dans le tableau, disparaît ≥ 0,5 s plus tard, celle du dessous jamais marquée, serveur archivé ; PC clair / sombre + téléphone) ; PF5f (onglet fermé 0,3 s après la confirmation, puis réouverture : supprimé) ; PF6a / PF6b (suppression d'un cours / d'une matière depuis « Gérer », serveur archivé) ; PF7 (redessin par l'écoute pendant l'animation : l'effet continue) ; PF8 (mouvement réduit).
- [x] Contre-épreuve (copie d'avant) : PF1 ×4, PF2 ×2, PF3, PF4 (clair, sombre ; le scénario téléphone ne se termine pas), PF4-vide, PF5, PF5s, PF6a/b, PF7, PF8 **échouent** ; PF5f passe aussi sur l'ancienne (l'ancienne écrivait à 0,2 s : la sécurité des données est identique).
- [x] Sélecteur `CSS.escape` sur un id d'entraînement numérique : retrouve bien la ligne (testé dans PF5s) ; le module compare tout de même sur `dataset`.
- [x] `delete-animation.mjs` adapté (D2 : la ligne d'entraînement s'anime avec `tpx-pfx-out` puis disparaît ; D3 : la ligne de « Gérer » se replie avant de disparaître) : 4/4. Autres suites vertes : `catalog-custom` 14/14, `catalog-keyboard` 7/7, `catalog-safety` 4/4, `subject-bank` 6/6 (rejoué seul), `train-catalog` 8/8, `battery` 19/19, `smoke`, `settings-persist`, `theme-settings` 13/13, `theme-font-empty` 32/32, `layout-tours` 7/7, `tour-fx` 18/18, `j-day-groups` 4/4, `j-preset-settings` 3/3, `pdd-popovers` 4/4, `tours-lock` 6/6 (rejoué seul), `retouches-15-10` 12/12, `save-bar` 5/5, `epreuves-qcm` 2/2, `data-durability` 9/9, `flash-orphan-subject` 1/1. Échecs intermittents en lot, verts rejoués seuls : `subject-bank` SB-ONB, `tours-lock` TL9 / TL11 (échouent aussi parfois sur l'ancienne version).
- [ ] Jamais testé : Safari / iPhone réel, iPad réel, 360 px, thèmes sombre / pastel pour les entraînements (seulement clair + sombre pour la suppression). Le test avait besoin de marquer la présentation de bienvenue comme faite (sinon elle verrouille le défilement).
- Captures : `docs/captures-15-10/perso-fx-*.png`. Script : `test/e2e/perso-fx.mjs` (`PERSOFX_SHOTS=1`).

### Boutons sombres, suppression de matière « en cours », matière présélectionnée (2026-10-24) — local, rien déployé
- [x] `node test/e2e/perso-retouches-22-10.mjs` **11/11** : RT1 ×4 (PC clair / sombre / pastel + téléphone sombre : « Enregistrer » et « Supprimer définitivement » en dégradé bleu / rouge, survol visible sur Annuler (le fond change en sombre), Supprimer (survol rouge conservé en sombre) et les boutons principaux) ; RT2 (matière à 4 cours : à 100 ms bouton inactif, icône qui tourne, « Suppression… », opacité ≥ 0,75, Annuler inactif ; fenêtre fermée après l'archivage ; matière et 4 cours archivés sur le serveur ; double clic = une seule suppression) ; RT2-hors-ligne (réseau coupé : fermeture après ≈ 8,7 s, au plus 9,5 s admis) ; RT3 ×4 (filtre sur P2 → formulaire sur P2, cours enregistré dans P2 et affiché n° 4 ; deux matières, aucun filtre, matière inconnue → 1re matière ; changement de matière dans le formulaire ; cours existant : matière verrouillée) ; RT3-vide (« Ajouter » de « Gérer » : 1re matière). Copie d'AVANT : 9 échecs sur 11 (« Enregistrer » gris `none / rgb(31, 41, 55)` en sombre, aucune présélection) ; RT2-hors-ligne et RT3-vide passent aussi (comportements inchangés).
- [x] Non-régression : `perso-fx` PF1 / PF2 / PF3 / PF4 / PF6 (6/6), `delete-animation` 4/4, `catalog-custom` 14/14, `theme-settings` 13/13, `smoke`, `subject-bank` 6/6 (rejoué seul : SB-ONB intermittent en lot). Un plantage du navigateur de test (« Connection closed ») a interrompu un lot : rejoué suite par suite, tout vert.
- [ ] Jamais testé : Safari / iPhone réel, iPad réel, 360 px.

### Validation depuis les J et dates de fin d'essai (2026-10-24) — local, rien déployé
- [x] `node test/e2e/tour-fx.mjs` **21/21** (FX8 ×3 nouveaux : validation depuis « Révisions J » — PC, téléphone 390, cours sur la page 2 du tableau : fenêtre des J fermée, « Mes cours » ouvert, animation complète sur la case, aucun grand check, serveur à jour ; FX5a adapté : un point d'entrée autre que les J, tableau non affiché → check joué une fois). Copie d'AVANT : FX8 échoue 3/3 (« Mes cours » jamais ouvert, check à la place).
- [x] `node test/e2e/trial-date-tz.mjs` **4/4** (échéance 23:30 à Paris, été et hiver, navigateur réglé sur Indian/Reunion et Pacific/Auckland : « Gratuit jusqu'au 14/07/2027 » / « 14 juillet 2027 », pas le lendemain). Copie d'AVANT : 4/4 échecs (« 15/07/2027 »). Non-régression : `j-day-groups`, `j-preset-settings`, `layout-tours` verts.
- [ ] Jamais testé : Safari / iPhone réel ; boucle d'écritures et déverrouillage en direct (audits faits en lecture seule le 24/10 par Jean, non rejoués ici).

### Curseur de saisie et punaise To-do (2026-10-24) — local, rien déployé
- [x] `node test/e2e/caret.mjs` **11/11** : CR1 ×8 (notes d'un cours, d'un entraînement, cahier d'erreurs ; PC et téléphone × clair / sombre / pastel + polices Journal et Arrondie sur PC) — mesure AUX PIXELS (captures, lignes du curseur vs lignes de l'invite) : écart des centres ≤ 2,5 px (police d'origine), curseur de la zone vide à ±3 px de celui du texte tapé (toutes polices), l'invite disparaît à la frappe et revient à l'effacement ; CC1 ×3 (`caretColor` = `var(--primary)` dans l'Organisation de la journée, les cases du planning, les Flashcards, la recherche des cours, la liste des tâches, les notes ; cases à cocher non concernées). Copie d'AVANT : 8 échecs sur 11 (curseur 22→41 pour une invite 30→41 sur PC ; curseurs noirs) ; les 3 mesures téléphone passent aussi sur l'ancienne (pas de décalage mesurable sur téléphone avec ces polices).
- [x] `node test/e2e/todo-pin.mjs` **21/21** : PT1 ×20 (liste des cours, cours à revoir en priorité, entraînements, notes d'un cours, notes d'un entraînement × PC clair / sombre / pastel + téléphone clair ; échantillonnage `requestAnimationFrame` 1,8 s : à chaque image le bouton (opacité ≥ 0,5 : 0,65-0,75 = retour « appui » au toucher) OU la punaise est visible ; punaise finale à ±1 px de celle d'un redessin ; tâche enregistrée une seule fois malgré le double clic ; aucune erreur JS) ; PT2 mouvement réduit. Copie d'AVANT : **14 échecs sur 21** (jusqu'à 16 images vides dans les tableaux).
- [ ] Jamais testé : Safari / iPhone réel (le curseur natif y est dessiné autrement), 360 px.

### Chargement en squelette (2026-10-25) — local, rien déployé
- [x] `node test/e2e/skeleton.mjs` **22/22** : SK1 ×4 (rechargement du tableur PC / téléphone × clair / sombre : en-tête + squelette immédiats, ancien écran JAMAIS visible — sonde `requestAnimationFrame` posée avant le chargement —, contenu non cliquable, 5 pastilles de squelette dont l'active = onglet actif réel, squelette retiré aux données, pastille de l'onglet actif alignée à ±2 px et opaque) ; SK2 (réseau suspendu, cache Firestore effacé : squelette retiré à ≈ 11 s ≤ 16 s) ; SK3 (déconnecté : présentation en ≈ 2 s) ; SK4 ×5 (390 / 820 / 1180 / 1366 / 1920 px : colonnes 1/2/3/3/4 identiques au réel, barre d'onglets à ±3 px, haut de grille à ±4 px) ; SK5 ×5 (réseau ralenti : notes d'un cours, notes d'un entraînement, cahier d'erreurs, panneau flashcards des notes, liste des flashcards — squelette vu par MutationObserver, aucun `.fa-spinner`, non éditable et sans événements souris, puis vrai contenu et éditeur de nouveau `contenteditable=true`) ; SK6 ×4 (Compte Premium PC / sombre / iPad 820 / téléphone 390 : carte compte et bandeau à ±2 px de la vraie page, aucune barre de squelette restée, parrainage sans « Chargement… ») ; SK7 (graphique de ressenti à la note maximale : point non rogné au repos, marge 14,6 px ≥ 10 px pour le survol). Copie d'AVANT : SK1, SK3, SK4, SK5 et SK6 échouent tous ; SK7 passe (graphique inchangé). Le survol du graphique est vérifié par la géométrie (marge ≥ rayon + bordure), pas par les pixels (l'état survolé ne se redessine pas hors souris réelle).
- [x] Non-régression (Chrome, émulateurs) : `smoke`, `settings-persist`, `theme-settings` 13/13, `theme-font-empty` 32/32, `layout-tours` 7/7, `delete-animation` 4/4, `catalog-custom` 14/14, `catalog-keyboard` 7/7, `catalog-safety` 4/4, `subject-bank` 6/6, `train-catalog` 8/8, `battery` 19/19, `tour-fx` 21/21, `j-day-groups` 4/4, `j-preset-settings` 3/3, `pdd-popovers` 4/4, `tours-lock` 6/6 (rejoué), `note-checklist` 36/36, `retouches-15-10` 12/12, `save-bar` 5/5, `epreuves-qcm` 2/2, `flash-orphan-subject`, `streak` 13/13 (E8 rejoué seul), `work-ui` et `work-sessions` (scénarios instables en lot rejoués seuls : verts), `perso-fx` 21/21, `perso-retouches-22-10` 11/11, `caret` 11/11, `todo-pin` 21/21, `trial-date-tz` 4/4, `referral-ui`. `data-durability` D9a (compteur d'écritures non confirmées) échoue AUSSI sur la version d'avant (timing, sans lien).
- [x] Deux passages de non-régression ont subi une coupure intermittente du réseau de la machine (échec du garde-fou « projet » des pages, qui charge Firebase depuis le CDN) : suites rejouées, toutes vertes. `tour-fx` n'attendait pas assez la fin de la présentation de bienvenue (qui s'ouvre maintenant APRÈS le squelette et reverrouillait le défilement) : le compte de test est maintenant marqué « bienvenue faite » (comme les autres nouvelles suites).
- [ ] Jamais testé : Safari / iPhone réel, iPad réel, 360 px ; chargement à froid sans aucun cache (premier lancement d'un navigateur neuf : seul le cas « cache Firestore effacé » est couvert).
- Captures : `docs/captures-15-10/squelette-*.png` (tableur PC et téléphone : squelette puis page chargée ; chargements locaux ; Compte Premium). Script : `test/e2e/skeleton.mjs` (`SKELSHOTS=1`).

- [x] 25/10 (squelette, barre de navigation) : `node test/e2e/skeleton.mjs` **23/23** ; SK8 (avec et sans la Méthode des J) compare, de 320 à 1920 px (iPad 820 et téléphones 390 / 360 / 320 compris), la barre (largeur ±8 px, hauteur ±6 px), la case J et la case To-do (largeur ±6, position ±10) à celles de la vraie page, avec 5 cases dans la barre. Copie d'AVANT : SK8 échoue 2/2 (pas de case J ; largeurs et hauteurs fausses à 700 et 1920 px). `smoke`, `layout-tours` 7/7, `theme-settings` 13/13 verts.

- [x] 25/10 (Tableau de bord) : `node test/e2e/tableau-de-bord.mjs` **5/5** — TB1 ×2 (avec et sans la Méthode des J, 13 largeurs de 320 à 1920 px : onglet « Tableau de bord », aucun débordement ni texte rogné, barre d'onglets de la MÊME hauteur qu'avant, pas de défilement horizontal) ; TB2 (les 3 titres de la page : bon texte, anciens absents, une seule ligne avec leur « ? », de 320 à 1920 px) ; TB3 (les 3 fenêtres d'aide : bon titre, anciens noms absents du contenu, titre sans débordement à 1366 / 390 / 360 / 320 px) ; TB4 (formulaire d'avis : bouton « Tableau » sur une ligne, hauteurs égales, 1366 / 390 / 320 px). Copie d'AVANT : 5/5 échecs. `streak` (texte des Nouveautés adapté), `theme-font-empty` 32/32, `note-checklist` ST1 2/2 verts ; `subject-bank`, `streak` E4 et `work-sessions` T1 : échecs intermittents en lot, verts rejoués seuls.

- [x] 27/10 (Méthode Pomodoro) : `node test/e2e/pomodoro.mjs` — PM1 (5 formats : PC, iPad, téléphone portrait et paysage, clair et sombre : case après « Flammes », 25:00 / « Prêt », aucun débordement, « + » lance sans ouvrir la fenêtre, barre ≈ 50 % à mi-course, pause / reprise) ; PM2 (fenêtre : 2 colonnes de même bas sur PC, « Sonnerie » sous « Chronomètre », pastilles de ton / formule sur une ligne, tuiles 32 px, pied fixe, `scrollbar-gutter: stable`, plein écran < 560 px) ; PM3a (frise concentration / pause : largeurs proportionnelles, minutes sans unité, repère en fin de case courante ±2 px, « En pause ») ; PM3b (séance 90 / 20 × 12 : aucun chiffre rogné, case courante ≥ 38 px, « 1:30:00 » dans l'anneau et en plein écran) ; PM4 (« Passer » : enchaînement, statistiques inchangées) ; PM5 (appui long sur « + » : ≥ 25 min en 1,3 s, s'arrête au relâchement ; clic / Entrée = 1 pas ; pause minimale 1) ; PM6 (fin de période : carillon 1568-1175-988-784 puis 784-988-1175-1568, aucune notification toast, message `aria-live`) ; PM7 (plein écran : transition, cercle carré et entier, autres éléments masqués, cercle à gauche en paysage, Échap deux fois) ; PM8 (deux onglets synchronisés, exactitude après rechargement et rattrapage) ; PM9 (tous les documents `users/{uid}` identiques avant / après : aucune lecture ni écriture de compte, aucun champ pomodoro) ; PM10 (ligne d'aide, première entrée des Nouveautés avec icône dégradée, aucune pastille, `whatsNewSeen_v7` inchangé) ; PM11 (titres des fenêtres « Temps de travail » / « Entraînements du jour » : tuiles 32 px ambre / violet, alignement, clair et sombre). Tout vert sur le nouveau code. Copie d'AVANT (`PUBLIC_DIR`) : PM1, PM4, PM10, PM11 échouent (carte `#p1PomoCard` absente) — la contre-épreuve de PM11 n'isole donc pas, à elle seule, le changement d'icône.
  Régression : `theme-settings` 13/13, `theme-font-empty` 32/32, `work-ui` (N1, H-B, P1) verts, `streak` 13/13, `note-checklist` 36/36, `battery` 19/19, `catalog-custom` 14/14, `work-sessions` T1 2/2, `subject-bank` 6/6. Tests existants adaptés à l'ordre des Nouveautés (la nouvelle entrée est première) : `work-ui` N1, `streak` N2, `theme-font-empty` NV1. `subject-bank` SB-ONB échouait déjà sur la version commitée et sur les copies d'avant le squelette (le test supposait 3 clics avant la page « Banque de matières », il en faut 4 : écran d'accueil supplémentaire) : le test clique maintenant jusqu'à voir la page. Échecs intermittents en lot connus (réseau de la machine : garde-fou « projet » des pages), verts rejoués seuls.
- [ ] Jamais testé : Safari / iPhone réel, iPad réel ; minuteur en lecture seule après expiration Premium (la case est locale, aucun test de verrouillage) ; sonneries sur un appareil réel (le test vérifie les notes jouées, pas l'audio).
- Captures : `docs/captures-15-10/pomodoro-*.png` (case, fenêtre, plein écran, frise, titres des fenêtres ; PC clair / sombre, iPad, téléphone portrait et paysage). Script : `test/e2e/pomodoro.mjs` (`POMOSHOTS=1`).

- [x] 27/10 (Pomodoro, espace « + » / « Voir le détail » sur téléphone) : règle `@media (max-width: 600px)` existante étendue à `.daily-stat-card:has(> .p1-pomo-btn) .daily-stat-value-row { padding-top: 0.4rem }` (padding, pas marge : une marge fusionnerait avec celle du titre). `node test/e2e/pomodoro.mjs` **33/33** dont PM12 ×5 : à 390 et 360 px, en clair et en sombre, l'écart entre le bas du « + » et le haut de « Voir le détail » est ≥ 3 px et égal (±2 px) à celui de « Entraînements du jour », rien ne déborde ; sur PC 1366 px aucun padding ajouté et même écart qu'« Entraînements du jour ». Copie d'AVANT : PM12 échoue 4/4 sur téléphone (écart 2,0 px), PC inchangé. `node test/e2e/streak.mjs` **13/13**. Jean a aussi vérifié lui-même (27/10) puis demandé la publication. Instantané d'avant : `rollback/tableur.html.avant-pomodoro-espace-2026-10-27`.

- [x] 27/10 (Pomodoro, vibration à la sonnerie sur téléphone) : l'appel `navigator.vibrate([180, 90, 180])` (≈ 0,45 s) existait déjà mais était trop court pour se sentir. Motifs allongés : fin de concentration `[600, 200, 600, 200, 600]` (≈ 2,2 s), fin de pause `[400, 150, 400]` (≈ 0,95 s) ; toujours indépendante du son. `node test/e2e/pomodoro.mjs` **34/34** dont PM13 (espion sur `navigator.vibrate` : aucun appel au chargement, au démarrage ni au « Passer » ; un appel à chaque fin de période, même son coupé ; longueurs conformes). Copie d'AVANT : PM13 échoue (motif 0,45 s). Limites de la plateforme NON contournables par une page web, non testables ici : iPhone / iPad (Safari ne prend pas en charge la vibration), écran verrouillé ou application en arrière-plan (la page est suspendue : ni son ni vibration, et le rattrapage au retour ne signale que si la fin date de moins de 5 s), Chrome Android sans toucher préalable de la page depuis son chargement, mode silencieux / « Ne pas déranger » / vibrations coupées dans les réglages du téléphone. Jamais testé sur un vrai téléphone. Instantané d'avant : `rollback/tableur.html.avant-vibration-2026-10-27`.

- [x] 27/10 (listes personnalisables : icône des titres « Ajouter » / « Existants » dans une case pastel) : `node test/e2e/catalog-titles.mjs` **6/6** (PC 1366 et téléphone 390 ; clair, sombre, pastel ; les 4 listes `resources`, `supports`, `trainTypes`, `trainPlateformes` dans la fenêtre commune `#p1-catalog-modal`) : pour chaque titre, icône 32×32 px, coins 10 px, fond teinté non transparent, titre 1 rem sans majuscules, une seule ligne, « Existants » collé à l'icône (≈ 9,6 px), compteur « n / max » à droite et centré sur la case, rien ne déborde, aucune erreur JS. Aucune règle pastel / sombre existante n'écrase la case (mesuré sur les valeurs calculées). Copie d'AVANT : 6/6 échecs (icône 11×13 px, sans coins ni fond, titres en majuscules 12,8 px). Non-régression : `catalog-custom` 14/14 (ajout, renommage, suppression/archivage), `catalog-keyboard` 7/7, `catalog-safety` 4/4, `train-catalog` 8/8. Captures : `docs/captures-15-10/catalogue-titres-*.png` (`CATSHOTS=1`). Purement visuel : ni JS ni données touchés. Instantané d'avant : `rollback/tableur.html.avant-titres-catalogues-2026-10-27`.
