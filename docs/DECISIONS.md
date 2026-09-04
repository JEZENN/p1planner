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

## Décisions encore ouvertes
Toutes les décisions bloquantes pour l'architecture ont été validées par l'utilisateur (voir sections Premium, Tours/J, Planning, Index ci-dessus). Reste ouvert uniquement, au moment de la rédaction effective d'`index.html` :
- la formulation exacte (ton, longueur) de la section créateur à partir des faits validés ci-dessus.
