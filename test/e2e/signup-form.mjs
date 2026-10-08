/* Formulaire d'inscription (auth.html) -- retour de Jean (08/10) :
   1. les champs obligatoires doivent l'indiquer (astérisque rouge) ;
   2. les messages d'erreur doivent disparaître dès que le champ est corrigé (avant : ils restaient
      affichés après la soumission, même sous un champ devenu valide).
   Vraie page servie par e2e-server.mjs. Aucune inscription réelle : la validation se fait avant tout
   appel réseau. */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { launch, scenario, report, assert, sleep, BASE } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const browser = await launch();

async function freshPage() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(String(e.message || e)));
  await page.setViewport({ width: 480, height: 1100 });
  await page.goto(`${BASE}/auth.html#inscription`, { waitUntil: "load" });
  await page.waitForSelector("#signupFirstName", { visible: true });
  return page;
}
const errVisible = (page, id) => page.evaluate((i) => document.getElementById(i).classList.contains("is-visible"), id);
const invalid = (page, id) => page.evaluate((i) => document.getElementById(i).getAttribute("aria-invalid"), id);
const submit = async (page) => { await page.evaluate(() => document.getElementById("btnSignup").click()); await sleep(150); };
const setVal = (page, id, v) => page.evaluate((i, val) => { const el = document.getElementById(i); el.focus(); el.value = ""; }, id, v).then(() => page.type("#" + id, v));

try {
  await S("F1", "astérisque rouge sur chaque champ obligatoire (prénom, nom, email, mot de passe, confirmation, conditions) ; pas sur le code de parrainage facultatif", async () => {
    const page = await freshPage();
    const info = await page.evaluate(() => {
      const star = (labelFor) => { const l = document.querySelector(`label[for="${labelFor}"]`); const s = l && l.querySelector(".req-star"); return s ? { text: s.textContent, color: getComputedStyle(s).color, hidden: s.getAttribute("aria-hidden") } : null; };
      return {
        first: star("signupFirstName"), last: star("signupLastName"), email: star("signupEmail"), pwd: star("signupPassword"),
        confirm: star("signupPasswordConfirm"), consent: star("signupConsent"), referral: star("signupReferralCode"),
        legend: (document.querySelector("#panelSignup .required-legend") || {}).textContent || null,
      };
    });
    for (const k of ["first", "last", "email", "pwd", "confirm", "consent"]) {
      assert(info[k] && info[k].text === "*", "astérisque absent sur le champ obligatoire « " + k + " »");
      assert(info[k].color === "rgb(255, 107, 107)", "astérisque « " + k + " » pas rouge : " + info[k].color);
      assert(info[k].hidden === "true", "astérisque « " + k + " » lu par les lecteurs d'écran (aria-hidden attendu, l'attribut required suffit)");
    }
    assert(info.referral === null, "le code de parrainage (facultatif) ne doit PAS porter d'astérisque");
    assert(info.legend && /obligatoires/i.test(info.legend), "légende « Champs obligatoires » absente : " + info.legend);
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("F2", "après une soumission en échec, chaque message d'erreur disparaît dès que son champ devient valide (et revient si on le re-casse)", async () => {
    const page = await freshPage();
    await setVal(page, "signupFirstName", "e");
    await setVal(page, "signupLastName", "efefe");
    await setVal(page, "signupEmail", "fefefef");
    await setVal(page, "signupPassword", "abcdef");
    await setVal(page, "signupPasswordConfirm", "abcdef");
    await submit(page);
    for (const id of ["signupFirstNameError", "signupEmailError", "signupPasswordError"]) assert(await errVisible(page, id), "erreur « " + id + " » absente après soumission invalide");
    assert(await invalid(page, "signupFirstName") === "true", "prénom pas marqué invalide");

    // Encore invalide ("e" + "m" = 2 caractères => valide ; on teste d'abord un cas encore invalide).
    assert(await errVisible(page, "signupFirstNameError"), "l'erreur du prénom a disparu sans correction");

    // Corrections une à une : l'erreur disparaît À LA FRAPPE, sans nouvelle soumission.
    await page.type("#signupFirstName", "m");
    assert(!(await errVisible(page, "signupFirstNameError")) && (await invalid(page, "signupFirstName")) === "false", "erreur du prénom toujours affichée une fois valide");
    await setVal(page, "signupEmail", "jean@exemple.fr");
    assert(!(await errVisible(page, "signupEmailError")) && (await invalid(page, "signupEmail")) === "false", "erreur de l'email toujours affichée une fois valide");
    await page.type("#signupPassword", "gh");
    assert(!(await errVisible(page, "signupPasswordError")) && (await invalid(page, "signupPassword")) === "false", "erreur du mot de passe toujours affichée une fois à 8 caractères");
    await page.type("#signupPasswordConfirm", "gh");
    assert(!(await errVisible(page, "signupPasswordConfirmError")), "erreur de confirmation toujours affichée une fois les mots de passe identiques");
    assert(await errVisible(page, "signupFirstNameError") === false && (await errVisible(page, "signupLastNameError")) === false, "erreur résiduelle sur prénom/nom");

    // Re-casser le champ : l'erreur doit REVENIR (la revérification reste active tant qu'on n'a pas re-soumis proprement).
    await setVal(page, "signupEmail", "x");
    await submit(page);
    assert(await errVisible(page, "signupEmailError"), "l'erreur de l'email n'est pas revenue après resoumission d'une valeur invalide");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("F3", "aucune erreur prématurée pendant la première saisie ; le message « accepte les Conditions » part quand on coche la case", async () => {
    const page = await freshPage();
    await page.type("#signupFirstName", "e");
    await page.type("#signupEmail", "x");
    assert(!(await errVisible(page, "signupFirstNameError")) && !(await errVisible(page, "signupEmailError")), "erreur affichée avant toute soumission (saisie en cours)");
    await submit(page);
    const alertShown = await page.evaluate(() => document.getElementById("globalAlert").textContent);
    assert(/Conditions d'utilisation/.test(alertShown), "message de consentement absent après soumission sans case cochée : " + alertShown);
    await page.evaluate(() => document.getElementById("signupConsent").click());
    await sleep(100);
    const after = await page.evaluate(() => ({ text: document.getElementById("globalAlert").textContent.trim(), cls: document.getElementById("globalAlert").className }));
    assert(after.text === "" && !/is-visible/.test(after.cls), "le message de consentement reste affiché une fois la case cochée : " + JSON.stringify(after));
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });
} finally {
  await browser.close(); server.close();
}
process.exit(report());
