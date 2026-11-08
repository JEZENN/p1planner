# Sauvegarde locale quotidienne — P1Planner

> **Pour installer le plus simplement possible, suivez `GUIDE.html`** (une commande à coller dans Google Cloud Shell, puis un double-clic sur `METTRE-EN-PLACE.cmd`). Ce document est la référence détaillée.

Chaque jour, une copie **complète** du projet Firebase `p1planner` est faite sur ce PC :

| Contenu | Détail |
|---|---|
| **Firestore, en entier** | Toutes les collections et sous-collections, trouvées automatiquement : rien à mettre à jour quand une nouvelle collection apparaît (`users/{uid}/…` : matières, cours et tours, notes, flashcards, cahiers d'erreurs, entraînements, tâches, planning, statistiques, sauvegardes de l'application ; `entitlements`, `billingPrivate`, `userStats`, `achievements`, `referralCodes`, `referrals`, `feedbacks`, etc.). Tous les types sont conservés (dates, références, octets…). |
| **Storage, en entier** | Images des notes (`users/{uid}/notesImages/…`). Premier passage : tout est téléchargé. Ensuite, seulement les nouveaux fichiers. Les métadonnées sont gardées, y compris le jeton de lien : une image restaurée garde son adresse, donc les liens dans les notes continuent de marcher. |
| **Comptes (Authentication)** | E-mail, e-mail vérifié, fournisseur, dates, compte désactivé, droits personnalisés (admin…), et mots de passe chiffrés si la clé le permet. |
| **Règles de sécurité** | Firestore et Storage, telles qu'elles sont en ligne. |
| **Manifeste** | Pour chaque sauvegarde : nombre de documents, de comptes, de fichiers, empreinte SHA-256 de chaque fichier. Elle est **vérifiée automatiquement** à la fin de la sauvegarde. |

Côté Firebase, l'outil **ne fait que lire** : la clé utilisée n'a pas le droit d'écrire, c'est voulu.

**Différence avec les sauvegardes déjà présentes dans l'application** (`users/{uid}/backups/…`, restaurables depuis l'administration) : celles-ci sont rangées dans la même base Firestore que les données. Elles ne protègent pas d'une suppression de la base ou du projet, ni d'un compte administrateur compromis. La copie locale, elle, est hors de Google.

---

## 1. Place nécessaire

**Je n'ai pas pu mesurer la taille réelle** : l'outil n'a été exécuté que sur des émulateurs, jamais sur le vrai projet. Les journaux de la sauvegarde automatique intégrée à l'application montrent seulement **2 à 3 comptes actifs par période de 3 jours** : la base est donc petite pour l'instant.

Repères, avec les limites de l'application : une image fait **moins de 5 Mo** (règle Storage), un document Firestore **moins de 1 Mo**, et la base compresse environ **15 à 25 fois** (texte JSON).

| Comptes | Une sauvegarde de la base (compressée) | ≈ 15 sauvegardes conservées | Images (copie unique, incrémentale) | **Total** |
|---|---|---|---|---|
| 100 | 1 à 15 Mo | 20 à 200 Mo | 0,1 à 1 Go | **≈ 0,2 à 1,5 Go** |
| 1 000 | 10 à 150 Mo | 0,2 à 2 Go | 1 à 5 Go | **≈ 1 à 7 Go** |
| 10 000 | 0,1 à 1,5 Go | 2 à 20 Go | 10 à 50 Go | **≈ 10 à 70 Go** |

- Sauvegardes conservées : **les 3 derniers jours**, plus la dernière de chacune des 8 dernières semaines (lundi → dimanche) et de chacun des 12 derniers mois. Une même sauvegarde compte souvent plusieurs fois, d'où ≈ 15 au total, pas 23.
- Faire une sauvegarde par jour ne coûte presque rien en plus : les images ne sont téléchargées qu'une fois, et chaque sauvegarde en plus ne pèse que le poids de la base compressée.
- **Chiffre exact :** dès que la clé est en place, `node sauvegarder.js --estimer` donne le volume réel de Firestore, de Storage et le nombre de comptes (environ 1 minute, rien n'est écrit). `METTRE-EN-PLACE.cmd` le fait à l'étape 2.

**Une copie uniquement sur le PC disparaît avec lui** (vol, panne, rançongiciel). Conseillé :

- **Copie principale** sur le PC, dans `C:\P1Planner-Sauvegardes` (hors OneDrive).
- **Seconde copie** sur un disque externe (réglage `copies`) : l'outil le met à jour tout seul quand il est branché. Ne le laissez pas branché en permanence, un rançongiciel le chiffrerait aussi.
- **OneDrive** est possible (mettez `destination` dans un dossier OneDrive), avec deux réserves : le quota, et le fait qu'une copie de toutes les données de vos utilisateurs (e-mails, notes) partirait alors chez Microsoft. La **clé**, elle, ne doit jamais être dans OneDrive (l'outil la refuse).

