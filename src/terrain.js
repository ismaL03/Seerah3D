// Terrain : maillage du relief réel, socle de maquette, mer, et deux habillages
// (« stylisé » calculé d'après l'image satellite, ou « satellite » brut).
import * as THREE from 'three';

const SOCLE = -7; // fond de la maquette (unités de scène)

// Palette du sol, du plus sombre (basalte des harrât) au plus clair (sable).
const RAMPE = [
  [0.00, '#3E3632'], [0.16, '#5C4E46'], [0.32, '#8A6A4F'], [0.48, '#B28C64'],
  [0.64, '#D1B083'], [0.80, '#E5CEA2'], [1.00, '#F1E3C3'],
].map(([t, c]) => [t, hexRgb(c)]);
const MER = [[0, '#A4DCD4'], [40, '#6DB8C0'], [250, '#3A7E9C'], [800, '#1F4F6B']].map(([d, c]) => [d, hexRgb(c)]);
const VERT = hexRgb('#7F9F55'), HAUTS = hexRgb('#A89A80'), RIVAGE = hexRgb('#EADFC2');

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rampe(stops, t, out) {
  let i = 1;
  while (i < stops.length - 1 && t > stops[i][0]) i++;
  const [ta, ca] = stops[i - 1], [tb, cb] = stops[i];
  const k = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
  out[0] = ca[0] + (cb[0] - ca[0]) * k; out[1] = ca[1] + (cb[1] - ca[1]) * k; out[2] = ca[2] + (cb[2] - ca[2]) * k;
}
function bruit(x, y) { // bruit de valeur simple, déterministe
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}

async function chargerImage(url) {
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob);
}

// Habillage stylisé : la luminosité du satellite choisit la teinte dans la palette,
// le relief ajoute rivages et hauts plateaux, les oasis historiques sont verdies.
function styliser(R, image, oasis, bornesLum) {
  const w = image.width, h = image.height, f = w / R.W;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, w, h), d = src.data;
  // Bornes de luminosité sur la terre ferme (centiles 3 % et 97 %) ; les encarts reprennent celles du Hijaz.
  let lo, hi;
  if (bornesLum) ({ lo, hi } = bornesLum);
  else {
    const hist = new Uint32Array(256); let n = 0;
    for (let py = 0; py < h; py += 3) for (let px = 0; px < w; px += 3) {
      if (R.metresPixel((px + 0.5) / f - 0.5, (py + 0.5) / f - 0.5) <= 0) continue;
      const k = (py * w + px) * 4; hist[Math.round(0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2])]++; n++;
    }
    const centile = (p) => { let s = 0; for (let i = 0; i < 256; i++) { s += hist[i]; if (s >= n * p) return i; } return 255; };
    lo = centile(0.03); hi = centile(0.97);
  }
  // Oasis en coordonnées pixel.
  const zones = oasis.map((o) => ({ px: (o.lon - R.ouest) / R.pas * f, py: (R.nord - o.lat) / R.pas * f, r: o.rayon / (R.pas * R.kz) * f }))
    .filter((z) => z.px > -z.r && z.px < w + z.r && z.py > -z.r && z.py < h + z.r);
  const c = [0, 0, 0];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const k = (py * w + px) * 4;
      const m = R.metresPixel((px + 0.5) / f - 0.5, (py + 0.5) / f - 0.5);
      if (m <= 0) {
        rampe(MER, -m, c);
      } else {
        const L = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
        rampe(RAMPE, (L - lo) / (hi - lo), c);
        const hauts = lisse(1400, 2300, m) * 0.28;
        if (hauts > 0) for (let i = 0; i < 3; i++) c[i] += (HAUTS[i] - c[i]) * hauts;
        if (m < 8) for (let i = 0; i < 3; i++) c[i] += (RIVAGE[i] - c[i]) * 0.35;
        for (const z of zones) {
          const dist = Math.hypot(px - z.px, py - z.py);
          if (dist > z.r) continue;
          const g = (1 - lisse(z.r * 0.35, z.r, dist)) * (0.45 + 0.4 * bruit(px * 0.35, py * 0.35));
          for (let i = 0; i < 3; i++) c[i] += (VERT[i] - c[i]) * g;
        }
      }
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  }
  ctx.putImageData(src, 0, 0);
  return { cv, lo, hi };
}

// Pixels d'une image (canvas ou bitmap).
function pixels(source) {
  const cv = document.createElement('canvas'); cv.width = source.width; cv.height = source.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  return { cv, ctx, img: ctx.getImageData(0, 0, cv.width, cv.height) };
}

