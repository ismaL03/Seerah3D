// Terrain : maillage du relief réel, socle de maquette, mer.
// Habillage « carte » : la couleur vient du relief lui-même (teintes d'altitude, roche sur les
// pentes, courbes de niveau), plus deux zones tirées de l'image satellite et nettoyées : les champs
// de lave (harrât) et les oasis. Habillage « satellite » : l'image Sentinel-2 brute (aujourd'hui).
import * as THREE from 'three';

const SOCLE = -7; // fond de la maquette (unités de scène)

// Teintes d'altitude (mètres) : sable clair des plaines côtières jusqu'au brun des hauts plateaux.
const PALIERS = [0, 120, 350, 650, 950, 1300, 1800, 2400];
const TEINTES = ['#F2E7C9', '#EAD9AF', '#DFC896', '#D3B47E', '#C5A06C', '#B38D61', '#9F7C5A', '#8C6E57'];
const COULEURS = { roche: '#A47E5C', rocheSombre: '#7A5F4B', basalte: '#514843', vert: '#86A35A', rivage: '#F4EBD2', merHaut: '#9FDCD3', merFond: '#2A5F7A' };

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

// Masque des zones : rouge = champs de lave (zones sombres et peu pentues de l'image satellite,
// lissées puis seuillées pour des contours francs), vert = oasis historiques.
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
    lave[py * w + px] = (1 - lisse(0.16, 0.30, L)) * (1 - lisse(90, 220, pente));
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

export async function creerTerrain(RR, { renderer, pas = 1, oasis = [], harrat = [] }) {
  const R = RR.R, groupe = new THREE.Group();
  R.pasMaillage = pas;
  RR.encarts.forEach((E) => E.fondre(R));
  const image = await chargerImage(`data/relief/${R.meta.satellite.fichier}`);
  const masque = masqueZones(R, image, oasis, harrat);
  const texMasque = new THREE.CanvasTexture(masque);
  texMasque.flipY = false; // ligne 0 du masque = bord nord, comme z croissant vers le sud
  const grain = texturGrain();
  const b = R.bornes;
  const lin = (hex) => new THREE.Color(hex); // converti en linéaire pour le shader
  const uniformes = {
    masque: { value: texMasque }, grain: { value: grain }, exag: { value: R.exag },
    emprise: { value: new THREE.Vector4(b.x0, b.z0, b.x1, b.z1) },
    paliers: { value: PALIERS }, teintes: { value: TEINTES.map(lin) },
    ...Object.fromEntries(Object.entries(COULEURS).map(([k, v]) => ['c_' + k, { value: lin(v) }])),
  };
  const materiaux = [], habillages = [];
  function poser(geos, texSat) {
    const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, metalness: 0 });
    mat.defines = { STYLE: '' };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniformes);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMonde;\nvarying vec3 vNormMonde;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNormMonde = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vMonde; varying vec3 vNormMonde;
          uniform sampler2D masque; uniform sampler2D grain; uniform vec4 emprise; uniform float exag;
          uniform float paliers[8]; uniform vec3 teintes[8];
          uniform vec3 c_roche, c_rocheSombre, c_basalte, c_vert, c_rivage, c_merHaut, c_merFond;
          // trait d'une courbe de niveau, d'épaisseur constante à l'écran, effacé quand les courbes se serrent
          float courbe(float v, float epaisseur) {
            float l = fwidth(v);
            return (1.0 - smoothstep(0.0, l * epaisseur, abs(fract(v - 0.5) - 0.5))) * (1.0 - smoothstep(0.14, 0.32, l));
          }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          #ifdef STYLE
          {
            float m = vMonde.y / exag; // altitude (m), négative en mer
            vec3 c;
            if (m <= 0.5) {
              c = mix(c_merHaut, c_merFond, smoothstep(0.0, 600.0, -m));
            } else {
              c = teintes[0];
              for (int i = 1; i < 8; i++) c = mix(c, teintes[i], smoothstep(paliers[i - 1], paliers[i], m));
              float pente = 1.0 - normalize(vNormMonde).y;
              c = mix(c, c_roche, smoothstep(0.12, 0.32, pente) * 0.75);
              c = mix(c, c_rocheSombre, smoothstep(0.32, 0.55, pente) * 0.8);
              vec4 z = texture2D(masque, (vMonde.xz - emprise.xy) / (emprise.zw - emprise.xy));
              c = mix(c, c_basalte, z.r * 0.92);
              c = mix(c, c_vert, z.g);
              c = mix(c, c_rivage, 1.0 - smoothstep(2.0, 14.0, m));
              c *= 1.0 - 0.2 * courbe(m / 100.0, 1.5) - 0.32 * courbe(m / 500.0, 2.2);
            }
            diffuseColor.rgb *= c;
          }
          #endif
          float dGrain = length(vMonde - cameraPosition);
          if (dGrain < 9.0) {
            float g = texture2D(grain, vMonde.xz * 9.0).r * 0.6 + texture2D(grain, vMonde.xz * 41.0).r * 0.4;
            diffuseColor.rgb *= mix(1.0, 0.86 + g * 0.28, 1.0 - smoothstep(1.5, 9.0, dGrain));
          }`);
    };
    for (const geo of geos) {
      const sol = new THREE.Mesh(geo, mat);
      sol.receiveShadow = true; // le relief ne projette pas d'ombre (trop coûteux), les objets si
      groupe.add(sol);
    }
    materiaux.push(mat);
    habillages.push((satellite) => {
      mat.map = satellite ? texSat : null;
      mat.defines = satellite ? {} : { STYLE: '' };
      mat.needsUpdate = true;
    });
  }
  poser(tuiles(R, pas, RR.encarts.map((E) => E.meta.grille_hijaz)), texture(image, renderer));

  // Encarts détaillés ; en vue satellite, leur image est fondue dans celle du Hijaz près des bords.
  const satHijaz = pixels(image);
  for (const E of RR.encarts) {
    const img = await chargerImage(`data/relief/${E.meta.satellite.fichier}`);
    poser(tuiles(E, 1, [], 64), texture(fondreTexture(E, R, img, satHijaz), renderer));
  }

  const matParoi = new THREE.MeshStandardMaterial({ color: 0xB79770, roughness: 1, side: THREE.DoubleSide });
  const paroi = new THREE.Mesh(parois(R, pas), matParoi);
  paroi.receiveShadow = true;
  groupe.add(paroi);

  // Mer : volume d'eau transparent au-dessus des fonds.
  const e = 0.05;
  const eauGeo = new THREE.BoxGeometry(b.x1 - b.x0 - 2 * e, -SOCLE - 0.3, b.z1 - b.z0 - 2 * e);
  eauGeo.translate((b.x0 + b.x1) / 2, (SOCLE + 0.3) / 2 - 0.004, (b.z0 + b.z1) / 2);
  const matEau = new THREE.MeshStandardMaterial({ color: 0x4FAFC6, transparent: true, opacity: 0.6, roughness: 0.2, metalness: 0.05, depthWrite: false });
  const eau = new THREE.Mesh(eauGeo, matEau);
  eau.renderOrder = 2;
  groupe.add(eau);

  return {
    groupe, materiaux, matParoi, matEau, apercu: apercuCarte(R, masque),
    habillage(satellite) { habillages.forEach((f) => f(satellite)); },
  };
}
