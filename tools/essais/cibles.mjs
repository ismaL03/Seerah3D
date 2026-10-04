// Vérifie que la cible de chaque étape « trouver » est visible dans sa vue, sous la consigne,
// sur ordinateur et sur téléphone. usage : node cibles.mjs
import { ouvrir, images } from './commun.mjs';

let echecs = 0;
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tel = vp.width < 800, { browser, page } = await ouvrir({ hash: '#evenement/hijra', vp, tactile: tel });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { document.body.classList.add('histoire', 'jeu-consigne'); window.__sira.carte.rafraichirVue(); window.__sira.carte.etiquettes('aucune'); });
  const etapes = await page.evaluate(() => window.__sira.D.HISTOIRE.chapitres.flatMap((c) => c.etapes.filter((e) => e.type === 'trouver').map((e) => ({ ch: c.evenement, vue: e.vue, cible: e.cible }))));
  for (const e of etapes) {
    await page.evaluate((e) => { const c = window.__sira.carte, v = e.vue; if (v.hijaz) c.cadrerHijaz(v.cap, v.incl, 0); else c.viser(v.lieu || v.point, v.r, v.cap, v.incl, 0); }, e);
    await page.waitForTimeout(1500); await images(page);
    const r = await page.evaluate((e) => { const { carte, D } = window.__sira, t = typeof e.cible === 'string' ? [D.LIEUX[e.cible].lat, D.LIEUX[e.cible].lon] : e.cible; return carte.projeter(t[0], t[1]); }, e);
    const ok = r.devant && r.x > 20 && r.x < vp.width - 20 && r.y > (tel ? 150 : 170) && r.y < vp.height - 24;
    if (!ok) echecs++;
    console.log(`${vp.width}px  ${ok ? 'ok  ' : 'HORS'}  ${e.ch}`);
  }
  await browser.close();
}
process.exit(echecs ? 1 : 0);
