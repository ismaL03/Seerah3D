// Décor : villes, monuments, camps, palmeraies… placés aux vraies coordonnées.
// Les bâtiments sont agrandis d'environ 1,6 fois pour rester lisibles ; aucune représentation humaine.
// Maisons et arbres sont regroupés par blocs d'un kilomètre, masqués quand la caméra s'éloigne.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// Oasis historiques : verdies sur la carte et plantées de palmiers. Positions approximatives.
export const OASIS = [
  { nom: 'Médine', lat: 24.452, lon: 39.612, rayon: 4.2, densite: 190 },
  { nom: "al-'Âliya", lat: 24.438, lon: 39.640, rayon: 2.6, densite: 190 },
  { nom: 'Khaybar', lat: 25.700, lon: 39.290, rayon: 4.0, densite: 120 },
  { nom: "Tâ'if", lat: 21.262, lon: 40.405, rayon: 3.0, densite: 80 },
  { nom: 'Badr', lat: 23.735, lon: 38.770, rayon: 0.8, densite: 60 },
  { nom: 'Marr az-Zahrân', lat: 21.620, lon: 39.690, rayon: 3.0, densite: 90 },
];

// Champs de lave qui enserrent Médine à l'est et à l'ouest : contours approximatifs, ajoutés au masque tiré
// de Sentinel-2 (trop diffus à cette échelle). Le côté nord reste ouvert : c'est là que fut creusé le Fossé.
export const HARRAT = [
  { nom: 'Harra orientale (Wâqim)', lat: 24.455, lon: 39.675, rx: 3.7, rz: 8.5 },
  { nom: 'Harra occidentale (al-Wabra)', lat: 24.465, lon: 39.553, rx: 3.0, rz: 9 },
];

// Tracé approximatif du Fossé, au nord de Médine, entre les deux champs de lave.
const FOSSE = [[24.4745, 39.5850], [24.4810, 39.5965], [24.4865, 39.6090], [24.4850, 39.6240], [24.4790, 39.6370]];

// Hameaux de Yathrib (positions indicatives, sans attribution aux clans).
const HAMEAUX = [
  [24.4672, 39.6112, 0.38, 170, 2], [24.4393, 39.6173, 0.30, 60, 2], [24.4450, 39.6350, 0.35, 55, 3],
  [24.4500, 39.6260, 0.30, 45, 2], [24.4760, 39.6200, 0.30, 45, 2], [24.4640, 39.5990, 0.30, 40, 2], [24.4570, 39.6080, 0.25, 35, 1],
];

const BLOC = 1;            // km
const PORTEE_MAISONS = 14; // km : au-delà, maisons masquées
const PORTEE_ARBRES = 6.5; // km : au-delà, arbres masqués

const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let graine = 7;
const alea = () => { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646; };
const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, metalness: 0 }, o || {}));

// ---------- modèles (unité = emprise d'une maison, couleurs par sommet) ----------
// Maisons de briques crues aux arêtes adoucies : murs légèrement fruités (plus étroits en haut), angles
// abattus, base assombrie (occlusion), parapets crénelés, poutres de palmier en saillie, portes et jours.
// Chaque modèle existe en deux finesses : détaillée de près, simplifiée au loin.
const BLANC = [1, 1, 1], RIVE = [1.04, 1.02, 0.98], BOIS = [0.42, 0.3, 0.2], PORTE = [0.27, 0.19, 0.13], BAIE = [0.17, 0.13, 0.11];
function colorer(g, rgb) {
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(rgb).flat(), 3));
  return g;
}
// Assombrit le pied des murs (lumière ambiante masquée près du sol).
function pied(g, h = 0.22, fond = 0.68) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let k = 0; k < p.count; k++) { const f = fond + (1 - fond) * Math.min(1, Math.max(0, p.getY(k) / h)); c.setXYZ(k, c.getX(k) * f, c.getY(k) * f, c.getZ(k) * f); }
  return g;
}
function boite(w, h, d, x, y, z, rgb) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
  return colorer(g.toNonIndexed(), rgb);
}
// Bloc aux angles abattus et à l'arête supérieure adoucie, murs fruités ; normales lissées sur les angles doux.
function bloc(w, h, d, { x = 0, y = 0, z = 0, abat = 0.08, fruit = 0.05, rgb = BLANC, jeu = 0 } = {}) {
  const a = Math.min(abat, w / 3, d / 3), contour = (dw, dd, k) => {
    const W = w / 2 - dw, D = d / 2 - dd, c = a * k;
    return [[-W + c, -D], [W - c, -D], [W, -D + c], [W, D - c], [W - c, D], [-W + c, D], [-W, D - c], [-W, -D + c]];
  };
  const hb = Math.min(0.16, h * 0.3), ha = h - a * 0.6, f = fruit * Math.min(w, d);
  const anneaux = [[0, contour(0, 0, 1)], [hb, contour(f * hb / h, f * hb / h, 1)], [ha, contour(f * ha / h, f * ha / h, 1)], [h, contour(f + a * 0.55, f + a * 0.55, 0.6)]];
  const pos = [];
  // légères irrégularités du mur (déterministes)
  const bouge = (px, py, pz) => [px + jeu * Math.sin(px * 37 + py * 11 + pz * 23), py, pz + jeu * Math.sin(pz * 31 + py * 7 + px * 19)];
  for (let r = 0; r < anneaux.length - 1; r++) {
    const [y0, A] = anneaux[r], [y1, B] = anneaux[r + 1];
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8, p = (q, yy) => bouge(q[0] + x, yy + y, q[1] + z);
      pos.push(...p(A[k], y0), ...p(B[k], y1), ...p(A[k2], y0), ...p(A[k2], y0), ...p(B[k], y1), ...p(B[k2], y1));
    }
  }
  const T = anneaux[anneaux.length - 1][1];
  for (let k = 1; k < 7; k++) pos.push(T[0][0] + x, h + y, T[0][1] + z, T[k + 1][0] + x, h + y, T[k + 1][1] + z, T[k][0] + x, h + y, T[k][1] + z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return pied(colorer(toCreasedNormals(g, Math.PI / 3.2), rgb), hb + y, y > 0.05 ? 0.9 : 0.68);
}
// Parapet crénelé autour d'un toit (w × d), posé à la hauteur y : muret net, petits merlons aux angles et au milieu des côtés.
function parapet(w, d, y, { x = 0, z = 0, e = 0.06, h = 0.08, creneaux = true } = {}) {
  const out = [boite(w, h, e, x, y + h / 2, z - d / 2 + e / 2, RIVE), boite(w, h, e, x, y + h / 2, z + d / 2 - e / 2, RIVE),
    boite(e, h, d - 2 * e, x - w / 2 + e / 2, y + h / 2, z, RIVE), boite(e, h, d - 2 * e, x + w / 2 - e / 2, y + h / 2, z, RIVE)];
  if (creneaux) {
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const m = new THREE.ConeGeometry(e * 0.62, h * 0.7, 4, 1); m.rotateY(Math.PI / 4);
      m.translate(x + a * (w / 2 - e / 2), y + h + h * 0.35, z + b * (d / 2 - e / 2));
      out.push(colorer(m.toNonIndexed(), RIVE));
    }
  }
  return out;
}
// Poutres de palmier en saillie sous le toit, le long d'un mur (de (x0, z0) à (x1, z1), saillie vers (nx, nz)).
function poutres(x0, z0, x1, z1, y, nx, nz, n = 4) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, g = new THREE.CylinderGeometry(0.014, 0.014, 0.12, 5);
    g.rotateX(Math.PI / 2); g.rotateY(Math.atan2(nx, nz));
    g.translate(x0 + (x1 - x0) * t + nx * 0.03, y, z0 + (z1 - z0) * t + nz * 0.03);
    out.push(colorer(g.toNonIndexed(), BOIS));
  }
  return out;
}
// Porte : vantail de bois en retrait, linteau ; jour : petite ouverture sombre.
const porte = (x, z, ry, w = 0.17, h = 0.3) => {
  const v = boite(w, h, 0.03, 0, h / 2, 0, PORTE), l = boite(w + 0.07, 0.035, 0.05, 0, h + 0.02, 0, BOIS);
  return [v, l].map((g) => { g.rotateY(ry); g.translate(x, 0, z); return g; });
};
const jour = (x, y, z, ry, w = 0.08, h = 0.09) => { const g = boite(w, h, 0.03, 0, 0, 0, BAIE); g.rotateY(ry); g.translate(x, y, z); return g; };
// Bloc centré (comme une BoxGeometry), pour les monuments posés à la main.
const blocC = (w, h, d, o = {}) => bloc(w, h, d, { abat: Math.min(w, d) * 0.25, fruit: 0.02, ...o }).translate(0, -h / 2, 0);
const fusion = (gs) => mergeGeometries(gs.map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }));

