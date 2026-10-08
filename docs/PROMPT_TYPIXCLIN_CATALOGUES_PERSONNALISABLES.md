# Prompt à donner à Claude sur le projet TypixClin — Catalogues personnalisables (ressources, supports, types et plateformes d'entraînement)

> **Origine de ce document.** Cette fonctionnalité a été conçue, développée, testée et déployée sur
> **P1Planner** (produit frère isolé de TypixClin) en septembre 2026. Ce prompt décrit precisément ce qui a été
> construit là-bas, avec toute l'architecture, les choix d'UX, les bugs réels rencontrés et leurs correctifs —
> pour permettre de porter la même fonctionnalité sur **TypixClin** (`TableurEnLigne.html` = EDN et
> `TableurECOS.html` = ECOS), en l'adaptant à l'architecture propre de TypixClin (document utilisateur unique,
> pas de collections Firestore décomposées comme sur P1Planner).
>
> **À coller telle quelle en début de session Claude Code, dans le dossier du projet TypixClin.**

---

## 0. Contexte et objectif

Actuellement, sur TypixClin (EDN **et** ECOS), les catalogues suivants sont des **listes figées, codées en dur**
dans le HTML/JS, identiques pour tous les utilisateurs, non modifiables :

- Les **ressources** (les pastilles de raccourci affichées sur chaque item/cours, ex. "Qi EDNi", "DP Hypo"...).
- Les **supports** de tour (EDN uniquement — le tag affiché sur un tour validé en mode détaillé : QCM, Fiche de
  cours, etc.).
- Les **types d'entraînement** (Masterclass, Spé 360°, Annale, CCB, Concours R2C).
- Les **plateformes d'entraînement** (EDNi, Asclepia, Hypocampus, UNESS).

