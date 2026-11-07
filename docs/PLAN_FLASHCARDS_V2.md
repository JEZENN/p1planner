# Plan détaillé — nouveau système de flashcards (modes, drapeaux, réglages)

Statut (2026-11-05) : **implémenté en local, testé, non commité ni déployé.** Détails des décisions réelles dans DECISIONS.md (entrée du 2026-11-05) ; les noms de drapeaux du code sont `important` / `difficile` / `corriger`, et les cartes « pénibles » et la ligne de probabilité n'ont pas été reprises. Le reste de ce document est le plan d'origine.

## 1. Point de départ (état réel de P1Planner)

Une carte (`users/{uid}/flashcards/{id}`) contient : `speId`, `itemId`, `recto`, `verso`, `interval` (jours), `nextReview`, `lastReview` (null = jamais révisée), `createdAt`, `updatedAt`, `source`, et depuis la pause `pauseShift`. Un seul algorithme : SM-2 simplifié à 3 boutons (Raté = 1 j ; Hésitant = ×1,5 plafonné à 21 j ; Su = ×2,5 plafonné à 60 j), dans `updateCardInterval`. Aucun réglage Flashcards hormis la pause (`settings/preferences.flashSettings`).

Rules : `flashcards/{id}` en lecture pour le propriétaire vérifié, `create` / `update` si `canWrite`, jamais de suppression ; `flashcards/{id}/reviews/{rid}` : création seule. Aucune validation de champs. Les sauvegardes (`functions/index.js`, liste des collections) copient les documents entiers : tout nouveau champ est donc sauvegardé et restauré sans changement.

Code concerné dans `public/tableur.html` : module flashcards (`isDue`, `updateCardInterval`, `previewLabel`, `statusInfo`, `saveFlashCard`, `startFlashSession`, `showFlashCard`, `evaluateCard`, `openFlashEdit`, tiroir `renderFlashDrawerList` / `launchMultiFlashSession`), carte « Flashcards » des Paramètres, `p1FlashShiftForPause`.

**Constat bloquant pour l'audit TypixClin** : `reference-typixclin/TableurEnLigne.html` est une copie du **30/08** : elle ne contient ni Anki, ni FSRS, ni drapeaux, ni pause, ni `lapses`. Je ne peux donc pas auditer le système récent. Je ne veux pas le deviner (surtout les paramètres FSRS). Il me faut une copie à jour du tableur TypixClin dans `reference-typixclin/` (lecture seule), ou le texte du prompt du 31/10 sur les flashcards personnalisables, qui ne m'a jamais été transmis.

## 2. Ce que le système doit faire (extrait de tes deux prompts)

