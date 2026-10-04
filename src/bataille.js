// Déroulement d'une bataille, en schéma de carte d'histoire : blocs d'armée aux couleurs
// de chaque camp (pions abstraits, étendard), chevaux sans cavalier pour la cavalerie,
// flèches de mouvement. Aucune représentation humaine.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { cheval, chameau, etendard } from './montures.js';

const lisse = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function creerBataille({ scene, R, etiquettes, reduit }) {
  const groupe = new THREE.Group(); groupe.visible = false; scene.add(groupe);
  const pion = new THREE.CylinderGeometry(0.5, 0.6, 1, 8); pion.translate(0, 0.5, 0);
  let actuelle = null;   // { B, unites: {id: {...}}, fleches: Group, labels }
  const materiauxLignes = [];

  function construire(B) {
    if (actuelle && actuelle.B === B) return actuelle;
    detruire();
    const unites = {};
    for (const [id, u] of Object.entries(B.unites)) {
      const camp = B.camps[u.camp], couleur = new THREE.Color(camp.couleur);
      const g = new THREE.Group();
      const [w, d] = u.taille;
      // socle translucide
      const socle = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0015, d), new THREE.MeshStandardMaterial({ color: couleur, transparent: true, opacity: 0.5, depthWrite: false }));
      socle.renderOrder = 1; g.add(socle);
      // pions ou montures
      const elements = [], matPion = new THREE.MeshStandardMaterial({ color: couleur.clone().lerp(new THREE.Color(0xffffff), 0.25), roughness: 0.6 });
      const pas = u.forme === 'cavalerie' ? 0.016 : u.forme === 'caravane' ? 0.02 : 0.011;
      const nx = Math.max(1, Math.floor(w / pas)), nz = Math.max(1, Math.floor(d / pas));
      let n = 0;
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        if (n++ > 160) break;
        const lx = -w / 2 + (a + 0.5) * w / nx + (Math.random() - 0.5) * pas * 0.3, lz = -d / 2 + (b + 0.5) * d / nz + (Math.random() - 0.5) * pas * 0.3;
        let o;
        if (u.forme === 'cavalerie') { o = cheval(a + b); o.scale.setScalar(0.006); }
        else if (u.forme === 'caravane') { o = chameau(true); o.scale.setScalar(0.004); }
        else {
          o = new THREE.Mesh(pion, matPion);
          o.scale.set(0.0065, u.forme === 'archers' ? 0.016 : 0.012, 0.0065);
          o.castShadow = true;
        }
        o.position.set(lx, 0, lz); g.add(o); elements.push(o);
      }
      const e = etendard(camp.couleur); e.scale.setScalar(0.013); e.position.set(0, 0, d / 2 + 0.004); g.add(e); elements.push(e);
      groupe.add(g);
      const lbl = document.createElement('div');
      lbl.className = 'lbl unite off'; lbl.style.setProperty('--uc', camp.couleur); lbl.textContent = u.nom;
      etiquettes.appendChild(lbl);
      unites[id] = { g, elements, lbl, de: null, vers: null, t: 1, visible: false };
    }
    actuelle = { B, unites, fleches: new THREE.Group(), chocs: [] };
    groupe.add(actuelle.fleches);
    return actuelle;
  }

  function detruire() {
    if (!actuelle) return;
    groupe.clear();
    Object.values(actuelle.unites).forEach((u) => u.lbl.remove());
    actuelle.chocs.forEach((c) => c.el.remove());
    materiauxLignes.length = 0;
    actuelle = null;
  }

  // Pose chaque élément sur le relief (le bloc entier suit les pentes).
  function poser(u) {
    const g = u.g; g.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    for (const o of u.elements) {
      o.getWorldPosition(p);
      o.position.y = (R.y(p.x, p.z) - g.position.y) + 0.0004;
    }
  }

  function fleche(points, couleur) {
    const pts = points.map(([la, lo]) => { const [x, z] = R.xz(la, lo); return new THREE.Vector3(x, 0, z); });
    const courbe = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4), N = 60;
    const suivi = courbe.getSpacedPoints(N).map((v) => { v.y = R.y(v.x, v.z) + 0.006; return v; });
    const geo = new LineGeometry(); geo.setPositions(suivi.flatMap((v) => [v.x, v.y, v.z]));
    const m = new LineMaterial({ color: couleur, linewidth: 4, dashed: true, dashSize: 0.012, gapSize: 0.007, transparent: true, opacity: 0.95 });
    materiauxLignes.push(m);
    const l = new Line2(geo, m); l.computeLineDistances(); l.renderOrder = 4;
    const g = new THREE.Group(); g.add(l);
    // pointe
    const fin = suivi[N], avant = suivi[N - 3];
    const tete = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.022, 10), new THREE.MeshBasicMaterial({ color: couleur }));
    tete.position.copy(fin); tete.lookAt(fin.clone().add(fin.clone().sub(avant)));
    tete.rotateX(Math.PI / 2);
    g.add(tete);
    return { g, suivi };
  }

  // Affiche l'étape « k » : déplace les unités, trace les flèches, renvoie les points à cadrer.
  function montrer(B, k) {
    const A = construire(B), P = B.phases[k], points = [];
    groupe.visible = true;
    A.fleches.clear(); materiauxLignes.length = 0;
    A.chocs.forEach((c) => c.el.remove()); A.chocs = [];
    for (const [id, u] of Object.entries(A.unites)) {
      const pos = P.positions[id];
      if (!pos) { u.visible = false; u.g.visible = false; u.lbl.classList.add('off'); continue; }
      const [x, z] = R.xz(pos[0], pos[1]), cap = -(pos[2] || 0) * Math.PI / 180;
      const cible = { x, z, cap };
      if (!u.visible || reduit) { u.de = cible; u.t = 1; } else u.de = { x: u.g.position.x, z: u.g.position.z, cap: u.g.rotation.y };
      u.vers = cible; u.t = u.visible && !reduit ? 0 : 1;
      u.visible = true; u.g.visible = true;
      if (u.t === 1) { u.g.position.set(x, R.y(x, z), z); u.g.rotation.y = cap; poser(u); }
      points.push(new THREE.Vector3(x, R.y(x, z), z));
    }
    for (const f of P.fleches || []) {
      const { g, suivi } = fleche(f.points, B.camps[f.camp].couleur);
      A.fleches.add(g); suivi.forEach((v, i) => i % 10 === 0 && points.push(v));
    }
    for (const c of P.chocs || []) {
      const [x, z] = R.xz(c.lieu[0], c.lieu[1]), el = document.createElement('div');
      el.className = 'lbl unite'; el.style.setProperty('--uc', '#3a3a3a'); el.textContent = '⚔ ' + c.nom;
      etiquettes.appendChild(el); A.chocs.push({ el, p: new THREE.Vector3(x, R.y(x, z) + 0.01, z) });
      points.push(new THREE.Vector3(x, R.y(x, z), z));
    }
    return points;
  }

  function masquer() { detruire(); groupe.visible = false; }

  const v3 = new THREE.Vector3();
  function maj(dt, camera, w, h) {
    if (!actuelle) return;
    for (const m of materiauxLignes) { m.resolution.set(w, h); if (!reduit) m.dashOffset -= dt * 0.03; }
    for (const u of Object.values(actuelle.unites)) {
      if (!u.visible) continue;
      if (u.t < 1) {
        u.t = Math.min(1, u.t + dt / 2.2);
        const k = lisse(u.t), x = u.de.x + (u.vers.x - u.de.x) * k, z = u.de.z + (u.vers.z - u.de.z) * k;
        let da = u.vers.cap - u.de.cap; da = Math.atan2(Math.sin(da), Math.cos(da));
        u.g.position.set(x, R.y(x, z), z); u.g.rotation.y = u.de.cap + da * k;
        poser(u);
      }
      v3.set(u.g.position.x, u.g.position.y + 0.035, u.g.position.z).project(camera);
      u.ecran = v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2 ? [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h] : null;
    }
    // étiquettes : du haut vers le bas, une étiquette qui en chevauche une autre est descendue juste dessous
    const placees = [];
    for (const u of Object.values(actuelle.unites).filter((u) => u.visible && u.ecran).sort((a, c) => a.ecran[1] - c.ecran[1])) {
      if (!u._w) { u._w = u.lbl.offsetWidth || 120; u._h = u.lbl.offsetHeight || 20; }
      let [x, y] = u.ecran;
      for (let k = 0; k < 4; k++) {
        const g = x - u._w / 2, d = x + u._w / 2;
        const gene = placees.find((q) => g < q[2] && d > q[0] && y - u._h < q[3] && y > q[1]);
        if (!gene) break;
        y = gene[3] + 3 + u._h;
      }
      placees.push([x - u._w / 2, y - u._h, x + u._w / 2, y]);
      u.lbl.classList.remove('off');
      u.lbl.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    }
    for (const u of Object.values(actuelle.unites)) if (!u.visible || !u.ecran) u.lbl.classList.add('off');
    for (const c of actuelle.chocs) {
      v3.copy(c.p).project(camera);
      c.el.classList.toggle('off', v3.z >= 1);
      c.el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * w}px,${(-v3.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`;
    }
  }

  return { montrer, masquer, maj, active: () => !!actuelle };
}
