# P1Planner — Architecture

> Rédigé par Claude après audit complet des références TypixClin (`reference-typixclin/`).
> Statut : proposition d'architecture, en attente de validation humaine explicite sur les points listés en fin de document avant `index.html`.

## Vue d'ensemble

P1Planner reprend la **logique** éprouvée de TypixClin (sauvegarde robuste, anti-perte de données, notes, flashcards, entraînement, stats, trophées, billing Stripe) mais **aucune configuration** (Firebase, Firestore, Stripe, Price IDs, domaine) n'est partagée. Le vocabulaire est généralisé : Matière/Cours/Tour/Révision J/Programme de la journée, sans référence à l'EDN/ECOS.

Trois écarts volontaires par rapport à TypixClin, tous motivés par l'audit :
1. **Un cours = un document Firestore**, pas une entrée dans une carte géante `items{}` — réduit le risque P0 de collision/écrasement identifié dans le tableur TypixClin (`onSnapshot` qui peut écraser des modifs locales non sauvegardées au-delà du premier chargement).
2. **Un seul composant "note générique"** (course / subject / training), pas trois implémentations quasi identiques dupliquées comme dans TypixClin (notes / ErreurSpe / notesEntrainements).
3. **Admin et Premium jamais sécurisés par un simple champ Firestore lu côté client** — custom claims + Cloud Functions callable pour toute action sensible, jamais d'écriture directe client sur les champs `premium.*`/`stripe*`.

## Structure cible provisoire

```text
P1Planner/
├── CLAUDE.md
├── docs/
├── reference-typixclin/        (READ ONLY, jamais touché)
├── public/
│   ├── index.html
│   ├── auth.html
│   ├── comptepremium.html
│   ├── admin.html
│   ├── mentions-legales.html
│   └── tableur.html
├── functions/
│   ├── index.js                (Cloud Functions : Stripe + admin + onUserCreated)
│   └── premiumPlans.js         (barème de prix, source de vérité serveur)
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
└── .firebaserc
```

## Firebase

- Project ID, région : à créer — dédiés P1Planner, aucun partage avec TypixClin (règle P0 d'isolation).
- Région recommandée : `europe-west1` (RGPD, cohérent avec la pratique TypixClin — ce n'est qu'un choix de région, pas une config partagée).
- Auth : email/password + vérification email obligatoire avant connexion effective (repris de `auth.html`, cf. § Inventaire), option Google Sign-In à valider.
- Firestore : voir schéma ci-dessous.
- Hosting : `public/`.
- Functions : Node.js, secrets via `defineSecret` (Stripe uniquement), **jamais de secret TypixClin réutilisé**.
- App Check : à activer dès le lancement si possible (TypixClin a `enforceAppCheck: false` avec dette assumée — ne pas reproduire cette dette dès le départ si le budget le permet).

## Firestore — schéma

Principes : isolation stricte par `uid`, aucun champ sensible (Premium/Stripe/admin) modifiable côté client, granularité par document plutôt que carte géante pour les données de progression, un seul mécanisme de note générique.

> **Schéma réellement implémenté (`firestore.rules`, `functions/index.js`, `public/tableur.html`) — source de vérité.**
> Écart volontaire par rapport à l'esquisse ci-dessous : le Premium n'est plus un sous-objet `users/{uid}.premium` mais **trois collections séparées** pour un cloisonnement de sécurité plus strict et plus simple à écrire dans les Rules :
> - `entitlements/{uid}` — statut d'accès (`status`, `trialStartedAt`, `trialEndsAt`, `writeAccessUntil`, `premiumUntil`, `planType`) : lecture propriétaire, écriture **jamais** côté client (Cloud Function `onUserCreated` uniquement pour l'instant).
> - `billingPrivate/{uid}` — IDs/statuts Stripe bruts : **lecture ET écriture refusées au client**, sous toutes conditions (réservé, vide en V1).
> - `userStats/{uid}` et `achievements/{uid}` — réservés pour une V2 avec calcul serveur ; lecture propriétaire, écriture refusée au client. En V1 le tableur calcule ses stats en mémoire à partir de `courses`/`tourLogs`, rien n'est persisté ici.
> - `users/{uid}/settings/preferences` — seul sous-document de préférences modifiable par le client (thème, mode J par défaut), séparé du document `users/{uid}` racine qui reste backend-only.
> - Chaque cours (`users/{uid}/courses/{courseId}`) porte directement `tourCount`, `lastTourAt`, `lastTourConfidence`, `jAnchorDate`, `jStepIndex`, `jHistory[]`, `jPostponedUntil`, `manualPlannedDate` — voir § Relation Tours/J ci-dessous pour le détail du découplage Tours/J effectivement codé.
> Détail complet et à jour : lire `firestore.rules` directement plutôt que cette esquisse, qui reste indicative.

