// Missions : interprète des fichiers data/missions/<id>.json, jouées sur la carte 3D elle-même, sans
// vue subjective ni déplacement d'un personnage. La caméra cadre chaque scène ; le joueur agit en
// cliquant sur les repères (personnes, lieux, objets), en choisissant ses réponses, en portant et en
// remettant des objets, en maintenant une invocation. Une mission est une suite d'étapes (scène, récit,
// parole, choix, objectif, faire). Un mauvais choix ne se révèle pas tout de suite : sa « suite » se joue
// d'abord, puis viennent la conséquence imaginaire et le retour au dernier point de reprise.
// Aucune silhouette humaine : les personnes sont des étiquettes ; le Prophète ﷺ, les prophètes, les
// Compagnons et sa famille restent hors champ (une lumière tout au plus), sans aucune parole inventée.

const $ = (s) => document.querySelector(s);
const melanger = (t) => { t = [...t]; for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } return t; };
class Echec { constructor(o) { this.o = o; } }

export function creerMissions({ carte, D, ui }) {
  const { reduit, mobile } = ui, S = carte.mission;
  const cache = new Map();
  let M = null, run = null;

  const charger = (id) => {
    if (!cache.has(id)) cache.set(id, fetch(`data/missions/${id}.json`).then((r) => { if (!r.ok) throw new Error(`Mission introuvable : ${id}`); return r.json(); }));
    return cache.get(id);
  };

  // ---------- coordonnées ----------
  // Un point se donne par un lieu de la carte (« lieu »), un point [lat, lon] (« point »), ou un décalage
  // en mètres (« x » vers l'est, « z » vers le sud) depuis l'origine de la scène.
  const KM_LAT = 110.57;
  function origine(sc) {
    const o = sc && sc.origine;
    if (!o) return null;
    if (typeof o === 'string') { const l = D.LIEUX[o] || D.ETAPES[o]; return [l.lat, l.lon]; }
    return o;
  }
  function latlon(p, sc = def()) {
    if (!p) return null;
    if (Array.isArray(p)) return p;
    if (typeof p === 'string') { const l = D.LIEUX[p] || D.ETAPES[p]; return l ? [l.lat, l.lon] : S.ouRepere(p); }
    if (p.lieu) return latlon(p.lieu, sc);
    if (p.point) return p.point;
    if (p.x != null) { const [la, lo] = origine(sc); return [la - p.z / 1000 / KM_LAT, lo + p.x / 1000 / (111.32 * Math.cos(la * Math.PI / 180))]; }
    if (p.repere) return S.ouRepere(p.repere);
    return null;
  }
  const def = () => (run && run.scene ? M.scenes[run.scene] : null);

  // ---------- interface ----------
  function hudObjectif(texte) {
    $('#joMission').textContent = M.titre;
    $('#joTexte').textContent = texte;
    compteur(null);
    $('#jObjectif').hidden = !texte;
    $('#jObjectif').classList.remove('neuf'); void $('#jObjectif').offsetWidth; $('#jObjectif').classList.add('neuf');
  }
  const compteur = (t) => { $('#joCompteur').hidden = t == null; $('#joCompteur').textContent = t ?? ''; };
  function sac() {
    const el = $('#joSac'), objets = [...run.sac].filter((k) => M.objets && M.objets[k]);
    el.hidden = !objets.length;
    el.innerHTML = objets.map((k) => `<span class="j-objet">${M.objets[k].nom}</span>`).join('');
  }
  function flottant(texte, ar) {
    if (reduit) return;
    const s = document.createElement('span'); s.textContent = texte; if (ar) s.lang = 'ar';
    $('#jFlottants').appendChild(s); setTimeout(() => s.remove(), 1600);
  }
  function role(R) {
    $('#jrNom').textContent = R.nom; $('#jrAr').textContent = R.nom_ar || ''; $('#jrTexte').textContent = R.texte || '';
    $('#jrRegle').textContent = R.regle || ''; $('#jrRegle').hidden = !R.regle;
    $('#jRole').hidden = false;
    return new Promise((ok) => {
      const fin = () => { removeEventListener('keydown', clavier); $('#jRole').hidden = true; ok(); };
      const clavier = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fin(); } };
      $('#jrGo').onclick = fin; addEventListener('keydown', clavier);
      run.nettoyer.push(() => removeEventListener('keydown', clavier));
    });
  }
  // Carte d'invocation : le texte s'illumine pendant que le joueur maintient le bouton (ou Espace).
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
  const perso = (id) => (M.personnages && M.personnages[id]) || {};
  const tagPnj = (id) => ({ lieu: perso(id).nom || id, date: perso(id).qualite || '' });
  const tagRecit = (e) => ({ lieu: e.qui || run.lieu || M.titre, date: e.sous || run.date || '' });

  // ---------- caméra ----------
  function vue(v, duree) {
    if (!v) return;
    // « auto » : la caméra cadre les repères visibles (et les points « avec »), sous le cap et l'inclinaison donnés
    if (v.auto) { carte.cadrerLatLon([...S.visibles(), ...(v.avec || []).map((p) => latlon(p))], v.cap, v.incl, reduit ? 0 : (duree ?? v.duree ?? 2200), v.rMin ?? 0.35); return; }
    const p = latlon(v.repere ? { repere: v.repere } : v.lieu || v.point ? v : v.x != null ? v : def() && def().vue);
    if (!p) return;
    carte.viser(p, v.r, v.cap, v.incl, reduit ? 0 : (duree ?? v.duree ?? 2200));
  }
  // Regard vers une personne pendant qu'elle parle : la caméra se recentre doucement sur son repère.
  function regarder(id) {
    if (!id || !S.ouRepere(id)) return;
    carte.viser(S.ouRepere(id), null, null, null, reduit ? 0 : 1100);
  }

  // ---------- scènes ----------
  // Met en place les repères et les accessoires d'une scène (sans mouvement de caméra).
  function monter(id) {
    const sc = M.scenes[id];
    if (!sc) throw new Error(`Scène inconnue : ${id}`);
    run.scene = id;
    if (sc.epoque) carte.epoque(D.INDEX[sc.epoque]);
    carte.etiquettes(sc.etiquettes || 'aucune'); carte.surligner(null); carte.trajetLibre(null);
    S.reperes((sc.reperes || []).map((r) => {
      const [lat, lon] = latlon(r, sc), P = perso(r.id);
      return { id: r.id, lat, lon, genre: r.genre || 'personne', nom: r.nom ?? P.nom ?? r.id, qualite: r.qualite ?? P.qualite ?? '', visible: r.visible !== false, h: r.h };
    }));
    S.accessoires((sc.accessoires || []).map((a) => { const [lat, lon] = latlon(a, sc); return { ...a, lat, lon }; }));
    return sc;
  }
  async function scene(e, ok) {
    const sc = monter(e.scene);
    run.lieu = e.titre || sc.titre || run.lieu; run.date = e.sous || sc.sous || run.date;
    run.ambiance = e.ambiance || sc.ambiance || 'jour';
    carte.ambiance(run.ambiance);
    vue(sc.vue, e.duree ?? 2600);
    await ui.pause(reduit ? 0 : 1200); ok();
  }

  // ---------- actions ----------
  async function action(a, ok) {
    if (a.lieu) run.lieu = a.lieu;
    if (a.sous) run.date = a.sous; // le bandeau du dialogue suit le temps qui passe
    if (a.montrer) [].concat(a.montrer).forEach((id) => { S.repere(id, { visible: true }); S.accessoire(id, true); });
    if (a.cacher) [].concat(a.cacher).forEach((id) => { S.repere(id, { visible: false }); S.accessoire(id, false); });
    if (a.renommer) S.repere(a.renommer, { nom: a.nom, qualite: a.qualite || '' });
    if (a.ambiance) { carte.ambiance(a.ambiance); run.ambiance = a.ambiance; }
    if (a.drapeau) run.sac.add(a.drapeau);
    if (a.porter) { run.sac.add(a.porter); sac(); }
    if (a.deposer) { run.sac.delete(a.deposer); sac(); }
    if (a.flottant) flottant(a.flottant, a.ar);
    if (a.son) ui.son[a.son] && ui.son[a.son]();
    if ('convoi' in a) carte.trajetLibre(a.convoi ? { type: a.convoi.type || 'caravane', etapes: a.convoi.etapes.map((p) => (typeof p === 'string' && (D.LIEUX[p] || D.ETAPES[p]) ? p : latlon(p))) } : null, a.convoi && a.convoi.couleur);
    if (a.vue) vue(a.vue, a.duree);
    if (a.regarder) regarder(a.regarder);
    if (a.aller) { // un repère se déplace (une personne, une caravane…)
      const fin = S.deplacer(a.aller, a.vers.map((p) => latlon(p)), a.duree ?? 4);
      if (a.attendre !== false) { await fin; ok(); }
    }
    if (a.effet) {
      const o = { ...a }; if (a.ou) [o.lat, o.lon] = latlon(a.ou);
      const fin = S.effet(a.effet, o);
      if (a.attendre !== false) { await fin; ok(); }
    }
    if (a.eclat) { const [la, lo] = latlon(a.eclat); carte.eclat(la, lo); }
    if (a.pause) { await ui.pause(reduit ? 0 : a.pause); ok(); }
  }

  // ---------- étapes ----------
  const ETAPES = {
    scene,
    async recit(e, ok) {
      if (e.vue) vue(e.vue);
      await ui.dire(e.texte, tagRecit(e)); ok();
    },
    async parole(e, ok) {
      if (e.regarder !== false) regarder(e.qui);
      S.repere(e.qui, { cible: true });
      try { await ui.dire(e.texte, tagPnj(e.qui)); ok(); } finally { S.repere(e.qui, { cible: false }); }
    },
    // Dialogue à choix : l'option fausse n'est pas signalée, sa suite se joue d'abord.
    async choix(e, ok) {
      if (e.qui) { regarder(e.qui); S.repere(e.qui, { cible: true }); }
      const ordre = e._ordre || (e._ordre = melanger(e.options.map((_, k) => k)));
      const tentes = e._tentes || (e._tentes = new Set());
      run.choix = e;
      const i = await ui.proposer(e.question, ordre.map((k) => e.options[k]), tentes, e.qui ? tagPnj(e.qui) : tagRecit(e), tentes.size > 0); ok();
      run.choix = null;
      if (e.qui) S.repere(e.qui, { cible: false });
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
    // Objectif : le joueur agit sur la carte (cliquer un repère, en écouter plusieurs, ramasser, remettre
    // un objet, maintenir une invocation) jusqu'à remplir la condition « quand » ; les « echecs » guettent.
    async objectif(e, ok) {
      ui.masquerDialogue();
      const q = e.quand || {};
      hudObjectif(e.texte);
      if (e.vue) vue(e.vue);
      const actifs = new Set([q.parler, q.aller, q.prendre, q.utiliser, ...(q.tous || []), ...(q.donner ? [q.donner.a] : []), ...(e.echecs || []).map((f) => f.repere)].filter(Boolean));
      if (q.ramasser) S.liste().filter((id) => id.startsWith(q.ramasser.groupe)).forEach((id) => actifs.add(id));
      if (q.lancer) actifs.add(q.lancer.repere);
      if (M.dialogues) Object.keys(M.dialogues).forEach((id) => actifs.add(id)); // les passants répondent toujours
      actifs.forEach((id) => S.repere(id, { actif: true }));
      $('#joGuider').hidden = e.guider === false || !(q.parler || q.aller || q.prendre || q.utiliser || q.donner || q.tous || q.lancer);
      run.objectif = e;
      const r = run, abos = [];
      try {
        await new Promise((fini, rate) => {
          r.resoudre = fini; r.rater = rate;
          const ech = (f) => rate(new Echec(f));
          // un clic sur un repère
          r.clic = async (id) => {
            if (r.occupe) return;
            const f = (e.echecs || []).find((x) => x.repere === id);
            if (f) { ech(f); return; }
            if (id === q.parler || id === q.aller || id === q.utiliser) { fini(); return; }
            if (id === q.prendre) { S.repere(id, { visible: false }); if (q.porter) { run.sac.add(q.porter); sac(); } ui.son.page(); fini(); return; }
            if (q.donner && id === q.donner.a) {
              if (run.sac.has(q.donner.objet)) { run.sac.delete(q.donner.objet); sac(); fini(); }
              else await parlerLibre(id, [q.donner.sans || 'Il vous manque encore quelque chose.']);
              return;
            }
            if (q.tous && q.tous.includes(id)) {
              await parlerLibre(id, M.dialogues[id] || ['…'], true);
              if (run !== r) return;
              r.vus.add(id); S.repere(id, { vu: true });
              compteur(`${q.nom || 'Écoutés'} : ${r.vus.size} / ${q.tous.length}`);
              if (r.vus.size === q.tous.length) fini();
              return;
            }
            if (q.lancer && id === q.lancer.repere) { // cliquer plusieurs fois (lancer des cailloux, frapper…)
              r.k++; ui.son.page(); if (q.lancer.dire) flottant(q.lancer.dire, q.lancer.ar);
              compteur(`${q.lancer.nom || 'Fait'} : ${r.k} / ${q.lancer.n}`);
              if (r.k >= q.lancer.n) fini();
              return;
            }
            if (q.ramasser && id.startsWith(q.ramasser.groupe)) {
              const o = (M.objets_scene || {})[id] || {};
              S.repere(id, { visible: false }); ui.son.page();
              if (o.faux) { ech(o.faux); return; }
              r.k++; compteur(`${q.ramasser.nom || 'Ramassés'} : ${r.k} / ${q.ramasser.n}`);
              if (r.k >= q.ramasser.n) fini();
              return;
            }
            const dl = M.dialogues && M.dialogues[id];
            if (dl) await parlerLibre(id, dl);
          };
          r.vus = new Set(); r.k = 0;
          if (q.tous) compteur(`${q.nom || 'Écoutés'} : 0 / ${q.tous.length}`);
          if (q.ramasser) compteur(`${q.ramasser.nom || 'Ramassés'} : 0 / ${q.ramasser.n}`);
          if (q.lancer) compteur(`${q.lancer.nom || 'Fait'} : 0 / ${q.lancer.n}`);
          if (q.tenir) { // maintenir le bouton (ou la barre d'espace) jusqu'au bout
            const b = $('#joTenir'); b.hidden = false; b.querySelector('span').textContent = q.tenir.bouton || 'Maintenir pour invoquer';
            let p = 0, appui = false, t0 = 0, raf = 0;
            const duree = (q.tenir.duree || 4) * (reduit ? 0.2 : 1);
            const pas = (now) => {
              const dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
              p = Math.max(0, Math.min(1, p + (appui ? dt / duree : -dt / 1.5)));
              b.style.setProperty('--p', p); if (q.tenir.invocation) invocation(q.tenir.invocation, p > 0 || appui ? p : null);
              if (p >= 1) { b.hidden = true; ui.succes(b); fini(); return; }
              raf = requestAnimationFrame(pas);
            };
            const debut = (ev) => { ev && ev.preventDefault(); if (!appui) { appui = true; } };
            const fin = () => { appui = false; };
            const clavier = (ev) => { if ((ev.key === ' ' || ev.key === 'e' || ev.key === 'E') && !ev.repeat && !ev.target.closest('input')) { ev.preventDefault(); debut(); } };
            const relache = (ev) => { if (ev.key === ' ' || ev.key === 'e' || ev.key === 'E') fin(); };
            b.addEventListener('pointerdown', debut); b.addEventListener('pointerup', fin); b.addEventListener('pointerleave', fin); b.addEventListener('pointercancel', fin);
            addEventListener('keydown', clavier); addEventListener('keyup', relache);
            t0 = performance.now(); raf = requestAnimationFrame(pas);
            r.tenir = () => { appui = true; p = 1; };
            abos.push(() => {
              cancelAnimationFrame(raf); b.hidden = true;
              b.removeEventListener('pointerdown', debut); b.removeEventListener('pointerup', fin); b.removeEventListener('pointerleave', fin); b.removeEventListener('pointercancel', fin);
              removeEventListener('keydown', clavier); removeEventListener('keyup', relache);
            });
          }
          if (q.attendre) { const t = setTimeout(fini, reduit ? 10 : q.attendre * 1000); abos.push(() => clearTimeout(t)); }
          for (const f of e.echecs || []) {
            if (f.chrono) {
              const t0 = performance.now(), it = setInterval(() => {
                if (r.occupe) return;
                const reste = Math.max(0, f.chrono - (performance.now() - t0) / 1000);
                if (!q.ramasser && !q.tous) compteur(`${Math.floor(reste / 60)}:${String(Math.ceil(reste % 60) % 60).padStart(2, '0')}`);
                if (reste <= 0) ech(f);
              }, 250);
              abos.push(() => clearInterval(it));
            }
          }
        });
      } finally {
        abos.forEach((f) => f());
        actifs.forEach((id) => S.repere(id, { actif: false, cible: false }));
        if (run === r) {
          r.resoudre = r.rater = r.clic = r.tenir = null; r.objectif = null;
          compteur(null); $('#joGuider').hidden = true;
          if (q.tenir) setTimeout(() => { if (run === r && !r.objectif) invocation(null); }, reduit ? 0 : 1800);
        }
      }
      $('#jObjectif').hidden = true;
      if (e.reussite) { ui.succes(null); flottant(e.reussite); }
      if (e.epreuve) reussir(null);
    },
    async faire(e, ok) {
      if (!e.garder) ui.masquerDialogue();
      for (const a of e.actions) await action(a, ok);
    },
  };

  // Paroles d'une personne cliquée pendant un objectif.
  async function parlerLibre(id, lignes, tout = false) {
    const r = run; if (r.occupe) return;
    r.occupe = true; S.repere(id, { cible: true });
    try {
      if (tout) { for (const texte of lignes) { await ui.dire(texte, tagPnj(id)); if (run !== r) return; } }
      else {
        const k = (r.dits[id] = ((r.dits[id] ?? -1) + 1) % lignes.length);
        await ui.dire(lignes[k], tagPnj(id));
      }
      if (run === r) ui.masquerDialogue();
    } finally { r.occupe = false; S.repere(id, { cible: false }); }
  }
  carte.mission.surRepere((id) => { if (run && run.clic) run.clic(id); });

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
    $('#jObjectif').hidden = true; invocation(null);
    await ui.consequence(o, ok, () => reprendre()); ok();
  }
  // Retour au dernier point de reprise : scène, repères, accessoires, objets portés, caméra.
  function reprendre() {
    const p = run.point;
    if (p.scene !== run.scene) monter(p.scene); // la suite d'un mauvais choix a pu changer de scène
    carte.ambiance(p.ambiance); run.ambiance = p.ambiance;
    if (p.snap) S.restaurer(p.snap);
    carte.trajetLibre(null);
    run.sac = new Set(p.sac); sac(); run.lieu = p.lieu ?? run.lieu; run.date = p.date ?? run.date;
    if (p.vue) carte.revenir(p.vue, reduit ? 0 : 1200);
    ui.masquerDialogue();
  }
  const estPoint = (e) => e.point || e.type === 'choix' || e.type === 'scene' || (e.type === 'objectif' && ((e.echecs || []).length > 0 || e.epreuve));

  // ---------- partie ----------
  async function jouer(id, ok) {
    M = await charger(id); ok();
    run = { sac: new Set(), dits: {}, nettoyer: [], epreuves: new Set(), ratees: new Set(), erreurs: 0, point: null, scene: null, objectif: null, lieu: '', date: '' };
    // remise à zéro des choix déjà tentés (nouvelle partie)
    const raz = (l) => (l || []).forEach((e) => { delete e._ordre; delete e._tentes; (e.options || []).forEach((o) => raz(o.suite)); (e.echecs || []).forEach((f) => raz(f.suite)); });
    raz(M.sequence);
    ui.entrerMission(true); sac();
    try {
      const premiere = M.sequence.find((e) => e.type === 'scene');
      await scene(premiere, ok);
      await role(M.role); ok();
      let i = M.sequence.indexOf(premiere) + 1;
      const point = (k) => ({ i: k, snap: S.instantane(), sac: [...run.sac], scene: run.scene, ambiance: run.ambiance, lieu: run.lieu, date: run.date, vue: carte.vue() });
      run.point = point(i);
      while (i < M.sequence.length) {
        const e = M.sequence[i];
        // point de reprise : on y revient après un échec (l'instantané n'est pris qu'au premier passage ;
        // pour une scène, on la rejoue : elle remet ses repères et ses accessoires en place)
        if (estPoint(e) && run.point.i !== i) run.point = point(i);
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
      if (M.fin) flottant(M.fin);
      await ui.pause(reduit ? 0 : 900); ok();
    } finally {
      arreter(); run.fini = true;
    }
    return { erreurs: run.erreurs, lumieres: run.epreuves.size };
  }
  function arreter() {
    if (run) {
      run.nettoyer.forEach((f) => f()); run.nettoyer = [];
      if (run.rater) { const f = run.rater; run.rater = null; f(ui.ANNULE); } // l'objectif en cours se termine
    }
    $('#jObjectif').hidden = $('#jRole').hidden = $('#joTenir').hidden = true; $('#joSac').hidden = true; invocation(null);
    S.vider(); ui.entrerMission(false);
  }

  // Bouton « Me guider » : la caméra montre le repère à atteindre (sans lumière pour cette épreuve).
  $('#joGuider').onclick = () => {
    if (!run || !run.objectif) return;
    const q = run.objectif.quand || {};
    const id = q.parler || q.aller || q.prendre || q.utiliser || (q.donner && q.donner.a) || (q.lancer && q.lancer.repere) || (q.tous || []).find((x) => !run.vus.has(x));
    if (!id || !S.ouRepere(id)) return;
    run.ratees.add(run.point ? run.point.i : -1);
    carte.viser(S.ouRepere(id), null, null, null, reduit ? 0 : 1200);
    S.repere(id, { cible: true });
  };

  return {
    jouer, arreter, precharger: charger,
    actif: () => !!run && !$('#jRole').hidden,
    // essais automatisés : état de l'étape, résolution ou échec forcés
    test: {
      etat: () => run && { scene: run.scene, objectif: run.objectif, point: run.point && run.point.i, erreurs: run.erreurs, lumieres: run.epreuves.size, role: !$('#jRole').hidden, fini: !!run.fini },
      etape: () => run && run.objectif,
      choix: () => run && run.choix && { juste: run.choix._ordre.findIndex((k) => run.choix.options[k].juste), n: run.choix.options.length },
      async resoudre() {
        const e = run && run.objectif; if (!e || !run.clic) return false;
        const q = e.quand || {}, r = run;
        if (q.tenir) { r.tenir(); return true; }
        if (q.donner && !r.sac.has(q.donner.objet)) { r.sac.add(q.donner.objet); }
        const id = q.parler || q.aller || q.prendre || q.utiliser || (q.donner && q.donner.a);
        if (id) { await r.clic(id); return true; }
        if (q.tous) { r.resoudre(); return true; }
        if (q.lancer) { for (let k = 0; k < q.lancer.n && r.objectif; k++) await r.clic(q.lancer.repere); return true; }
        if (q.ramasser) { const bons = S.liste().filter((x) => x.startsWith(q.ramasser.groupe) && !((M.objets_scene || {})[x] || {}).faux); for (const x of bons.slice(0, q.ramasser.n)) await r.clic(x); return true; }
        if (r.resoudre) r.resoudre();
        return true;
      },
      echouer() {
        const e = run && run.objectif; if (!e || !(e.echecs || []).length) return false;
        run.rater(new Echec(e.echecs[0])); return true;
      },
    },
  };
}