**Objectif** : permettre à chaque utilisateur de **personnaliser** ces 4 catalogues — renommer, recolorer,
ajouter ses propres entrées (dans une limite raisonnable), tout en gardant les entrées par défaut actuelles
**toujours présentes et non supprimables** (elles sont utilisées par des données réelles déjà enregistrées chez
de vrais utilisateurs — voir section 1, c'est le point le plus important de tout ce document).

Le mécanisme exact (architecture, UX, pièges) a déjà été construit, éprouvé et corrigé sur P1Planner. Ce prompt
sert de **spécification + retour d'expérience** pour le refaire sur TypixClin sans redécouvrir les mêmes bugs.

---

## 1. ⚠️ Différence CRITIQUE avec P1Planner : des données réelles existent déjà

**P1Planner était un produit neuf (aucun utilisateur historique)** : les catalogues par défaut ont pu être
choisis librement (3 ressources, 4 supports, 3 types, 2 plateformes).

**TypixClin a de VRAIS utilisateurs avec de VRAIES données déjà enregistrées** référençant les ids actuels. Les
catalogues par défaut de la version personnalisable **DOIVENT reprendre EXACTEMENT les ids actuels**, sans en
renommer ni en retirer un seul, sous peine de corrompre l'affichage de tours/entraînements déjà validés chez des
utilisateurs réels. C'est une règle **P0** au sens de `CLAUDE.md` (équivalent : "écrasement de données
existantes par une initialisation vide" / perte d'intégrité d'affichage).

### 1.1 Ressources — EDN (`TableurEnLigne.html`, `AVAILABLE_RESOURCES`, ligne ~21058)

```js
const AVAILABLE_RESOURCES = [
    { id: 'qi-edni',     label: 'Qi sur EDNi',      shortLabel: 'Qi EDNi',   cssClass: 'qi-edni' },
    { id: 'dp-edni',     label: 'DP sur EDNi',      shortLabel: 'DP EDNi',   cssClass: 'dp-edni' },
    { id: 'qi-hypo',     label: 'Qi sur Hypocampus',shortLabel: 'Qi Hypo',   cssClass: 'qi-hypo' },
    { id: 'dp-hypo',     label: 'DP Hypocampus',    shortLabel: 'DP Hypo',   cssClass: 'dp-hypo' },
    { id: 'qi-annales',  label: 'Qi Annales',       shortLabel: 'Qi Ann',    cssClass: 'qi-annales' },
    { id: 'dp-annales',  label: 'DP Annales',       shortLabel: 'DP Ann',   cssClass: 'dp-annales' },
    { id: 'qi-uness',    label: 'Qi sur UNESS',     shortLabel: 'Qi UNESS',  cssClass: 'qi-uness' },
    { id: 'dp-uness',    label: 'DP sur UNESS',     shortLabel: 'DP UNESS',  cssClass: 'dp-uness' },
    { id: 'fiche-perso', label: 'Fiche Perso',      shortLabel: 'Fiche',     cssClass: 'fiche-perso' }
];
```
9 entrées. Couleurs actuelles définies par classe CSS `.resource-box.<cssClass>` (ligne ~3922) : à convertir en
couleurs hexadécimales par entrée (voir section 4) en reprenant visuellement les teintes actuelles (ex. qi-edni/
dp-edni → rouge `#991b1b`/`#fee2e2`, qi-hypo/dp-hypo → bleu `#1e40af`/`#dbeafe`, qi-annales/dp-annales → orange
`#c2410c`/`#ffedd5`, qi-uness/dp-uness → violet `#5b21b6`/`#ede9fe`, fiche-perso → ambre `#92400e`/`#fef3c7`).

### 1.2 Ressources — ECOS (`TableurECOS.html`, `ECOS_AVAILABLE_RESOURCES`, ligne ~27739)

Catalogue **séparé et différent** de celui d'EDN (domaine ECOS, pas de Qi/DP) :

```js
const ECOS_AVAILABLE_RESOURCES = [
    { id: 'hypocampus', label: 'Hypocampus',   short: 'Hypo',       bg: '#dbeafe', color: '#1e40af', desc: 'Hypocampus' },
    { id: 'edni',       label: 'EDNi',         short: 'EDNi',       bg: '#fee2e2', color: '#991b1b', desc: 'EDNi' },
    { id: 'ecosim',     label: 'ECOSIM',       short: 'ECOSIM',     bg: '#dcfce7', color: '#166534', desc: 'ECOSIM' },
    { id: 'tacfa',      label: 'TACFA',        short: 'TACFA',      bg: '#ffedd5', color: '#c2410c', desc: 'TACFA' },
    { id: 'ecosalpha',  label: 'ECOSalpha',    short: 'α-ECOS',     bg: '#ede9fe', color: '#5b21b6', desc: 'ECOSα' },
    { id: 'ecosplus',   label: 'ECOS +',       short: 'ECOS+',      bg: '#fce7f3', color: '#9d174d', desc: 'ECOS +' },
    { id: 'martingale', label: 'La martingale',short: 'Martin.',    bg: '#fef3c7', color: '#92400e', desc: 'La martingale' },
    { id: 'ecostbc',    label: 'ECOS TBC',     short: 'TBC',        bg: '#e0f2fe', color: '#075985', desc: 'ECOS TBC' },
    { id: 'alacarte',   label: 'À la carte',   short: 'À la carte', bg: '#f3e8ff', color: '#6b21a8', desc: 'À la carte' }
];
```
9 entrées, déjà avec une couleur par entrée (bg/color) — plus proche du modèle cible que la version EDN.

⚠️ **id "edni" existe dans les DEUX catalogues (EDN et ECOS) mais ce sont deux entrées indépendantes** (contextes
différents). Ne jamais les fusionner en un seul catalogue partagé : garder deux catalogues de ressources
séparés, un par fichier, exactement comme aujourd'hui.

### 1.3 Supports — EDN uniquement (`TableurEnLigne.html`, ligne ~28148)

```js
const supportLabels = { qcm: 'QCM', college: 'COL', anki: 'LIS', perso: 'PER', codex: 'COD', conf: 'CNF' };
```
Couleurs actuelles (ligne ~4920, classe `.tour-support.<id>`) :
```
qcm:     #3b82f6      college: #8b5cf6      anki:  #ef4444
perso:   #f59e0b      codex:   #10b981      conf:  #ec4899
```
6 entrées par défaut. **ECOS n'a PAS de notion de "support" de tour** — ne pas ajouter cette fonctionnalité côté
ECOS, elle n'a pas de sens dans son modèle (pas de `tourSupports` dans `TableurECOS.html`).

Le nom complet correspondant à chaque acronyme (à vérifier avec Jean si un doute, mais la correspondance connue
côté P1Planner était) : `qcm` = QCM, `college` = Collège (source institutionnelle), `anki` = Anki/LISA (acronyme
LIS), `perso` = Fiche perso, `codex` = Codex, `conf` = Conférence.

### 1.4 Types d'entraînement — EDN **et** ECOS (identiques, dupliqués dans les 2 fichiers)

```js
var TYPE_COLORS   = { masterclass:'#7c3aed', spe360:'#2563eb', annale:'#b45309', ccb:'#059669', r2c:'#dc2626' };
var TRAIN_TYPE_LBL = { masterclass:'Masterclass', spe360:'Spé 360°', annale:'Annale', ccb:'CCB', r2c:'Concours R2C' };
```
5 entrées, identiques dans `TableurEnLigne.html` (ligne ~31664) et `TableurECOS.html` (mêmes valeurs, CSS
dupliqué ligne ~19372).

### 1.5 Plateformes d'entraînement — EDN **et** ECOS (identiques, dupliquées dans les 2 fichiers)

```js
var PLAT_COLORS = { edni:'#0e7490', asclepia:'#be185d', hypocampus:'#4338ca', uness:'#c2410c' };
var PLAT_LBL    = { edni:'EDNi', asclepia:'Asclepia', hypocampus:'Hypocampus', uness:'UNESS' };
```
4 entrées, identiques dans les deux fichiers.

### 1.6 Conséquence directe sur les plafonds

Les plafonds `MAX_CUSTOM_*` de P1Planner (6/7/6/5 au total, défauts inclus) ne sont **pas transposables tels
quels** puisque TypixClin a déjà 9 ressources / 6 supports / 5 types / 4 plateformes par défaut. Proposition
(à confirmer avec Jean avant de coder, ne pas trancher seul) :

| Catalogue                  | Défauts (protégés) | Ajouts max proposés | Plafond total |
|-----------------------------|:---:|:---:|:---:|
| Ressources EDN               | 9 | 3 | 12 |
| Ressources ECOS               | 9 | 3 | 12 |
| Supports (EDN)                | 6 | 3 | 9  |
| Types d'entraînement          | 5 | 3 | 8  |
| Plateformes d'entraînement    | 4 | 3 | 7  |

---

## 2. Ce qui a été construit sur P1Planner (architecture de référence)

### 2.1 Principe général (identique pour les 4 catalogues)

- `DEFAULT_*` : tableau figé des entrées par défaut (id, label, color, et `abbr` pour les supports) — **jamais
  modifié à l'exécution**, sert de filet de sécurité pour ne jamais perdre un défaut.
- Persisté sur Firestore : un tableau `custom*` (ex. `customResources`) contenant TOUTES les entrées connues
  (défauts + ajouts), chacune avec un flag `archived: true/false`.
- **Suppression = archivage, JAMAIS une suppression dure.** Mettre `archived: true` et ne plus jamais splice/
  delete l'entrée du tableau. Raison impérative : si un cours/tour/entraînement déjà enregistré référence cet
  id, il doit continuer à afficher le VRAI nom/la VRAIE couleur, jamais un repli illisible du type "identifiant
  interne tronqué" ou une case vide. Un audit dédié a été fait sur ce point précis sur P1Planner (voir section 5,
  point 2) — à refaire ici aussi avant de considérer la fonctionnalité terminée.