```
users/{uid}
  profile: { email, displayName, createdAt (serverTimestamp, immuable), lastLogin, locale }
  premium: { status: 'trial'|'active'|'expired'|'none',
             trialEnd, accessEnd,
             planType: 'onetime'|'recurring'|null, planMonths (si onetime),
             stripeCustomerId, stripeSubscriptionId (si recurring) }
             // écrit UNIQUEMENT par Cloud Functions (Admin SDK) — Rules : update interdit au client sur ce champ
             // accessEnd ne raccourcit jamais : à chaque écriture, accessEnd = max(accessEnd actuel, nouveau)
  settings: { theme,
              revisionMode: 'j'|'libre',   // 'j' = méthode des J active par défaut, 'libre' = planification manuelle/au feeling
              jPreset: 'rapproche'|'equilibre'|'espace'|'perso', tourCountDefault, customJOffsets? }
  trophies: { [trophyId]: { date, category } }        // calculé client, non sensible (cf. Sécurité P1)
  matiereBadges: { [subjectId]: { date } }
  // PAS de champ isAdmin ici — l'admin est un custom claim Auth, jamais un champ Firestore

users/{uid}/subjects/{subjectId}
  { name, color, order, archived, createdAt, updatedAt }

users/{uid}/courses/{courseId}
  { subjectId, name, order, archived, createdAt, updatedAt,
    tours: [ { confidence:1-5, date, durationMin, support } | null, ... ],   // taille configurable, pas 8 en dur, toujours saisis quel que soit le mode
    revisionMode: 'j'|'libre'|null,                            // null = hérite de settings.revisionMode
    jPreset: 'rapproche'|'equilibre'|'espace'|'perso'|null,    // pertinent seulement si revisionMode effectif = 'j'
    jOffsets: [0,1,3,7,14,30] | null,                          // surcharge par cours si jPreset='perso'
    jAnchorDate: ISOString | null,                             // = date du Tour 1 (voir § Relation Tours/J), utilisé seulement en mode 'j'
    jHistory: [ { stepIndex, plannedDate, doneDate|null, status:'a_venir'|'fait'|'en_retard'|'reporte', reportedTo? } ],
    manualPlannedDate: ISOString | null,                       // utilisé seulement en mode 'libre' : date à laquelle l'utilisateur a lui-même prévu de reprendre ce cours
    priority: null|'urgent'|'pas-urgent'|'relative',
    lastRevision: ISOString|null,
    updatedAt: serverTimestamp   // contrôle de concurrence optimiste (cf. Sécurité P0-7)
  }
  // 1 document par cours : écriture/lecture ciblée, pas de réécriture de la carte entière à chaque sauvegarde

users/{uid}/notes/{entityType}_{entityId}
  { entityType: 'course'|'subject'|'training', html, updatedAt }
  // remplace les 3 mécanismes dupliqués de TypixClin (notes / ErreurSpe / notesEntrainements)

users/{uid}/flashcards/{cardId}
  { subjectId, courseId?, recto, verso, interval, nextReview, lastReview, createdAt, updatedAt }

users/{uid}/trainings/{trainingId}
  { title, type, subjectIds[], courseIds[], platform, status:'a-faire'|'fait'|'a-refaire'|'relu', createdAt, updatedAt }

users/{uid}/schedule/{dateKey}                     // "Planning"
  { type: 'cours'|'revision'|'repos'|'vacances'|'examen',   // 5 types V1
    note?, updatedAt }
  // état (À venir/En cours/Terminée/Partiellement réalisée/Reportée/En retard) CALCULÉ, jamais stocké

users/{uid}/backups/{backupId}                     // snapshot périodique complet (anti-perte)
  { createdAt, snapshot: {...}, isManual }
users/{uid}/backups/{backupId}/versions/{isoTs}    // historique court (5 dernières), purge auto

billingLocks/{uid}                                  // lock anti-double Checkout (cf. Stripe)
billingConflicts/{sessionId}                        // uniquement si coexistence fixe/récurrent un jour réintroduite
stripeEvents/{eventId}                              // idempotence webhook

metrics/usage_{YYYY-MM-DD}                          // compteurs reads/writes/deletes (surveillance coût)
```

