# P1Planner — Cahier des charges maître

## Produit
P1Planner est une application web de planification des révisions destinée d'abord aux PASS/LAS/P1, mais utilisable aussi en médecine, droit, pharmacie, prépa, concours et autres études.

Les quatre piliers :
1. Cours
2. Tours
3. Méthode des J
4. Programme de la journée

Autour :
Planning, statistiques, trophées, notes, flashcards, cahiers d'erreurs, entraînements et Premium.

## TypixClin
P1Planner est indépendant. TypixClin sert seulement de référence technique/fonctionnelle.
Pour chaque brique : A conserver, B généraliser, C supprimer, D créer.

Conserver prioritairement les mécanismes éprouvés de sauvegarde, protection des données, notes, flashcards, erreurs, entraînements, stats, trophées, planning et billing.
Supprimer les spécificités EDN/ECOS, programme officiel, spécialités/items imposés et plans Premium TypixClin.

## Isolation P0
P1Planner possède son propre repo, Firebase, Firestore, Auth, Hosting, Functions, Rules, Secrets, Stripe, webhook et domaine.
Aucune donnée ou config ne doit croiser TypixClin.

## Stack
HTML + CSS + JavaScript + Firebase/Firestore + Cloud Functions Node.js + Stripe.
Pas de framework lourd sans justification majeure.

## Plugins Claude
- Product Management : Tours/J, Programme de la journée, planning, statuts, pricing.
- Engineering : architecture, Firebase, Firestore, sécurité, sauvegardes, Stripe.
- Design + UI UX Pro Max : index/auth/Premium/admin, micro-interactions, responsive.
- Modern Web Guidance : standards, performances, accessibilité, mobile.
- Browser Use : QA réelle.
- StackHawk : staging/préproduction uniquement.

## Vocabulaire
Spécialité → Matière.
Item → Cours.
Todo → Programme de la journée.

## Pages et ordre
1. index.html
2. auth.html
3. comptepremium.html
4. admin.html
5. mentions-legales.html
6. tableur.html

Première livraison de chaque page : HTML + CSS + JS dans un seul fichier.

## UI
Index/Auth/Premium/Admin/Légal : nouvelle identité P1Planner, exceptionnelle, moderne, dynamique, haut de gamme, responsive, inspirée des meilleurs SaaS.
Pas de template générique répétitif.
Tableur : design sensiblement proche du tableur EDN TypixClin.

## Index public
Accessible sans compte. Doit être landing page + démo produit + contenu pédagogique + SEO + storytelling.

Doit présenter :
- Hero fort ;
- aperçu réaliste du tableur ;
- méthode des tours ;
- méthode des J ;
- Programme de la journée ;
- planning ;
- stats ;
- trophées ;
- flashcards ;
- notes / cahiers d'erreurs ;
- entraînement ;
- créateur ;
- TypixClin ;
- Premium ;
- CTA final.

La démonstration publique doit ressembler au vrai produit et peut animer :
cours travaillé → tour validé → échéance J → planning → Programme du jour → stats → trophée.

## Méthode des tours
Plusieurs passages successifs sur le programme. Ne jamais présenter un nombre de tours comme universel.
Le tableur suit chaque tour par cours et les stats associées.

## Méthode des J
Fonctionnalité majeure avec plusieurs presets à spécifier avant codage définitif :
- rapproché, ex. J0 J1 J3 J5 J8 J14 J30 ;
- équilibré, ex. J0 J1 J3 J7 J14 J30 ;
- espacé, ex. J0 J3 J9 J25 J50 ;
- personnalisé.

Ces suites sont des exemples, pas des vérités scientifiques.
Prévoir une stratégie par défaut et éventuellement une exception par cours.
Product Management doit définir la relation exacte Tours ↔ J.

## Programme de la journée
Centre opérationnel :
- cours ;
- tours ;
- révisions J ;
- entraînements ;
- retards ;
- reports.

UX cible : ouvrir → voir → travailler → valider → mise à jour automatique.
Une révision J en retard doit être gérable avec Faire maintenant / Reporter.

## Tableur
Base : tableur EDN / logique custom généralisée.
Supprimer mode officiel/custom.

Matières et cours entièrement créés par l'utilisateur.
Mode détaillé + mode compact.
Éviter de multiplier les colonnes : badges, menus, popovers, affichage conditionnel.

## Notes / Flashcards / Erreurs / Entraînement
Conserver les systèmes TypixClin et les généraliser :
- notes par cours ;
- flashcards matière → cours ;
- cahier d'erreurs cours ;
- cahier d'erreurs entraînements séparé si utile ;
- entraînement basé sur les matières/cours utilisateur.

## Statistiques et trophées
Conserver largement les stats TypixClin, avec spécialité→matière et item→cours.
Ajouter des métriques J utiles : prévues, réalisées, restantes, en retard, taux de réalisation.
Les trophées sont conservés et généralisés, élégants et discrets.