- Trois modes : **Simple** (l'actuel), **Anki**, **FSRS**. Réglages : « Intervalle maximal » (6 mois / 1 an / 2 ans), « Ordre des cartes », lien « En savoir plus » (explication Anki / FSRS).
- Boutons de réponse : 3 en Simple (Raté / Hésitant / Su), 4 avec « Facile » dans l'autre mode (à confirmer).
- `lapses` compté sur chaque carte, sans aucun effet visible. Pas de « cartes pénibles », pas de ligne « Probabilité de t'en souvenir ».
- Drapeaux sur les cartes : Important, Difficile, À corriger ; menu « Drapeau » en session ; boutons drapeau de la fenêtre de carte avec survol coloré ; suspension d'une carte.
- « Session Flash » : bloc « Sélection par drapeau » (Indifférent par défaut, drapeaux cumulables avec compteurs, toutes les cartes des drapeaux même non dues, hors suspendues), tiroir élargi à 440 px, infobulles qui restent, retour à « Indifférent » à chaque ouverture.
- Session : « Modifier » qui se déplie sans passer sur « Drapeau » / « Suspendre ».
- Contraintes de données : un simple changement de mode n'écrit aucune carte ; après chaque étape de session : même nombre de cartes, recto / verso / matière / item / drapeau / date de création inchangés, `interval` ≥ 0, dates valides, aucune valeur NaN, facilité 1,3–5, stabilité > 0, difficulté 1–10, carte suspendue et carte future intactes.

## 3. Modèle de données proposé (rétrocompatible)

Toutes les cartes existantes restent valides sans migration : un champ absent = comportement Simple.

| Champ (sur la carte) | Valeur | Remarque |
|---|---|---|
| `flag` | absent / `'important'` / `'hard'` / `'fix'` | une seule valeur par carte (à confirmer) |
| `suspended` | absent / `true` | exclue de toute session et des compteurs |
| `lapses` | entier ≥ 0, absent = 0 | +1 à chaque « Raté » sur une carte déjà apprise |
| `ease` | 1,3 – 5 | mode Anki |
| `stability`, `difficulty`, `state` | > 0 ; 1 – 10 ; nouveau / apprentissage / revue | mode FSRS |
| `reps` | entier ≥ 0 | utile aux deux modes |

Réglages (`settings/preferences.flashSettings`) : `mode` (`'simple'` par défaut), `maxInterval` (jours), `order`, plus l'existant `pauseSince` / `pauses`. Les Rules de `settings/preferences` n'ont rien à changer.

Principe clé : **le changement de mode n'écrit rien.** Les champs propres au mode sont calculés à la volée depuis `interval` / `lastReview` / `nextReview` tant que la carte n'a pas été révisée dans ce mode, puis écrits à la première révision, sur cette carte seulement.

## 4. Étapes (chaque étape est testée et livrable seule)

**Étape 0 — Décisions et référence** (aucun code). Réponses à la section 8, copie à jour de la référence TypixClin.

**Étape 1 — Moteur de planification, sans interface.**
- Fonctions pures dans un bloc isolé : Simple (code actuel inchangé, identique à l'octet près sur les mêmes entrées), Anki, FSRS, bornes (`ease`, `stability`, `difficulty`, `interval`, intervalle maximal), calcul « à la volée » à partir d'une carte au format actuel.
- Tests unitaires Node sur les fonctions extraites : invariants sur des milliers de séquences de réponses, aucune valeur NaN / négative, bornes respectées, Simple identique à l'ancien comportement.
- Rien n'est branché : le site se comporte comme aujourd'hui.

**Étape 2 — Branchement du mode et des réglages.**
- Rubrique « Flashcards » : sélecteur de mode, « Intervalle maximal », « Ordre des cartes », « En savoir plus » (même dessin que les sélecteurs des Paramètres, fond blanc qui glisse en 0,28 s, repositionné par `ResizeObserver`, mise en page iPad / téléphone décrite dans ton prompt).
- Session : 3 ou 4 boutons selon le mode, libellés d'échéance calculés par le moteur.
- Test e2e « changement de mode » : cartes au format actuel (neuves, révisées, en retard, avec / sans drapeau, suspendue, future), sessions réelles Simple → Anki → FSRS → Simple → FSRS avec le temps simulé entre deux, contrôle serveur après chaque étape (liste des invariants de la section 2), et vérification qu'un changement de mode seul n'écrit aucune carte.

**Étape 3 — Drapeaux et suspension.**
- Écriture : champ `flag` / `suspended` par mise à jour ciblée (jamais de réécriture de la carte).
- Fenêtre de carte (boutons drapeau, survol coloré ≠ sélection), menu « Drapeau » de la session, « Suspendre », « Modifier » qui se déplie sans chevaucher (largeur mesurée au survol, outils décalés d'autant, même durée et même courbe).
- Liste des cartes : pastille de drapeau, état suspendu.

**Étape 4 — « Session Flash » par drapeau.**
- Bloc « Sélection par drapeau » (état local, aucune écriture), compteurs hors suspendues, bouton désactivé si aucune carte, cases et items cochés selon les cartes concernées, compteur du bas juste, retour à « Indifférent » par « Uniquement les dues » / « Tout (dés)sélectionner » / retrait des drapeaux / chaque ouverture.
- Mises à jour des boutons sur place (jamais de redessin pendant le clic, propagation du clic arrêtée) pour que les infobulles restent et que le tiroir ne se ferme pas.

**Étape 5 — Finition et régression.**
- Interaction avec la pause (déjà en place) : les cartes suspendues ne sont jamais décalées ni comptées ; `lapses` / `flag` / `suspended` ne bougent pas pendant un décalage.
- Sauvegarde / restauration : vérifier qu'une restauration d'avant la mise en ligne garde des cartes valides (champs absents = Simple).
- Régression complète, captures PC / iPad / téléphone en clair, sombre, pastel, QA et DECISIONS à jour.

## 5. Sécurité des données (P0)

- **Aucune migration en masse.** Pas de script qui réécrit toutes les cartes. Les nouveaux champs apparaissent carte par carte, à la première action sur cette carte.
- Écritures de carte : toujours `updateDoc` ciblé avec les seuls champs modifiés (jamais `setDoc` complet), pour ne jamais écraser une autre modification faite depuis un autre appareil.
- Bornes appliquées **avant** l'écriture (`ease` 1,3–5, `stability` > 0, `difficulty` 1–10, `interval` ≥ 0 entier, dates ISO valides) : une valeur invalide n'est jamais envoyée au serveur.
- Retour arrière : si une version posait un problème, l'ancien code lit toujours les cartes (il ignore les champs inconnus) ; le mode Simple reste fonctionnel.
- Avant la première mise en ligne : export des cartes d'un compte de test réel (émulateur) avant / après, comparaison champ par champ.
- Rules : à ce stade inchangées. Une validation de champs côté Rules (valeurs de `flag`, bornes) serait plus sûre ; elle nécessite un déploiement des Rules (jamais sans ton GO) et des tests Rules dédiés. Recommandé en dernière étape.
- Premium expiré : lecture seule conservée (les écritures sont refusées par les Rules, message d'erreur déjà prévu).

## 6. Risques et parades

| Risque | Parade |
|---|---|
| Paramètres FSRS devinés, résultats incohérents | ne pas inventer : référence TypixClin à jour ou algorithme open source documenté (version et licence notées dans DECISIONS) |
| Cartes futures ou suspendues modifiées par erreur | test d'invariants après chaque étape de session (section 2) |
| Changement de mode qui écrit | test dédié : compteur d'écritures Firestore = 0 |
| Régression de l'actuel (Simple) | Simple branché sur le code actuel, tests de comparaison sur les mêmes entrées |
| Tiroir qui se ferme ou perd ses infobulles | mises à jour sur place, `stopPropagation`, test e2e du clic maintenu |
| Charge (milliers de cartes) | calcul à la volée sans requête supplémentaire ; écritures ciblées ; mesure sur 5 000 cartes |

## 7. Tests prévus

- Unitaires (Node) : moteur de planification, bornes, conversion à la volée, séquences aléatoires reproductibles.
- E2E émulateur (vrais comptes, PC / iPad / téléphone) : réglages, session 3 / 4 boutons, drapeaux, suspension, sélection par drapeau (matières cochées, compteur, cartes exactes de la session), « Modifier » sans chevauchement, changement de mode sans perte, pause + reprise avec les nouveaux champs, sauvegarde / restauration.
- Contre-épreuve sur la copie « avant » pour chaque scénario, comme d'habitude.

## 8. Décisions dont j'ai besoin

1. **Référence** : peux-tu placer dans `reference-typixclin/` une copie à jour du tableur TypixClin (lecture seule) ? Sinon, j'ai besoin du texte du prompt du 31/10 sur les flashcards personnalisables.
2. **FSRS** : on porte l'algorithme de TypixClin tel quel (paramètres identiques), ou on utilise une implémentation open source documentée ?
3. **Anki** : mêmes intervalles et mêmes règles que TypixClin (facilité de départ, multiplicateurs, étapes d'apprentissage) ?
4. **Boutons** : 4 boutons (Raté / Hésitant / Su / Facile) dans les deux nouveaux modes, 3 en Simple ?
5. **Drapeaux** : un seul drapeau par carte ? Quelle couleur pour chacun (vert / orange / rouge dans l'ordre Important / Difficile / À corriger, ou autre) ?
6. **« Ordre des cartes »** : quelles options exactement (aléatoire, par échéance, autres) ?
7. **Simple** : reste-t-il le mode par défaut pour tous les comptes existants (recommandé) ?
8. **Rules** : accord de principe pour ajouter, à la fin et avec ton GO, une validation de champs dans les Rules des cartes ?

## 9. Ordre de livraison conseillé

Étape 1 puis 2 d'abord (sans drapeaux), publiables seules et sans risque pour les comptes qui restent en Simple. Étapes 3 et 4 ensuite. Étape 5 en dernier.
