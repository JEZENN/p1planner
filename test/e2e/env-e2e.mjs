/* Doit être importé EN PREMIER par les scripts E2E qui chargent functions/index.js :
   les fonctions et les pages doivent parler au MÊME projet d'émulateur. */
process.env.GCLOUD_PROJECT = "p1planner-e2e";
// ⚠️ Ports décalés (2026-09-30) : les ports historiques 8080/9099 sont occupés en parallèle par
// les émulateurs TypixClin de Jean (autre projet, autre dépôt) — voir firebase.emu-alt.json à la
// racine du dépôt, démarré avec `firebase emulators:start --config firebase.emu-alt.json`.
// Ne JAMAIS revenir à 8080/9099 par défaut tant que ce risque de collision existe.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8280";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9198";
