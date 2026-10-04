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

// Position (scène) du sommet (colonne c, ligne r) de la grille.
function sommet(R, c, r) {
  const [x, z] = R.xz(R.latLig(r), R.lonCol(c));
  return [x, R.sommet(c, r) * R.exag, z];
}

// Morceau de maillage : sommets (i0..i1, j0..j1) de la grille, un sur « pas » pixels.
// Les normales viennent du relief lui-même (et non des triangles du morceau) : deux tuiles
// voisines ont donc exactement les mêmes normales sur leur bord commun, sans couture visible.
// Les cases recouvertes par un encart (trous, en indices de la grille) ne sont pas dessinées.
function maillage(R, pas, trous, i0, j0, i1, j1) {
  const W = R.W, H = R.H, nx = i1 - i0 + 1, n = nx * (j1 - j0 + 1);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const derniere = (k, max) => Math.min(max, Math.max(0, k));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = i * pas, r = j * pas, v = (j - j0) * nx + (i - i0);
    const p = sommet(R, c, r);
    pos.set(p, v * 3);
    const ca = derniere(c - pas, (W - 1) - (W - 1) % pas), cb = derniere(c + pas, (W - 1) - (W - 1) % pas);
    const ra = derniere(r - pas, (H - 1) - (H - 1) % pas), rb = derniere(r + pas, (H - 1) - (H - 1) % pas);
    const A = sommet(R, ca, r), B = sommet(R, cb, r), C = sommet(R, c, ra), Dd = sommet(R, c, rb);
    const gx = (B[1] - A[1]) / Math.max(1e-6, B[0] - A[0]), gz = (Dd[1] - C[1]) / Math.max(1e-6, Dd[2] - C[2]);
    const l = Math.hypot(gx, 1, gz);
    nor[v * 3] = -gx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -gz / l;
    uv[v * 2] = R.encart ? c / (W - 1) : (c + 0.5) / W;
    uv[v * 2 + 1] = 1 - (R.encart ? r / (H - 1) : (r + 0.5) / H);
  }
  const idx = [];
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const c = i * pas, r = j * pas;
    if (trous.some((t) => c >= t.c0 && c + pas <= t.c1 && r >= t.r0 && r + pas <= t.r1)) continue;
    const a = (j - j0) * nx + (i - i0), b = a + 1, cc = a + nx, d = cc + 1;
    idx.push(a, cc, b, b, cc, d);
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

// Tuiles du maillage : seules celles qui sont à l'écran sont dessinées.
function tuiles(R, pas, trous, taille = 64) {
  const nx = Math.floor((R.W - 1) / pas), nz = Math.floor((R.H - 1) / pas), out = [];
  for (let j = 0; j < nz; j += taille) for (let i = 0; i < nx; i += taille) {
    const g = maillage(R, pas, trous, i, j, Math.min(nx, i + taille), Math.min(nz, j + taille));
    if (g) out.push(g);
  }
  return out;
}

// Parois du socle, sous le bord du terrain.
function parois(R, pas) {
  const cMax = (R.W - 1) - (R.W - 1) % pas, rMax = (R.H - 1) - (R.H - 1) % pas;
  const pasDe = (max) => Array.from({ length: max / pas + 1 }, (_, k) => k * pas);
  const bords = [
    pasDe(cMax).map((c) => [c, 0]), pasDe(rMax).map((r) => [cMax, r]),
    pasDe(cMax).reverse().map((c) => [c, rMax]), pasDe(rMax).reverse().map((r) => [0, r]),
  ];
  const p = [];
  for (const bord of bords) for (let k = 0; k < bord.length - 1; k++) {
    const [ax, ay, az] = sommet(R, ...bord[k]), [bx, by, bz] = sommet(R, ...bord[k + 1]);
    p.push(ax, ay, az, ax, SOCLE, az, bx, by, bz, bx, by, bz, ax, SOCLE, az, bx, SOCLE, bz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.computeVertexNormals();
  return g;
}

// Grain du sol, visible de près : bruit périodique (mosaïque sans couture) en coordonnées du monde.
function texturGrain() {
  const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(n, n);
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const bruitP = (x, y, p) => { // bruit de valeur dont le réseau se répète tous les « p » nœuds
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const q = (a, b) => h(((a % p) + p) % p, ((b % p) + p) % p);
    return (q(xi, yi) * (1 - u) + q(xi + 1, yi) * u) * (1 - v) + (q(xi, yi + 1) * (1 - u) + q(xi + 1, yi + 1) * u) * v;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0, a = 0.5;
    for (const p of [8, 16, 32, 64]) { s += a * bruitP(x / n * p, y / n * p, p); a *= 0.5; }
    const k = (y * n + x) * 4, g = Math.max(0, Math.min(255, Math.round(150 + (s - 0.47) * 190)));
    img.data[k] = img.data[k + 1] = img.data[k + 2] = g; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export async function creerTerrain(RR, { renderer, pas = 1, oasis = [] }) {
  const R = RR.R, groupe = new THREE.Group();
  R.pasMaillage = pas;
  RR.encarts.forEach((E) => E.fondre(R));
  const image = await chargerImage(`data/relief/${R.meta.satellite.fichier}`);
  const style = styliser(R, image, oasis);
  const grain = texturGrain();
  const materiaux = [], habillages = [];
  function poser(geos, texStyle, texSat) {
    const mat = new THREE.MeshStandardMaterial({ map: texStyle, flatShading: true, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.grain = { value: grain };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMonde;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMonde;\nuniform sampler2D grain;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float dGrain = length(vMonde - cameraPosition);
          if (dGrain < 9.0) {
            float g = texture2D(grain, vMonde.xz * 9.0).r * 0.6 + texture2D(grain, vMonde.xz * 41.0).r * 0.4;
            diffuseColor.rgb *= mix(1.0, 0.72 + g * 0.5, 1.0 - smoothstep(1.5, 9.0, dGrain));
          }`);
    };
    for (const geo of geos) {
      const sol = new THREE.Mesh(geo, mat);
      sol.receiveShadow = true; // le relief ne projette pas d'ombre (trop coûteux), les objets si
      groupe.add(sol);
    }
    materiaux.push(mat);
    habillages.push((satellite) => { mat.map = satellite ? texSat : texStyle; mat.needsUpdate = true; });
  }
  poser(tuiles(R, pas, RR.encarts.map((E) => E.meta.grille_hijaz)), texture(style.cv, renderer), texture(image, renderer));

  // Encarts détaillés, textures fondues dans celles du Hijaz près des bords.
  const styleHijaz = pixels(style.cv), satHijaz = pixels(image);
  for (const E of RR.encarts) {
    const img = await chargerImage(`data/relief/${E.meta.satellite.fichier}`);
    const st = styliser(E, img, oasis, style);
    poser(tuiles(E, 1, [], 64), texture(fondreTexture(E, R, st.cv, styleHijaz), renderer), texture(fondreTexture(E, R, img, satHijaz), renderer));
  }

  const matParoi = new THREE.MeshStandardMaterial({ color: 0xB79770, roughness: 1, side: THREE.DoubleSide });
  const paroi = new THREE.Mesh(parois(R, pas), matParoi);
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
    groupe, materiaux, matParoi, matEau, apercu: style.cv,
    habillage(satellite) { habillages.forEach((f) => f(satellite)); },
  };
}
