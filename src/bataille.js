// Déroulement d'une bataille, en schéma de carte d'histoire : blocs d'armée aux couleurs
// de chaque camp (pions abstraits, étendard), chevaux sans cavalier pour la cavalerie,
// flèches de mouvement. Aucune représentation humaine.
// Animation : marche des blocs, étendards au vent, mêlée (pions qui s'agitent, poussière),
// volées de flèches des archers, flèches de mouvement qui se tracent.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { cheval, chameau, etendard, agiter } from './montures.js';

const lisse = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const MARCHE = 2.2, TRACE = 1.6; // durées (s) : déplacement des blocs, tracé des flèches
const N_POUSSIERE = 48, N_TRAITS = 26;

export function creerBataille({ scene, R, etiquettes, reduit }) {
  const groupe = new THREE.Group(); groupe.visible = false; scene.add(groupe);
  const pion = new THREE.CylinderGeometry(0.5, 0.6, 1, 8); pion.translate(0, 0.5, 0);
  const trait = new THREE.BoxGeometry(0.0012, 0.0012, 0.012), matTrait = new THREE.MeshBasicMaterial({ color: 0x2B2420 });
  const bouffee = new THREE.IcosahedronGeometry(1, 2), CLAIR = new THREE.Color(0xF4ECDD), FONCE = new THREE.Color(0xB8A27F);
  const matPoussiere = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.78, depthWrite: false, roughness: 1 });
  let actuelle = null;   // { B, unites, fleches, traces, chocs, combats, tirs }
  let temps = 0;
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
      // au plus 160 éléments par bloc : on espace les rangs des grandes armées
      let pas = u.forme === 'cavalerie' ? 0.016 : u.forme === 'caravane' ? 0.02 : 0.011;
      pas *= Math.max(1, Math.sqrt((w / pas) * (d / pas) / 160));
      const nx = Math.max(1, Math.floor(w / pas)), nz = Math.max(1, Math.floor(d / pas));
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const lx = -w / 2 + (a + 0.5) * w / nx + (Math.random() - 0.5) * pas * 0.3, lz = -d / 2 + (b + 0.5) * d / nz + (Math.random() - 0.5) * pas * 0.3;
        let o;
        if (u.forme === 'cavalerie') { o = cheval(a + b); o.scale.setScalar(0.006); }
        else if (u.forme === 'caravane') { o = chameau(true); o.scale.setScalar(0.004); }
        else {
          o = new THREE.Mesh(pion, matPion);
          o.scale.set(0.0065, u.forme === 'archers' ? 0.016 : 0.012, 0.0065);
          o.castShadow = true;
        }
        o.position.set(lx, 0, lz);
        o.userData = { lx, lz, y0: 0, ph: Math.random() * Math.PI * 2, vif: 0.8 + Math.random() * 0.5 };
        g.add(o); elements.push(o);
      }
      const e = etendard(camp.couleur); e.scale.setScalar(0.013); e.position.set(0, 0, d / 2 + 0.004);
      e.userData = { ...e.userData, lx: 0, lz: d / 2 + 0.004, y0: 0, ph: 0, vif: 1, drapeau: true };
      g.add(e); elements.push(e);
      groupe.add(g);
      const lbl = document.createElement('div');
      lbl.className = 'lbl unite off'; lbl.style.setProperty('--uc', camp.couleur); lbl.textContent = u.nom;
      etiquettes.appendChild(lbl);
      unites[id] = { id, g, elements, etendard: e, forme: u.forme, w, d, lbl, de: null, vers: null, t: 1, visible: false };
    }
    actuelle = { B, unites, fleches: new THREE.Group(), traces: [], chocs: [], combats: [], tirs: [] };
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

  // Pose chaque élément sur le relief (le bloc entier suit les pentes) ; y0 = hauteur de repos.
  function poser(u) {
    const g = u.g; g.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    for (const o of u.elements) {
      o.position.x = o.userData.lx; o.position.z = o.userData.lz;
      o.getWorldPosition(p);
      o.userData.y0 = (R.y(p.x, p.z) - g.position.y) + 0.0004;
      o.position.y = o.userData.y0;
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
    const tete = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.022, 10), new THREE.MeshBasicMaterial({ color: couleur }));
    g.add(tete);
    const f = { g, geo, tete, suivi, N, t: reduit ? 1 : 0 };
    tracer(f);
    return f;
  }
  // La flèche se dessine progressivement ; sa pointe avance avec le trait.
  function tracer(f) {
    const k = Math.max(1, Math.round(lisse(f.t) * f.N));
    f.geo.instanceCount = k;
    const fin = f.suivi[k], avant = f.suivi[Math.max(0, k - 3)];
    f.tete.position.copy(fin);
    f.tete.lookAt(fin.clone().add(fin.clone().sub(avant)));
    f.tete.rotateX(Math.PI / 2);
  }

  // Volée de flèches : traits qui suivent une parabole, de l'unité qui tire vers sa cible.
  function volee(de, vers) {
    const m = new THREE.InstancedMesh(trait, matTrait, N_TRAITS);
    m.frustumCulled = false; m.castShadow = false;
    const traits = Array.from({ length: N_TRAITS }, (_, k) => ({
      k: k / N_TRAITS + Math.random() * 0.03,
      a: [(Math.random() - 0.5) * de.w * 0.8, (Math.random() - 0.5) * de.d * 0.8],
      b: [(Math.random() - 0.5) * vers.w * 0.9, (Math.random() - 0.5) * vers.d * 0.9],
    }));
    groupe.add(m);
    return { de, vers, m, traits };
  }

  // Poussière au contact de deux unités
  // Bouffées de poussière en facettes, qui gonflent en montant puis disparaissent.
  function nuage() {
    const p = new THREE.InstancedMesh(bouffee, matPoussiere, N_POUSSIERE);
    for (let i = 0; i < N_POUSSIERE; i++) p.setColorAt(i, i % 3 ? CLAIR : FONCE);
    p.frustumCulled = false; p.renderOrder = 5;
    groupe.add(p);
    return { p, grains: Array.from({ length: N_POUSSIERE }, () => ({ k: Math.random(), a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()), v: 0.7 + Math.random() * 0.6 })) };
  }

  // Affiche l'étape « k » : déplace les unités, trace les flèches, renvoie les points à cadrer.
  function montrer(B, k) {
    const A = construire(B), P = B.phases[k], points = [];
    groupe.visible = true;
    A.fleches.clear(); materiauxLignes.length = 0; A.traces = [];
    A.chocs.forEach((c) => c.el.remove()); A.chocs = [];
    for (const c of A.combats) { groupe.remove(c.nuage.p); c.nuage.p.dispose(); }
    for (const t of A.tirs) { groupe.remove(t.m); t.m.dispose(); }
    A.combats = []; A.tirs = [];
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
      const t = fleche(f.points, B.camps[f.camp].couleur);
      A.fleches.add(t.g); A.traces.push(t); t.suivi.forEach((v, i) => i % 10 === 0 && points.push(v));
    }
    for (const c of P.chocs || []) {
      const [x, z] = R.xz(c.lieu[0], c.lieu[1]), el = document.createElement('div');
      el.className = 'lbl unite'; el.style.setProperty('--uc', '#3a3a3a'); el.textContent = '⚔ ' + c.nom;
      etiquettes.appendChild(el); A.chocs.push({ el, p: new THREE.Vector3(x, R.y(x, z) + 0.01, z) });
      points.push(new THREE.Vector3(x, R.y(x, z), z));
    }
    for (const [a, b] of P.combats || []) {
      const ua = A.unites[a], ub = A.unites[b];
      if (ua && ub && ua.visible && ub.visible) A.combats.push({ a: ua, b: ub, nuage: nuage() });
    }
    for (const t of P.tirs || []) {
      const de = A.unites[t.de], vers = A.unites[t.vers];
      if (de && vers && de.visible && vers.visible) A.tirs.push(volee(de, vers));
    }
    return points;
  }

  function masquer() { detruire(); groupe.visible = false; }

  // ---------- animation ----------
  const v3 = new THREE.Vector3(), q = new THREE.Quaternion(), mat4 = new THREE.Matrix4(), un = new THREE.Vector3(1, 1, 1), echelle = new THREE.Vector3();
  const axeZ = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3();
  // Direction de l'ennemi dans le repère local d'une unité (pour pousser le front vers lui).
  function versEnnemi(u, autre) {
    dir.set(autre.g.position.x - u.g.position.x, 0, autre.g.position.z - u.g.position.z);
    const L = dir.length() || 1; dir.divideScalar(L);
    const c = Math.cos(-u.g.rotation.y), s = Math.sin(-u.g.rotation.y);
    return [dir.x * c + dir.z * s, -dir.x * s + dir.z * c, L];
  }
  function animerElements(u, enCombat) {
    const marche = u.t < 1, cheval = u.forme === 'cavalerie';
    for (const o of u.elements) {
      const d = o.userData;
      if (d.drapeau) { agiter(o, temps, enCombat ? 1.4 : marche ? 1.2 : 0.8); continue; }
      let dx = 0, dy = 0, dz = 0;
      if (marche) { // pas cadencé ; les chevaux trottent
        dy = Math.abs(Math.sin(temps * (cheval ? 14 : 10) * d.vif + d.ph)) * (cheval ? 0.0022 : 0.0016);
      }
      if (enCombat) {
        // chaque pion fait face à l'ennemi de son côté (pris à revers : deux fronts) ;
        // le front avance et recule par à-coups, les rangs du milieu bougent moins
        let ex = 0, ez = 0, meilleur = -Infinity;
        for (const [x, z] of enCombat) { const p = d.lx * x + d.lz * z; if (p > meilleur) { meilleur = p; ex = x; ez = z; } }
        const front = Math.max(0.25, Math.min(1, (meilleur / (Math.max(u.w, u.d) / 2)) * 0.5 + 0.6));
        const pousse = (Math.sin(temps * 5.5 * d.vif + d.ph) * 0.5 + 0.5) * 0.006 * front;
        dx += ex * pousse + Math.sin(temps * 7.3 + d.ph * 2) * 0.0012 * front;
        dz += ez * pousse + Math.cos(temps * 6.1 + d.ph * 3) * 0.0012 * front;
        dy += Math.max(0, Math.sin(temps * 9 * d.vif + d.ph)) * (cheval ? 0.003 : 0.0024) * front;
        if (cheval) o.rotation.x = Math.sin(temps * 8 + d.ph) * 0.18 * front; // chevaux qui se cabrent
      } else if (cheval) o.rotation.x = 0;
      o.position.set(d.lx + dx, d.y0 + dy, d.lz + dz);
    }
  }

  function maj(dt, camera, w, h) {
    if (!actuelle) return;
    if (!reduit) temps += dt;
    for (const m of materiauxLignes) { m.resolution.set(w, h); if (!reduit) m.dashOffset -= dt * 0.03; }
    for (const f of actuelle.traces) if (f.t < 1) { f.t = Math.min(1, f.t + dt / TRACE); tracer(f); }
    // qui combat qui (direction locale de l'ennemi, pour chaque unité engagée)
    const engage = new Map();
    for (const c of actuelle.combats) {
      if (c.a.t < 1 || c.b.t < 1) continue; // on combat une fois arrivé
      const [ax, az] = versEnnemi(c.a, c.b), [bx, bz] = versEnnemi(c.b, c.a);
      if (!engage.has(c.a)) engage.set(c.a, []); if (!engage.has(c.b)) engage.set(c.b, []);
      engage.get(c.a).push([ax, az]); engage.get(c.b).push([bx, bz]);
    }
    for (const u of Object.values(actuelle.unites)) {
      if (!u.visible) continue;
      if (u.t < 1) {
        u.t = Math.min(1, u.t + dt / MARCHE);
        const k = lisse(u.t), x = u.de.x + (u.vers.x - u.de.x) * k, z = u.de.z + (u.vers.z - u.de.z) * k;
        let da = u.vers.cap - u.de.cap; da = Math.atan2(Math.sin(da), Math.cos(da));
        u.g.position.set(x, R.y(x, z), z); u.g.rotation.y = u.de.cap + da * k;
        poser(u);
      }
      if (!reduit) animerElements(u, engage.get(u));
      v3.set(u.g.position.x, u.g.position.y + 0.035, u.g.position.z).project(camera);
      u.ecran = v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2 ? [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h] : null;
    }
    // poussière : entre les deux unités engagées, sur la largeur du front
    for (const c of actuelle.combats) {
      const actif = engage.has(c.a) && !reduit;
      c.nuage.p.visible = actif;
      if (!actif) continue;
      pa.copy(c.a.g.position); pb.copy(c.b.g.position);
      const L = pa.distanceTo(pb) || 1, ra = Math.min(c.a.w, c.a.d) / 2, rb = Math.min(c.b.w, c.b.d) / 2;
      // milieu de l'espace qui sépare les deux fronts
      const t = Math.min(0.9, Math.max(0.1, (ra + (L - ra - rb) / 2) / L));
      const cx = pa.x + (pb.x - pa.x) * t, cz = pa.z + (pb.z - pa.z) * t, larg = Math.max(0.03, Math.min(c.a.w, c.b.w) * 0.5);
      const px = -(pb.z - pa.z) / L, pz = (pb.x - pa.x) / L; // le long du front
      // taille des bouffées : lisible de loin (quelques pixels au moins), discrète de près
      const rayon = Math.min(0.045, Math.max(0.008, camera.position.distanceTo(v3.set(cx, pa.y, cz)) * 0.011));
      c.nuage.grains.forEach((g, i) => {
        const k = (g.k + temps * 0.35 * g.v) % 1;
        const s = Math.sin(g.a) * g.r * larg, e = Math.cos(g.a) * g.r * 0.03 + k * 0.01 * Math.cos(g.a);
        const x = cx + px * s + (pb.x - pa.x) / L * e, z = cz + pz * s + (pb.z - pa.z) / L * e;
        const r = rayon * (0.5 + g.v * 0.5) * Math.sin(Math.PI * Math.min(1, k * 1.3));
        mat4.compose(v3.set(x, R.y(x, z) + r * 0.6 + k * 0.022, z), q.identity(), echelle.setScalar(Math.max(1e-5, r)));
        c.nuage.p.setMatrixAt(i, mat4);
      });
      c.nuage.p.instanceMatrix.needsUpdate = true;
    }
    // volées de flèches
    for (const t of actuelle.tirs) {
      const actif = t.de.t >= 1 && t.vers.t >= 1 && !reduit;
      t.m.visible = actif;
      if (!actif) continue;
      const A = t.de.g.position, Bp = t.vers.g.position;
      t.traits.forEach((tr, i) => {
        const k = (tr.k + temps * 0.55) % 1;
        const ax = A.x + tr.a[0], az = A.z + tr.a[1], bx = Bp.x + tr.b[0], bz = Bp.z + tr.b[1];
        const L = Math.hypot(bx - ax, bz - az), haut = L * 0.22;
        const y0 = R.y(ax, az) + 0.012, y1 = R.y(bx, bz) + 0.002;
        const x = ax + (bx - ax) * k, z = az + (bz - az) * k, y = y0 + (y1 - y0) * k + haut * 4 * k * (1 - k);
        // orientation selon la tangente de la parabole
        dir.set(bx - ax, (y1 - y0) + haut * 4 * (1 - 2 * k), bz - az).normalize();
        q.setFromUnitVectors(axeZ, dir);
        mat4.compose(v3.set(x, y, z), q, un);
        t.m.setMatrixAt(i, mat4);
      });
      t.m.instanceMatrix.needsUpdate = true;
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
