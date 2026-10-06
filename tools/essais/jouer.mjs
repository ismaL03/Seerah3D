// Joue un chapitre du mode histoire de bout en bout : une erreur volontaire puis la bonne réponse à chaque
// jeu (choix, lieu à trouver, ordre, associer, vrai ou faux, estimation), et dans les missions à la première
// personne un échec forcé puis la réussite. Affiche le déroulé et les erreurs de la console.
// usage : node jouer.mjs hijra [--captures dossier] [--sans-erreurs] [--anime] [--vp 1440x900]
import { ouvrir, images } from './commun.mjs';

const args = process.argv.slice(2), chapitre = args[0] || 'hijra';
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const dossier = opt('--captures'), [lw, lh] = (opt('--vp') || '1440x900').split('x').map(Number);
const avecErreurs = !args.includes('--sans-erreurs'), reduit = !args.includes('--anime');
const { browser, page, erreurs } = await ouvrir({ hash: `#histoire/${chapitre}`, reduit, vp: { width: lw, height: lh } });
const clic = async (s) => { try { await page.click(s, { timeout: 4000, force: true }); } catch { /* élément déjà masqué */ } };
const journal = [], tentes = new Set();
let n = 0;
const capture = async (nom) => { if (dossier) await page.screenshot({ path: `${dossier}/${chapitre}-${String(++n).padStart(2, '0')}-${nom}.png`, timeout: 120000 }); };
const premiere = (cle) => { const r = avecErreurs && !tentes.has(cle); tentes.add(cle); return r; };

