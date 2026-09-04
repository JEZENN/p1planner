# P1Planner — Instructions permanentes Claude

Lis avant toute modification importante :
1. `docs/P1PLANNER_SPEC.md`
2. `docs/DECISIONS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/QA.md`

## Règles P0
Considérer comme critiques :
- perte de données utilisateur ;
- accès aux données d'un autre utilisateur ;
- écrasement accidentel ;
- paiement incorrect ou double paiement ;
- Premium accordé par manipulation frontend ;
- admin accessible sans vraie autorisation ;
- mauvais projet Firebase / mauvais Stripe ;
- pollution TypixClin ↔ P1Planner.

## Isolation
P1Planner doit avoir ses propres GitHub, dossier local, Firebase, Firestore, Auth, Hosting, Functions, Rules, Secrets, Stripe, webhook, produits/Price IDs et domaine.
TypixClin est une référence READ ONLY.

## Vocabulaire
- spécialité → Matière
- item → Cours
- todo → Programme de la journée

Tout nouveau code privilégie `subject`, `course`, `revision`, `tour`, `schedule`, `training`.

## Design
Nouvelle identité complète pour :
- index.html
- auth.html
- comptepremium.html
- admin.html
- mentions-legales.html
- présentation publique du tableur

Le tableur est l'exception : il doit rester sensiblement proche du tableur EDN TypixClin, dense, rapide, productif et lisible.

## Format frontend
Premières versions monolithiques : HTML + CSS + JavaScript dans le même fichier HTML.

## À réutiliser depuis TypixClin si fiable
- sauvegarde locale / Firestore ;
- pending saves, cache, retries, backups, anti-overwrite ;
- notes ;
- flashcards ;
- cahier d'erreurs ;
- cahier d'erreurs entraînements ;
- entraînements ;
- statistiques ;
- trophées ;
- planning ;
- logique Premium pertinente ;
- Stripe Checkout, webhook signé, idempotence, lock anti-double Checkout ;
- lecture seule après expiration, sans suppression de données.

## Workflow
Avant une modification importante :
1. lire la spec et les décisions ;
2. lire les fichiers concernés ;
3. auditer la référence TypixClin pertinente ;
4. proposer un plan et les risques ;
5. modifier uniquement le périmètre nécessaire ;
6. tester réellement ;
7. mettre à jour la documentation utile ;
8. résumer les fichiers modifiés.

Ne jamais annoncer un test comme réussi s'il n'a pas été exécuté.

## Ordre
1. Audit TypixClin
2. Architecture
3. index.html
4. auth.html
5. comptepremium.html
6. admin.html
7. mentions-legales.html
8. tableur.html
9. backend final / Rules
10. QA
11. Production après GO explicite

Pour la première mission, lire `docs/FIRST_PROMPT.md`.

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC3Ip1T_Bp_USxQE2RgeDjac1aE1HxTebM",
  authDomain: "p1planner.firebaseapp.com",
  projectId: "p1planner",
  storageBucket: "p1planner.firebasestorage.app",
  messagingSenderId: "731451401197",
  appId: "1:731451401197:web:c42a76f270e78abe923de4",
  measurementId: "G-Z7W9XF2F0F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

## Firebase — infrastructure P1Planner

P1Planner possède son propre projet Firebase, totalement indépendant de TypixClin.

### Isolation P0

Il est strictement interdit de réutiliser dans P1Planner :

* un projectId Firebase TypixClin ;
* une base Firestore TypixClin ;
* un bucket Storage TypixClin ;
* des Cloud Functions TypixClin ;
* des secrets TypixClin ;
* une configuration Stripe TypixClin ;
* des collections ou chemins TypixClin par erreur.

P1Planner et TypixClin sont deux infrastructures indépendantes.

---

### Services Firebase

P1Planner utilise / utilisera :

* Firebase Authentication ;
* Cloud Firestore ;
* Cloud Storage ;
* Cloud Functions ;
* Firebase Hosting ;
* App Check avant mise en production si pertinent.

Authentication doit prendre en charge :

* Email / Password ;
* Google Sign-In ;
* vérification de l'adresse email ;
* réinitialisation du mot de passe.

---

### Firebase Web SDK

Utiliser uniquement la configuration Firebase Web officielle du projet P1Planner.

Le frontend peut contenir les valeurs publiques du Firebase Web SDK :

* apiKey ;
* authDomain ;
* projectId ;
* storageBucket ;
* messagingSenderId ;
* appId.

Ces valeurs ne sont pas considérées comme des secrets serveur.

En revanche, ne jamais introduire dans le frontend ou dans le repository :

* clé privée Firebase Admin ;
* serviceAccountKey.json ;
* private_key ;
* secret Stripe ;
* webhook secret Stripe ;
* mot de passe ;
* token serveur sensible ;
* fichier `.env` contenant de vrais secrets.

Le repository GitHub P1Planner est PUBLIC.

---

### Firestore

La base Firestore utilisée est la base `(default)` du projet P1Planner.