- Deux vues dérivées à chaque lecture :
  - **Vue ACTIVE** (`p1ActiveCatalog(full, max)`) : entrées non archivées, plafonnées à `max` — c'est ce que
    l'utilisateur voit et peut choisir pour une NOUVELLE donnée.
  - **Vue COMPLÈTE** : active + archivées — c'est la SEULE vue à sauvegarder sur Firestore (ne jamais persister
    la vue active seule, on perdrait l'historique des entrées archivées).
- Une fonction `p1ApplyCustomCatalog(raw, defaults, withAbbr)` réinsère TOUJOURS les défauts manquants d'un
  tableau brut lu depuis Firestore (au cas où un défaut manquerait dans une donnée ancienne/corrompue) —
  garantit qu'un défaut n'est jamais durablement perdu même en cas de bug de sauvegarde antérieur.
- Une fonction de résolution `p1Resolve*Meta(id)` (une par catalogue) qui **ne renvoie jamais null/undefined**
  pour un id ayant existé un jour : vérifie d'abord la vue active, puis la vue complète (y compris archivées),
  puis une table `LEGACY_*_META` pour d'éventuels ids encore plus anciens absents même du tableau persisté, puis
  un repli générique gris avec le label = l'id lui-même (jamais un champ vide ou un caractère bizarre).
- Sanitization stricte à l'écriture (`p1SanitizeCatalogEntry`) : label (trim, longueur max — **prendre une
  limite ≥ au label par défaut le plus long actuellement**, ex. "Concours R2C"/"Qi sur EDNi" ~13 caractères, donc
  prévoir au moins 20 pour de la marge, JAMAIS une limite trouvée a posteriori trop juste — un bug de ce type
  précis est arrivé deux fois sur P1Planner, voir section 5 point 3), couleur validée par regex
  `/^#[0-9a-fA-F]{6}$/` sinon repli gris, acronyme optionnel 3 lettres majuscules pour les supports uniquement.

