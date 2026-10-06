// Terrain : maillage du relief réel, socle de maquette, mer.
// Habillage « carte » : la couleur vient du relief lui-même (teintes d'altitude, roche sur les
// pentes, courbes de niveau), plus deux zones tirées de l'image satellite et nettoyées : les champs
// de lave (harrât) et les oasis. Habillage « satellite » : l'image Sentinel-2 brute (aujourd'hui).
import * as THREE from 'three';

const SOCLE = -7; // fond de la maquette (unités de scène)

// Teintes d'altitude (mètres) : sable clair des plaines côtières jusqu'au brun des hauts plateaux.
const PALIERS = [0, 120, 350, 650, 950, 1300, 1800, 2400];
const TEINTES = ['#F2E7C9', '#EAD9AF', '#DFC896', '#D3B47E', '#C5A06C', '#B38D61', '#9F7C5A', '#8C6E57'];
const COULEURS = { roche: '#9A7354', rocheSombre: '#7A5E4A', basalte: '#5A4D46', vert: '#7E9E50', rivage: '#F4EBD2', sable: '#E6D0A2', merHaut: '#9FDCD3', merFond: '#2A5F7A' };

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

async function chargerImage(url) {
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob);
}

// Flou en boîte séparable sur un tableau de flottants.
function flou(v, w, h, r) {
  const t = new Float32Array(v.length);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += v[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { t[y * w + x] = s / (2 * r + 1); s += v[y * w + Math.min(w - 1, x + r + 1)] - v[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { v[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  return v;
}

// Grands champs de lave (harrât) de l'emprise, en ellipses approximatives aux bords irréguliers : hors de
// ces régions, une zone sombre de l'image satellite (granite patiné, par exemple autour de Tâ'if) n'est pas
// prise pour de la lave.
const REGIONS_HARRA = [
  { nom: 'Harrat Rahat', lat: 23.2, lon: 39.95, rlat: 1.55, rlon: 0.75 },
  { nom: 'Harrat Khaybar et Ithnayn', lat: 25.7, lon: 40.1, rlat: 0.95, rlon: 0.95 },
  { nom: 'Harrat Lunayyir', lat: 25.3, lon: 37.85, rlat: 0.45, rlon: 0.4 },
  { nom: "Harrat 'Uwayrid", lat: 26.3, lon: 37.6, rlat: 0.6, rlon: 0.9 },
];
function dansHarra(lat, lon) {
  let v = 0;
  for (const z of REGIONS_HARRA) {
    const dy = (lat - z.lat) / z.rlat, dx = (lon - z.lon) / z.rlon, a = Math.atan2(dy, dx);
    const d = Math.hypot(dx, dy) * (1 + 0.08 * Math.sin(a * 5 + z.lat) + 0.05 * Math.sin(a * 11 + z.lon));
    v = Math.max(v, 1 - lisse(0.75, 1.05, d));
  }
  return v;
}

// Masque des zones : rouge = champs de lave (zones sombres et peu pentues de l'image satellite, dans les
// régions de harrât, lissées puis seuillées pour des contours francs), vert = oasis historiques.
function masqueZones(R, image, oasis, harrat = []) {
  const w = image.width, h = image.height, f = w / R.W;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const alt = (px, py) => R.metresPixel((px + 0.5) / f - 0.5, (py + 0.5) / f - 0.5);
  const hist = new Uint32Array(256); let n = 0;
  for (let py = 0; py < h; py += 3) for (let px = 0; px < w; px += 3) {
    if (alt(px, py) <= 0) continue;
    const k = (py * w + px) * 4; hist[Math.round(0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2])]++; n++;
  }
  const centile = (p) => { let s = 0; for (let i = 0; i < 256; i++) { s += hist[i]; if (s >= n * p) return i; } return 255; };
  const lo = centile(0.03), hi = centile(0.97);
  const kmPx = R.pas * R.kz / f, lave = new Float32Array(w * h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const m = alt(px, py); if (m <= 0) continue;
    const k = (py * w + px) * 4, L = (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2] - lo) / (hi - lo);
    const pente = Math.hypot(alt(px + 1, py) - alt(px - 1, py), alt(px, py + 1) - alt(px, py - 1)) / (2 * kmPx);
    lave[py * w + px] = (1 - lisse(0.16, 0.30, L)) * (1 - lisse(90, 220, pente)) * dansHarra(R.nord - (py + 0.5) / f * R.pas, R.ouest + (px + 0.5) / f * R.pas);
  }
  flou(flou(lave, w, h, 3), w, h, 3);
  const zones = oasis.map((o) => ({ px: (o.lon - R.ouest) / R.pas * f, py: (R.nord - o.lat) / R.pas * f, r: o.rayon / (R.pas * R.kz) * f }));
  // champs de lave dessinés à la main (ellipses aux bords irréguliers)
  const laves = harrat.map((o) => ({ px: (o.lon - R.ouest) / R.pas * f, py: (R.nord - o.lat) / R.pas * f, rx: o.rx / (R.pas * R.kx) * f, rz: o.rz / (R.pas * R.kz) * f }));
  for (const z of laves) {
    for (let py = Math.floor(z.py - z.rz * 1.3); py <= z.py + z.rz * 1.3; py++) for (let px = Math.floor(z.px - z.rx * 1.3); px <= z.px + z.rx * 1.3; px++) {
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const dx = (px - z.px) / z.rx, dy = (py - z.py) / z.rz, a = Math.atan2(dy, dx);
      const dd = Math.hypot(dx, dy) * (1 + 0.1 * Math.sin(a * 5 + z.px) + 0.05 * Math.sin(a * 13 + z.py));
      const i = py * w + px;
      lave[i] = Math.max(lave[i], 1 - lisse(0.8, 1.05, dd));
    }
  }
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const k = (py * w + px) * 4;
    let v = 0;
    for (const z of zones) { const dd = Math.hypot(px - z.px, py - z.py); if (dd < z.r) v = Math.max(v, (1 - lisse(z.r * 0.55, z.r, dd)) * 0.85); }
    d[k] = Math.round(lisse(0.33, 0.6, lave[py * w + px]) * 255); d[k + 1] = Math.round(v * 255); d[k + 2] = 0; d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// Même calcul de couleur qu'au shader, en petit, pour la mini-carte (avec un estompage du relief).
function apercuCarte(R, masque, l = 150, h = 236) {
  const cv = document.createElement('canvas'); cv.width = l; cv.height = h;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(l, h);
  const mq = masque.getContext('2d').getImageData(0, 0, masque.width, masque.height).data;
  const T = TEINTES.map(hexRgb), C = Object.fromEntries(Object.entries(COULEURS).map(([k, v]) => [k, hexRgb(v)]));
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    const c = (x + 0.5) / l * R.W - 0.5, r = (y + 0.5) / h * R.H - 0.5, m = R.metresPixel(c, r);
    let col;
    if (m <= 0) col = mix(C.merHaut, C.merFond, lisse(0, 600, -m));
    else {
      col = T[0]; for (let i = 1; i < T.length; i++) col = mix(col, T[i], lisse(PALIERS[i - 1], PALIERS[i], m));
      const mi = (Math.floor((y + 0.5) / h * masque.height) * masque.width + Math.floor((x + 0.5) / l * masque.width)) * 4;
      col = mix(col, C.basalte, mq[mi] / 255); col = mix(col, C.vert, mq[mi + 1] / 255);
      const ombre = 0.82 + Math.max(-0.3, Math.min(0.3, (R.metresPixel(c - 2, r - 2) - R.metresPixel(c + 2, r + 2)) / 900));
      col = col.map((v) => v * ombre);
    }
    const k = (y * l + x) * 4; img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
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

// ---------- normales et occlusion, précalculées ----------
// Pour chaque relief, une texture RGBA : normale du sol (exagération comprise) en RGB, occlusion ambiante
// en alpha (fonds de vallée assombris, d'après l'écart à l'altitude moyenne des alentours, à trois échelles).
// Elle est échantillonnée « facteur » fois plus finement que la grille, et lue avec filtrage : l'éclairage
// est lisse, sans facettes, quelle que soit la finesse du maillage affiché.
function champSol(Rl, metres, facteur) {
  const F = facteur, nw = (Rl.W - 1) * F + 1, nh = (Rl.H - 1) * F + 1, km = Math.max(Rl.bx, Rl.bz) / F;
  const ECHELLES = [0.7, 2.4, 8]; // km
  const P = Math.ceil(ECHELLES[2] / km) + 2, lw = nw + 2 * P, lh = nh + 2 * P;
  const h = new Float32Array(lw * lh);
  for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
    const c = (i - P) / F, r = (j - P) / F;
    h[j * lw + i] = metres(Rl.ax + Rl.bx * c, Rl.az + Rl.bz * r);
  }
  const occl = new Float32Array(nw * nh).fill(1);
  ECHELLES.forEach((e, k) => {
    const b = flou(Float32Array.from(h), lw, lh, Math.max(1, Math.round(e / km / 1.7)));
    const poids = [0.3, 0.35, 0.3][k];
    for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
      const q = (j + P) * lw + i + P, d = (b[q] - h[q]) * Rl.exag / e;
      occl[j * nw + i] -= poids * lisse(0, 0.45, d);
    }
  });
  const data = new Uint8Array(nw * nh * 4), ex = Rl.exag, dx = 2 * Rl.bx / F, dz = 2 * Rl.bz / F;
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
    const q = (j + P) * lw + i + P;
    const gx = (h[q + 1] - h[q - 1]) * ex / dx, gz = (h[q + lw] - h[q - lw]) * ex / dz, l = Math.hypot(gx, 1, gz);
    const k = (j * nw + i) * 4, mer = h[q] <= 0;
    data[k] = Math.round((-gx / l * 0.5 + 0.5) * 255); data[k + 1] = Math.round((1 / l * 0.5 + 0.5) * 255);
    data[k + 2] = Math.round((-gz / l * 0.5 + 0.5) * 255); data[k + 3] = Math.round((mer ? 1 : Math.max(0.2, occl[j * nw + i])) * 255);
  }
  const t = new THREE.DataTexture(data, nw, nh, THREE.RGBAFormat);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return { texture: t, dims: new THREE.Vector2(nw, nh) };
}

// Altitudes de la grille, lues point par point (texelFetch) par le shader pour l'interpolation cubique ;
// et une copie en demi-flottants, filtrée, pour la couleur du sol (teintes, rivage, courbes de niveau) :
// elle ne dépend pas de la finesse des tuiles, si bien qu'une tuile lointaine et grossière garde un rivage net.
function texHauteurs(Rl) {
  const t = new THREE.DataTexture(Float32Array.from(Rl.grille()), Rl.W, Rl.H, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
// La copie servant aux couleurs est légèrement lissée : sur une grille de 600 m, le rivage et les teintes
// d'altitude dessineraient sinon des carrés (cases de la grille).
function texAltitudes(Rl, rayon) {
  const g = flou(flou(Float32Array.from(Rl.grille()), Rl.W, Rl.H, rayon), Rl.W, Rl.H, rayon), d = new Uint16Array(g.length);
  for (let k = 0; k < g.length; k++) d[k] = THREE.DataUtils.toHalfFloat(g[k]);
  const t = new THREE.DataTexture(d, Rl.W, Rl.H, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// ---------- tuiles à niveaux de détail ----------
// Toutes les tuiles partagent une même grille de N × N cases ; le shader la place (origine et taille
// en cases de la grille du relief) et lui donne son altitude. Un arbre quaternaire choisit, à chaque
// image, des tuiles d'autant plus fines qu'elles sont proches de la caméra. Une « jupe » (bord replié
// vers le bas) masque les fentes entre deux tuiles de finesses différentes.
const N = 32, MAX_TUILES = 2500;
function grilleTuile() {
  const pos = [], jupe = [], idx = [], bord = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { pos.push(i / N, 0, j / N); jupe.push(0); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // contour (dans l'ordre) et sa copie abaissée ; triangles dans les deux sens (visibles de part et d'autre)
  for (let i = 0; i < N; i++) bord.push(i);
  for (let j = 0; j < N; j++) bord.push(j * (N + 1) + N);
  for (let i = N; i > 0; i--) bord.push(N * (N + 1) + i);
  for (let j = N; j > 0; j--) bord.push(j * (N + 1));
  const n0 = pos.length / 3;
  bord.forEach((v) => { pos.push(pos[v * 3], 0, pos[v * 3 + 2]); jupe.push(1); });
  for (let k = 0; k < bord.length; k++) {
    const a = bord[k], b = bord[(k + 1) % bord.length], sa = n0 + k, sb = n0 + (k + 1) % bord.length;
    idx.push(a, b, sa, b, sb, sa, a, sa, b, b, sa, sb);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('jupe', new THREE.Float32BufferAttribute(jupe, 1));
  g.setIndex(idx);
  return g;
}

class Arbre {
  constructor(Rl, { pasMin, K, pasRivage, trous = [] }) {
    this.R = Rl; this.pasMin = pasMin; this.K = K; this.pasRivage = pasRivage; this.trous = trous;
    this.S = 2 ** Math.ceil(Math.log2(Math.max(Rl.W - 1, Rl.H - 1)));
    this.memo = new Map(); this.boite = new THREE.Box3();
  }
  // Altitudes extrêmes (m) des points de la grille couverts par un nœud.
  extremes(c0, r0, s) {
    const cle = `${c0},${r0},${s}`, m = this.memo.get(cle);
    if (m) return m;
    const Rl = this.R, W = Rl.W, H = Rl.H, g = Rl.grille();
    let lo = Infinity, hi = -Infinity;
    if (s <= 16) {
      for (let r = r0; r <= Math.min(H - 1, r0 + s); r++) for (let c = c0; c <= Math.min(W - 1, c0 + s); c++) { const v = g[r * W + c]; if (v < lo) lo = v; if (v > hi) hi = v; }
    } else {
      const d = s / 2;
      for (const [a, b] of [[0, 0], [d, 0], [0, d], [d, d]]) {
        if (c0 + a > W - 1 || r0 + b > H - 1) continue;
        const [l, h] = this.extremes(c0 + a, r0 + b, d); lo = Math.min(lo, l); hi = Math.max(hi, h);
      }
    }
    const v = [lo, hi]; this.memo.set(cle, v);
    return v;
  }
  choisir(cam, frustum, sortie) {
    this.cam = cam; this.frustum = frustum; this.sortie = sortie;
    this.visiter(0, 0, this.S);
  }
  visiter(c0, r0, s) {
    const Rl = this.R, W = Rl.W, H = Rl.H;
    if (c0 >= W - 1 || r0 >= H - 1 || this.sortie.length >= MAX_TUILES * 3) return;
    const c1 = Math.min(W - 1, c0 + s), r1 = Math.min(H - 1, r0 + s);
    const x0 = Rl.ax + Rl.bx * c0, x1 = Rl.ax + Rl.bx * c1, z0 = Rl.az + Rl.bz * r0, z1 = Rl.az + Rl.bz * r1;
    if (this.trous.some((t) => x0 >= t.x0 && x1 <= t.x1 && z0 >= t.z0 && z1 <= t.z1)) return; // entièrement couvert par un encart
    const [lo, hi] = this.extremes(c0, r0, s), marge = (hi - lo) * 0.08 + 5, pasMonde = s / N * Math.max(Rl.bx, Rl.bz);
    const b = this.boite;
    b.min.set(x0, Math.max(-7, (lo - marge) * Rl.exag - pasMonde * 0.6), z0); b.max.set(x1, (hi + marge) * Rl.exag, z1);
    if (!this.frustum.intersectsBox(b)) return;
    const taille = s * Math.max(Rl.bx, Rl.bz);
    // le rivage (une tuile à cheval sur le niveau de la mer) est toujours affiné : sinon la surface de l'eau
    // couperait des triangles trop grands et le littoral prendrait une allure en escalier
    const rivage = lo < 0 && hi > 0 && s / N > this.pasRivage;
    if (s / N > this.pasMin && (rivage || b.distanceToPoint(this.cam) < this.K * taille)) {
      const d = s / 2;
      this.visiter(c0, r0, d); this.visiter(c0 + d, r0, d); this.visiter(c0, r0 + d, d); this.visiter(c0 + d, r0 + d, d);
    } else this.sortie.push(c0, r0, s);
  }
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

// Parois du socle, sous le bord du terrain (le bord suit l'interpolation cubique).
function parois(R) {
  const W = R.W, H = R.H, n = 4, pts = [];
  const bord = (c, r) => [R.ax + R.bx * c, R.metres(R.ax + R.bx * c, R.az + R.bz * r) * R.exag, R.az + R.bz * r];
  for (let k = 0; k <= (W - 1) * n; k++) pts.push(bord(k / n, 0));
  for (let k = 1; k <= (H - 1) * n; k++) pts.push(bord(W - 1, k / n));
  for (let k = (W - 1) * n - 1; k >= 0; k--) pts.push(bord(k / n, H - 1));
  for (let k = (H - 1) * n - 1; k >= 0; k--) pts.push(bord(0, k / n));
  const p = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay, az] = pts[k], [bx, by, bz] = pts[k + 1];
    p.push(ax, ay, az, ax, SOCLE, az, bx, by, bz, bx, by, bz, ax, SOCLE, az, bx, SOCLE, bz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.computeVertexNormals();
  return g;
}

const VERTEX = `
  attribute vec4 tuile; attribute float jupe;
  uniform sampler2D hauteurs; uniform vec2 dims; uniform vec4 geo; uniform float exag, lissage, pasTuile;
  varying vec3 vMonde; varying vec2 vGrille;
  vec4 poidsCubiques(float t) {
    float t2 = t * t, t3 = t2 * t, u = 1.0 - t;
    vec4 cr = 0.5 * vec4(-t3 + 2.0 * t2 - t, 3.0 * t3 - 5.0 * t2 + 2.0, -3.0 * t3 + 4.0 * t2 + t, t3 - t2);
    vec4 bs = vec4(u * u * u, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
    return mix(cr, bs, lissage);
  }
  float hauteurGrille(vec2 g) {
    ivec2 n = ivec2(dims);
    vec2 i0 = min(floor(g), dims - 2.0), t = g - i0;
    vec4 wx = poidsCubiques(t.x), wz = poidsCubiques(t.y);
    int c = int(i0.x), r = int(i0.y);
    float s = 0.0;
    for (int j = 0; j < 4; j++) {
      int rr = clamp(r - 1 + j, 0, n.y - 1);
      vec4 l = vec4(texelFetch(hauteurs, ivec2(clamp(c - 1, 0, n.x - 1), rr), 0).r, texelFetch(hauteurs, ivec2(c, rr), 0).r,
                    texelFetch(hauteurs, ivec2(c + 1, rr), 0).r, texelFetch(hauteurs, ivec2(clamp(c + 2, 0, n.x - 1), rr), 0).r);
      s += wz[j] * dot(wx, l);
    }
    return s;
  }`;

export async function creerTerrain(RR, { renderer, mobile = false, oasis = [], harrat = [] }) {
  const R = RR.R, groupe = new THREE.Group();
  const image = await chargerImage(`data/relief/${R.meta.satellite.fichier}`);
  const masque = masqueZones(R, image, oasis, harrat);
  const texMasque = new THREE.CanvasTexture(masque);
  texMasque.flipY = false; // ligne 0 du masque = bord nord, comme z croissant vers le sud
  const grain = texturGrain();
  const b = R.bornes;
  const lin = (hex) => new THREE.Color(hex); // converti en linéaire pour le shader
  // Trous de la carte générale sous les encarts, un peu plus petits que les encarts : sur une bande de
  // recouvrement, les deux surfaces sont dessinées (l'encart l'emporte à égalité), si bien qu'aucune fente
  // n'apparaît quand la carte générale, au loin, est dessinée plus grossièrement que l'encart voisin.
  const RECOUVREMENT = 0.7; // km
  const trous = RR.encarts.map((E) => ({ x0: E.bornes.x0 + RECOUVREMENT, x1: E.bornes.x1 - RECOUVREMENT, z0: E.bornes.z0 + RECOUVREMENT, z1: E.bornes.z1 - RECOUVREMENT }));
  const communs = {
    masque: { value: texMasque }, grain: { value: grain }, exag: { value: R.exag },
    emprise: { value: new THREE.Vector4(b.x0, b.z0, b.x1, b.z1) },
    paliers: { value: PALIERS }, teintes: { value: TEINTES.map(lin) },
    trous: { value: trous.map((t) => new THREE.Vector4(t.x0, t.z0, t.x1, t.z1)) },
    ...Object.fromEntries(Object.entries(COULEURS).map(([k, v]) => ['c_' + k, { value: lin(v) }])),
  };
  const base = grilleTuile();
  const materiaux = [], habillages = [], couches = [];

  const altHijaz = texAltitudes(R, 1);
  function poser(Rl, texSat, { trou, facteur }) {
    const champ = champSol(Rl, (x, z) => RR.metres(x, z), facteur);
    const uniformes = {
      ...communs, hauteurs: { value: texHauteurs(Rl) }, altitudes: { value: Rl === R ? altHijaz : texAltitudes(Rl, 3) }, dims: { value: new THREE.Vector2(Rl.W, Rl.H) },
      geo: { value: new THREE.Vector4(Rl.ax, Rl.bx, Rl.az, Rl.bz) }, lissage: { value: Rl.lissage },
      pasTuile: { value: Math.max(Rl.bx, Rl.bz) / N },
      normales: { value: champ.texture }, dimsN: { value: champ.dims }, facteurN: { value: facteur },
      sat: { value: texSat },
      uvSat: { value: Rl.encart ? new THREE.Vector4(0, 1 / (Rl.W - 1), 1, -1 / (Rl.H - 1)) : new THREE.Vector4(0.5 / Rl.W, 1 / Rl.W, 1 - 0.5 / Rl.H, -1 / Rl.H) },
    };
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    if (trou) Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 });
    const fixes = trou ? { TROUS: trous.length, BORD_EXT: '' } : {};
    mat.defines = { STYLE: '', ...fixes };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniformes);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERTEX)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
          vec2 g = clamp(tuile.xy + position.xz * tuile.z, vec2(0.0), dims - 1.0);
          vec3 transformed = vec3(geo.x + geo.y * g.x, hauteurGrille(g) * exag, geo.z + geo.w * g.y);
          // jupe : abaissée sous les fentes possibles, sauf au bord extérieur de la carte (contre les parois du socle)
          #ifdef BORD_EXT
          bool bordExt = g.x <= 0.0 || g.y <= 0.0 || g.x >= dims.x - 1.0 || g.y >= dims.y - 1.0;
          #else
          bool bordExt = false;
          #endif
          if (jupe > 0.5 && !bordExt) transformed.y = max(-6.9, transformed.y - tuile.z * pasTuile * 0.6 - 0.004);
          vGrille = g; vMonde = transformed;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vMonde; varying vec2 vGrille;
          uniform sampler2D masque, grain, normales, sat, altitudes; uniform vec4 emprise, uvSat; uniform vec2 dimsN, dims; uniform float exag, facteurN;
          uniform float paliers[8]; uniform vec3 teintes[8];
          uniform vec3 c_roche, c_rocheSombre, c_basalte, c_vert, c_rivage, c_sable, c_merHaut, c_merFond;
          #ifdef TROUS
          uniform vec4 trous[TROUS];
          #endif
          // trait d'une courbe de niveau, d'épaisseur constante à l'écran, effacé quand les courbes se serrent
          float courbe(float v, float epaisseur) {
            float l = fwidth(v);
            return (1.0 - smoothstep(0.0, l * epaisseur, abs(fract(v - 0.5) - 0.5))) * (1.0 - smoothstep(0.14, 0.32, l));
          }`)
        .replace('#include <map_fragment>', `
          #ifdef TROUS
          for (int i = 0; i < TROUS; i++) { vec4 t = trous[i]; if (vMonde.x > t.x && vMonde.x < t.z && vMonde.z > t.y && vMonde.z < t.w) discard; }
          #endif
          vec4 nnSol = texture2D(normales, (vGrille * facteurN + 0.5) / dimsN);
          vec3 nSol = normalize(nnSol.xyz * 2.0 - 1.0);
          float aoSol = nnSol.a, dCam = length(vMonde - cameraPosition);
          // relief de détail (rochers, ravines) : bruit en coordonnées du monde, plus marqué sur les pentes
          float penteBase = 1.0 - nSol.y;
          vec2 pd = vMonde.xz * 1.1;
          float nd = texture2D(grain, pd).r, ndx = texture2D(grain, pd + vec2(0.004, 0.0)).r, ndz = texture2D(grain, pd + vec2(0.0, 0.004)).r;
          float ampD = (0.15 + 0.85 * smoothstep(0.05, 0.3, penteBase)) * (1.0 - smoothstep(6.0, 30.0, dCam));
          nSol = normalize(nSol + vec3(nd - ndx, 0.0, nd - ndz) * ampD * 10.0);
          if (dCam < 5.0) { // de près, un second grain plus fin (pierrailles)
            vec2 pf = vMonde.xz * 5.3;
            float nf = texture2D(grain, pf).r, nfx = texture2D(grain, pf + vec2(0.004, 0.0)).r, nfz = texture2D(grain, pf + vec2(0.0, 0.004)).r;
            nSol = normalize(nSol + vec3(nf - nfx, 0.0, nf - nfz) * ampD * 12.0 * (1.0 - smoothstep(1.0, 5.0, dCam)));
          }
          #ifdef STYLE
          {
            float m = texture2D(altitudes, (vGrille + 0.5) / dims).r // altitude (m), négative en mer
                    + (texture2D(grain, vMonde.xz * 0.35).r - 0.5) * 3.0;  // même rivage irrégulier que la surface de l'eau
            vec3 c;
            if (m <= 0.5) {
              c = mix(c_merHaut, c_merFond, smoothstep(0.0, 600.0, -m));
            } else {
              c = teintes[0];
              for (int i = 1; i < 8; i++) c = mix(c, teintes[i], smoothstep(paliers[i - 1], paliers[i], m));
              // variations lentes de teinte (sables plus clairs, plus ocres), pour casser l'uniformité
              float v = texture2D(grain, vMonde.xz * 0.013).r * 0.6 + texture2D(grain, vMonde.xz * 0.061).r * 0.4;
              c *= vec3(0.93, 0.94, 0.97) + vec3(0.14, 0.12, 0.07) * v;
              float pente = 1.0 - nSol.y;
              c = mix(c, c_roche * (0.93 + 0.14 * nd), smoothstep(0.08, 0.28, pente) * 0.8);
              c = mix(c, c_rocheSombre, smoothstep(0.28, 0.55, pente) * 0.8);
              // le sable s'accumule au fond des oueds : fonds plats et creux plus clairs
              c = mix(c, c_sable, (1.0 - smoothstep(0.03, 0.12, pente)) * smoothstep(0.98, 0.8, aoSol) * 0.3);
              vec4 z = texture2D(masque, (vMonde.xz - emprise.xy) / (emprise.zw - emprise.xy));
              // champs de lave : bord net et irrégulier, roche sombre et grenue
              float lave = smoothstep(0.3, 0.7, z.r + (nd - 0.5) * 0.35);
              c = mix(c, c_basalte * (0.9 + 0.2 * nd), lave * 0.85);
              c = mix(c, c_vert * (0.86 + 0.28 * nd), z.g * (0.7 + 0.3 * smoothstep(0.35, 0.65, nd)));
              c = mix(c, c_rivage, 1.0 - smoothstep(2.0, 14.0, m));
              // courbes de niveau discrètes, qui s'effacent quand on s'approche du sol
              float k = smoothstep(3.0, 30.0, dCam);
              c *= 1.0 - k * (0.10 * courbe(m / 100.0, 1.3) + 0.18 * courbe(m / 500.0, 1.8));
              c *= mix(0.5, 1.0, aoSol);
            }
            diffuseColor.rgb *= c;
          }
          #else
          diffuseColor.rgb *= texture2D(sat, vec2(uvSat.x + uvSat.y * vGrille.x, uvSat.z + uvSat.w * vGrille.y)).rgb;
          #endif
          // grain du sol, visible de près
          if (dCam < 9.0) {
            float gr = texture2D(grain, vMonde.xz * 9.0).r * 0.6 + texture2D(grain, vMonde.xz * 41.0).r * 0.4;
            diffuseColor.rgb *= mix(1.0, 0.88 + gr * 0.24, 1.0 - smoothstep(1.5, 9.0, dCam));
          }`)
        .replace('#include <normal_fragment_begin>', `
          float faceDirection = 1.0;
          vec3 normal = normalize((viewMatrix * vec4(nSol, 0.0)).xyz);
          vec3 nonPerturbedNormal = normal;`);
    };
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.getAttribute('position')); geo.setAttribute('jupe', base.getAttribute('jupe'));
    const tuiles = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TUILES * 4), 4);
    tuiles.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('tuile', tuiles); geo.instanceCount = 0;
    const sol = new THREE.Mesh(geo, mat);
    sol.frustumCulled = false;
    sol.receiveShadow = true; // le relief ne projette pas d'ombre, les objets si
    groupe.add(sol);
    materiaux.push(mat);
    habillages.push((satellite) => { mat.defines = { ...(satellite ? {} : { STYLE: '' }), ...fixes }; mat.needsUpdate = true; });
    couches.push({ arbre: new Arbre(Rl, { pasMin: mobile ? 0.5 : 0.25, K: mobile ? 2.8 : 4.2, pasRivage: mobile ? 2 : 1, trous: trou ? trous : [] }), tuiles, geo, sortie: [] });
  }
  // Carte générale (trouée là où sont les encarts), puis encarts détaillés ; en vue satellite, l'image d'un
  // encart est fondue dans celle du Hijaz près de ses bords.
  const satHijaz = pixels(image);
  poser(R, texture(satHijaz.cv, renderer), { trou: true, facteur: 1 });
  for (const E of RR.encarts) {
    const img = await chargerImage(`data/relief/${E.meta.satellite.fichier}`);
    poser(E, texture(fondreTexture(E, R, img, satHijaz), renderer), { trou: false, facteur: mobile ? 1 : 2 });
  }

  const matParoi = new THREE.MeshStandardMaterial({ color: 0xB79770, roughness: 1, side: THREE.DoubleSide });
  const paroi = new THREE.Mesh(parois(R), matParoi);
  paroi.receiveShadow = true;
  groupe.add(paroi);

  // Mer : volume d'eau transparent au-dessus des fonds.
  const e = 0.05;
  const eauGeo = new THREE.BoxGeometry(b.x1 - b.x0 - 2 * e, -SOCLE - 0.3, b.z1 - b.z0 - 2 * e);
  eauGeo.translate((b.x0 + b.x1) / 2, (SOCLE + 0.3) / 2 - 0.004, (b.z0 + b.z1) / 2);
  const matEau = new THREE.MeshStandardMaterial({ color: 0x4FAFC6, transparent: true, opacity: 0.6, roughness: 0.2, metalness: 0.05, depthWrite: false });
  // Surface de l'eau : le rivage suit l'altitude lissée de la grille (et non l'intersection du plan d'eau avec
  // les triangles du relief, qui dessinerait des marches), et l'eau s'éclaircit en approchant de la côte.
  const matSurface = matEau.clone();
  matSurface.color = matEau.color;
  matSurface.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { altE: { value: altHijaz }, grainE: { value: grain }, geoE: { value: new THREE.Vector4(R.ax, R.bx, R.az, R.bz) }, dimsE: { value: new THREE.Vector2(R.W, R.H) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMondeE;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMondeE = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMondeE; uniform sampler2D altE, grainE; uniform vec4 geoE; uniform vec2 dimsE;')
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        float mE = texture2D(altE, (vec2((vMondeE.x - geoE.x) / geoE.y, (vMondeE.z - geoE.z) / geoE.w) + 0.5) / dimsE).r
                 + (texture2D(grainE, vMondeE.xz * 0.35).r - 0.5) * 3.0; // rivage irrégulier
        if (mE > 0.0) discard;
        diffuseColor.a *= mix(0.25, 1.0, smoothstep(0.0, -25.0, mE));`);
  };
  const eau = new THREE.Mesh(eauGeo, [matEau, matEau, matSurface, matEau, matEau, matEau]);
  eau.renderOrder = 2;
  groupe.add(eau);

  // Choix des tuiles, à chaque image (seulement si la caméra a bougé).
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), derniere = new THREE.Matrix4(), cam = new THREE.Vector3();
  function maj(camera) {
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (pv.equals(derniere)) return;
    derniere.copy(pv);
    frustum.setFromProjectionMatrix(pv);
    camera.getWorldPosition(cam);
    for (const c of couches) {
      c.sortie.length = 0;
      c.arbre.choisir(cam, frustum, c.sortie);
      const n = c.sortie.length / 3, a = c.tuiles.array;
      for (let k = 0; k < n; k++) { a[k * 4] = c.sortie[k * 3]; a[k * 4 + 1] = c.sortie[k * 3 + 1]; a[k * 4 + 2] = c.sortie[k * 3 + 2]; a[k * 4 + 3] = 0; }
      c.tuiles.clearUpdateRanges(); c.tuiles.addUpdateRange(0, n * 4); c.tuiles.needsUpdate = true;
      c.geo.instanceCount = n;
    }
  }

  return {
    groupe, materiaux, matParoi, matEau, apercu: apercuCarte(R, masque), maj,
    habillage(satellite) { habillages.forEach((f) => f(satellite)); },
    tuiles: () => couches.reduce((s, c) => s + c.geo.instanceCount, 0),
  };
}

