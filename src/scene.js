// Mise en scène des missions sur la carte : repères (étiquettes cliquables de personnes, de lieux et
// d'objets, sans aucune silhouette humaine), accessoires 3D (tentes, chameaux, chevaux, éléphant, feux,
// bateaux, pierres dressées, lumière de présence) et effets (vol d'oiseaux, poussière, chute des idoles).
// Coordonnées : [lat, lon] ; les tailles (rayon) en mètres.
import * as THREE from 'three';
import { ic } from './icones.js';
import { chameau, cheval, bateau, elephant, oiseau } from './montures.js';

const ICONES = { personne: 'bulle', lieu: 'pin', objet: 'cube', animal: 'flag', presence: 'star' };
const alea = (() => { let g = 11; return () => { g = (g * 16807) % 2147483647; return (g - 1) / 2147483646; }; })();

export function creerMiseEnScene({ scene, R, etiquettes, reduit, surRepere }) {
  const REP = new Map(), ACC = new Map(), animes = [];
  const groupe = new THREE.Group(); scene.add(groupe);
  const v3 = new THREE.Vector3();
  const sol = (x, z) => R.sol(x, z);

  // ---------- repères ----------
  function creerRepere(r) {
    const el = document.createElement('div'), genre = r.genre || 'personne';
    el.className = `lbl repere g-${genre}`;
    el.innerHTML = `<span class="ico">${ic(ICONES[genre] || 'pin')}</span><span class="nm"></span><span class="q"></span>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); const p = REP.get(r.id); if (p && p.actif) surRepere(r.id); });
    etiquettes.appendChild(el);
    const [x, z] = R.xz(r.lat, r.lon);
    const p = { id: r.id, el, x, z, h: (r.h ?? 0) / 1000, visible: r.visible !== false, actif: false, chemin: null, nom: '', qualite: '' };
    REP.set(r.id, p);
    nommer(p, r.nom, r.qualite);
    return p;
  }
  function nommer(p, nom, qualite) {
    p.nom = nom || ''; p.qualite = qualite || '';
    p.el.querySelector('.nm').textContent = p.nom;
    const q = p.el.querySelector('.q'); q.textContent = p.qualite; q.hidden = !p.qualite;
  }
  function viderReperes() { REP.forEach((p) => p.el.remove()); REP.clear(); }
  function reperes(liste) { viderReperes(); (liste || []).forEach(creerRepere); }
  // Mise à jour d'un repère : visible, actif (cliquable), cible (pulsation), position, nom.
  function repere(id, o = {}) {
    const p = REP.get(id); if (!p) return;
    if ('visible' in o) p.visible = !!o.visible;
    if ('actif' in o) p.actif = !!o.actif;
    if ('cible' in o) p.el.classList.toggle('cible', !!o.cible);
    if ('vu' in o) p.el.classList.toggle('vu', !!o.vu);
    if (o.lat != null) { [p.x, p.z] = R.xz(o.lat, o.lon); p.chemin = null; }
    if ('nom' in o) nommer(p, o.nom, o.qualite);
    p.el.classList.toggle('actif', p.actif && p.visible);
  }
  const ouRepere = (id) => { const p = REP.get(id); return p ? R.latlon(p.x, p.z) : null; };
  // Déplace un repère le long d'un chemin ([lat, lon]…), en « duree » secondes.
  function deplacer(id, chemin, duree = 4) {
    const p = REP.get(id); if (!p) return Promise.resolve();
    const pts = [[p.x, p.z], ...chemin.map(([la, lo]) => R.xz(la, lo))];
    let L = 0; const seg = [];
    for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); seg.push(d); L += d; }
    if (reduit || !L || duree <= 0) { [p.x, p.z] = pts[pts.length - 1]; return Promise.resolve(); }
    return new Promise((fin) => { p.chemin = { pts, seg, L, t: 0, duree, fin }; });
  }

  // ---------- accessoires ----------
  // tente de campagne : toile tendue sur un faîtage, basse et allongée
  const geoTente = (() => {
    const f = new THREE.Shape(); f.moveTo(-0.75, 0); f.quadraticCurveTo(-0.45, 0.55, 0, 0.75); f.quadraticCurveTo(0.45, 0.55, 0.75, 0); f.lineTo(-0.75, 0);
    const g = new THREE.ExtrudeGeometry(f, { depth: 1.3, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -0.65);
    return g;
  })();
  const geoPierre = new THREE.CylinderGeometry(0.28, 0.4, 1.6, 6); geoPierre.translate(0, 0.8, 0);
  const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9 }, o || {}));
  // semis de points dans un disque (rayon en mètres), sur un sol peu pentu
  function semis(lat, lon, rayon, n) {
    const [cx, cz] = R.xz(lat, lon), out = [];
    for (let k = 0; out.length < n && k < n * 20; k++) {
      const a = alea() * Math.PI * 2, r = Math.sqrt(alea()) * rayon / 1000, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.85;
      if (R.y(x, z) > 0.002 && R.pente(x, z) < 260) out.push([x, z]);
    }
    return out;
  }
  // dégradé vertical (opaque au pied, transparent en haut) pour la colonne de lumière
  let texDegrade = null;
  function degrade() {
    if (texDegrade) return texDegrade;
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64;
    const ctx = cv.getContext('2d'), gr = ctx.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.55, '#333'); gr.addColorStop(1, '#fff');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 4, 64);
    return (texDegrade = new THREE.CanvasTexture(cv));
  }
  const FABRIQUES = {
    tentes(a) {
      const g = new THREE.Group(), mat = M(a.couleur || '#F1E8D6', { side: THREE.DoubleSide });
      for (const [x, z] of semis(a.lat, a.lon, a.rayon || 120, a.n || 20)) {
        const t = new THREE.Mesh(geoTente, mat); t.position.set(x, R.y(x, z) - 0.001, z); t.rotation.y = alea() * 6;
        t.scale.setScalar((a.grande ? 0.04 : 0.012) * (0.85 + alea() * 0.35)); t.castShadow = t.receiveShadow = true; g.add(t);
      }
      return g;
    },
    tente(a) { return FABRIQUES.tentes({ ...a, n: 1, rayon: 0.1, grande: true }); },
    troupeau(a) { // chameaux (ou chevaux) au repos ou au pas ; leur taille suit le zoom, comme les convois
      const g = new THREE.Group(); g.userData.betes = [];
      for (const [x, z] of semis(a.lat, a.lon, a.rayon || 40, a.n || 8)) {
        const b = a.chevaux ? cheval(Math.floor(alea() * 3)) : chameau(!!a.charge && alea() < 0.5);
        b.position.set(x, sol(x, z), z); b.rotation.y = alea() * 6; g.add(b); g.userData.betes.push(b);
      }
      return g;
    },
    elephant(a) {
      const g = new THREE.Group(), e = elephant(), [x, z] = R.xz(a.lat, a.lon);
      e.position.set(x, sol(x, z), z); e.rotation.y = -(a.cap || 0) * Math.PI / 180 + Math.PI; g.add(e); g.userData.betes = [e]; g.userData.echelle = 1.25;
      return g;
    },
    bateau(a) {
      const g = new THREE.Group(), b = bateau(), [x, z] = R.xz(a.lat, a.lon);
      b.position.set(x, -0.004, z); b.rotation.y = -(a.cap || 0) * Math.PI / 180 + Math.PI / 2; g.add(b); g.userData.betes = [b]; g.userData.echelle = 1.6; g.userData.flotte = true;
      return g;
    },
    feux(a) {
      const g = new THREE.Group(), geo = new THREE.SphereGeometry(1, 8, 6);
      const coeur = new THREE.MeshBasicMaterial({ color: 0xFFC46B }), halo = new THREE.MeshBasicMaterial({ color: 0xFF7A1F, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
      g.userData.feux = semis(a.lat, a.lon, a.rayon || 60, a.n || 6).map(([x, z]) => {
        const c = new THREE.Mesh(geo, coeur), h = new THREE.Mesh(geo, halo), y = R.y(x, z);
        c.position.set(x, y, z); h.position.set(x, y, z); g.add(c, h);
        return { c, h, y, ph: alea() * 6 };
      });
      return g;
    },
    // Pierres dressées (les idoles de la Ka'ba étaient pour beaucoup des bétyles) : jamais de figure humaine.
    pierres(a) {
      const g = new THREE.Group(), mat = M(a.couleur || '#6E6259'), [cx, cz] = R.xz(a.lat, a.lon), n = a.n || 24, r = (a.rayon || 25) / 1000;
      g.userData.pierres = [];
      for (let k = 0; k < n; k++) {
        const ang = k / n * Math.PI * 2 + alea() * 0.1, rr = r * (0.85 + alea() * 0.3), x = cx + Math.cos(ang) * rr, z = cz + Math.sin(ang) * rr;
        const p = new THREE.Mesh(geoPierre, mat); p.position.set(x, R.y(x, z), z); p.rotation.y = alea() * 6;
        p.scale.setScalar(0.0022 * (0.7 + alea() * 0.7)); p.castShadow = true; g.add(p);
        g.userData.pierres.push({ p, ang, chute: 0 });
      }
      return g;
    },
    // Présence (le Prophète ﷺ et les Compagnons ne sont jamais montrés) : une colonne de lumière douce.
    lumiere(a) {
      const g = new THREE.Group(), [x, z] = R.xz(a.lat, a.lon), y = R.y(x, z);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xFFE3A0, transparent: true, opacity: 0.5, alphaMap: degrade(), depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      col.geometry.translate(0, 0.5, 0);
      const coeur = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xFFF1C9, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      col.position.set(x, y, z); coeur.position.set(x, y, z); g.add(col, coeur);
      g.userData.lumiere = { col, coeur, y };
      return g;
    },
  };
  function accessoires(liste) {
    ACC.forEach((a) => groupe.remove(a.o)); ACC.clear();
    (liste || []).forEach((a, k) => {
      const f = FABRIQUES[a.type]; if (!f) return;
      const o = f(a); o.visible = a.visible !== false; groupe.add(o);
      ACC.set(a.id || `_${k}`, { o, a });
    });
  }
  function accessoire(id, visible) { const a = ACC.get(id); if (a) a.o.visible = !!visible; }

  // ---------- effets ----------
  function effet(nom, o = {}) {
    if (nom === 'oiseaux') return oiseaux(o);
    if (nom === 'idoles') return idoles(o);
    if (nom === 'poussiere') return poussiere(o);
    return Promise.resolve();
  }
  // Des nuées d'oiseaux arrivent de la mer et lâchent leurs pierres sur l'armée (sourate al-Fîl).
  function oiseaux({ lat, lon, n = 60, duree = 7 }) {
    const [cx, cz] = R.xz(lat, lon), g = new THREE.Group(); groupe.add(g);
    const vol = Array.from({ length: n }, () => {
      const b = oiseau(); g.add(b);
      return { b, dx: -2.5 - alea() * 1.5, dz: (alea() - 0.5) * 1.5, ph: alea() * 6, retard: alea() * 2, tx: (alea() - 0.5) * 0.5, tz: (alea() - 0.5) * 0.5, tombes: [] };
    });
    const cailloux = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0x3A2C22 }), 400);
    cailloux.count = 0; cailloux.frustumCulled = false; g.add(cailloux);
    return new Promise((fin) => {
      if (reduit) { groupe.remove(g); fin(); return; }
      animes.push({ t: 0, maj(dt, vue) {
        this.t += dt;
        const s = Math.min(0.05, Math.max(0.004, vue * 0.008)), m = new THREE.Matrix4(), q = new THREE.Quaternion();
        let nb = 0;
        for (const o of vol) {
          const u = Math.min(1, Math.max(0, (this.t - o.retard) / (duree * 0.55)));
          const x = cx + o.tx + o.dx * (1 - u), z = cz + o.tz + o.dz * (1 - u) + Math.sin(this.t + o.ph) * 0.05 * u;
          o.b.position.set(x, sol(cx, cz) + 0.6 + 0.4 * (1 - u) + Math.sin(this.t * 2 + o.ph) * 0.03, z);
          o.b.rotation.y = Math.atan2(-o.dx, -o.dz) + (u >= 1 ? this.t : 0);
          o.b.scale.setScalar(s);
          const batt = Math.sin(this.t * 14 + o.ph) * 0.6;
          o.b.userData.ailes.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * batt));
          if (u >= 1 && alea() < dt * 1.5 && o.tombes.length < 6) o.tombes.push({ x, z, y: o.b.position.y });
          for (const c of o.tombes) {
            c.y = Math.max(sol(c.x, c.z), c.y - dt * 0.8);
            if (nb < 400) { m.compose(v3.set(c.x, c.y, c.z), q, new THREE.Vector3(s * 0.15, s * 0.15, s * 0.15)); cailloux.setMatrixAt(nb++, m); }
          }
        }
        cailloux.count = nb; cailloux.instanceMatrix.needsUpdate = true;
        if (this.t > duree) { groupe.remove(g); fin(); return true; }
        return false;
      } });
    });
  }
  // Les pierres dressées tombent une à une.
  function idoles({ id, intervalle = 0.08 }) {
    const a = ACC.get(id); if (!a || !a.o.userData.pierres) return Promise.resolve();
    const P = a.o.userData.pierres;
    if (reduit) { P.forEach((p) => { p.p.rotation.z = Math.PI / 2; }); return Promise.resolve(); }
    return new Promise((fin) => animes.push({ t: 0, maj(dt) {
      this.t += dt;
      P.forEach((p, k) => { const u = Math.min(1, Math.max(0, (this.t - k * intervalle) / 0.5)); p.p.rotation.set(0, p.ang, u * u * Math.PI / 2); });
      if (this.t > P.length * intervalle + 0.6) { fin(); return true; }
      return false;
    } }));
  }
  function poussiere({ lat, lon, rayon = 300, duree = 3 }) {
    const [x, z] = R.xz(lat, lon), mat = new THREE.MeshBasicMaterial({ color: 0xD8BC8E, transparent: true, opacity: 0.5, depthWrite: false });
    const nuage = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat); nuage.position.set(x, sol(x, z), z); groupe.add(nuage);
    if (reduit) { groupe.remove(nuage); return Promise.resolve(); }
    return new Promise((fin) => animes.push({ t: 0, maj(dt) {
      this.t += dt; const u = this.t / duree, r = rayon / 1000 * (0.3 + u);
      nuage.scale.set(r, r * 0.35, r); mat.opacity = 0.5 * (1 - u);
      if (u >= 1) { groupe.remove(nuage); fin(); return true; }
      return false;
    } }));
  }

  // ---------- état (retour dans le temps) ----------
  function instantane() {
    return {
      rep: [...REP.values()].map((p) => ({ id: p.id, x: p.x, z: p.z, visible: p.visible, nom: p.nom, qualite: p.qualite })),
      acc: [...ACC.entries()].map(([id, a]) => [id, a.o.visible]),
    };
  }
  function restaurer(s) {
    for (const r of s.rep) { const p = REP.get(r.id); if (!p) continue; p.x = r.x; p.z = r.z; p.visible = r.visible; p.chemin = null; nommer(p, r.nom, r.qualite); p.el.classList.remove('vu', 'cible'); }
    for (const [id, v] of s.acc) accessoire(id, v);
  }
  function vider() { viderReperes(); accessoires([]); animes.length = 0; groupe.clear(); }

  // ---------- à chaque image ----------
  function maj(dt, now, camera, w, h, vue) {
    for (let k = animes.length - 1; k >= 0; k--) if (animes[k].maj(dt, vue)) animes.splice(k, 1);
    const cs = Math.min(1.2, Math.max(0.0018, vue * 0.006));
    for (const { o } of ACC.values()) {
      if (!o.visible) continue;
      const u = o.userData;
      if (u.betes) u.betes.forEach((b) => b.scale.setScalar(cs * (u.echelle || 1)));
      if (u.flotte) u.betes.forEach((b) => { b.rotation.z = Math.sin(now / 700) * 0.04; });
      if (u.feux) {
        const s = Math.min(0.06, Math.max(0.0035, vue * 0.0016));
        u.feux.forEach((f) => { const v = reduit ? 1 : 0.8 + 0.25 * Math.sin(now / 90 + f.ph); f.c.position.y = f.y + s * 0.8; f.c.scale.set(s * v * 0.7, s * v * 1.3, s * v * 0.7); f.h.position.y = f.y + s * 0.8; f.h.scale.setScalar(s * v * 2.6); });
      }
      if (u.lumiere) {
        const L = u.lumiere, r = Math.max(0.003, vue * 0.004), p = reduit ? 1 : 1 + 0.08 * Math.sin(now / 500);
        L.col.scale.set(r * p, Math.max(0.03, vue * 0.12), r * p); L.coeur.scale.setScalar(r * 1.6 * p); L.coeur.position.y = L.y + r * 2;
      }
    }
    const places = [];
    for (const p of REP.values()) {
      if (p.chemin) {
        const c = p.chemin; c.t = Math.min(c.duree, c.t + dt);
        let d = c.L * c.t / c.duree, k = 0;
        while (k < c.seg.length - 1 && d > c.seg[k]) { d -= c.seg[k]; k++; }
        const f = c.seg[k] ? Math.min(1, d / c.seg[k]) : 1;
        p.x = c.pts[k][0] + (c.pts[k + 1][0] - c.pts[k][0]) * f; p.z = c.pts[k][1] + (c.pts[k + 1][1] - c.pts[k][1]) * f;
        if (c.t >= c.duree) { p.chemin = null; c.fin(); }
      }
      let montre = p.visible;
      if (montre) {
        v3.set(p.x, sol(p.x, p.z) + p.h, p.z).project(camera);
        montre = v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2;
        if (montre) places.push({ p, x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h });
      }
      p.el.classList.toggle('off', !montre);
      p.el.classList.toggle('actif', p.actif && p.visible);
    }
    // les étiquettes qui se chevauchent sont empilées vers le haut (le trait qui les relie au sol s'allonge)
    places.sort((a, b) => b.y - a.y);
    const poses = [];
    for (const q of places) {
      if (!q.p.l || q.p.mesure !== q.p.nom) { q.p.l = q.p.el.offsetWidth || 120; q.p.mesure = q.p.nom; }
      const lw = q.p.l, hh = 30;
      let bas = q.y - 18;
      for (let k = 0; k < 12; k++) {
        const g = poses.find((r) => Math.abs(r.x - q.x) < (r.l + lw) / 2 + 4 && bas > r.bas - hh - 2 && bas - hh < r.bas + 2);
        if (!g) break;
        bas = g.bas - hh - 4;
      }
      poses.push({ x: q.x, l: lw, bas });
      // l'étiquette reste dans l'écran ; le trait, lui, part toujours du point du sol
      const gauche = Math.min(w - lw - 6, Math.max(6, q.x - lw / 2)), decal = q.x - (gauche + lw / 2);
      q.p.el.style.setProperty('--tige', `${q.y - bas}px`);
      q.p.el.style.setProperty('--decal', `${decal}px`);
      q.p.el.style.transform = `translate(${gauche}px,${bas}px) translate(0,-100%)`;
    }
  }

  const visibles = () => [...REP.values()].filter((p) => p.visible).map((p) => R.latlon(p.x, p.z));
  return { reperes, repere, ouRepere, visibles, deplacer, accessoires, accessoire, effet, instantane, restaurer, vider, maj, liste: () => [...REP.keys()] };
}