### 2.2 Interface

- Un **modal unique partagé** par les 4 catalogues (comme `#p1-catalog-modal` sur P1Planner), piloté par une
  table de configuration `{ getActive, setActive, getFull, defaults, max, save }` par catalogue plutôt que du
  code dupliqué 4 fois. Titre/sous-titre spécifiques par catalogue.
- Deux sections claires dans le modal : **"Ajouter"** (formulaire nom + [acronyme si supports] + palette de
  couleurs restreinte, ~12 teintes prédéfinies en pastilles cliquables — jamais un `<input type="color">` natif)
  et **"Existants"** (liste des entrées, chacune avec pastille de couleur cliquable pour recolorer, champ nom
  éditable, cadenas 🔒 si c'est un défaut protégé sinon bouton corbeille).
- Icône crayon à côté de chaque sélecteur concerné (Support dans le modal de tour détaillé, Type/Plateforme dans
  le modal d'ajout d'entraînement, futur bouton "Gérer mes ressources" déjà existant potentiellement à adapter)
  ouvrant directement le bon catalogue dans le modal partagé.
- **Confirmation visuelle sur le bouton "Ajouter"** : au clic, le bouton passe au vert avec une coche pendant
  ~1,5s puis revient à son état normal — Jean a explicitement demandé de s'inspirer du bouton "copier le lien de
  parrainage" déjà présent sur TypixClin pour ce pattern.
- **Animation de suppression discrète** : fondu d'opacité ~200ms avant que la ligne ne disparaisse de la liste,
  jamais une disparition instantanée. Voir section 5 point 8 pour le piège principal à ce sujet (course avec un
  listener réactif).
- Modal borné en hauteur (`max-height`, ex. 85vh) avec un SEUL défilement (jamais un défilement imbriqué —
  liste + modal qui défilent tous les deux, ça crée une confusion visuelle réelle rencontrée sur P1Planner).

### 2.3 Répercussions dans le reste du tableur

- Les boutons de ressources/supports/types/plateformes affichés ailleurs (item, tour détaillé, tableau
  d'entraînements, filtres déroulants) doivent tous être **générés dynamiquement depuis le catalogue actif**,
  avec un style inline calculé depuis la couleur hexadécimale de l'entrée (fonction `pHexToRgb`/`pXxxBadgeStyle`)
  — **jamais des classes CSS figées par id**, puisqu'une entrée personnalisée n'a par définition pas de classe
  CSS dédiée.
- Toute création/suppression/renommage dans le catalogue doit **rafraîchir immédiatement** tous les endroits qui
  affichent ce catalogue, y compris un modal DÉJÀ OUVERT au moment du changement (piège rencontré, voir section
  5 point 5) — pas seulement au prochain rechargement de page.

---

## 3. Adaptation à l'architecture TypixClin (document utilisateur unique)

P1Planner stocke ces catalogues dans `users/{uid}/settings/preferences` (sous-document dédié, car son
architecture générale décompose déjà les données en collections `subjects`/`courses`/`trainingItems`).

**TypixClin utilise un document utilisateur unique** `users/{uid}` (voir `doc(db, 'users', currentUser.uid)`,
écrit via `updateDoc`/`setDoc(..., {merge:true})`, structure généralement lue/écrite en un bloc via
`userData`/`saveUserData()`). Les 4 nouveaux catalogues doivent donc devenir de simples **champs supplémentaires
de `userData`**, exactement comme `userData.selectedResources` existe déjà aujourd'hui :

```js
userData.customResources        // EDN : tableau d'entrées {id,label,color,archived}
userData.customResourcesEcos    // ECOS : catalogue séparé (voir 1.2) — nom de champ à choisir avec Jean
userData.customSupports         // EDN uniquement
userData.customTrainTypes       // EDN + ECOS (partagé si l'architecture Firestore le permet, sinon dupliqué)
userData.customTrainPlateformes // EDN + ECOS (idem)
```

Points d'attention propres à cette architecture :
- Ces champs doivent être inclus dans les objets passés à `saveUserData()`/`updateDoc(...)`, comme n'importe quel
  autre champ `userData` déjà existant — pas de nouvelle collection à créer, pas de nouvelles Firestore Rules a
  priori (à vérifier avec les Rules actuelles de TypixClin : ces champs doivent rester dans le sous-ensemble déjà
  autorisé en écriture cliente pour `users/{uid}`, sans toucher aux champs backend-only comme `premium`/`role`).
- **EDN et ECOS partagent-ils le même document `users/{uid}` ?** À vérifier précisément avant de coder (lire le
  code existant, ne pas supposer) : si oui, `customTrainTypes`/`customTrainPlateformes` peuvent être un SEUL
  champ partagé ; si les deux tableurs ont des documents ou sous-espaces séparés, il faudra soit dupliquer le
  champ, soit le mettre dans une zone commune. Ressources et supports, eux, sont de toute façon distincts par
  tableur (voir 1.2/1.3) donc des champs séparés dans tous les cas.
- Garder la même distinction que P1Planner entre écriture immédiate (l'archivage/l'ajout doivent être persistés
  tout de suite, aucun risque de perte si l'utilisateur ferme le modal juste après) et re-rendu éventuellement
  différé pour l'animation (voir section 5 point 8).

---

## 4. Spécification fonctionnelle détaillée (comportement exact attendu)

Reprendre l'expérience utilisateur telle que validée sur P1Planner par Jean (plusieurs allers-retours de retours
utilisateurs réels, résumés ici pour ne pas repartir de zéro) :

1. Bouton "Gérer les ressources / les supports / les types / les plateformes" (icône crayon ou bouton dédié)
   ouvre le catalogue correspondant.
2. Le modal affiche en haut le formulaire d'ajout (nom, acronyme si support, palette de 12 couleurs), en bas la
   liste des entrées existantes (défauts en premier, avec cadenas ; personnalisées ensuite, avec corbeille).
3. Ajouter une entrée : validation du nom (non vide, longueur raisonnable, pas de doublon de nom dans le même
   catalogue), couleur choisie dans la palette restreinte, sauvegarde Firestore immédiate, confirmation visuelle
   verte sur le bouton, la nouvelle entrée apparaît EN BAS de la liste "Existants" sans recharger la page.
4. Renommer/recolorer une entrée (y compris un défaut) : édition inline, sauvegarde immédiate, répercutée
   partout où cette entrée est affichée (y compris sur des données déjà enregistrées avec cet id).
5. Supprimer une entrée personnalisée (jamais un défaut, qui affiche un cadenas à la place du bouton) : archivage
   (jamais une suppression dure), animation de fondu avant disparition de la liste, le plafond se libère d'un
   cran, mais les données déjà enregistrées avec cet id continuent d'afficher son vrai nom/sa vraie couleur pour
   toujours (jusqu'à ce qu'elles soient elles-mêmes modifiées).
6. Plafond atteint : bouton "Ajouter" désactivé, message explicite affiché, jamais un échec silencieux.
7. Aucune suggestion de mot de passe navigateur ne doit apparaître en tapant dans les champs Nom/Acronyme (voir
   section 5, points 6 et 7 — deux mécanismes de protection distincts et complémentaires, les DEUX sont
   nécessaires).
8. Sur mobile, le modal ne doit provoquer aucun effet de repositionnement/redimensionnement visuel parasite à
   l'ouverture.

---

## 5. Pièges réels rencontrés sur P1Planner — à éviter d'emblée (ne pas les redécouvrir un par un)

Chacun de ces points a coûté un vrai cycle debug/correctif/test sur P1Planner. Les lire avant de coder fait
gagner un temps réel.

1. **Script `module` vs script classique (scope JS).** Le fichier contient plusieurs balises `<script>`
   séparées, certaines `type="module"` (12 occurrences déjà présentes dans `TableurEnLigne.html` — donc le même
   risque existe ICI, pas hypothétique). Une fonction/variable déclarée en haut niveau d'un script `module` NE
   devient PAS une propriété de `window` et est invisible depuis un script classique (et réciproquement, une
   variable classique EST une propriété de `window`, lisible depuis un module). Toute fonction du nouveau
   catalogue appelée depuis un AUTRE script (ex. la logique des entraînements, si elle est dans un script
   différent de celui où sera écrit le catalogue) doit être explicitement exposée via `window.maFonction = ...`
   depuis son script d'origine. Ce bug précis a fait planter silencieusement (aucune erreur visible à l'écran)
   l'affichage de la carte contexte et des badges d'un modal d'entraînement sur P1Planner — trouvé uniquement
   par un test automatisé qui vérifiait le TEXTE affiché, pas par relecture de code. **Écrire un test qui clique
   réellement et lit le texte affiché, pas seulement un test qui vérifie l'état interne.**

2. **Suppression = archivage, jamais suppression dure.** Root cause déjà expliquée en 2.1 — un audit dédié a été
   demandé et fait sur P1Planner ("qu'est-ce qui se passe si je supprime un support déjà utilisé par un tour
   enregistré ?"). Refaire cet audit explicitement ici avant de livrer : créer un tour/entraînement avec un
   support/type/plateforme personnalisé, supprimer cette entrée du catalogue, vérifier que l'affichage reste
   correct (vrai nom, vraie couleur) et qu'aucune donnée Firestore n'est altérée.

3. **Limite de longueur du label trouvée trop juste, DEUX FOIS.** Une limite choisie à 12 caractères a tronqué
   silencieusement un défaut existant ("Fiche de cours" → "Fiche de cou") dès qu'il repassait par le circuit de
   sanitization (ce qui arrive dès qu'UN SEUL ajout/renommage déclenche une sauvegarde complète du catalogue,
   défauts inclus). Corrigé en portant la limite à une valeur strictement supérieure au plus long label par
   défaut RÉEL. Sur TypixClin, vérifier le plus long label existant dans les 4 catalogues avant de choisir la
   limite (ex. "Qi sur EDNi", "Concours R2C" ~13 caractères → prévoir large, 20+ caractères minimum) et ajouter
   un test qui vérifie explicitement qu'aucun label par défaut n'est tronqué après un cycle sauvegarde/relecture.

4. **`CSS.escape()` sur un id purement numérique casse un sélecteur d'attribut.** Si un des ids (entraînements
   par exemple, si TypixClin utilise des ids numériques comme certains champs de P1Planner) commence par un
   chiffre, `CSS.escape(String(id))` produit une séquence d'échappement hexadécimale pensée pour un IDENTIFIANT
   CSS, invalide une fois insérée telle quelle À L'INTÉRIEUR d'une chaîne entre guillemets d'un sélecteur
   d'attribut (`[data-id="…"]`). Résultat : le sélecteur ne correspond plus jamais à rien, silencieusement.
   Ne JAMAIS faire `document.querySelector('[data-id="' + CSS.escape(id) + '"]')` — comparer directement sur le
   dataset à la place : `Array.prototype.find.call(document.querySelectorAll('[data-id]'), el => el.dataset.id
   === String(id))`.

5. **Rafraîchissement d'un modal déjà ouvert au moment du changement.** Si l'utilisateur ouvre "Ajouter un
   entraînement" PUIS clique sur le crayon "Gérer les types" (modal de catalogue par-dessus), ajoute un type,
   referme le catalogue : le modal d'ajout d'entraînement resté ouvert en dessous doit voir apparaître le
   nouveau type SANS avoir besoin d'être fermé/rouvert. Un bug réel sur P1Planner routait ce cas vers la
   mauvaise branche de code et ne rafraîchissait rien — trouvé par un test qui garde le premier modal ouvert
   pendant toute la manipulation, PAS un test qui ferme/rouvre à chaque étape (ce dernier masque le bug).

6. **Autofill navigateur, mécanisme n°1 — deux champs texte adjacents.** Chrome/Edge détectent un
   "formulaire d'identifiant" dès que 2 `<input type="text">` se suivent dans le DOM (ex. Nom + Acronyme d'un
   support), indépendamment des attributs `autocomplete`/`name`/labels. La seule parade fiable trouvée : utiliser
   de VRAIS `<textarea rows="1">` déguisés en champ mono-ligne (CSS : `resize:none; overflow:hidden;
   white-space:nowrap`), avec interception de la touche Entrée pour empêcher l'insertion d'un retour à la ligne.
   `readonly` au repos + déverrouillage au premier `pointerdown`/`keydown` réel évite en plus une éventuelle
   pré-sélection de suggestion à l'affichage.

7. **Autofill navigateur, mécanisme n°2 — "formulaire non rattaché" (unowned form), distinct du n°1.**
   Si la page ne contient AUCUNE balise `<form>` nulle part (à vérifier explicitement sur TypixClin — si c'est
   le cas, comme ça l'était sur P1Planner), Chrome/Edge regroupent TOUS les champs texte/mot de passe de TOUTE
   la page en un seul "formulaire virtuel", indépendamment de la distance réelle dans le DOM. Un simple champ
   Nom du catalogue peut alors se retrouver associé aux vrais champs mot de passe du compte (changement de mot
   de passe/d'email), avec un vrai prompt "Enregistrer votre mot de passe ?" et un identifiant fantaisiste. La
   parade n'est PAS la même que le point 6 : il faut envelopper les VRAIS champs mot de passe existants (partout
   où ils sont, y compris dans les réglages du compte) dans de vraies balises `<form>` (avec
   `onsubmit="return false"` par sécurité) pour leur donner une frontière — cela suffit à isoler tout le reste de
   la page. **Vérifier en premier lieu si TypixClin a déjà des balises `<form>` ou non avant de conclure quoi que
   ce soit** (ne pas supposer, lire le code).

8. **Un listener Firestore réactif déjà branché peut court-circuiter une animation de suppression.** Retarder
   uniquement le RE-RENDU visuel (`renderXxx()`) via un `setTimeout` ne suffit pas si un `onSnapshot` déjà actif
   sur les données concernées réagit à l'écriture locale optimiste presque instantanément et relance son PROPRE
   rendu en court-circuitant le délai voulu. Il faut retarder **l'écriture Firestore elle-même**, pas seulement
   l'affichage, pour que l'animation ait le temps de se voir. Sur TypixClin, si un `onSnapshot` est déjà branché
   sur le document utilisateur ou une sous-collection concernée, vérifier ce point précisément avec un test qui
   mesure le délai réel (pas une supposition).

9. **`buildModal()` à overlay unique (id fixe, un seul modal à la fois) — bug PRÉEXISTANT déjà présent dans
   TypixClin, confirmé en lisant `TableurEnLigne.html` ligne ~62337.** Cette fonction supprime et recrée
   systématiquement le même `#tpx-modal-overlay` à chaque appel : ouvrir une boîte de confirmation
   (`confirmModal`, qui appelle aussi `buildModal`) PAR-DESSUS un modal de gestion déjà ouvert (ex. "Gérer mon
   programme") **détruit ce modal de gestion au moment même du clic**, avant toute confirmation. Si le code
   appelant tente ensuite de ré-utiliser une référence DOM capturée avant l'ouverture de la confirmation (`root`/
   `m`), elle est déjà détachée du document : aucun effet visible, et le modal de gestion **ne réapparaît plus
   jamais** après confirmation — l'utilisateur se retrouve sans aucun modal. **Ce bug existe très probablement
   déjà aujourd'hui dans TypixClin, indépendamment de toute nouvelle fonctionnalité de catalogue** (à vérifier :
   ouvrir "Gérer mon programme" côté matières/items personnalisés si cette fonctionnalité existe côté TypixClin,
   supprimer un élément, voir si le gestionnaire reste affiché après confirmation). Si vous ajoutez un
   gestionnaire de catalogue basé sur `buildModal`/`confirmModal`, la parade trouvée sur P1Planner : après
   confirmation, ROUVRIR explicitement le gestionnaire (`openManager(...)` ou équivalent) avec un court délai
   (~220ms, le temps que la confirmation termine son propre fondu de sortie) au lieu de tenter de réutiliser le
   DOM détaché. **Signaler ce bug préexistant à Jean séparément avant de le corriger silencieusement**, au cas où
   il préférerait le traiter comme un ticket à part.

10. **`dvh` (dynamic viewport height) vs `svh` (small viewport height) sur mobile.** `dvh` se recalcule EN DIRECT
    quand la barre d'adresse du navigateur mobile apparaît/disparaît (quelques centaines de ms après toute
    interaction), provoquant un redimensionnement visuel parasite du modal. `svh` ne change jamais après le
    premier rendu. Si un nouveau modal de catalogue utilise une contrainte `max-height` en unité de viewport,
    préférer `svh` à `dvh` d'emblée (support navigateur identique). Un effet de repositionnement au tout premier
    affichage d'un modal sur mobile — avant même tout contact avec un champ — a une chance non négligeable de
    venir de là si une seule des deux modales anciennes de TypixClin utilise déjà `dvh` quelque part (vérifié
    absent de `.settings-modal-inner` actuel, mais à revérifier si un nouveau CSS spécifique au catalogue est
    ajouté).

