# Premier prompt à envoyer à Claude

Tu travailles maintenant dans le repository local **P1Planner**.

Avant toute action, lis intégralement :
- `CLAUDE.md`
- `docs/P1PLANNER_SPEC.md`
- `docs/DECISIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/QA.md`
- `docs/TODO.md`

Je vais placer dans `reference-typixclin/` les fichiers TypixClin les plus importants.

Ces fichiers sont **READ ONLY** :
- ne les modifie jamais ;
- ne les déplace jamais ;
- ne les transforme jamais en dépendance runtime ;
- ils servent uniquement de référence technique et fonctionnelle.

P1Planner est totalement indépendant de TypixClin. Toute pollution Firebase, Firestore, Stripe ou données entre les deux projets est un problème P0.

## Utilisation des plugins
Pour cette première mission, utilise surtout :
- **Product Management — Anthropic**
- **Engineering — Anthropic**

Tu peux consulter Design/UI UX Pro Max pour préparer la future direction artistique, mais ne commence pas encore à construire l'index.
Browser Use viendra lors de la QA réelle.

# NE CODE PAS ENCORE LE SITE

Première mission uniquement :

## AUDITER → CONCEVOIR → PLANIFIER

1. Lis toutes les références TypixClin disponibles.
2. Classe chaque grande brique :
   - A conserver presque telle quelle
   - B généraliser
   - C supprimer
   - D créer
3. Audite particulièrement :
   - sauvegardes / Firestore / pending saves / cache / backups ;
   - notes ;
   - flashcards ;
   - cahier d'erreurs ;
   - erreurs entraînements ;
   - entraînement ;
   - stats ;
   - trophées ;
   - planning ;
   - auth ;
   - Premium ;
   - Stripe ;
   - webhooks ;
   - locks ;
   - Rules.
4. Propose l'architecture frontend/Firebase/Firestore/Stripe/Admin.
5. Propose un schéma Firestore clair, sécurisé et organisé, sans recopier aveuglément les choix historiques TypixClin.
6. Spécifie la méthode des tours.
7. Spécifie la méthode des J : presets, personnalisé, dates, retards, reports, historique, stats.
8. Compare les architectures Tours ↔ J et recommande la plus cohérente.
9. Spécifie le Programme de la journée.
10. Spécifie le planning en séparant type de journée et état.
11. Analyse Premium :
    - 30 jours gratuits ;
    - date concours/examens S2 ;
    - durée choisie ;
    - 2,50 / 2,25 / 2,00 ;
    - backend source de vérité ;
    - paiement unique N mois vs abonnement récurrent.
12. Classe les risques P0/P1/P2.

## Documents
Tu peux mettre à jour uniquement :
- `docs/ARCHITECTURE.md`
- `docs/TODO.md`

Ne touche pas encore aux pages frontend de production.

## Format de réponse
1. Compréhension P1Planner
2. Inventaire des références lues
3. Tableau A/B/C/D
4. Architecture frontend
5. Architecture Firebase
6. Schéma Firestore
7. Architecture Stripe
8. Méthode des tours
9. Méthode des J
10. Relation Tours/J
11. Programme de la journée
12. Planning
13. Admin
14. Sécurité P0/P1/P2
15. Plan d'implémentation
16. Décisions encore ouvertes

Termine par UN SEUL verdict :
`ARCHITECTURE P1PLANNER PRÊTE À ÊTRE IMPLÉMENTÉE`
ou
`ARCHITECTURE À CORRIGER AVANT IMPLÉMENTATION`

Ne commence pas encore `index.html`.