---

## 2. Mise en place (une seule fois)

Le plus simple est `GUIDE.html`. La méthode manuelle ci-dessous donne les mêmes résultats.

### a) Créer une clé en lecture seule

1. Ouvrez https://console.cloud.google.com/iam-admin/serviceaccounts?project=p1planner
2. **Créer un compte de service**. Nom : `sauvegarde-locale`. Cliquez **Créer et continuer**.
3. Ajoutez ces **4 rôles**, rien de plus :
   - **Lecteur Cloud Datastore** (`roles/datastore.viewer`) : lecture de Firestore ;
   - **Lecteur des objets Storage** (`roles/storage.objectViewer`) : lecture des images ;
   - **Lecteur Firebase Authentication** (`roles/firebaseauth.viewer`) : liste des comptes ;
   - **Lecteur Firebase Rules** (`roles/firebaserules.viewer`) : copie des règles (facultatif).
4. Cliquez **OK**. Ouvrez le compte créé, puis l'onglet **Clés** : **Ajouter une clé** → **JSON**. Un fichier `cle-lecture-seule.json` est téléchargé.
5. Double-cliquez sur `METTRE-EN-PLACE.cmd` : il range la clé dans `%USERPROFILE%\.p1planner-sauvegarde\cle-lecture-seule.json` et en limite l'accès à votre seul compte Windows.