11. **Décalage horizontal (scrollbar) sur un overlay `position:fixed;inset:0`.** Un tel overlay est dimensionné
    par la largeur RÉELLE du viewport, qui change quand la barre de défilement native apparaît/disparaît —
    indépendamment de tout système de compensation par `padding-right` existant (qui n'affecte que les enfants du
    flux normal, jamais un élément `fixed`/`inset:0`). Si une future animation de confirmation/validation touche
    un tel overlay en même temps qu'un verrou de défilement s'active/se désactive, figer `width`/`height` en
    pixels réels AVANT le changement du verrou (puis libérer après disparition complète) évite tout décalage
    visuel d'un élément centré à l'intérieur.

---

## 6. Plan de travail recommandé

1. **Lire d'abord**, sans rien modifier : la section resources/supports/entraînements des DEUX fichiers
   (`TableurEnLigne.html`, `TableurECOS.html`), pour confirmer/actualiser tous les ids, couleurs et labels de la
   section 1 ci-dessus (ce document date de septembre 2026, le code a pu bouger depuis).
2. Vérifier l'architecture Firestore réelle actuelle (document unique confirmé en 3, mais à re-vérifier : EDN et
   ECOS partagent-ils vraiment `users/{uid}`, ou sont-ils sur des documents distincts malgré le même uid ?) et
   les Firestore Rules actuelles pour ces champs.
