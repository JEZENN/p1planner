# Proposition — Méthode des J (P1Planner)

Statut : **implémentée en v1 dans `public/tableur.html`** (GO explicite reçu :
« Je choisis le modèle 1 et je suis d'accord concernant tes suggestions...
pour la 1 la 2 la 3 et la 4 tu peux te lancer »). Modèle A confirmé, et les
recommandations §7.1 (une seule série active à la fois), §7.2 (opt-in
explicite, jamais rétroactif), §7.3 (expiration à 60 j = archivée, jamais
supprimée) retenues telles quelles. §7.4 (preset par cours vs global)
tranché en faveur du réglage **global uniquement** pour cette v1 (pas de
surcharge par cours — simplification volontaire, extensible plus tard sans
migration puisque `jCheckpoints` est déjà un champ par cours).

Ce qui suit reste la trace de la conception d'origine ; voir `docs/TODO.md`
pour le détail de l'implémentation réelle (fichiers touchés, tests effectués,
bug de fuseau horaire trouvé et corrigé en testant).

## 1. Ce que « Méthode des J » doit résoudre

Le tableur suit déjà, par cours : `tours[]` (confiance par passage),
`tourDates[]`, `tourDurations[]`, `tourSupports[]`. C'est un historique de
passages **choisis librement par l'utilisateur** (pas de calendrier imposé).

La Méthode des J ajoute une couche différente : après avoir travaillé un
cours, suggérer activement **quand y revenir** (consolidation à court terme),
plutôt que de laisser l'utilisateur redécouvrir tout seul qu'un cours prend
la poussière. C'est un moteur de suggestion, pas un journal.

## 2. Deux modèles possibles pour la relation Tours ↔ J

### Modèle A — Les J sont des micro-rappels indépendants des tours (recommandé)

Chaque tour loggé par l'utilisateur (peu importe lequel) déclenche une
**série de rappels courts** ancrée sur sa date : J+1, J+3, J+7, J+14, J+30
(preset « équilibré », voir §4). Cocher un rappel J ne compte pas comme un
tour, ne touche pas `tours[]`/`tourDates[]`, et ne demande pas de noter une
confiance — juste un geste léger « fait / reporté ».

- Avantages : additif pur, zéro risque sur les données de tours existantes,
  compatible avec n'importe quelle façon de travailler (l'utilisateur garde
  le contrôle du rythme réel de ses tours).