for (let tour = 0; tour < 600; tour++) {
  await page.waitForTimeout(reduit ? 500 : 1200);
  const st = await page.evaluate(() => {
    const v = (s) => { const e = document.querySelector(s); return !!e && !e.hidden; };
    const { jeu, D } = window.__sira, m = jeu.mission, e = jeu.etat();
    const et = e && D.HISTOIRE.chapitres[e.i].etapes[e.k], o = m.etape();
    return {
      carte: v('#jChapCarte'), role: v('#jRole'), conseq: v('#jConseq'), bilan: v('#jBilan'), dlg: v('#jDialogue'), suite: v('#jdSuite'), consigne: v('#jConsigne'), mini: v('#jMini'),
      opts: v('#jDialogue') ? document.querySelectorAll('#jdOptions .j-opt').length : 0, mission: document.body.classList.contains('jeu-mission'),
      choixMission: m.choix(), objectif: o && { texte: o.texte, echecs: (o.echecs || []).length }, scene: m.etat() && m.etat().scene,
      type: et && et.type, cle: e && `${e.i}/${e.k}`, texte: document.getElementById('jdTexte').textContent.slice(0, 70), etat: e,
    };
  });
  if (st.bilan) { journal.push('bilan : ' + JSON.stringify(st.etat)); await capture('bilan'); break; }
  if (st.conseq) { await capture('consequence'); journal.push('  ↺ retour dans le temps'); await clic('#jqRetour'); continue; }
  if (st.carte) { await clic('#jChapCarte'); continue; }
  if (st.role) { await capture('role'); journal.push('mission : rôle'); await clic('#jrGo'); continue; }

  // ---------- mission (jouée sur la carte) ----------
  if (st.mission) {
    if (st.opts && st.choixMission) {
      const libres = await page.evaluate(() => [...document.querySelectorAll('#jdOptions .j-opt')].filter((b) => !b.disabled).map((b) => +b.dataset.i));
      const faux = libres.find((i) => i !== st.choixMission.juste), cle = `${st.scene}/${st.texte}`;
      const choix = premiere(cle) && faux != null ? faux : st.choixMission.juste;
      await capture('mission-choix');
      journal.push(`  mission, choix : ${choix === st.choixMission.juste ? 'juste' : 'faux'} — ${st.texte}`);
      await clic(`#jdOptions .j-opt[data-i="${choix}"]`);
      continue;
    }
    if (st.dlg && st.suite) { await page.keyboard.press('Space'); continue; }
    if (st.objectif && !st.dlg) {
      await images(page, 2);
      const cle = `${st.scene}/${st.objectif.texte}`;
      if (st.objectif.echecs && premiere(cle)) {
        await capture('mission-objectif'); journal.push(`  mission, objectif (échec forcé) : ${st.objectif.texte}`);
        await page.evaluate(() => window.__sira.jeu.mission.echouer());
      } else {
        if (!tentes.has(cle)) await capture('mission-objectif');
        tentes.add(cle); journal.push(`  mission, objectif : ${st.objectif.texte}`);
        await page.evaluate(() => { window.__sira.jeu.mission.resoudre(); });
      }
    }
    continue;
  }

  // ---------- petits jeux ----------
  if (st.mini) {
    const et = await page.evaluate(() => { const { D, jeu } = window.__sira, e = jeu.etat(); return D.HISTOIRE.chapitres[e.i].etapes[e.k]; });
    const rate = premiere(st.cle + '/' + (await page.evaluate(() => document.querySelector('#jMini .j-mini-tete small')?.textContent || '')));
    await capture(st.type);
    if (st.type === 'ordre') {
      const n = et.elements.length, ordre = [...Array(n).keys()];
      if (rate) [ordre[0], ordre[1]] = [ordre[1], ordre[0]];
      for (const k of ordre) await clic(`#jMini .j-carte[data-k="${k}"]`);
      await clic('#jMini [data-a="ok"]');
      journal.push(`ordre ${st.cle} : ${rate ? 'raté' : 'juste'}`);
    } else if (st.type === 'associer') {
      const n = et.paires.length;
      if (rate) { await clic('#jMini .g[data-k="0"]'); await clic('#jMini .d[data-k="1"]'); }
      for (let k = 0; k < n; k++) { await clic(`#jMini .g[data-k="${k}"]`); await clic(`#jMini .d[data-k="${k}"]`); }
      journal.push(`associer ${st.cle} : ${rate ? 'une erreur' : 'juste'}`);
    } else if (st.type === 'vraifaux') {
      const k = await page.evaluate(() => +document.querySelector('#jMini .j-mini-tete small').textContent.match(/(\d+) \//)[1] - 1);
      const suite = await page.evaluate(() => !document.querySelector('#jMini [data-a="suite"]')?.hidden);
      if (suite) { await clic('#jMini [data-a="suite"]'); continue; }
      const vrai = et.affirmations[k].vrai, rep = avecErreurs && k === 0 && rate ? !vrai : vrai;
      await clic(`#jMini [data-v="${rep ? 1 : 0}"]`);
      journal.push(`vrai ou faux ${st.cle} #${k + 1} : ${rep === vrai ? 'juste' : 'faux'}`);
    } else if (st.type === 'estimer') {
      const v = rate ? (et.juste - et.tolerance * 2 >= et.min ? et.juste - et.tolerance * 2 : et.juste + et.tolerance * 2) : et.juste;
      await page.evaluate((v) => { const c = document.querySelector('#jMini input'); c.value = v; c.dispatchEvent(new Event('input')); }, v);
      await clic('#jMini [data-a="ok"]');
      journal.push(`estimer ${st.cle} : ${v} (juste ${et.juste} ± ${et.tolerance})`);
    }
    continue;
  }

  // ---------- jeux de carte ----------
  if (st.consigne) {
    const c = await page.evaluate(() => {
      const { D, jeu } = window.__sira, e = jeu.etat(), et = D.HISTOIRE.chapitres[e.i].etapes[e.k];
      const L = Object.fromEntries(Object.entries(D.LIEUX));
      return { t: Array.isArray(et.cible) ? et.cible : [L[et.cible].lat, L[et.cible].lon] };
    });
    await images(page);
    const p = await page.evaluate(([a, b]) => window.__sira.carte.projeter(a, b), c.t), vp = page.viewportSize();
    if (!p.devant || p.x < 0 || p.y < 0 || p.x > vp.width || p.y > vp.height) { journal.push(`CIBLE HORS ÉCRAN ${st.cle}`); break; }
    const rate = premiere(st.cle);
    await capture('trouver');
    await page.mouse.click(p.x + (rate ? 170 : 0), p.y - (rate ? 110 : 0));
    journal.push(`trouver ${st.cle} : ${rate ? 'raté' : 'visé'}`);
    continue;
  }
  if (st.opts) {
    const r = await page.evaluate(() => {
      const { D, jeu } = window.__sira, e = jeu.etat(), et = D.HISTOIRE.chapitres[e.i].etapes[e.k];
      return { juste: et._ordre.findIndex((k) => et.options[k].juste), libres: [...document.querySelectorAll('#jdOptions .j-opt')].filter((b) => !b.disabled).map((b) => +b.dataset.i) };
    });
    const faux = r.libres.find((i) => i !== r.juste), choix = premiere(st.cle) && faux != null ? faux : r.juste;
    await capture(st.type);
    journal.push(`${st.type} ${st.cle} : ${choix === r.juste ? 'juste' : 'faux'}`);
    await clic(`#jdOptions .j-opt[data-i="${choix}"]`);
    continue;
  }
  if (st.dlg) { if (st.suite) journal.push('récit : ' + st.texte); await page.keyboard.press('Space'); }
}
console.log(journal.join('\n'));
console.log(erreurs.length ? 'ERREURS :\n' + erreurs.join('\n') : 'Aucune erreur dans la console.');
await browser.close();
process.exit(erreurs.length ? 1 : 0);