const MODELES = {
  basse: () => fusion([bloc(1, 0.56, 1, { jeu: 0.006 }), ...parapet(0.93, 0.93, 0.56), ...porte(0.15, 0.49, 0),
    jour(-0.24, 0.38, 0.488, 0), jour(0.488, 0.38, 0.1, Math.PI / 2), ...poutres(-0.4, 0.5, 0.4, 0.5, 0.5, 0, 1, 5), ...poutres(0.5, -0.4, 0.5, 0.4, 0.5, 1, 0, 4)]),
  basseS: () => fusion([bloc(1, 0.56, 1), bloc(0.93, 0.08, 0.93, { y: 0.56, abat: 0.03, fruit: 0, rgb: RIVE })]),
  etage: () => fusion([bloc(1, 0.5, 1, { jeu: 0.006 }), bloc(0.56, 0.44, 0.56, { x: -0.2, y: 0.5, z: -0.2 }), ...parapet(0.52, 0.52, 0.94, { x: -0.2, z: -0.2 }),
    ...parapet(0.94, 0.94, 0.5, { creneaux: false, h: 0.06 }), ...porte(0.2, 0.49, 0), jour(-0.2, 0.75, 0.072, 0), jour(-0.2, 0.32, 0.488, 0),
    ...poutres(-0.42, 0.5, 0.42, 0.5, 0.45, 0, 1, 5), ...poutres(-0.42, 0.08, 0.02, 0.08, 0.88, 0, 1, 3)]),
  etageS: () => fusion([bloc(1, 0.5, 1), bloc(0.56, 0.44, 0.56, { x: -0.2, y: 0.5, z: -0.2 })]),
  cour: () => fusion([bloc(1, 0.5, 0.34, { z: -0.33, jeu: 0.006 }), bloc(0.3, 0.46, 0.66, { x: -0.35, z: 0.17 }), bloc(0.3, 0.46, 0.66, { x: 0.35, z: 0.17 }),
    bloc(0.42, 0.24, 0.07, { z: 0.465, abat: 0.03 }), ...parapet(0.96, 0.3, 0.5, { z: -0.33, creneaux: false, h: 0.06 }),
    ...porte(-0.35, 0.5, 0, 0.14, 0.26), jour(0.35, 0.32, 0.5, 0), ...poutres(-0.45, -0.16, 0.45, -0.16, 0.44, 0, 1, 6),
    boite(0.18, 0.02, 0.14, 0, 0.16, 0.2, BOIS), ...[[-0.08, 0.27], [0.08, 0.27]].map(([a, b]) => boite(0.015, 0.16, 0.015, a, 0.08, b, BOIS))]), // auvent de la cour
  courS: () => fusion([bloc(1, 0.5, 0.34, { z: -0.33 }), bloc(0.3, 0.46, 0.66, { x: -0.35, z: 0.17 }), bloc(0.3, 0.46, 0.66, { x: 0.35, z: 0.17 }), bloc(0.42, 0.24, 0.07, { z: 0.465, abat: 0.03 })]),
  tour: () => fusion([bloc(0.6, 1.5, 0.6, { fruit: 0.12, abat: 0.07, jeu: 0.004 }), ...parapet(0.5, 0.5, 1.5, { e: 0.07, h: 0.1 }), ...porte(0, 0.3, 0, 0.15, 0.26),
    jour(0, 0.95, 0.27, 0, 0.05, 0.14), jour(0.27, 1.2, 0, Math.PI / 2, 0.05, 0.12), ...poutres(-0.22, 0.27, 0.22, 0.27, 1.4, 0, 1, 3)]),
  tourS: () => fusion([bloc(0.6, 1.5, 0.6, { fruit: 0.12, abat: 0.07 }), bloc(0.5, 0.1, 0.5, { y: 1.5, abat: 0.03, fruit: 0, rgb: RIVE })]),
  // Palmier dattier : stipe courbe annelé, couronne de palmes arquées (pliées en V), palmes sèches pendantes.
  palmier: () => {
    const gs = [], n = 6, anneaux = 6, courbe = (t) => [0.05 * t * t, t, 0.02 * t * t];
    const tronc = [];
    for (let r = 0; r < anneaux; r++) {
      const t0 = r / anneaux, t1 = (r + 1) / anneaux, [x0, y0, z0] = courbe(t0), [x1, y1, z1] = courbe(t1), r0 = 0.05 - 0.016 * t0, r1 = 0.05 - 0.016 * t1;
      const ton = r % 2 ? [0.5, 0.38, 0.26] : [0.44, 0.33, 0.23];
      for (let k = 0; k < n; k++) {
        const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, P = (x, y, z, rr, a) => [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr];
        tronc.push(...P(x0, y0, z0, r0, a0), ...P(x1, y1, z1, r1, a0), ...P(x0, y0, z0, r0, a1), ...P(x0, y0, z0, r0, a1), ...P(x1, y1, z1, r1, a0), ...P(x1, y1, z1, r1, a1));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tronc.splice(0), 3)); g.computeVertexNormals();
      gs.push(colorer(g, ton));
    }
    const [cx, cy, cz] = courbe(1);
    const palme = (a, montee, L, rgb, seche = false) => {
      const pts = [], S = 4;
      for (let s = 0; s <= S; s++) {
        const t = s / S, d = L * t, chute = seche ? -t * L * 0.9 : montee * d - 0.9 * d * d;
        const larg = (seche ? 0.04 : 0.085) * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05));
        const ox = Math.cos(a), oz = Math.sin(a), px = -oz, pz = ox, y = cy + chute;
        pts.push([[cx + ox * d - px * larg, y - larg * 0.45, cz + oz * d - pz * larg], [cx + ox * d, y, cz + oz * d], [cx + ox * d + px * larg, y - larg * 0.45, cz + oz * d + pz * larg]]);
      }
      const pos = [];
      for (let s = 0; s < S; s++) for (const [i, j] of [[0, 1], [1, 2]]) {
        const A = pts[s][i], B = pts[s][j], C = pts[s + 1][i], D = pts[s + 1][j];
        pos.push(...A, ...C, ...B, ...B, ...C, ...D);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const c = colorer(g, rgb), p = c.attributes.position, col = c.attributes.color;
      for (let k = 0; k < p.count; k++) { const t = Math.min(1, Math.hypot(p.getX(k) - cx, p.getZ(k) - cz) / L); col.setXYZ(k, rgb[0] * (0.8 + 0.35 * t), rgb[1] * (0.8 + 0.3 * t), rgb[2] * (0.85 + 0.2 * t)); }
      return c;
    };
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2 + (k % 2) * 0.2, haut = k % 3 === 0;
      gs.push(palme(a, haut ? 1.1 : 0.55, haut ? 0.5 : 0.62, k % 2 ? [0.34, 0.52, 0.22] : [0.3, 0.47, 0.2]));
    }
    for (let k = 0; k < 4; k++) gs.push(palme(k * 1.7 + 0.4, 0, 0.32, [0.55, 0.45, 0.3], true));
    return fusion(gs);
  },
  palmierS: () => {
    const tronc = new THREE.CylinderGeometry(0.035, 0.05, 1, 5, 1, true); tronc.translate(0, 0.5, 0);
    colorer(tronc, [0.5, 0.38, 0.26]);
    const palmes = [];
    for (let k = 0; k < 8; k++) {
      const p = new THREE.PlaneGeometry(0.16, 0.66); p.rotateX(-Math.PI / 2); p.translate(0, 0, 0.33); p.rotateX(0.3 + (k % 2) * 0.22);
      p.rotateY(k * Math.PI * 2 / 8); p.translate(0, 1, 0);
      palmes.push(colorer(p.toNonIndexed(), k % 2 ? [0.34, 0.52, 0.22] : [0.3, 0.47, 0.2]));
    }
    return fusion([tronc, ...palmes]);
  },
  // Acacia : tronc fourchu, houppier en parasol fait de quelques masses aplaties.
  acacia: () => {
    const gs = [];
    const branche = (x0, y0, z0, x1, y1, z1, r) => {
      const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0), g = new THREE.CylinderGeometry(r * 0.7, r, L, 5, 1, true);
      g.translate(0, L / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()));
      g.translate(x0, y0, z0);
      return colorer(g.toNonIndexed(), [0.4, 0.3, 0.21]);
    };
    gs.push(branche(0, 0, 0, 0.02, 0.32, 0, 0.05), branche(0.02, 0.3, 0, -0.28, 0.62, 0.08, 0.035), branche(0.02, 0.3, 0, 0.3, 0.6, -0.06, 0.035), branche(0.02, 0.3, 0, 0.05, 0.64, 0.25, 0.03));
    for (const [x, y, z, s, t] of [[-0.25, 0.68, 0.05, 0.36, 0.95], [0.27, 0.66, -0.05, 0.38, 1.05], [0.04, 0.72, 0.22, 0.3, 0.9], [0.0, 0.74, -0.18, 0.3, 1]]) {
      const c = new THREE.SphereGeometry(1, 9, 5); c.scale(s, s * 0.32, s); c.translate(x, y, z);
      gs.push(colorer(c.toNonIndexed(), [0.4 * t, 0.53 * t, 0.26 * t]));
    }
    return fusion(gs);
  },
  acaciaS: () => {
    const t = new THREE.CylinderGeometry(0.05, 0.07, 0.6, 5, 1, true); t.translate(0, 0.3, 0);
    colorer(t, [0.4, 0.3, 0.21]);
    const c = new THREE.SphereGeometry(0.5, 8, 4); c.scale(1.3, 0.34, 1.3); c.translate(0, 0.7, 0);
    colorer(c, [0.4, 0.53, 0.26]);
    return fusion([t, c]);
  },
  lanterne: () => new THREE.SphereGeometry(0.06, 6, 4),
};
// Finesse selon la distance : détaillé en deçà de « pres » km, simplifié au-delà.
const LOD = { basse: ['basseS', 3], etage: ['etageS', 3], cour: ['courS', 3], tour: ['tourS', 4], palmier: ['palmierS', 1.8], acacia: ['acaciaS', 1.8] };