- Inconvénient : deux notions temporelles à comprendre (tours choisis par
  l'utilisateur + rappels J suggérés par le système).

### Modèle B — Les J planifient directement le prochain tour

Chaque date J devient littéralement la date suggérée du tour suivant :
tour 1 = J0, tour 2 suggéré à J+1, tour 3 à J+3, etc. Cocher un rappel J
équivaut à faire un tour (ouvre le picker de confiance existant).

- Avantages : une seule notion temporelle, planning plus lisible.
- Inconvénients : impose un rythme unique à tous les cours et rentre en
  collision avec l'usage actuel où les tours sont déjà comptés librement
  (retrofit lourd sur les comptes existants, qui ont des `tourDates[]`
  disparates ne suivant aucune suite J) ; un cours « en retard » sur ses J
  bloquerait artificiellement la progression en tours.

**Recommandation : Modèle A.** Il ne touche à aucune donnée existante, reste
cohérent avec le principe déjà écrit dans la spec (« Ne jamais présenter un
nombre de tours comme universel »), et peut être coupé/activé par cours sans
perturber l'historique.

## 3. Modèle de données (additif, non destructif)

Nouveau champ par cours, à côté de `tours`/`tourDates` existants :

```js
jCheckpoints: {
  presetId: 'equilibre',        // 'rapproche' | 'equilibre' | 'espace' | 'custom'
  anchorDate: '2026-09-02',     // date du tour qui a déclenché la série
  anchorTourIndex: 0,           // index dans tours[] / tourDates[]
  steps: [                      // généré une fois à partir du preset + anchorDate
    { offset: 1,  dueDate: '2026-09-03', status: 'pending' },  // 'pending' | 'done' | 'skipped'
    { offset: 3,  dueDate: '2026-09-05', status: 'pending' },
    { offset: 7,  dueDate: '2026-09-09', status: 'pending' },
    { offset: 14, dueDate: '2026-09-16', status: 'pending' },
    { offset: 30, dueDate: '2026-10-02', status: 'pending' }
  ]
}
```

Points de sécurité (P0 — aucune perte de données) :
- Champ entièrement **nouveau et optionnel** : absence du champ = comportement
  actuel inchangé, aucune migration destructive nécessaire.
- Ne remplace ni ne recalcule jamais `tours[]`/`tourDates[]`.
- Un cours sans `jCheckpoints` reste valide indéfiniment (l'utilisateur peut
  désactiver la fonctionnalité par cours ou globalement).
- Régénérer la série à partir d'un nouveau tour ne doit **jamais écraser**
  silencieusement une série en cours : si des étapes `pending` existent
  encore, proposer explicitement « remplacer la série » vs « garder les deux »
  plutôt que d'écraser.

## 4. Presets (repris de la spec, à valider)

| Preset | Suite | Usage typique |
|---|---|---|
| Rapproché | J0 J1 J3 J5 J8 J14 J30 | cours denses / faible confiance |
| Équilibré (défaut) | J0 J1 J3 J7 J14 J30 | usage général |
| Espacé | J0 J3 J9 J25 J50 | cours déjà solides, gain de temps |
| Personnalisé | liste libre en jours | utilisateurs avancés |

Réglage possible à deux niveaux : un preset par défaut global (Paramètres,
même emplacement que le barème de confiance), avec possibilité de surcharger
par cours — cohérent avec « prévoir une stratégie par défaut et
éventuellement une exception par cours » dans la spec.

Point ouvert : faut-il moduler automatiquement le preset selon la confiance
du dernier tour (ex. confiance basse → bascule auto sur « rapproché ») ? Je
recommande de **ne pas** automatiser ça au lancement (surprend l'utilisateur,
complique le débogage) et de le proposer seulement comme suggestion
manuelle affichée, pas un changement silencieux.

## 5. Intégration Planning

- Chaque étape `pending` avec `dueDate` dans le mois affiché ajoute une
  puce sur la case du jour correspondant (visuellement distincte des
  entrées manuelles du planning — nouvelle pastille dédiée, pas de
  réutilisation des couleurs de matière pour ne pas les confondre avec des
  créneaux de travail choisis par l'utilisateur).
- Clic sur la puce → même comportement que la Méthode des tours : ouvre le
  cours concerné, propose Faire maintenant / Reporter.
- Report : décale `dueDate` de l'étape (ex. +1 jour, ou choix libre), ne
  supprime jamais l'étape ni ne perd la série.

## 6. Intégration Programme de la journée (todo)

- Nouvelle section (ou sous-liste) « Révisions J du jour », listant toutes
  les étapes `pending` dont `dueDate` = aujourd'hui **ou** en retard
  (`dueDate` < aujourd'hui, statut toujours `pending`).
- Chaque ligne : nom du cours, matière, échéance (« J+7 », en retard depuis
  X jours si applicable), deux actions : **Faire maintenant** (marque
  `status: 'done'`, ne touche pas aux tours) / **Reporter** (repousse
  `dueDate`, garde `status: 'pending'`).
- Une révision J en retard ne bloque rien d'autre dans l'appli : c'est une
  suggestion, jamais un blocage (cohérent avec le principe général du
  tableur — l'utilisateur garde toujours la main).

## 7. Questions ouvertes avant codage définitif

1. **Déclencheur de série** : une série J démarre-t-elle après *chaque* tour
   loggé, ou seulement après le premier tour d'un cours ? (Je recommande :
   uniquement si aucune série `pending` n'existe déjà pour ce cours — évite
   d'empiler des séries concurrentes après chaque tour.)
2. **Portée par défaut à l'activation** : active-t-on la Méthode des J
   automatiquement pour tous les cours existants (rétroactif) ou seulement
   pour les nouveaux tours à partir de la mise en prod ? (Je recommande :
   opt-in explicite, jamais rétroactif automatique — évite un raz de marée
   de rappels sur un compte avec des dizaines de cours déjà en cours.)
3. **Étapes manquées non traitées** (ni faites ni reportées, dueDate très
   ancienne) : les garder indéfiniment en retard, ou les auto-expirer après
   un délai (ex. 60 jours) pour ne pas polluer la todo ? Une auto-expiration
   doit rester une **archive**, jamais une suppression silencieuse.
4. **Preset par cours vs global** : simple réglage global suffisant pour la
   v1, ou personnalisation par cours dès le départ ?
5. Confirmation finale du **Modèle A** (§2) avant tout développement.

## 8. Prochaine étape

Une fois ces points tranchés : lire ce document + specs à jour, auditer les
zones concrètes du tableur à modifier (planning, todo, fiche cours, réglages),
proposer un plan de code détaillé avec périmètre exact des fichiers touchés,
puis développer derrière un GO explicite — conformément au workflow standard
de `CLAUDE.md`.
