// Monde à la première personne : petites scènes à l'échelle humaine (1 unité = 1 m) où le joueur
// marche (ZQSD / WASD / flèches, souris ou doigt), parle, prend, porte, lance, invoque.
// Silhouettes SANS VISAGE pour les anonymes et les adversaires nommés uniquement (décision du porteur,
// 4 octobre 2026) ; jamais le Prophète ﷺ, les prophètes, les Compagnons ni sa famille, qui restent hors champ.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chameau, cheval, bateau } from './montures.js';

const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const RAD = Math.PI / 180;
const BOUE = ['#C9A57A', '#BF9A6B', '#D2B48C', '#B48B5E', '#C7A27C', '#D8BF97'];
const HABITS = ['#7A5A3C', '#8C6F4E', '#5E4B3B', '#A08060', '#6B5A48', '#8A7A62', '#4E5A63', '#7B6A57'];
const COIFFES = ['#E2D6BF', '#D4C3A3', '#C9B48E', '#EDE4D3', '#BFAF95'];

const AMBIANCES = {
  aube: { haut: '#8EA6C4', bas: '#F2C597', soleil: 0xFFB473, si: 2.5, hc: 0xFFE1C2, hs: 0x8C6B4E, hi: 1.15, dir: [0.85, 0.3, 0.32], brume: 0xE9C8A4, b0: 50, b1: 380 },
  jour: { haut: '#6E9FD2', bas: '#DCE6EB', soleil: 0xFFF1D6, si: 3.0, hc: 0xEEF4FA, hs: 0xC2A27A, hi: 1.25, dir: [0.45, 0.8, 0.35], brume: 0xDCE5EA, b0: 70, b1: 480 },
  soir: { haut: '#3D4D77', bas: '#EC9B66', soleil: 0xFF9A55, si: 2.2, hc: 0xFFC9A0, hs: 0x5E4636, hi: 0.95, dir: [-0.88, 0.22, -0.3], brume: 0xC98F6E, b0: 40, b1: 320 },
  nuit: { haut: '#050A1F', bas: '#1B2C52', soleil: 0xB4C6FF, si: 0.9, hc: 0x5C6FA0, hs: 0x241F18, hi: 0.95, dir: [0.3, 0.75, -0.45], brume: 0x111B33, b0: 30, b1: 210, etoiles: true },
};