## Planning
Réutiliser largement le planning TypixClin mais adapter le modèle.
Séparer :
- TYPE : Cours, Révisions, Cours+Révisions, Entraînement, Repos, Vacances, Examen/Concours (à valider) ;
- ÉTAT : À venir, En cours, Terminée, Partiellement réalisée, Reportée, En retard.
Autant que possible, calculer l'état à partir du Programme de la journée.

## Protection des données
P0 : perte de données, accès croisé, overwrite accidentel.
Conserver local/Firestore, cache, pending saves, retries, backups, restauration, protection réseau/fermeture.
Après perte du Premium : aucune suppression de données.

## Firestore
Engineering doit auditer TypixClin avant de figer le schéma.
Objectifs : isolation par uid, Rules strictes, coût raisonnable, requêtes simples, maintenance claire, backups.
Les champs billing/Stripe ne doivent pas être modifiables par le frontend.

## Auth
UI premium cohérente avec l'index.
Inscription, connexion, logout, reset password, vérification email, loading, erreurs propres, anti-double submit.

## Premium
15 jours gratuits sans carte bancaire.

Après l'essai :
1. l'utilisateur indique approximativement la date de concours/examens S2 ;
2. P1Planner calcule la durée maximale utile avec une petite marge post-concours ;
3. l'utilisateur choisit entre 1 mois et ce maximum ;
4. prix dégressif :
   - court (1 mois) : 3,00 €/mois
   - intermédiaire (2-4 mois) : 2,50 €/mois
   - long (5+ mois) : 2,25 €/mois

Seuils exacts NON ENCORE VALIDÉS.
Base de travail possible uniquement : 1–3 / 4–7 / 8+ mois.

Afficher dynamiquement durée, prix mensuel équivalent, total, économie et date de fin.
Frontend jamais source de vérité du prix.
Backend valide la durée, recalcule tarif/total/date puis crée Stripe Checkout.
Engineering doit comparer paiement unique N mois vs abonnement récurrent avant implémentation finale.

## Stripe
Configuration entièrement séparée.
Réutiliser les protections TypixClin : webhook signé, idempotence, lock anti-double Checkout, expiration, aucun Premium basé sur success URL, backend source de vérité.

## Admin
admin.html avec vraie sécurité Firebase/Auth + rôle/custom claim côté serveur + Rules/Functions protégées.
Ne jamais sécuriser uniquement par email frontend.
Afficher surtout comptes, Premium, billing, métriques agrégées, anomalies et webhooks.
Minimisation des données privées.

## Mentions légales
Page cohérente avec le design, plus sobre.
Ne rien inventer : utiliser [À COMPLÉTER] pour éditeur, responsable, hébergeur, contact, etc.
Prévoir plus tard confidentialité et CGV.

## Créateur
Index : section personnelle élégante, non prétentieuse.
Peut mentionner après validation de formulation :
- UVSQ ;
- réussite / excellent classement P1 ;
- parcours médecine ;
- 275e sur ~10 500 aux épreuves nationales ;
- néo-interne d'anesthésie-réanimation à Paris ;
- intérêt pédagogie / organisation.

Ne jamais publier les relevés bruts ni les données personnelles d'autres étudiants.
Le classement exact P1 doit être formulé uniquement à partir d'une information explicitement vérifiée.

## TypixClin sur l'index
Expliquer que TypixClin accompagne les étudiants de P2 à D4 et dispose d'un tableur déjà utilisé par des étudiants.
Présenter P1Planner comme issu de l'expérience acquise, sans en faire une sous-marque.
Ne jamais inventer de métriques d'utilisation.

## SEO
Travailler naturellement : méthode des J, méthode des J PASS, tours de révision, planning révision étudiant/PASS, répétition espacée, organisation PASS, planning concours.
Pas de keyword stuffing.
Prévoir plus tard des pages SEO dédiées.

## Responsive / accessibilité / animations
Excellent desktop/laptop/tablette/iPhone/Android.
HTML sémantique, clavier, focus, contrastes, labels, touch targets, reduced motion.
Animations utiles et performantes avec transform/opacity/IntersectionObserver.

## Ordre de réalisation
Audit → Architecture → Index → Auth → Premium → Admin → Légal → Tableur → Backend final → QA → Production après GO.

## Première réponse attendue de Claude
Après lecture des références TypixClin :
1. compréhension ;
2. inventaire ;
3. A/B/C/D ;
4. architecture frontend ;
5. Firebase ;
6. Firestore ;
7. Stripe ;
8. Tours ;
9. J ;
10. relation Tours/J ;
11. Programme du jour ;
12. Planning ;
13. Admin ;
14. sécurité P0/P1/P2 ;
15. plan d'implémentation ;
16. décisions ouvertes.

Ne pas commencer la migration massive avant validation.
