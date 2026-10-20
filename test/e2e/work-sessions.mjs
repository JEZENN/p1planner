/* Défauts d'origine (lot F), libellés (E), barre Flashcards (A), switchs des Paramètres (T). Les sessions de travail, entraînements, graphique : voir work-ui.mjs.
   Vraie page + vrais émulateurs. Les scénarios sont ajoutés lot par lot (F, E, A, S/B, C, D, G).
   Lancer : node test/e2e/work-sessions.mjs [préfixes de scénarios]
   (PUBLIC_DIR / PAGE_FILE permettent de rejouer sur une copie « avant » pour la contre-épreuve.) */
import "./env-e2e.mjs";
import { startServer } from "./e2e-server.mjs";
import { startProxy } from "./flaky-proxy.mjs";
import { launch, mkUser, openPage, adb, course, validateTour, scenario, report, assert, sleep } from "./lib.mjs";

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.some((p) => id.startsWith(p));
const S = (id, title, fn, opts) => (want(id) ? scenario(`${id} ${title}`, fn, opts) : null);

const server = await startServer();
const proxy = await startProxy();
const browser = await launch();

const localKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

try {
  // ═══════════════════ F. Défauts d'origine ═══════════════════
  // F1 : « aujourd'hui » devait être la date LOCALE. En UTC (toISOString), entre minuit et 1-2 h heure
  // de Paris, le modal de tour proposait la VEILLE et interdisait la date du jour (max en UTC), le tour
  // était compté hier et le graphique 7 jours décalé. Les deux fuseaux extrêmes garantissent qu'à
  // N'IMPORTE QUELLE heure UTC, au moins un des deux a une date locale différente de la date UTC.
  for (const [tag, tz] of [["UTC+14", "Pacific/Kiritimati"], ["UTC-11", "Pacific/Pago_Pago"]]) {
    await S("F1-" + tag, `fuseau ${tz} : date du tour = date LOCALE (valeur et max), tour compté « aujourd'hui »`, async () => {
      const u = await mkUser({ courses: 1 });
      const { page } = await openPage(browser, u);
      await page.emulateTimezone(tz);
      await sleep(300);
      const ctx = await page.evaluate(() => {
        const d = new Date();
        const local = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        return { local, utc: d.toISOString().split("T")[0] };
      });
      // Pré-requis du test : dans ce fuseau, date locale et date UTC diffèrent (sinon rien n'est prouvé).
      const now = new Date();
      const utcNow = now.toISOString().split("T")[0];
      const diffs = tz === "Pacific/Kiritimati" ? now.getUTCHours() >= 10 : now.getUTCHours() < 11;
      assert(diffs ? ctx.local !== utcNow : true, "pré-requis : date locale == date UTC dans " + tz);
      await page.evaluate(() => document.querySelector('.tour-badge[data-fc="c1"][data-tour="0"]').click());
      await sleep(250);
      const dateField = await page.evaluate(() => ({ value: document.getElementById("tour-date").value, max: document.getElementById("tour-date").getAttribute("max") }));
      assert(dateField.max === ctx.local, `max du champ date = ${dateField.max} (UTC) au lieu de la date locale ${ctx.local}`);
      assert(dateField.value === ctx.local, `date proposée = ${dateField.value} au lieu de la date locale ${ctx.local}`);
      await page.evaluate(() => { document.querySelector('.confidence-btn[data-confidence="3"]').click(); document.getElementById("btn-save-tour").click(); });
      await sleep(1500);
      const c = await course(u.uid, "c1");
      const stored = ((c.tourDates || [])[0] || "").split("T")[0];
      assert(stored === ctx.local, `tour enregistré le ${stored} au lieu de la date locale ${ctx.local}`);
      const today = await page.evaluate(() => document.getElementById("stat-items-today").textContent.trim());
      assert(today === "1", "« Tours effectués aujourd'hui » vaut « " + today + " » au lieu de 1");
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

  await S("F2", "total « Temps » de la semaine calculé sur les minutes exactes (3 x 55 min = 2h45, pas 2h42)", async () => {
    const u = await mkUser({ courses: 1 });
    const t0 = new Date();
    await adb.doc(`users/${u.uid}/courses/c1`).set({
      tourConfidences: [3, 3, 3], tourDates: [localKey(addDays(t0, -2)), localKey(addDays(t0, -1)), localKey(t0)],
      tourDurations: ["0:55", "0:55", "0:55"], tourSupports: [null, null, null],
    }, { merge: true });
    const { page } = await openPage(browser, u);
    await page.evaluate(() => document.querySelector('[data-page="stats"]').click());
    await page.waitForFunction(() => document.getElementById("weekly-time-total").textContent.trim() !== "0h00", { timeout: 15000 }).catch(() => {});
    const total = await page.evaluate(() => document.getElementById("weekly-time-total").textContent.trim());
    assert(total === "2h45", "total hebdomadaire affiché « " + total + " » au lieu de 2h45 (somme d'heures arrondies au 1/10 par jour)");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  // ═══════════════════ E. Libellés ═══════════════════
  await S("E1", "« Ressenti moyen » précisé « sur les tours » (carte du jour, graphique de la semaine, aides associées)", async () => {
    const u = await mkUser({ courses: 1 });
    const { page } = await openPage(browser, u);
    const t = await page.evaluate(async () => {
      const out = { daily: document.querySelector(".feeling-today .daily-stat-label").textContent.trim(), weekly: document.querySelector(".feeling-weekly .weekly-chart-title, #card-feeling-weekly .weekly-chart-title") ? (document.querySelector(".feeling-weekly .weekly-chart-title, #card-feeling-weekly .weekly-chart-title")).textContent.trim() : null };
      const help = {};
      for (const k of ["stats-daily", "stats-weekly"]) { window.openHelpModal(k); await new Promise((r) => setTimeout(r, 200)); help[k] = (document.querySelector(".help-modal-overlay.active, .help-modal.active, #help-modal") || document.body).textContent; if (window.closeHelpModal) window.closeHelpModal(); await new Promise((r) => setTimeout(r, 300)); }
      out.help = help; return out;
    });
    assert(t.daily === "Ressenti moyen du jour sur les tours", "carte du jour : « " + t.daily + " »");
    assert(t.weekly === "Ressenti moyen sur les tours", "graphique hebdo : « " + t.weekly + " »");
    assert(/Ressenti moyen du jour sur les tours/.test(t.help["stats-daily"]), "aide « Statistiques quotidiennes » non mise à jour");
    assert(/Ressenti moyen sur les tours/.test(t.help["stats-weekly"]), "aide « 7 derniers jours » non mise à jour");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  // ═══════════════════ A. Barre du haut des Flashcards ═══════════════════
  // Bascule « Mélangé / Par matière » au dessin des sélecteurs des Paramètres, fond blanc qui GLISSE.
  const SIZES = [["PC 1280", 1280, 900], ["iPad portrait", 820, 1180], ["iPad paysage", 1180, 820], ["tél. 390", 390, 844], ["tél. 360", 360, 740]];
  const nowIso = () => new Date().toISOString();
  const mkCards = (n) => Array.from({ length: n }, (_, i) => ({
    id: "t" + i, speId: i % 2 ? "s2" : "s1", recto: "<p>Question " + i + "</p>", verso: "<p>Réponse</p>", itemId: null,
    interval: 0, nextReview: nowIso(), lastReview: null, createdAt: nowIso(), updatedAt: nowIso(), source: "manuel",
  }));
  async function flashUser() {
    const u = await mkUser({ courses: 1 });
    await adb.doc(`users/${u.uid}/subjects/s2`).set({ name: "UE2 - Biologie cellulaire et moléculaire", color: "#eab308", order: 20, archivedAt: null, createdAt: new Date() });
    const ctx = await openPage(browser, u);
    await ctx.page.waitForFunction(() => window.startFlashSession, { timeout: 15000 });
    return ctx;
  }
  const measureSeg = (page, swSel, barSel, closeSel) => page.evaluate((sw, bar, cl) => {
    const el = document.querySelector(sw); const opts = [...el.querySelectorAll(".seg-opt")]; const thumb = el.querySelector(".seg-thumb");
    const r = (n) => n.getBoundingClientRect(); const barEl = document.querySelector(bar); const bR = r(barEl);
    const act = el.querySelector(".seg-opt.active"); const aR = r(act), tR = r(thumb);
    const closeEl = cl ? document.querySelector(cl) : null; const cR = closeEl ? r(closeEl) : null;
    return {
      display: getComputedStyle(el).display, cursor: getComputedStyle(el).cursor,
      widths: opts.map((o) => Math.round(r(o).width * 10) / 10),
      clipped: opts.some((o) => o.scrollWidth > o.clientWidth + 1),
      thumbOnActive: Math.abs(tR.left - aR.left) <= 1.5 && Math.abs(tR.width - aR.width) <= 1.5,
      labels: opts.map((o) => { const q = r(o.querySelector("span")); return q.width > 2 && q.height > 2; }),
      barOverflow: barEl.scrollWidth > barEl.clientWidth + 1,
      closeInside: cR ? (cR.right <= bR.right + 0.5 && cR.left >= bR.left - 0.5) : true,
      swInside: r(el).right <= bR.right + 0.5,
      pageHScroll: (() => { const box = barEl.closest('.flash-session-modal, .spe-err-session-layer') || barEl; return box.scrollWidth > box.clientWidth + 1; })(), // la FENÊTRE de session (la page derrière a un débordement antérieur à ce lot)
    };
  }, swSel, barSel, closeSel);
  const finishAnims = (page, sel) => page.evaluate((q) => document.querySelector(q).getAnimations({ subtree: true }).forEach((a) => a.finish()), sel);

  for (const theme of ["light", "dark"]) {
    await S("A1-" + theme, `Flashcards (session réelle, thème ${theme}) : deux moitiés égales, fond blanc qui glisse, rien de rogné, croix entière, main, sur 5 tailles d'écran`, async () => {
      const { page } = await flashUser();
      await page.bringToFront();
      if (theme === "dark") await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await page.evaluate((c) => window.startFlashSession(c, { multi: true }), mkCards(6));
      await page.waitForFunction(() => getComputedStyle(document.getElementById("flashSessShuffle")).display !== "none", { timeout: 10000 });
      for (const [label, w, h] of SIZES) {
        await page.setViewport({ width: w, height: h });
        await sleep(350);
        const m = await measureSeg(page, "#flashSessShuffle", ".flash-session-topbar", ".flash-session-topbar .notes-close-btn");
        assert(Math.abs(m.widths[0] - m.widths[1]) <= 1, `[${label}] moitiés inégales : ${JSON.stringify(m.widths)}`);
        assert(m.display === "grid" || m.display === "inline-grid", `[${label}] display = ${m.display}`);
        assert(m.thumbOnActive, `[${label}] le fond blanc n'est pas sous le choix actif`);
        assert(!m.clipped, `[${label}] un libellé est rogné`);
        assert(m.barOverflow === false && m.pageHScroll === false, `[${label}] défilement horizontal`);
        assert(m.closeInside && m.swInside, `[${label}] la croix ou la bascule sort de la barre`);
        assert(m.cursor === "pointer", `[${label}] curseur ${m.cursor}`);
        if (w >= 375) assert(m.labels.every(Boolean), `[${label}] libellé masqué alors que l'écran est assez large`);
        else assert(m.labels.every((v) => v === false), `[${label}] < 375 px : icônes seules attendues`);
      }
      // Glissement réel : clic sur le vrai bouton -> transition de transform 0,28 s, sans rebond, puis le fond est sous « Par matière ».
      await page.setViewport({ width: 1280, height: 900 }); await sleep(300);
      await page.evaluate(() => document.getElementById("flashSessShuffle").click());
      const tr = await page.evaluate(() => { const th = document.querySelector("#flashSessShuffle .seg-thumb"); getComputedStyle(th).transform; return th.getAnimations().filter((a) => a.transitionProperty === "transform").map((a) => ({ d: a.effect.getTiming().duration, e: a.effect.getTiming().easing })); });
      assert(tr.length === 1 && tr[0].d === 280, "pas de transition de 0,28 s sur le fond blanc : " + JSON.stringify(tr));
      assert(/cubic-bezier\(0\.4, 0, 0\.2, 1\)/.test(tr[0].e), "courbe inattendue (rebond ?) : " + tr[0].e);
      await finishAnims(page, "#flashSessShuffle");
      const m2 = await measureSeg(page, "#flashSessShuffle", ".flash-session-topbar", ".flash-session-topbar .notes-close-btn");
      assert(m2.thumbOnActive && Math.abs(m2.widths[0] - m2.widths[1]) <= 1, "après bascule : fond blanc pas sous « Par matière » / moitiés inégales");
      const act = await page.evaluate(() => document.querySelector("#flashSessShuffle .seg-opt.active").dataset.shuf);
      assert(act === "false", "« Par matière » pas actif après le clic (script de session cassé ?)");
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

  await S("A2", "cahier d'erreurs (session intégrée) : même bascule, deux moitiés égales, fond qui glisse, entière à 390 et 360 px aussi", async () => {
    const { page } = await flashUser();
    await page.bringToFront();
    await page.evaluate(() => window.openSpeErrModal("s1")); await sleep(600);
    await page.evaluate((c) => window.startFlashSession(c, { multi: true, inline: true }), mkCards(6));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("speErrSessShuffle")).display !== "none", { timeout: 10000 });
    for (const [label, w, h] of SIZES) {
      await page.setViewport({ width: w, height: h }); await sleep(350);
      const m = await measureSeg(page, "#speErrSessShuffle", ".flash-insess-bar", null);
      assert(Math.abs(m.widths[0] - m.widths[1]) <= 1, `[${label}] moitiés inégales : ${JSON.stringify(m.widths)}`);
      assert(m.thumbOnActive && !m.clipped && !m.barOverflow && m.swInside, `[${label}] bascule mal posée ${JSON.stringify(m)}`);
    }
    await page.setViewport({ width: 1280, height: 900 }); await sleep(300);
    await page.evaluate(() => document.getElementById("speErrSessShuffle").click());
    const tr = await page.evaluate(() => { const th = document.querySelector("#speErrSessShuffle .seg-thumb"); getComputedStyle(th).transform; return th.getAnimations().filter((a) => a.transitionProperty === "transform").length; });
    assert(tr === 1, "pas de transition sur le fond blanc (cahier d'erreurs)");
    assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
  });

  await S("A3", "PC : fenêtre élargie ; la matière la plus longue reste entière à côté d'un compteur à 3 chiffres", async () => {
    const { page } = await flashUser();
    await page.bringToFront();
    await page.evaluate((c) => window.startFlashSession(c, { multi: false }), mkCards(4));
    await sleep(500);
    const w = await page.evaluate(() => Math.round(document.querySelector(".flash-session-modal").getBoundingClientRect().width));
    assert(w >= 600, "fenêtre pas élargie sur PC : " + w + " px");
    await page.evaluate(() => {
      const lab = document.getElementById("flashSessSpeLabel"); lab.style.display = "inline-flex";
      const n = lab.querySelector(".flash-spe-chip-name"); if (n) n.textContent = "UE2 - Biologie cellulaire et moléculaire";
      document.querySelector(".flash-session-counter").innerHTML = '<span class="flash-session-counter-label">Carte </span>123 / 456';
    });
    await sleep(200);
    const fit = await page.evaluate(() => { const lab = document.getElementById("flashSessSpeLabel"); return { clipped: lab.scrollWidth > lab.clientWidth + 1, w: Math.round(lab.getBoundingClientRect().width) }; });
    assert(!fit.clipped, "la matière la plus longue est tronquée à côté d'un compteur à 3 chiffres (largeur " + fit.w + " px)");
  });

  await S("A4", "pastille de numéro : couleur de matière CONSERVÉE, encre au contraste >= 4,5:1 sur toute la palette, bordure plus sombre", async () => {
    const { page } = await flashUser();
    const palette = ["#7c6cf6", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#eab308", "#ec4899", "#14b8a6", "#6b7280", "#8b5cf6", "#f97316", "#06b6d4", "#10b981", "#a855f7"];
    const res = await page.evaluate((cols) => cols.map((c) => { const k = window._flashChipInk(c); return { c, fg: k.fg, ratio: k.ratio, border: k.border }; }), palette);
    const weak = res.filter((x) => x.ratio < 4.5);
    assert(weak.length === 0, "contraste < 4,5:1 : " + JSON.stringify(weak));
    assert(res.some((x) => x.fg === "#0f172a") && res.some((x) => x.fg === "#fff"), "l'encre n'adapte pas blanc/foncé selon la couleur : " + JSON.stringify(res.map((x) => x.fg)));
    assert(res.every((x) => /^rgb\(/.test(x.border)), "bordure absente");
    assert(await page.evaluate(() => window._flashChipInk("pas-une-couleur") === null), "couleur non hexadécimale : rendu d'origine attendu (null)");
  });

  // ═══════════════════ T. Paramètres : animation des sélecteurs à deux choix ═══════════════════
  // Retour de Jean (11/10) : « mets une animation de transition entre les boutons switch, pour l'instant y'en a pas ».
  for (const theme of ["light", "dark"]) {
    await S("T1-" + theme, `Paramètres (${theme}) : 5 sélecteurs = deux moitiés égales, fond blanc sous le choix actif, qui GLISSE (0,28 s) au vrai clic ; rien d'animé à l'ouverture`, async () => {
      const u = await mkUser({ courses: 1 });
      const { page } = await openPage(browser, u);
      await page.bringToFront();
      if (theme === "dark") await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      for (const [label, w, h] of [["PC 1280", 1280, 900], ["tél. 390", 390, 844]]) {
        await page.setViewport({ width: w, height: h });
        await sleep(300);
        await page.evaluate(() => window.openSettingsModal());
        await page.waitForSelector("#settings-modal-overlay.active", { timeout: 8000 });
        await sleep(700);
        const ids = await page.evaluate(() => [...document.querySelectorAll("#settings-modal-overlay .seg-switch.settings-seg, #settings-modal-overlay .tpx-seg")].map((e) => e.id));
        assert(ids.length >= 5, `[${label}] sélecteurs trouvés : ${JSON.stringify(ids)} (5 attendus)`);
        // Rien ne doit glisser à l'ouverture (pas de « révélation » du fond blanc)
        const openAnims = await page.evaluate(() => [...document.querySelectorAll("#settings-modal-overlay .seg-switch.settings-seg, #settings-modal-overlay .tpx-seg")]
          .reduce((n, e) => n + e.getAnimations({ subtree: true }).filter((a) => a.transitionProperty === "transform").length, 0));
        assert(openAnims === 0, `[${label}] ${openAnims} fond(s) blanc(s) glissent à l'ouverture`);
        for (const id of ids) {
          const sel = "#" + id;
          const geo = () => page.evaluate((s) => {
            const el = document.querySelector(s); const isTpx = el.classList.contains("tpx-seg");
            const opts = [...el.querySelectorAll(isTpx ? ".tpx-seg-opt" : ".seg-opt")]; const act = opts.find((o) => o.classList.contains("active"));
            const r = (n) => n.getBoundingClientRect(); const e = r(el);
            // fond blanc : .seg-thumb, ou ::before du .tpx-seg (matrice de transform lue en calculé)
            let tx = null, tw = null;
            if (isTpx) { const cs = getComputedStyle(el, "::before"); tw = parseFloat(cs.width); const m = new DOMMatrix(cs.transform === "none" ? undefined : cs.transform); tx = m.m41; }
            else { const th = el.querySelector(".seg-thumb"); const cs = getComputedStyle(th); tw = parseFloat(cs.width); const m = new DOMMatrix(cs.transform === "none" ? undefined : cs.transform); tx = m.m41; if (cs.display === "none") tx = tw = null; }
            const inner = e.left + 1 + 3; // bordure + padding
            return { widths: opts.map((o) => Math.round(r(o).width * 10) / 10), actLeft: r(act).left - inner, actW: r(act).width, tx, tw, activeIdx: opts.indexOf(act) };
          }, sel);
          const g0 = await geo();
          assert(Math.abs(g0.widths[0] - g0.widths[1]) <= 1, `[${label}] ${id} : moitiés inégales ${JSON.stringify(g0.widths)}`);
          assert(g0.tx !== null, `[${label}] ${id} : pas de fond blanc glissant (ancien rendu)`);
          assert(Math.abs(g0.tx - g0.actLeft) <= 1.5 && Math.abs(g0.tw - g0.actW) <= 1.5, `[${label}] ${id} : fond blanc pas sous le choix actif ${JSON.stringify(g0)}`);
          // vrai clic sur le choix inactif
          const target = await page.evaluate((s, idx) => { const el = document.querySelector(s); const opts = [...el.querySelectorAll(el.classList.contains("tpx-seg") ? ".tpx-seg-opt" : ".seg-opt")]; const o = opts[1 - idx]; o.scrollIntoView({ block: "center" }); const r = o.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel, g0.activeIdx);
          // Le changement d'état peut être différé par l'application (fondu du tableau, rendu lent en headless).
          // Un observateur est donc posé AVANT le clic : au tout premier changement de classe active, il force
          // le calcul de style (la transition démarre) puis relève aussitôt les transitions de transform en cours.
          await page.evaluate((s) => {
            const el = document.querySelector(s);
            window.__segSeen = new Promise((resolve) => {
              const mo = new MutationObserver(() => {
                const th = el.querySelector(".seg-thumb") || el; getComputedStyle(th).transform; getComputedStyle(el, "::before").transform;
                mo.disconnect();
                resolve(el.getAnimations({ subtree: true }).filter((a) => a.transitionProperty === "transform").map((a) => ({ d: a.effect.getTiming().duration, e: a.effect.getTiming().easing })));
              });
              mo.observe(el, { subtree: true, attributes: true, attributeFilter: ["class"] });
              setTimeout(() => { mo.disconnect(); resolve(null); }, 4000);
            });
          }, sel);
          await page.mouse.click(target.x, target.y);
          const cfDeadline = Date.now() + 2500; // barème de confiance : conversion à confirmer
          while (Date.now() < cfDeadline) { const clicked = await page.evaluate(() => { const cf = document.getElementById("confirm-modal-confirm"); if (cf && cf.offsetParent !== null) { cf.click(); return true; } return false; }); if (clicked) break; await sleep(80); }
          const anims = await page.evaluate(() => window.__segSeen);
          await sleep(1200);
          const g1 = await geo();
          assert(g1.activeIdx !== g0.activeIdx, `[${label}] ${id} : le clic n'a pas changé le réglage (rien n'est prouvé)`);
          assert(anims.length === 1 && anims[0].d === 280 && /cubic-bezier\(0\.4, 0, 0\.2, 1\)/.test(anims[0].e), `[${label}] ${id} : pas de transition 0,28 s au clic : ${JSON.stringify(anims)}`);
          assert(Math.abs(g1.tx - g1.actLeft) <= 1.5, `[${label}] ${id} : après le clic le fond blanc n'est pas sous le nouveau choix ${JSON.stringify(g1)}`);
          // on remet l'état d'origine
          const back = await page.evaluate((s, idx) => { const el = document.querySelector(s); const opts = [...el.querySelectorAll(el.classList.contains("tpx-seg") ? ".tpx-seg-opt" : ".seg-opt")]; const r = opts[idx].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel, g0.activeIdx);
          await page.mouse.click(back.x, back.y); await sleep(500);
          await page.evaluate(async () => { const t0 = performance.now(); while (performance.now() - t0 < 2500) { const cf = document.getElementById("confirm-modal-confirm"); if (cf && cf.offsetParent !== null) { cf.click(); break; } await new Promise((r) => setTimeout(r, 50)); } });
          await sleep(1200);
        }
        await page.evaluate(() => window.closeSettingsModal && window.closeSettingsModal()); await sleep(400);
      }
      assert(page.__errors.length === 0, "erreurs JS : " + JSON.stringify(page.__errors));
    });
  }

} finally {
  await browser.close(); proxy.close(); server.close();
}
process.exit(report());