// Fond la texture d'un encart dans celle du Hijaz près de ses bords (même poids que le relief).
function fondreTexture(E, R, encart, hijaz) {
  const a = pixels(encart), b = hijaz.img, w = a.cv.width, h = a.cv.height, d = a.img.data, m = b.data, wm = b.width, hm = b.height;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const lon = E.ouest + (px + 0.5) / w * (E.est - E.ouest), lat = E.nord - (py + 0.5) / h * (E.nord - E.sud);
    const [x, z] = R.xz(lat, lon), k = E.poids(x, z);
    if (k >= 1) continue;
    const fx = Math.min(wm - 1.001, Math.max(0, (lon - R.ouest) / (R.est - R.ouest) * wm - 0.5));
    const fy = Math.min(hm - 1.001, Math.max(0, (R.nord - lat) / (R.nord - R.sud) * hm - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, i = (py * w + px) * 4;
    for (let c = 0; c < 3; c++) {
      const q = (yy, xx) => m[(yy * wm + xx) * 4 + c];
      const v = (q(y0, x0) * (1 - tx) + q(y0, x0 + 1) * tx) * (1 - ty) + (q(y0 + 1, x0) * (1 - tx) + q(y0 + 1, x0 + 1) * tx) * ty;
      d[i + c] = d[i + c] * k + v * (1 - k);
    }
  }
  a.ctx.putImageData(a.img, 0, 0);
  return a.cv;
}

function texture(source, renderer) {
  const t = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

// Maillage en grille : un sommet par pixel du relief (ou un sur « pas »).
// Les cases recouvertes par un encart (trous, en indices de la grille) ne sont pas dessinées.
function maillage(R, pas, trous = []) {
  const W = R.W, H = R.H;
  const nx = Math.floor((W - 1) / pas) + 1, nz = Math.floor((H - 1) / pas) + 1;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const c = i * pas, r = j * pas, v = j * nx + i;
    const [x, z] = R.xz(R.latLig(r), R.lonCol(c));
    pos[v * 3] = x; pos[v * 3 + 1] = R.sommet(c, r) * R.exag; pos[v * 3 + 2] = z;
    uv[v * 2] = R.encart ? c / (W - 1) : (c + 0.5) / W;
    uv[v * 2 + 1] = 1 - (R.encart ? r / (H - 1) : (r + 0.5) / H);
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = i * pas, r = j * pas;
    if (trous.some((t) => c >= t.c0 && c + pas <= t.c1 && r >= t.r0 && r + pas <= t.r1)) continue;
    const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.computeVertexNormals();
  return { g, nx, nz, pos };
}

// Parois du socle, sous le bord du terrain.
function parois({ nx, nz, pos }) {
  const bords = [
    Array.from({ length: nx }, (_, i) => i),                              // nord
    Array.from({ length: nz }, (_, j) => j * nx + nx - 1),                // est
    Array.from({ length: nx }, (_, i) => (nz - 1) * nx + nx - 1 - i),     // sud
    Array.from({ length: nz }, (_, j) => (nz - 1 - j) * nx),              // ouest
  ];
  const p = [];
  for (const b of bords) for (let k = 0; k < b.length - 1; k++) {
    const A = b[k] * 3, B = b[k + 1] * 3;
    const ax = pos[A], ay = pos[A + 1], az = pos[A + 2], bx = pos[B], by = pos[B + 1], bz = pos[B + 2];
    p.push(ax, ay, az, ax, SOCLE, az, bx, by, bz, bx, by, bz, ax, SOCLE, az, bx, SOCLE, bz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.computeVertexNormals();
  return g;
}

export async function creerTerrain(RR, { renderer, pas = 1, oasis = [] }) {
  const R = RR.R, groupe = new THREE.Group();
  R.pasMaillage = pas;
  RR.encarts.forEach((E) => E.fondre(R));
  const m = maillage(R, pas, RR.encarts.map((E) => E.meta.grille_hijaz));
  const image = await chargerImage(`data/relief/${R.meta.satellite.fichier}`);
  const style = styliser(R, image, oasis);
  const materiaux = [];
  const habillages = [];
  function poser(geo, texStyle, texSat) {
    const mat = new THREE.MeshStandardMaterial({ map: texStyle, flatShading: true, roughness: 1, metalness: 0 });
    const sol = new THREE.Mesh(geo, mat);
    sol.castShadow = sol.receiveShadow = true;
    groupe.add(sol);
    materiaux.push(mat);
    habillages.push((satellite) => { mat.map = satellite ? texSat : texStyle; mat.needsUpdate = true; });
  }
  poser(m.g, texture(style.cv, renderer), texture(image, renderer));

  // Encarts détaillés, textures fondues dans celles du Hijaz près des bords.
  const styleHijaz = pixels(style.cv), satHijaz = pixels(image);
  for (const E of RR.encarts) {
    const img = await chargerImage(`data/relief/${E.meta.satellite.fichier}`);
    const st = styliser(E, img, oasis, style);
    poser(maillage(E, 1).g, texture(fondreTexture(E, R, st.cv, styleHijaz), renderer), texture(fondreTexture(E, R, img, satHijaz), renderer));
  }

  const matParoi = new THREE.MeshStandardMaterial({ color: 0xB79770, roughness: 1, side: THREE.DoubleSide });
  const paroi = new THREE.Mesh(parois(m), matParoi);
  paroi.receiveShadow = true;
  groupe.add(paroi);

  // Mer : volume d'eau transparent au-dessus des fonds stylisés.
  const b = R.bornes, e = 0.05;
  const eauGeo = new THREE.BoxGeometry(b.x1 - b.x0 - 2 * e, -SOCLE - 0.3, b.z1 - b.z0 - 2 * e);
  eauGeo.translate((b.x0 + b.x1) / 2, (SOCLE + 0.3) / 2 - 0.004, (b.z0 + b.z1) / 2);
  const matEau = new THREE.MeshStandardMaterial({ color: 0x4FAFC6, transparent: true, opacity: 0.72, roughness: 0.2, metalness: 0.05, depthWrite: false });
  const eau = new THREE.Mesh(eauGeo, matEau);
  eau.renderOrder = 2;
  groupe.add(eau);

  return {
    groupe, materiaux, matParoi, matEau,
    habillage(satellite) { habillages.forEach((f) => f(satellite)); },
  };
}
