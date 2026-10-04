// Ouverture de la carte dans Chromium (Playwright), avec Three.js servi en local
// (utile quand le CDN n'est pas joignable) et les polices remplacées par une feuille vide.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const THREE_DIR = path.join(ICI, 'node_modules/three');
export const BASE = process.env.BASE || 'http://127.0.0.1:8000/';

export async function ouvrir({ hash = '', vp = { width: 1440, height: 900 }, reduit = true, tactile = false } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: tactile, isMobile: tactile, reducedMotion: reduit ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', (e) => erreurs.push(e.stack));
  await page.addInitScript(() => { try { localStorage.setItem('sira3d.aide-vue', '1'); } catch { /* */ } });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.1/**', (r) => r.fulfill({ path: path.join(THREE_DIR, r.request().url().split('three@0.186.1/')[1]), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto(`${BASE}?test${hash}`);
  await page.waitForFunction(() => document.getElementById('chargement').classList.contains('fini'), null, { timeout: 120000 });
  return { browser, page, erreurs };
}
// Attendre quelques images (le rendu logiciel est lent : ~1 s par image).
export const images = async (page, n = 3) => { for (let k = 0; k < n; k++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); };