export function creerMonde({ hote, reduit = false, mobile = false, pas: bruitPas }) {
  // ---------- rendu ----------
  const racine = document.createElement('div'); racine.className = 'monde'; racine.hidden = true; hote.appendChild(racine);
  const canvas = document.createElement('canvas'); racine.appendChild(canvas);
  racine.insertAdjacentHTML('beforeend', `
    <div class="m-viseur" aria-hidden="true"></div>
    <div class="m-invite" hidden><kbd>E</kbd><span></span><i class="m-tenir"></i></div>
    <div class="m-boussole" hidden><span class="m-losange"></span><small></small></div>
    <div class="m-fondu" hidden><p></p></div>
    <div class="m-joy" hidden><i></i></div>
    <button class="m-agir" hidden>Agir</button>
    <button class="m-courir" hidden aria-pressed="false">Courir</button>
    <div class="m-noms" aria-hidden="true"></div>`);
  const $ = (s) => racine.querySelector(s);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  let dpr = Math.min(devicePixelRatio, mobile ? 1.5 : 2); renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1500); camera.rotation.order = 'YXZ';
  const hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1.2);
  const soleil = new THREE.DirectionalLight(0xffffff, 3);
  soleil.castShadow = true; soleil.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(soleil.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
  soleil.shadow.bias = -0.0004; soleil.shadow.normalBias = 0.04;
  scene.add(hemi, soleil, soleil.target);
  scene.fog = new THREE.Fog(0xdddddd, 60, 400);
  const dirSoleil = new THREE.Vector3(0.4, 0.8, 0.3).normalize();

  // ---------- matériaux ----------
  const mats = new Map();
  const M = (c, o = {}) => {
    const cle = c + JSON.stringify(o);
    if (!mats.has(cle)) mats.set(cle, new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true, ...o }));
    return mats.get(cle);
  };
  const lumineux = (c, o = {}) => M(c, { emissive: c, emissiveIntensity: 1.4, ...o });
  function textureRayures(couleurs, n = 18) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
    for (let i = 0; i < n; i++) { x.fillStyle = couleurs[i % couleurs.length]; x.fillRect(0, i * 256 / n, 4, 256 / n + 1); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
  }

  // ---------- état ----------
  let def = null, actif = false, enPause = false, monde = null; // monde = groupe de la scène courante
  let hauteurBase = () => 0;
  const solides = [];            // { type: 'boite', x, z, hx, hz, r } | { type: 'cercle', x, z, r }
  const zones = [];              // { id, x, z, r } | { id, x1, z1, x2, z2 }
  const ravins = [];             // { id, ax, az, bx, bz, l, p }
  const recifs = [];             // { id, x, z, r }
  const pnjs = new Map();        // id → { obj, x, z, cap, ... }
  const objets = new Map();      // id → { obj, x, z, nom, invite, visible }
  const lieux = new Map();       // id → { x, z, r, invite, tenir, actif }
  const elements = new Map();    // id → objet 3D (pour montrer / cacher / effets)
  const feux = [];               // { flamme, lumiere, ph }
  const animes = [];             // fonctions (dt, t) → bool (false = terminé)
  let etoiles = null;
  const listeners = {};
  const emit = (type, d) => (listeners[type] || []).forEach((f) => f(d));

  // ---------- joueur ----------
  const J = { x: 0, z: 0, y: 0, lacet: 0, tangage: 0, bloque: false, course: false, phase: 0, chute: null, porte: null, vehicule: null, dans: new Set(), vu: 0 };
  const touches = new Set(), joy = { x: 0, y: 0, actif: false, id: null }, regard = { id: null, x: 0, y: 0 };
  let verrou = false, glisse = null;

  // ---------- relief du sol ----------
  function distSeg(x, z, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    return Math.hypot(x - ax - t * dx, z - az - t * dz);
  }
  function fabriquerHauteur(d) {
    const collines = d.elements.filter((e) => e.type === 'colline'), mers = d.elements.filter((e) => e.type === 'mer'), plats = d.elements.filter((e) => e.type === 'plateau');
    const rv = d.elements.filter((e) => e.type === 'ravin');
    const ondule = d.ondulation ?? 0.25;
    return (x, z) => {
      let h = ondule * (Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.13) + 0.5 * Math.sin(x * 0.37 + z * 0.21));
      for (const c of collines) { const d2 = ((x - c.x) ** 2 + (z - c.z) ** 2) / (c.r * c.r); if (d2 < 9) h += c.h * Math.exp(-d2); }
      for (const p of plats) { const d = Math.max(Math.abs(x - p.x) - p.w / 2, Math.abs(z - p.z) - p.d / 2); h += p.h * (1 - lisse(0, p.pente || 6, d)); }
      for (const r of rv) { const dd = distSeg(x, z, r.de[0], r.de[1], r.a[0], r.a[1]), l = r.largeur / 2; if (dd < l) h -= r.profondeur * (1 - (dd / l) ** 2); }
      for (const m of mers) {
        const dx = Math.max(m.x1 - x, 0, x - m.x2), dz = Math.max(m.z1 - z, 0, z - m.z2), dedans = x > m.x1 && x < m.x2 && z > m.z1 && z < m.z2;
        const prof = dedans ? Math.min(x - m.x1, m.x2 - x, z - m.z1, m.z2 - z) : -Math.hypot(dx, dz);
        h = h + (-3 - h) * lisse(-2, m.pente || 10, prof);
      }
      return h;
    };
  }
  const sol = (x, z) => hauteurBase(x, z);

  // ---------- modèles ----------
  // Silhouette sans visage : robe en cloche, tête entièrement couverte (aucun trait), bras le long du corps.
  function silhouette(p = {}) {
    const g = new THREE.Group(), s = (p.taille || 1.75) / 1.75;
    const habit = p.habit || HABITS[Math.floor(Math.random() * HABITS.length)], coiffe = p.coiffe || COIFFES[Math.floor(Math.random() * COIFFES.length)];
    const profil = [[0, 0], [0.31, 0.02], [0.28, 0.45], [0.23, 0.95], [0.21, 1.22], [0.24, 1.36], [0.13, 1.47], [0.06, 1.5], [0, 1.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const robe = new THREE.Mesh(new THREE.LatheGeometry(profil, 12), M(habit)); robe.castShadow = true; g.add(robe);
    if (p.riche) {
      const or = M('#C9A043', { metalness: 0.5, roughness: 0.4 });
      const bord = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 20), or); bord.rotation.x = Math.PI / 2; bord.position.y = 0.08; g.add(bord);
      const ceinture = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.02, 6, 18), or); ceinture.rotation.x = Math.PI / 2; ceinture.position.y = 1.0; g.add(ceinture);
    }
    const tete = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), M(p.tete_nue ? '#9C7A5E' : coiffe)); tete.position.y = 1.61; tete.castShadow = true; g.add(tete);
    if (!p.tete_nue) {
      const long = p.voile === 'long';
      const voile = new THREE.Mesh(new THREE.ConeGeometry(long ? 0.22 : 0.16, long ? 0.62 : 0.34, 10, 1, true), M(coiffe, { side: THREE.DoubleSide })); voile.position.set(0, long ? 1.4 : 1.5, -0.03); g.add(voile);
    }
    if (p.tete_nue || p.voile === 'long') { /* ni couronne ni cordon */ } else if (p.riche) {
      const couronne = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.09, 12, 1, true), M('#D8B04A', { metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide })); couronne.position.y = 1.72; g.add(couronne);
    } else {
      const agal = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 6, 16), M('#2B2420')); agal.rotation.x = Math.PI / 2; agal.position.y = 1.69; g.add(agal);
    }
    const bras = [-1, 1].map((c) => {
      const pivot = new THREE.Group(); pivot.position.set(c * 0.24, 1.33, 0);
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.48, 3, 6), M(habit)); b.position.y = -0.3; b.castShadow = true; pivot.add(b);
      g.add(pivot); return pivot;
    });
    if (p.accessoire === 'lance') {
      const l = new THREE.Group(); l.position.set(0.3, 0, 0.1);
      l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 5), M('#6B4A2E')).translateY(1.15));
      l.add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), M('#9AA0A6', { metalness: 0.6, roughness: 0.4 })).translateY(2.4));
      g.add(l);
    } else if (p.accessoire === 'baton') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.7, 5), M('#7A5634')).translateX(0.3).translateY(0.85).translateZ(0.12));
    } else if (p.accessoire === 'panier') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.2, 10), M('#A9834F')).translateY(1.83));
    } else if (p.accessoire === 'lanterne') {
      const lt = new THREE.Group(); lt.position.set(0.32, 0.95, 0.25);
      lt.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), lumineux('#FFC062')));
      g.add(lt); g.userData.lanterne = lt;
    }
    g.scale.setScalar(s);
    g.userData = { ...g.userData, bras, robe, type: 'silhouette' };
    return g;
  }
  function petitBetail(type) {
    const g = new THREE.Group(), c = type === 'mouton' ? (Math.random() < 0.8 ? '#E9E1D2' : '#3A3430') : ['#6B4A33', '#2E2622', '#C9B08A', '#8C6A4A'][Math.floor(Math.random() * 4)];
    const corps = new THREE.Mesh(type === 'mouton' ? new THREE.SphereGeometry(0.42, 8, 6) : new THREE.BoxGeometry(0.42, 0.42, 0.8), M(c)); corps.scale.set(1, type === 'mouton' ? 0.85 : 1, type === 'mouton' ? 1.4 : 1); corps.position.y = 0.62; corps.castShadow = true; g.add(corps);
    const tete = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.3), M(type === 'mouton' ? '#3A3430' : c)); tete.position.set(0, 0.86, 0.52); g.add(tete);
    if (type === 'chevre') [-0.06, 0.06].forEach((x) => g.add(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.2, 5), M('#3B3128')).translateX(x).translateY(1.02).translateZ(0.48)));
    const pattes = [[-0.13, -0.25], [0.13, -0.25], [-0.13, 0.25], [0.13, 0.25]].map(([x, z]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.07), M('#3B3128')); p.position.set(x, 0.22, z); g.add(p); return p; });
    g.userData = { pattes, type };
    return g;
  }
  // Éléphant (Mahmûd, l'éléphant d'Abraha selon Ibn Ishâq)
  function elephant() {
    const g = new THREE.Group(), gris = M('#8E8A84'), sombre = M('#77726C');
    const corps = new THREE.Group(); g.add(corps);
    const tronc = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), gris); tronc.scale.set(1.25, 1.15, 1.9); tronc.position.y = 2.35; tronc.castShadow = true; corps.add(tronc);
    const tete = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), gris); tete.position.set(0, 2.9, 1.9); tete.castShadow = true; corps.add(tete);
    [-1, 1].forEach((c) => { const o = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), M('#857F78', { side: THREE.DoubleSide })); o.position.set(c * 0.75, 2.95, 1.6); o.rotation.y = c * 1.2; o.scale.set(0.8, 1, 1); corps.add(o); });
    const courbe = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 2.6, 2.55), new THREE.Vector3(0, 1.8, 2.85), new THREE.Vector3(0, 0.9, 2.8), new THREE.Vector3(0, 0.45, 2.55)]);
    const trompe = new THREE.Mesh(new THREE.TubeGeometry(courbe, 12, 0.18, 8, false), sombre); trompe.castShadow = true; corps.add(trompe);
    [-1, 1].forEach((c) => { const d = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.9, 6), M('#EFE6D2')); d.position.set(c * 0.32, 2.3, 2.45); d.rotation.x = 1.9; corps.add(d); });
    const tapis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 2.0), M('#7A2E3A')); tapis.position.set(0, 3.45, -0.1); corps.add(tapis);
    const pattes = [[-0.65, -1.1], [0.65, -1.1], [-0.65, 1.0], [0.65, 1.0]].map(([x, z]) => {
      const piv = new THREE.Group(); piv.position.set(x, 1.7, z);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.36, 1.7, 10), gris); p.position.y = -0.85; p.castShadow = true; piv.add(p); g.add(piv); return piv;
    });
    g.userData = { corps, pattes, type: 'elephant' };
    return g;
  }
  function palmier(h = 7 + Math.random() * 3) {
    const g = new THREE.Group(), pench = (Math.random() - 0.5) * 0.15;
    const tronc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 7, 6), M('#7A5E43')); tronc.position.y = h / 2; tronc.rotation.z = pench; tronc.castShadow = true; g.add(tronc);
    const sommet = new THREE.Vector3(-Math.sin(pench) * h, h, 0);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + Math.random() * 0.3, f = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.6, 4, 1), M(i % 2 ? '#4E7A3A' : '#5E8A43'));
      f.scale.set(1, 1, 0.12); f.position.copy(sommet); f.rotation.set(0, -a, 0); f.rotateX(Math.PI / 2 - 0.55 - Math.random() * 0.25); f.translateY(1.6); f.castShadow = true; g.add(f);
    }
    return g;
  }
  function acacia() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 6), M('#6A5038')).translateY(1.2));
    const c = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.1, 0.7, 9), M('#6E7E45')); c.position.y = 2.7; c.castShadow = true; g.add(c);
    return g;
  }
  function maison(e) {
    const g = new THREE.Group(), w = e.w || 6, d = e.d || 6, h = e.h || 3.2, coul = e.c || BOUE[Math.floor(Math.random() * BOUE.length)];
    const corps = new THREE.Mesh(new THREE.BoxGeometry(w, h + 1, d), M(coul)); corps.position.y = (h - 1) / 2; corps.castShadow = corps.receiveShadow = true; g.add(corps);
    const parapet = M(coul);
    [[0, d / 2, w, 0.25], [0, -d / 2, w, 0.25], [w / 2, 0, 0.25, d], [-w / 2, 0, 0.25, d]].forEach(([x, z, ww, dd]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.45, dd), parapet); p.position.set(x, h + 0.22, z); g.add(p); });
    if (e.palmes !== false) { const t = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.12, d - 0.3), M('#6E5638')); t.position.y = h + 0.06; g.add(t); }
    if (e.etage) { const u = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 2.6, d * 0.5), M(coul)); u.position.set(w * 0.2, h + 1.3, -d * 0.2); u.castShadow = true; g.add(u); }
    const cote = { s: [0, d / 2 + 0.02, 0], n: [0, -d / 2 - 0.02, Math.PI], e: [w / 2 + 0.02, 0, Math.PI / 2], o: [-w / 2 - 0.02, 0, -Math.PI / 2] }[e.porte || 's'];
    if (cote) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0), M('#2E2218')); p.position.set(cote[0], 1.0, cote[1]); p.rotation.y = cote[2]; g.add(p);
      const lin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.2), M('#6A4E33')); lin.position.set(cote[0], 2.08, cote[1]); lin.rotation.y = cote[2]; g.add(lin);
    }
    for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), M('#2A2018')); f.position.set(-w / 2 - 0.02, h - 0.9, (i - 0.5) * d * 0.5); f.rotation.y = -Math.PI / 2; g.add(f); }
    return g;
  }
  function tente(e) {
    const g = new THREE.Group(), w = e.w || 4, d = e.d || 5, h = e.h || 2.4;
    const forme = new THREE.Shape(); forme.moveTo(-w / 2, 0); forme.lineTo(0, h); forme.lineTo(w / 2, 0); forme.lineTo(-w / 2, 0);
    const geo = new THREE.ExtrudeGeometry(forme, { depth: d, bevelEnabled: false }); geo.translate(0, 0, -d / 2);
    const t = new THREE.Mesh(geo, M(e.c || '#CDB892', { side: THREE.DoubleSide })); t.castShadow = t.receiveShadow = true; g.add(t);
    const entree = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.4, h * 0.6), M('#2E2218')); entree.position.set(0, h * 0.3, d / 2 + 0.03); g.add(entree);
    if (e.riche) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h + 2), M('#6B4A2E')); m.position.set(0, (h + 2) / 2, d / 2); g.add(m);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), M(e.fanion || '#7A2E3A', { side: THREE.DoubleSide })); f.position.set(0.62, h + 1.6, d / 2); g.add(f);
    }
    return g;
  }
  function puits() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.8, 14, 1, true), M('#A9947A', { side: THREE.DoubleSide })); m.position.y = 0.4; m.castShadow = true; g.add(m);
    const b = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 6, 18), M('#A9947A')); b.rotation.x = Math.PI / 2; b.position.y = 0.8; g.add(b);
    const eau = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), M('#2D4A55')); eau.rotation.x = -Math.PI / 2; eau.position.y = 0.1; g.add(eau);
    [-1, 1].forEach((c) => g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.12), M('#6B4A2E')).translateX(c * 0.95).translateY(1.0)));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 6), M('#6B4A2E')).rotateZ(Math.PI / 2).translateX(1.95));
    return g;
  }
  // Ka'ba : avant la reconstruction par Quraysh, basse, porte au ras du sol, sans Hijr séparé ;
  // après (vers 605), plus haute, porte surélevée, Hijr laissé hors des murs. Étoffe rayée du Yémen (à vérifier).
  function kaba(e) {
    const g = new THREE.Group(), h = e.h || 9, apres = e.reconstruite !== false && h >= 7;
    // étoffe rayée, ou pierre nue pendant le chantier
    const etoffe = e.pierre ? M('#8E806F') : new THREE.MeshStandardMaterial({ map: textureRayures(e.rayures || ['#2B2524', '#3A2F2A', '#2B2524', '#5A4632']), roughness: 0.95 });
    const corps = new THREE.Mesh(new THREE.BoxGeometry(11, h, 12), etoffe); corps.position.y = h / 2; corps.castShadow = corps.receiveShadow = true; g.add(corps);
    const toit = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.3, 12.2), M('#5B4A3A')); toit.position.y = h + 0.1; g.add(toit);
    const porteY = apres ? 2.2 : 1.1;
    const porte = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.2, 0.15), M('#4A3423')); porte.position.set(-1.8, porteY, 6.03); g.add(porte);
    const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12), M('#C9A043', { metalness: 0.6, roughness: 0.4 })); anneau.position.set(-1.8, porteY - 0.1, 6.13); g.add(anneau);
    const pierre = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M('#18110E', { roughness: 0.4 })); pierre.scale.set(1, 1.2, 0.5); pierre.position.set(-5.5, 1.5, 6.0); g.add(pierre);
    if (apres && e.hijr !== false) {
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (i / 10), x = Math.cos(a) * 5.6, z = -6 - Math.sin(a) * 4.2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 0.9), M('#D9CDB6')); b.position.set(x, 0.65, z); b.rotation.y = -a + Math.PI / 2; b.castShadow = true; g.add(b);
      }
    }
    if (e.chantier) { // murs en cours : échafaudages de bois
      for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, h + 1.5, 0.15), M('#7A5634')); p.position.set(-6 + (i % 3) * 6, (h + 1.5) / 2, i < 3 ? 6.6 : -6.6); g.add(p); }
    }
    g.userData.porte = new THREE.Vector3(-1.8, porteY, 6.2);
    return g;
  }
  function montagne(e) {
    // relief irrégulier, mais identique pour les sommets partagés (sinon les faces se séparent)
    const geo = new THREE.IcosahedronGeometry(1, 3), pos = geo.attributes.position, gr = (e.x || 0) * 0.013 + (e.z || 0) * 0.029;
    const bruit = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + gr) * 43758.5453; return v - Math.floor(v); };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = 0.84 + bruit(x, y, z) * 0.3 + 0.08 * Math.sin(x * 3 + z * 2 + gr);
      pos.setXYZ(i, x * k, Math.max(-0.2, y) * (0.88 + bruit(z, x, y) * 0.24), z * k);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M(e.c || '#9A7A5C')); m.scale.set(e.r, e.h, e.r * (e.allonge || 1)); m.rotation.y = (e.rot || 0) * RAD; m.receiveShadow = true; m.castShadow = e.r < 60;
    return m;
  }
  function rocher(s = 1) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M('#8F765E')); m.scale.y = 0.7; m.castShadow = true; return m; }
  function etal(e) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.2), M('#8B6A47')).translateY(0.4));
    [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]].forEach(([x, z]) => g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), M('#6B4A2E')).translateX(x).translateY(1.1).translateZ(z)));
    const toile = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.8), M(e.c || '#B5552F', { side: THREE.DoubleSide })); toile.rotation.x = -Math.PI / 2 + 0.25; toile.position.y = 2.2; g.add(toile);
    const cols = e.marchandises || ['#7A4A2A', '#C9A043', '#8E3B2E', '#4E6B3A'];
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), M(cols[i % cols.length])); b.position.set(-0.9 + (i % 3) * 0.9, 0.95, i < 3 ? -0.25 : 0.25); b.scale.y = 0.7; g.add(b); }
    return g;
  }
  function feu(e) {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), M('#5A5048')).translateX(Math.cos(a) * 0.45).translateY(0.08).translateZ(Math.sin(a) * 0.45)); }
    const flamme = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 7), lumineux('#FF9A3C', { transparent: true, opacity: 0.92 })); flamme.position.y = 0.45; g.add(flamme);
    const lum = new THREE.PointLight(0xFF9A4A, 0, 14, 1.6); lum.position.y = 1.0; g.add(lum);
    feux.push({ flamme, lumiere: lum, ph: Math.random() * 6, force: e.force || 6, x: e.x, z: e.z });
    return g;
  }
  function lanterne(e) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), M('#4A3423')).translateY(1.1));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.28), lumineux('#FFC062')).translateY(2.3));
    const lum = new THREE.PointLight(0xFFB45A, 0, 12, 1.6); lum.position.y = 2.3; g.add(lum);
    feux.push({ flamme: null, lumiere: lum, ph: Math.random() * 6, force: 3, x: e.x, z: e.z });
    return g;
  }
  function jarre() {
    const profil = [[0, 0], [0.16, 0.02], [0.28, 0.25], [0.3, 0.45], [0.2, 0.7], [0.12, 0.78], [0.14, 0.84], [0, 0.84]].map(([r, y]) => new THREE.Vector2(r, y));
    const m = new THREE.Mesh(new THREE.LatheGeometry(profil, 10), M('#B0723F')); m.castShadow = true; return m;
  }
  function idole(e) {
    const g = new THREE.Group(), h = e.h || 1.6 + Math.random();
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.5 + Math.random() * 0.3, h, 0.4), M(e.c || ['#8E8073', '#7A6B5C', '#A39484', '#6E5E50'][Math.floor(Math.random() * 4)])); s.position.y = h / 2; s.castShadow = true; g.add(s);
    const tete = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), M('#7A6B5C')); tete.position.y = h + 0.15; g.add(tete);
    return g;
  }
  // Panneau indicateur : texte en français (et en arabe) peint sur une planche.
  function panneau(e) {
    const g = new THREE.Group(), c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d'); x.fillStyle = e.fond || '#F4EFE2'; x.fillRect(0, 0, 512, 256);
    x.strokeStyle = e.bord || '#2F6B4F'; x.lineWidth = 14; x.strokeRect(7, 7, 498, 242);
    x.fillStyle = e.encre || '#1F2A24'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const l = String(e.texte || '').split('\n');
    if (e.ar) { x.font = '600 58px Amiri, serif'; x.fillText(e.ar, 256, 74); }
    x.font = `700 ${l.length > 1 ? 40 : 46}px "Plus Jakarta Sans", sans-serif`;
    l.forEach((t, i) => x.fillText(t, 256, (e.ar ? 160 : 128) + (i - (l.length - 1) / 2) * 46));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const h = e.h || 2.2;
    [-0.9, 0.9].forEach((dx) => g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), M('#5A4632')).translateX(dx).translateY(h / 2)));
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.06), [M('#E9E2D0'), M('#E9E2D0'), M('#E9E2D0'), M('#E9E2D0'), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 })]);
    p.position.y = h - 0.3; p.castShadow = true; g.add(p);
    return g;
  }
  function cairn() { const g = new THREE.Group(); for (let i = 0; i < 4; i++) g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 - i * 0.06, 0), M('#9C8C78')).translateY(0.25 + i * 0.4)); g.children.forEach((c) => (c.castShadow = true)); return g; }
  function cloture(e) { // enclos de cordes : poteaux et cordes, ouverture côté « ouverture »
    const g = new THREE.Group(), { w = 12, d = 10 } = e, poteaux = [];
    const cotes = [[[-w / 2, -d / 2], [w / 2, -d / 2]], [[w / 2, -d / 2], [w / 2, d / 2]], [[w / 2, d / 2], [-w / 2, d / 2]], [[-w / 2, d / 2], [-w / 2, -d / 2]]];
    cotes.forEach(([a, b], k) => {
      if (['n', 'e', 's', 'o'][k] === e.ouverture) return;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(L / 2));
      for (let i = 0; i <= n; i++) poteaux.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 4), M('#BFA77E')); c.position.set((a[0] + b[0]) / 2, 0.9, (a[1] + b[1]) / 2); c.rotation.z = Math.PI / 2; c.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); g.add(c);
      solidesLocaux.push({ a, b });
    });
    poteaux.forEach(([x, z]) => g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.2, 5), M('#6B4A2E')).translateX(x).translateY(0.6).translateZ(z)));
    return g;
  }
  let solidesLocaux = [];
  const nomsLieux = [];
  const OBJETS = {
    rouleau: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8), M('#E6D8B8')).rotateZ(Math.PI / 2)); g.add(new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 5, 10), M('#8E3B2E')).rotateY(Math.PI / 2)); return g; },
    outre: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M('#7A5634')); m.scale.set(1, 0.7, 1.4); return m; },
    pierre: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.38), M('#8E7F6E')); return m; },
    caillou: () => new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), M('#6E6458')),
    dattes: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.18, 10), M('#A9834F'))); for (let i = 0; i < 6; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), M('#5A2E1C')).translateX(Math.cos(i) * 0.1).translateY(0.1).translateZ(Math.sin(i) * 0.1)); return g; },
    sac: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), M('#B89C6E')); m.scale.y = 1.2; return m; },
    tissu: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.45), M('#E8E2D2')); return m; },
    pelle: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 5), M('#7A5634')).translateY(0.6)); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.04), M('#8C8F92'))); return g; },
  };

  // ---------- construction d'une scène ----------
  function vider() {
    if (monde) { scene.remove(monde); monde.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    monde = new THREE.Group(); scene.add(monde);
    solides.length = zones.length = ravins.length = recifs.length = feux.length = animes.length = 0;
    pnjs.clear(); objets.clear(); lieux.clear(); elements.clear(); $('.m-noms').innerHTML = ''; nomsLieux.length = 0;
    if (barque) { barque = null; J.vehicule = null; }
    if (etoiles) { scene.remove(etoiles); etoiles = null; }
    J.dans.clear(); J.chute = null; J.porte = null; porteObj && camera.remove(porteObj); porteObj = null; J.vehicule = null; J.eau = null;
  }
  let groupe = null; // groupe où poser le décor (le décor fixe est fusionné après construction)
  function poser(o, x, z, r = 0, dy = 0) { o.position.set(x, sol(x, z) + dy, z); o.rotation.y = -r * RAD; (groupe || monde).add(o); return o; }
  // Fusionne le décor fixe par matériau : quelques appels de dessin au lieu de milliers.
  function fusionner(g) {
    g.updateMatrixWorld(true);
    const parMat = new Map();
    g.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || o.material.map) return;
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      if (!parMat.has(o.material)) parMat.set(o.material, []);
      parMat.get(o.material).push(geo);
    });
    const out = new THREE.Group();
    for (const [m, geos] of parMat) {
      const mg = mergeGeometries(geos, false); geos.forEach((x) => x.dispose());
      if (!mg) continue;
      const mesh = new THREE.Mesh(mg, m); mesh.castShadow = mesh.receiveShadow = true; out.add(mesh);
    }
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    return out;
  }
  const FIXES = new Set(['maison', 'mur', 'tente', 'palmier', 'palmeraie', 'acacia', 'rocher', 'rochers', 'cairn', 'jarre', 'montagne', 'enclos', 'puits', 'etal', 'boite', 'idole']);
  function boite(x, z, w, d, r = 0) { solides.push({ type: 'boite', x, z, hx: w / 2, hz: d / 2, r: -r * RAD }); }
  function cercle(x, z, r) { solides.push({ type: 'cercle', x, z, r }); }

  function ambiance(nom) {
    const A = AMBIANCES[nom] || AMBIANCES.jour;
    const c = document.createElement('canvas'); c.width = 2; c.height = 256; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, A.haut); gr.addColorStop(0.62, A.bas); gr.addColorStop(1, A.bas);
    x.fillStyle = gr; x.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
    soleil.color.setHex(A.soleil); soleil.intensity = A.si; hemi.color.setHex(A.hc); hemi.groundColor.setHex(A.hs); hemi.intensity = A.hi;
    dirSoleil.set(...A.dir).normalize();
    scene.fog.color.setHex(A.brume); scene.fog.near = A.b0; scene.fog.far = A.b1;
    const nuit = !!A.etoiles; J.nuit = nuit;
    feux.forEach((f) => { f.lumiere.intensity = nuit || nom === 'soir' || nom === 'aube' ? f.force : f.force * 0.4; });
    if (etoiles) { scene.remove(etoiles); etoiles = null; }
    if (nuit) {
      const n = 900, p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, el = Math.asin(Math.random() * 0.95 + 0.05); p.set([Math.cos(a) * Math.cos(el) * 800, Math.sin(el) * 800, Math.sin(a) * Math.cos(el) * 800], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      etoiles = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xE8EEFF, size: 1.6, sizeAttenuation: false, fog: false }));
      const lune = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: 0xF4F1E6, fog: false })); lune.position.set(-300, 420, -520); etoiles.add(lune);
      scene.add(etoiles);
    }
    J.ambiance = nom;
  }

  function charger(d) {
    vider(); camera.fov = 70; camera.updateProjectionMatrix();
    def = d;
    hauteurBase = fabriquerHauteur(d);
    // sol
    const L = d.taille || 260, n = Math.min(230, Math.ceil(L / 1.2));
    const geo = new THREE.PlaneGeometry(L, L, n, n); geo.rotateX(-Math.PI / 2); geo.translate(d.centre ? d.centre[0] : 0, 0, d.centre ? d.centre[1] : 0);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), cs = new THREE.Color(d.sable || '#D6B98C'), cr = new THREE.Color('#A8865F'), cc = new THREE.Color('#E5D3AE'), cv = new THREE.Color('#7E8E4E'), ch = new THREE.Color();
    const chemins = d.elements.filter((e) => e.type === 'chemin'), vertes = d.elements.filter((e) => e.type === 'herbe');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = sol(x, z); pos.setY(i, y);
      const pente = Math.min(1, Math.hypot(sol(x + 1, z) - y, sol(x, z + 1) - y));
      ch.copy(cs).lerp(cr, lisse(0.25, 0.8, pente)).multiplyScalar(0.94 + 0.12 * Math.sin(x * 1.7 + z * 2.3) * Math.cos(z * 0.9));
      for (const c of chemins) for (let k = 0; k < c.points.length - 1; k++) { const dd = distSeg(x, z, ...c.points[k], ...c.points[k + 1]); if (dd < (c.l || 3)) ch.lerp(cc, 0.6 * (1 - dd / (c.l || 3))); }
      for (const v of vertes) { const dd = Math.hypot(x - v.x, z - v.z); if (dd < v.r) ch.lerp(cv, 0.7 * (1 - lisse(v.r * 0.5, v.r, dd))); }
      if (y < -0.6) ch.lerp(new THREE.Color('#8A7458'), 0.6);
      col.set([ch.r, ch.g, ch.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const terre = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })); terre.receiveShadow = true; monde.add(terre);
    // éléments : le décor fixe (sans identifiant) est fusionné
    const fixe = new THREE.Group();
    for (const e of d.elements) { groupe = !e.id && FIXES.has(e.type) ? fixe : null; construireElement(e); }
    groupe = null; monde.add(fusionner(fixe));
    for (const p of d.pnj || []) ajouterPnj(p);
    for (const t of d.troupeaux || []) ajouterTroupeau(t);
    for (const f of d.foules || []) ajouterFoule(f);
    for (const o of d.objets || []) ajouterObjet(o);
    for (const l of d.lieux || []) lieux.set(l.id, { ...l, r: l.r || 2.4, actif: l.actif !== false });
    ambiance(d.ambiance || 'jour');
    const dp = d.depart || { x: 0, z: 0, cap: 0 };
    teleporter(dp.x, dp.z, dp.cap || 0);
  }
  function construireElement(e) {
    let o = null; const n0 = solides.length;
    switch (e.type) {
      case 'maison': o = poser(maison(e), e.x, e.z, e.r || 0, -0.5); boite(e.x, e.z, e.w || 6, e.d || 6, e.r || 0); break;
      case 'mur': {
        const [ax, az] = e.de, [bx, bz] = e.a, L = Math.hypot(bx - ax, bz - az), h = e.h || 2.2, ep = e.e || 0.6, a = Math.atan2(bz - az, bx - ax);
        const m = new THREE.Mesh(new THREE.BoxGeometry(L, h + 1, ep), M(e.c || '#BF9A6B')); m.castShadow = m.receiveShadow = true;
        o = poser(m, (ax + bx) / 2, (az + bz) / 2, a / RAD, (h - 1) / 2 - 0.3);
        solides.push({ type: 'boite', x: (ax + bx) / 2, z: (az + bz) / 2, hx: L / 2, hz: ep / 2, r: a }); break;
      }
      case 'tente': o = poser(tente(e), e.x, e.z, e.r || 0); boite(e.x, e.z, e.w || 4, e.d || 5, e.r || 0); break;
      case 'palmier': o = poser(palmier(e.h), e.x, e.z); cercle(e.x, e.z, 0.35); break;
      case 'palmeraie': for (let i = 0; i < (e.n || 20); i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * e.r, x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r; poser(palmier(), x, z); cercle(x, z, 0.35); } break;
      case 'acacia': o = poser(acacia(), e.x, e.z); cercle(e.x, e.z, 0.3); break;
      case 'puits': o = poser(puits(), e.x, e.z); cercle(e.x, e.z, 1.15); break;
      case 'kaba': o = poser(kaba(e), e.x, e.z, e.r ?? 0); boite(e.x, e.z, 11, 12, e.r ?? 0); break;
      case 'montagne': o = poser(montagne(e), e.x, e.z, 0, -2); if (e.bloque !== false) cercle(e.x, e.z, e.r * 0.78); break;
      case 'rocher': o = poser(rocher(e.s || 1), e.x, e.z, Math.random() * 360, (e.s || 1) * 0.2); cercle(e.x, e.z, (e.s || 1) * 0.85); break;
      case 'rochers': for (let i = 0; i < (e.n || 10); i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * e.r, x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r, s = 0.4 + Math.random() * (e.s || 1.2); poser(rocher(s), x, z, Math.random() * 360, s * 0.2); if (s > 0.6) cercle(x, z, s * 0.8); } break;
      case 'etal': o = poser(etal(e), e.x, e.z, e.r || 0); boite(e.x, e.z, 2.6, 1.4, e.r || 0); break;
      case 'feu': o = poser(feu(e), e.x, e.z); cercle(e.x, e.z, 0.6); break;
      case 'lanterne': o = poser(lanterne(e), e.x, e.z); cercle(e.x, e.z, 0.2); break;
      case 'jarre': o = poser(jarre(), e.x, e.z); cercle(e.x, e.z, 0.32); break;
      case 'idole': o = poser(idole(e), e.x, e.z, Math.random() * 360); cercle(e.x, e.z, 0.4); break;
      case 'idoles': { // un cercle d'idoles autour d'un centre
        const g = new THREE.Group(); g.position.set(0, 0, 0); monde.add(g);
        for (let i = 0; i < (e.n || 24); i++) { const a = i / (e.n || 24) * Math.PI * 2, x = e.x + Math.cos(a) * e.r, z = e.z + Math.sin(a) * e.r; const id = idole({}); id.position.set(x, sol(x, z), z); id.rotation.y = -a; g.add(id); cercle(x, z, 0.4); }
        o = g; break;
      }
      case 'cairn': o = poser(cairn(), e.x, e.z); break;
      case 'enclos': solidesLocaux = []; o = poser(cloture(e), e.x, e.z, e.r || 0); solidesLocaux.forEach(({ a, b }) => { const r = -(e.r || 0) * RAD, c = Math.cos(r), s = Math.sin(r); const A = [e.x + a[0] * c - a[1] * s, e.z + a[0] * s + a[1] * c], Bp = [e.x + b[0] * c - b[1] * s, e.z + b[0] * s + b[1] * c]; solides.push({ type: 'boite', x: (A[0] + Bp[0]) / 2, z: (A[1] + Bp[1]) / 2, hx: Math.hypot(Bp[0] - A[0], Bp[1] - A[1]) / 2, hz: 0.15, r: Math.atan2(Bp[1] - A[1], Bp[0] - A[0]) }); }); break;
      case 'bateau': { const b = bateau(); b.scale.setScalar(e.s || 2); o = poser(b, e.x, e.z, e.r || 0, 0); o.position.y = e.y ?? -0.35; break; }
      case 'mer': { const w = e.x2 - e.x1, dd = e.z2 - e.z1; const m = new THREE.Mesh(new THREE.PlaneGeometry(w + 400, dd + 400, 1, 1), new THREE.MeshStandardMaterial({ color: '#3F8C93', roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.88 })); m.rotation.x = -Math.PI / 2; m.position.set((e.x1 + e.x2) / 2, -0.4, (e.z1 + e.z2) / 2); m.receiveShadow = true; monde.add(m); o = m; J.eau = -0.4; break; }
      case 'recif': { const g = new THREE.Group(); for (let i = 0; i < 4; i++) g.add(rocher(0.5 + Math.random() * 0.8).translateX((Math.random() - 0.5) * e.r).translateZ((Math.random() - 0.5) * e.r)); const ecume = new THREE.Mesh(new THREE.RingGeometry(e.r * 0.8, e.r * 1.1, 20), new THREE.MeshBasicMaterial({ color: '#F2F6F4', transparent: true, opacity: 0.6, side: THREE.DoubleSide })); ecume.rotation.x = -Math.PI / 2; ecume.position.y = 0.05; g.add(ecume); g.position.set(e.x, -0.4, e.z); monde.add(g); recifs.push({ id: e.id, x: e.x, z: e.z, r: e.r }); o = g; break; }
      case 'boite': { const m = new THREE.Mesh(new THREE.BoxGeometry(e.w || 1, e.h || 1, e.d || 1), M(e.c || '#8B6A47')); m.castShadow = m.receiveShadow = true; o = poser(m, e.x, e.z, e.r || 0, (e.h || 1) / 2 + (e.dy || 0)); if (e.solide !== false && (e.h || 1) > 0.3) boite(e.x, e.z, e.w || 1, e.d || 1, e.r || 0); break; }
      case 'panneau': o = poser(panneau(e), e.x, e.z, e.r || 0); cercle(e.x, e.z, 0.2); break;
      case 'lumiere': { // halo doré (présence hors champ : on ne montre jamais la personne)
        const g = new THREE.Group();
        const R = e.r || 0.9, H = e.h || 6, voile = (r, op) => new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, H, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xFFE2A0, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })).translateY(H / 2);
        g.add(voile(R * 0.35, 0.16), voile(R, 0.06), voile(R * 1.8, 0.03));
        const lum = new THREE.PointLight(0xFFD27A, 6, 16, 1.6); lum.position.y = 1.6; g.add(lum);
        o = poser(g, e.x, e.z); break;
      }
      case 'manteau': { // manteau étendu, la Pierre noire posée au centre
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 2.2), M(e.c || '#E6DCC6')));
        const pn = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), M('#18110E', { roughness: 0.35 })); pn.scale.set(1.2, 0.7, 1); pn.position.y = 0.18; g.add(pn);
        o = poser(g, e.x, e.z, e.r || 0, 0.05); break;
      }
      case 'zone': zones.push(e.r ? { id: e.id, x: e.x, z: e.z, r: e.r } : { id: e.id, x1: e.x1, z1: e.z1, x2: e.x2, z2: e.z2 }); break;
      case 'ravin': ravins.push({ id: e.id || 'ravin', ax: e.de[0], az: e.de[1], bx: e.a[0], bz: e.a[1], l: e.largeur, p: e.profondeur }); break;
      case 'objet': o = poser(OBJETS[e.modele](), e.x, e.z, e.r || 0, e.dy || 0.1); break;
      default: break;
    }
    if (o && e.id) { elements.set(e.id, o); for (let i = n0; i < solides.length; i++) solides[i].ref = o; }
    if (e.nom) { // nom flottant au-dessus d'un lieu (maison, puits, carrière…)
      const el = document.createElement('span'); el.className = 'lieu'; el.textContent = e.nom; $('.m-noms').appendChild(el);
      nomsLieux.push({ el, x: e.x, z: e.z, y: (e.hauteur ?? (e.h || 3.5)) + 0.8, o });
    }
    if (o && e.visible === false) o.visible = false;
  }

  // ---------- personnages et animaux ----------
  function modelePnj(p) {
    switch (p.modele) {
      case 'chameau': {
        const c = chameau(!!p.charge);
        if (p.parure) { // colliers (qalâ'id) des bêtes destinées au sacrifice
          [0, 1].forEach((k) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.2 - k * 0.03, 0.035, 6, 14), M(k ? '#C9A043' : '#B5552F')); t.position.set(0, 2.0 + k * 0.25, 1.05 + k * 0.12); t.rotation.x = Math.PI / 2 - 0.55; c.add(t); });
          const ruban = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.06), M('#E8E2D2')); ruban.position.set(0, 1.85, 1.15); c.add(ruban);
        }
        return c;
      }
      case 'cheval': return cheval(p.robe || 0);
      case 'chevre': case 'mouton': return petitBetail(p.modele);
      case 'elephant': return elephant();
      default: return silhouette(p);
    }
  }
  function ajouterPnj(p) {
    const obj = modelePnj(p); monde.add(obj);
    const n = { id: p.id, def: p, obj, x: p.x, z: p.z, cap: Math.PI - (p.cap || 0) * RAD, chemin: p.chemin ? p.chemin.map((c) => [...c]) : null, k: 0, v: p.vitesse || (p.modele === 'elephant' ? 0.9 : 1.2), boucle: !!p.boucle, attente: 0, suivre: p.suivre ? { ecart: p.suivre.ecart || 2.5, decal: p.suivre.decal || [0, 0] } : null, phase: Math.random() * 6, visible: p.visible !== false, invite: p.invite || null, garde: p.garde || null, cone: null, errer: p.errer || null, assis: !!p.assis };
    if (n.garde && p.cone !== false) n.cone = coneVision(n.garde); // champ de vision visible : on sait où ne pas passer
    if (n.cone) obj.add(n.cone);
    obj.visible = n.visible;
    placerPnj(n, 0);
    pnjs.set(p.id, n);
    if (p.nom) { n.etiquette = document.createElement('span'); n.etiquette.textContent = p.nom; if (p.nom_ar) n.etiquette.insertAdjacentHTML('beforeend', `<i lang="ar">${p.nom_ar}</i>`); $('.m-noms').appendChild(n.etiquette); n.hauteur = p.modele === 'elephant' ? 4.6 : p.modele === 'chameau' ? 3 : (p.taille || 1.75) * (p.assis ? 0.62 : 1) + 0.35; }
    if (p.assis && obj.userData.robe) obj.scale.y *= 0.62;
    return n;
  }
  function ajouterTroupeau(t) {
    for (let i = 0; i < (t.n || 8); i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (t.r || 5);
      ajouterPnj({ id: `${t.id}#${i}`, groupe: t.id, modele: t.modele || 'chameau', x: t.x + Math.cos(a) * r, z: t.z + Math.sin(a) * r, cap: Math.random() * 360, charge: t.charge, parure: t.parure, vitesse: 1.5 + Math.random() * 0.5, visible: t.visible, invite: t.invite, errer: t.errer === false ? null : { r: t.r || 5, x: t.x, z: t.z } });
    }
  }
  function ajouterFoule(f) {
    for (let i = 0; i < (f.n || 10); i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * f.r;
      ajouterPnj({ id: `${f.id}#${i}`, groupe: f.id, x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r, cap: Math.random() * 360, habit: f.habits ? f.habits[i % f.habits.length] : undefined, coiffe: f.coiffes ? f.coiffes[i % f.coiffes.length] : undefined, accessoire: f.accessoire, invite: f.invite, vitesse: 0.8 + Math.random() * 0.6, visible: f.visible, errer: f.errer === false ? null : { r: f.r, x: f.x, z: f.z }, assis: f.assis && Math.random() < 0.5 });
    }
  }
  const membres = (id) => [...pnjs.values()].filter((n) => n.id === id || n.def.groupe === id);
  function coneVision(gd) {
    const L = gd.portee || 14, a = (gd.angle || 70) * RAD;
    const geo = new THREE.ConeGeometry(Math.tan(a / 2) * L, L, 20, 1, true); geo.translate(0, -L / 2, 0); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xFFC46B, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.y = 1.2; m.rotation.x = -0.12; return m;
  }
  function placerPnj(n, dt) {
    const o = n.obj; o.position.set(n.x, sol(n.x, n.z), n.z);
    let d = n.cap - o.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); o.rotation.y += d * Math.min(1, dt * 6 || 1);
  }
  function majPnj(n, dt, t) {
    if (!n.visible) return;
    let cible = null;
    if (n.suivre) {
      const dx = J.x - n.x, dz = J.z - n.z, d = Math.hypot(dx, dz);
      if (d > n.suivre.ecart) cible = [J.x - dx / d * n.suivre.ecart + n.suivre.decal[0], J.z - dz / d * n.suivre.ecart + n.suivre.decal[1]];
    } else if (n.aller) cible = n.aller[0];
    else if (n.chemin && n.chemin.length) { if (n.attente > 0) n.attente -= dt; else cible = n.chemin[n.k]; }
    else if (n.errer) { if (!n.but || n.attente > 0) { n.attente -= dt; if (n.attente <= 0) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * n.errer.r; n.but = [n.errer.x + Math.cos(a) * r, n.errer.z + Math.sin(a) * r]; } } else cible = n.but; }
    let bouge = false;
    if (cible && !n.assis) {
      const dx = cible[0] - n.x, dz = cible[1] - n.z, d = Math.hypot(dx, dz), v = n.v * (n.suivre && d > 6 ? 2.2 : 1);
      if (d < 0.25) {
        if (n.aller) { n.aller.shift(); if (!n.aller.length) { n.aller = null; n.surArrivee && n.surArrivee(); } }
        else if (n.chemin) { n.k++; if (n.k >= n.chemin.length) { if (n.boucle) n.k = 0; else { n.chemin = null; } } n.attente = n.def.pause || 0; }
        else if (n.errer) { n.but = null; n.attente = 1 + Math.random() * 5; }
      } else {
        const pas = Math.min(d, v * dt); n.x += dx / d * pas; n.z += dz / d * pas; n.cap = Math.atan2(dx, dz); bouge = true;
      }
    }
    placerPnj(n, dt);
    const u = n.obj.userData;
    if (bouge && !reduit) {
      n.phase += dt * n.v * 5.5;
      if (u.bras) { u.bras[0].rotation.x = Math.sin(n.phase) * 0.45; u.bras[1].rotation.x = -Math.sin(n.phase) * 0.45; n.obj.position.y += Math.abs(Math.sin(n.phase)) * 0.035; u.robe.rotation.z = Math.sin(n.phase) * 0.03; }
      if (u.pattes) u.pattes.forEach((p, i) => (p.rotation.x = Math.sin(n.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.35));
      if (n.def.modele === 'chameau' || n.def.modele === 'cheval') n.obj.position.y += Math.abs(Math.sin(n.phase)) * 0.05;
    } else if (u.bras && !reduit) { u.bras[0].rotation.x *= 0.9; u.bras[1].rotation.x *= 0.9; n.obj.position.y += Math.sin(t * 1.3 + n.phase) * 0.004; }
    if (n.cone) n.cone.material.opacity = (J.nuit ? 0.11 : 0.06) + 0.03 * Math.sin(t * 3 + n.phase);
  }
  // Un garde voit le joueur : dans le cône, à portée (doublée s'il court), sans mur entre eux.
  function voit(n) {
    const g = n.garde; if (!g || !n.visible) return false;
    const dx = J.x - n.x, dz = J.z - n.z, d = Math.hypot(dx, dz), portee = (g.portee || 14) * (J.course ? 1.6 : 1) * (J.nuit && !n.cone ? 0.6 : 1);
    if (d > portee) return false;
    const ang = Math.atan2(dx, dz) - n.cap, a = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
    if (a > (g.angle || 70) * RAD / 2 && d > 2.2) return false;
    return !cache(n.x, n.z, J.x, J.z);
  }
  function cache(ax, az, bx, bz) {
    for (const s of solides) {
      if (s.type === 'cercle') { // gros rochers : ils cachent aussi
        if (s.r >= 1 && !(s.ref && !s.ref.visible) && distSeg(s.x, s.z, ax, az, bx, bz) < s.r * 0.9 && Math.hypot(bx - s.x, bz - s.z) > s.r) return true;
        continue;
      }
      if (s.type !== 'boite' || Math.max(s.hx, s.hz) < 1.2 || (s.ref && !s.ref.visible)) continue;
      const c = Math.cos(-s.r), si = Math.sin(-s.r);
      const lx = (x, z) => [(x - s.x) * c - (z - s.z) * si, (x - s.x) * si + (z - s.z) * c];
      const [x0, z0] = lx(ax, az), [x1, z1] = lx(bx, bz);
      let t0 = 0, t1 = 1; const dx = x1 - x0, dz = z1 - z0, ok = [[-dx, x0 + s.hx], [dx, s.hx - x0], [-dz, z0 + s.hz], [dz, s.hz - z0]].every(([p, q]) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; });
      if (ok && t0 < t1) return true;
    }
    return false;
  }

  // ---------- objets à prendre ----------
  function ajouterObjet(o) {
    const m = OBJETS[o.modele] ? OBJETS[o.modele]() : OBJETS.sac(); m.castShadow = true;
    m.position.set(o.x, sol(o.x, o.z) + (o.y ?? 0.15), o.z); monde.add(m);
    const lueur = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 20), new THREE.MeshBasicMaterial({ color: 0xF3D38E, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    lueur.rotation.x = -Math.PI / 2; lueur.position.set(o.x, sol(o.x, o.z) + 0.03, o.z); monde.add(lueur);
    objets.set(o.id, { ...o, obj: m, lueur, visible: o.visible !== false, invite: o.invite || `Prendre : ${o.nom}` });
    m.visible = lueur.visible = o.visible !== false;
  }

  // ---------- collisions ----------
  function resoudre(x, z, r) {
    for (let it = 0; it < 2; it++) for (const s of solides) {
      if (s.ref && !s.ref.visible) continue;
      if (s.type === 'cercle') {
        const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz), m = s.r + r;
        if (d < m && d > 1e-6) { x = s.x + dx / d * m; z = s.z + dz / d * m; }
      } else {
        const c = Math.cos(-s.r), si = Math.sin(-s.r), lx = (x - s.x) * c - (z - s.z) * si, lz = (x - s.x) * si + (z - s.z) * c;
        const ex = s.hx + r, ez = s.hz + r;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          let nx = lx, nz = lz;
          if (ex - Math.abs(lx) < ez - Math.abs(lz)) nx = Math.sign(lx || 1) * ex; else nz = Math.sign(lz || 1) * ez;
          const c2 = Math.cos(s.r), s2 = Math.sin(s.r); x = s.x + nx * c2 - nz * s2; z = s.z + nx * s2 + nz * c2;
        }
      }
    }
    if (def && def.limites) { const [x1, z1, x2, z2] = def.limites; x = Math.max(x1, Math.min(x2, x)); z = Math.max(z1, Math.min(z2, z)); }
    return [x, z];
  }

  // ---------- commandes ----------
  const avant = () => [(touches.has('KeyW') || touches.has('ArrowUp') ? 1 : 0) - (touches.has('KeyS') || touches.has('ArrowDown') ? 1 : 0) + (joy.actif ? -joy.y : 0),
    (touches.has('KeyD') || touches.has('ArrowRight') ? 1 : 0) - (touches.has('KeyA') || touches.has('ArrowLeft') ? 1 : 0) + (joy.actif ? joy.x : 0)];
  const CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyE', 'Space'];
  let eTenu = false;
  addEventListener('keydown', (e) => {
    if (!actif || enPause || e.target.tagName === 'INPUT') return;
    if (CODES.includes(e.code)) { touches.add(e.code); if (e.code !== 'Space') e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') J.course = true;
    if (e.code === 'KeyE' && !e.repeat) agir(true);
  });
  addEventListener('keyup', (e) => {
    touches.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') J.course = false;
    if (e.code === 'KeyE') agir(false);
  });
  addEventListener('blur', () => { touches.clear(); agir(false); });
  canvas.addEventListener('click', () => {
    if (!actif || J.bloque || mobile) return;
    if (modeLancer && verrou) { lancerProjectile(); return; }
    if (!verrou && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* verrou refusé : on regarde en glissant */ } }
  });
  document.addEventListener('pointerlockchange', () => { verrou = document.pointerLockElement === canvas; racine.classList.toggle('verrou', verrou); });
  addEventListener('mousemove', (e) => {
    if (!actif || J.bloque) return;
    if (verrou) { tourner(e.movementX, e.movementY); return; }
    if (glisse) { tourner((e.clientX - glisse.x) * 1.2, (e.clientY - glisse.y) * 1.2); glisse = { x: e.clientX, y: e.clientY }; }
  });
  canvas.addEventListener('mousedown', (e) => { if (!verrou && e.button === 0) glisse = { x: e.clientX, y: e.clientY }; });
  addEventListener('mouseup', () => { glisse = null; });
  function tourner(dx, dy) {
    J.lacet -= dx * 0.0024; J.tangage = Math.max(-1.25, Math.min(1.2, J.tangage - dy * 0.0024));
  }
  // tactile : manette à gauche, regard à droite, bouton d'action
  canvas.addEventListener('touchstart', (e) => {
    if (!actif) return;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && joy.id == null) { joy.id = t.identifier; joy.cx = t.clientX; joy.cy = t.clientY; joy.actif = true; const j = $('.m-joy'); j.hidden = false; j.style.transform = `translate(${t.clientX - 60}px,${t.clientY - 60}px)`; }
      else if (regard.id == null) { regard.id = t.identifier; regard.x = t.clientX; regard.y = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { const dx = t.clientX - joy.cx, dy = t.clientY - joy.cy, d = Math.min(1, Math.hypot(dx, dy) / 55), a = Math.atan2(dy, dx); joy.x = Math.cos(a) * d; joy.y = Math.sin(a) * d; $('.m-joy i').style.transform = `translate(${joy.x * 34}px,${joy.y * 34}px)`; }
      else if (t.identifier === regard.id && !J.bloque) { tourner((t.clientX - regard.x) * 1.6, (t.clientY - regard.y) * 1.6); regard.x = t.clientX; regard.y = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const finTouche = (e) => { for (const t of e.changedTouches) { if (t.identifier === joy.id) { joy.id = null; joy.actif = false; joy.x = joy.y = 0; $('.m-joy').hidden = true; } if (t.identifier === regard.id) regard.id = null; } };
  canvas.addEventListener('touchend', finTouche); canvas.addEventListener('touchcancel', finTouche);
  $('.m-agir').addEventListener('pointerdown', (e) => { e.preventDefault(); if (modeLancer) lancerProjectile(); else agir(true); });
  $('.m-agir').addEventListener('pointerup', () => agir(false));
  $('.m-courir').addEventListener('click', () => { J.course = !J.course; $('.m-courir').setAttribute('aria-pressed', J.course); });

  // ---------- interactions ----------
  let cibleInter = null, tenir = null;
  function interactifs() {
    const l = [];
    for (const n of pnjs.values()) if (n.visible && n.invite) l.push({ id: n.id, type: 'pnj', x: n.x, z: n.z, r: n.def.portee || 2.6, invite: n.invite });
    for (const o of objets.values()) if (o.visible && o.invite) l.push({ id: o.id, type: 'objet', x: o.x, z: o.z, r: 1.8, invite: o.invite });
    for (const [id, p] of lieux) if (p.actif && p.invite) l.push({ id, type: 'lieu', x: p.x, z: p.z, r: p.r, invite: p.invite, tenir: p.tenir });
    return l;
  }
  function chercherInteraction() {
    let meilleur = null, score = Infinity;
    const fx = -Math.sin(J.lacet), fz = -Math.cos(J.lacet);
    for (const it of interactifs()) {
      const dx = it.x - J.x, dz = it.z - J.z, d = Math.hypot(dx, dz);
      if (d > it.r) continue;
      const face = d < 0.8 ? 1 : (dx * fx + dz * fz) / d;
      if (face < 0.25) continue;
      const s = d * (2 - face); if (s < score) { score = s; meilleur = it; }
    }
    return meilleur;
  }
  function agir(appui) {
    if (!actif || enPause) return;
    if (!appui) { if (tenir && !tenir.fini) { const id = tenir.id; tenir = null; majInvite(); emit('tenir-stop', { id }); } eTenu = false; return; }
    if (J.bloque || eTenu) return;
    if (!cibleInter) { if (modeLancer) lancerProjectile(); return; }
    eTenu = true;
    if (cibleInter.tenir) { tenir = { id: cibleInter.id, duree: cibleInter.tenir, t: 0, fini: false }; emit('tenir-debut', { id: cibleInter.id }); return; }
    emit('agir', { id: cibleInter.id, type: cibleInter.type });
  }
  function majInvite() {
    const el = $('.m-invite'), ag = $('.m-agir');
    const c = J.bloque ? null : cibleInter || (modeLancer ? { invite: mobile ? 'Lancer' : 'Lancer un caillou (E, ou clic une fois la souris capturée)' } : null);
    el.hidden = !c; ag.hidden = !c || !mobile;
    if (c) { el.querySelector('span').textContent = c.invite; el.classList.toggle('tenir', !!c.tenir); ag.textContent = c.tenir ? 'Maintenir' : modeLancer && !cibleInter ? 'Lancer' : 'Agir'; }
    el.querySelector('.m-tenir').style.setProperty('--p', tenir ? tenir.t / tenir.duree : 0);
  }

  // ---------- lancer (cailloux) ----------
  let modeLancer = null; const projectiles = [];
  function lancerProjectile() {
    if (!modeLancer || modeLancer.restants <= 0 || J.bloque) return;
    modeLancer.restants--; emit('lance', { restants: modeLancer.restants });
    const m = OBJETS.caillou(); m.position.copy(camera.position); monde.add(m);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    projectiles.push({ m, v: dir.multiplyScalar(modeLancer.vitesse || 11).add(new THREE.Vector3(0, 2.2, 0)), t: 0 });
  }
  function majProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i]; p.t += dt; p.v.y -= 9.8 * dt; p.m.position.addScaledVector(p.v, dt);
      const pp = p.m.position;
      for (const c of (modeLancer ? modeLancer.cibles : [])) if (Math.hypot(pp.x - c.x, pp.z - c.z) < c.r && pp.y < sol(c.x, c.z) + (c.h || 2) && pp.y > sol(c.x, c.z) - 0.5) { emit('impact', { id: c.id }); poussiere(pp.x, pp.z, 0.6); monde.remove(p.m); projectiles.splice(i, 1); break; }
      if (projectiles[i] === p && (pp.y < sol(pp.x, pp.z) || p.t > 4)) { monde.remove(p.m); projectiles.splice(i, 1); }
    }
  }

  // ---------- porter un objet (visible en bas de l'écran) ----------
  let porteObj = null;
  function porter(modele) {
    if (porteObj) { camera.remove(porteObj); porteObj = null; }
    J.porte = modele || null;
    if (!modele) return;
    porteObj = OBJETS[modele] ? OBJETS[modele]() : OBJETS.sac();
    porteObj.position.set(0.34, -0.36, -0.85); porteObj.rotation.set(0.3, 0.4, 0); porteObj.scale.setScalar(0.55); camera.add(porteObj);
  }
  scene.add(camera);

  // ---------- effets ----------
  function poussiere(x, z, s = 1) {
    const g = new THREE.Group(), ms = [];
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 * s, 0), M('#CBB590', { transparent: true, opacity: 0.6 })); m.position.set(x + (Math.random() - 0.5) * s, sol(x, z) + 0.3, z + (Math.random() - 0.5) * s); g.add(m); ms.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5) }); }
    monde.add(g); let t = 0;
    animes.push((dt) => { t += dt; ms.forEach(({ m, v }) => { m.position.addScaledVector(v, dt); m.scale.setScalar(1 + t * 2); }); g.children.forEach((m) => (m.material = M('#CBB590', { transparent: true, opacity: Math.max(0, 0.6 - t * 0.5) }))); if (t > 1.2) { monde.remove(g); return false; } return true; });
  }
  const EFFETS = {
    // Les oiseaux (abâbîl) arrivent de la mer et laissent tomber des pierres sur l'armée.
    oiseaux({ de = [-120, -80], vers = [0, 0], n = 140, duree = 9, r = 25 }) {
      const forme = new THREE.BufferGeometry(); forme.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.45, 0, 0.1, 0, 0, -0.15, 0.45, 0, 0.1, 0, 0.05, 0.1]), 3)); forme.setIndex([0, 1, 3, 1, 2, 3]); forme.computeVertexNormals();
      const im = new THREE.InstancedMesh(forme, new THREE.MeshBasicMaterial({ color: 0x1E1A16, side: THREE.DoubleSide }), n); im.frustumCulled = false; monde.add(im);
      const b = Array.from({ length: n }, () => ({ o: [de[0] + (Math.random() - 0.5) * 40, 30 + Math.random() * 25, de[1] + (Math.random() - 0.5) * 40], d: Math.random() * 0.4, cx: vers[0] + (Math.random() - 0.5) * r * 2, cz: vers[1] + (Math.random() - 0.5) * r * 2, lache: false, ph: Math.random() * 6 }));
      const pierres = []; let t = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      return new Promise((fin) => animes.push((dt) => {
        t += dt;
        b.forEach((o, i) => {
          const k = Math.min(1, Math.max(0, (t / duree) * 1.6 - o.d));
          const x = o.o[0] + (o.cx - o.o[0]) * k, z = o.o[2] + (o.cz - o.o[2]) * k + Math.sin(t * 2 + o.ph) * 2, y = o.o[1] - 10 * k + Math.sin(t * 3 + o.ph);
          v.set(x, y, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(o.cx - o.o[0], o.cz - o.o[2]));
          sc.set(1, 1 + Math.sin(t * 18 + o.ph) * 0.6, 1); m4.compose(v, q, sc); im.setMatrixAt(i, m4);
          if (k > 0.85 && !o.lache) { o.lache = true; const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), M('#7B3B22')); p.position.set(x, y, z); monde.add(p); pierres.push({ p, vy: 0 }); }
        });
        im.instanceMatrix.needsUpdate = true;
        pierres.forEach((s) => { if (!s.p.parent) return; s.vy -= 14 * dt; s.p.position.y += s.vy * dt; if (s.p.position.y < sol(s.p.position.x, s.p.position.z)) { poussiere(s.p.position.x, s.p.position.z, 0.5); monde.remove(s.p); } });
        if (t > duree) { monde.remove(im); fin(); return false; }
        return true;
      }));
    },
    // L'éléphant s'agenouille et refuse d'avancer vers la Ka'ba (Ibn Ishâq)
    agenouiller({ id }) {
      const n = pnjs.get(id); if (!n) return Promise.resolve();
      const u = n.obj.userData; let t = 0; n.chemin = null; n.aller = null;
      return new Promise((fin) => animes.push((dt) => {
        t = Math.min(1, t + dt / 2.2); const k = lisse(0, 1, t);
        u.pattes.forEach((p, i) => { p.rotation.x = (i < 2 ? -1 : 1.3) * k; });
        u.corps.position.y = -0.95 * k; u.corps.rotation.x = 0.12 * k;
        if (t >= 1) { fin(); return false; } return true;
      }));
    },
    // Les idoles d'un groupe tombent une à une
    idoles({ id, intervalle = 0.18 }) {
      const g = elements.get(id); if (!g) return Promise.resolve();
      const l = [...g.children]; let t = 0;
      return new Promise((fin) => animes.push((dt) => {
        t += dt;
        l.forEach((o, i) => { const k = Math.min(1, Math.max(0, (t - i * intervalle) / 0.6)); if (k > 0) { o.rotation.x = -Math.PI / 2 * lisse(0, 1, k); if (k >= 1 && !o.userData.tombe) { o.userData.tombe = true; poussiere(o.position.x, o.position.z, 0.8); } } });
        if (t > l.length * intervalle + 1) { fin(); return false; } return true;
      }));
    },
    // Un groupe (armée, foule) s'enfuit vers un point puis disparaît
    disperser({ id, vers = [0, -200] }) {
      membres(id).forEach((n) => { n.chemin = null; n.errer = null; n.v *= 2.4; n.aller = [[vers[0] + (Math.random() - 0.5) * 40, vers[1] + (Math.random() - 0.5) * 40]]; n.surArrivee = () => { n.visible = false; n.obj.visible = false; }; });
      return Promise.resolve();
    },
    poussiere({ x, z, s = 2 }) { poussiere(x, z, s); return Promise.resolve(); },
    // Élève (ou abaisse) un élément de dy mètres
    monter({ id, dy = 1, duree = 2 }) {
      const o = elements.get(id); if (!o) return Promise.resolve(); const y0 = o.position.y; let t = 0;
      return new Promise((fin) => animes.push((dt) => { t = Math.min(1, t + dt / (reduit ? 0.01 : duree)); o.position.y = y0 + dy * lisse(0, 1, t); if (t >= 1) { fin(); return false; } return true; }));
    },
    // La roche cède sous les coups (le rocher du Fossé) : elle s'effondre en sable
    effondrer({ id }) {
      const o = elements.get(id); if (!o) return Promise.resolve(); let t = 0;
      poussiere(o.position.x, o.position.z, 3);
      return new Promise((fin) => animes.push((dt) => { t += dt; o.scale.y = Math.max(0.05, 1 - t); o.position.y -= dt * 0.2; if (t > 1) { o.visible = false; fin(); return false; } return true; }));
    },
  };

  // ---------- bateau : le joueur tient la barre (Z / S : voile, Q / D : barre) ----------
  let barque = null;
  function vehicule(type, cfg = {}) {
    if (barque) { monde.remove(barque.obj); barque = null; }
    J.vehicule = type || null;
    if (type !== 'bateau') { J.y = sol(J.x, J.z); return; }
    const b = bateau(); b.scale.setScalar(cfg.s || 2.4); monde.add(b);
    barque = { obj: b, v: 0, vmax: cfg.vitesse || 7, cap: J.lacet, touche: new Set(), recul: 0 };
  }
  function majBarque(dt, t) {
    const B = barque, [a, s] = avant();
    B.v += ((a > 0 ? a * B.vmax : a * B.vmax * 0.25) - B.v) * Math.min(1, dt * 0.5);
    const rot = -s * dt * (0.25 + 0.35 * Math.abs(B.v) / B.vmax);
    B.cap += rot; J.lacet += rot;
    const fx = -Math.sin(B.cap), fz = -Math.cos(B.cap), nx = J.x + fx * B.v * dt, nz = J.z + fz * B.v * dt;
    // l'étrave (8 m devant le joueur) ne doit pas toucher la terre
    if (sol(nx + fx * 8, nz + fz * 8) < -1.4 && sol(nx, nz) < -1.4) { J.x = nx; J.z = nz; }
    else if (Math.abs(B.v) > 0.3) { B.v = -B.v * 0.3; emit('echoue', {}); }
    if (def && def.limites) { const [x1, z1, x2, z2] = def.limites; J.x = Math.max(x1, Math.min(x2, J.x)); J.z = Math.max(z1, Math.min(z2, J.z)); }
    const houle = reduit ? 0 : Math.sin(t * 1.3) * 0.12;
    J.y = (J.eau ?? -0.4) + 1.55 + houle;
    // le joueur se tient à la poupe, un peu à gauche du mât
    B.obj.position.set(J.x + fx * 4.5 + Math.cos(B.cap) * 0.9, (J.eau ?? -0.4) - 0.1 + houle, J.z + fz * 4.5 - Math.sin(B.cap) * 0.9);
    B.obj.rotation.set(reduit ? 0 : Math.sin(t * 0.9) * 0.03, B.cap + Math.PI, reduit ? 0 : Math.sin(t * 1.3) * 0.04);
    for (const r of recifs) {
      const d = Math.min(Math.hypot(J.x - r.x, J.z - r.z), Math.hypot(J.x + fx * 8 - r.x, J.z + fz * 8 - r.z));
      if (d < r.r && !B.touche.has(r.id)) { B.touche.add(r.id); B.v *= 0.2; emit('recif', { id: r.id }); }
    }
    return Math.abs(B.v) > 0.2;
  }

  // ---------- chute dans un ravin ----------
  function dansRavin() {
    for (const r of ravins) if (distSeg(J.x, J.z, r.ax, r.az, r.bx, r.bz) < r.l * 0.3) return r;
    return null;
  }

  // ---------- boussole d'objectif ----------
  let objectif = null; const vp = new THREE.Vector3();
  let pilier = null;
  function cibler(c) {
    objectif = c;
    if (pilier) { monde.remove(pilier); pilier = null; }
    $('.m-boussole').hidden = !c;
    if (!c) return;
    pilier = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 40, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xF3D38E, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    monde.add(pilier);
  }
  const positionObjectif = () => positionDe(objectif);
  function positionDe(c) {
    if (!c) return null;
    if (Array.isArray(c)) return c;
    const [type, id] = c.split(':');
    if (type === 'pnj') { const n = pnjs.get(id) || membres(id)[0]; return n ? [n.x, n.z] : null; }
    if (type === 'objet') { const o = objets.get(id); return o && o.visible ? [o.x, o.z] : null; }
    if (type === 'lieu') { const l = lieux.get(id); return l ? [l.x, l.z] : null; }
    if (type === 'zone') { const z = zones.find((q) => q.id === id); return z ? (z.r ? [z.x, z.z] : [(z.x1 + z.x2) / 2, (z.z1 + z.z2) / 2]) : null; }
    return null;
  }
  function majBoussole(w, h) {
    const p = positionObjectif(), el = $('.m-boussole');
    if (!p) { el.hidden = true; if (pilier) pilier.visible = false; return; }
    el.hidden = false;
    const y = sol(p[0], p[1]);
    const dObj = Math.hypot(p[0] - J.x, p[1] - J.z);
    if (pilier) { pilier.visible = dObj > 7; pilier.material.opacity = 0.22 * Math.min(1, (dObj - 7) / 15); pilier.position.set(p[0], y + 20, p[1]); } // s'efface quand on y est
    vp.set(p[0], y + 2.2, p[1]).project(camera);
    let x = (vp.x * 0.5 + 0.5) * w, yy = (-vp.y * 0.5 + 0.5) * h;
    const derriere = vp.z > 1;
    if (derriere) { x = w - x; yy = h - 60; }
    const m = 40; const dehors = derriere || x < m || x > w - m || yy < m || yy > h - m;
    x = Math.max(m, Math.min(w - m, x)); yy = Math.max(m + 20, Math.min(h - m - 80, yy));
    el.style.transform = `translate(${x}px,${yy}px)`; el.classList.toggle('bord', dehors);
    el.querySelector('small').textContent = `${Math.round(Math.hypot(p[0] - J.x, p[1] - J.z))} m`;
  }

  // ---------- fondu ----------
  function fondu(on, texte = '', couleur = '#000') {
    const f = $('.m-fondu'); f.style.background = couleur; f.querySelector('p').textContent = texte;
    if (on) { f.hidden = false; f.classList.remove('vu'); void f.offsetWidth; f.classList.add('vu'); }
    else { f.classList.remove('vu'); setTimeout(() => { if (!f.classList.contains('vu')) f.hidden = true; }, 700); }
    return new Promise((ok) => setTimeout(ok, reduit ? 50 : 700));
  }

  // ---------- caméra ----------
  let regarderVers = null;
  function regarder(p, duree = 1.2) {
    const dx = p[0] - J.x, dz = p[2] - J.z, dy = p[1] - (J.y + 1.62);
    const h = Math.hypot(dx, dz), lacet = h < 0.5 ? J.lacet : Math.atan2(-dx, -dz), tangage = Math.max(-0.6, Math.min(0.6, Math.atan2(dy, Math.max(h, 1.5))));
    let dl = lacet - J.lacet; dl = Math.atan2(Math.sin(dl), Math.cos(dl));
    regarderVers = { a: [J.lacet, J.tangage], b: [J.lacet + dl, tangage], t: 0, duree: reduit ? 0.01 : duree };
    return new Promise((ok) => { regarderVers.fin = ok; });
  }
  // cap : degrés de boussole (0 = nord = -z, 90 = est = +x)
  // (jamais dans un mur : on repousse hors des solides)
  function teleporter(x, z, cap = null) { [x, z] = resoudre(x, z, 0.35); J.x = x; J.z = z; if (cap != null) { J.lacet = -cap * RAD; J.tangage = 0; } J.y = sol(x, z); J.dans.clear(); }

  // ---------- boucle ----------
  let dernier = performance.now(), anim = 0, pasAcc = 0;
  const chrono = { n: 0, t: 0 };
  function boucle(now) {
    anim = requestAnimationFrame(boucle);
    const dtr = Math.max(0, (now - dernier) / 1000), dt = Math.min(0.05, dtr); dernier = now;
    const w = racine.clientWidth, h = racine.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    chrono.n++; chrono.t += dtr;
    if (chrono.n >= 60) { const moy = chrono.t / chrono.n; chrono.n = chrono.t = 0; const c = moy > 0.034 ? Math.max(0.75, dpr - 0.25) : moy < 0.015 ? Math.min(mobile ? 1.5 : 2, dpr + 0.25) : dpr; if (c !== dpr) { dpr = c; renderer.setPixelRatio(dpr); } }
    // pas de temps fixes (0,05 s au plus) : sur une machine lente, plusieurs pas par image, sans traverser les murs
    if (!enPause && def) { let reste = Math.min(0.25, dtr); do { const p = Math.min(0.05, reste); maj(p, now / 1000); reste -= p; } while (reste > 0.001); }
    renderer.render(scene, camera);
    if (def) { majBoussole(w, h); majNoms(w, h); }
  }
  function majNoms(w, h) {
    for (const l of nomsLieux) {
      const d = Math.hypot(l.x - J.x, l.z - J.z);
      if (J.bloque || d > 60 || (l.o && !l.o.visible)) { l.el.hidden = true; continue; }
      vp.set(l.x, sol(l.x, l.z) + l.y, l.z).project(camera);
      if (vp.z > 1 || Math.abs(vp.x) > 1.1 || Math.abs(vp.y) > 1.1) { l.el.hidden = true; continue; }
      l.el.hidden = false;
      l.el.style.transform = `translate(${(vp.x * 0.5 + 0.5) * w}px,${(-vp.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`;
      l.el.style.opacity = d > 45 ? (60 - d) / 15 : 1;
    }
    for (const n of pnjs.values()) {
      const el = n.etiquette; if (!el) continue;
      const d = Math.hypot(n.x - J.x, n.z - J.z);
      if (!n.visible || d > 28 || J.bloque && !n.parle) { el.hidden = true; continue; }
      vp.set(n.x, sol(n.x, n.z) + n.hauteur, n.z).project(camera);
      if (vp.z > 1 || Math.abs(vp.x) > 1.1 || Math.abs(vp.y) > 1.1) { el.hidden = true; continue; }
      el.hidden = false;
      el.style.transform = `translate(${(vp.x * 0.5 + 0.5) * w}px,${(-vp.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`;
      el.style.opacity = d > 20 ? (28 - d) / 8 : 1;
    }
  }
  function maj(dt, t) {
    // regard dirigé (cinématique)
    if (regarderVers) {
      const r = regarderVers; r.t = Math.min(1, r.t + dt / r.duree); const k = lisse(0, 1, r.t);
      J.lacet = r.a[0] + (r.b[0] - r.a[0]) * k; J.tangage = r.a[1] + (r.b[1] - r.a[1]) * k;
      if (r.t >= 1) { regarderVers = null; r.fin(); }
    }
    // déplacement
    let bouge = false;
    if (J.chute) {
      const c = J.chute; c.t += dt; J.y -= c.v * dt; c.v += 12 * dt; J.tangage = Math.max(-1.3, J.tangage - dt * 1.2);
      if (c.t > 1.4 && !c.fini) { c.fini = true; emit('chute', { id: c.id }); }
    } else if (barque) {
      majBarque(dt, t); // pas de bruit de pas sur le pont
    } else if (!J.bloque) {
      const [a, s] = avant();
      if (a || s) {
        const v = (J.course ? 3.6 : 1.75) * (def.vitesse || 1), n = Math.hypot(a, s), sin = Math.sin(J.lacet), cos = Math.cos(J.lacet);
        const dx = (-sin * a + cos * s) / Math.max(1, n) * v * dt, dz = (-cos * a - sin * s) / Math.max(1, n) * v * dt;
        const [nx, nz] = resoudre(J.x + dx, J.z + dz, 0.35);
        // on n'entre pas dans l'eau au-delà des genoux
        if (J.eau == null || sol(nx, nz) > J.eau - 0.45) { J.x = nx; J.z = nz; bouge = true; }
      }
      J.y = sol(J.x, J.z);
      const r = dansRavin(); if (r) { J.chute = { id: r.id, t: 0, v: 1, fini: false }; J.bloque = true; emit('chute-debut', { id: r.id }); }
    }
    if (bouge && !reduit) { J.phase += dt * (J.course ? 11 : 7.5); pasAcc += dt * (J.course ? 2.6 : 1.7); if (pasAcc > 1) { pasAcc = 0; bruitPas && bruitPas(J.course); } }
    const bob = reduit ? 0 : Math.sin(J.phase) * (bouge ? 0.035 : 0) + (bouge ? 0 : 0);
    camera.position.set(J.x, J.y + 1.62 + bob, J.z);
    camera.rotation.set(J.tangage, J.lacet, 0);
    // soleil centré sur le joueur
    soleil.position.set(J.x + dirSoleil.x * 120, J.y + dirSoleil.y * 120, J.z + dirSoleil.z * 120); soleil.target.position.set(J.x, J.y, J.z); soleil.target.updateMatrixWorld();
    if (etoiles) etoiles.position.copy(camera.position);
    // personnages
    for (const n of pnjs.values()) majPnj(n, dt, t);
    // gardes
    for (const n of pnjs.values()) {
      if (!n.garde || J.bloque) continue;
      if (voit(n)) { n.vu = (n.vu || 0) + dt; if (n.vu > (n.garde.delai ?? 0.5) && !n.alerte) { n.alerte = true; emit('repere', { id: n.id }); } }
      else { n.vu = Math.max(0, (n.vu || 0) - dt); if (n.vu === 0) n.alerte = false; }
    }
    // zones
    for (const z of zones) {
      const dedans = z.r ? Math.hypot(J.x - z.x, J.z - z.z) < z.r : J.x > z.x1 && J.x < z.x2 && J.z > z.z1 && J.z < z.z2;
      if (dedans && !J.dans.has(z.id)) { J.dans.add(z.id); emit('zone', { id: z.id }); }
      else if (!dedans && J.dans.has(z.id)) J.dans.delete(z.id);
    }
    // feux qui vacillent (les plus proches seulement éclairent)
    feux.forEach((f) => {
      const v = reduit ? 1 : 0.85 + 0.15 * Math.sin(t * 13 + f.ph) + 0.08 * Math.sin(t * 29 + f.ph * 2);
      if (f.flamme) f.flamme.scale.set(v, v * (1.1 + 0.2 * Math.sin(t * 9 + f.ph)), v);
      const d = Math.hypot(f.x - J.x, f.z - J.z); f.lumiere.visible = d < 45; f.lumiere.intensity = (J.nuit || J.ambiance === 'soir' ? f.force : f.force * 0.35) * v;
    });
    // effets
    for (let i = animes.length - 1; i >= 0; i--) if (animes[i](dt, t) === false) animes.splice(i, 1);
    majProjectiles(dt);
    // interactions
    cibleInter = J.bloque ? null : chercherInteraction();
    if (tenir && !tenir.fini) {
      if (!cibleInter || cibleInter.id !== tenir.id) { const id = tenir.id; tenir = null; emit('tenir-stop', { id }); }
      else { tenir.t += dt; emit('tenir', { id: tenir.id, p: Math.min(1, tenir.t / tenir.duree) }); if (tenir.t >= tenir.duree) { tenir.fini = true; const id = tenir.id; tenir = null; eTenu = false; emit('tenu', { id }); } }
    }
    majInvite();
  }

  // ---------- instantanés (retour dans le temps) ----------
  function instantane() {
    return {
      J: { x: J.x, z: J.z, lacet: J.lacet, tangage: J.tangage, porte: J.porte },
      pnj: [...pnjs.values()].map((n) => ({ id: n.id, x: n.x, z: n.z, cap: n.cap, k: n.k, chemin: n.chemin && n.chemin.map((c) => [...c]), visible: n.visible, suivre: n.suivre && { ...n.suivre }, invite: n.invite, v: n.v, errer: n.errer, alerte: false })),
      objets: [...objets.values()].map((o) => ({ id: o.id, visible: o.visible, invite: o.invite })),
      lieux: [...lieux.entries()].map(([id, l]) => ({ id, actif: l.actif, invite: l.invite })),
      elements: [...elements.entries()].map(([id, o]) => ({ id, visible: o.visible })),
    };
  }
  function restaurer(s) {
    J.chute = null; J.bloque = false; regarderVers = null;
    teleporter(s.J.x, s.J.z); J.lacet = s.J.lacet; J.tangage = s.J.tangage; porter(s.J.porte);
    s.pnj.forEach((p) => { const n = pnjs.get(p.id); if (!n) return; Object.assign(n, { x: p.x, z: p.z, cap: p.cap, k: p.k, chemin: p.chemin, visible: p.visible, suivre: p.suivre, invite: p.invite, v: p.v, errer: p.errer, alerte: false, vu: 0, aller: null }); n.obj.visible = p.visible; n.obj.rotation.y = p.cap; placerPnj(n, 0); });
    s.objets.forEach((p) => { const o = objets.get(p.id); if (o) { o.visible = p.visible; o.invite = p.invite; o.obj.visible = o.lueur.visible = p.visible; } });
    s.lieux.forEach((p) => { const l = lieux.get(p.id); if (l) { l.actif = p.actif; l.invite = p.invite; } });
    s.elements.forEach((p) => { const o = elements.get(p.id); if (o) o.visible = p.visible; });
    projectiles.forEach((p) => monde.remove(p.m)); projectiles.length = 0;
    if (barque) { barque.v = 0; barque.cap = J.lacet; barque.touche.clear(); }
    if (modeLancer) modeLancer.restants = modeLancer.nombre || 7;
  }

  // ---------- API ----------
  return {
    racine, camera,
    on(type, f) { (listeners[type] ||= []).push(f); return () => { listeners[type] = listeners[type].filter((g) => g !== f); }; },
    charger(d) { charger(d); },
    ambiance,
    demarrer() { actif = true; enPause = false; racine.hidden = false; $('.m-courir').hidden = !mobile; dernier = performance.now(); if (!anim) anim = requestAnimationFrame(boucle); },
    arreter() { actif = false; racine.hidden = true; if (anim) cancelAnimationFrame(anim); anim = 0; if (verrou) document.exitPointerLock(); touches.clear(); cibler(null); modeLancer = null; },
    pause(on) { enPause = on; if (on) { touches.clear(); if (verrou) document.exitPointerLock(); } },
    bloquer(on) { J.bloque = on; if (on) { touches.clear(); if (verrou) document.exitPointerLock(); joy.actif = false; } majInvite(); },
    liberer() { if (verrou) document.exitPointerLock(); },
    teleporter, regarder, fondu, cibler, porter,
    position: () => ({ x: J.x, z: J.z, lacet: J.lacet }),
    dans: (id) => J.dans.has(id),
    pnj: (id) => pnjs.get(id),
    montrer(id, on) {
      membres(id).forEach((n) => { n.visible = on; n.obj.visible = on; });
      const o = objets.get(id); if (o) { o.visible = on; o.obj.visible = o.lueur.visible = on; }
      const e = elements.get(id); if (e) e.visible = on;
    },
    inviter(id, texte) { const n = pnjs.get(id); if (n) n.invite = texte; const o = objets.get(id); if (o) o.invite = texte; const l = lieux.get(id); if (l) { l.invite = texte; l.actif = !!texte; } },
    aller(id, points, vitesse) {
      const ms = membres(id);
      return Promise.all(ms.map((n, i) => new Promise((ok) => { n.chemin = null; n.errer = null; n.suivre = null; if (vitesse) n.v = vitesse; n.aller = points.map((p) => [p[0] + (ms.length > 1 ? (i % 4 - 1.5) * 1.6 : 0), p[1] + (ms.length > 1 ? Math.floor(i / 4) * 1.8 : 0)]); n.surArrivee = ok; })));
    },
    suivre(id, on, ecart = 2.5) { membres(id).forEach((n, i) => { n.chemin = null; n.errer = null; n.aller = null; n.suivre = on ? { ecart: ecart + (i % 5) * 1.3, decal: [((i % 3) - 1) * 1.5, 0] } : null; }); },
    tourner(id, cap) { membres(id).forEach((n) => { n.cap = Math.PI - cap * RAD; }); },
    // Le personnage se tourne vers le joueur (pendant un dialogue).
    faireFace(id, on = true) { const n = pnjs.get(id); if (!n) return; n.parle = on; if (on) { n.capAvant = n.cap; n.cap = Math.atan2(J.x - n.x, J.z - n.z); } },
    // Petit geste de la main (bras droit levé puis baissé).
    geste(id) {
      const n = pnjs.get(id); if (!n || !n.obj.userData.bras || reduit) return;
      const b = n.obj.userData.bras[1]; let t = 0;
      animes.push((dt) => { t += dt; b.rotation.x = -Math.sin(Math.min(1, t / 1.4) * Math.PI) * 1.1; return t < 1.4; });
    },
    vehicule,
    // Rapproche ou élargit le regard (champ de vision en degrés), en douceur.
    champ(fov = 70, duree = 1.2) {
      const a = camera.fov; let t = 0;
      animes.push((dt) => { t = Math.min(1, t + dt / (reduit ? 0.01 : duree)); camera.fov = a + (fov - a) * lisse(0, 1, t); camera.updateProjectionMatrix(); return t < 1; });
    },
    // Place un personnage ou un groupe autour d'un point (hors champ, pendant un fondu).
    placer(id, [x, z], r = 3) { membres(id).forEach((n, i) => { const a = i * 2.4, d = i ? r * Math.sqrt(i / 8) : 0; n.x = x + Math.cos(a) * d; n.z = z + Math.sin(a) * d; n.aller = null; n.but = null; placerPnj(n, 0); }); },
    tete: (id) => { const n = pnjs.get(id); return n ? [n.x, sol(n.x, n.z) + (n.hauteur || 1.9) - 0.4, n.z] : null; },
    garde(id, on) { membres(id).forEach((n) => { n.alerte = false; n.vu = 0; if (!on) n.garde = null; }); },
    lancer(cfg) { modeLancer = cfg ? { ...cfg, restants: cfg.nombre || 7 } : null; racine.classList.toggle('lancer', !!cfg); },
    effet(nom, p) { return (EFFETS[nom] || (() => Promise.resolve()))(p || {}); },
    instantane, restaurer,
    // essais automatisés
    ou: positionDe,
    taire() { for (const k in listeners) delete listeners[k]; },
    _test: { emettre: emit, cible: positionObjectif, interactifs, agirSur(id) { const it = interactifs().find((i) => i.id === id); if (!it) return false; if (it.tenir) emit('tenu', { id }); else emit('agir', { id, type: it.type }); return true; } },
  };
}
