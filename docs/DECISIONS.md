# P1Planner — Décisions figées

## Identité / isolation
- Nom : P1Planner.
- Repo GitHub dédié.
- Firebase / Firestore / Auth / Hosting / Functions dédiés.
- Stripe dédié.
- Aucune pollution TypixClin ↔ P1Planner.

## Stack
- HTML + CSS + JavaScript.
- Firebase / Firestore / Cloud Functions.
- Stripe.
- Première version frontend monolithique.

## Ordre frontend
1. index.html
2. auth.html
3. comptepremium.html
4. admin.html
5. mentions-legales.html
6. tableur.html

## Vocabulaire
- Spécialités → Matières.
- Items → Cours.
- Todo → Programme de la journée.

## Design
- Index/Auth/Premium/Admin/Légal : nouvelle identité très haut niveau.
- Tableur : design sensiblement proche du tableur EDN.

## Fonctions conservées
- Notes par cours.
- Flashcards.
- Cahier d'erreurs.
- Cahier d'erreurs des entraînements.
- Entraînements.
- Stats.
- Trophées.
- Planning.
- Protections sauvegarde/backups.
- Logiques Premium pertinentes.

## Tours / J
- Tours conservés, toujours saisis quel que soit le mode d'organisation choisi.
- Méthode des J = un **outil optionnel**, pas une infrastructure obligatoire. Trois modes possibles pour organiser le rythme de révision, au choix de l'utilisateur (réglage global, override possible par cours) :
  1. Méthode des J (suggestions automatiques d'échéances) ;
  2. Au feeling (pas de méthode structurée) ;
  3. Planification manuelle (l'utilisateur choisit lui-même quand revoir chaque cours selon sa propre estimation de difficulté).
- Quand la méthode des J est active : J0 = date du Tour 1, palier J *i* ↔ Tour *i+1* dû, échéances à venir/fait/en retard/reporté, remonte dans le Programme de la journée avec Faire maintenant/Reporter.
- Quand la méthode des J est inactive : le Programme de la journée est alimenté uniquement par la planification manuelle de l'utilisateur (date prévue posée à la main sur le cours), les Tours restent journalisés normalement mais sans échéance automatique.
- Presets (bases de travail, ajustables si besoin, aucune n'est scientifiquement prouvée — validé par l'utilisateur comme non-figé) :
  - Rapproché : J0 J1 J3 J5 J8 J14 J30
  - Équilibré : J0 J1 J3 J7 J14 J30
  - Espacé : J0 J3 J9 J25 J50
  - Personnalisé : liste libre.
- Programme de la journée reste le centre opérationnel, quel que soit le mode choisi.

## Planning
- Séparer type de journée et état.
- **Types validés (V1) : Cours, Révision, Repos, Vacances, Examen.** (Cours+Révisions et Entraînement retirés de la V1 pour simplifier — pourront être réintroduits plus tard si besoin.)
- États toujours calculés à partir du Programme de la journée, jamais stockés.

## Premium
- 15 jours gratuits sans CB (changé de 30 à 15 jours en session, demande explicite de l'utilisateur).
- Durée liée à la date approximative concours/examens S2, **sans marge post-concours** : l'accès du plan à durée maximale se termine à la fin du mois du concours/examen indiqué (confiance faite à l'utilisateur sur la date qu'il indique).
- **Deux façons de payer, au choix de l'utilisateur :**
  1. **Paiement unique, durée choisie** (entre 1 mois et la durée max calculée), tarif dégressif selon la durée :
     - 1 mois → **3,00 €/mois**
     - 2 à 4 mois → **2,50 €/mois**
     - 5 mois et plus → **2,25 €/mois**
     (changé de 2,50/2,25/2,00 à 3,00/2,50/2,25 en session, demande explicite de l'utilisateur.)
  2. **Abonnement récurrent mensuel**, **3,00 €/mois** (changé de 2,50 à 3,00 €/mois en session, demande explicite de l'utilisateur), sans engagement, annulable à tout moment (portail client Stripe).
- **[RÉVISÉ en session — invalide la ligne "coexistence" ci-dessous, gardée en historique] Les deux formules sont mutuellement exclusives, pas cumulables** : correction explicite de l'utilisateur, qui a constaté l'incohérence produit ("si abonnement mensuel actif, pas de prise de paiement unique possible, et inversement"). L'utilisateur doit fournir un fichier de référence (`tpxbilling`, équivalent TypixClin) pour spécifier la mécanique exacte de blocage/transition entre les deux formules avant d'implémenter la logique serveur (`createCheckoutSession`, pas encore développée) — **reçu ni lu à ce stade**. En attendant, seuls les textes utilisateur (`comptepremium.html`, `index.html`) ont été corrigés pour ne plus annoncer une coexistence ; `accessEnd = max(...)` reste la seule mécanique anti-raccourcissement documentée, à revalider une fois le fichier de référence fourni.
- ~~Coexistence fixe/récurrent : ne jamais bloquer un second achat...~~ (ancienne ligne, remplacée par la correction ci-dessus — gardée seulement pour traçabilité de la décision).
- Seuils validés (V1) : ci-dessus. Frontend jamais source de vérité (prix et durée max recalculés serveur).

## Admin
- Page dédiée.
- Autorisation serveur réelle.
- Minimisation des données privées.
- **Périmètre v1 : parité complète avec TypixClin** (choix explicite de l'utilisateur, entre "minimal" et "parité complète" proposés) — Dashboard, Utilisateurs, Abonnements (lecture entitlements/billingPrivate), Sauvegardes (recherche par UID + restauration), Feedbacks (lecture + réponse).
- **Rôle admin** : `users/{uid}.isAdmin` (booléen), sur un document déjà entièrement `allow write: if false` — jamais posable par le client. **Activation choisie : manuellement via la Console Firebase** (pas de Cloud Function dédiée pour l'instant, choix explicite de l'utilisateur — "à refaire pour chaque futur admin", accepté).
- **Restauration de sauvegarde pour un autre utilisateur = exclusivement via Cloud Function** (`adminRestoreBackup`, Admin SDK, revérifie `isAdmin` côté serveur), jamais via un assouplissement des Firestore Rules qui laisserait un client isAdmin=true écrire directement chez un autre utilisateur — cf. P0 "utilisateur A pouvant modifier les données de B". Restauration = fusion/écrasement des documents présents dans la sauvegarde uniquement (jamais de suppression de ceux créés depuis) + sauvegarde automatique de l'état courant juste avant, par sécurité.
- **Écart assumé** : le tableur n'écrit encore aucune sauvegarde automatique (fonctionnalité séparée, non construite) — l'onglet Sauvegardes d'admin.html reste honnêtement vide tant que ce n'est pas fait ; `adminCreateBackup` permet de tester le circuit manuellement en attendant.
- **Écart assumé (2)** : pas de présence "en ligne maintenant" (nécessiterait Realtime Database, non provisionné pour P1Planner, cf. isolation P0).
- **Bug découvert et corrigé au passage** : le tableur utilisait déjà une collection `feedbacks` (pluriel, champ `userId`, réponses dans `adminReplies[]`) totalement absente des Rules (qui définissaient un `feedback` singulier jamais utilisé) — tout envoi de feedback échouait silencieusement en production. Rules corrigées pour cibler la vraie collection.

## Index
- Méthode des tours + méthode des J.
- Démo réaliste.
- Présentation créateur.
- Présentation TypixClin P2→D4.
- Ne pas publier de relevés bruts ni inventer de métriques.
- **Contenu créateur validé par l'utilisateur (information explicitement vérifiée, à formuler au moment de `index.html`)** :
  - 3ème de la promotion médecine en P1, major UE2 (Biocellulaire, Histologie, Embryologie) et major UE3 (Biophysique, Physique) ;
  - 275e/~10 500 aux épreuves nationales (EDN, D4) ;
  - néo-interne d'anesthésie-réanimation à Paris.

## Auth — consentement à l'inscription
- Le checkbox de consentement à l'inscription (`auth.html`) engage l'utilisateur sur les **Conditions d'utilisation** (CGU — contrat d'usage du service), pas sur les mentions légales (informations d'identité de l'éditeur, purement déclaratives, rien à "accepter"). Choix fait en session à la demande de l'utilisateur, qui avait remarqué l'incohérence en comparant avec TypixClin.
- Affichées dans une **modale** (pas une navigation vers une page séparée), avec bouton « J'accepte » qui coche le consentement et ferme la modale — reproduit le comportement de la modale CGU de TypixClin (`auth.html`), avec un contenu propre à P1Planner (essai 15 jours, barème Premium à jour, etc.).

## TypixClin
- URL publique confirmée par l'utilisateur : **https://typixclin.fr/index.html** — lien ajouté dans la section TypixClin d'`index.html`.

## Parrainage (2026-09-25)
- **Grille de paliers : identique à TypixClin** — 3 filleuls actifs → 1 mois offert ; 6 → 3 mois au total (plafond dur,
  jamais plus au-delà de 6). Décision explicite de l'utilisateur (option recommandée retenue).
- **Chemin Stripe récurrent (décalage de `trial_end`) construit dès maintenant**, bien que non testable en conditions
  réelles tant que le projet Stripe P1Planner n'existe pas (secrets absents) — décision explicite de l'utilisateur
  (option recommandée retenue). Couvert par un Stripe simulé dans les tests (voir `docs/QA.md`).
- **Code invalide à l'inscription : blocage strict** du bouton "Créer un compte" (pas de pop-up de confirmation qui
  laisserait continuer sans code) — décision explicite de l'utilisateur (option recommandée retenue).
- **Emplacement des champs** (schéma différent de TypixClin, qui n'a qu'un seul `users/{uid}`) : `users/{uid}.referralCode`
  (identité/profil, n'affecte aucun droit d'accès) ; `entitlements/{uid}.referralActiveCount`/`.referralMonthsGranted`
  (bookkeeping de récompense, écrit dans la MÊME transaction que `writeAccessUntil`/`premiumUntil`/`trialEndsAt` qu'il
  étend — nécessaire pour éliminer le risque de double-crédit, voir piège n°1 ci-dessous).
- **Adaptation du piège n°2 TypixClin** ("`status:'active'` = accès illimité sans date, ne jamais l'utiliser pour un
  bonus") : ne s'applique pas tel quel à P1Planner — `canWrite()` dans `firestore.rules` ne regarde **jamais** `status`,
  uniquement `writeAccessUntil` (vérifié en relisant les Rules avant de coder, comme demandé). Le vrai piège ici est
  ailleurs : `status`/`trialEndsAt` pilotent l'AFFICHAGE (`comptepremium.html`) et le balayage quotidien
  (`sweepExpiredTrials`) — sans les garder cohérents avec la nouvelle date réelle, un essai prolongé par le parrainage
  se serait vu basculer à tort en `'expired'` à l'ancienne date. Voir le détail (3 cas : essai / formule payée / expiré)
  dans le commentaire de `computeReferralCredit()` (`functions/referral.js`).
- **Point à confirmer par l'utilisateur (jugement pris par défaut, pas explicitement demandé dans le prompt d'origine)** :
  un parrain totalement EXPIRÉ (plus aucun accès en cours, essai ou payé) qui franchit un palier reçoit un accès autonome
  de `delta` mois à partir de maintenant, et son statut repasse `'active'` — plutôt que de laisser le bonus sans effet
  visible tant qu'il ne se réabonne pas. Comportement choisi par cohérence avec "le bonus s'ajoute à ce que le parrain a
  déjà" (rien à partir de zéro → le bonus devient l'accès), mais jamais discuté explicitement avec l'utilisateur.

## Décisions encore ouvertes
Toutes les décisions bloquantes pour l'architecture ont été validées par l'utilisateur (voir sections Premium, Tours/J, Planning, Index ci-dessus). Reste ouvert uniquement, au moment de la rédaction effective d'`index.html` :
- la formulation exacte (ton, longueur) de la section créateur à partir des faits validés ci-dessus.

### Parrainage — décisions de Jean du 2026-09-26 (toutes tranchées, ne rien redemander)
- **Échec réseau/serveur du contrôle de code à l'inscription : NON BLOQUANT.** Trois verdicts : `true` (valide ou champ vide),
  `false` (confirmé inconnu par le serveur, ou longueur ≠ 6 → bloque), `null` (contrôle injoignable → état neutre, aucun message
  d'erreur, l'inscription continue, le code part quand même à `referralInit` qui ignore un code invalide sans jamais échouer).
- **Notification « nouveau filleul » : OUI** (à l'écran + pastille rouge), avec « Prénom Nom » du filleul ; texte de transparence
  obligatoire (« Ton prénom et ton nom seront communiqués à la personne qui te parraine. »).
- **Tuile « Filleuls actifs » cliquable → liste (nom + code, « Copier ») : OUI** (permet la saisie « réciproque »).
- **Vocabulaire** : « filleul(s) actif(s) », « mois offerts » ; voix P1 = tutoiement.
- **Lien de partage : https://p1planner.fr/auth.html?ref=CODE — CONFIRMÉ.**
- **Parrain expiré : OUI**, accès autonome de `delta` mois à partir de maintenant (statut `active`) ⇒ **retour à `expired` obligatoire à la fin
  du bonus, y compris pour un ex-abonné mensuel** : `planType` neutre `'referral'` posé dans ce cas, et `sweepExpiredTrials` bascule les
  `'referral'` échus (comme les `'onetime'`) ; tout paiement réel réécrit `planType` (webhook). Les droits réels (`canWrite` ne lit que
  `writeAccessUntil`) ne sont jamais touchés par le balayage.
- **Code de parrainage visible dans le menu profil du tableur : OUI.**
- **Bonus impossible à appliquer automatiquement → journal, jamais d'erreur pour le filleul** : abonnement mensuel déjà résilié
  (`cancelAtPeriodEnd`) ou prélèvement en échec (`payment_issue`) → aucune date écrite, `billingConflicts/referral_<uid>_<ts>`
  (`reason: referral_bonus_subscription_cancelling | referral_bonus_payment_issue`, `monthsDue`, `stripeSubscriptionId`) écrit dans la même
  transaction ; échec de l'appel Stripe (abonnement introuvable, réseau) → `reason: referral_stripe_sync_failed` + message tronqué (300 car.).
  Le compteur et `referralMonthsGranted` restent écrits (rattrapage manuel depuis le journal).
- **Nouveaux champs backend-only** (aucune règle à changer : `users` et `entitlements` sont déjà `write:false`) : `entitlements/{uid}.referralSeenCount`
  (accusé de la notification, écrit par le callable `referralMarkSeen`, sans paramètre), `referrals/{uid}.filleulName`.
- **Nouveaux callables** : `referralMarkSeen`, `referralListReferrals` (uid du jeton, aucun paramètre, jamais d'uid ni d'e-mail en sortie).
- **Textes légaux « Programme de parrainage »** (CGU d'auth.html, CGV de comptepremium.html, mentions légales) : rédigés dans la voix de P1,
  **À FAIRE VALIDER par Jean avant de les figer**.

### Parrainage — audit sécurité/facturation (2026-09-27)
- **F1 corrigé** : `handleOneTimePurchase` ne baisse plus `writeAccessUntil` (un essai prolongé par le parrainage, ex. +90 j, était RACCOURCI par un achat d'1 mois). 
- **F2 corrigé** : `checkPurchaseConflict` traite un accès offert (`planType 'referral'`, `premiumUntil` futur) comme un accès unique valide : ni paiement unique (payé sans bénéfice) ni abonnement mensuel (écraserait les mois offerts) tant qu'il dure.
- **F3 ajouté (anti-fraude)** : une même boîte mail (alias `+tag`, points Gmail, `googlemail.com`) ne compte qu'une fois : filleul = boîte du parrain, ou boîte d'un autre filleul déjà compté du même parrain → non compté (`referrals.blocked`), clé SHA-256 stockée (`emailKey`), jamais d'adresse en clair. Limite assumée : deux vraies boîtes distinctes ne sont pas détectées.
- Export de test `fns.__test` uniquement si `P1_TEST_EXPORTS=1` (jamais en production).

## Tableau des cours sur tablette / placeholders téléphone (2026-09-27)
- **Tableau des items sur tablette = taille naturelle + défilement horizontal** (481 → 1100 px) : les règles qui comprimaient le tableau à l'écran (cases 19×17 / 28×26, dates 28 px, `min-width: 800px`) sont supprimées ; `#page-items .items-table { width: max-content }` ; `.items-container` défile. Parité avec le produit frère (retour de Jean sur iPad). Bureau (> 1100 px) et réglage téléphone (≤ 480 px : cases 26×24) inchangés.
- **Placeholders ≤ 480 px alignés** : `.tour-duration.ti-placeholder` / `.tour-support.ti-placeholder` reprennent la taille du contenu réel (0.5rem, padding 0 3px) : leurs règles globales (2 classes) gardaient 0.6rem → case plus haute → date décalée de 7,1 px (« vague »). CSS uniquement, aucune donnée concernée.

## Recherche : anti-autofill navigateur (2026-09-27)
- **Bug porté (déjà connu de TypixClin)** : le navigateur proposait l'adresse mail de l'utilisateur comme suggestion
  d'autocomplete sur la barre "Mes cours" (`#search-item`), et pouvait la remplir automatiquement. Seule `#search-specialty`
  (Mes matières) avait déjà le correctif `readonly` + déverrouillage au premier geste. **Généralisé aux 3 barres**
  (`search-specialty`, `search-item`, `search-train`) via une fonction unique `_p1PreventSearchAutofill(id)` : `readonly`
  au chargement + à chaque `pageshow` (retour arrière/avant du navigateur), déverrouillé au premier `pointerdown`/`keydown`
  réel de l'utilisateur — aucune saisie manuelle bloquée, seul l'autofill silencieux du navigateur est empêché.

## Ressources / supports personnalisables (2026-09-27)
Demande explicite : les 3 ressources (Annale/Tutorat/Prépa) et les 4 supports de tour (QCM/Fiche de cours/Conf/Fiche perso)
étaient figés. Rendus **entièrement personnalisables** par l'utilisateur (ajout, renommage, recoloration, suppression —
y compris des valeurs d'origine), un seul gestionnaire générique (`#p1-catalog-modal`, `_p1CatalogState.kind`) pour les
deux catalogues.
- **Plafond = TOTAL du catalogue, pas seulement des ajouts** : `MAX_CUSTOM_RESOURCES`/`MAX_CUSTOM_SUPPORTS` = 6 chacun
  (ex. utilisateur cité par Jean). Interprétation retenue faute de précision : "une limite, par exemple, de 6" lu comme
  un plafond simple et unique par catalogue, plus facile à comprendre pour l'utilisateur qu'un compteur "défauts + ajouts".
- **Jamais de catalogue vide** : suppression bloquée sur le dernier élément restant (bouton désactivé ET garde côté JS) —
  un catalogue vide romprait la sélection de ressources affichées et le choix de support du modal de tour.
- **Persistance** : `users/{uid}/settings/preferences.customResources` / `.customSupports` (tableau `{id,label,color}`
  complet, pas un delta) — même document que `selectedResources`/`toursViewMode`/`confidenceScale`, déjà backend-only
  vis-à-vis des autres utilisateurs via `canWrite(uid)`, aucune Rule à modifier. Rechargé une fois après connexion
  (`_checkSelectedResources`), pas de `onSnapshot` temps réel (aucune des autres préférences de ce document n'en a).
- **Une donnée déjà enregistrée ne disparaît JAMAIS** si sa ressource/son support est ensuite supprimé du catalogue :
  `p1ResolveResourceMeta`/`p1ResolveSupportMeta` retombent sur un repli neutre gris (ressources) ou sur
  `LEGACY_SUPPORT_META` pour les 3 anciennes valeurs historiques retirées du sélecteur (college/anki/codex) ou un repli
  générique sinon (supports) — seul le style visuel change, jamais la donnée `courses/{fc}.resources.<id>` /
  `tourSupports[i]`.
- **XSS** : un libellé est saisi librement par l'utilisateur (contrairement aux anciens libellés figés) — borné à 12
  caractères (`MAX_CATALOG_LABEL`) et systématiquement échappé (`window._p1EscapeHtml`) à l'affichage ; la couleur vient
  d'un `<input type="color">` natif (toujours `#rrggbb` valide) ou est validée par regex avant tout enregistrement
  (`p1SanitizeCatalogEntry`).
- **Bug corrigé au passage (remonté par Jean)** : le bouton "···" (ressources en overflow) restait cliquable même sans
  aucune ressource au-delà des 3 affichées, ouvrant un popup vide. Le bouton n'est désormais rendu QUE s'il y a
  effectivement une ressource en overflow (garde également côté gestionnaire de clic, en défense).

### Révision après retour de Jean sur la 1ʳᵉ version (2026-09-27, même jour)
Captures à l'appui, 5 points corrigés :
- **Défauts PROTÉGÉS, pas librement supprimables** : contredit la 1ʳᵉ version ("y compris des valeurs d'origine"
  ci-dessus, abandonné). Annale/Tutorat/Prépa et QCM/Fiche de cours/Conf/Fiche perso sont désormais TOUJOURS présents et
  jamais supprimables (cadenas dans l'UI, garde-fou aussi côté JS `_p1CatalogIsProtected`) — seuls leur nom/couleur/
  acronyme restent personnalisables. `p1ApplyCustomCatalog` les réinjecte systématiquement en tête de liste au
  chargement, quoi qu'il y ait en base. Plafonds inchangés en valeur (`MAX_CUSTOM_RESOURCES=6`) mais reformulés en
  sémantique : ressources = 3 défauts + 3 ajouts max ; supports = 4 défauts + 3 ajouts max, donc
  **`MAX_CUSTOM_SUPPORTS` passe de 6 à 7**.
- **Sélecteur de couleur natif (`<input type="color">`, réglage RGB fin) remplacé par une palette restreinte** de 12
  pastilles (`P1_CATALOG_PALETTE`, mêmes valeurs que le nuancier `PALETTE` déjà utilisé pour les matières — cohérence
  visuelle, pas de nouvelle palette inventée), rendues avec les classes génériques `.tpx-swatches`/`.tpx-swatch` déjà
  stylées ailleurs dans l'app. Sur une ligne existante, le nuancier s'ouvre/se ferme comme un menu déroulant (une seule
  ligne ouverte à la fois) plutôt que d'afficher 12 pastilles sous CHAQUE ligne en permanence.
- **Acronyme des supports choisi par l'utilisateur** (`abbr`, 3 lettres, champ dédié à l'ajout ET modifiable sur chaque
  ligne existante), affiché sur le badge du tour détaillé — remplace la déduction automatique depuis le nom
  (`p1SupportAbbr`, gardée uniquement comme suggestion par défaut / repli pour une valeur historique ou inconnue). Les
  4 défauts reprennent leurs acronymes historiques exacts (QCM/CRS/CNF/PER) au lieu d'une déduction automatique erronée
  du nom complet — **bug réel introduit par la 1ʳᵉ version et corrigé ici** ("Fiche de cours" aurait donné "FIC",
  identique à "Fiche perso").
- **Modal "Gérer mes ressources/supports" repensé** : deux sections visuellement distinctes (carte "Ajouter" teintée en
  haut, liste "Existants" séparée en dessous avec son propre compteur x/N) au lieu d'une seule liste continue avec une
  ligne d'ajout au milieu — jugée "abominable"/peu claire dans la 1ʳᵉ version.
- **Pastille de couleur retirée des boutons Support du modal de tour** : ajoutée dans la 1ʳᵉ version faute d'icône
  FontAwesome pertinente pour un support personnalisé, jugée "pas indispensable" et de toute façon invisible une fois
  le bouton sélectionné (fond plein de la même couleur). Les boutons redeviennent du texte simple sur fond/bordure
  colorés (`--support-color`), pour tous les supports (défauts ET personnalisés).
- **Bug réel trouvé à la vérification visuelle de CETTE révision, corrigé avant tout déploiement** : le plafond de
  longueur `MAX_CATALOG_LABEL` (12 caractères, pensé pour une saisie utilisateur) était aussi appliqué aux libellés
  PAR DÉFAUT lors du chargement (`p1ApplyCustomCatalog` repassait systématiquement les défauts par le même
  sanitizer) — "Fiche de cours" (14 caractères) s'affichait tronqué en "Fiche de cours" → "Fiche de cou". Corrigé :
  un défaut non modifié par l'utilisateur est repris tel quel, jamais retronqué ; seule une valeur réellement
  personnalisée passe par le plafond.
- **Autofill navigateur sur les champs "Nom"/"Acronyme" du gestionnaire** (capture à l'appui : Chrome/Edge proposait les
  mots de passe enregistrés du site, avec parfois une valeur injectée automatiquement) : même parade que les barres de
  recherche (`readonly` + déverrouillage au premier geste réel), plus `autocomplete="off"` et les attributs "ignore" des
  principaux gestionnaires tiers (LastPass/1Password/Bitwarden/ProtonPass) sur chaque champ concerné. Non vérifiable
  automatiquement en local (aucun mot de passe enregistré dans les profils de test/l'émulateur) — vérifié que la parade
  structurelle (lecture seule levée au premier `pointerdown` réel) fonctionne bien, comme pour les barres de recherche
  déjà en production.

## Audit sécurité/comportement — catalogue personnalisable (2026-09-27, demande explicite de Jean)
Portée : données utilisateur (accès croisé, validation) + comportement quand un tour référence un support supprimé.
Rien trouvé côté isolation/accès croisé (voir Rules ci-dessous) ; 1 faille XSS mineure et 1 bug de comportement réels
trouvés et corrigés, plus une régression de la parade autofill (round 2, confirmée par capture d'écran de Jean).

- **Isolation / accès croisé : AUCUN nouveau risque.** `users/{uid}/settings/preferences` (où vivent
  `customResources`/`customSupports`) est gouverné par `isSelfVerified(uid)` en lecture et `canWrite(uid)` en écriture —
  toujours l'uid du jeton d'authentification, jamais un uid transmis par le client ; un utilisateur ne peut ni lire ni
  écrire les préférences d'un autre. `canWrite(uid)` exige en plus un accès actif (`writeAccessUntil` futur) : un compte
  totalement expiré (lecture seule) ne peut pas modifier son catalogue, cohérent avec le reste de l'app. Aucun champ de
  ce document n'est lu par la logique Premium/admin/paiement — customResources/customSupports sont de purs réglages
  d'affichage, sans valeur de privilège. Aucune Rule à modifier.
- **Défense en profondeur déjà en place, vérifiée** : même sans validation de schéma côté Rules (comme le reste de ce
  document, aucun champ n'y est schema-validé), `p1ApplyCustomCatalog` RE-sanitize chaque entrée AU CHARGEMENT
  (longueur, couleur hexadécimale, acronyme alphanumérique 3 lettres) et replafonne le nombre d'entrées actives — une
  donnée corrompue ou modifiée à la main (console navigateur, écriture Firestore directe) est neutralisée dès le
  rechargement suivant, jamais propagée à un autre utilisateur (toujours confinée à `users/{uid}` du même uid).
- **Faille XSS trouvée et corrigée** : `renderResourcesOptions()` (liste des ressources dans "Configurer les
  ressources") affichait `res.label` sans échappement (`<span class="resource-option-name">${res.label}</span>`) —
  seul point manqué, tous les autres sites de rendu (case du tableau, popup de dépassement, gestionnaire de catalogue,
  badge de support) étaient déjà échappés via `window._p1EscapeHtml`. Portée réelle limitée par le plafond de longueur
  du libellé, mais corrigé pour cohérence et défense en profondeur — un self-XSS reste un vrai risque si jamais ce
  plafond est un jour relevé sans qu'on se souvienne de ce point.
- **Comportement — support supprimé alors que des tours l'utilisent (cas explicitement demandé par Jean), bug réel
  trouvé et corrigé** : une suppression retirait jusqu'ici DÉFINITIVEMENT l'entrée du tableau sauvegardé, si bien
  qu'un tour déjà enregistré avec ce support retombait sur un repli générique gris avec un texte illisible dérivé de
  l'id interne (ex. "C1J") — aucune perte de donnée réelle (le `tourSupports[i]` original restait intact), mais une
  apparence de corruption. **Suppression = ARCHIVAGE désormais** (`archived: true`, même principe que `archivedAt` sur
  les matières/cours ailleurs dans ce fichier, jamais de suppression dure) : l'entrée disparaît des sélecteurs et ne
  compte plus dans le plafond, mais `p1ResolveResourceMeta`/`p1ResolveSupportMeta` continuent de retrouver son vrai
  nom/sa vraie couleur/son acronyme pour l'historique. Vérifié par un scénario dédié bout-en-bout (ajout → assignation
  à un vrai tour → suppression → re-vérification de l'affichage, de l'absence d'erreur JS, de la non-altération de la
  donnée Firestore, et de la persistance après reload).
- **Régression de la parade autofill round 1, confirmée par capture d'écran de Jean** : Edge proposait quand même
  "Enregistrer votre mot de passe ?" (couple nom/acronyme inventé) après l'ajout d'un support — les attributs
  `autocomplete="off"`/"ignore" (round 1) ne suffisaient pas. Cause identifiée : Chrome/Edge détecte un schéma
  "formulaire d'identification" dès que 2 `<input type="text">` se suivent dans le DOM, indépendamment de leur
  nom/label — uniquement reproductible sur les SUPPORTS (Nom + Acronyme adjacents), jamais sur les ressources (un seul
  champ texte). Corrigé en remplaçant ces 2 champs (partout : ajout ET chaque ligne existante) par de VRAIS
  `<textarea rows="1">` déguisés en champ mono-ligne (CSS `resize:none;overflow:hidden;white-space:nowrap`) — jamais
  candidats à cette heuristique, quel que soit leur nombre/ordre. Comportement (value/onchange/maxlength/readonly)
  strictement identique pour l'utilisateur. Vérifié par un test dédié (aucun `input[type="text"]` restant dans le
  gestionnaire).
- **Bug de mise en page trouvé et corrigé (remonté par Jean)** : le modal du gestionnaire n'avait pas de hauteur
  plafonnée (`.resources-config-content`), si bien qu'avec 6-7 entrées + la carte "Ajouter" le contenu dépassait
  l'écran par le bas sans que le défilement interne (prévu, mais jamais activé faute de hauteur de référence) ne
  fonctionne. Plafonné à `85vh`, ce qui active enfin le VRAI défilement de `.resources-config-body`. Retiré au passage
  le second défilement imbriqué de `.p1-catalog-list` (max-height 40vh) qui rendait la navigation confuse — un seul
  défilement pour tout le contenu du modal désormais. Vérifié par un test mesurant la hauteur réelle de la boîte, la
  présence effective d'un défilement, et l'atteignabilité de la dernière ligne du catalogue.

## Types et plateformes d'entraînement personnalisables + 3 corrections (2026-09-28/29, demande explicite)
Étend le catalogue personnalisable (voir section précédente) aux entraînements : **Type** (Concours blanc/Annale/Colle,
3 défauts protégés + 3 ajouts max = 6) et **Plateforme** (Prépa/Tutorat, 2 défauts protégés + 3 ajouts max = 5 —
Hypocampus/UNESS restent des valeurs internes gardées uniquement en repli pour d'anciens entraînements, jamais
proposées à la création depuis un retour utilisateur antérieur). Même mécanique exacte que ressources/supports :
archivage à la suppression, palette restreinte, gestionnaire réutilisé (`_p1CatalogState.kind` étendu à `'trainTypes'`/
`'trainPlateformes'`, table `P1_CATALOG_CONFIG` plutôt qu'une branche par catalogue). Icônes "Gérer" ajoutées à côté de
Type/Plateforme dans le modal "Ajouter un entraînement" (comme Support dans le modal de tour).
- **Bug réel de portée trouvé et corrigé pendant l'implémentation** : `p1ResolveTrainTypeMeta`/`p1ResolveTrainPlateformeMeta`/
  `p1HexToRgb`/`p1TrainBtnStyle`/`p1TrainBadgeStyle` sont définis dans le `<script type="module">` (avec le reste du
  catalogue) ; la logique des entraînements (`_trainModalUpdateCtx`, `renderTrainTable`, `_openTrainNotes`, le Proxy
  `TRAIN_TYPE_LABELS`/`TRAIN_PLAT_LABELS`) vit elle dans un `<script>` CLASSIQUE séparé — une référence "bare" à ces
  noms y échoue silencieusement (`ReferenceError` avalé par le gestionnaire de clic), laissant badges et carte
  contexte vides sans aucune erreur visible. Corrigé en exposant ces fonctions sur `window` (un script classique
  partage le scope global `window` avec tous les autres scripts classiques, module ou non — une fois exposée là, la
  référence bare résout normalement, aucun site d'appel à modifier). Pour les tableaux vivants (`AVAILABLE_TRAIN_TYPES`/
  `PLATEFORMES`, réassignés à chaque chargement), les getters déjà exposés (`window._p1GetAvailableTrainTypes/…`) sont
  capturés en variables locales de même nom en tête de fonction plutôt qu'une copie figée. Trouvé par un test réel
  (carte contexte vide au lieu du nom attendu), pas par relecture — leçon retenue pour toute future extension de ce
  catalogue à un script classique.
- **`TRAIN_TYPE_LABELS`/`TRAIN_PLAT_LABELS` transformés en `Proxy`** plutôt que remplacés par des appels explicites à
  chacun des 8+ sites d'usage existants (`TRAIN_TYPE_LABELS[id]`) : le `get` du Proxy résout via
  `p1ResolveTrainTypeMeta`/`p1ResolveTrainPlateformeMeta`, aucun site d'appel à toucher. Sûr ici car aucun de ces sites
  n'énumère l'objet (`Object.keys`/`for…in`), vérifié explicitement avant de choisir cette solution.
- **Bug remonté par Jean, corrigé** : le modal du gestionnaire de catalogue (`#p1-catalog-modal`) disparaissait sans
  transition (`classList.remove('active')` direct), alors que `.modal.closing`/`.modal-content` animent déjà
  `modalOverlayOut`/`modalContentOut` en CSS générique — jamais utilisé ici. Corrigé en reprenant le séquencement en 2
  temps déjà en place pour `closeResourcesConfigModal()` (ajoute `.closing`, attend 180 ms, puis retire les deux
  classes).
- **Bug remonté par Jean, corrigé** : le champ "Support" du modal de tour était un `<label>` contenant le bouton
  "Gérer les supports" — un `<label>` qui contient un élément interactif lui transfère nativement le clic ET le
  survol depuis N'IMPORTE OÙ dans le label (spécification HTML), donnant l'impression que toute la ligne était le
  bouton. Remplacé par un `<div>` (même classe CSS `.modal-label`, rendu identique) ; même correctif appliqué
  préventivement aux nouveaux champs Type/Plateforme du modal d'entraînement.
- **Bug remonté par Jean (capture à l'appui), corrigé** : après validation d'un tour en mode détaillé, la réapparition
  de la scrollbar (fin du verrou de défilement partagé, `_ednScrollLock('tourSuccessAnim')`) fait dévier légèrement
  vers la gauche l'icône check de `#tour-success-overlay` — cet overlay est `position:fixed;inset:0` (100 % du
  viewport RÉEL), dont la largeur change de la largeur de la scrollbar quand elle apparaît/disparaît, alors que le
  check est centré par flexbox DANS cette boîte. Corrigé en figeant `width`/`height` en pixels (valeur du viewport
  AVANT que le verrou ne change quoi que ce soit) à l'affichage, retirés au masquage complet — le centrage reste
  stable quoi qu'il arrive à la scrollbar entre-temps. Correctif scopé à ce seul overlay, aucun changement au système
  de verrou de défilement partagé (fragile, plusieurs sessions de mise au point derrière lui).
- Non vérifiable visuellement en local (Chrome headless sans barre de défilement native visible dans cet
  environnement) : la fonction a été vérifiée directement (figeage/libération corrects des dimensions), mais pas le
  glissement visuel lui-même. À confirmer avec Jean après déploiement.

## Types/plateformes d'entraînement : liste non rafraîchie + prompt mot de passe (2026-09-29, retour de Jean)

Deux bugs distincts remontés par Jean (captures/description à l'appui) après le déploiement précédent, tous deux
audités par lecture directe du code puis reproduits par un vrai test avant correctif.

- **Bug réel trouvé : `_p1CatalogAfterChange()` n'était qu'un if/else à 2 branches (`supports` vs "tout le reste"),**
  écrit à l'origine seulement pour ressources/supports et jamais étendu quand `trainTypes`/`trainPlateformes` ont été
  ajoutés. Ces deux catalogues tombaient donc dans la branche "resources" (inoffensive mais inutile pour eux) et
  **aucun `_p1RefreshTrainTypeButtons`/`_p1RefreshTrainPlateformeButtons`/`_p1RefreshTrainFilterDropdowns` n'était
  jamais appelé** après un ajout/suppression/renommage. Conséquence concrète : si le modal "Ajouter un entraînement"
  était déjà ouvert au moment d'ajouter un type/une plateforme via le crayon "Gérer", sa liste de boutons restait
  figée sur l'ancien catalogue tant qu'on ne fermait/rouvrait pas le modal — exactement le symptôme décrit ("l'ajout
  n'est pas directement mis sur la liste disponible"). `openAddTrainModal()` rafraîchit, lui, à l'ouverture, d'où le
  fait que le test TT3 existant (qui ferme puis rouvre le modal) ne l'avait pas détecté. Corrigé en un vrai `switch`
  par `kind` (`resources`/`supports`/`trainTypes`/`trainPlateformes`), chacun appelant son propre refresh, plus le
  filtre déroulant de la page Entraînements pour les deux catalogues d'entraînement (absent même de la branche
  `supports` d'origine, ajouté ici). Reproduit puis vérifié par un vrai test (`TT7`, catalogue déjà ouvert en
  arrière-plan pendant l'ajout, aucun reload) avant et après le correctif.
- **Bug réel trouvé : prompt navigateur « Enregistrer votre mot de passe ? » sur un simple champ Nom de type/**
  **plateforme, capture à l'appui (identifiant = le texte tapé, mot de passe = valeur inventée).** La parade
  textarea (voir section "Ressources / supports personnalisables" plus haut) protège contre l'heuristique "2 champs
  `<input type=text>` adjacents", mais ce cas est différent : lecture directe de `tableur.html` confirme qu'**aucune
  balise `<form>` n'existe nulle part dans tout le fichier**. Sans frontière de formulaire, Chrome/Edge regroupent
  TOUS les champs texte/mot de passe de la page en un seul "formulaire virtuel" (heuristique "unowned form"),
  indépendamment de la distance réelle dans le DOM — le champ Nom du catalogue (n'importe où sur la page) se
  retrouvait donc associé aux VRAIS champs mot de passe du compte (`#acc-pwd`, `#acc-pwd-cur`, `#acc-pwd-new`,
  `#acc-pwd-new2`, dans la carte "Mon compte" des réglages), d'où le prompt d'enregistrement ET les suggestions
  d'identifiants au focus signalées par Jean. Corrigé en transformant les deux blocs `<div class="acc-sub">`
  contenant ces champs (`#acc-mail-sub`, `#acc-pwd-sub`) en vraies balises `<form>` (même classe/id conservés, donc
  aucun changement CSS/JS ailleurs — tout référence par classe ou `getElementById`) : une balise `<form>` sert de
  frontière pour cette heuristique, isolant les champs mot de passe légitimes de tout le reste de la page.
  `onsubmit="return false"` ajouté par sécurité (aucun bouton `type=submit` dans ces blocs, la sauvegarde est gérée
  en JS via des boutons `type=button`, mais on évite tout rechargement de page si Entrée déclenchait malgré tout une
  soumission implicite). Vérifié structurellement par un vrai test (`TT8` : les deux blocs sont bien des `<form>`,
  le champ du catalogue n'est dans aucun `<form>`, une soumission simulée ne navigue pas).
- Non vérifiable en conditions réelles dans cet environnement (pas de mot de passe réellement enregistré dans le
  profil de test, donc pas de vrai prompt Chrome/Edge à observer) : la frontière `<form>` est le correctif documenté
  standard pour ce comportement, vérifiée structurellement, mais l'absence effective du prompt reste à confirmer par
  Jean après déploiement, comme pour la parade textarea de la section précédente.

## Animation de suppression discrète — ressources/supports/types/plateformes, gestionnaire, entraînements (2026-09-29, demande explicite de Jean)

"Ajoute une animation discrète lors de la suppression d'un support, d'une ressource, d'une plateforme .... aussi
bien pour la liste des items que pour la liste des entraînements." Nouveau helper partagé `window.p1FadeOutRow(el,
done, ms)` ([tableur.html](../public/tableur.html), juste avant `p1HexToRgb`) : ajoute la classe `.p1-row-fade-out`
(fondu d'opacité pur, 200ms, `!important`, jamais de transform/hauteur pour rester valide aussi bien sur un `<tr>`
que sur un `<div>` sans perturber leur mise en page) puis appelle `done` après le délai. Appliqué à 3 endroits :
- **Gestionnaire de catalogue** (`_p1CatalogDelete`) : la donnée est archivée/sauvegardée immédiatement (aucun
  risque si le modal est refermé avant la fin du fondu), seul le RE-RENDU visuel de la liste est retardé.
- **Tableau des entraînements** (`trainConfirmDelete`) : la ligne `<tr>` est identifiée via un nouvel attribut
  `tr.dataset.trainId`.
- **Gestionnaire "Mes matières/cours/SDD"** (`renderManagerList` dans l'IIFE `TPXPerso`).

**Deux bugs réels trouvés PENDANT l'implémentation (pas en relecture), tous deux via de vrais tests avant/après :**

1. **Course avec le listener Firestore réactif (entraînements et items).** Retarder uniquement l'appel à
   `renderTrainTable()`/`renderManager()` ne suffisait pas : `saveTrainings()`/`deleteItem()` écrivent sur
   Firestore, et le listener `onSnapshot` déjà branché (`p1StartTrainingsListener` sur `trainingItems`,
   `startListener('courses')` dans l'IIFE `TPXPerso`) réagit à l'écriture LOCALE optimiste quasi instantanément
   (bien avant le `setTimeout` de 200ms de l'animation) en appelant SON PROPRE `renderTrainTable()`/`rerender()` —
   la ligne disparaissait donc d'un coup malgré l'animation, qui n'avait servi à rien. Trouvé par les tests D2/D3 de
   `test/e2e/delete-animation.mjs` (elapsedMs mesuré dans le MÊME tick que le clic, avant même la fin du
   `page.evaluate()`). Corrigé en retardant L'ÉCRITURE FIRESTORE ELLE-MÊME jusqu'après le fondu (pas seulement le
   rendu) : `saveTrainings()`/`deleteItem()` s'exécutent désormais À L'INTÉRIEUR du callback de
   `window.p1FadeOutRow`, jamais avant.
2. **`buildModal()` (IIFE `TPXPerso`) n'accepte qu'UN SEUL overlay à la fois** (id fixe `#tpx-modal-overlay`,
   supprimé et recréé à chaque appel) — un vrai bug PRÉEXISTANT, sans lien direct avec l'animation, mais qui la
   rendait impossible à observer et casse une vraie fonctionnalité : ouvrir la boîte "Archiver ce cours ?"
   (`confirmModal`, qui appelle aussi `buildModal`) depuis le gestionnaire "Gérer mon programme" DÉTRUISAIT déjà ce
   gestionnaire au moment même du clic sur la corbeille, avant toute confirmation. `renderManager(root, m)` après
   coup opérait alors sur un DOM déjà détaché du document (aucun effet visible), et **le gestionnaire ne
   réapparaissait plus JAMAIS après confirmation** — l'utilisateur se retrouvait sans aucun modal. Vérifié
   empiriquement avec l'ancien code (avant tout correctif d'animation) : `overlayExists: false` ~600ms après
   confirmation. Corrigé en ROUVRANT explicitement le gestionnaire (`openManager(mgrTab)`, léger délai ~220ms pour
   laisser la confirmation terminer son propre fondu de sortie) au lieu de réutiliser `root`/`m` — pour cette seule
   liste, l'animation "discrète" prend donc la forme d'une transition fondu-sortie/fondu-entrée au niveau du modal
   plutôt qu'un fondu ligne par ligne (contrainte de l'architecture à un seul overlay, pas un choix), mais corrige
   au passage un vrai bug fonctionnel plus grave que l'absence d'animation.

**Tests réels** (`test/e2e/delete-animation.mjs`, nouveau) : D1 (catalogue, support) — la ligne reste visible avec
`.p1-row-fade-out` juste après le clic, disparaît après le délai, compte correct. D2 (entraînements) — même
vérification sur `<tr data-train-id>`. D3 (gestionnaire "Mes cours", mode personnalisé) — crée une vraie matière +
un vrai cours via les formulaires réels, supprime via le gestionnaire, vérifie que le modal RÉAPPARAÎT (régression
du bug ci-dessus) avec la liste à jour. **3/3.** Non-régression : `catalog-custom.mjs` 14/14, `train-catalog.mjs`
8/8, `battery.mjs` 18/19 + 1 échec connu (P2, flaky préexistant, sans rapport), `npm run test:rules` 40/40 — dont
`E3` (suppression pendant réseau lent + 2e action rapide), scénario le plus sensible au changement de timing de
`saveTrainings()`, toujours vert.

## Audit « protection des données » — sauvegardes, restauration, pertes hors ligne (2026-09-30, demande explicite de Jean)

Mission complète (voir le prompt collé en session) : D1 (aucune sauvegarde automatique), D2 (sauvegardes
incomplètes), D3 (notes retirées si volumineuses), D4 (Rules trop larges sur `backups`), D5 (restauration
« remplace » sans mode « compléter »), D6 (restauration ne protège que `courses`), D7 (cache Firestore mémoire,
jamais persistant), D8 (tours/rappels J non durables hors ligne), D9 (compteur d'écritures non confirmées
incomplet), D10 (`deletedDefaultIds` jamais réellement persisté), D11 (`showCustomAlert` n'acceptait qu'un objet),
D12 (recherche bloquée après un retour bfcache). **Tous corrigés, testés réellement, sensibilité vérifiée pour
chaque nouveau test (mutants ou copie « avant » du code).**

**Fichiers modifiés :** `public/tableur.html`, `public/admin.html`, `functions/index.js`, `firestore.rules`,
`firestore.indexes.json`, `test/e2e/data-durability.mjs` (nouveau), `test/backups.test.mjs` (nouveau),
`test/e2e/mutants.mjs`, `test/e2e/referral-ui.mjs`, `test/e2e/battery.mjs`, `test/e2e/env-e2e.mjs`,
`test/e2e/lib.mjs`, `test/e2e/e2e-server.mjs`, `test/e2e/flaky-proxy.mjs`, `test/lib/referral-harness.mjs`,
`test/bootstrap.test.mjs`, `test/firestore.rules.test.mjs`, `test/note-size-error-code.test.mjs`,
`test/point3-error-code.test.mjs`.

### D4 — Rules `backups` trop larges
`allow create/delete: if canWrite(uid)` laissait le PROPRIÉTAIRE créer et surtout **supprimer** ses propres
sauvegardes — pensé pour un système de sauvegarde client qui n'a jamais existé. Corrigé : `allow create, update,
delete: if false` (client), lecture seule (propriétaire + admin). Nouvelle sous-collection `backups/{id}/parts/`
(voir D3) avec les mêmes règles. **Piège SDK trouvé en testant** : appeler `ctx.firestore()` deux fois dans un
même `withSecurityRulesDisabled()`, la 2e fois sur une sous-collection, casse tout appel `.firestore()`
ultérieur sur un autre contexte (`@firebase/rules-unit-testing` + firebase JS SDK, sans lien avec la logique
testée) — réutiliser la même instance suffit.

### D2/D3 — Contenu des sauvegardes
`ADMIN_BACKUP_SUBCOLLECTIONS` complété avec `notesEntrainements` (cahier d'erreurs des entraînements, absent
jusqu'ici). `users/{uid}/settings/preferences` (catalogues personnalisés, `deletedDefaultIds`, barème) est un
DOCUMENT unique, snapshoté séparément (`snapshotUserSubcollections`) sous `settingsPreferences`. `tourLogs`/
`reviews`/`attempts` (journaux append-only imbriqués) restent volontairement exclus — justification documentée
dans le code : ce sont des journaux dérivés jamais modifiés par l'appli (contrairement aux documents primaires),
les inclure exigerait un N+1 de lectures pour un bénéfice de protection marginal ; à reconsidérer avec Jean si
besoin.
L'ancienne `_buildSafeBackupSnapshot` RETIRAIT `notes` au-delà de 750 Ko pour rester sous la limite Firestore
d'1 Mo par document — remplacée par un découpage en `backups/{id}/parts/{n}` (~150 000 caractères/partie, jamais
un octet retiré). Découpage par CARACTÈRES (jamais par octets) : une chaîne JS se tranche toujours à une limite
UTF-16 valide, donc jamais en plein milieu d'un caractère. `BACKUP_MAX_PARTS=500` reste un garde-fou pour un cas
pathologique (jamais atteint en usage normal). Format `v2` (parties) et `v1` (ancien, `snapshot` inline) tous
deux lisibles par `_readBackupSnapshot`.

### D5 — Mode de restauration « compléter » (par défaut) vs « remplacer »
`adminRestoreBackup({ mode })` : `"merge"` (compléter, par défaut) ne réécrit que ce qui manque RÉELLEMENT —
document absent (recréé), document archivé DEPUIS la sauvegarde (désarchivé + contenu restauré, un document
archivé étant gelé côté appli donc sans risque d'écraser une édition récente), ou — pour `notes`/
`notesEntrainements`/`errorEntries` (`BACKUP_CONTENT_FIELD`) — un contenu actuellement VIDE alors que la
sauvegarde en avait un. Un document présent/actif/non vide n'est JAMAIS touché. `"replace"` (comportement
historique) reste disponible explicitement. `settings/preferences` suit la même logique (recréé seulement s'il
est absent, en mode compléter).

### D1 — Sauvegarde automatique nocturne
`scheduledUserBackup` (`onSchedule`, `0 3 * * *`, Europe/Paris) : pour chaque utilisateur Auth actif dans les
3 derniers jours (`listUsers` paginé, `lastRefreshTime`/`lastSignInTime`), crée une sauvegarde automatique si la
dernière a plus de 72h, puis ne garde que les 5 dernières AUTOMATIQUES (jamais les manuelles ni les « avant
restauration », filtrées par `createdBy`). **Limite documentée, pas silencieuse** : la purge des sauvegardes
« avant restauration » de plus de 90 jours n'est PAS implémentée (nécessiterait son propre balayage périodique) —
seule la rétention des 5 dernières automatiques l'est. Logique exposée en test via `exports.__backupTest`
(même mécanisme que `P1_TEST_EXPORTS` déjà utilisé pour la facturation) : l'émulateur Cloud Scheduler n'a pas à
être fiable pour ces tests, le VRAI code est appelé directement.
**Onglet admin.html "Sauvegardes" remis en place** (retiré le 27/09, ne restait qu'un commentaire) : recherche
d'utilisateur (réutilise `allUsers` déjà chargé, aucune lecture Firestore de plus), liste des sauvegardes,
« Créer une sauvegarde maintenant », restauration avec choix du mode + confirmation + bilan par collection.
`admin.html` n'appelait jusqu'ici JAMAIS de Cloud Function (uniquement des lectures Firestore directes) — ajout
de `getFunctions`/`httpsCallable`/`connectFunctionsEmulator` (même pont `fn-bridge.mjs` que `tableur.html` en
test).

### D6 — Une restauration admin ne protégeait que `courses`
`restoredAt` (posé uniquement sur `courses/{fc}`, comparé à `window._p1PageLoadedAt` dans
`p1WriteTourSlot`/`p1JCheckpointAction`) protégeait déjà les TOURS contre un onglet resté ouvert avant une
restauration — mais AUCUNE autre collection (matières, tâches, planning, entraînements, notes) n'avait cette
protection. `users/{uid}.restoreEpoch` (posé à CHAQUE restauration) est lu par un listener déjà actif côté
client (`applyUserSettings`, `startUserSettingsListener`) : un rechargement de page couvre tout d'un coup.
**Bug réel corrigé PENDANT l'écriture de ce correctif** (trouvé par le test D6, pas en relecture) : une première
version comparait à une "référence" mémorisée au tout premier passage du listener — mais la PREMIÈRE
restauration réelle d'un compte (cas le plus fréquent) était alors prise à tort pour cette référence initiale et
ne déclenchait AUCUN rechargement. Corrigé en comparant directement `restoreEpoch` à `window._p1PageLoadedAt`
(même principe que la protection `courses` existante) plutôt qu'à une référence arbitraire.

### D7 — Cache Firestore mémoire (jamais persistant)
`getFirestore(app)` → `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager:
persistentMultipleTabManager() }) })`, repli `memoryLocalCache()` explicite si `initializeFirestore` lève
(IndexedDB indisponible — non vérifiable en Chrome/Edge headless dans cet environnement, à confirmer par Jean en
navigation privée Safari). L'avertissement avant de quitter (`beforeunload`, `_p1UnconfirmedWrites`) ne se
déclenche plus QUE si le repli mémoire a eu lieu (`window._p1UsingPersistentCache === false`) : avec le cache
persistant, une écriture pas encore confirmée est déjà durablement en file localement, fermer l'onglet ne la
perd plus. **`battery.mjs` P2 ("tâche créée pendant une coupure puis RECHARGEMENT") n'est plus un échec connu** —
marqueur retiré, le test passe réellement.

### D8 — Tours/rappels J non durables hors ligne (le cas le plus difficile)
Le cache persistant (D7) protège `setDoc`/`updateDoc` hors ligne, mais **pas `runTransaction()`** : une
transaction doit lire l'état SERVEUR pour s'exécuter (c'est son principe), ce qu'elle ne peut par définition pas
faire hors ligne — le SDK ne peut pas la mettre en file comme une écriture simple. Option retenue (choix
documenté dans le prompt de mission) : **B, une file locale durable** (`localStorage`, par uid) plutôt que A
(refactor du stockage des tours en champs plats, plus gros chantier sur le rendu). Chaque case de tour
(`_p1TourQueuePut`/`_p1TourQueueRemove`) et chaque action de rappel J (`_p1JQueuePut`/`_p1JQueueRemove`, id
unique par entrée car deux "postpone" sur la même étape sont volontairement distincts) est écrite dans sa file
AVANT toute tentative réseau, retirée UNIQUEMENT une fois le serveur confirmé, et rejouée
(`_p1TourQueueReplay`/`_p1JQueueReplay`) au chargement de page, au retour du réseau (`handleOnline`) et au
premier plan de l'onglet (`visibilitychange`) — donc même si l'onglet a été FERMÉ pendant la coupure, pas
seulement rechargé pendant qu'il restait ouvert.

### D9 — Compteur d'écritures non confirmées incomplet
Seul `window._fsSetDoc` incrémentait `window._p1UnconfirmedWrites` — `window._fsUpdateDoc` (brut, utilisé par ex.
par `deleteSpecialty`/`deleteItem` du module TPXPerso) et `window._fsRunTransaction` (tours/rappels J)
n'étaient JAMAIS comptés, ni le pont `window._flashFirestore` (flashcards, `setDoc`/`updateDoc`/`addDoc` bruts).
Un seul wrapper générique `_p1CountWrite` partagé par les quatre.

### D10 — `deletedDefaultIds` : faux filet localStorage
Vivait UNIQUEMENT dans un blob `planning_pending_<uid>` hérité de TypixClin, censé être purgé par
`saveUserData()` une fois confirmé — or `saveUserData()` est un no-op sur P1Planner depuis la migration vers les
collections décomposées : ce blob n'était donc JAMAIS purgé, et pouvait RESSUSCITER une valeur périmée
(sélection de ressources, entraînement par défaut déjà re-supprimé) par-dessus l'état Firestore réel à chaque
connexion suivante — perte/corruption silencieuse plutôt qu'un filet inoffensif. `deletedDefaultIds` a
maintenant sa propre persistance réelle (`users/{uid}/settings/preferences.deletedDefaultIds`, même mécanisme
que les catalogues personnalisés). L'écriture du blob `planning_pending_<uid>` est neutralisée aux deux endroits
où elle avait lieu (chaque champ qu'il transportait a désormais sa propre écriture Firestore réelle) ; le code
de restauration au démarrage reste en place pour purger proprement un blob déjà présent chez un utilisateur
avant ce correctif, une seule fois.

### D11 — `showCustomAlert` n'acceptait qu'un objet
~12 sites d'appel réels utilisaient `showCustomAlert('message', 'error')` ou `showCustomAlert(titre, message,
type)` — `options.type`/`options.message` valaient alors `undefined`, affichant l'icône verte de SUCCÈS avec un
message VIDE exactement quand un enregistrement échoue. Les 3 formes d'appel réellement utilisées sont
normalisées vers le même objet avant le traitement existant, inchangé sinon.

### D12 — Recherche bloquée après un retour bfcache
`pointerdown`/`keydown` (déverrouillage) posés avec `{ once: true }`, donc CONSOMMÉS dès le premier
déverrouillage réel — le `pageshow` suivant reverrouillait pourtant le champ SANS RIEN reposer pour le
déverrouiller : après un retour arrière/avant du navigateur, le champ restait en lecture seule pour toujours.
Corrigé en reposant les écouteurs à CHAQUE verrouillage, et en ne reverrouillant que sur un vrai retour bfcache
(`event.persisted === true`), pas à chaque `pageshow` (y compris un premier chargement normal).

### Isolation des tests vis-à-vis des émulateurs TypixClin de Jean
Toute cette mission a été développée et testée alors que Jean faisait tourner en parallèle les émulateurs
TypixClin (8080/9099/8085/8086/8901, `--project typixclin-rules-test`, confirmé par inspection directe des
processus). Tous les ports par défaut de la suite de tests P1Planner ont été décalés (`firebase.emu-alt.json` à
la racine, ports 8280/9198/9199/5101/4600/4100/4700 ; page e2e 8991 ; proxy 8185/8186) — jamais touché aux
processus de Jean. `firebase.emu-alt.json` est un fichier de config local, non versionné dans le sens où il ne
remplace PAS `firebase.json` (utilisé uniquement via `--config` pour les tests).

### Constat annexe trouvé en vérification finale — HORS PÉRIMÈTRE, non corrigé ce soir
En rejouant `test/e2e/mutants.mjs` une dernière fois avant le rapport, le mutant préexistant **M6 (« pastille
éteinte par l'écrivain des avis »)**, qui appartient à la fonctionnalité Parrainage et n'a aucun lien avec
D1–D12, n'est plus détecté. Investigation faite (pas de suppositions) : le bloc de code concerné
(`_updateDots()`, un des 3 écrivains de `#avatar-notif-dot`) est **identique caractère pour caractère** entre
`rollback/tableur.html.avant-sauvegardes-2026-09-30` et le fichier actuel — donc rien dans D1–D12 ne l'a modifié
directement. `_updateDots()` a un bug préexistant déjà présent avant cette mission (il omet
`window._p1ReferralUnseen` dans son propre calcul, contrairement aux 2 autres écrivains), mais un AUTRE écrivain
correct (`window._p1RefreshReferralDots`) recouvre systématiquement son erreur en pratique — d'où l'absence de
bug utilisateur réel (T1 passe normalement). Vérifié par un test croisé manuel : la même mutation appliquée à une
copie du code d'AVANT la mission est bien détectée (échec immédiat) ; appliquée au code ACTUEL, elle ne l'est
plus. Hypothèse la plus probable, non poussée plus loin (hors périmètre du GO de ce soir) : D7 (cache Firestore
persistant) change la vitesse/l'ordre d'arrivée des écritures des listeners `onSnapshot`, ce qui accélère ou
fiabilise le recouvrement par l'écrivain correct au point de masquer la fenêtre où l'écrivain fautif était
observable par le test. Aucune correction faite ce soir : ni `_updateDots()` ni le test M6 ne font partie du
périmètre D1–D12. Piste pour plus tard (à valider avec Jean) : faire appeler
`window._p1RefreshReferralDots()` depuis `_updateDots()` au lieu de dupliquer la logique — supprimerait le bug
latent ET rendrait le mutant de nouveau détectable.

## Listes personnalisables (sécurité des données), verrou tours 8/14, iPad, banque de matières P1 (2026-10-02, demande explicite de Jean, comparaison au modèle EDN TableurEnLigne.html du 02/10)

Mission complète en 5 lots (A P0, B, C, D, E) + un correctif X1 confirmé par test puis approuvé par Jean. Audit
fait en lisant directement le code EDN de référence (`TableurEnLigne.html`, module `tpx-catalogs-core`) et le
code P1 actuel, jamais par supposition. **Tous corrigés, testés réellement contre l'émulateur, sensibilité
prouvée pour chaque nouveau test (mutants).**

**Fichiers modifiés :** `public/tableur.html`, `functions/index.js`. **Tests nouveaux :**
`test/e2e/catalog-safety.mjs`, `test/e2e/catalog-keyboard.mjs`, `test/e2e/tours-lock.mjs`,
`test/e2e/ipad-img-bar.mjs`, `test/e2e/subject-bank.mjs`, `test/e2e/settings-persist.mjs`, extension de
`test/backups.test.mjs` (A6/L6) et `test/e2e/mutants.mjs`.

### Lot A (P0) — Fusion des catalogues personnalisables, jamais un écrasement

**L1/A1 — Écrasement complet du catalogue.** `p1SaveCustomCatalog(field, list)` écrivait purement et simplement
la liste COMPLETE locale par-dessus celle du serveur (`updateDoc`/`setDoc`, tout le tableau à chaque fois). Avec
deux onglets/appareils, le dernier qui écrivait effaçait silencieusement tout ajout/renommage/archivage fait
ailleurs entre-temps — exactement le défaut qu'EDN corrige par fusion union+horodatage dans
`tpx-catalogs-core.mergeKindArrays`. Remplacé par `p1MergeCatalogArrays`/`p1MergeIdList` (union par id, le plus
grand horodatage `u` gagne) appliquées **dans une transaction** (`p1SaveFieldMerged`, lit la vraie valeur serveur
au moment de l'écriture, jamais un cache local périmé). Chaque mutation (ajout/renommage/recoloration/archivage)
pose désormais `u = Date.now()`. Prouvé par **CAT1** (deux onglets, ajouts QUASI SIMULTANÉS — un `sleep` entre les
deux masquait le bug en laissant l'écoute temps réel réconcilier avant la 2e écriture, piège trouvé en testant)
et **CAT2** (conflit sur le même id, la version la plus récente gagne dans les deux sens).

**L2/A2 — Pas d'écoute temps réel.** `_checkSelectedResources()` ne faisait qu'une lecture (`getDoc`) au login,
jamais plus rien ensuite : un onglet resté ouvert gardait indéfiniment l'état du login et le réécrivait par-dessus
tout changement fait depuis ailleurs dès la première modification locale (aggrave L1). Remplacée par une vraie
écoute (`onSnapshot` sur `settings/preferences`, via `_p1ApplyCatalogsSnapshot`) : tout changement se voit
immédiatement, y compris dans un gestionnaire déjà ouvert — sauf pendant que l'utilisateur tape dans une de ses
lignes (`_p1CatalogListHasFocus`, même esprit que `listHasFocus`/`mgr.stale` côté EDN). Prouvé par CAT1 (chaque
onglet voit en direct l'ajout de l'autre sans fermer/rouvrir).

**L3/A3/L5/A5 — Aucune garde avant écriture.** Ni le chargement, ni le hors-ligne, ni la lecture seule premium
n'étaient vérifiés avant une mutation ou l'ouverture du gestionnaire. `_p1CatalogCanEdit()` (nouveau) refuse tant
que `window._p1CatalogsLoaded` n'est pas vrai pour le compte COURANT (`window._p1CatalogOwnerUid`), posé
uniquement par le premier instantané réel reçu — sinon délègue à `canPerformAction('config')` (déjà existant,
gère hors-ligne/premium). Câblé dans `_p1OpenCatalogModal` et les 5 fonctions de mutation. Prouvé par **CAT3**
(forçage direct de l'état non-chargé et `offlineActionsBlocked`, les deux refusent, aucune écriture serveur).

**L7 — Changement de compte dans le même onglet.** `window._p1StopCatalogsListener()` (nouveau, appelé à la
déconnexion dans `updateUserUI`) coupe l'écoute et remet les 4 catalogues + `selectedResources` aux seuls défauts,
pour qu'un 2e compte se connectant dans le même onglet ne parte jamais d'un résidu du premier. **Corrigé par
construction (même garde `_p1CatalogOwnerUid` que A3), non testé par un scénario dédié "deux comptes, un seul
onglet"** — limitation assumée, à signaler à Jean (voir rapport).

**L4/A4 — Échecs silencieux.** `.catch(function(){})` partout : un ajout pouvait ne JAMAIS être enregistré sans
qu'aucun message ne le dise. Chaque mutation reste **optimiste** (retour visuel immédiat, comme avant — ne pas
casser l'animation de suppression déjà testée, voir piège ci-dessous) mais la sauvegarde réelle passe par la
fusion en transaction ; un échec réel annule la mutation optimiste et affiche un message
(`_p1CatalogRevertAndShowError`). La confirmation "Ajouté ✓" n'apparaît, elle, QUE lorsque l'écriture est
réellement confirmée (jamais avant). **Piège trouvé en testant** : une 1ʳᵉ version supprimait TOUTE mutation
optimiste (rien n'apparaissait avant confirmation serveur) — cassait l'animation de suppression déjà en
production (`delete-animation.mjs` D1, fondu attendu immédiatement après le clic). Corrigé en gardant l'optimisme
local (retour immédiat) et en ne retardant que la fiabilité de la sauvegarde elle-même. Prouvé par **CAT4**
(transaction simulée en échec : la ligne optimiste disparaît, rien n'est écrit côté serveur, message affiché).

**L6/A6 — Restauration admin « compléter » ignorait les catalogues si le document existait déjà.** Dans
`functions/index.js` (`adminRestoreBackup`), `settings/preferences` n'était restauré en mode compléter QUE si le
document était totalement absent — cas quasi inexistant en pratique, donc une entrée de catalogue perdue (bug
client, L1) ne revenait JAMAIS. Nouvelle fusion serveur (`_mergeCatalogArraysServer`/`_mergeIdListServer`, même
logique qu'A1) appliquée aux 4 catalogues + `deletedDefaultIds` quand le document existe déjà ; les AUTRES
réglages (thème, pagination...) restent hors périmètre, comportement inchangé. Prouvé par 2 nouveaux tests dans
`test/backups.test.mjs` (entrée perdue restaurée par fusion ; conflit sur le même id résolu par l'horodatage le
plus récent, dans les deux sens) — sensibilité confirmée en rejouant contre une copie temporaire du code d'avant
ce correctif (2/3 tests échouent comme attendu, le 3e teste un cas neutre).

### Lot B — Clavier tactile + parité EDN (listes personnalisables)

**L9/B1 — Entrée dans le champ d'ajout ne faisait que quitter le champ.** `_p1CatalogTextareaKeydown` traite
maintenant spécialement les 2 champs d'AJOUT (nom, acronyme) : Entrée valide directement l'ajout. Sur une ligne
EXISTANTE, Entrée continue de juste valider la saisie (comme avant). Prouvé par KB1/KB2/KB4.

**L10/B2 — Clavier Android (retour à la ligne sans `keydown` Entrée détectable).** Écouteur `input` délégué sur
le modal, déclenché seulement sur `inputType` `insertLineBreak`/`insertParagraph` (jamais sur un collage
multi-lignes, `insertFromPaste`). Prouvé par KB3.

**L11/B3 — Doublons et noms vides acceptés en silence.** `p1FoldCatalogLabel` (sans casse/accents/ponctuation) +
vérification contre la liste ACTIVE avant tout ajout, message visible (`#p1-catalog-add-error`, apparition/
disparition en douceur). Prouvé par KB5/KB6.

**L12/B4 — Carte « Listes personnalisables » (demande explicite de Jean).** Ajoutée dans `injectSettings()`,
juste après la carte « Entraînements », un bouton par catalogue qui ouvre le bon gestionnaire PAR-DESSUS les
Paramètres (`#p1-catalog-modal` déjà au z-index 100250, > 10200 des Paramètres — aucun nouveau CSS de calque
nécessaire) ; fermer le gestionnaire ramène aux Paramètres restés ouverts. Prouvé par KB7.

B5 (descente douce avant apparition de la nouvelle ligne) : amélioration listée comme "recommandée" par
l'audit, pas demandée explicitement — non faite, signalée pour une prochaine itération si Jean le souhaite.

### Lot C — Verrou de sécurité 8/14 tours

**T2/C1 — Plafond du mode compact basé sur la longueur STOCKÉE, pas le réglage.** `maxTours(d)` faisait
`Math.max(d.tours.length, tpxMaxToursAllowed())` — `d.tours.length` ne redescend jamais une fois étendue à 14
(ni au retrait d'un tour, ni en repassant le réglage à 8), donc le mode compact autorisait l'ajout de tours au-delà
du réglage "8 tours", invisibles en vue détaillée. `maxTours(d)` ne dépend plus QUE du réglage courant
(`tpxMaxToursAllowed()` seul, comme EDN). Prouvé par **TL9** (tableau stocké de 10 cases, 8 confiances, réglage
8 : blocage correct) et **TL11** (tableau stocké de 14 cases, 3 confiances réelles : blocage à 8, jamais à 14).

**T1/C2 — Aucun verrou de retour à 8 tours.** Nouveau `window._p1ExtendedToursLockCount()` (compte les cours
ACTIFS ayant un tour enregistré à l'index ≥ 8, lu sur le cache BRUT des cours, jamais `padTours`-étendu) : tant
qu'il est > 0, l'option "8 tours" est grisée + cadenas, un clic dessus est refusé + secousse visuelle, et un
bandeau rouge d'UNE SEULE phrase (jamais de liste d'items, demande explicite de Jean) explique pourquoi. Se lève
tout seul en temps réel (revérifié à chaque mise à jour du cache live des cours, pas seulement à l'ouverture des
Paramètres). Prouvé par **TL1** (verrou posé + clic refusé), **TL2** (levée automatique temps réel, Paramètres
restés ouverts) et **TL5** (jamais verrouillé à tort quand aucun cours n'est concerné).

### Lot D — iPad : barre de contrôle d'image des notes

**I1 — Barre taille ordinateur sur iPad.** Seul `@media (max-width: 768px)` agrandissait la barre
(Agrandir/Monter/Descendre/Supprimer, déjà existante — la lightbox `_notesImgEnlarge` était déjà portée d'EDN
avant cette mission) ; un iPad (≥769px, tactile) y échappait entièrement, boutons ~19px de haut (confirmé en
testant avec le correctif temporairement retiré). Nouveau `@media (pointer: coarse) and (min-width: 769px)`
(cible le TYPE de pointeur, pas juste une largeur d'écran, comme EDN) : cibles 44×44px, curseur élargi. Nouveau
`_notesImgBarFit()` (appelé à l'affichage et au redimensionnement) bascule "Supprimer" en icône seule
(`.is-tight`) SEULEMENT si la barre complète déborderait réellement de l'éditeur — jamais par défaut. Prouvé par
**IB1/IB1B** (iPad portrait/paysage, cibles ≥42px — tolérance de sous-pixel confirmée par lecture du CSS calculé,
qui déclare bien 44px exactement), **IB3** (ordinateur inchangé), **IB4** (téléphone inchangé) et **IBTIGHT**
(éditeur artificiellement étroit : bascule en icône seule, puis revient au texte en le réélargissant).

### Lot E — Banque de matières P1 (demande explicite de Jean)

13 matières (UE1 à UE8, ordre d'UE) proposées sur la page de présentation (déconnecté uniquement, case décochée
par défaut), choix mémorisé 24h (`localStorage`), appliqué une seule fois juste après la prochaine connexion
réussie dès que les matières du compte sont réellement chargées (`TPXPerso._state.loaded`). Création via
`TPXPerso._upsertSpecialty` (ids déterministes `bank-ue1-chimie`...) : aucun cours créé, aucune matière
existante modifiée. Déduplication sans casse/accents/ponctuation, avec ou sans préfixe d'UE ("Chimie" bloque
"UE1 Chimie") contre les matières ACTIVES uniquement — une matière archivée ne bloque pas, et l'id déterministe
la RÉACTIVE si elle correspondait déjà à un ajout antérieur de la banque (voulu). Ordre sauvegardé via
`specialtyOrder` (désormais réellement persisté, voir X1) : existantes d'abord dans leur ordre, puis la banque en
ordre d'UE. Pour un compte déjà connecté (réponse de Jean : pas d'entrée proactive) : bouton dédié dans les
Paramètres, avec confirmation.

**Pas de matière "Bloc santé"** (réponse de Jean) : UE3.2/UE5/UE6/UE7/UE8 sont de simples matières, aucun en-tête
de groupe n'est créé comme matière.

**Bug réel trouvé en testant (réentrance)** : `rebuildStateFromLive()` appelle `_p1MaybeApplySubjectBank()` à
CHAQUE mise à jour du cache live des matières — or l'application de la banque écrit justement de nouvelles
matières une par une, ce qui réveille l'écoute et redéclenchait la même fonction PENDANT que le premier appel
était encore en cours (choix "en attente" pas encore effacé). Deux boucles concurrentes se marchaient dessus
(une matière de la banque pouvait manquer de `specialtyOrder`, voire ne jamais être créée si la fusion
d'`activeSpecialties` se faisait sur un état partiel). Corrigé par un verrou simple (`_p1BankApplying`).

### X1 (confirmé par test réel, puis corrigé avec l'accord explicite de Jean)

`saveUserSettings()` (thème, `NbrItemsPage`, `NbrEntrainementsPage`, `specialtyOrder`, `matiereBadges`) écrivait
dans `users/{uid}` — backend-only côté Rules (`allow write: if false`, sans exception), donc `updateDoc` ET son
repli `setDoc` échouaient TOUJOURS, en silence (`console.warn` jamais vu par l'utilisateur). Confirmé par un test
réel contre l'émulateur AVANT correction (le document reste vide côté serveur) ; déplacé vers
`users/{uid}/settings/preferences` (autorisé par les Rules, `canWrite`, même document que les catalogues
personnalisables) ; `applyUserSettings()` (déjà éprouvée) est maintenant aussi appelée depuis l'écoute de ce
document. Prouvé par **settings-persist.mjs/X1** (persistance confirmée côté serveur ET reprise sur un « autre
appareil », une page toute neuve du même compte).

### Non-régression complète

`npm run test:rules` **44/44** ; `catalog-custom.mjs` **14/14** ; `train-catalog.mjs` **8/8** ;
`delete-animation.mjs` **3/3** ; `data-durability.mjs` **9/9** ; `battery.mjs` **19/19, 0 connu** ;
`referral-ui.mjs` **24/25, 1 connu (A2, flakiness d'environnement déjà documentée, sans lien avec cette
mission)**. Aucune régression détectée sur l'ensemble de la suite existante.

### Retours de Jean après la mise en ligne (2026-10-02, suite) : finitions UI + banque de matières dans l'assistant

- **Section « Existants » dans une grande case**, comme « Ajouter » (`.p1-catalog-existing-card`, même traitement
  visuel que `.p1-catalog-add-card` mais teinte neutre grise pour rester visuellement distincte).
- **Survol persistant sur la pastille de couleur** (comparaison EDN `tpx-cat-row-color:hover,
  .tpx-cat-row.pal-open .tpx-cat-row-color`) : `.p1-catalog-color-dot:hover` ET
  `.p1-catalog-row.pal-open .p1-catalog-color-dot` partagent le même style (anneau + léger agrandissement) —
  la ligne porte désormais la classe `pal-open` tant que son nuancier reste déployé, pas seulement au survol
  de la souris.
- **Icônes dans la carte Paramètres « Listes personnalisables »** (comparaison EDN), une par liste
  (`.p1-catalog-settings-row-icon`, même langage visuel que `.settings-card-icon` en plus petit).
- **Banque de matières : abréviations explicites + tiret dans les noms.** `shortOf()` (TPXPerso) dérive une
  abréviation des 2 premiers mots du nom quand aucune n'est saisie — "UE2 Biologie cellulaire" ET
  "UE3.1 Biophysique" donnaient toutes deux "UBE" (collision confirmée par capture d'écran de Jean). Chaque
  matière de la banque porte maintenant un `short` explicite (U1C, U1B, U1O, U2B, U2H, U2E, U3P, U3B, 3.2, UE4,
  UE5, UE6, UE7, UE8) ; les noms prennent un tiret entre le préfixe d'UE et le nom ("UE1 - Chimie"). **UE1 -
  Chimie organique ajoutée** (matière manquante signalée par Jean) : la banque passe de 13 à 14 matières.
  `p1BankFold()` n'a pas eu besoin d'être modifié : le tiret est déjà neutralisé par le remplacement des
  caractères non alphanumériques avant la comparaison de doublon. **Correction ultérieure (retour de Jean,
  même jour)** : UE4 à UE8 n'ont aucune sous-matière (contrairement à UE1/UE2/UE3) — une abréviation à 3
  lettres dérivée du nom (U4B, U5A, U6P, U7S, U8A) n'avait pas de sens ; remplacées par le préfixe d'UE seul
  ("tu mets UE5 UE6 UE7 UE8 mec"). Vérifié par une nouvelle assertion dédiée dans `subject-bank.mjs` (SB2).
- **Banque de matières proposée aussi dans l'assistant de présentation** (`Onb`/`TPXOnboarding`, le tour guidé
  après connexion — question de Jean : "pourquoi la possibilité d'ajouter les matières P1 prédéfinies n'est pas
  dans la présentation ?", en parlant de CET assistant, distinct de la page de présentation déconnectée où elle
  était déjà). Ajoutée sur la page "Matières" (`id:'specialites'`), même aperçu, appliquée à la validation finale
  de l'assistant (`finish()`) comme les autres réglages — pas via le mécanisme différé par localStorage de la
  page déconnectée, puisque l'utilisateur est déjà connecté à ce stade. `p1RenderSubjectBankPreview()` généralisée
  pour accepter un id de conteneur (réutilisée pour les deux emplacements).
- **Bug réel trouvé en généralisant cette fonction** : `document.addEventListener('DOMContentLoaded',
  p1RenderSubjectBankPreview)` passe l'objet `Event` en premier argument au handler — une fois la fonction
  rendue paramétrable, `containerId` valait cet objet (toujours vrai), `document.getElementById(eventObject)`
  échouait en silence, et l'aperçu de la page de présentation restait VIDE. Trouvé par le test SB1 (qui
  préexistait déjà), pas en relecture. Corrigé par une fonction anonyme n'invoquant l'appel qu'avec zéro argument.

Tests : `catalog-keyboard.mjs` **7/7** (non-régression), `subject-bank.mjs` **5/5** (SB1-SB3, SB-MANUAL, nouveau
SB-ONB). Sensibilité prouvée : 2 nouveaux mutants (banque retirée de l'assistant, abréviations supprimées), tous
détectés.

## Flashcards orphelines après suppression d'une matière + tiret UEx rétroactif (2026-10-02, capture d'écran de Jean)

- **Bug confirmé en lisant le code (pas une supposition)** : `deleteSpecialty(id)` (TPXPerso) archive la matière
  et ses cours (`archivedAt`) mais n'a **jamais** appelé `deleteLinkedData()`/`unlinkFlashCardsFromItem()` pour ses
  flashcards — le code de cascade porté de TypixClin (`deleteLinkedData`, `countLinkedData`, `SCOPED_COLLECTIONS`)
  existe bien dans le fichier mais n'est câblé nulle part depuis `deleteSpecialty()`. Il est de toute façon
  non fonctionnel pour P1Planner : ses gardes internes (`cardsCol.indexOf('_perso') !== -1`) supposent le modèle
  TypixClin "officiel / sur-mesure" à deux jeux de collections suffixées `_perso`, alors que P1Planner n'a
  **qu'un seul** jeu de collections (`TPXC_MAP`, voir commentaire "P1 n'a jamais de programme officiel" plus haut
  dans le fichier) — la condition est donc toujours fausse, ce code mort ne supprime jamais rien même s'il était
  appelé.
  Conséquence réelle : les flashcards d'une matière supprimée restent en base avec leur ancien `speId`, qui ne
  correspond plus à aucune entrée de `SPECIALTIES_DATA`. `renderFlashDrawerList()` ajoutait en plus
  explicitement **tout** `speId` rencontré parmi les cartes, même hors `SPECIALTIES_DATA` (`Object.keys(byspe)`
  après la boucle sur les matières actives) — la matière supprimée réapparaissait donc comme un groupe à part
  entière dans le tiroir "Session Flash", nommé par son ID Firestore brut (`speName()`/`speShort()` retombent sur
  l'id quand la matière est introuvable — exactement ce que montrait la capture d'écran de Jean : "bank-ue2-bio-
  c...", "r1nKM5MCGbuajO...").
- **Correctif choisi (jamais de suppression physique, cohérent avec `archivedAt` ailleurs dans ce fichier)** :
  pas de suppression des flashcards orphelines (perte de données potentiellement irréversible si jamais
  restaurées par un admin) — elles sont simplement **exclues de l'affichage**, au niveau des deux seuls points
  d'entrée "toutes matières" : `loadAllFlashCards()` et `loadAllDueFlashCards()` filtrent maintenant par
  appartenance à `SPECIALTIES_DATA` (`_flashFilterActiveSpe()`). `loadFlashCards(speId)` (cahier d'une matière
  précise) n'est pas concerné : son ID ne peut être qu'actif, l'UI n'offre aucun moyen d'ouvrir le cahier d'une
  matière supprimée. Corrige à la fois le tiroir et le badge global de dues (`#flashGlobalDueCount`), qui comptait
  lui aussi les cartes orphelines en plus.
- **Tiret UEx rétroactif** : une matière de banque créée par un compte AVANT l'ajout du tiret (voir section
  précédente) a gardé pour toujours son ancien nom sans tiret — `upsertSpecialty()` ne copie `name` qu'une seule
  fois, à la création ; modifier `P1_SUBJECT_BANK` ne réécrit jamais les matières déjà enregistrées (c'est
  exactement ce que montrait la seconde capture d'écran de Jean : "UE2 Embryologie" sans tiret). Nouveau
  `window._p1FixBankSubjectNames()`, appelé comme `_p1MaybeApplySubjectBank()` à chaque mise à jour du cache live
  des matières (`rebuildStateFromLive()`) : renomme UNIQUEMENT les matières dont l'**ID** correspond à une entrée
  de la banque (jamais attribué par une création manuelle) **et** dont le nom correspond EXACTEMENT à l'ancienne
  forme sans tiret (si Jean a renommé la matière entre-temps, le nom ne correspond plus et elle n'est jamais
  touchée) — préserve couleur/icône/abréviation existantes (un appel partiel à `upsertSpecialty()` les aurait
  écrasées à `null`).

Tests : nouveau `flash-orphan-subject.mjs` (**FC1**, 1/1) — carte orpheline absente de `loadAllFlashCards()` /
`loadAllDueFlashCards()`, du badge global et du tiroir réel, matière active inchangée. Nouveau `subject-bank.mjs`
**SB-DASH** (6/6 sur l'ensemble du fichier) — matière de banque sans tiret renommée, matière renommée à la main
et matière hors banque toutes deux laissées intactes. Sensibilité prouvée : 2 nouveaux mutants (F1, F2), tous
deux détectés (contre-preuve : chaque test échoue bien sans son correctif). Non-régression : `catalog-
keyboard.mjs` **7/7**, `battery.mjs` **19/19**. Déployé et vérifié (SHA-256 local = live).

## Carte « Listes personnalisables » : survol/espacement, wording « cours », icônes et abréviations par défaut de la banque (2026-10-02, captures d'écran de Jean)

- **Espace « étrange » entre icône et titre + survol « pas satisfaisant »** : `.p1-catalog-settings-row` utilisait
  `justify-content: space-between` sur 3 enfants (icône / bloc texte / chevron) sans que le bloc texte n'ait de
  `flex-grow` — il se contractait à son propre contenu et `space-between` l'écartait de l'icône au lieu de le
  coller dessus. La RÉFÉRENCE EXACTE existe déjà côté TypixClin (`.tpx-cat-set-btn`/`-ico`/`-txt`/`-go`), même
  fonctionnalité, même nom de carte (« Listes personnalisables »). Portée ici à l'identique (classes P1Planner
  conservées, déjà câblées en JS et dans les tests e2e) : bordure + légère teinte bleue au survol, pastille
  d'icône qui se remplit en bleu plein au survol, chevron qui se décale et change de couleur, `flex:1` sur le
  bloc texte. S'applique aussi à la carte « Autres actions » (même classe de ligne réutilisée).
- **Wording « X/X items » → « X/X cours »** sur la page "Mes matières" (`data-page="dashboard"`, nav "Mes
  matières") : podium des favorites (`renderSpecialtyRanking()`) et grille des cartes (`renderDashboardSpecialties()`).
  Le texte de pagination de la page "Mes cours" (`data-page="items"`, `updatePaginationUI()`) n'est PAS concerné
  — demande de Jean explicitement scopée à "la page matière", une page distincte.
- **Abréviations de la banque pas comme demandé** (capture d'écran : "UPE"/"UBE"/"UAE"/"USE" au lieu de
  UE4-UE8) : preuve directe que `shortOf()` dérivait l'abréviation du NOM parce que `short` était resté VIDE en
  base pour ces matières — ces comptes ont appliqué la banque avant l'ajout du champ `short` explicite (même
  cause structurelle que le tiret manquant : `upsertSpecialty()` ne copie un champ qu'à la création, un
  changement de `P1_SUBJECT_BANK` ne corrige jamais les matières déjà enregistrées).
- **Icônes par défaut du pack matière** (demande explicite de Jean) : chaque entrée de `P1_SUBJECT_BANK` reçoit
  désormais une icône choisie dans le tableau `ICONS` déjà vérifié visuellement (TPXPerso, Font Awesome 6.0.0) —
  jamais une icône non vérifiée. `p1ApplySubjectBank()` l'écrit à la création (remplace l'ancien `icon: null`
  codé en dur).
- **Correctif rétroactif généralisé** : `window._p1FixBankSubjectNames()` (déjà en place pour le tiret) corrige
  maintenant aussi `short` et `icon`, chacun INDÉPENDAMMENT et UNIQUEMENT quand la valeur actuelle est vide —
  ne touche jamais une abréviation ou une icône déjà choisie par l'utilisateur, ni une matière hors banque
  (toujours identifié par l'ID, jamais attribué à la main).

Tests : `subject-bank.mjs` **6/6** — SB2 étendu (icônes des 14 matières, pas de doublon entre elles), SB-DASH
étendu (3 cas réels : nom sans tiret + icône vide → corrigés ; matière renommée + abréviation personnalisée →
seule l'icône complétée ; abréviation vide reproduisant exactement le bug signalé par Jean → corrigée ;
matière hors banque → jamais touchée). Sensibilité prouvée : mutants F2 (déjà existant, élargi) et nouveau
F3 (icônes retirées de la création), tous deux détectés. Non-régression : `catalog-keyboard.mjs` **7/7**,
`flash-orphan-subject.mjs` **1/1**, `battery.mjs` **19/19**. Vérifié visuellement (captures d'écran réelles,
navigateur + émulateur) : écart icône→texte ~10px (`gap` normal), styles de survol calculés conformes
(bordure/fond/icône/chevron bleus). Déployé et vérifié (SHA-256 local = live).

## Notification superflue, saccades du badge « Session Flash », page dédiée pour la banque de matières, animation du nuancier (2026-10-02)

- **Notification "X matières ajoutées, Y déjà présentes" supprimée** (jugée superflue par Jean) aux 3 points
  d'application de la banque (automatique après inscription, assistant de présentation, bouton Paramètres) --
  l'application reste silencieuse ; seul un message d'ÉCHEC subsiste (sinon un clic semblerait n'avoir rien fait).
  `p1BankResultMessage()` n'est plus appelée mais laissée en place (code mort inoffensif).
- **Saccades liées au badge de flashcards dues** (`#flashGlobalDueCount`) : cause réelle confirmée en lisant le
  code -- `rebuildStateFromLive()` appelle `updateFlashGlobalCount()` via `rerender()` à CHAQUE mise à jour du
  cache live subjects/courses (très fréquent : valider un tour, par ex.), et CETTE fonction (contrairement aux
  autres de `RENDERERS`, qui ne relisent qu'un état déjà en mémoire) relance une vraie requête Firestore sur
  TOUTE la collection flashcards à chaque appel -- plusieurs requêtes pouvaient se chevaucher, une réponse en
  retard écrasant un résultat plus frais (flash visible du nombre). Corrigé par un débounce (400ms, une seule
  requête par rafale d'appels rapprochés) + un numéro de génération (une réponse devenue obsolète est ignorée
  au lieu d'écraser un résultat plus récent).
- **Page "Banque de matières" de l'assistant de présentation jugée "moche et non visible"** : elle était injectée
  SOUS les 4 points de la page "Matières", se retrouvant tassée en bas, en grande partie hors champ, nécessitant
  un ascenseur pour l'atteindre. Déplacée sur sa PROPRE page dédiée (`id: 'banque-matieres'`, `since: 3`,
  `ONB_VERSION` 2→3), juste après "Matières", sur le même principe que `items-settings`/`entrainements-settings`
  (`settingsOnly`+`hiddenFromIntro`). Même avec sa propre page, les 14 pastilles pouvaient encore repousser la
  case à cocher (l'action demandée) hors champ : la liste des pastilles défile maintenant dans son PROPRE cadre
  borné (`max-height` + bordure), la case et la note restant toujours visibles juste en dessous -- uniquement
  dans l'assistant (`.p1-subject-bank-onb .p1-subject-bank-groups`), la page de présentation déconnectée garde
  toute sa place, sans cadre borné.
- **Animation d'apparition/disparition du nuancier de recoloration** (comparaison EDN) : la ligne entière est
  régénérée à chaque bascule (pas de classe show/hide persistante sur un élément qui reste en place), donc une
  `transition` CSS classique ne jouerait jamais (l'élément n'existe pas encore à l'ouverture, disparaît avant
  d'avoir pu en jouer une à la fermeture). Résolu avec une `animation` CSS (joue toujours dès la création de
  l'élément, même si la classe de fin est déjà présente) : à l'ouverture, le nuancier apparaît normalement ; à
  la fermeture, l'état logique (`openRowId`) change immédiatement mais le DOM continue de rendre le nuancier
  encore un instant avec la classe `.is-closing` (animation de sortie), puis un `setTimeout` (160ms, avec
  protection contre un rebasculement entretemps) referme réellement en le retirant du rendu. Les deux cas
  s'enchaînent aussi correctement en passant directement d'une ligne ouverte à une autre.

Tests : `subject-bank.mjs` **6/6** (SB-ONB adapté au clic supplémentaire pour atteindre la nouvelle page dédiée).
Nouveau script jetable confirmant le cycle complet de l'animation (apparition avec la bonne `animation-name`,
présence avec `.is-closing` juste après la fermeture, disparition réelle du DOM après le délai) -- supprimé
après usage, comportement déjà exercé par les scénarios existants du gestionnaire de catalogue. Non-régression :
`catalog-custom.mjs` **14/14**, `catalog-keyboard.mjs` **7/7**, `battery.mjs` **19/19**. Vérifié visuellement
(capture d'écran réelle de la nouvelle page dédiée). Déployé et vérifié (SHA-256 local = live).

## Récapitulatif de l'assistant, verrou de scroll du check de validation, pastille J, animation d'ajout EDN (2026-10-02)

- **Libellé incomplet dans le récapitulatif** ("Affichage de la page" sans préciser laquelle --
  retour de Jean : "il manque Entraînement nan ?") : `SETTINGS.trainingsPage.label` devient
  "Affichage de la page Entraînements". Affecte l'étape de réglage ET le récapitulatif final
  (tous deux lisent `c.label`), jamais la carte Paramètres réelle (markup séparé, non concerné).
- **Ligne manquante dans le récapitulatif pour la banque de matières** : le choix de la case à
  cocher (page dédiée) n'est pas un réglage `SETTINGS`/`choices[]` standard, `allSettings()` ne
  le voyait donc jamais. Ajoutée à la main dans `renderRecap()`, même apparence que les autres
  lignes, uniquement quand la page `banque-matieres` a réellement fait partie du parcours
  (jamais en mode ECOS).
- **Verrou de scroll pendant le check de validation d'un tour** (`showTourSuccessAnimation()`) :
  le mécanisme (verrouillage à l'apparition, compensation par padding-right, déverrouillage à la
  disparition) existait déjà, mais le déverrouillage se déclenchait au moment où le FONDU de
  sortie COMMENÇAIT (opacity encore à 1), retirant instantanément le padding-right de
  compensation PENDANT que l'overlay, encore bien visible, s'estompait dessus -- décalage du
  contenu de fond visible à travers le flou tant que l'opacité n'était pas retombée à 0. Déplacé
  dans le même `setTimeout` qui remet déjà `width`/`height` à vide une fois la transition
  `opacity 0.3s` terminée (voir `.tour-success-overlay`) : la scrollbar ne réapparaît qu'une fois
  l'overlay totalement invisible.
- **Pastille "Révisions J" (`.day-j-badge`) pas alignée sur le bouton "Organisation de la
  journée"** (`.day-detail-open-btn`) : même décalage de hauteur/survol que celui DÉJÀ corrigé
  pour le tactile (media `(hover: none)`, voir commentaire existant juste à côté) mais jamais
  répercuté sur le gabarit DESKTOP de base. Repris à l'identique (24×24px, bordure `#bfdbfe`,
  survol inversé bleu plein + ombre), y compris les variantes sombre et pastel.
- **Animation d'ajout "comme sur TypixClin"** (descente en douceur jusqu'en bas du modal PUIS
  apparition de la ligne, portée de `revealAdded()`/`growRow()` de TypixClin, elles-mêmes nées
  d'un retour de Jean antérieur sur CE fichier) : adaptée à l'architecture P1Planner (rendu
  immédiat, pas de rendu différé comme côté TypixClin). Deux pièges réels trouvés en testant :
  1. La ligne était déjà rendue à sa taille normale (architecture "optimiste puis confirmée") --
     la réduire seulement au moment de la "faire pousser" donnait un flash (pleine taille vue
     pendant la descente, PUIS réduite à 0 d'un coup, PUIS regrandie). Corrigé en réduisant la
     ligne IMMÉDIATEMENT après le tout premier rendu (encore synchrone, rien n'est encore peint
     à l'écran), sa taille naturelle capturée AVANT réduction (lue après aurait donné des zéros).
  2. Le second `_p1CatalogRenderList()` après confirmation serveur (ET l'écoute temps réel A2,
     qui se déclenche aussi pour l'écriture qu'on vient SOI-MÊME de faire) reconstruisaient tout
     le DOM de la liste PENDANT que l'animation jouait encore, la coupant net. Un drapeau
     (`_p1CatalogRevealingId`) fait sauter ces deux redessins tant que l'animation de la ligne
     concernée n'est pas terminée -- sans danger : `_p1CatalogCommit()` a déjà mis à jour la
     donnée, un prochain rendu l'affichera de toute façon à jour.
  Respecte `prefers-reduced-motion`, annulable par un geste utilisateur (molette/tactile)
  pendant la descente, filet de sécurité si l'onglet est caché (images suspendues).

Tests : `subject-bank.mjs` **6/6** (SB-ONB étendu : vérifie la ligne du récapitulatif ET le
libellé "Entraînements", contre-preuve faite -- échoue sans le correctif, mutant **F4** détecté).
Verrou de scroll vérifié par script jetable (overlay affichée -> body.overflow=hidden ; PENDANT
le fondu de sortie -> encore verrouillé ; après -> déverrouillé, aucun décalage du point de
référence). Pastille J vérifiée par comparaison directe des styles calculés (hauteur, bordure,
survol) avec `.day-detail-open-btn` -- identiques. Animation d'ajout vérifiée par chronologie
complète (hauteur de la ligne + classe `.is-new` toutes les 40ms) ET capture d'écran réelle.
Non-régression : `catalog-custom.mjs` **14/14**, `catalog-keyboard.mjs` **7/7**, `catalog-
safety.mjs` **4/4** (écoute temps réel A2 modifiée), `train-catalog.mjs` **8/8**, `battery.mjs`
**19/19**, `flash-orphan-subject.mjs` **1/1**. Déployé et vérifié (SHA-256 local = live).

## Texte redondant (ressources), gestionnaire qui se fermait à l'édition, switch Tours (2026-10-03)

- **Texte redondant dans "Configurer les ressources"** (retour de Jean, capture à l'appui) : chaque
  carte affichait le nom de la ressource DEUX fois (la pastille colorée `.resource-option-preview`
  ET `.resource-option-name` juste en dessous). Le second retiré, CSS laissée en place (inoffensive).
- **"Modifier" une matière/un item/une SDD depuis « Gérer mon programme » fermait ce gestionnaire**
  (retour de Jean : "pourquoi... le modal gérer les matières se ferme ?"). Cause confirmée en lisant
  le code : `buildModal()` est un singleton à ID fixe (`#tpx-modal-overlay`) -- ouvrir la fiche
  d'édition (qui utilise la MÊME fonction) détruisait donc déjà le gestionnaire au moment même du
  clic sur "Modifier". Un bug JUMEAU avait déjà été corrigé pour "Supprimer" (voir D3,
  delete-animation.mjs, session du 29/09) via un `setTimeout(openManager...)` explicite et local à
  CE SEUL endroit -- jamais généralisé. Jean a d'abord demandé un vrai empilement (fiche PAR-DESSUS
  le gestionnaire, qui resterait visible dessous), puis simplifié : "à la limite... que le modal de
  gestion s'ouvre à nouveau (même fonctionnement que sur TypixClin)". Porté depuis TypixClin
  (`mgrPendingReturn`/`ov._tpxReturnTo`/`reopenManager()`, déjà éprouvé là-bas pour EXACTEMENT ce
  même bug, commentaire TypixClin à l'appui) : la ligne "Modifier" retient l'onglet et la recherche
  en cours AVANT d'ouvrir la fiche fille ; `buildModal()` capture cet état sur la nouvelle fenêtre
  (`ov._tpxReturnTo`), le fait remonter à travers d'éventuelles fenêtres petites-filles (confirmation
  de suppression DEPUIS la fiche d'édition, ex. `confirmDeleteSpecialty(id, m.close)`) ; à la
  fermeture de la DERNIÈRE fenêtre fille (validation, annulation, croix, voile, Échap -- un seul
  `close()` partagé), le gestionnaire se rouvre automatiquement, même onglet, même recherche, sans
  jamais relâcher le verrou de scroll entre les deux (aucun saut visible). "Supprimer" garde son
  propre correctif existant (déjà testé, inutile d'y toucher).
- **Switch "Moyenne de l'item"/"Confiance sur le tour"** (modal Tours du jour/de la semaine, retour
  de Jean : "j'aime pas ce bouton switch, mets le même que dans les paramètres" + "ajoute une
  animation... entre un état et l'autre") : `.settings-seg` (Paramètres) désactive complètement le
  pouce coulissant générique (`.seg-thumb { display:none; }`) et bascule juste une classe `.active`
  d'un fondu de couleur instantané -- lui donner EXACTEMENT ce traitement aurait donc supprimé la
  seule vraie transition entre les deux états, à l'opposé de la deuxième demande. Nouvelle classe
  `.tours-metric-seg` reprenant l'HABILLAGE de `.settings-seg` (pastille active blanche + texte bleu
  sur fond gris clair, au lieu du pouce bleu plein générique) tout en GARDANT le pouce coulissant
  (`window._positionSegThumb`, déjà câblé des deux côtés) recoloré en blanc -- le meilleur des deux :
  même apparence que Paramètres, et une vraie animation de glissement (que ni la version Tours
  d'origine -- bleu plein mais au moins animée -- ni celle de Paramètres -- blanche mais statique --
  n'offraient à elles seules).

Vérifié visuellement (captures d'écran réelles, navigateur + émulateur, dont le pouce blanc à
mi-glissement). Non-régression : `battery.mjs` **19/19**, `delete-animation.mjs` **4/4** (nouveau
scénario D4, contre-preuve faite -- échoue sans le correctif, mutant **G1** détecté),
`catalog-custom.mjs` **14/14**. Déployé et vérifié (SHA-256 local = live).

## Scrollbar toujours visible pendant le check de validation, séparation et animation des groupes-jour « Révisions J » (2026-10-03)

- **Scrollbar de `<html>` toujours visible pendant le check de validation d'un tour** (retour de
  Jean, capture à l'appui : "POURQUOI quand l'animation check apparait la barre de défilement
  latérale est toujours présente alors que je t'avais justement demandé qu'elle soit abscente ?").
  Root cause réelle, contredisant un commentaire existant dans le code qui affirmait le contraire
  ("vérifié" à tort) : `document.body.style.overflow = 'hidden'` (posé par `_ednApplyScrollLock`)
  n'a strictement AUCUN effet sur la scrollbar réellement visible dans ce tableur, puisque c'est
  `<html>` qui défile ici (`overflow-y: auto` en CSS), jamais `<body>`. Le verrou posait donc bien
  `body.style.overflow`, mais la scrollbar de `<html>` restait affichée tout du long. Corrigé par
  une classe purement VISUELLE (`.p1-scrollbar-hidden` sur `<html>`, `scrollbar-width: none` +
  `::-webkit-scrollbar { display: none }`), posée/retirée exactement en même temps que le verrou
  (`_ednApplyScrollLock`) -- JAMAIS `overflow`/`position` sur `<html>` lui-même, qui casserait
  `position:sticky` sur ses descendants (header collant de la liste des cours), contrainte déjà
  documentée et vérifiée ailleurs dans ce même fichier (voir le commentaire dans
  `_ednApplyScrollLock`).
- **Séparation entre groupes-jour « Révisions J » peu lisible** (retour de Jean, capture à l'appui :
  "j'aime pas les séparations entre les différents jours... tout se confond"). Aucun contour ni
  relief ne délimitait un groupe avant (juste une légère nuance de fond d'en-tête) : "Aujourd'hui"
  et "Demain" se touchaient visuellement. Ajout d'un contour complet (`border`), d'un léger relief
  (`box-shadow`) et d'une marge accrue entre jours (0.5rem -> 0.75rem), avec variante `dark` dédiée.
- **Ouverture/fermeture instantanée des groupes-jour, sans transition** (même message de Jean :
  "le menu qui apparait pour chaque jour apparait et disparait sans transition c'est moche").
  `<details>`/`<summary>` natifs masquent tout le contenu d'un coup (`display: none`) dès qu'on
  retire l'attribut `open` -- aucune transition CSS n'est possible sur cet état binaire. Technique
  `grid-template-rows` (0fr <-> 1fr) sur un wrapper `overflow:hidden` autour d'un nouveau div
  interne (`.j-day-group-body-inner`), pilotée par un écouteur délégué posé une seule fois sur
  `#jDueBody` qui intercepte le clic natif sur `<summary>` (`_jToggleDayGroup`) : à l'ouverture,
  `open` est posé IMMÉDIATEMENT (le contenu doit exister et être mesurable par la grille) puis la
  classe qui déclenche la transition n'est ajoutée qu'à la frame suivante (sinon le navigateur
  saute directement à l'état ouvert, sans transition visible) ; à la fermeture, c'est l'inverse --
  la classe est retirée immédiatement (démarre la transition vers 0fr) mais `open` n'est retiré
  qu'APRÈS la fin de la transition (230ms), sinon `<details>` masquerait tout instantanément et
  couperait l'animation en plein milieu. "Aujourd'hui" (déplié par défaut) reçoit sa classe
  d'ouverture directement au premier rendu, sans animation, pour ne pas la rejouer à chaque
  reconstruction de la carte (après Valider/Reporter). Respecte `prefers-reduced-motion`.

Non-régression : `battery.mjs` **19/19**, `subject-bank.mjs` **6/6** (page dédiée de la banque de
matières, zone adjacente au `renderJDueCard`, intacte), `delete-animation.mjs` **4/4** (D3 flaky
pré-existant, repasse au vert isolément et en suite complète, cause déjà documentée ailleurs dans
ce fichier, non liée à ce correctif). Nouveaux scénarios dédiés : `scrollbar-lock-visual.mjs`
**SB1/SB2** (2/2, contre-preuve faite sur SB1 -- échoue sans le correctif, mutant **SB1**
détecté) ; `j-day-groups.mjs` **J1-J4** (4/4, contre-preuves faites sur J1 et J4 -- échouent sans
les correctifs respectifs, mutants **J1**/**J4** détectés). Rollback de référence (état avant ce
lot, identique à l'ancien live, SHA-256 vérifié) : `rollback/tableur.html.avant-segswitch-radius-
2026-10-03`. Déployé et vérifié (SHA-256 local = live, `188ea575…`).

## Déploiement backend complet — Firestore (rules + indexes) et Cloud Functions (2026-10-03, GO explicite : "Déploie tout en ligne quand tu peux")

Plusieurs lots de travail backend, achevés et testés lors de sessions antérieures mais jamais
commités ni déployés (voir `docs/TODO.md`, sections "Audit paiements/abonnements (2026-09-20)"
et suivantes), déployés aujourd'hui sur demande explicite de Jean. Avant tout déploiement :
relecture complète des diffs (`git diff`), vérification qu'aucune fonction exportée n'a été
supprimée (seulement des ajouts), et ré-exécution de TOUTE la suite de tests concernée plutôt que
de se fier à une mention "testé" ancienne :

- **`firestore.rules`** (85 lignes) : ferme de vrais trous de sécurité/perte de données déjà
  documentés mais jamais déployés -- `backups/{id}` (et sa sous-collection `parts/`) n'est plus
  écriture-cliente sous AUCUNE condition (avant : `create`/`delete` au propriétaire, pensé pour un
  système de sauvegarde côté client qui n'a jamais existé -- un bug ou script côté client pouvait
  supprimer de VRAIES sauvegardes) ; `notesEntrainements/{id}` récupère enfin une règle dédiée
  (retombait sur le fallback fail-closed racine, donc "Cette note n'a pas pu être chargée" pour
  100% des utilisateurs, aucune sauvegarde jamais écrite, échec silencieux) ; `referralCodes`/
  `referrals` verrouillés en lecture admin seule, écriture cliente refusée sans condition (le lien
  code<->uid passe exclusivement par les Cloud Functions, Admin SDK). `npm run test:rules` :
  **44/44**.
- **`firestore.indexes.json`** (+24 lignes, purement additif) : ajoute les index
  `entitlements(status, trialEndsAt)` et `entitlements(status, premiumUntil)` -- **corrige un bug
  de PRODUCTION réel** : `sweepExpiredTrials` échouait chaque jour en silence faute de cet index
  (requête composite impossible sans lui). Ajoute aussi `backups(createdBy, createdAt)`.
- **`functions/index.js` + nouveau `functions/referral.js`** (1251 lignes de diff, uniquement des
  ajouts -- aucune fonction exportée supprimée, vérifié par `git diff` avant déploiement) :
  - Système de parrainage complet (`referralInit/EnsureCode/CheckCode/MarkActive/MarkSeen/
    ListReferrals/ApplyCode`), déjà testé par 101 tests répartis sur 4 fichiers
    (`referral-functions.test.mjs` **33/33**, `referral-logic.test.mjs` + `referral-audit.test.mjs`
    + `referral-lotAB.test.mjs` **68/68**), couvrant notamment la concurrence (deux filleuls
    activés en même temps ne créditent jamais deux fois le bonus du parrain) et l'anti-fraude
    (alias email/points Gmail détectés, un seul filleul compté par boîte réelle).
  - Sauvegarde automatique nocturne (`scheduledUserBackup`, 3h Europe/Paris, ne garde que les 5
    dernières sauvegardes AUTOMATIQUES, ne touche jamais les manuelles/pré-restauration) et
    restauration "compléter" (fusion, ne réécrit que ce qui manque vraiment) vs "remplacer"
    (comportement historique) pour `adminRestoreBackup`. `backups.test.mjs` : **12/12** -- un
    premier run a montré un faux échec (2 sauvegardes "admin" au lieu de 1 attendue) causé par des
    données de test RÉSIDUELLES d'une session antérieure partageant le même émulateur Firestore
    longue durée (même utilisateur de test `ACTIVE3` jamais nettoyé entre deux exécutions à des
    jours différents) -- confirmé en inspectant directement les documents (deux horodatages très
    différents), nettoyé, puis **12/12** de façon stable sur deux exécutions consécutives. Pas un
    bug du code de purge (qui filtre déjà correctement par `createdBy`).
  - Durcissement des paiements Stripe : remboursement total/litige (`charge.refunded`/
    `charge.dispute.created`) retire l'accès d'un paiement unique ; migration API
    (`invoice.parent.subscription_details` en plus de `invoice.subscription`, Stripe a déplacé la
    référence) ; `syncSubscription` relit TOUJOURS l'abonnement chez Stripe au lieu de faire
    confiance à l'objet embarqué dans l'événement (Stripe ne garantit pas l'ordre de livraison --
    un `.updated` tardif pouvait "ressusciter" un abonnement déjà `.deleted`) ; `trial_end` envoyé
    à Stripe seulement si > 48h dans le futur (Stripe exigeait ce délai, sinon le Checkout
    échouait silencieusement) ; durée de paiement unique par défaut 12 mois si aucune date
    d'examen n'est enregistrée (au lieu de bloquer tout achat) ; `writeAccessUntil` ne redescend
    jamais après un achat si un essai avait déjà été prolongé par le parrainage. `premium-
    plans.test.mjs` (logique pure) : **19/19**.
  - Nouvelles fonctions de compte (`sendPasswordResetEmail`, `updateDisplayName`,
    `requestEmailChange`, `syncEmailMirror`).
  - `functions/package.json` : runtime Node 20 -> 22 (moteur `engines.node`).
- **Déploiement effectif** : `firebase deploy --only firestore` puis `firebase deploy --only
  functions`, projet `p1planner`. Un premier essai de déploiement des Functions a échoué à l'étape
  locale d'analyse du code ("User code failed to load... Timeout after 10000") -- contention CPU
  due aux émulateurs/tests tournant en parallèle sur la même machine, pas une erreur de code
  (`node -e "require('./index.js')"` chargeait sans erreur) ; un second essai a réussi. 22 des 23
  fonctions listées comme "Successful update operation" ; `adminRestoreBackup` listée "Skipped (No
  changes detected)" -- vérifié que ce n'est PAS un déploiement manqué : `firebase functions:list`
  confirme son runtime déjà à `nodejs22` et son code déjà identique au local (même situation que
  les fichiers `public/*.html`, déjà tous identiques au site en ligne avant ce lot : cette fonction
  avait déjà été déployée isolément lors d'une session antérieure, jamais committée sur git).
  `firebase functions:log` après déploiement : tous les conteneurs démarrés sainement
  ("STARTUP TCP probe succeeded"), aucune entrée d'erreur.
- Événements `charge.refunded`/`charge.dispute.created` déjà activés sur le endpoint webhook dans
  le Dashboard Stripe (confirmé par Jean) -- le correctif est donc pleinement opérationnel, aucune
  action supplémentaire requise.
- Hosting (`public/*.html`, favicons, manifest, modules JS séparés) déjà entièrement identique au
  site en ligne avant ce lot (vérifié par SHA-256 sur chaque fichier) -- rien à redéployer côté
  Hosting au-delà de `tableur.html` (voir section précédente).

## 3 retouches reprises de TypixClin — clavier virtuel, légende Supports, bouton bleu (2026-10-03/04, demande explicite de Jean, audit TypixClin `TableurEnLigne.html` du 03/10 soir)

Trois correctifs demandés par Jean en reprenant des retouches faites le même soir sur TypixClin,
adaptés (jamais copiés à l'aveugle, architectures divergentes depuis le fork du 30/08) :

- **A. Clavier virtuel téléphone, listes personnalisables (`#p1-catalog-modal`)** -- bug
  REPRODUIT sur P1 (confirmé par un test réel avant tout correctif : réduction simulée du
  `visualViewport`, mesure `getBoundingClientRect`/`elementFromPoint` -- le champ touché devient
  `fullyVisible:false`/`touchable:false` sans correctif), mais pour une cause DIFFÉRENTE d'EDN :
  côté EDN, un mécanisme global (`tcp-kb-pin`, liste `OVERLAYS`) s'appliquait mais suivait mal un
  textarea (`caretFollow` ne gère que `contentEditable`) ; côté P1, `#p1-catalog-modal` n'a PAS la
  classe `.settings-modal-overlay` et n'est donc concerné NI par `tcp-kb-pin` (liste `OVERLAYS`,
  ~L59348) NI par le bloc tablette (`OVERLAY_CLASSES`, ~L58064) -- aucune gestion n'existait du
  tout. Correctif LOCAL et dédié, sans toucher aux deux mécanismes globaux existants :
  `_p1CatalogKeepFieldVisible` (cible = `.p1-catalog-row` ou `.p1-catalog-field` pour la ligne
  "Ajouter", zone visible = intersection du conteneur réellement défilant et du
  `visualViewport`, marge 12px), `_p1CatalogScheduleKeepVisible` (passes 60/180/320/520/800ms,
  le clavier arrive par étapes sur iOS/Android), re-déclenché sur `resize` de `visualViewport`/
  `window` tant que le gestionnaire est ouvert, gardes : pas dans les 500ms suivant un
  `touchmove` (jamais lutter contre le doigt), pas pendant `_p1CatalogRevealingId` (animation
  d'ajout en cours). Porté/adapté de `keepFieldVisible` (TypixClin, gestionnaire local des
  catégories, ~L22014).
- **B. Légende « Supports disponibles » (`#legendModal`)** -- écrite EN DUR (4 entrées figées,
  ignorant tout ajout/renommage/recoloration/suppression). Reconstruite depuis `AVAILABLE_SUPPORTS`
  (`_p1RenderSupportLegend`), même balisage/styles qu'avant. Un support par défaut JAMAIS renommé
  garde son texte historique de légende (`P1_SUPPORT_LEGEND_LEGACY = { conf: 'Conférence' }` --
  seul "conf" diffère de son label réel "Conf" dans l'historique P1, les 3 autres défauts
  coïncident déjà) ; dès qu'il est renommé, le nouveau nom s'affiche. Rafraîchie après toute
  modification locale (`_p1CatalogAfterChange`) ou distante (`_p1ApplyCatalogsSnapshot`, couvre
  aussi le chargement initial) ET à chaque ouverture de la légende (voir C). Porté/adapté de
  `renderSupportLegend` (TypixClin).
- **C. Bouton bleu (icône blanche) tant que sa fenêtre est ouverte** -- `.legend-button`/
  `.timer-button`/`.planning-legend-btn`, redevient gris à la fermeture, quel que soit le chemin
  (bouton, croix, clic ailleurs, défilement qui referme sur téléphone -- mécanisme préexistant,
  voir plus bas). Bloc générique en fin de page (`#p1-pop-open`/`#p1-pop-open-style`), sans
  modifier aucune fonction d'ouverture/fermeture existante : `MutationObserver` sur l'attribut
  `class` de la fenêtre associée (le `nextElementSibling` du bouton), ouverte = `show` sans
  `closing`. Déclenche aussi le rendu de la légende (B) à l'ouverture de `#legendModal`. CSS :
  bleu fixe `linear-gradient(135deg, #3b82f6, #2563eb)` (jamais `var(--primary-gradient)`, violet
  `#8b5cf6` en thème sombre dans P1) en clair/sombre, variante pastel dédiée, sélecteur à
  spécificité renforcée (`.p1-pop-open` répété 3×) + `!important` pour l'emporter sur les couleurs
  d'état du chrono (vert/ambre, elles-mêmes `!important`) -- revient au vert/ambre à la fermeture.
  Porté/adapté de `tpx-pop-open` (TypixClin).

**Piège de test réel découvert en écrivant la suite** (consigné en commentaire dans le fichier de
test pour la suite) : `page.setViewport({isMobile,hasTouch})` déclenche un VRAI rechargement de
la page dans cet environnement Puppeteer/Chrome dès que ces indicateurs CHANGENT (confirmé :
`window.currentUser` devient momentanément `null` puis se réauthentifie seul, ~2s) -- y compris
en repassant du mobile au bureau ; changer SEULEMENT la hauteur (même `isMobile`/`hasTouch`) ne
recharge rien, c'est cette propriété qui sert à simuler le clavier virtuel sans perturber l'état
de l'app. Second piège, propre à `.planning-legend-btn`/`#planningLegendModal` : un mécanisme
PRÉEXISTANT (non touché par ce lot, "FERMETURE DES MODALS EN CLIQUANT AILLEURS", ~L40553) referme
déjà ces fenêtres au moindre évènement `scroll` sur téléphone (debounce 50ms) -- un scroll
incident (reflow de la page) s'immisce parfois entre l'ouverture et la vérification en
automatisation, fermant la fenêtre avant la mesure. Résolu en ouvrant/vérifiant dans le MÊME tick
JS (`await Promise.resolve()` pour laisser le `MutationObserver`, lui-même en micro-tâche, réagir
sans rendre la main à la boucle d'évènements où le `setTimeout` du scroll-close pourrait s'exécuter).

Tests réels (émulateurs + navigateur, nouveau fichier `test/e2e/pop-legend-keyboard.mjs`, 12
scénarios, stable sur 3 exécutions complètes consécutives) : **A1/A2** (12/12 avec B/C), incluant
une vraie frappe + sauvegarde Firestore pendant la simulation du clavier virtuel ; **B1-B5**
(légende d'origine identique, ajout/renommage en direct/suppression/synchro multi-appareil) ;
**C1-C5** (4 boutons, dont chrono vert->bleu->vert, thèmes sombre/pastel, téléphone). Contre-
preuves faites sur les 3 parties (code temporairement neutralisé -> échec confirmé -> restauré) :
mutants **KBV1** (A), **LEG1** (B), **POP1** (C) ajoutés à `mutants.mjs`, tous détectés.
Non-régression : `battery.mjs` **19/19**, `subject-bank.mjs` **6/6**, `catalog-keyboard.mjs`
**7/7**, `catalog-custom.mjs` **14/14**, `delete-animation.mjs` **4/4**, `j-day-groups.mjs`
**4/4**, `scrollbar-lock-visual.mjs` **2/2**. 56 blocs `<script>` inline analysés, 0 erreur ; CRLF
préservé (66 906 / 0 bare LF). Rollback de référence (état avant ce lot, identique à l'ancien
live) : `rollback/tableur.html.avant-pop-legend-keyboard-2026-10-04`. Déployé et vérifié
(SHA-256 local = live, `cfa59f26…`).

## Popovers « Matières » et « Statut » du modal « Organisation de la journée » : animation, état ouvert, flèche (2026-10-07, capture d'écran de Jean)

Trois retours en un message : les deux popovers apparaissaient/disparaissaient sans animation, rien
n'indiquait sur le bouton que la fenêtre était déployée, et la flèche du Statut ne bougeait pas.

- **Cause de l'absence d'animation** (lue dans le code, pas devinée) : `.pdd-spec-pop` et
  `.pdd-status-menu` passaient de `display:none` à `display:block` DANS LA MÊME FRAME que le
  changement d'opacité/transform -- le navigateur n'a aucun état de départ à partir duquel
  transitionner, la transition CSS déclarée ne jouait donc jamais (ni à l'ouverture ni à la
  fermeture). Corrigé en gardant les deux éléments en `display:block` en permanence et en les
  masquant par `opacity:0; visibility:hidden; pointer-events:none` ; `visibility` est retardée de
  la durée du fondu (`0s linear .18s`) à la fermeture pour que le fondu se voie, et immédiate à
  l'ouverture. Fondu + léger zoom/translation, `prefers-reduced-motion` respecté.
- **État « ouvert » des boutons** : classe `.is-open` + `aria-expanded` posés/retirés par
  `openSpecPop`/`closeSpecPop`/`openStatusMenu`/`closeStatusMenu` (fonction `setPopBtnOpen`), donc
  sur TOUS les chemins de fermeture (OK, voile, Échap, clic extérieur, fermeture du modal).
  Matières : bordure + anneau bleu, fond bleu clair (variante sombre). Statut : anneau teinté de
  la couleur du statut courant (`color-mix`, repli bleu), bordure du statut conservée pour ne pas
  perdre l'identité du type de journée.
- **Flèche du Statut** : `.pdd-caret` pivote de 180° (`transition: transform .25s`) quand le bouton
  est `.is-open`, et revient à la fermeture.

Tests : nouveau `test/e2e/pdd-popovers.mjs` **3/3** (vraies transitions CSS détectées via
`getAnimations()` -- l'échantillonnage de l'opacité image par image est inexploitable en Chrome
headless, qui ne produit pas de frames régulières ; menu fermé intouchable). Contre-épreuves :
mutants **PDD1/PDD2/PDD3** détectés. Non-régression : `battery.mjs` 19/19, `j-day-groups.mjs` 4/4,
`pop-legend-keyboard.mjs` 12/12, `delete-animation.mjs` 4/4. Piège d'environnement noté : Edge ne
démarre plus en headless sur cette machine -- tests lancés avec `BROWSER_PATH` pointant sur Chrome.
Rollback : `rollback/tableur.html.avant-pdd-popovers-2026-10-07`. Déployé et vérifié (SHA-256
local = live, `89ed24bb…`).

## Curseur « main » sur le bouton Matières ouvert (2026-10-08, défaut constaté sur TypixClin, repris sur P1)

- **Défaut reproduit sur P1 avant tout changement** : fenêtre « Matières » ouverte, `#pdd-spec-backdrop`
  (fond transparent plein écran, `position:fixed; inset:0`, sert au clic-dehors) recouvre aussi le
  bouton `#pdd-spec-btn` ; `elementFromPoint` y renvoie le backdrop, curseur calculé `auto`. Le clic
  referme déjà correctement (mousedown du backdrop), mais rien n'indiquait qu'on pouvait cliquer.
- **Statut non concerné** : son menu n'a pas de backdrop (fermeture par écouteur `document`), le bouton
  reste au-dessus et garde sa main.
- **Correctif (ajout seul)** : écouteur `mousemove` sur le backdrop -> `cursor:pointer` quand la souris
  est dans `getBoundingClientRect()` du bouton, `''` sinon. Fermeture d'origine (mousedown) intacte :
  un clic sur le bouton referme sans rouvrir (mousedown sur le backdrop, mouseup sur le bouton, aucun
  `click` n'est donc émis sur le bouton) et la fenêtre de la journée reste ouverte.
- Tests : `pdd-popovers.mjs` **P4** (4/4 au total) ; échouait avant le correctif (curseur `auto`) ;
  mutants **PDD4** (main supprimée) et **PDD5** (main sur tout le fond) détectés. Non-régression :
  `battery.mjs` 19/19, `j-day-groups.mjs` 4/4, `pop-legend-keyboard.mjs` 12/12, `delete-animation.mjs`
  4/4. CRLF préservé (66 936 / 0 bare LF). Rollback : `rollback/tableur.html.avant-pdd-cursor-2026-10-08`.
  Déployé et vérifié (SHA-256 local = live, `570a2443…`).

## Formulaire d'inscription (astérisques, erreurs qui disparaissent) + nom des utilisateurs dans le panneau admin (2026-10-08)

**1. Formulaire d'inscription (`auth.html`)** -- retour de Jean (capture : erreurs « Merci d'indiquer ton nom »
restées affichées sous un nom déjà saisi) :
- Astérisque rouge (`.req-star`, `aria-hidden`, l'attribut `required` suffit aux lecteurs d'écran) sur les 6
  champs obligatoires (prénom, nom, email, mot de passe, confirmation, conditions) + légende « Champs
  obligatoires ». Le code de parrainage (facultatif) n'en porte pas. Interprété comme un astérisque (la
  convention usuelle) et non une croix, qui évoquerait une erreur.
- Revérification à la frappe, UNIQUEMENT pour un champ déjà marqué invalide (aucune erreur prématurée pendant
  la première saisie) : l'erreur disparaît dès que la règle de soumission est satisfaite et revient si on
  re-soumet une valeur invalide. Confirmation du mot de passe : retour en direct déjà existant (inchangé).
  Le message global « accepte les Conditions » disparaît quand la case est cochée.
- Tests `signup-form.mjs` **3/3**, mutants **SGN1/SGN2/SGN3** détectés ; `referral-ui.mjs` **25/25**.

**2. Nom absent dans le panneau admin** -- cause (lue dans le code, documentée par les commentaires de
`onUserCreated`/`resolveReferralDisplayName`) : `auth.html` fait `createUser` PUIS `updateProfile` ;
`onUserCreated` s'exécute dès la création, donc AVANT que le nom existe, et écrit `displayName:null` dans
`users/{uid}`. Le nom n'atteignait Firestore que si l'utilisateur le rééditait dans les Paramètres
(`updateDisplayName`) ou s'il venait de Google. Le panneau admin, la liste d'amis (« Utilisateur ») et les
noms de filleuls lisent Firestore. Correctif (option 1 choisie par Jean, pas de bouton admin) :
- `mirrorAuthNameToProfile(uid)` : recopie le nom du compte Auth dans la fiche quand elle n'en a pas ;
  jamais d'écrasement d'un nom existant, nettoyé (`sanitizeReferralName`, 2-60 car.), jamais bloquant,
  transactionnel. Appelé à l'inscription (`referralInit`), à chaque connexion vérifiée (`referralMarkActive`,
  AVANT son retour anticipé pour les comptes sans parrain) et à l'ouverture du tableur (`referralEnsureCode`)
  : les comptes existants se corrigent à leur prochaine connexion/ouverture, sans toucher à la production.
- `onUserCreated` ne remet plus un nom déjà recopié à `null` (course possible : `referralInit` peut passer
  avant le trigger) ; comportement d'origine conservé quand il n'y a ni nom ni fiche.
- Tests `profile-name-mirror.test.mjs` **9/9** (vrai code via `.run()`), mutants (recopie neutralisée /
  onUserCreated qui écrase / hook retiré avant le retour anticipé) tous détectés ; non-régression Functions
  **141/141** (premium-plans, 4 suites parrainage, sauvegardes, nouveau fichier).
- Déploiement : Hosting (`auth.html`, SHA-256 local = live `c144399e…`) + 4 Functions ciblées
  (`onUserCreated`, `referralInit`, `referralEnsureCode`, `referralMarkActive`), logs sans erreur.
  Rollback : `rollback/auth.html.avant-signup-form-2026-10-08`.

### Bug de production trouvé en vérifiant ce déploiement : la sauvegarde nocturne échouait chaque nuit (2026-10-08)

- Les logs Cloud Functions montraient `scheduleduserbackup : The default Firebase app does not exist` aux
  exécutions de 03:00 (Paris) des 07 et 08/10 -- donc aucune sauvegarde automatique n'a été créée depuis le
  déploiement du 03/10 (les sauvegardes manuelles admin, elles, fonctionnaient). Cause : `_runScheduledBackups`
  appelait `getAuth()` directement ; sur une instance froide, rien n'avait encore appelé `db_()`/`auth_()`
  (seuls à initialiser l'app Admin, voir `ensureApp_`). Les tests existants ne pouvaient pas le voir : leur
  harnais initialise l'app Admin AVANT de charger `functions/index.js`.
- Correctif : `getAuth()` -> `auth_()` (une ligne). Nouveau test `scheduled-backup-init.test.mjs` : charge
  `functions/index.js` dans un processus NEUF, sans aucune initialisation préalable, puis exécute la tâche --
  contre-épreuve faite (échoue avec `getAuth()`, passe avec `auth_()`).
- Déployé : `firebase deploy --only functions:scheduledUserBackup`. **À constater** : l'exécution de
  03:00 (Paris) de cette nuit doit journaliser « N sauvegarde(s) créée(s) » au lieu de l'erreur
  (`firebase functions:log`).
- Test `backups.test.mjs` rendu auto-nettoyant (l'identifiant fixe `ACTIVE3` accumulait les données d'une
  exécution à l'autre : 19 sauvegardes auto résiduelles faussaient le décompte -- faux échec, pas un bug de
  purge) ; stable sur 3 exécutions consécutives sans nettoyage manuel.

- **Réserve honnête sur les tests de concurrence du parrainage** (`referral-functions` « 2 filleuls activés en concurrence », `referral-audit` F3 « deux alias en Promise.all ») : sur l'émulateur ils échouent désormais de façon intermittente (« 3 INVALID_ARGUMENT: Transaction is invalid or closed »), alors qu'ils passaient en début de journée. Mesuré en A/B : version HEAD (sans la recopie du nom) 4/8 et 6/8 exécutions en échec, version avec recopie 6/8 puis 3/8 (émulateur redémarré à neuf) : le défaut est préexistant et indépendant de ce lot. À investiguer à part : si le message provient du SDK Admin en production et non du seul émulateur, il concernerait deux activations simultanées pour un même parrain.

## Sessions de travail, entraînements du jour, graphique « Temps », Paramètres, copie Premium (2026-10-11)

> Tout en local (émulateurs) : **aucun déploiement, commit ni push** (le prompt l'interdisait). Fichiers à publier au GO de Jean :
> `public/tableur.html`, `public/comptepremium.html`, `firestore.rules`, `functions/index.js` (+ `public/auth.html`, modifié avant).

- **Stockage** : `users/{uid}/workSessions/{id}`, UN document par ajout (`date` locale AAAA-MM-JJ, `kind` null = session de travail /
  id de type d'entraînement, `label` ≤ 40, `count`, `minutes` 1..1440, `createdAt/updatedAt`, `deletedAt`). Jamais dans `calendarDays`
  (`p1SaveDay` y écrit en `merge:false` avec 3 champs : il effacerait les sessions). Écriture immédiate (`_fsSetDoc`, donc comptée dans
  `_p1UnconfirmedWrites`), id généré côté client, suppression = soft delete (`deletedAt`, `updateDoc`). Règles : create/update par
  `canWrite`, update limité à `deletedAt`/`updatedAt`, delete interdit. Ajouté à `ADMIN_BACKUP_SUBCOLLECTIONS` ; la restauration
  « compléter » rétablit une session supprimée depuis (`deletedAt` traité comme `archivedAt`).
- **Plafond de 24 h/jour** (tours + sessions + entraînements) : garde d'INTERFACE uniquement (les Rules ne peuvent pas sommer une
  collection) — un client modifié pourrait le contourner, sans effet sur la sécurité des données d'autrui.
- **Cache hors ligne** : Firestore persistant (IndexedDB) si disponible, sinon mémoire ; en mémoire, une écriture non confirmée est perdue
  au rechargement (comme tous les autres écrits ; l'avertissement avant de quitter les compte). Non vérifiable en Safari privé ici.
- **Types d'entraînement** (réponse de Jean) : QCM, Annale, Colle, Concours blanc, tous en mode « saisie » (table générique
  `{id,label,couleur,mode:'plus1'|'saisie',minutesParDéfaut}` ; `plus1` géré mais inutilisé). Zone « saisie » : nombre ±1 (valeur
  d'origine 1) et temps ±5 min, avec répétition à l'appui prolongé et pastilles de valeurs ; **le prompt disait « −/+ de 5 » pour les deux : à valider**.
- **Temps** : les cartes « Temps » (jour, général) = tours + sessions + entraînements ; elles restent visibles en mode compact
  (avant : masquées car seules les durées de tours y comptaient). `calculateStats/calculateDailyStats/getWeeklyData` exposent les
  minutes de sessions/entraînements ; `window.p1ToursMinutesFor(date)` sert au plafond.
- **Graphique** : 3 parts empilées (Tours #3b82f6 / Sessions #d97706 / Entraînements #8b5cf6), légende HTML à bascule (`aria-pressed`),
  échelle FIXE (max = jour le plus chargé arrondi au pas 0,5/1/2/4 h, axe de 46 px). Aucune reconstruction fenêtre ouverte ; UNE seule
  à la fermeture, et seulement si la signature (données, thème, pastel, taille des canevas) a changé.
- **Pastilles** (complément) : vrais boutons ; actif ambre en `#b45309` (et non `#f59e0b`) car texte blanc exigé → 5:1 au lieu de 2,1:1.
  Survol sous `@media (hover:hover)` uniquement. La bordure de 1,5 px est déclarée telle quelle ; Chrome l'arrondit au pixel physique.
- **Défauts d'origine corrigés** : « aujourd'hui » en date LOCALE (6 endroits) ; total hebdo en minutes exactes. **Volontairement non
  corrigés** (à lister à Jean) : date de sauvegarde quotidienne (`getTodayDateString`) et dates des trophées (UTC).
- **Paramètres** : sélecteurs à deux choix (`.settings-seg`, `.tpx-seg`) → fond blanc qui glisse (CSS, `:has()`).
- **Compte premium** : un seul « Copié ! » à la fois (verrou global, filet de 2,5 s si la copie échoue).
- **Nouveautés** : clés `whatsNewSeen_v6`/`whatsNew_seen_v6` → `v7` (tous les comptes revoient la pastille) + entrée en tête.

## Flammes et vies + retouches du 12/10 (graphique, fenêtres, mode compact) (2026-10-12)

> Tout en local : aucun déploiement, commit ni push. À publier au GO : `public/tableur.html`, `firestore.rules` (document `streak`),
> `functions/index.js` (sauvegardes). Instantané d'avant : `rollback/tableur.html.avant-flammes-2026-10-12`.

- **A — graphique** : masquer/ré-afficher une part passe par `chart.hide(i)` / `chart.show(i)` (fondu Chart.js ; repli
  `setDatasetVisibility + update`), après recalcul des `fill` sur la visibilité d'ARRIVÉE. Échelle et zone de tracé inchangées.
- **B — fenêtre Entraînements** : hauteur fixe quel que soit le contenu : cadre de la liste en grille (titre rangée 1 ; cases
  ET message « vide » dans la MÊME case rangée 2), 2 colonnes × 2 rangées réservées (4 types), message « vide » en fondu
  (`opacity/visibility`, 0,16 s / 0,22 s) au lieu de `display:none`, pastilles du récap sur 2 lignes réservées ≤ 560 px.
  Mesuré avant : liste 87 → 147 → 242 px, récap 81 → 108 px (360 px). Après : écart < 1 px.
- **C — ligne « Entraînement »** : P1 n'avait pas de détail entre parenthèses (rien à retirer) ; test de non-régression ajouté.
- **D — mode compact** (`getToursViewMode() === 'compact'`) : plus de ligne « Tours » dans la fenêtre « Temps de travail » (sous-titre
  « Sessions de travail + entraînements »), plus de part « Tours » dans le graphique ; temps du jour/semaine = sessions + entraînements
  SEULEMENT (une ancienne durée de tour ne s'y ajoute plus) ; plafond de 24 h calculé de même ; le total général « depuis toujours »
  est inchangé. Le mode est dans la signature qui décide de reconstruire le graphique ; `applyToursModeToStats` ne relance le rendu
  (`setTimeout`) que lorsque le mode a CHANGÉ (pas de boucle). La couleur suit la part, pas sa position.
- **E — flammes et vies** : `users/{uid}/streak/state` (document unique, 8 champs, schéma verrouillé, delete interdit).
  **Lecture/écriture pour tout compte vérifié, y compris en lecture seule** (`isSelfVerified`, pas `canWrite`) — décision proposée, à confirmer.
  **Pas d'anti-triche serveur** : un client peut s'inventer des flammes (sans enjeu, ne concerne que lui) ; un anti-triche exigerait une
  fonction serveur (horloge serveur + fuseau de l'élève) — décision laissée à Jean.
  Calcul = fonction pure `step()` (dates LOCALES, `new Date(a, m, j)`, insensible aux changements d'heure). Synchro = TRANSACTION
  (lecture serveur + écriture atomiques) : hors ligne, rien n'est écrit ni calculé de mémoire ; deux appareils le même jour = même
  résultat ; écriture refusée → le passage suivant relit le serveur. Déclencheurs : chargement, `visibilitychange`, `focus`, `online`, 30 s.
  Animation : une fois par jour tous appareils confondus (`anim = aujourd'hui` écrit AVANT de jouer ; `IntersectionObserver` ≥ 50 %).
  AUCUN stockage local (ni série, ni « animation vue »). Sauvegardes : `streak` ajouté ; restauration spéciale `_restoreStreak`
  (compléter ET remplacer ne font jamais reculer une série plus récente : on garde le `last` le plus grand).
  Pas d'entrée « Nouveautés » ajoutée (proposée, non demandée).

## Complément du 12/10 (soir) : 5 vies, UNE vie par absence, cœurs plus lents, aides, Nouveautés (2026-10-12)

> Remplace les règles de vies du § précédent. Local seulement, rien déployé. Instantanés d'avant : `rollback/tableur.html.avant-5vies-2026-10-12`,
> `rollback/firestore.rules.avant-5vies-2026-10-12`. À publier au GO : `public/tableur.html` et `firestore.rules`.

- **Vies** : `MAX_LIVES = 5` (5 au départ ET au maximum ; la vie offerte du lundi reste +1, plafonnée à 5). **Une absence = UNE vie**, quelle que soit
  sa durée (1 jour ou 10) : `missed ≥ 1` et `lives ≥ 1` → `lives − 1`, `count + 1`, `used = { day, n: 1 }` ; les jours manqués ne rapportent pas de
  flamme. La série repart à 1 seulement avec 0 vie (vie offerte de la semaine déjà comptée). « Vivante » à l'affichage = `step()` donnerait un +1
  (donc `last ≥ hier` ou une vie disponible, dons de la semaine inclus).
- **Règles Firestore** : `lives ≤ 5`, `used.n == 1`. Les anciens documents (lives ≤ 3, `used.n ≤ 3` jamais écrits en production) restent valides.
- **Migration** : `a232785` n'a pas de `p1Streak` → rien en production à migrer. Je n'ai AUCUN moyen d'interroger la production ni une éventuelle base
  de recette depuis ici : si des documents `streak/state` y existaient (anciens `lives ≤ 3`), ils repartent à leur valeur et ne montent à 5 que par les dons
  hebdomadaires — à vérifier avant publication ; aucune écriture n'a été faite hors émulateurs.
- **Cœurs** : 5 cœurs ; cœur qui se brise = animation CSS `wsHeartBreak` de 0,95 s (grossit ×1,5, tremble −14°/+12°/−8°, tombe en s'effaçant), 0,75 s
  entre deux cœurs, la flamme ne s'embrase qu'après le dernier. Mouvements réduits : aucune animation.
- **Aides** (voix « vous » conservée) : lignes Temps de travail / Entraînements du jour / Flammes (aide « jour »), titre « Graphiques et entraînements »,
  Temps / Entraînements (aide « 7 jours »), sans mention du mode compact. **Non demandé, laissé tel quel** : le « Conseil » de l'aide « jour » dit encore que
  « les sessions de QCM ne sont pas prises en compte » — devenu faux avec les sessions de travail ; à reformuler si Jean le souhaite.
- **Nouveautés** : entrée « Flammes 🔥 » en tête (icône dégradé `#f97316 → #ef4444`, nouvelle classe `.flame`), avant « Sessions de travail ».
  Clé de « vu » inchangée : `v7` (non publiée).

## Harmonisation de l'interface des nouvelles fonctionnalités avec l'autre outil (2026-10-14)

> Demande de Jean : le rendu des sessions de travail, entraînements et flammes ne ressemblait pas assez à l'autre outil du même éditeur. Local seulement, rien déployé.
> Instantané d'avant : `rollback/tableur.html.avant-harmonisation-2026-10-14`.

- Le code d'interface (CSS, HTML des fenêtres, logique d'ajout/suppression/animations, cartes, légende du graphique, bulle sur le côté, carte « Flammes » avec cœurs qui se fendent)
  est repris de la version de référence (lue en LECTURE SEULE) et renommé aux noms P1 (`ws-*`, `p1Ws*`, `p1Tr*`, `p1Streak*`). Les cartes sont maintenant créées par le script, comme dans la référence.
- Données et règles NON changées : `users/{uid}/workSessions` (un document par ajout, suppression douce), `users/{uid}/streak/state` (transaction), règles, sauvegardes.
- Adaptations P1 : 4 types d'entraînement (QCM, Annale, Colle, Concours blanc), tous en « nombre + temps » (petite fenêtre à la couleur du type) ; « − » retire le dernier ajout du type ;
  valeur des cartes d'entraînement = TEMPS + pastilles par type ; tutoiement dans les messages ; plafond de 24 h et message de la référence ; une session ≤ 16 h.
- Écarts assumés par rapport à la référence : chaque nom de type plus long qu'une abréviation → détail du récap sur sa propre ligne réservée à toutes les largeurs ; en thème sombre, comme la référence,
  survol et appui des pastilles gardent la teinte de survol ; choix actif ambre `#f59e0b` + texte blanc comme la référence (contraste faible, signalé à Jean).
- Cœur qui se brise : séquence de la référence (bat 0,8 s, se fend, « −1 », « Série sauvée », PUIS la flamme) — remplace mon animation de 0,95 s.

## Retouches du 2026-10-15 : liste à cocher, titres, fenêtre de la journée, changement d'onglet

> Local seulement, rien déployé ni commité. Instantanés d'avant : `rollback/tableur.html.avant-checklist-2026-10-15`, `…avant-retouches-s3-2026-10-15`, `…avant-onglets-2026-10-15`.
> Tout est dans `public/tableur.html` (modules autonomes en fin de `<body>` : `p1-note-checklist-*`, `p1-titles-css`, `p1-spec-cursor-js`, `p1-friends-tabs-*`, `p1-title-icon-up-*`, `p1-retouches-1510-css`, `p1-todo-delete-js`).

- **Liste à cocher (notes de la journée)** : bouton `data-cmd="check"` après « Liste à puces ». Stockage inchangé : du HTML dans `notes`
  (`<ul class="planning-note-check"><li class="planning-note-done">`), dans l'enveloppe `data-planning-rich="1"`. Aucun champ ni écriture nouveaux : une coche déclenche
  l'événement `input` de l'éditeur (case du planning → `setNotesInMemory` + enregistrement différé ; fenêtre → `notesInput`). Filtre `sanitizePlanningNoteHTML` : les classes
  `planning-note-check` (sur `ul`) et `planning-note-done` (sur `li`) sont gardées, retirées partout ailleurs. Case ≥ 1,3 em (fenêtre) / ≥ 15 px (planning), zone tactile
  élargie à la marge gauche, ligne la plus proche si deux zones se touchent ; toucher le texte garde l'édition. Verrouillage Premium / hors ligne : mêmes gardes que le texte du planning.
- **Titres** : tuile teintée + trait en dégradé pour les 5 titres de Statistiques ; tuile de dégradé 42 px (34 px ≤ 768) à icône blanche, sans ombre, pour les 3 titres de page et le mois du planning.
- **Fenêtre de la journée** : main sur le bouton « Matières » dès l'ouverture (dernière position connue de la souris) ; bouton fermer rouge plein au survol ET à l'appui (la règle `:focus` est gardée).
- **Clic sur l'icône d'un titre de page** : remonte comme un clic d'onglet (`nav.top + pageYOffset − 70 − 10`, défilement doux) ; en haut de page, rien ne bouge ; le « ? » n'est pas concerné.
- **Changement d'onglet** : plus de fondu (`p1PageSlideIn` = glissement seul) ; aucune animation sur `#page-items` (mesuré : seule page avec des tâches longues, 50-68 ms avec 100 cours).
  Les autres pages (Matières, Entraînements, Planning) n'ont aucune tâche longue et gardent le glissement. Le temps de calcul de « Mes cours » lui-même n'est pas traité.
- **§3 — défauts reproduits puis corrigés** : « jours depuis la dernière révision » (`getDaysSince`, pastille du tableau, priorités) en jours calendaires LOCAUX (`window.p1DaysSinceLocal`) — à 00 h 30 un cours revu
  la veille affichait 0 j ; notification de trophée fantôme (`:not(.show){visibility:hidden;pointer-events:none}`) — aucune partie du code ne la montre aujourd'hui, elle n'était qu'un élément fixe invisible mais cliquable ;
  couronne Premium masquée sur ≤ 600 px sous une fenêtre ouverte (liste des fenêtres dans le CSS, gardée pendant `tpx-nudge`) ; suppression d'une tâche animée 0,3 s (restaurée si la liste n'est pas redessinée sous 2,5 s,
  immédiate en « mouvements réduits », hors ligne ou Premium verrouillé) ; « Mes amis » : trait glissant entre onglets + fondu/montée du panneau ; graphique « Tours » en graduations entières (`ticks.precision: 0`).
- **§3 — défaut ABSENT, rien modifié** : clés de jour des statistiques hebdomadaires et du jour (déjà en jour local ; les tours sont écrits `AAAA-MM-JJT00:00:00.000Z` = le jour choisi, jour local).
- **Non traité, signalé** : les dates de déblocage de trophées sont écrites avec `toISOString().split('T')[0]` (jour UTC : entre 00 h et 02 h, heure de Paris, c'est la veille) — purement informatif, pas demandé.

- **Note vide (2026-10-17)** : `notesInput` n'efface plus une liste à puces / à cocher encore vide (sinon les boutons de liste ne faisaient rien sur une note vide) ; une liste vide n'est pas enregistrée (la note normalisée reste `''`). `p1NoteChecklist` reconnaît la liste créée quand le curseur reste sur l'éditeur. Instantané d'avant : `rollback/tableur.html.avant-note-vide-2026-10-17`.
- **Couronne / bouton d'essai** : masqués sous une fenêtre ouverte aussi en paysage téléphone (`(pointer: coarse) and (max-height: 500px)`) et dès que le corps de page est figé (verrou de défilement) ; la couronne reste pendant `tpx-nudge`.

## Annale / Colle / Concours blanc en QCM, barre de sauvegarde, flammes (2026-10-17/18)

> Local seulement, rien déployé ni commité. Instantanés d'avant : `rollback/tableur.html.avant-barre-2026-10-17`, `…avant-qcm-epreuves-2026-10-17`.

- **Annale / Colle / Concours blanc** (demande de Jean) : un ajout = UNE épreuve, et on saisit son nombre de **QCM** (« 3 annales » n'a pas de sens : 20 + 30 + 50 QCM = 3 annales, 100 QCM). Donnée inchangée : un document `workSessions` par ajout, `count` = nombre de QCM de l'épreuve
  (Rules inchangées : 1 à 1000). Affichage : nombre d'épreuves + total de QCM + QCM de chaque épreuve (tuile de la fenêtre : « 3 · 100 QCM · 3h30 · 20 · 30 · 50 »), pastilles des cartes (« 3 Annale · 100 QCM »), cellule de la semaine, récapitulatif.
  Le type **QCM** est inchangé (le nombre est le nombre de QCM). Pastilles de saisie : annale 20-60, colle 10-40, concours blanc 60-150 QCM (le champ accepte tout entier ≤ 999).
  **Données déjà saisies** : un ancien ajout « 3 annales » serait relu comme « 1 annale de 3 QCM ». Le lot n'a jamais été publié, donc aucune donnée de production n'est concernée ; sur un compte de test local, supprimer et ressaisir.
  Tuiles de la fenêtre refaites en grille (type · nombre · « − » / total + temps / détail), 84 px fixes ×2 rangées : la hauteur de la fenêtre reste indépendante du contenu.
- **Barre de sauvegarde** (`window.p1SaveBar`, module `p1-save-bar-*`) : fine barre sous l'en-tête, bleue qui avance pendant l'écriture, verte à la confirmation puis effacée, orange si l'écriture n'est pas confirmée au bout de 6 s, rouge si refusée ; l'ancien rond / coche est caché.
  Alimentée par `setSaveIndicator` (tours, tâches…) ET par toute écriture `setDoc` / `updateDoc` passant par `_p1CountWrite` (notes du planning, sessions de travail…) ; les transactions n'y sont pas branchées (la synchro silencieuse des flammes ne fait pas clignoter la barre).
- **Flammes qui ne s'affichent pas** : cause reproduite — si les règles Firestore PUBLIÉES sont celles du dernier commit (sans `streak` ni `workSessions`), la synchro est refusée : la carte reste à « – » et les sessions de travail sont refusées (`ok:false`). Avec les règles du dépôt, tout fonctionne.
  **Il faut publier `firestore.rules` pour que les flammes et les sessions marchent.** Un refus est désormais signalé en console (`[Flammes] synchro refusée par les règles Firestore…`).

- **Présélections du concours blanc (2026-10-19, demande de Jean)** : mêmes pastilles que l'annale — 20 / 30 / 40 / 50 / 60 QCM (pas de 5) et 1 h / 1 h 30 / 2 h / 3 h / 4 h ; la colle et le type QCM ne changent pas. Le champ accepte toujours n'importe quel entier ≤ 999. Instantané d'avant : `rollback/tableur.html.avant-presets-ccb-2026-10-19`. Local seulement à ce stade.

## Thème choisi dans les Paramètres (2026-10-19)

> Demande de Jean : plus de bouton de thème dans le header ; le thème se choisit dans Paramètres, sous « Listes personnalisables », avec les trois thèmes bien présentés, une courte phrase et le thème en cours indiqué. Présentation alignée sur celle de l'autre tableur du même éditeur (lue en LECTURE SEULE) : grille de 3 cartes avec mini-maquette, coche dans le coin, lignes empilées sur téléphone.
> Local seulement à ce stade. Instantanés d'avant : `rollback/tableur.html.avant-theme-parametres-2026-10-19`, `…avant-theme-cartes-2026-10-19`.

- **Header** : bouton `#theme-toggle` retiré (HTML, CSS propre au bouton, JS). Rien d'autre ne bouge : mêmes marges du header qu'avant sur PC, iPad (820, 768) et téléphone (390, 360) — mesuré (logo 24/12/8 px du bord gauche, avatar à 32/20/16 px du bord droit : valeurs identiques à avant).
- **Carte « Thème »** (`data-setting="p1-theme"`, module `p1-theme-card-*`) : insérée dans la liste des cartes des Paramètres juste après « Listes personnalisables ». Trois cartes radio (Clair, Sombre, Pastel) : mini-maquette aux couleurs fixes du thème, nom + icône, phrase, coche sur le thème en cours.
  Clavier : flèches = précédent / suivant (groupe radio, un seul élément tabulable). Le thème en cours suit aussi les changements venus d'ailleurs (réglage reçu du serveur, autre onglet).
- **Enregistrement** : inchangé — `setTheme(theme, true)` écrit `users/{uid}/settings/preferences.theme` et `localStorage`. Le point d'entrée est `window.p1SetTheme(theme)`. Le thème reçu du serveur passe maintenant par `setTheme(theme, false)` (re-rend les cellules à couleurs en ligne et les graphiques, sans réécrire sur le serveur).
- **Défauts déjà présents, non touchés** : à 360 px la page « Matières » déborde de 11 px (le bouton « réinitialiser les filtres » de `.quick-actions`) ; l'avatar est à 8 px de plus du bord droit que le logo du bord gauche sous 992 px ; le sous-titre des cartes de Paramètres a un contraste de 3,4 en thème pastel.

## Police d'écriture, écran vide des récapitulatifs, carte Thème alignée (2026-10-19, suite)

> Port, adapté aux noms de P1, de retouches validées sur l'autre tableur du même éditeur (lu en LECTURE SEULE). Local seulement à ce stade. Instantanés d'avant : `rollback/tableur.html.avant-police-vide-2026-10-19`.

- **O — carte Thème** : conforme au modèle (placement, vignettes avec aperçu, radiogroup, coche « pop », lignes empilées ≤ 560 px, chemin `setTheme(t, true)`, MutationObserver, en-tête sans bouton aux mêmes positions) ; seul écart : la phrase sous le titre, alignée sur « Choisissez l'apparence du tableur. Votre choix est gardé sur votre compte. ».
  Piège « boucle de placement » : P1 n'est PAS concerné (les cartes sont écrites dans la chaîne du module des Paramètres, aucun observateur ne les replace) — vérifié page chargée avec les cartes Thème et Police.
- **P — carte Police** (`data-setting="p1-font"`, module `p1-font-card-*`) : sous « Thème ». Classique (Outfit / Space Grotesk, aucun attribut), Journal (Lora), Arrondie (Comfortaa) ; aperçu « Aa » + « 123 » + nom dans sa police, aucune phrase de description ; ≤ 560 px lignes empilées, « 123 » masqué.
  Fichiers Lora / Comfortaa : 2ᵉ `<link>` Google Fonts (téléchargés seulement si utilisés) ; police de départ posée dans le `<head>` avant l'affichage (`localStorage['p1-font']` → `data-font`) ; variables dans `<style id="p1-font-vars">` ; le logo garde Outfit ; polices écrites en dur des flashcards qui suivent la police choisie.
  `window.p1ApplyFont(key, save)` → `data-font`, `localStorage['p1-font']`, et si `save` `window._saveUserSettings({ font })` (users/{uid}/settings/preferences, aucune règle Firestore modifiée) ; `applyUserSettings` l'applique sur un autre appareil.
- **Q — écran vide** des récapitulatifs « Tours du jour » / « Tours de la semaine » : `window.p1EmptyState({ icon, title, text, cta, ctaIcon, page, close })` (texte échappé) ; tuile 58 px en dégradé primaire inclinée -6° sur un halo qui pulse ; bouton « Mes cours » qui ferme la fenêtre puis clique l'onglet 240 ms plus tard ; écouteur en phase de CAPTURE (la fenêtre arrête la propagation des clics). L'ancien écran reste en repli.
- **Défauts trouvés en chemin et corrigés (360 px)** : la page Matières débordait de 11 px (titre + 4 boutons) AVANT ces changements — boutons de 36 px sous 400 px et retour à la ligne de sécurité (`p1-dashboard-narrow-css`) ; les menus de filtre FERMÉS de la page Entraînements dépassaient de 1 à 2 px (`overflow-x: clip`). Exigence tenue : `scrollWidth <= largeur` sur chaque onglet avec les 3 polices.

- **Nouveautés (2026-10-19, demande de Jean)** : entrée « Police et thème dans les Paramètres 🎨 » (icône `fa-font`, pastille violette) en TÊTE de « Cette semaine », avant « Flammes ». **Sans nouvelle notification** : la clé « vu » reste `whatsNewSeen_v7` (localStorage `whatsNew_seen_v7`) — un compte qui a déjà lu les Nouveautés ne revoit ni la pastille du menu ni le point de l'avatar ; un compte qui ne les avait pas lues voit la pastille comme avant. Pour notifier un jour : passer la clé à v8. Instantané d'avant : `rollback/tableur.html.avant-nouveautes-police-2026-10-19`.

- **Nouveautés, retouche (2026-10-19)** : plus d'émojis dans les TITRES des entrées (le texte des paragraphes est inchangé) ; étiquette « Cette semaine » supprimée (la liste récente commence directement, l'étiquette « P1Planner » du second groupe reste). Instantané d'avant : `rollback/tableur.html.avant-nouveautes-sans-emojis-2026-10-19`.

- **Tiroir « Session Flash » avec la police Arrondie (2026-10-19, retour de Jean)** : « Uniquement les dues » passait sur 2-3 lignes et « Toutes les flashcards » / « Choisir des items » se retrouvaient l'une sous l'autre (Comfortaa est nettement plus large) ; à 360 px c'était déjà le cas avec la police d'origine. Cause : libellés sans `white-space: nowrap` dans un tiroir de 380 px. Correctif (`p1-flash-drawer-fit-css`) : libellés sur une seule ligne, boutons du haut qui passent à la ligne ENTIERS s'ils ne tiennent pas côte à côte, taille légèrement réduite en Arrondie et sous 400 px. Instantané d'avant : `rollback/tableur.html.avant-tiroir-flash-2026-10-19`.

- **Boutons « + » des cartes Temps de travail / Entraînements, survol en thème sombre (2026-10-19, retour de Jean)** : `[data-theme="dark"] .ws-tr-plus` (fond, couleur, bordure au repos) avait la même spécificité que `.ws-tr-plus:hover` et venait APRÈS : le survol perdait son dégradé, son icône blanche et sa bordure effacée (il restait l'agrandissement et la lueur). Même défaut sur `.ws-plus` (carte Temps de travail). Correctif : deux règles `[data-theme="dark"] … :hover` (`p1-plus-hover-dark-css`). Instantané d'avant : `rollback/tableur.html.avant-plus-survol-2026-10-19`.

- **Tour enregistré / modifié / supprimé : animation sur place (2026-10-19, demande de Jean)** : en mode détaillé, le grand check plein écran est remplacé, quand la case du tour est visible, par une animation dans la case (≈ 2,5 s, affichage seulement) : la case jaillit, 2 ondes + 10 rayons, pastille « +1 tour » (« Modifié » pour une modification), confettis (nouveau tour seulement), ligne verte avec contour lumineux et reflet ; suppression = fantôme à l'ancienne couleur + pastille « Tour supprimé » + halo rouge. Module `p1-tour-fx` (`window.p1TourAddedFx / p1TourRemovedFx`, renvoient false si l'animation n'a pas pu jouer) et colle `p1-tour-fx-glue` (`p1PlayTourAdded / p1PlayTourRemoved`). **Branchement P1** : la case n'a sa nouvelle couleur qu'après l'écriture ET le redessin par `onSnapshot` ; la colle attend donc, image par image (16 ms), que la case affiche `c{confiance}` (suppression : qu'elle n'ait plus de classe `c…`), **1,5 s maximum**, après la fermeture de la fenêtre (180 ms). Repli = grand check (une seule fois, jamais les deux) : mode compact, case introuvable ou non affichée (Todo, Révisions J, Planning depuis un autre onglet), case qui n'affiche pas la couleur à temps ; la règle de Jean « le check sort quel que soit le point d'entrée » est conservée. Méthode des J : l'animation reste différée à la fermeture de la fenêtre J (`window._p1PendingTourFx`, lue par `closeJFirstTourModal`). **Changement de comportement assumé** : si l'écriture est refusée, plus aucun check (avant : le check partait à 180 ms même en cas d'échec) ; l'indicateur d'erreur existant reste. Aucune donnée touchée, `p1WriteTourSlot`, `onSnapshot`, Méthode des J et trophées inchangés ; `showTourSuccessAnimation()` inchangée. `prefers-reduced-motion` : pas de calque, seule la teinte de la ligne reste. Les calques sont à z-index 30, sous les bandeaux collants (en-tête 100, en-têtes de section 40/60). Instantané d'avant : `rollback/tableur.html.avant-tour-fx-2026-10-19`.

- **Paramètres > Méthode des J : la case ne revenait pas sur « Équilibré » (2026-10-20, retour de Jean)** : un clic sur « Personnalisé » déplace la case bleue tout de suite mais n'enregistre rien tant que « Enregistrer » n'est pas cliqué. Un clic ensuite sur le rythme DÉJÀ enregistré (ex. « Équilibré ») sortait par un `return` anticipé (« même rythme, rien à écrire ») sans rafraîchir l'affichage : la case restait sur « Personnalisé » alors que le rythme enregistré était « Équilibré ». Correctif : dans ce cas on rappelle `_syncSettingsUI(false)` avant de sortir (aucune écriture de plus, données inchangées). Instantané d'avant : `rollback/tableur.html.avant-preset-j-2026-10-20`.

- **Liste à cocher : texte écrit après la liste jamais barré (2026-10-21, bug en ligne)** : dans `p1-note-checklist-css`, TOUTES les lignes portaient `text-decoration: line-through` (couleur transparente) pour animer le trait ; en sortant de la liste (Entrée, Entrée), Chrome et Safari recopient le style calculé de la ligne sur le nouveau texte (un `<strike>`) sans la transparence : le texte tapé apparaissait barré (HTML `<div><strike>…</strike></div>`). Correctif CSS seul : plus aucun barré (même transparent) sur les lignes non cochées ; le barré, gris, vit sur `li.planning-note-done` avec une animation d'apparition du trait (`p1NoteStrikeIn`, 0,2 s ; supprimée en mouvement réduit). Le JS `p1-note-checklist-js` est inchangé. Instantané d'avant : `rollback/tableur.html.avant-checklist-barre-2026-10-21`.

- **Mode sur-mesure et entraînements : animations sur place + fenêtre « Gérer » (2026-10-21, demande de Jean)** : module `tpx-perso-fx` (`window.tpxPersoFx` : `done / before / rowClick / listShown / removeRow`) posé en fin de `<body>`, repris de la version de référence puis adapté à P1. **Ajout / modification** d'une matière, d'un cours ou d'un entraînement : élément vert avec cadre lumineux sur toute la largeur de la ligne (mesuré avant tout effet, aucune ligne ne s'élargit), pastille « +1 matière / +1 cours / +1 entraînement » ou « Modifié(e) », confettis à l'ajout seulement ; hors écran ou sur une autre page du tableau : le tableau passe à la page qui contient l'élément (`window._tpxFocusItem` dans `renderItemsTable`, `window._tpxFocusTrain` dans `renderTrainTable`), la page descend en douceur, l'animation attend que la page soit ARRÊTÉE **et** que l'élément soit entièrement à l'écran (ajout P1 : sur téléphone, une longue descente démarrait parfois après la fin de l'attente). Depuis « Gérer » : animation sur la ligne du gestionnaire (calque à z-index 10200), rien ne bouge derrière, descente à la fermeture (attente de 0,35 s sans fenêtre). **Suppression** d'une matière / d'un cours depuis « Gérer » : ligne rouge, tremblement, repli (la fermeture de « Gérer » et sa réouverture après confirmation sont celles de P1 ; l'ordre « détacher les flashcards PUIS archiver le cours », la sauvegarde avant suppression de matière et les règles Firestore sont inchangés). **Menu « Gérer »** : boutons Modifier bleu / Supprimer rouge pastel, pleins au survol et à l'appui (icône blanche), sans infobulle (`title` retirés, `aria-label` gardés), fondu entre onglets, `scrollbar-gutter: stable`, lignes qui apparaissent une à une, textes vides « …votre première matière / votre premier cours ».
  **Adaptations P1** : (1) vocabulaire « cours » (`+1 cours`, `Cours supprimé`) ; (2) les écritures P1 sont asynchrones et l'identifiant d'une nouvelle matière / d'un nouveau cours est celui du document Firestore : `done()` est appelé juste après le LANCEMENT de l'écriture (`ref.id`), l'animation attend que l'élément apparaisse (3 s max) — uniquement depuis l'interface (`fx:true`), jamais pour les créations en lot (banque de matières) ; (3) le redessin par l'écoute Firestore pendant l'animation ne l'arrête plus : le calque retrouve l'élément par sa clé et repose la teinte ; (4) lignes d'entraînement retrouvées par comparaison sur `dataset` (pas de sélecteur à identifiant numérique) ; (5) la ligne d'entraînement supprimée est celle qui s'anime, encore dans le tableau, puis elle disparaît (≥ 0,5 s) et les lignes du dessous remontent ; plus aucune notification verte pour l'ajout, la modification ni la suppression d'un entraînement.
  **Écriture de la suppression d'un entraînement (écart assumé avec la consigne)** : la consigne gardait l'écriture retardée jusqu'après l'animation (~1,2 s) avec un filet `pagehide` / `visibilitychange`. Testé : à la fermeture réelle de l'onglet 0,3 s après la confirmation, l'écriture lancée dans `pagehide` n'est PAS fiable (le cache local Firestore n'a pas le temps de la consigner). Choix retenu, plus sûr (zéro perte de données) : l'écriture part TOUT DE SUITE (`saveTrainings()` à la confirmation) ; ce que l'ancien code retardait n'était pas l'écriture mais le REDESSIN déclenché par l'écoute Firestore (qui faisait disparaître la ligne d'un coup) : il est simplement retenu (`window._p1TrainRenderHold`, compteur) jusqu'à la fin de l'animation (4,5 s au plus). Le test PF5f (fermeture de l'onglet puis réouverture) passe. `window.p1FadeOutRow` reste en place pour le catalogue et pour le repli. Mouvement réduit : aucun calque, retrait immédiat. Instantané d'avant : `rollback/tableur.html.avant-perso-fx-2026-10-21`.

- **Mode sur-mesure : boutons en sombre, suppression de matière « en cours », matière présélectionnée (2026-10-24, reprise des retouches du 22/10)** : (1) en thème sombre, `[data-theme="dark"] .tpx-btn` (spécificité 0,2,0) écrasait le dégradé de `.tpx-btn-primary` et `.tpx-btn-confirm-danger` (0,1,0) : « Enregistrer », « Créer la matière », « Ajouter », « Supprimer définitivement » devenaient gris foncé. La règle exclut maintenant les boutons principaux (`:not(.tpx-btn-primary):not(.tpx-btn-confirm-danger)`), le survol des boutons simples est rétabli (fond plus clair) et celui de `.tpx-btn-danger` est redonné explicitement (sinon les `:not()` le lui auraient retiré) ; `.tpx-btn.is-busy:disabled` reste lisible (opacité .85). (2) « Archiver cette matière ? » : le bouton passe inactif avec une icône qui tourne et « Suppression… » (« Annuler » inactif, double clic bloqué par `data-busy`), et la fenêtre ne se ferme qu'après l'archivage de la matière puis de ses cours (`deleteSpecialty` est asynchrone), avec un plafond de 8 s (hors ligne, une écriture Firestore n'est confirmée qu'au retour du réseau). L'animation de suppression (`tpxPersoFx.before / done`) est inchangée et se joue toujours (PF6a / PF6b verts). (3) Liste des cours filtrée sur UNE seule matière : « Nouveau cours » de l'en-tête ouvre le formulaire avec cette matière (`filteredSingleSpecialty()`, `openItemModal(key, preSpec)`) ; 0 ou 2 matières et plus, ou un filtre sur une matière inconnue : 1re matière comme avant ; le « Ajouter » de « Gérer » et le bouton de l'écran vide ne changent pas ; un cours existant garde sa matière verrouillée. **Différence avec la version de référence** : dans P1 le champ « Numéro » du formulaire est optionnel et vide (classement automatique), il n'y a donc pas de numéro « proposé » ; le cours créé dans P2 (cours 1 à 3) reçoit bien le numéro affiché 4. Instantané d'avant : `rollback/tableur.html.avant-retouches-22-10-2026-10-24`.

- **Validation d'un tour depuis les révisions J : la nouvelle animation, plus l'ancien grand check (2026-10-24, retour de Jean)** : depuis une ligne « Révisions J » (carte du planning, fenêtre d'un jour, panneau de la journée), la case du tour n'est pas affichée (elle est dans « Mes cours »), donc l'animation sur place ne pouvait pas jouer et le repli (grand check) s'affichait toujours. Choix de Jean : aller sur « Mes cours ». `openTourModalFromJRevision` pose `window._p1TourFromJ` ; à la validation, si la case n'est pas visible, la colle `p1PlayTourAdded(…, fromJ)` ferme les fenêtres des J (`closeDayJModal`, panneau de la journée), ouvre « Mes cours » sur la page qui contient le cours (`window._tpxFocusItem`), attend la case (1,5 s max) puis joue l'animation (descente douce incluse). Repli = grand check (une seule fois) si la case reste introuvable (cours masqué par un filtre) ou en mode compact. Les autres entrées (Todo, Planning…) sont inchangées : check si la case n'est pas à l'écran. Méthode des J (1er tour) : `fromJ` est transmis à la fermeture de la fenêtre J. Aucune donnée touchée. Instantané d'avant : `rollback/tableur.html.avant-validation-j-2026-10-24`.

- **Fin d'essai : dates affichées à l'heure de Paris (2026-10-24)** : `fmtDate()` / `fmtDateShort()` de `comptepremium.html` appelaient `toLocaleDateString("fr-FR")` sans fuseau : une échéance à 23:30 à Paris s'affichait le lendemain pour un visiteur à La Réunion / Mayotte. Ajout de `timeZone: "Europe/Paris"`. `tableur.html` n'affiche aucune date d'échéance absolue (pastille d'essai = compte à rebours ; le libellé « 26 octobre » est inerte car `tpxIsLegacyAccount` renvoie toujours false) : rien à changer ; `p1-premium-status.js` et les règles Firestore inchangés. Vérifié sans modification : pas de boucle d'écritures refusées en lecture seule, onglet ouvert correctement déverrouillé / reverrouillé par l'écoute `entitlements` (audit du 24/10 fourni par Jean).

- **Curseur de saisie : centré dans les zones de notes vides, bleu partout (2026-10-24)** : (1) `.notes-editor-area:empty::before` (texte d'invite « Commencez à écrire vos notes… ») était posé EN LIGNE dans un éditeur à `line-height: 1.85` : dans un `contenteditable` vide le navigateur calait alors le curseur sur le haut de la ligne (≈ 4 px trop haut, mesuré aux pixels : curseur 22→41 pour une invite 30→41). `position: absolute` (sans `top` ni `left` : même place à l'écran, `.notes-editor-area` est déjà `position: relative`) corrige le curseur dans les notes d'un cours, d'un entraînement et le cahier d'erreurs ; `.pdd-editor`, les cases du planning et les flashcards ne sont pas touchés. (2) Le curseur n'était bleu que dans `.notes-editor-area` et `.duration-input` : bloc `p1-caret-css` global en `:where()` (spécificité nulle, toute règle `caret-color` existante garde la main) = `var(--primary)` (bleu en clair, sombre et pastel) pour champs de saisie, `textarea` et `contenteditable`, cases à cocher exclues. `auth.html`, `comptepremium.html` et `admin.html` NON modifiés : ils ont leur propre identité (`--primary` violet) et `auth.html` fixe déjà son curseur ; à décider séparément si Jean veut un curseur violet / bleu là. Instantané d'avant : `rollback/tableur.html.avant-curseur-2026-10-24`.

- **Envoi vers la To-do : plus de « trou » entre la coche verte et la punaise (2026-10-24)** : `_animateTodoCheckThenPin` fondait le bouton vert à l'opacité 0 (`.todo-add-success-out`), puis la punaise repartait de 0 (`.todo-pin-enter`) : ≈ 0,2 à 0,4 s de zone vide ; même chose en JS dans les fenêtres de notes d'un cours / d'un entraînement (opacité 0 puis remplacement 220 ms plus tard). Correctif repris à l'identique : bloc `p1-pin-in-css` (le bouton vert reste à 100 % jusqu'à l'échange ; la punaise arrive aussitôt avec un grossissement de 0,26 s en `scale` + `opacity` seulement, sans rien garder après la fin, pour ne pas casser le centrage `translateY(-50%)` des tableaux ; mouvement réduit : échange sans animation) ; les deux fenêtres de notes font un échange direct après 0,9 s (classe `p1-pin-in`). `_animateTodoCheckThenPin` n'est pas modifiée. Étape « → To-do » déployé → coche : mesurée image par image, aucun trou (le resserrement sur la coche se fait sans fondu). Instantané d'avant : `rollback/tableur.html.avant-punaise-2026-10-24`.

- **Chargement en squelette : tableur et Compte Premium (2026-10-25, reprise de la version de référence)** : à l'ouverture, l'en-tête s'affiche tout de suite puis un squelette gris animé (barre d'onglets avec pastille sur l'onglet actif, filtres, carte de section, 8 cartes de matières) remplace l'ancien écran « logo + rond qui tourne ». Classes `p1-skel` / `p1-noloader` posées sur `<html>` par un script du `<head>` ; `p1-noloader` n'est JAMAIS retirée (l'ancien `#loader` ne réapparaît pas à la fin ; `hideLoader()` est inchangée). Le contenu réel reste masqué (`display:none`, donc non cliquable) jusqu'à ce que l'utilisateur soit chargé ET les données arrivées (`p1SkelReady('user')` avant `setTimeout(hideLoader, 500)`, `p1SkelReady('data')` après chacun des 4 `firebaseDataLoaded = true;`), puis court fondu et `relayout()` (recale la pastille de navigation, déjà calculée sur un élément masqué, + événement `resize`, 3 fois) ; déconnecté : `p1SkelReady('out')` = présentation tout de suite ; filet : jamais plus de 15 s. Aucune logique de chargement, de sauvegarde, de cache ou de Premium modifiée : seules ces lignes de notification sont ajoutées. **Mesures P1** : barre d'onglets 62 px (64 px sur téléphone), bouton « Programme de la journée » 104 px (64 px), colonnes 1 / 2 / 3 / 3 / 4 à 390 / 820 / 1180 / 1366 / 1920 px comme la vraie grille ; l'en-tête de section du squelette a été porté à 32 px de marge (la vraie ≈ 25 px plus haute) : haut de grille à ±4 px. **Chargements locaux** : `window.p1SkelHTML(kind)` (`editor`, `list`, `flash`, `oic`) remplace les ronds qui tournent des notes d'un cours, notes d'un entraînement, cahier d'erreurs, listes d'amis / demandes / partage, notes reçues, panneau flashcards des notes et liste des flashcards (repli sur l'ancien contenu si la fonction manque) ; bloc non éditable (`contenteditable=false`) et non cliquable, remplacé ensuite par le vrai contenu ; aucun code ne lisait l'ancien contenu provisoire. Les petits ronds des boutons (« Envoi… », « Suppression… »…) et les icônes de synchronisation sont gardés. **Compte Premium** : `#stateLoading` n'est plus un bloc gris de 220 px mais la silhouette de la page (carte compte, bandeau de statut avec 3 métriques, début du bloc suivant) bâtie avec les vraies classes (`card`, `account-row`, `status-hero`…) : hauteurs mesurées à ±2 px, mêmes points de rupture, même thème ; `#statusDesc` n'affiche plus « Chargement de ton statut… » mais une barre grise (remplacée par le JS) ; `#referralLinkInput` n'affiche plus « Chargement… » (section masquée jusqu'à la réponse ; chemin d'erreur inchangé : elle reste masquée). **Graphique de ressenti** : rien à changer (`clip:false`, marge de 14,6 px au-dessus de la zone de tracé pour 10 px nécessaires au survol). Instantanés d'avant : `rollback/tableur.html.avant-squelette-2026-10-25`, `rollback/comptepremium.html.avant-squelette-2026-10-25`. Les pages `index.html`, `mentions-legales.html`, `auth.html`, `admin.html` de P1 ne sont PAS concernées par cette livraison (pas demandées).

- **Squelette du tableur : barre de navigation = 5 cases + case « Révisions J » + case « Programme de la journée » (2026-10-25, retour de Jean)** : le squelette n'avait qu'une seule case à part ; la vraie ligne (`.edn-nav-row`) a la barre d'onglets (5 onglets) puis le bouton « Révisions J » (SEULEMENT si la Méthode des J est activée) puis « Programme de la journée ». Le squelette reprend les mêmes tailles par palier, mesurées sur la vraie page : au-dessus de 1366 px (To-do 121, J 151, hauteur 65, écart 13,6) ; 1025–1366 et iPad (104 × 62, écart 10,4, rayon 20) ; ≤ 768 px (To-do seul 92 de 600 à 768, 72 jusqu'à 421, 64 en dessous ; avec J : 58 + 58 ; hauteur 76 puis 68 sous 600 ; écart 8,8 puis 6,4 sous 420) ; barre en rectangle arrondi (24 px) et non plus en pilule. La case J n'est affichée que si une clé `jMethodEnabled__*` vaut `1` dans le stockage local du navigateur (lue par le script du `<head>`, avant la connexion ; classe `p1-skel-noj` sinon) : un nouvel utilisateur ou un navigateur neuf n'a donc pas de case J, comme la vraie page. Instantané d'avant : `rollback/tableur.html.avant-squelette-nav-2026-10-25`.

- **« Statistiques » devient « Tableau de bord » (2026-10-25, demande de Jean)** : onglet de la barre de navigation « Tableau de bord » ; titres de la page « Stats du Jour » → « Ma journée de travail », « Stats des 7 derniers jours » → « Ma semaine de travail », « Stats générales » → « Mon année en bref » ; même renommage dans les trois fenêtres d'aide « ? » (titres), dans la présentation de bienvenue (titre de la page), dans les Nouveautés (« carte Flammes du Tableau de bord », « depuis le Tableau de bord », « Tableau de bord et trophées ») et dans le formulaire d'avis (le bouton de la page affiche « Tableau », court pour tenir dans la grille de 3 colonnes sans passer sur deux lignes ; la valeur envoyée est « Tableau de bord »). Rien ne déborde ni ne prend plus de place : la barre d'onglets garde exactement ses hauteurs d'avant de 320 à 1920 px, avec ou sans la Méthode des J (sur téléphone les libellés d'onglets restent masqués) ; les nouveaux titres sont plus courts que les anciens. Seule retouche de mise en page : sur écran ≤ 400 px, le bandeau des fenêtres d'aide passe de 20/24 px à 16 px de marge et son titre se réduit légèrement (`p1-help-title-css`) — « Ma semaine de travail » tient sur une ligne même à 320 px, ce que l'ancien titre « Statistiques hebdomadaires » ne faisait pas déjà. Les textes de présentation commerciale (« Statistiques complètes », « Statistiques de progression par matière », « Statistiques & trophées » des pages publiques) ne sont pas la page : inchangés. Les noms internes (`data-page="stats"`, `stats-daily`…) sont inchangés. Instantané d'avant : `rollback/tableur.html.avant-tableau-de-bord-2026-10-25`.

- **Méthode Pomodoro dans « Ma journée de travail » (2026-10-27, demande de Jean)** : nouvelle case « Méthode Pomodoro » placée APRÈS « Flammes » (dernière de la rangée) ; « + » lance une concentration sans ouvrir la fenêtre, la case ouvre une grande fenêtre (chronomètre agrandissable en plein écran, séance de N concentrations, formules, durées, pause longue, enchaînement, sonneries et volume). Module autonome inséré avant `</body>` de `tableur.html` (style `p1-pomo-style`, fenêtre `#p1PomoOverlay`, script `p1-pomo`) ; préfixe `p1` partout, aucun nom d'un autre produit. **Tout est local à l'appareil** : état dans `localStorage` clé `p1_pomo_v1` (un seul minuteur, partagé entre les onglets via l'événement `storage`), heure de fin mémorisée (juste en arrière-plan, après rechargement ou fermeture/réouverture), **aucune lecture ni écriture Firestore** (test PM9 : tous les documents `users/{uid}` identiques avant/après). Adaptations : infobulles en attribut `title` (pas de système `data-…-tip` dans P1) ; verrou de défilement partagé `_ednScrollLock('p1Pomo')` / `_ednScrollUnlock('p1Pomo')` (comme les autres fenêtres : la barre de défilement ne fait pas sauter la page), avec repli si absent ; emplacement de la case : `else if (c.parentNode !== dg || c.nextSibling) dg.appendChild(c)` (toujours en dernier). Aide `'stats-daily'` : une ligne « Méthode Pomodoro » (vouvoiement). Nouveautés : nouvelle première entrée « Méthode Pomodoro » (tutoiement, icône `.whats-new-section-icon.pomo`) **SANS notification** : `FS_FIELD = 'whatsNewSeen_v7'` et `LS_KEY` inchangés, donc aucune pastille ne réapparaît. Icônes des titres des fenêtres « Temps de travail » / « Entraînements du jour » (`.ws-sec-t`) : tuiles 32×32 (ambre pour « Temps de travail », violet pour « Entraînements du jour »), titre à 1 rem. Tests existants adaptés à l'ordre des Nouveautés (`work-ui` N1, `streak` N2, `theme-font-empty` NV1). Instantané d'avant : `rollback/tableur.html.avant-pomodoro-2026-10-27`. Non déployé, non commité (en attente d'un GO de Jean).
- **Pomodoro, espace sous le « + » du coin sur téléphone (2026-10-27)** : la case « Méthode Pomodoro » rejoint la règle `@media (max-width: 600px)` déjà appliquée à « Temps de travail » et « Entraînements du jour » (`padding-top: 0.4rem` sur `.daily-stat-value-row`, en padding et non en marge pour ne pas fusionner avec la marge du titre). Purement visuel ; PC inchangé. Instantané d'avant : `rollback/tableur.html.avant-pomodoro-espace-2026-10-27`.
