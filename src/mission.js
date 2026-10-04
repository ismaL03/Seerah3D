// Missions à la première personne : interprète des fichiers data/missions/<id>.json, joués dans le monde
// de src/monde.js. Une mission est une suite d'étapes (scène, récit, parole, choix, objectif, faire).
// Un mauvais choix ne se révèle pas tout de suite : sa « suite » se joue (on continue un peu, parfois en
// marchant), puis vient la conséquence imaginaire et le retour au dernier point de reprise.
// Le Prophète ﷺ, les prophètes, les Compagnons et sa famille restent hors champ : jamais de silhouette,
// aucune parole inventée.
import { creerMonde } from './monde.js';

const $ = (s) => document.querySelector(s);
const melanger = (t) => { t = [...t]; for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } return t; };
class Echec { constructor(o) { this.o = o; } }

export function creerMissions({ hote, ui }) {
  const { reduit, mobile } = ui;
  const cache = new Map();
  let W = null, M = null, run = null;

  const charger = (id) => {
    if (!cache.has(id)) cache.set(id, fetch(`data/missions/${id}.json`).then((r) => { if (!r.ok) throw new Error(`Mission introuvable : ${id}`); return r.json(); }));
    return cache.get(id);
  };
  function monde() {
    if (!W) W = creerMonde({ hote, reduit, mobile, pas: (c) => ui.son.pas(c) });
    return W;
  }

  // ---------- interface ----------
  function hudObjectif(texte, compteur) {
    $('#joMission').textContent = M.titre;
    $('#joTexte').textContent = texte;
    $('#joCompteur').hidden = compteur == null; if (compteur != null) $('#joCompteur').textContent = compteur;
    $('#jObjectif').hidden = !texte;
    $('#jObjectif').classList.remove('neuf'); void $('#jObjectif').offsetWidth; $('#jObjectif').classList.add('neuf');
  }
  const compteur = (t) => { $('#joCompteur').hidden = t == null; $('#joCompteur').textContent = t ?? ''; };
  function commandes(on) {
    const el = $('#jCommandes'); el.hidden = !on || mobile;
    if (on && !el.innerHTML) el.innerHTML = '<span><kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> marcher</span><span><kbd>Maj</kbd> courir</span><span>souris : regarder</span><span><kbd>E</kbd> agir</span><span><kbd>Échap</kbd> menu</span>';
  }
  function flottant(texte, ar) {
    if (reduit) return;
    const s = document.createElement('span'); s.textContent = texte; if (ar) s.lang = 'ar';
    $('#jFlottants').appendChild(s); setTimeout(() => s.remove(), 1600);
  }
  function role(R) {
    $('#jrNom').textContent = R.nom; $('#jrAr').textContent = R.nom_ar || ''; $('#jrTexte').textContent = R.texte || '';
    $('#jrRegle').textContent = R.regle || ''; $('#jrRegle').hidden = !R.regle;
    $('#jrTouches').innerHTML = mobile
      ? '<dt>Joystick (gauche)</dt><dd>marcher</dd><dt>Glisser à droite</dt><dd>regarder</dd><dt>Bouton Agir</dt><dd>parler, prendre, invoquer</dd>'
      : '<dt><kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> ou flèches</dt><dd>marcher (<kbd>Maj</kbd> pour courir)</dd><dt>Souris</dt><dd>regarder (cliquez dans la scène pour la capturer)</dd><dt><kbd>E</kbd></dt><dd>parler, prendre, agir — maintenir pour invoquer</dd>';
    $('#jRole').hidden = false;
    return new Promise((ok) => {
      const fin = () => { removeEventListener('keydown', clavier); $('#jRole').hidden = true; ok(); };
      const clavier = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fin(); } };
      $('#jrGo').onclick = fin; addEventListener('keydown', clavier);
      run.nettoyer.push(() => removeEventListener('keydown', clavier));
    });
  }
  // Carte d'invocation : le texte apparaît pendant que le joueur maintient la touche.
  function invocation(inv, p) {
    const el = $('#jInvoc');
    if (p == null) { el.hidden = true; el.classList.remove('exaucee'); return; }
    if (el.hidden) {
      $('#jiTitre').textContent = inv.titre || 'Invocation'; $('#jiAr').textContent = inv.ar || ''; $('#jiFr').textContent = inv.fr || '';
      $('#jiSrc').textContent = inv.source || ''; el.hidden = false;
    }
    $('#jiJauge').style.width = `${Math.round(p * 100)}%`;
    el.style.setProperty('--p', p);
    el.classList.toggle('exaucee', p >= 1);
  }

  // ---------- étiquettes du dialogue ----------
  const nomDe = (id) => { const s = M.personnages && M.personnages[id]; return s ? s.nom : id; };
  const tagPnj = (id) => { const s = (M.personnages && M.personnages[id]) || {}; return { lieu: s.nom || id, date: s.qualite || '' }; };
  const tagRecit = (e) => ({ lieu: e.qui || run.lieu || M.titre, date: e.sous || run.date || '' });

  // ---------- scènes ----------
  async function scene(e, ok) {
    const def = M.scenes[e.scene];
    if (!def) throw new Error(`Scène inconnue : ${e.scene}`);
    run.lieu = e.titre || def.titre || run.lieu; run.date = e.sous || def.sous || run.date;
    await W.fondu(true, [run.lieu, run.date].filter(Boolean).join(' · ')); ok();
    W.charger(def); run.scene = e.scene; run.ambiance = def.ambiance || 'jour';
    if (e.ambiance) { W.ambiance(e.ambiance); run.ambiance = e.ambiance; }
    if (e.depart) W.teleporter(...e.depart);
    await ui.pause(reduit ? 0 : 900); ok();
    W.fondu(false);
  }

  // ---------- actions ----------
  function point(cible) {
    if (Array.isArray(cible)) return cible;
    if (cible === 'joueur') { const p = W.position(); return [p.x, p.z]; }
    return W.ou(cible) || null;
  }
  async function action(a, ok) {
    if (a.montrer) [].concat(a.montrer).forEach((id) => W.montrer(id, true));
    if (a.cacher) [].concat(a.cacher).forEach((id) => W.montrer(id, false));
    if (a.ambiance) { W.ambiance(a.ambiance); run.ambiance = a.ambiance; }
    if (a.inviter) W.inviter(a.inviter, a.texte ?? null);
    if ('porter' in a) W.porter(a.porter);
    if (a.teleporter) W.teleporter(...a.teleporter);
    if (a.suivre) W.suivre(a.suivre, true, a.ecart || 2.5);
    if (a.lacher) W.suivre(a.lacher, false);
    if (a.tourner) W.tourner(a.tourner, a.cap || 0);
    if (a.geste) W.geste(a.geste);
    if (a.placer) W.placer(a.placer, a.en, a.rayon);
    if (a.champ) W.champ(a.champ, a.duree);
    if (a.garde) W.garde(a.garde, !!a.on);
    if (a.drapeau) run.sac.add(a.drapeau);
    if ('bateau' in a) W.vehicule(a.bateau ? 'bateau' : null, a);
    if (a.flottant) flottant(a.flottant, a.ar);
    if (a.son) ui.son[a.son] && ui.son[a.son]();
    if (a.fondu != null) { await W.fondu(!!a.fondu, a.texte || ''); ok(); }
    if (a.aller) {
      // « vers le joueur » : on s'arrête à deux pas de lui, face à lui
      const devant = () => { const j = W.position(), n = W.pnj(a.aller) || { x: j.x, z: j.z + 1 }, d = Math.hypot(n.x - j.x, n.z - j.z) || 1; return [j.x + (n.x - j.x) / d * 1.9, j.z + (n.z - j.z) / d * 1.9]; };
      // trop loin du joueur : on le rapproche d'abord (hors de sa vue, le plus souvent)
      if (a.vers === 'joueur') { const j = W.position(), n = W.pnj(a.aller); if (n && Math.hypot(n.x - j.x, n.z - j.z) > 24) { const d = Math.hypot(n.x - j.x, n.z - j.z); W.placer(a.aller, [j.x + (n.x - j.x) / d * 12, j.z + (n.z - j.z) / d * 12], 0); } }
      const vers = a.vers === 'joueur' ? [devant()] : a.vers.map((p) => point(p));
      const fin = W.aller(a.aller, vers, a.vitesse);
      if (a.attendre !== false) { await Promise.race([fin, ui.pause(a.max || 12000)]); ok(); }
    }
    if (a.regarder) { const p = typeof a.regarder === 'string' && a.regarder.startsWith('pnj:') ? W.tete(a.regarder.slice(4)) : a.regarder.length === 2 ? [a.regarder[0], 1.6, a.regarder[1]] : a.regarder; if (p) { await W.regarder(p, a.duree || 1.2); ok(); } }
    if (a.effet) { const fin = W.effet(a.effet, a); if (a.attendre !== false) { await fin; ok(); } }
    if (a.pause) { await ui.pause(reduit ? 0 : a.pause); ok(); }
  }

  // ---------- étapes ----------
  const ETAPES = {
    scene,
    async recit(e, ok) {
      W.bloquer(true); commandes(false);
      if (e.regarder) await action({ regarder: e.regarder, duree: 1 }, ok);
      await ui.dire(e.texte, tagRecit(e)); ok();
    },
    async parole(e, ok) {
      W.bloquer(true); commandes(false);
      W.faireFace(e.qui);
      if (!e.sansRegard) { const t = W.tete(e.qui); if (t) { await W.regarder(t, 0.7); ok(); } }
      if (e.geste !== false) W.geste(e.qui);
      await ui.dire(e.texte, tagPnj(e.qui)); ok();
      W.faireFace(e.qui, false);
    },
    // Dialogue à choix : l'option fausse n'est pas signalée, sa suite se joue d'abord.
    async choix(e, ok) {
      W.bloquer(true); commandes(false);
      if (e.qui) { W.faireFace(e.qui); const t = W.tete(e.qui); if (t) { await W.regarder(t, 0.7); ok(); } }
      const ordre = e._ordre || (e._ordre = melanger(e.options.map((_, k) => k)));
      const tentes = e._tentes || (e._tentes = new Set());
      run.choix = e;
      const i = await ui.proposer(e.question, ordre.map((k) => e.options[k]), tentes, e.qui ? tagPnj(e.qui) : tagRecit(e), tentes.size > 0); ok();
      run.choix = null;
      const o = e.options[ordre[i]];
      if (o.juste) {
        const b = ui.boutonOption(i); b.classList.add('juste');
        document.querySelectorAll('#jdOptions .j-opt').forEach((x) => { if (x !== b) x.disabled = true; });
        ui.succes(b); if (e.epreuve !== false) reussir(b);
        await ui.pause(reduit ? 0 : 800); ok();
        if (o.suite) await executer(o.suite, ok);
        return;
      }
      tentes.add(i);
      throw new Echec(o);
    },
    // Le joueur se déplace librement jusqu'à remplir la condition « quand » ; les « echecs » guettent.
    async objectif(e, ok) {
      ui.masquerDialogue(); W.bloquer(false); commandes(true);
      const q = e.quand || {};
      hudObjectif(e.texte, null);
      W.cibler(e.cible || null);
      $('#joGuider').hidden = !e.cible || e.guider === false;
      run.objectif = e;
      const r = run, abos = [], on = (t, f) => abos.push(W.on(t, f));
      try {
        await new Promise((fini, rate) => {
          r.resoudre = fini; r.rater = rate;
          const ech = (f) => rate(new Echec(f));
          if (q.parler || q.utiliser || q.prendre) {
            const id = q.parler || q.utiliser || q.prendre;
            on('agir', (d) => { if (d.id !== id) return; if (q.prendre) { W.montrer(id, false); if (q.porter) W.porter(q.porter); } fini(); });
          }
          if (q.zone) { on('zone', (d) => d.id === q.zone && fini()); if (W.dans(q.zone)) fini(); }
          if (q.tous) { // parler à chacun (leurs paroles sont dans « dialogues »)
            const vus = new Set(); compteur(`${q.nom || 'Écoutés'} : 0 / ${q.tous.length}`);
            on('agir', async (d) => {
              if (!q.tous.includes(d.id)) return;
              await parlerLibre(d.id, M.dialogues[d.id] || ['…'], true);
              if (run !== r) return;
              vus.add(d.id); compteur(`${q.nom || 'Écoutés'} : ${vus.size} / ${q.tous.length}`);
              if (vus.size === q.tous.length) fini();
            });
          }
          if (q.tenir) {
            // « tenir » : un identifiant, ou le début d'identifiants (plusieurs tapis, par exemple)
            on('tenir', (d) => d.id.startsWith(q.tenir) && q.invocation && invocation(q.invocation, d.p));
            on('tenir-stop', (d) => d.id.startsWith(q.tenir) && invocation(null));
            on('tenu', (d) => { if (!d.id.startsWith(q.tenir)) return; if (q.invocation) invocation(q.invocation, 1); ui.succes(null); fini(); });
          }
          if (q.ramasser) {
            const { groupe, n } = q.ramasser; let k = 0; compteur(`${q.ramasser.nom || 'Ramassés'} : 0 / ${n}`);
            on('agir', (d) => {
              if (!d.id.startsWith(groupe)) return;
              W.montrer(d.id, false); k++; compteur(`${q.ramasser.nom || 'Ramassés'} : ${k} / ${n}`); ui.son.page();
              const def = run.def().objets?.find((o) => o.id === d.id);
              if (def && def.faux) ech(def.faux);
              else if (k >= n) fini();
            });
          }
          if (q.lancer) {
            const L = q.lancer; let k = 0; compteur(`${L.nom || 'Touchés'} : 0 / ${L.touches}`);
            W.lancer({ cibles: L.cibles, nombre: L.nombre || 99, vitesse: L.vitesse });
            on('lance', () => { if (L.dire) flottant(L.dire, L.ar); ui.son.page(); });
            on('impact', () => { k++; compteur(`${L.nom || 'Touchés'} : ${k} / ${L.touches}`); if (k >= L.touches) fini(); });
          }
          if (q.attendre) { const t = setTimeout(fini, reduit ? 10 : q.attendre * 1000); abos.push(() => clearTimeout(t)); }
          for (const f of e.echecs || []) {
            if (f.zone) { on('zone', (d) => d.id === f.zone && ech(f)); if (W.dans(f.zone)) ech(f); }
            if (f.repere) on('repere', (d) => d.id.startsWith(f.repere) && ech(f));
            if (f.chute) on('chute', (d) => (f.chute === true || d.id === f.chute) && ech(f));
            if (f.recif) on('recif', (d) => (f.recif === true || d.id === f.recif) && ech(f));
            if (f.echoue) on('echoue', () => ech(f));
            if (f.tenu) on('tenu', (d) => d.id.startsWith(f.tenu) && ech(f));
            if (f.chrono) {
              const t0 = performance.now(), it = setInterval(() => {
                const r = Math.max(0, f.chrono - (performance.now() - t0) / 1000);
                if (!q.ramasser && !q.lancer) compteur(`${Math.floor(r / 60)}:${String(Math.ceil(r % 60) % 60).padStart(2, '0')}`);
                if (r <= 0) ech(f);
              }, 250);
              abos.push(() => clearInterval(it));
            }
          }
          // Interactions libres pendant l'objectif : paroles des passants, objets du décor.
          on('agir', (d) => {
            if ([q.parler, q.utiliser, q.prendre].includes(d.id) || (q.tous && q.tous.includes(d.id)) || (q.ramasser && d.id.startsWith(q.ramasser.groupe))) return;
            const dl = M.dialogues && M.dialogues[d.id.split('#')[0]];
            if (dl) parlerLibre(d.id, dl);
          });
        });
      } finally {
        abos.forEach((f) => f());
        if (run === r) {
          r.resoudre = r.rater = null; r.objectif = null;
          W.cibler(null); W.lancer(null); compteur(null); $('#joGuider').hidden = true;
          if (q.tenir) setTimeout(() => { if (run === r && !r.objectif) invocation(null); }, reduit ? 0 : 1800);
        }
      }
      W.bloquer(true); commandes(false);
      $('#jObjectif').hidden = true;
      if (e.reussite) { ui.succes(null); flottant(e.reussite); }
      if (e.epreuve) reussir(null);
    },
    async faire(e, ok) {
      if (!e.garder) ui.masquerDialogue();
      W.bloquer(true);
      for (const a of e.actions) await action(a, ok);
    },
  };

  // Paroles d'un passant pendant un objectif : le joueur s'arrête, écoute, puis reprend.
  let parleEnCours = false;
  async function parlerLibre(id, lignes, tout = false) {
    if (parleEnCours || !run.objectif) return;
    parleEnCours = true; const r = run;
    W.bloquer(true); W.faireFace(id); const t = W.tete(id); if (t) await W.regarder(t, 0.5);
    W.geste(id);
    if (tout) { for (const texte of lignes) { await ui.dire(texte, tagPnj(id.split('#')[0])); if (run !== r) return; } }
    else {
      const k = (r.dits[id] = ((r.dits[id] ?? -1) + 1) % lignes.length);
      await ui.dire(lignes[k], tagPnj(id.split('#')[0]));
    }
    if (run !== r) return;
    W.faireFace(id, false); ui.masquerDialogue(); parleEnCours = false;
    if (run.objectif) W.bloquer(false);
  }

  // Une épreuve réussie du premier coup donne une lumière.
  function reussir(el) {
    const cle = run.point ? run.point.i : -1;
    if (run.epreuves.has(cle) || run.ratees.has(cle)) return;
    run.epreuves.add(cle); ui.gagnerLumiere(el);
  }

  async function executer(liste, ok) {
    for (const e of liste) await ETAPES[e.type](e, ok);
  }

  // Un échec : sa suite se joue (le joueur continue un peu), puis la conséquence et le retour.
  async function echouer(o, ok) {
    try { if (o.suite) await executer(o.suite, ok); }
    catch (x) { if (x instanceof Echec) return echouer(x.o, ok); throw x; }
    W.bloquer(true); $('#jObjectif').hidden = true; commandes(false); invocation(null);
    await ui.consequence(o, ok, () => reprendre()); ok();
  }
  function reprendre() {
    const p = run.point;
    if (!p.snap) return; // point de reprise sur un changement de scène : la scène sera rechargée
    if (p.scene !== run.scene) { W.charger(M.scenes[p.scene]); run.scene = p.scene; }
    W.ambiance(p.ambiance); run.ambiance = p.ambiance;
    W.restaurer(p.snap); run.sac = new Set(p.sac);
    ui.masquerDialogue();
  }
  const estPoint = (e) => e.point || e.type === 'choix' || e.type === 'scene' || (e.type === 'objectif' && ((e.echecs || []).length > 0 || e.epreuve));

  // ---------- partie ----------
  async function jouer(id, ok) {
    M = await charger(id); ok();
    const W0 = monde();
    run = { sac: new Set(), dits: {}, nettoyer: [], epreuves: new Set(), ratees: new Set(), erreurs: 0, point: null, scene: null, objectif: null, lieu: '', date: '', def: () => M.scenes[run.scene] };
    // remise à zéro des choix déjà tentés (nouvelle partie)
    const raz = (l) => (l || []).forEach((e) => { delete e._ordre; delete e._tentes; (e.options || []).forEach((o) => raz(o.suite)); (e.echecs || []).forEach((f) => raz(f.suite)); });
    raz(M.sequence);
    ui.entrerMonde(true);
    W0.demarrer(); W0.bloquer(true);
    try {
      const premiere = M.sequence.find((e) => e.type === 'scene');
      await scene(premiere, ok);
      await role(M.role); ok();
      let i = M.sequence.indexOf(premiere) + 1;
      run.point = { i, snap: W.instantane(), sac: [], scene: run.scene, ambiance: run.ambiance };
      while (i < M.sequence.length) {
        const e = M.sequence[i];
        // point de reprise : on y revient après un échec (l'instantané n'est pris qu'au premier passage)
        if (estPoint(e) && run.point.i !== i) run.point = { i, snap: e.type === 'scene' ? null : W.instantane(), sac: [...run.sac], scene: run.scene, ambiance: run.ambiance };
        try {
          await ETAPES[e.type](e, ok); ok();
          i++;
        } catch (x) {
          if (!(x instanceof Echec)) throw x;
          run.ratees.add(run.point.i); run.erreurs++; ui.erreur();
          await echouer(x.o, ok); ok();
          i = run.point.i;
        }
      }
      await W.fondu(true, M.fin || ''); ok();
      await ui.pause(reduit ? 0 : 900); ok();
    } finally {
      arreter();
    }
    return { erreurs: run.erreurs, lumieres: run.epreuves.size };
  }
  function arreter() {
    if (run) {
      run.nettoyer.forEach((f) => f()); run.nettoyer = [];
      if (run.rater) { const f = run.rater; run.rater = null; f(ui.ANNULE); } // l'objectif en cours se termine
    }
    $('#jObjectif').hidden = $('#jRole').hidden = true; commandes(false); invocation(null); parleEnCours = false;
    if (W) { W.fondu(false); W.arreter(); }
    ui.entrerMonde(false);
  }

  // Bouton « Me guider » : on rejoint l'objectif (sans lumière pour cette épreuve).
  $('#joGuider').onclick = async () => {
    if (!run || !run.objectif) return;
    const e = run.objectif, q = e.quand || {}, p = point(e.cible);
    if (!p) return;
    run.ratees.add(run.point ? run.point.i : -1);
    await W.fondu(true, '');
    const pos = W.position(), d = Math.hypot(p[0] - pos.x, p[1] - pos.z) || 1, r = q.zone ? 0 : 2.2;
    W.teleporter(p[0] - (p[0] - pos.x) / d * r, p[1] - (p[1] - pos.z) / d * r);
    W.regarder([p[0], 1.5, p[1]], 0.01);
    W.fondu(false);
  };

  return {
    jouer, arreter, precharger: charger,
    pause(on) { if (W && run && !W.racine.hidden) W.pause(on); },
    actif: () => !!(run && W && !W.racine.hidden),
    // essais automatisés : état de l'étape, résolution ou échec forcés
    test: {
      etat: () => run && { scene: run.scene, objectif: run.objectif, point: run.point && run.point.i, erreurs: run.erreurs, lumieres: run.epreuves.size, role: !$('#jRole').hidden },
      etape: () => run && run.objectif,
      choix: () => run && run.choix && { juste: run.choix._ordre.findIndex((k) => run.choix.options[k].juste), n: run.choix.options.length },
      resoudre() {
        const e = run && run.objectif; if (!e) return false;
        const q = e.quand || {};
        if (q.parler || q.utiliser || q.prendre) W._test.agirSur(q.parler || q.utiliser || q.prendre);
        else if (q.tenir) { const it = W._test.interactifs().find((x) => x.id.startsWith(q.tenir)); if (it) W._test.agirSur(it.id); }
        else if (q.zone) { const p = point('zone:' + q.zone); W.teleporter(p[0], p[1]); }
        else if (q.tous) { run.resoudre(); }
        else if (q.ramasser) W._test.interactifs().filter((it) => it.id.startsWith(q.ramasser.groupe) && !(run.def().objets.find((o) => o.id === it.id) || {}).faux).slice(0, q.ramasser.n).forEach((it) => W._test.emettre('agir', { id: it.id, type: 'objet' }));
        else if (q.lancer) for (let k = 0; k < q.lancer.touches; k++) W._test.emettre('impact', { id: q.lancer.cibles[0].id });
        else if (run.resoudre) run.resoudre();
        return true;
      },
      echouer() {
        const e = run && run.objectif; if (!e || !(e.echecs || []).length) return false;
        run.rater(new Echec(e.echecs[0])); return true;
      },
    },
  };
}