> Si Google refuse de créer une clé (règle d'organisation `disableServiceAccountKeyCreation`), la règle doit être levée pour ce projet : l'outil ne peut pas fonctionner sans clé.

**La clé n'est acceptée que si** elle appartient exactement à `sauvegarde-locale@p1planner.iam.gserviceaccount.com`, projet `p1planner`, et si elle n'est pas dans OneDrive. Une clé administrateur est refusée, par le script de mise en place comme par l'outil lui-même.

**Mots de passe.** Après la première sauvegarde, `DERNIERE-SAUVEGARDE.txt` indique si les mots de passe chiffrés sont inclus.

- S'ils ne le sont pas, rien de grave : un compte recréé garde son e-mail, son identifiant et toutes ses données. L'utilisateur clique simplement sur « Mot de passe oublié ».
- Pour les inclure : dans la console, **IAM → Rôles → Créer un rôle**, ajoutez la permission `firebaseauth.configs.getHashConfig`, puis donnez ce rôle au compte `sauvegarde-locale`.

### b) Choisir où ranger les sauvegardes

`config.json` est créé à partir de `config.exemple.json` (il n'est jamais envoyé sur GitHub). Vérifiez :

- `destination` : `C:\P1Planner-Sauvegardes` par défaut. Le dossier doit être vide ou ne servir qu'à ça. L'outil **refuse** : un dossier qui contient d'autres fichiers, la racine d'un disque, un dossier du dépôt P1Planner (ou un dossier qui le contient), et un dossier qui appartient à un autre outil de sauvegarde ou à un autre projet.
- `copies` : par exemple `["E:\\P1Planner-Sauvegardes"]` si vous avez un disque externe. Laissez `[]` sinon.
- `garderQuotidien` / `garderHebdo` / `garderMensuel` : 3, 8 et 12 par défaut (entiers ≥ 0, jamais tous à 0). Pour ne garder **que** les 3 derniers jours, mettez `garderHebdo` et `garderMensuel` à 0 (déconseillé : une erreur remarquée au bout de 4 jours ne serait plus rattrapable).
- `seuilRetardHeures` : 20 par défaut (voir le rattrapage plus bas).

### c) Première sauvegarde, à la main

```bash
node sauvegarder.js --estimer
```

```bash
node sauvegarder.js
```

(ou double-clic sur `lancer-sauvegarde.cmd`). La première fois, toutes les images sont téléchargées. À la fin, « Sauvegarde complète et vérifiée » s'affiche, et `DERNIERE-SAUVEGARDE.txt` résume le résultat.

### d) Automatiser (tâche planifiée Windows)

```bash
powershell -ExecutionPolicy Bypass -File .\installer-tache.ps1 -Apercu
```

```bash
powershell -ExecutionPolicy Bypass -File .\installer-tache.ps1
```

La tâche « P1Planner - Sauvegarde quotidienne » :

- tourne **chaque jour à 23 h** (`-Heure 21:00` pour changer) ;
- **réveille le PC** s'il est en veille et branché ;
- **se rattrape** si le PC n'était pas disponible : dès que possible, puis 15 minutes après chaque ouverture de session, tant que la dernière sauvegarde complète date de plus de 20 h ;
- exige internet, ne s'ouvre dans aucune fenêtre, et ne fait rien si une sauvegarde récente existe.

Pour la retirer : `desinstaller-tache.ps1`.

### e) Préparer la restauration (le jour où elle sert)

La sauvegarde ne peut que lire. Pour **remettre** des données en ligne, il faut une seconde clé qui a le droit d'écrire. Pour qu'**aucune clé capable d'écrire ne reste sur le PC**, ne la créez que le jour d'un problème (`GUIDE.html`, partie « Le jour où il faut restaurer »), puis supprimez le compte `restauration` une fois la restauration terminée et vérifiée.

Compte `restauration`, 3 rôles : **Utilisateur Cloud Datastore** (`roles/datastore.user`), **Administrateur des objets Storage** (`roles/storage.objectAdmin`), **Administrateur Firebase Authentication** (`roles/firebaseauth.admin`). Clé rangée par `ACTIVER-RESTAURATION.cmd` dans `%USERPROFILE%\.p1planner-sauvegarde\cle-restauration.json` (réglage `cleRestauration`). La tâche automatique ne l'utilise jamais.

---

## 3. Au quotidien

- **Rien à faire.** En cas d'échec, un fichier **`SAUVEGARDE P1PLANNER EN ECHEC.txt`** apparaît sur le Bureau, avec l'erreur et le chemin du journal. Il disparaît à la sauvegarde réussie suivante. Les sauvegardes précédentes ne sont jamais touchées par un échec.
- **Vérifier** la dernière sauvegarde : `node verifier.js`. Toutes, avec relecture complète des images : `node verifier.js --toutes --complet`.
- **Journaux** : `C:\P1Planner-Sauvegardes\journaux\`.
- **Coût Firebase** : environ 2 lectures par document à chaque sauvegarde. Les images ne sont téléchargées qu'une fois.

## 4. Récupérer des données : double-clic sur `RESTAURER.cmd`

| Situation | Dans le menu | Ce qui se passe |
|---|---|---|
| **Un utilisateur a perdu des données** (notes, cours, flashcards, planning…) ou son compte | **1**, puis son **UID** (l'e-mail est accepté aussi) | Tout ce qui lui appartient et qui manque est remis : ses données `users/{uid}/…`, ses droits et sa facturation, ses statistiques et trophées, son code de parrainage, ses retours, ses images, et son compte s'il a disparu (même identifiant, même e-mail). Les autres utilisateurs ne sont pas touchés. |
| **Panne, suppression massive, mauvaise manipulation** | **2** | Toute la base est comparée à la sauvegarde. Tout ce qui manque est remis : documents, images, comptes. |
| **Voir ce qu'un utilisateur avait**, sans rien modifier | **3**, puis son UID | Un dossier lisible apparaît sur le Bureau : `donnees.json` et ses images. |
| **Une restauration était une erreur** | **4** | Retour à l'état d'avant la restauration. Ce que l'utilisateur a modifié entre-temps est gardé. |

**Trouver l'UID** : console Firebase → Authentication → colonne « UID utilisateur ».

**Le déroulement est toujours le même :**

1. Choix de la sauvegarde. La plus récente est proposée ; prenez-en une plus ancienne si la perte date d'avant.
2. **Analyse sans rien écrire.** L'outil affiche ce qui manque en ligne, ce qui a changé depuis, et ce qui est identique.
3. Votre choix :
   - **1 = remettre seulement ce qui manque** (recommandé). Les éléments absents sont recréés ; si l'un d'eux réapparaît entre-temps, il n'est jamais écrasé. Rien de ce qui existe n'est touché, donc le travail fait depuis la sauvegarde est préservé.
   - **2 = remettre aussi l'ancienne version de ce qui a changé.** À réserver au cas où la version en ligne est abîmée.
4. Confirmation : tapez `RESTAURER` (un utilisateur) ou `TOUT RESTAURER`.
5. Rapport à l'écran. Le détail est gardé dans `C:\P1Planner-Sauvegardes\restaurations\`, avec l'état d'avant, ce qui permet le menu 4.

**Les comptes disparus** sont recréés avec le même UID. Avec leur mot de passe si les paramètres de hachage ont été sauvegardés ; sinon l'utilisateur passe par « Mot de passe oublié ».

**Droits Premium et facturation.** `entitlements/{uid}` et `billingPrivate/{uid}` sont remis tels qu'à la date de la sauvegarde. L'assistant le signale avant d'écrire. Après une restauration d'un utilisateur, vérifiez dans Stripe que l'abonnement correspond, et ne restaurez pas ces documents d'une sauvegarde trop ancienne si l'abonnement a changé depuis.

**Les sauvegardes du disque externe** (réglage `copies`) sont proposées aussi. Si le PC est perdu, installez l'outil sur un autre PC et branchez le disque.

**Limites à connaître :**

- Ce qui a été créé **depuis la dernière sauvegarde** n'y figure pas. Ce n'est pas un problème quand le contenu existe encore en ligne, puisque rien n'est écrasé par défaut.
- Une panne de Google ne fait pas perdre de données : il suffit d'attendre. Les menus 1 et 2 servent quand des données ont réellement **disparu ou été abîmées**.
- **Projet Firebase supprimé par erreur** : Google le garde 30 jours (console Google Cloud → Gérer les ressources → « En attente de suppression »).
- **Retrouver des documents abîmés** (par exemple un texte de note remplacé par un écran de chargement) : le menu 3 produit un `donnees.json` lisible, où l'on peut chercher le texte voulu ; ou `node extraire.js --uid <UID>`, ou `node extraire.js --chemin users/<UID>/notes`.

**Pour les experts** : `restaurer.js` fait la même chose en ligne de commande (aperçu par défaut, `--appliquer` pour écrire, `--ecraser` pour remplacer les documents différents). Il refuse la production sans `--cle-ecriture`, sans sélection (`--uid`, `--chemin` ou `--tout`), sans confirmation tapée, et si la sauvegarde vient d'un autre projet. Il sait aussi recharger une sauvegarde dans un émulateur local pour la consulter :

```bash
node restaurer.js C:\P1Planner-Sauvegardes\<date> --emulateur 127.0.0.1:8080 127.0.0.1:9099 127.0.0.1:9199 --projet demo-test --appliquer
```

## 5. Isolation et sécurité

- L'outil ne se connecte à Firebase **que** pour le projet `p1planner` et le bucket `p1planner.firebasestorage.app`, avec une clé du compte `sauvegarde-locale` (ou `restauration` pour la restauration). Toute autre clé ou tout autre projet est refusé avant la connexion.
- Les émulateurs ne sont acceptés que sur une adresse locale.
- Aucune clé, aucun mot de passe, aucun secret dans le dépôt : `config.json` et `node_modules/` sont ignorés par Git, et les clés sont rangées hors du dépôt et hors de OneDrive.
- L'outil vit dans `tools/sauvegarde-locale/`, jamais dans `public/` (déployé par Hosting) ni dans `functions/`.

## 6. Ce qui a été testé (émulateurs uniquement, jamais le vrai projet)

`node tests/lancer-tests.js` démarre des émulateurs sur des ports réservés (Firestore 8380, Auth 9398, Storage 9498, hub 4800, journal 4900), exécute `tests/test-emulateur.js` puis `tests/test-mise-en-place.ps1`, et n'arrête que ce qu'il a lancé. Les résultats exacts sont dans `docs/QA.md`.

- **Contenu** : documents sur 6 niveaux de profondeur, tous les types Firestore, noms accentués, documents rangés sous un parent qui n'existe plus ; structure de P1Planner (cours et tours, notes, flashcards, cahiers d'erreurs, entraînements, `backups`, `entitlements`, parrainage…), avec des séparateurs U+2028 et U+2029 dans les textes. Tout est retrouvé à l'identique.
- **Storage** : noms interdits sous Windows, fichier vide, jetons de lien conservés.
- **Incrémental** : fichiers ajoutés, supprimés, remplacés ; les anciennes versions sont conservées et les anciennes sauvegardes restent complètes.
- **Incidents** : sauvegarde coupée net puis reprise propre ; Firebase injoignable avec échec propre et alerte.
- **Rotation** (3 jours, 8 semaines, 12 mois) et **garde-fous** : dossier étranger, dossier du dépôt, dossier d'un autre outil, autre projet, autre bucket, clé dans OneDrive, clé d'un autre compte, clé de restauration utilisée pour la sauvegarde, production sans clé ni sélection, sauvegarde d'un autre projet.
- **Restauration complète** dans un projet vierge puis nouvelle sauvegarde : résultat identique (Firestore, Storage avec jetons, comptes).
- **Restauration d'un seul utilisateur, par UID** : seul ce qui manque est remis ; la note modifiée depuis est conservée ; `--ecraser` remplace.
- **Assistant `RESTAURER.cmd`** piloté par entrée redirigée : un utilisateur dont le compte, des notes, ses droits et une image ont disparu ; « ne rien faire » et une confirmation mal tapée n'écrivent rien ; annulation qui garde une note retouchée entre-temps ; tout restaurer après une perte massive puis nouvelle analyse sans manque ; import de compte au format SCRYPT.
- **Mise en place** avec de fausses clés : aucune clé, clé d'un autre compte, clé d'un autre projet, bonne clé, doublon, relance, remplacement d'une clé déjà protégée, mode restauration.