Firestore Rules — principes non négociables :
- `request.auth.uid == uid` sur tout chemin `users/{uid}/**`.
- `users/{uid}.premium`, `.isAdmin` (inexistant), tout champ Stripe : **aucune règle `update`/`create` autorisée pour le propriétaire du document** — écriture uniquement via Admin SDK (donc les Rules n'ont même pas besoin d'un cas d'autorisation client pour ces champs).
- `users/{uid}/courses/{courseId}.tours` : limiter la taille du tableau (éviter l'abus de quota).
- Toute règle touchant Premium/admin doit être testée à l'émulateur Firestore avant tout déploiement (aucune des failles potentielles trouvées côté TypixClin n'a pu être vérifiée faute de `firestore.rules` dans le dossier de référence — P1Planner ne doit pas hériter de cette zone d'ombre).

## Architecture Stripe

- Projet Stripe dédié, Price/Produits propres, webhook signé propre — **isolation totale** (P0 CLAUDE.md).
- **Deux façons de payer, coexistantes dès la V1** (décision utilisateur) :
  1. **Paiement unique**, durée choisie entre 1 mois et la durée max calculée (voir § Premium) — `mode: 'payment'` Stripe.
  2. **Abonnement récurrent mensuel** à 3,00 €/mois, sans engagement, résiliable à tout moment via le portail client Stripe — `mode: 'subscription'` Stripe.
- Cloud Functions à reprendre **presque telles quelles** (logique, pas les valeurs) depuis `index.js` de TypixClin :
  - `createCheckoutSession` : whitelist stricte du `planType` (`'onetime'` avec `months` validé, ou `'recurring'`), prix calculé **exclusivement côté serveur** (barème dégressif pour `onetime`, Price ID fixe pour `recurring`), jamais de paramètre prix venant du client.
  - **Lock anti-double Checkout** (`billingLocks/{uid}`) : transaction Firestore (`creating` → `open`/`pending_payment` → relâché uniquement par le webhook, jamais par un simple retour de fonction) + vérification live Stripe (`sessions.retrieve`) avant de réutiliser/bloquer une session existante — mécanisme le plus robuste observé dans tout l'audit, à reproduire fidèlement, quel que soit le mode (`payment` ou `subscription`).
  - `stripeWebhook` : vérification de signature stricte, idempotence via `stripeEvents/{event.id}` (marqué traité seulement après succès). Événements à traiter : `checkout.session.completed` (branche paiement unique → `handleOnetimePurchase`, branche abonnement → `syncSubscription`), `customer.subscription.updated/deleted`, `invoice.paid/payment_failed`. Pour l'abonnement récurrent, ne considérer l'accès actif que sur `active`/`trialing` avec `current_period_end` futur — jamais sur `past_due`/`unpaid`/`incomplete` seul (repris du garde-fou `tpxIsSubscribed` de TypixClin).
  - `createCustomerPortalSession` : allowlist d'origine pour `return_url` (anti open-redirect) — nécessaire dès la V1 puisque l'abonnement récurrent doit être résiliable par l'utilisateur lui-même.
  - **Jamais** de Premium accordé sur la base de `?success=true` dans l'URL — confirmation uniquement via webhook + polling Firestore côté `comptepremium.html` (bonne pratique confirmée dans TypixClin, à reproduire à l'identique).
- **Coexistence fixe/récurrent simplifiée par rapport à TypixClin** : pas de blocage d'achat (`checkPurchaseConflict`), pas de collection `billingConflicts` — à chaque écriture d'accès (paiement unique confirmé ou webhook d'abonnement), le backend applique uniquement `accessEnd = max(accessEnd actuel, nouveau accessEnd)` (reprise généralisée du principe TypixClin "jamais raccourcir un accès déjà valide"). Un utilisateur peut donc avoir les deux en parallèle sans état d'erreur à gérer — au pire il paie deux fois, ce qui reste son choix explicite (case à cocher CGV + double confirmation côté UI, comme dans `comptepremium.html`).

## Méthode des tours

- Un **Tour** = un passage complet sur un cours, noté : confiance (1-5), date, durée, support utilisé (libre, pas de liste fermée EDN).
- Nombre de tours **configurable**, pas de constante `MAX_TOURS` figée à 8 comme dans TypixClin — valeur par défaut raisonnable (ex. 4) modifiable dans `settings`, avec possibilité de continuer au-delà (pas de plafond dur).
- **Déverrouillage séquentiel conservé** (impossible de faire le Tour N+1 avant le Tour N) — bonne discipline, source de fiabilité des stats.
- Suppression d'un tour possible, recalcule `lastRevision` et l'historique J associé.

## Méthode des J

**La méthode des J est un outil optionnel** — l'utilisateur choisit, globalement ou par cours (`revisionMode`), entre : méthode des J (échéances automatiques), au feeling (aucune structure imposée), ou planification manuelle (l'utilisateur pose lui-même une date de reprise par cours, `manualPlannedDate`). Les Tours, eux, sont **toujours** saisis quel que soit le mode retenu — la méthode des J n'est qu'une aide facultative pour organiser leur rythme, pas une infrastructure obligatoire.

Quand `revisionMode = 'j'` :
- Presets (bases de travail, ajustables selon retour d'usage — aucune n'est scientifiquement prouvée, l'utilisateur a validé cette approche au feeling) :
  - Rapproché : J0 J1 J3 J5 J8 J14 J30
  - Équilibré : J0 J1 J3 J7 J14 J30
  - Espacé : J0 J3 J9 J25 J50
  - Personnalisé : liste libre de décalages en jours, par cours ou par défaut global.
- **J0 = date du Tour 1** du cours (voir relation Tours/J ci-dessous), pas une date arbitraire.
- Chaque étape J génère une échéance (`plannedDate`). État : à venir / fait / en retard / reporté.
- Retard : une échéance J dépassée sans action passe automatiquement en `en_retard` (calculé à la lecture, pas stocké en dur) et apparaît dans le Programme de la journée avec deux actions : **Faire maintenant** (marque fait aujourd'hui, avec l'écart enregistré pour les stats) / **Reporter** (choix d'une nouvelle date, `status: reporte`, `reportedTo`).
- Historique conservé (`jHistory[]`) : date prévue vs date réelle, pour les stats "réalisé à temps / en retard / reporté".
- Stats associées : J prévues, réalisées, restantes, en retard, taux de réalisation — calculées sur `jHistory` de tous les cours (par jour/semaine, comme le `calculateDailyStats`/score de priorité déjà éprouvés côté TypixClin, généralisés).

Quand `revisionMode = 'libre'` : pas d'échéance générée automatiquement ; le Programme de la journée s'appuie uniquement sur `manualPlannedDate` posé par l'utilisateur sur chaque cours, et les stats J (prévues/réalisées/en retard) ne s'appliquent pas à ces cours.

## Relation Tours ↔ J — implémentée

**Précision apportée à l'implémentation (pas de lien rigide "Tour i+1 = palier J i").** Les Tours restent le socle obligatoire (historique réel du travail, toujours saisis quel que soit le mode) ; la méthode des J reste une aide de planification facultative, mais découplée par un compteur séparé plutôt que par un index partagé :
- `jAnchorDate` = date du tout premier Tour du cours (posée une seule fois, jamais réécrite).
- `jStepIndex` = combien de paliers J ont été considérés "faits" — indépendant de `tourCount`.
- Un Tour validé depuis une échéance J due (bouton "Faire maintenant" du Programme de la journée) avance `jStepIndex` ET `tourCount`. Un Tour fait librement (bouton "+ Tour" dans le tableur, hors échéance) n'avance que `tourCount` — l'échéance J n'est pas affectée. L'utilisateur peut donc faire un tour supplémentaire, un tour au feeling, désactiver/réactiver J ou planifier lui-même une date, sans jamais perdre ni fausser l'historique.
- `jHistory[]` conserve `{stepIndex, plannedDayKey, doneDayKey, status, reportedToDayKey}` pour chaque palier traité — jamais réécrit rétroactivement.
- Changer de mode (`j` ↔ `libre`) préserve intégralement `tourCount`, `jStepIndex`, `jAnchorDate`, `jHistory` — aucune remise à zéro (testé, voir rapport d'implémentation).

## Programme de la journée

Vue centrale, générée (pas stockée en dur) à partir de :
- Cours dont une échéance J est due ou en retard aujourd'hui (mode `j`) ;
- Cours dont la date de reprise manuelle (`manualPlannedDate`) tombe aujourd'hui (mode `libre`) ;
- Tours planifiés librement par l'utilisateur, hors mécanisme J ;
- Entraînements au statut `a-faire`/`a-refaire` échéancés ou choisis pour le jour ;
- Tâches manuelles ajoutées par l'utilisateur (libres).

UX : ouvrir → voir la liste du jour → travailler (ouvre directement le cours/tour concerné) → valider (marque le Tour/J fait, recalcule automatiquement planning + stats + trophées) → un J en retard propose *Faire maintenant* / *Reporter* inline. Fonctionne à l'identique que l'utilisateur soit en mode J, feeling ou manuel — seule la source des éléments du jour change.

## Planning

- **Type de journée** (champ stocké, choix manuel ou remplissage semaine type `fillWeekWithStatus`) — **5 types validés pour la V1 : Cours, Révision, Repos, Vacances, Examen** (simplifié par rapport à la proposition initiale : Cours+Révisions et Entraînement retirés pour garder le planning lisible ; pourront être réintroduits plus tard si le besoin se confirme en usage réel).
- **État** (jamais stocké, toujours calculé à l'affichage à partir du Programme de la journée du `dateKey` concerné) : À venir / En cours / Terminée / Partiellement réalisée / Reportée / En retard — comparaison entre ce qui était planifié ce jour-là (J dues, dates manuelles, tours prévus) et ce qui a réellement été validé.

## Premium (modèle validé)

- **15 jours d'essai gratuit sans CB** à l'inscription (`trialEnd = createdAt + 15j`, calculé serveur).
- À l'issue de l'essai, l'utilisateur indique une date approximative de concours/examens S2. Le backend calcule la **durée maximale utile sans marge** : le plan à durée maximale couvre jusqu'à la **fin du mois** du concours/examen indiqué (confiance faite à l'utilisateur sur la date qu'il donne, pas de semaines de marge ajoutées).
- **Deux façons de payer, au libre choix de l'utilisateur, dès la V1** :
  1. **Paiement unique** d'une durée choisie entre 1 mois et la durée max calculée, tarif dégressif selon la durée choisie (barème appliqué au nombre de mois entiers, arrondi au supérieur, jamais au détriment de l'acheteur — principe repris de `computeFixedPlanPriceCents` de TypixClin) :
     - **1 mois → 3,00 €/mois**
     - **2 à 4 mois → 2,50 €/mois**
     - **5 mois et plus → 2,25 €/mois**
     (barème changé de 2,50/2,25/2,00 à 3,00/2,50/2,25 en session, demande explicite de l'utilisateur — le tarif de l'abonnement récurrent, ci-dessous, est inchangé.)
  2. **Abonnement récurrent mensuel** à **3,00 €/mois** (changé de 2,50 à 3,00 €/mois en session, demande explicite de l'utilisateur), sans engagement, résiliable à tout moment (portail client Stripe, `cancel_at_period_end`).
- **Backend source de vérité absolue** : durée max, tarif, total et date de fin toujours recalculés côté Cloud Function à partir de la date de concours enregistrée en Firestore — jamais transmis ou fait confiance depuis le client. Le frontend n'affiche que le résultat de ce calcul (comme `tpxComputeFixedPlanPrice` dans TypixClin, jamais transmis à `createCheckoutSession`).
- Accès jamais raccourci : `accessEnd = max(accessEnd actuel, nouveau accessEnd)` à chaque activation (unique ou récurrent), cf. § Architecture Stripe.
- Aucune suppression de données après expiration — lecture seule uniquement (repris tel quel de TypixClin).

## Admin

- **Aucun champ Firestore `isAdmin`.** Rôle admin = **custom claim Firebase Auth** (`admin: true`), attribué exclusivement via script Admin SDK/Cloud Function protégée — jamais depuis le client.
- Vérification client (`getIdTokenResult(user, true).claims.admin`) = **gate d'affichage UI uniquement**, jamais la sécurité réelle.
- Toute action sensible (octroi Premium manuel, restauration de backup d'un utilisateur tiers, modification de statut d'abonnement) = **Cloud Function `onCall` dédiée** qui revérifie `context.auth.token.admin === true` côté serveur avant d'écrire avec l'Admin SDK. Aucune écriture Firestore directe depuis `admin.html` sur les documents d'autres utilisateurs.
- Minimisation : email partiellement masqué par défaut (affichage complet sur action explicite), IDs Stripe en **lecture seule** (jamais de champ éditable en saisie libre comme dans `admin.html` TypixClin — ces IDs ne doivent provenir que du webhook signé), journal d'audit des actions admin (absent dans TypixClin, à créer : `adminAuditLog/{id}`).
- Si plusieurs administrateurs sont envisagés un jour : prévoir des rôles différenciés (lecture seule / gestion Premium / super-admin) dès la conception du claim (ex. `role: 'support'|'admin'`) plutôt qu'un booléen unique.

## Sécurité — Risques classés

### P0 (bloquant avant toute mise en production)
1. Accès admin doit reposer sur un **custom claim vérifié serveur**, jamais un champ Firestore lu côté client (faille identifiée telle quelle dans `admin.html` de TypixClin — `admin.html:934`, aucune preuve de vérification serveur dans ce fichier).
2. Champs `premium.*` et Stripe (`stripeCustomerId`, `stripeSubscriptionId`, `accessEnd`, `status`) : **écriture interdite au client** dans les Firestore Rules, écrits uniquement par Cloud Functions via Admin SDK. À tester à l'émulateur avant tout déploiement (TypixClin n'a pas pu être audité sur ce point, `firestore.rules` absent des références fournies — ne pas supposer que le pattern "champ + rules" est sûr sans le vérifier soi-même).
3. Lock anti-double Checkout et idempotence webhook doivent être repris **fidèlement** (transaction Firestore + vérification live Stripe + relâchement uniquement au webhook) — une version simplifiée réintroduit le risque de double paiement que TypixClin a corrigé après un bug réel documenté dans son propre code.
4. Jamais de Premium accordé sur la base d'un paramètre d'URL (`?success=true`) — uniquement via confirmation webhook + lecture Firestore.
5. Isolation totale Firebase/Firestore/Stripe/domaine — vérifier `.firebaserc` et `firebase use` avant chaque déploiement.
6. Toute collection `users/{uid}/**` : règle `request.auth.uid == uid` systématique, testée à l'émulateur, jamais supposée.
7. Concurrence/écrasement sur les données de progression : le choix "1 cours = 1 document" (au lieu de la carte géante `items{}` de TypixClin) doit être complété par une vraie protection anti-écrasement (comparaison `updatedAt` à chaque `onSnapshot`, pas seulement au premier chargement comme c'est le cas dans TypixClin) — sinon le même risque P0 identifié côté tableur TypixClin (modification locale non sauvegardée écrasée par un `onSnapshot` concurrent) se reproduit.
8. Aucune suppression de données après expiration du Premium — lecture toujours possible, seules les écritures sont conditionnées (pattern confirmé bon dans TypixClin, à reproduire).

### P1 (à traiter avant généralisation/production, non bloquant pour démarrer l'architecture)
9. Créer un vrai `onUserCreated` (Cloud Function Auth trigger) pour P1Planner plutôt que le pattern "profil créé côté client + Rules restrictives" de TypixClin — réduit la dépendance à des Rules parfaites pour le bootstrap de compte.
10. Un seul composant "note générique" (course/subject/training) dès le départ — éviter la triplication observée dans TypixClin (`notes`/`ErreurSpe`/`notesEntrainements`, quasi identiques).
11. Centraliser le barème de prix (`RATE_TIERS` etc.) dans une **source unique** consommée par frontend et backend (fichier de config partagé ou lecture backend exposée en lecture publique), plutôt que la duplication commentée "DOIT rester identique" observée entre `tpx-billing.js`/`premiumPlans.js`.
12. Découper la fonction de sauvegarde en petites fonctions testables dès le départ (le `saveUserData` de TypixClin fait ~290 lignes avec de nombreux flags booléens).
13. Trophées/badges calculés côté client uniquement : acceptable tant qu'aucun avantage monétaire/social n'y est lié ; si un jour un avantage y est attaché, ajouter une vérification serveur.
14. Message d'erreur de connexion générique (éviter la traduction littérale de `auth/user-not-found` qui permet l'énumération de comptes).

### P2 (mineur)
15. Pas de code mort à l'écriture (TypixClin a un chemin d'hydratation cache-first désactivé en dur `if(false)` et un stub `restoreFromBackup()` qui retourne toujours `null`) — nettoyer plutôt que reproduire.
16. Retirer tout `console.log`/`console.error` de debug avant mise en production (présents dans le flow d'inscription de `auth.html`).
17. Cache localStorage admin (emails, données de facturation) : acceptable en usage mono-admin, à réévaluer si plusieurs administrateurs partagent un poste.

## Plan d'implémentation

1. **Architecture (ce document)** — audit terminé, en attente de validation humaine sur les points ouverts ci-dessous.
2. Rédiger `firestore.rules` (schéma ci-dessus) + suite de tests à l'émulateur Firestore couvrant spécifiquement : isolation par uid, non-écriture des champs Premium/admin par le client, limite de taille sur les tableaux de tours.
3. `index.html` (Product Management + Design/UI UX Pro Max + Modern Web Guidance, 3 passes visuelles, Browser Use en QA).
4. `auth.html` (reprise quasi telle quelle de la logique TypixClin, nouvelle identité visuelle, message d'erreur connexion durci).
5. `comptepremium.html` (paiement unique N mois uniquement en V1, UI de choix de durée avec prix/économie/date de fin dynamiques jamais calculés côté client).
6. `admin.html` (custom claims + Cloud Functions callable pour toute action sensible, dès la première version — pas de rattrapage a posteriori).
7. `mentions-legales.html` (structure reprise de TypixClin, contenu identitaire entièrement à refaire avec `[À COMPLÉTER]`).
8. `tableur.html` (dernier, le plus gros morceau — modèle de données généralisé, sauvegarde par cours, notes génériques, flashcards, entraînement, stats, trophées, planning, Tours/J).
9. Cloud Functions finales (Stripe, admin, `onUserCreated`) + déploiement Rules définitif.
10. QA complète (`docs/QA.md`), avec Browser Use pour les parcours réels.
11. Production uniquement après GO explicite de l'utilisateur.

## Décisions — statut

Toutes les décisions bloquantes pour l'architecture ont été validées par l'utilisateur (seuils de prix, coexistence paiement unique/récurrent, presets J au feeling avec ajustement possible, relation Tours/J avec méthode optionnelle, absence de marge post-concours, 5 types de planning, contenu créateur vérifié). Détail complet dans `docs/DECISIONS.md`.

Reste ouvert uniquement :
- la formulation exacte (ton, longueur) de la section créateur de `index.html`, à rédiger à partir des faits déjà validés (3ème de promotion P1, major UE2/UE3, 275e/~10 500 aux EDN, néo-interne d'anesthésie-réanimation à Paris) ;
- l'ajustement fin des presets J et des seuils de trophées une fois un premier usage réel observé (assumé non figé dès le départ, cf. § Méthode des J).
