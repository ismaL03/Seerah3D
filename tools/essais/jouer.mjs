// Joue un chapitre du mode histoire de bout en bout : une mauvaise réponse puis la bonne à chaque choix,
// un essai raté puis réussi à chaque lieu à trouver. Affiche le déroulé et les erreurs de la console.
// usage : node jouer.mjs hijra [--captures dossier] [--sans-erreurs] [--anime]
import { ouvrir, images } from './commun.mjs';

const args = process.argv.slice(2), chapitre = args[0] || 'hijra';
const dossier = args.includes('--captures') ? args[args.indexOf('--captures') + 1] : null;
const avecErreurs = !args.includes('--sans-erreurs'), reduit = !args.includes('--anime');
const { browser, page, erreurs } = await ouvrir({ hash: `#histoire/${chapitre}`, reduit });
const clic = async (s) => { try { await page.click(s, { timeout: 4000, force: true }); } catch { /* élément déjà masqué */ } };
const journal = [], tentes = new Set();
let n = 0;
for (let tour = 0; tour < 150; tour++) {
  await page.waitForTimeout(reduit ? 700 : 1500);
  const st = await page.evaluate(() => {
    const v = (s) => { const e = document.querySelector(s); return !!e && !e.hidden; };
    return { carte: v('#jChapCarte'), suite: v('#jDialogue') && v('#jdSuite'), opts: document.querySelectorAll('#jdOptions .j-opt').length, conseq: v('#jConseq'), consigne: v('#jConsigne'), bilan: v('#jBilan'), dlg: v('#jDialogue'), texte: document.getElementById('jdTexte').textContent.slice(0, 70) };
  });
  if (dossier && (st.conseq || st.bilan || st.opts || st.consigne)) await page.screenshot({ path: `${dossier}/${chapitre}-${String(++n).padStart(2, '0')}.png` });
  if (st.bilan) { journal.push('bilan : ' + JSON.stringify(await page.evaluate(() => window.__sira.jeu.etat()))); break; }
  if (st.conseq) { journal.push('  retour dans le temps'); await clic('#jqRetour'); continue; }
  if (st.carte) { await clic('#jChapCarte'); continue; }
  if (st.consigne) {
    const c = await page.evaluate(() => {
      const { D, jeu } = window.__sira, e = jeu.etat(), et = D.HISTOIRE.chapitres[e.i].etapes[e.k];
      return { t: Array.isArray(et.cible) ? et.cible : [D.LIEUX[et.cible].lat, D.LIEUX[et.cible].lon], cle: `${e.i}/${e.k}` };
    });
    await images(page);
    const p = await page.evaluate(([a, b]) => window.__sira.carte.projeter(a, b), c.t), vp = page.viewportSize();
    if (!p.devant || p.x < 0 || p.y < 0 || p.x > vp.width || p.y > vp.height) { journal.push(`CIBLE HORS ÉCRAN ${c.cle}`); break; }
    const rate = avecErreurs && !tentes.has(c.cle); tentes.add(c.cle);
    await page.mouse.click(p.x + (rate ? 170 : 0), p.y - (rate ? 110 : 0));
    journal.push(`trouver ${c.cle} : ${rate ? 'raté' : 'visé'}`);
    continue;
  }
  if (st.opts) {
    const r = await page.evaluate(() => {
      const { D, jeu } = window.__sira, e = jeu.etat(), et = D.HISTOIRE.chapitres[e.i].etapes[e.k];
      return { juste: et._ordre.findIndex((k) => et.options[k].juste), libres: [...document.querySelectorAll('#jdOptions .j-opt')].filter((b) => !b.disabled).map((b) => +b.dataset.i), cle: `${e.i}/${e.k}` };
    });
    const faux = r.libres.find((i) => i !== r.juste), choix = avecErreurs && !tentes.has(r.cle) && faux != null ? faux : r.juste;
    tentes.add(r.cle);
    journal.push(`choix ${r.cle} : ${choix === r.juste ? 'juste' : 'faux'}`);
    await clic(`#jdOptions .j-opt[data-i="${choix}"]`);
    continue;
  }
  if (st.dlg) { if (st.suite) journal.push('récit : ' + st.texte); await page.keyboard.press('Space'); }
}
console.log(journal.join('\n'));
console.log(erreurs.length ? 'ERREURS :\n' + erreurs.join('\n') : 'Aucune erreur dans la console.');
await browser.close();
process.exit(erreurs.length ? 1 : 0);