3. Vérifier si le bug `buildModal` à overlay unique (point 9 de la section 5) affecte déjà une fonctionnalité
   existante de TypixClin — le signaler à Jean avant de commencer, indépendamment du reste.
4. Proposer un plan détaillé (fichiers touchés, risques P0, plafonds proposés) et **attendre validation de Jean**
   avant de coder quoi que ce soit — conformément au `CLAUDE.md` du projet.
5. Implémenter le catalogue ressources EDN en premier (le plus simple, un seul fichier, un seul catalogue),
   valider son fonctionnement de bout en bout (y compris l'audit du point 2 section 5) avant de dupliquer le
   pattern aux 3 autres catalogues.
6. Dupliquer ensuite vers : ressources ECOS, supports EDN, types d'entraînement (EDN + ECOS), plateformes
   d'entraînement (EDN + ECOS).
7. Tester réellement à chaque étape (voir section 7) — ne jamais annoncer un test réussi sans l'avoir exécuté.
8. Mettre à jour la documentation du projet TypixClin équivalente à `docs/DECISIONS.md`/`docs/QA.md` si elle
   existe.
9. Déploiement uniquement après un GO explicite de Jean, comme sur P1Planner.

---

## 7. Tests à réaliser réellement avant toute mise en production

Pour chacun des 4 catalogues (ressources EDN, ressources ECOS, supports EDN, types+plateformes EDN/ECOS) :

- État par défaut : tous les défauts actuels présents, dans le bon ordre, avec le bon label/la bonne couleur —
  **comparer explicitement aux valeurs listées en section 1**, pas une valeur approximative.
- Défauts protégés : cadenas affiché, suppression impossible (même en forçant l'appel JS directement).
- Ajout d'une entrée personnalisée : sauvegardée sur Firestore, sélectionnable immédiatement partout où le
  catalogue est utilisé, y compris dans un modal DÉJÀ OUVERT au moment de l'ajout (piège section 5 point 5).
- Renommage/recoloration d'un défaut : répercuté partout, y compris sur des données déjà enregistrées avec cet
  id AVANT le renommage.
- **Audit suppression d'une entrée déjà utilisée** (section 5 point 2) : créer une donnée réelle avec une entrée
  personnalisée, la supprimer du catalogue, vérifier l'affichage ET l'intégrité Firestore de la donnée existante.
- Plafond : blocage propre au-delà de la limite choisie, message explicite.
- Persistance après rechargement complet de la page.
- Aucune suggestion/prompt d'autofill navigateur en tapant dans les champs du formulaire d'ajout (à défaut de
  pouvoir vérifier le vrai prompt Chrome/Edge en environnement de test automatisé, vérifier au minimum la
  structure DOM : pas 2 `<input type="text">` adjacents, et les vrais champs mot de passe du compte sont bien
  dans une balise `<form>` séparée si le point 7 de la section 5 s'applique).
- Comportement du modal sur mobile (pas d'effet de repositionnement à l'ouverture).
- Non-régression complète de la suite de tests existante de TypixClin si elle existe (à identifier en premier).

---

## 8. Rappel des règles de sécurité du projet (à faire respecter par Claude sur ce projet, comme sur P1Planner)

- Ne jamais déployer/committer/pusher sans un GO explicite de Jean dans le message en cours.
- Ne jamais casser l'affichage de données déjà enregistrées chez un utilisateur réel — c'est le risque n°1 de
  toute cette fonctionnalité (voir section 1).
- Ne jamais introduire de secret serveur, clé privée, ou identifiant sensible dans le frontend.
- Auditer explicitement le cas "suppression d'une entrée déjà utilisée par une donnée existante" avant de
  considérer la fonctionnalité terminée — ce n'est pas optionnel, c'est le point qui a le plus de risque de
  régression silencieuse.
- Tester réellement (exécution effective, pas une supposition) avant d'annoncer qu'un point fonctionne.
