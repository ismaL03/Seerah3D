// Montures et embarcations, sans cavalier ni personnage (règle du projet).
// Unité : environ un mètre ; la mise à l'échelle se fait à l'usage.
import * as THREE from 'three';

const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85 }, o || {}));
const POIL = mat(0xB98D57), PATTES = mat(0x8C6640), TAPIS = mat(0x2E6C8F), BALLOT = mat(0xD9C7A2);
const ROBE = [mat(0x6B4428), mat(0x3B2A20), mat(0xC9B79C)], SELLE = mat(0x7A2E22), BOIS = mat(0x8B5E3C), TOILE = mat(0xF4EEE2, { side: THREE.DoubleSide });

function piece(g, geo, m, x, y, z, rx = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; g.add(o); return o;
}

export function chameau(charge = false) {
  const g = new THREE.Group();
  piece(g, new THREE.BoxGeometry(0.8, 0.85, 1.9), POIL, 0, 1.55, 0);
  piece(g, new THREE.BoxGeometry(0.7, 0.55, 0.8), POIL, 0, 2.15, -0.05);          // bosse
  piece(g, new THREE.BoxGeometry(0.32, 1.1, 0.32), POIL, 0, 2.05, 1.05, 0.55);     // cou
  piece(g, new THREE.BoxGeometry(0.34, 0.32, 0.7), POIL, 0, 2.55, 1.5);            // tête
  [[-0.27, -0.7], [0.27, -0.7], [-0.27, 0.7], [0.27, 0.7]].forEach(([x, z]) => piece(g, new THREE.BoxGeometry(0.2, 1.2, 0.2), PATTES, x, 0.6, z));
  piece(g, new THREE.BoxGeometry(0.86, 0.12, 1.0), TAPIS, 0, 1.98, -0.05);         // tapis de selle, sans cavalier
  if (charge) [-0.55, 0.55].forEach((x) => piece(g, new THREE.BoxGeometry(0.36, 0.55, 0.7), BALLOT, x, 1.75, -0.05));
  return g;
}

export function cheval(robe = 0) {
  const g = new THREE.Group(), m = ROBE[robe % ROBE.length];
  piece(g, new THREE.BoxGeometry(0.5, 0.55, 1.4), m, 0, 1.3, 0);
  piece(g, new THREE.BoxGeometry(0.28, 0.75, 0.32), m, 0, 1.75, 0.72, 0.6);        // encolure
  piece(g, new THREE.BoxGeometry(0.24, 0.26, 0.6), m, 0, 2.05, 1.05, 0.25);        // tête
  [[-0.17, -0.55], [0.17, -0.55], [-0.17, 0.55], [0.17, 0.55]].forEach(([x, z]) => piece(g, new THREE.BoxGeometry(0.13, 1.05, 0.13), m, x, 0.52, z));
  piece(g, new THREE.BoxGeometry(0.08, 0.55, 0.08), m, 0, 1.15, -0.78, -0.5);      // queue
  piece(g, new THREE.BoxGeometry(0.54, 0.1, 0.5), SELLE, 0, 1.6, 0.05);            // selle vide
  return g;
}

// Boutre de la mer Rouge : coque effilée, mât incliné, voile latine triangulaire.
export function bateau() {
  const g = new THREE.Group();
  const profil = new THREE.Shape();
  profil.moveTo(-2.4, 0.9); profil.quadraticCurveTo(-1.6, 0, 0, 0); profil.quadraticCurveTo(1.8, 0, 2.6, 1.1); profil.lineTo(-2.4, 0.9);
  const coque = new THREE.ExtrudeGeometry(profil, { depth: 1.1, bevelEnabled: false });
  coque.translate(0, 0, -0.55); coque.rotateY(-Math.PI / 2);
  piece(g, coque, BOIS, 0, -0.2, 0);
  piece(g, new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6), BOIS, 0, 2.1, 0.3, 0.18); // mât
  const voile = new THREE.Shape(); voile.moveTo(0, 0); voile.lineTo(0, 3.2); voile.lineTo(2.4, 0.4); voile.lineTo(0, 0);
  const v = piece(g, new THREE.ShapeGeometry(voile), TOILE, 0, 0.9, -0.9);
  v.rotation.y = -Math.PI / 2;
  return g;
}

// Étendard : la toile est accrochée à la hampe (bord gauche en x = 0) pour pouvoir flotter.
export function etendard(couleur) {
  const g = new THREE.Group();
  piece(g, new THREE.CylinderGeometry(0.03, 0.03, 3, 5), BOIS, 0, 1.5, 0);
  const toile = new THREE.PlaneGeometry(1.1, 0.7, 8, 1); toile.translate(0.56, 0, 0);
  const f = piece(g, toile, mat(couleur, { side: THREE.DoubleSide }), 0, 2.6, 0);
  f.userData.repos = Float32Array.from(toile.attributes.position.array);
  g.userData.toile = f; g.userData.phase = Math.random() * 6;
  return g;
}

// Fait flotter un étendard : ondulation qui part de la hampe, plus ample vers le bout de la toile.
export function agiter(e, t, force = 1) {
  const f = e.userData.toile; if (!f) return;
  const pos = f.geometry.attributes.position, r = f.userData.repos, ph = e.userData.phase;
  for (let k = 0; k < pos.count; k++) {
    const x = r[k * 3];
    pos.array[k * 3 + 2] = Math.sin(x * 5 - t * 6 * force + ph) * 0.13 * x * force;
  }
  pos.needsUpdate = true;
  f.geometry.computeVertexNormals();
  f.rotation.y = Math.sin(t * 0.9 + ph) * 0.35;
}