Tant que l'architecture définitive n'est pas explicitement validée, les Rules doivent rester fail-closed.

État de sécurité initial :

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Ne jamais remplacer temporairement ces Rules par :

```js
allow read, write: if true;
```

Les Rules doivent ensuite être ouvertes uniquement chemin par chemin lorsque les fonctionnalités correspondantes sont implémentées et testées.

---

### Isolation des données utilisateur

Architecture à privilégier :

```text
users/{uid}/...
```

Un utilisateur authentifié doit uniquement pouvoir accéder aux données qui lui appartiennent.

Principe :

```text
Utilisateur A
→ données A uniquement

Utilisateur B
→ données B uniquement
```

Aucune confiance ne doit être accordée à un `uid` transmis arbitrairement par le frontend.

Les Rules doivent comparer l'utilisateur authentifié avec le propriétaire réel de la donnée.

---

### Données backend-only

Le frontend ne doit jamais pouvoir s'attribuer ou modifier directement des données sensibles telles que :

* rôle admin ;
* Premium actif ;
* statut d'abonnement ;
* date de fin Premium ;
* montant payé ;
* Stripe customer ID ;
* Stripe subscription/session IDs ;
* état d'un paiement ;
* début arbitraire d'un essai ;
* durée arbitraire d'un essai ;
* toute autre donnée donnant des privilèges.

Ces champs doivent être contrôlés côté backend.

---

### Essai gratuit

P1Planner prévoit :

```text
15 jours gratuits
sans carte bancaire
```

Le navigateur ne doit pas être la source de vérité concernant le début ou la fin de l'essai.

La création du compte Firebase Authentication doit déclencher côté serveur la création du profil utilisateur correspondant.

Architecture conceptuelle :

```text
Firebase Authentication
        ↓
nouvel utilisateur
        ↓
Cloud Function serveur
        ↓
users/{uid}
```

Les timestamps sensibles doivent utiliser une heure serveur fiable.

---

### Cloud Storage

Cloud Storage est activé car P1Planner en aura besoin.

Ne jamais rendre le bucket public.

À terme, privilégier des chemins isolés par utilisateur, par exemple :

```text
users/{uid}/...
```

Les Storage Rules devront vérifier l'identité de l'utilisateur.

Prévoir également selon le type de fichier :

* taille maximale ;
* types MIME autorisés ;
* droits lecture/écriture ;
* suppression contrôlée.

Ne pas ouvrir Storage globalement pour faciliter les tests.

---

### Firebase Authentication

Le frontend doit supporter :

```text
Email / Password
Google
```

et conserver :

* vérification email ;
* mot de passe oublié ;
* restauration de session ;
* messages d'erreur non révélateurs ;
* protection contre les redirections externes non autorisées.

---

### Création du profil utilisateur

`auth.html` ne doit pas devenir responsable de l'attribution des droits Premium ou de l'essai.

La création du profil principal doit être effectuée côté serveur.

Ne pas créer une architecture où le navigateur peut envoyer lui-même :

```js
{
  premium: true,
  trialEndsAt: "...",
  role: "admin"
}
```

et faire accepter ces valeurs par Firestore.

---

### Firebase Hosting

Le domaine public prévu est :

```text
p1planner.fr
```

avec éventuellement :

```text
www.p1planner.fr
```

redirigé vers le domaine principal.

Firebase Hosting servira le frontend.

GoDaddy sert à la gestion du domaine / DNS, pas au backend de l'application.

---

### Déploiements

Claude peut :

* modifier les fichiers locaux ;
* préparer les Rules ;
* préparer les Functions ;
* préparer Hosting ;
* exécuter des tests locaux ;
* utiliser les émulateurs Firebase.

Mais Claude NE DOIT PAS exécuter de déploiement Firebase sans mon GO explicite.

Interdiction sans autorisation :

```text
firebase deploy
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore
firebase deploy --only storage
```

Même règle pour les modifications Stripe en environnement Live.

---

### Principe de travail Firebase

Avant toute évolution importante de Firebase :

1. auditer l'existant ;
2. identifier les données concernées ;
3. vérifier la rétrocompatibilité ;
4. vérifier les Firestore Rules ;
5. vérifier les Storage Rules si pertinent ;
6. distinguer clairement données frontend et backend-only ;
7. identifier les risques P0 de perte ou d'accès croisé ;
8. proposer le changement ;
9. tester ;
10. attendre mon GO avant déploiement.

### P0 Firebase

Considérer comme P0 :

* perte de données utilisateur ;
* utilisateur A pouvant lire les données de B ;
* utilisateur A pouvant modifier les données de B ;
* utilisateur pouvant s'attribuer Premium ;
* utilisateur pouvant s'attribuer admin ;
* bucket Storage public involontairement ;
* secret serveur commité sur GitHub ;
* mélange P1Planner / TypixClin ;
* déploiement production non demandé ;
* écrasement de données existantes par une initialisation vide.

