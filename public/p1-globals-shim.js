/* P1Planner — pas de programme officiel figé (voir docs/MISSION_TABLEUR_EDN_TO_P1.md).
   Ce fichier remplace le vrai data.js de TypixClin (367 items EDN) : il ne
   déclare que des structures VIDES, seulement pour que le moteur de rendu
   EDN et le module de contenu sur-mesure (tpx-perso-script, forcé en mode
   "custom" pour P1) trouvent ces globales déjà définies au chargement.
   Le vrai contenu (Matières/Cours) vient exclusivement de Firestore, par
   utilisateur — jamais d'un catalogue partagé figé dans un fichier.

   Renommé depuis data.js (bug réel trouvé en vérifiant la prod avant
   publicité, jamais remarqué avant) : ce nom générique est bloqué par de
   nombreux bloqueurs de publicité/traceurs (règles de filtrage visant tout
   script nommé "data.js", très répandu chez les scripts de tracking) —
   confirmé via un vrai chargement de p1planner.fr : la requête ressortait
   en `net::ERR_BLOCKED_BY_CLIENT`, empêchant SPECIALTIES_DATA/SPECIALTY_SHORT
   d'exister et cassant silencieusement une bonne partie du tableur (erreurs
   "is not defined" en cascade) pour quiconque utilise un bloqueur — une
   part significative des visiteurs réels. */
window.SPECIALTIES_DATA = [];
window.ITEM_REFERENCE = {};
window.SPECIALTY_CONFIG = {};
window.SPECIALTY_SHORT = {};
window.DEFAULT_TRAININGS = [];
window.TOTAL_ITEMS = 0;   // recalculé dynamiquement par tpx-perso-script (applyToGlobals)
window.ITEM_BADGES = {};  // pas de badges spéciaux pour des cours créés librement
window.MAX_TOURS = 8;     // nombre de slots de tour par cours (mécanique EDN conservée)
window.ITEM_URLS = {};    // pas de "Ressources" pour P1 (décision produit, colonne retirée)
window.OIC_DATA = {};     // objectifs LISA officiels : programme EDN figé, aucun équivalent pour des cours créés librement