// Enduit de terre : grain irrégulier et lits de briques à peine marqués, en coordonnées du modèle.
function enduit(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vObj;
      float hachage(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float bruit(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hachage(i), hachage(i + vec3(1, 0, 0)), f.x), mix(hachage(i + vec3(0, 1, 0)), hachage(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hachage(i + vec3(0, 0, 1)), hachage(i + vec3(1, 0, 1)), f.x), mix(hachage(i + vec3(0, 1, 1)), hachage(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }`).replace('#include <color_fragment>', `#include <color_fragment>
      float en = bruit(vObj * 9.0) * 0.6 + bruit(vObj * 31.0) * 0.4;
      diffuseColor.rgb *= 0.9 + 0.18 * en - 0.035 * smoothstep(0.6, 1.0, sin(vObj.y * 110.0));`);
  };
  return mat;
}

export function creerDecor(R, D) {
  const groupe = new THREE.Group();
  const P = (lat, lon) => R.xz(lat, lon);
  const ici = (id) => P(D.LIEUX[id].lat, D.LIEUX[id].lon);
  const i = (id) => D.INDEX[id];
  const ere = [];          // objets dont la visibilité dépend de l'événement courant
  const ajoute = (m, x, y, z, parent = groupe) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  function pose(x, z, echelle, parent = groupe) {
    const g = new THREE.Group(); g.position.set(x, R.y(x, z), z); g.scale.setScalar(echelle); parent.add(g); return g;
  }

  // Fusionne les maillages d'un groupe par matériau (moins d'appels de dessin pour les petits objets nombreux).
  function fusionner(g) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), parMat = new Map();
    g.children.filter((o) => o.isMesh).forEach((o) => {
      const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!parMat.has(o.material)) parMat.set(o.material, { geos: [], ombre: o.castShadow });
      parMat.get(o.material).geos.push(geo.index ? geo.toNonIndexed() : geo);
      g.remove(o);
    });
    for (const [mat, { geos, ombre }] of parMat) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = ombre; m.receiveShadow = true; g.add(m);
    }
    return g;
  }

  // ---------- occupation du sol (évite que maisons et arbres se chevauchent) ----------
  const occupe = new Map(), CASE = 0.02;
  const cle = (x, z) => `${Math.floor(x / CASE)},${Math.floor(z / CASE)}`;
  function libre(x, z, r) {
    const n = Math.ceil(r / CASE);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
      const v = occupe.get(`${Math.floor(x / CASE) + a},${Math.floor(z / CASE) + b}`);
      if (v && Math.hypot(v[0] - x, v[1] - z) < r + v[2]) return false;
    }
    return true;
  }
  const occuper = (x, z, r) => occupe.set(cle(x, z), [x, z, r]);
  function reserver(x, z, r) { // réserve un disque (monument, place)
    for (let a = -r; a <= r; a += CASE) for (let b = -r; b <= r; b += CASE) if (a * a + b * b <= r * r) occupe.set(cle(x + a, z + b), [x + a, z + b, CASE]);
  }

  // ---------- blocs d'instances ----------
  const blocs = new Map();
  const geos = {}, mats = {
    maison: enduit(M(0xffffff, { vertexColors: true })),
    arbre: M(0xffffff, { vertexColors: true, side: THREE.DoubleSide }),
    lanterne: new THREE.MeshBasicMaterial({ color: 0xFFC46B }),
  };
  function placer(modele, x, z, s, ry, couleur, h = s) {
    const k = `${Math.floor(x / BLOC)},${Math.floor(z / BLOC)}`;
    let b = blocs.get(k);
    if (!b) {
      const bx = (Math.floor(x / BLOC) + 0.5) * BLOC, bz = (Math.floor(z / BLOC) + 0.5) * BLOC;
      b = { x: bx, z: bz, y: R.y(bx, bz), lots: {}, meshes: [] }; blocs.set(k, b);
    }
    (b.lots[modele] ||= []).push({ x, y: R.y(x, z) - 0.001, z, s, h, ry, couleur });
  }

  function semer(cx, cz, rayon, n, test, gauss = false) {
    const out = []; let essais = 0;
    while (out.length < n && essais < n * 30) {
      essais++;
      const a = alea() * Math.PI * 2;
      const r = gauss ? Math.min(rayon, Math.abs(rayon * 0.45 * Math.sqrt(-2 * Math.log(alea() + 1e-9)))) : Math.sqrt(alea()) * rayon;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (test && !test(x, z)) continue;
      out.push([x, z]);
    }
    return out;
  }

  // Une ville : maisons regroupées autour d'un centre, sur les fonds de vallée.
  const TEINTES_MECQUE = ['#E3D2B1', '#D8C29C', '#CDB48C', '#E8DCC4', '#C9AE86'].map((c) => new THREE.Color(c));
  const TEINTES_MEDINE = ['#C9A27A', '#BD9369', '#D2B08A', '#B48A60', '#D8BC96'].map((c) => new THREE.Color(c));
  function ville(lat, lon, rayon, n, { teintes, melange, tours = 0, denivele = 45, pente = 260 }) {
    const [cx, cz] = P(lat, lon), h0 = R.metres(cx, cz);
    const ok = (x, z, r) => R.pente(x, z) < pente && R.metres(x, z) < h0 + denivele && libre(x, z, r);
    for (const [x, z] of semer(cx, cz, rayon, n, (x, z) => ok(x, z, 0.016), true)) {
      const t = alea(), modele = t < melange[0] ? 'basse' : t < melange[0] + melange[1] ? 'etage' : 'cour';
      const s = 0.02 + alea() * 0.012;
      occuper(x, z, s * 0.62);
      placer(modele, x, z, s, Math.round(alea() * 4) * Math.PI / 2 + (alea() - 0.5) * 0.3, teintes[Math.floor(alea() * teintes.length)]);
    }
    for (const [x, z] of semer(cx, cz, rayon * 0.8, tours, (x, z) => ok(x, z, 0.02), false)) {
      occuper(x, z, 0.016);
      placer('tour', x, z, 0.024, alea() * 6, teintes[Math.floor(alea() * teintes.length)]);
    }
  }

  // ---------- Ka'ba, Hijr Ismâ'îl, Zamzam (taille ×2) ----------
  {
    const [x, z] = ici('makkah'), g = pose(x, z, 0.002); // unité : le mètre, taille ×2
    const sable = M(0xEDE3CC), noir = M(0x1B1B1D, { roughness: 0.7 }), or = M(0xC9A043, { metalness: 0.5, roughness: 0.4 });
    // parvis de sable clair autour de la Maison, épousant le sol, aux bords fondus
    const disque = new THREE.RingGeometry(0.01, 30, 48, 10); disque.rotateX(-Math.PI / 2);
    const pp = disque.attributes.position, y0 = R.y(x, z), rgba = [];
    for (let k2 = 0; k2 < pp.count; k2++) {
      const lx = pp.getX(k2), lz = pp.getZ(k2), r = Math.hypot(lx, lz) / 30;
      pp.setY(k2, (R.y(x + lx * 0.002, z + lz * 0.002) - y0) / 0.002 + 0.25);
      rgba.push(0.86, 0.76, 0.56, 0.75 * (1 - lisse(0.5, 1, r)));
    }
    disque.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4)); disque.computeVertexNormals();
    const parvis = new THREE.Mesh(disque, M(0xffffff, { vertexColors: true, transparent: true, depthWrite: false }));
    parvis.receiveShadow = true; parvis.renderOrder = 1; g.add(parvis);
    const k = new THREE.Group(); k.rotation.y = Math.PI / 4; g.add(k); // angles orientés vers les points cardinaux
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(12, 13, 10), noir), 0, 6.5, 0, k);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(12.15, 1, 10.15), or), 0, 9.6, 0, k);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.2, 0.2), or), 1.8, 3.6, 5.05, k); // porte, surélevée
    // Hijr Ismâ'îl : muret en arc devant la face nord-ouest
    const hijr = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.6, 6, 24, Math.PI), M(0xEFEAE0));
    hijr.rotation.set(-Math.PI / 2, 0, 0); ajoute(hijr, 0, 0.6, -5, k); hijr.scale.z = 2.4; // arc vers l'extérieur
    ajoute(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 16), M(0xB9A27E)), 14, 0.6, 9); // Zamzam
    reserver(x, z, 0.05);
  }

  // ---------- Mosquée du Prophète ﷺ (briques crues, toiture de palmes) ----------
  {
    const [x, z] = ici('madinah'), g = pose(x, z, 0.011), boue = enduit(M(0xB98C5F, { vertexColors: true })), toit = M(0x7F6143);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(7, 0.1, 6.4), M(0xE2CDA6)), 0, 0.05, 0, g);
    [[0, -3.1], [0, 3.1]].forEach(([a, b]) => ajoute(new THREE.Mesh(blocC(7, 1, 0.3), boue), a, 0.5, b, g));
    ajoute(new THREE.Mesh(blocC(0.3, 1, 6.4), boue), -3.4, 0.5, 0, g);
    ajoute(new THREE.Mesh(blocC(0.3, 1, 2.4), boue), 3.4, 0.5, -2, g);
    ajoute(new THREE.Mesh(blocC(0.3, 1, 2.4), boue), 3.4, 0.5, 2, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 1.9), toit), 0, 1.15, -2, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 1.3), toit), 0, 1.15, 2.4, g);
    for (let k = 0; k < 5; k++) ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 5), toit), -2.6 + k * 1.3, 0.55, -1.3, g);
    // al-Hujurât : les chambres des épouses, accolées au mur est, toits de palmes, portes sur la mosquée
    const brique = enduit(M(0xD2B48C, { vertexColors: true })), palmes = M(0x6E5538);
    for (let k = 0; k < 5; k++) {
      const zz = -2.6 + k * 1.3;
      ajoute(new THREE.Mesh(blocC(1.2, 0.8, 1.15), brique), 4.2, 0.4, zz, g);
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.25), palmes), 4.2, 0.85, zz, g);
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), palmes), 3.58, 0.25, zz, g); // porte (rideau)
    }
    ere.push({ o: g, visible: (k) => k >= i('hijra') });
    reserver(x, z, 0.08);
  }

  // ---------- Mosquée de Qubâ' ----------
  {
    const [x, z] = ici('quba'), g = pose(x, z, 0.009), boue = enduit(M(0xB98C5F, { vertexColors: true }));
    [[0, -1.4], [0, 1.4]].forEach(([a, b]) => ajoute(new THREE.Mesh(blocC(3, 0.8, 0.25), boue), a, 0.4, b, g));
    [-1.4, 1.4].forEach((a) => ajoute(new THREE.Mesh(blocC(0.25, 0.8, 3), boue), a, 0.4, 0, g));
    ere.push({ o: g, visible: (k) => k >= i('hijra') });
    reserver(x, z, 0.03);
  }

  // ---------- Le Fossé ----------
  {
    const g = new THREE.Group(); groupe.add(g);
    const sombre = M(0x4E3B2D), terre = M(0xC9A37A);
    for (let k = 0; k < FOSSE.length - 1; k++) {
      const [ax, az] = P(...FOSSE[k]), [bx, bz] = P(...FOSSE[k + 1]);
      const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), n = Math.ceil(L / 0.1);
      for (let s = 0; s < n; s++) { // tronçons courts, pour épouser le relief
        const t = (s + 0.5) / n, mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
        const f = ajoute(new THREE.Mesh(new THREE.BoxGeometry(L / n + 0.004, 0.004, 0.014), sombre), mx, R.y(mx, mz) + 0.001, mz, g);
        f.rotation.y = -ang; f.castShadow = false;
        const nx = Math.sin(ang) * 0.016, nz = -Math.cos(ang) * 0.016; // remblai côté nord
        const m = ajoute(new THREE.Mesh(new THREE.BoxGeometry(L / n + 0.004, 0.006, 0.01), terre), mx + nx, R.y(mx + nx, mz + nz) + 0.002, mz + nz, g);
        m.rotation.y = -ang;
      }
    }
    fusionner(g);
    ere.push({ o: g, visible: (k) => k >= i('khandaq') });
  }

  // ---------- Camps (tentes, sans personnages) ----------
  const tente = new THREE.ConeGeometry(0.75, 0.9, 4); tente.rotateY(Math.PI / 4); tente.translate(0, 0.45, 0);
  function camp(lat, lon, rayon, n, couleur, quand) {
    const [cx, cz] = P(lat, lon), places = semer(cx, cz, rayon, n, (x, z) => R.pente(x, z) < 200);
    const im = new THREE.InstancedMesh(tente, M(couleur), places.length), o = new THREE.Object3D();
    places.forEach(([x, z], k) => { o.position.set(x, R.y(x, z) - 0.001, z); o.rotation.set(0, alea() * 6, 0); o.scale.setScalar(0.012 + alea() * 0.004); o.updateMatrix(); im.setMatrixAt(k, o.matrix); });
    im.castShadow = true; im.computeBoundingSphere();
    groupe.add(im); ere.push({ o: im, visible: quand });
  }
  camp(23.743, 38.779, 0.25, 26, 0xF4EEE2, (k) => k === i('badr'));   // musulmans, côté proche (al-'Udwa ad-Dunyâ)
  camp(23.721, 38.764, 0.35, 50, 0x7C4B3C, (k) => k === i('badr'));   // Quraysh, côté éloigné (al-'Udwa al-Quswâ)
  camp(24.4955, 39.6000, 0.3, 50, 0x7C4B3C, (k) => k === i('uhud')); // Quraysh à Uhud
  camp(21.444, 39.620, 0.4, 60, 0xF4EEE2, (k) => k === i('hudaybiya'));
  camp(21.618, 39.695, 0.8, 140, 0xF4EEE2, (k) => k === i('fath'));    // Marr az-Zahrân
  camp(21.352, 39.975, 0.7, 120, 0xF4EEE2, (k) => k === i('hajj'));    // 'Arafa

  // ---------- Puits de Badr ----------
  {
    const [x0, z0] = ici('badr'), mat = M(0x9B8466);
    for (let k = 0; k < 4; k++) {
      const x = x0 + 0.05 * k - 0.07, z = z0 + 0.03 * k;
      ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.006, 12), mat), x, R.y(x, z) + 0.002, z);
    }
  }

  // ---------- Fortins de Khaybar ----------
  {
    const pierre = M(0xA88B6A), base = D.LIEUX.khaybar;
    [[0.022, 0.012], [-0.016, 0.020], [0.030, -0.018], [-0.020, -0.026], [0.004, 0.034], [0.012, -0.034]].forEach(([dla, dlo]) => {
      const [x, z] = P(base.lat + dla, base.lon + dlo), g = pose(x, z, 0.02);
      ajoute(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 3, 10), pierre), 0, 1.4, 0, g);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), pierre), Math.cos(a) * 1.05, 3.05, Math.sin(a) * 1.05, g); }
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.6), pierre), 1.4, 0.5, 0.6, g);
      reserver(x, z, 0.06);
    });
  }

  // ---------- Rempart de Tâ'if ----------
  {
    const [cx, cz] = ici('taif'), pierre = M(0xB79C78), r = 0.75, n = 90, g = new THREE.Group(); groupe.add(g);
    for (let k = 0; k < n; k++) {
      if (k % 30 === 7) continue; // portes
      const a = k / n * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const tour = k % 6 === 0;
      const s = ajoute(new THREE.Mesh(new THREE.BoxGeometry(tour ? 0.03 : 0.054, tour ? 0.024 : 0.014, tour ? 0.03 : 0.01), pierre), x, R.y(x, z) + (tour ? 0.012 : 0.007), z, g);
      s.rotation.y = -a + Math.PI / 2;
    }
    fusionner(g);
  }

  // ---------- Jabal ar-Rahma ('Arafa) ----------
  {
    const [x, z] = ici('arafat');
    ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.003, 0.03, 8), M(0xF5F2EA)), x, R.y(x, z) + 0.015, z);
  }

  // ---------- Lieux importants de Médine et de La Mecque (taille iconique) ----------
  const site = (id) => { const L = D.LIEUX[id]; return L ? P(L.lat, L.lon) : null; };
  const pierre = M(0xA48E72), stele = M(0xCFC3AE), toile = [M(0xC9893A), M(0x3F5E8C), M(0x9E3B2E), M(0xE4D3A8)].map((m) => { m.side = THREE.DoubleSide; return m; });
  function batisse(id, modele, taille, couleur, ry = 0) { // une maison remarquable (modèle à couleurs par sommet)
    const xz = site(id); if (!xz) return null;
    const m = new THREE.Mesh(MODELES[modele](), enduit(M(couleur, { vertexColors: true })));
    m.scale.setScalar(taille); m.rotation.y = ry;
    ajoute(m, xz[0], R.y(...xz) - 0.001, xz[1]);
    reserver(xz[0], xz[1], taille * 0.8);
    return m;
  }
  function cimetiere(id, w, d, n, murs = true) {
    const xz = site(id); if (!xz) return;
    const [cx, cz] = xz, g = new THREE.Group(); groupe.add(g);
    if (murs) [[0, -d / 2, w, 0.003], [0, d / 2, w, 0.003], [-w / 2, 0, 0.003, d], [w / 2, 0, 0.003, d]].forEach(([a, b, ww, dd]) =>
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(ww, 0.005, dd), pierre), cx + a, R.y(cx + a, cz + b) + 0.0025, cz + b, g));
    for (let k = 0; k < n; k++) {
      const x = cx + (alea() - 0.5) * w * 0.9, z = cz + (alea() - 0.5) * d * 0.9;
      const t = ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.0022, 0.0035), stele), x, R.y(x, z) + 0.001, z, g);
      t.rotation.y = 0.3; t.castShadow = false;
    }
    fusionner(g);
    reserver(cx, cz, Math.max(w, d) * 0.6);
  }
  function enclos(id, cote, quand) { // petite mosquée en briques crues, comme celle de Qubâ'
    const xz = site(id); if (!xz) return;
    const g = pose(xz[0], xz[1], cote / 3), boue = enduit(M(0xB98C5F, { vertexColors: true }));
    [[0, -1.4], [0, 1.4]].forEach(([a, b]) => ajoute(new THREE.Mesh(blocC(3, 0.8, 0.25), boue), a, 0.4, b, g));
    [-1.4, 1.4].forEach((a) => ajoute(new THREE.Mesh(blocC(0.25, 0.8, 3), boue), a, 0.4, 0, g));
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.1), M(0x7F6143)), 0, 0.85, -0.85, g);
    if (quand) ere.push({ o: g, visible: quand });
    reserver(xz[0], xz[1], cote * 0.7);
  }
  // Médine
  cimetiere('baqi', 0.12, 0.09, 140);
  batisse('ayyub', 'etage', 0.034, 0xD2B08A, 0.4);
  enclos('qiblatayn', 0.03, (k) => k >= i('hijra'));
  enclos('jumua', 0.026, (k) => k >= i('hijra'));
  { // le marché : deux rangées d'étals sous auvents de toile
    const xz = site('souq');
    if (xz) {
      for (let k = 0; k < 16; k++) {
        const x = xz[0] + (k % 8 - 3.5) * 0.012, z = xz[1] + (k < 8 ? -0.009 : 0.009), y = R.y(x, z);
        ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.006), M(0xC9A27A)), x, y + 0.002, z);
        const a = ajoute(new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.008), toile[k % toile.length]), x, y + 0.0065, z + (k < 8 ? 0.004 : -0.004));
        a.rotation.x = -Math.PI / 2 + (k < 8 ? 0.35 : -0.35);
      }
      reserver(xz[0], xz[1], 0.06);
    }
  }
  { // la Saqîfa : préau sur poteaux, toit de palmes
    const xz = site('saqifa');
    if (xz) {
      const g = pose(xz[0], xz[1], 0.006), bois = M(0x7F6143);
      [[-1.5, -1], [0, -1], [1.5, -1], [-1.5, 1], [0, 1], [1.5, 1]].forEach(([a, b]) => ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5), bois), a, 0.6, b, g));
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 2.6), M(0x8E7650)), 0, 1.25, 0, g);
      reserver(xz[0], xz[1], 0.02);
    }
  }
  // La Mecque
  for (const id of ['safa', 'marwa']) { // collines rocheuses, plus marquées que ne le montre le relief à 100 m
    const xz = site(id); if (!xz) continue;
    const roc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.014, 1), M(0x9C8468, { flatShading: true }));
    roc.scale.set(1, 0.55, 0.8); ajoute(roc, xz[0], R.y(...xz) + 0.002, xz[1]);
    reserver(xz[0], xz[1], 0.016);
  }
  { // le parcours entre as-Safâ et al-Marwa
    const a = site('safa'), c = site('marwa');
    if (a && c) {
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]), n = 12;
      for (let k = 0; k <= n; k++) {
        const x = a[0] + (c[0] - a[0]) * k / n, z = a[1] + (c[1] - a[1]) * k / n;
        const t = ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0008, L / n + 0.002), M(0xE6D8B8)), x, R.y(x, z) + 0.0005, z);
        t.rotation.y = Math.atan2(c[0] - a[0], c[1] - a[1]); t.castShadow = false;
        reserver(x, z, 0.008);
      }
    }
  }
  batisse('arqam', 'cour', 0.03, 0xE0CFAF, 0.2);
  batisse('mawlid', 'basse', 0.03, 0xE8DCC4, 0.5);
  batisse('khadija', 'cour', 0.034, 0xDCC8A4, -0.3);
  batisse('nadwa', 'cour', 0.046, 0xD6C09A, 0.1);
  cimetiere('hajun', 0.09, 0.07, 90, false);

  // ---------- Villes ----------
  const m = D.LIEUX.makkah;
  ville(m.lat, m.lon, 1.5, 850, { teintes: TEINTES_MECQUE, melange: [0.5, 0.3], denivele: 50, pente: 320 });
  for (const [la, lo, r, n, t] of HAMEAUX) ville(la, lo, r, n, { teintes: TEINTES_MEDINE, melange: [0.5, 0.15], tours: t, denivele: 25 });
  const kh = D.LIEUX.khaybar;
  ville(kh.lat + 0.006, kh.lon, 1.6, 150, { teintes: TEINTES_MEDINE, melange: [0.55, 0.2], tours: 6, denivele: 40 });
  const ta = D.LIEUX.taif;
  ville(ta.lat, ta.lon, 0.65, 260, { teintes: TEINTES_MECQUE, melange: [0.45, 0.35], denivele: 40 });

  // ---------- Palmeraies ----------
  const [mx, mz] = ici('madinah'), ligneFosse = P(...FOSSE[2])[1];
  const VERTS = ['#FFFFFF', '#E8F0DC', '#D6E6C4', '#F2F0D8'].map((c) => new THREE.Color(c));
  for (const o of OASIS) {
    const [cx, cz] = P(o.lat, o.lon), n = Math.round(Math.PI * o.rayon * o.rayon * o.densite);
    const h0 = R.metres(cx, cz);
    for (const [x, z] of semer(cx, cz, o.rayon, n, (x, z) =>
      R.pente(x, z) < 160 && R.metres(x, z) < h0 + 60 && libre(x, z, 0.008) && !(o.nom === 'Médine' && z < ligneFosse) && Math.hypot(x - mx, z - mz) > 0.12)) {
      const s = 0.02 + alea() * 0.01;
      placer('palmier', x, z, s, alea() * 6.28, VERTS[Math.floor(alea() * VERTS.length)]);
    }
  }

  // ---------- Acacias des oueds, autour des lieux de la Sîra ----------
  for (const id of ['makkah', 'madinah', 'badr', 'hudaybiya', 'hunayn', 'taif', 'khaybar', 'uhud']) {
    const [cx, cz] = ici(id);
    semer(cx, cz, 12, 350, (x, z) => R.metres(x, z) > 2 && R.pente(x, z) < 120 && libre(x, z, 0.01)).forEach(([x, z]) => {
      placer('acacia', x, z, 0.012 + alea() * 0.012, alea() * 6, VERTS[0]);
    });
  }
  { const [x, z] = ici('hudaybiya'); placer('acacia', x + 0.08, z, 0.05, 0, VERTS[0]); } // l'arbre du serment

  // ---------- Flèches vers les lieux hors carte ----------
  const forme = new THREE.Shape();
  [[0, -3], [2.4, 0], [0.9, 0], [0.9, 3], [-0.9, 3], [-0.9, 0], [-2.4, 0], [0, -3]].forEach(([a, b], k) => (k ? forme.lineTo(a, b) : forme.moveTo(a, b)));
  const fleche = new THREE.ExtrudeGeometry(forme, { depth: 0.4, bevelEnabled: false }); fleche.rotateX(Math.PI / 2);
  const orFl = M(0xD4A243, { metalness: 0.3, roughness: 0.5 });
  for (const l of Object.values(D.LIEUX).filter((l) => l.hors_carte)) {
    const [x, z] = P(...l.hors_carte.ancre), [tx, tz] = P(l.lat, l.lon);
    const f = ajoute(new THREE.Mesh(fleche, orFl), x, R.sol(x, z) + 1.2, z);
    f.scale.setScalar(1.6);
    f.rotation.y = Math.atan2(tx - x, tz - z) + Math.PI; // pointe vers le lieu réel
  }

  // ---------- construction des blocs ----------
  // Pour chaque modèle d'un bloc : une version détaillée (de près) et, s'il y a lieu, une version simplifiée.
  const o3 = new THREE.Object3D();
  for (const b of blocs.values()) {
    for (const [modele, liste] of Object.entries(b.lots)) {
      const arbre = modele === 'palmier' || modele === 'acacia', portee = arbre ? PORTEE_ARBRES : PORTEE_MAISONS;
      const matrices = liste.map((p) => {
        o3.position.set(p.x, p.y, p.z); o3.rotation.set(0, p.ry, 0); o3.scale.set(p.s, p.h, p.s);
        if (arbre) o3.rotation.set((alea() - 0.5) * 0.12, p.ry, (alea() - 0.5) * 0.12);
        o3.updateMatrix(); return o3.matrix.clone();
      });
      const [simple, pres] = LOD[modele] || [null, portee];
      for (const [m, min, max] of [[modele, 0, simple ? pres : portee], ...(simple ? [[simple, pres, portee]] : [])]) {
        geos[m] ||= MODELES[m]();
        const im = new THREE.InstancedMesh(geos[m], arbre ? mats.arbre : mats.maison, liste.length);
        im.castShadow = im.receiveShadow = true;
        liste.forEach((p, k) => { im.setMatrixAt(k, matrices[k]); im.setColorAt(k, p.couleur); });
        im.computeBoundingSphere();
        im.userData.min = min; im.userData.max = max;
        groupe.add(im); b.meshes.push(im);
      }
      // lanternes, la nuit, sur une maison sur quatre
      if (!arbre) {
        const l = liste.filter((_, k) => k % 4 === 0);
        if (l.length) {
          geos.lanterne ||= MODELES.lanterne();
          const lm = new THREE.InstancedMesh(geos.lanterne, mats.lanterne, l.length);
          l.forEach((p, k) => { o3.position.set(p.x + p.s * 0.3, p.y + p.s * 0.62, p.z + p.s * 0.3); o3.rotation.set(0, 0, 0); o3.scale.setScalar(p.s * 1.6); o3.updateMatrix(); lm.setMatrixAt(k, o3.matrix); });
          lm.computeBoundingSphere(); lm.userData.min = 0; lm.userData.max = PORTEE_MAISONS; lm.userData.nuit = true; lm.visible = false;
          groupe.add(lm); b.meshes.push(lm);
        }
      }
    }
  }

  let nuit = false;
  return {
    groupe, ere,
    nuit(on) { nuit = on; },
    // Masque les blocs lointains (appelé à chaque image avec la position de la caméra).
    majBlocs(cam) {
      for (const b of blocs.values()) {
        const d = Math.hypot(cam.x - b.x, cam.z - b.z, cam.y - b.y);
        for (const im of b.meshes) im.visible = d >= im.userData.min && d < im.userData.max && (!im.userData.nuit || nuit);
      }
    },
  };
}
