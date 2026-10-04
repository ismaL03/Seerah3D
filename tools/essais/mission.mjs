// Joue une mission à la première personne de bout en bout : à chaque choix une mauvaise option puis la
// bonne, à chaque objectif qui peut échouer un échec forcé puis la réussite. Captures en option.
// usage : node mission.mjs <chapitre>[:<mission>] [--captures dossier] [--sans-erreurs] [--anime] [--vp 1440x900]
import { ouvrir, images } from './commun.mjs';

const args = process.argv.slice(2), chapitre = args[0] || 'naissance';
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const dossier = opt('--captures'), [lw, lh] = (opt('--vp') || '1440x900').split('x').map(Number);
const avecErreurs = !args.includes('--sans-erreurs'), reduit = !args.includes('--anime');
const { browser, page, erreurs } = await ouvrir({ reduit, vp: { width: lw, height: lh } });
// <chapitre> : la première mission du chapitre ; <chapitre>:<mission> : cette mission, jouée seule dans ce chapitre
const [chap, seule] = chapitre.split(':');
if (seule) await page.evaluate(([c, m]) => { window.__sira.jeu.essai(c, [{ type: 'mission', mission: m, epreuves: 0 }]); }, [chap, seule]);
else {
  const k = await page.evaluate((c) => {
    const { D } = window.__sira, ch = D.HISTOIRE.chapitres.find((x) => x.evenement === c);
    return ch.etapes.findIndex((e) => e.type === 'mission');
  }, chap);
  if (k < 0) { console.log('Pas de mission dans ce chapitre'); process.exit(1); }
  await page.evaluate(([c, k]) => { window.__sira.jeu.jouer(c, k); }, [chap, k]); // sans attendre la fin du chapitre
}
const clic = async (s) => { try { await page.click(s, { timeout: 4000, force: true }); } catch { /* déjà masqué */ } };
const journal = [], tentes = new Set();
let n = 0, fin = false;
const capture = async (nom) => { if (dossier) await page.screenshot({ path: `${dossier}/${chapitre.replace(':', '-')}-${String(++n).padStart(2, '0')}-${nom}.png` }); };
for (let tour = 0; tour < 400 && !fin; tour++) {
  await page.waitForTimeout(reduit ? 500 : 1200);
  const st = await page.evaluate(() => {
    const v = (s) => { const e = document.querySelector(s); return !!e && !e.hidden; };
    const m = window.__sira.jeu.mission, e = m.etat(), o = m.etape();
    return { carte: v('#jChapCarte'), role: v('#jRole'), conseq: v('#jConseq'), bilan: v('#jBilan'), dlg: v('#jDialogue'), suite: v('#jdSuite'),
      opts: v('#jDialogue') ? document.querySelectorAll('#jdOptions .j-opt').length : 0, choix: m.choix(), monde: document.body.classList.contains('jeu-monde'),
      objectif: o && { texte: o.texte, echecs: (o.echecs || []).length, quand: o.quand }, scene: e && e.scene, texte: document.getElementById('jdTexte').textContent.slice(0, 80),
      etat: window.__sira.jeu.etat() };
  });
  if (st.bilan) { journal.push('fin de chapitre : ' + JSON.stringify(st.etat)); fin = true; break; }
  if (st.conseq) { await capture('consequence'); journal.push('  ↺ retour dans le temps'); await clic('#jqRetour'); continue; }
  if (st.carte) { await clic('#jChapCarte'); continue; }
  if (st.role) { await capture('role'); journal.push('rôle'); await clic('#jrGo'); continue; }
  if (st.opts && st.choix) {
    const libres = await page.evaluate(() => [...document.querySelectorAll('#jdOptions .j-opt')].filter((b) => !b.disabled).map((b) => +b.dataset.i));
    const cle = `${st.scene}/${st.texte}`;
    const faux = libres.find((i) => i !== st.choix.juste), choix = avecErreurs && !tentes.has(cle) && faux != null ? faux : st.choix.juste;
    tentes.add(cle);
    await capture('choix');
    journal.push(`choix : ${choix === st.choix.juste ? 'juste' : 'faux'} — ${st.texte}`);
    await clic(`#jdOptions .j-opt[data-i="${choix}"]`);
    continue;
  }
  if (st.opts) { // choix d'une étape de carte (hors mission) : la bonne réponse
    const j = await page.evaluate(() => { const { D, jeu } = window.__sira, e = jeu.etat(), et = D.HISTOIRE.chapitres[e.i].etapes[e.k]; return et._ordre ? et._ordre.findIndex((q) => et.options[q].juste) : 0; });
    await clic(`#jdOptions .j-opt[data-i="${j}"]`); continue;
  }
  if (st.dlg && (st.suite || !st.objectif)) { if (st.suite) journal.push('  « ' + st.texte + ' »'); await page.keyboard.press('Space'); continue; }
  if (st.objectif) {
    await images(page, 2);
    const cle = `${st.scene}/${st.objectif.texte}`;
    if (avecErreurs && st.objectif.echecs && !tentes.has(cle)) {
      tentes.add(cle); await capture('objectif');
      journal.push(`objectif (échec forcé) : ${st.objectif.texte}`);
      await page.evaluate(() => window.__sira.jeu.mission.echouer());
    } else {
      if (!tentes.has(cle)) await capture('objectif');
      tentes.add(cle);
      journal.push(`objectif : ${st.objectif.texte}`);
      await page.evaluate(() => window.__sira.jeu.mission.resoudre());
    }
    continue;
  }
  if (!st.monde && !st.dlg) { /* étape de carte suivante (trouver…) : on s'arrête là */ if (tour > 5) { journal.push('sortie de la mission'); fin = true; } }
}
await capture('fin');
console.log(journal.join('\n'));
console.log(erreurs.length ? 'ERREURS :\n' + erreurs.join('\n') : 'Aucune erreur dans la console.');
await browser.close();
process.exit(erreurs.length ? 1 : 0);
