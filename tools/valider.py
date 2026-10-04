#!/usr/bin/env python3
"""Vérifie les fiches de data/ avant publication (bibliothèque standard uniquement).

Erreurs (bloquantes) : champ manquant, lieu ou ouvrage inconnu, statut invalide,
« Prophète » sans ﷺ, fiche « validé » sans numéro de page, position hors de la carte…
Avertissements : pages à compléter, fiches encore à vérifier.

Usage : python3 tools/valider.py
"""
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
STATUTS = {"à vérifier", "validé"}
CERTITUDES = {"certaine", "probable", "discutée"}
# « Prophète » ou « Messager d'Allah » doivent être suivis de ﷺ (pas « prophétie », « prophètes »).
SANS_SALAT = re.compile(r"(Prophète|Messager d'Allah|Rasûl)(?!s)(?! ?ﷺ)")

erreurs, avertissements = [], []


def err(ou, msg):
    erreurs.append(f"{ou} : {msg}")


def avert(ou, msg):
    avertissements.append(f"{ou} : {msg}")


def lire(nom):
    try:
        return json.loads((DATA / nom).read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"ERREUR {nom} : JSON invalide ligne {e.lineno}, colonne {e.colno} ({e.msg})")
        sys.exit(1)


def textes(obj):
    """Toutes les chaînes d'une fiche (pour la vérification de ﷺ)."""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from textes(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from textes(v)


def verifier_salat(ou, fiche):
    for t in textes(fiche):
        for m in SANS_SALAT.finditer(t):
            err(ou, f"« {m.group(1)} » sans ﷺ : …{t[max(0, m.start() - 20):m.end() + 20]}…")


CHOIX_MISSIONS = []
# Personnes qui ne sont jamais représentées, même en silhouette (Prophète ﷺ, prophètes, Compagnons, sa famille).
JAMAIS = re.compile(r"Proph|Muhammad|Mu[hḥ]ammad|Ab[uû] Bakr|'Umar|'Uthm[aâ]n|'Al[iî]\b|Kh[aâ]d[iî]ja|'[AÂ]'isha|F[aâ]tima|Bil[aâ]l|Hamza|al-'Abb[aâ]s|Ab[uû] T[aâ]lib|Ab[uû] Lahab|[AÂ]mina|Hal[iî]ma|Zayd|Ja'far|Mus'ab|Sa'd|Ab[uû] Sufy[aâ]n|Kh[aâ]lid|Suhayl|'Ikrima|Jibr[iî]l|Ibr[aâ]h[iî]m|Ism[aâ]'[iî]l")


def verifier_mission(mid, lieux, ouvrages):
    """Vérifie data/missions/<mid>.json ; renvoie le nombre d'épreuves (lumières possibles)."""
    ou = f"mission {mid}"
    chemin = DATA / "missions" / f"{mid}.json"
    if not chemin.exists():
        err(ou, "fichier absent")
        return None
    M = json.loads(chemin.read_text(encoding="utf-8"))
    for champ in ("titre", "role", "scenes", "sequence", "statut", "sources"):
        if champ not in M:
            err(ou, f"champ « {champ} » manquant")
    verifier_sources(ou, M, ouvrages)
    verifier_salat(ou, M)
    scenes = M.get("scenes", {})
    for sid, S in scenes.items():
        for p in S.get("pnj", []) + S.get("foules", []):
            if p.get("nom") and JAMAIS.search(p["nom"]) and p.get("modele") in (None, "silhouette"):
                err(ou, f"scène {sid} : « {p['nom']} » ne doit jamais être représenté")
    ids = {}
    for sid, S in scenes.items():
        e = set()
        for p in S.get("pnj", []) + S.get("foules", []) + S.get("troupeaux", []) + S.get("objets", []) + S.get("lieux", []):
            e.add(p.get("id"))
        for x in S.get("elements", []):
            if x.get("id"):
                e.add(x["id"])
        ids[sid] = e
    epreuves = 0
    def cible_ok(scene, c):
        if c is None or isinstance(c, list):
            return True
        typ, _, i = str(c).partition(":")
        return i in ids.get(scene, set())
    def parcourir(liste, scene, haut):
        nonlocal epreuves
        for k, e in enumerate(liste, 1):
            o = f"{ou}, {'étape' if haut else 'suite'} {k}"
            t = e.get("type")
            if t not in ("scene", "recit", "parole", "choix", "objectif", "faire"):
                err(o, f"type « {t} » inconnu")
                continue
            if t == "scene":
                scene = e.get("scene")
                if scene not in scenes:
                    err(o, f"scène « {scene} » inconnue")
            for champ in ("qui",):
                if t in ("parole", "choix") and e.get(champ) and e[champ] not in ids.get(scene, set()):
                    err(o, f"« {e[champ]} » absent de la scène {scene}")
            if t == "parole" and not e.get("qui"):
                err(o, "parole sans « qui »")
            if t == "objectif":
                if not cible_ok(scene, e.get("cible")):
                    err(o, f"cible « {e.get('cible')} » absente de la scène {scene}")
                q = e.get("quand") or {}
                for cle in ("parler", "utiliser", "prendre", "tenir", "zone"):
                    if cle in q and q[cle] not in ids.get(scene, set()) and not (cle == "tenir" and any(i and i.startswith(q[cle]) for i in ids.get(scene, set()))):
                        err(o, f"quand.{cle} : « {q[cle]} » absent de la scène {scene}")
                if not q:
                    err(o, "objectif sans « quand »")
                for i in q.get("tous", []):
                    if i not in ids.get(scene, set()):
                        err(o, f"quand.tous : « {i} » absent de la scène {scene}")
                    elif i not in M.get("dialogues", {}):
                        err(o, f"quand.tous : « {i} » n'a pas de « dialogues »")
                for f in e.get("echecs", []):
                    if not f.get("consequence"):
                        err(o, "échec sans « consequence »")
                    parcourir(f.get("suite", []), scene, False)
                if haut and (e.get("epreuve")):
                    epreuves += 1
            if t == "choix":
                opts = e.get("options", [])
                if sum(1 for x in opts if x.get("juste")) != 1:
                    err(o, "il faut exactement une option « juste »")
                for x in opts:
                    if not x.get("juste") and not x.get("consequence"):
                        err(o, "option fausse sans « consequence »")
                    parcourir(x.get("suite", []), scene, False)
                CHOIX_MISSIONS.append((o, opts))
                if haut and e.get("epreuve") is not False:
                    epreuves += 1
            if t == "faire":
                for a in e.get("actions", []):
                    for cle in ("montrer", "cacher"):
                        for i in ([a[cle]] if isinstance(a.get(cle), str) else a.get(cle, [])):
                            if i not in ids.get(scene, set()):
                                err(o, f"{cle} : « {i} » absent de la scène {scene}")
                    for cle in ("aller", "suivre", "lacher", "tourner", "geste", "placer", "inviter"):
                        if a.get(cle) and a[cle] not in ids.get(scene, set()):
                            err(o, f"{cle} : « {a[cle]} » absent de la scène {scene}")
        return scene
    seq = M.get("sequence", [])
    if not seq or seq[0].get("type") != "scene":
        err(ou, "la séquence doit commencer par une scène")
    parcourir(seq, None, True)
    return epreuves


def verifier_sources(ou, fiche, ouvrages):
    sources = fiche.get("sources") or []
    if not sources:
        err(ou, "aucune source citée")
    for s in sources:
        if s.get("ouvrage") not in ouvrages:
            err(ou, f"ouvrage inconnu « {s.get('ouvrage')} » (à déclarer dans sources.json)")
        if s.get("page") is None:
            if fiche.get("statut") == "validé":
                err(ou, f"fiche validée mais page manquante pour « {s.get('ouvrage')} »")
            else:
                avert(ou, f"page à compléter ({s.get('ouvrage')})")
    if fiche.get("statut") not in STATUTS:
        err(ou, f"statut « {fiche.get('statut')} » invalide (attendu : {', '.join(sorted(STATUTS))})")


def main():
    lieux_f, ev_f, had_f, src_f = (lire(n) for n in ("lieux.json", "evenements.json", "hadiths.json", "sources.json"))
    relief = lire("relief/hijaz.json")["emprise"]
    ouvrages = src_f["ouvrages"]
    dans_carte = lambda lat, lon: relief["sud"] <= lat <= relief["nord"] and relief["ouest"] <= lon <= relief["est"]

    lieux = {}
    for l in lieux_f["lieux"]:
        ou = f"lieu {l.get('id', '?')}"
        for champ in ("id", "nom", "nom_ar", "lat", "lon", "niveau", "certitude", "statut"):
            if champ not in l:
                err(ou, f"champ « {champ} » manquant")
        if l.get("id") in lieux:
            err(ou, "identifiant en double")
        lieux[l.get("id")] = l
        if l.get("certitude") not in CERTITUDES:
            err(ou, f"certitude « {l.get('certitude')} » invalide (attendu : {', '.join(sorted(CERTITUDES))})")
        if l.get("niveau") not in (1, 2, 3, 4):
            err(ou, "niveau attendu : 1, 2, 3 ou 4")
        if "hors_carte" in l:
            if not dans_carte(*l["hors_carte"]["ancre"]):
                err(ou, "l'ancre d'un lieu hors carte doit être dans le cadre de la carte")
        elif not dans_carte(l.get("lat", 0), l.get("lon", 0)):
            err(ou, "position hors du cadre de la carte (ajouter « hors_carte » avec une ancre)")
        verifier_sources(ou, l, ouvrages)
        verifier_salat(ou, l)
    etapes = {k: v for k, v in lieux_f.get("etapes", {}).items() if not k.startswith("_")}
    for k, e in etapes.items():
        if not dans_carte(e["lat"], e["lon"]):
            err(f"étape {k}", "position hors du cadre de la carte")

    hadiths = {h["id"]: h for h in had_f["hadiths"]}
    evenements = ev_f["evenements"]
    ids = [e.get("id") for e in evenements]
    for e in evenements:
        ou = f"événement {e.get('id', '?')}"
        for champ in ("id", "categorie", "titre", "titre_ar", "lieu", "date", "annee_ap_jc", "age", "periode", "faits", "resume", "statut"):
            if champ not in e:
                err(ou, f"champ « {champ} » manquant")
        if ids.count(e.get("id")) > 1:
            err(ou, "identifiant en double")
        if e.get("categorie") not in ev_f["categories"]:
            err(ou, f"catégorie « {e.get('categorie')} » inconnue")
        if e.get("lieu") not in lieux:
            err(ou, f"lieu « {e.get('lieu')} » inconnu")
        if e.get("periode") not in ("avant", "mecquoise", "medinoise"):
            err(ou, "période attendue : avant, mecquoise ou medinoise")
        for h in e.get("hadiths", []):
            if h not in hadiths:
                err(ou, f"hadith « {h} » inconnu")
        if "trajet" in e:
            if e["trajet"].get("type") not in ("caravane", "armee", "mer", "nuit"):
                err(ou, "type de trajet attendu : caravane, armee, mer ou nuit")
            for p in e["trajet"].get("etapes", []):
                if isinstance(p, list):
                    if len(p) != 2 or not dans_carte(*p):
                        err(ou, f"point de trajet {p} invalide ou hors de la carte")
                elif p not in lieux and p not in etapes:
                    err(ou, f"étape de trajet « {p} » inconnue")
        for d in e.get("divergences", []):
            if not d.get("sujet") or not d.get("texte"):
                err(ou, "divergence sans « sujet » ou sans « texte »")
        verifier_sources(ou, e, ouvrages)
        verifier_salat(ou, e)
    for j in ev_f.get("jalons", []):
        if j["evenement"] not in ids:
            err("jalons", f"événement « {j['evenement']} » inconnu")

    for h in had_f["hadiths"]:
        ou = f"hadith {h['id']}"
        if h.get("ouvrage") == "umda" and h.get("page") is not None and h.get("page_pdf") != h["page"] - 10:
            err(ou, "al-'Umda : la page du PDF doit valoir la page imprimée - 10")
        for ev in h.get("evenements", []):
            if ev not in ids:
                err(ou, f"événement « {ev} » inconnu")
        if h.get("statut") not in STATUTS:
            err(ou, "statut invalide")
        verifier_salat(ou, h)

    for id_ev, B in lire("batailles.json")["batailles"].items():
        ou = f"bataille {id_ev}"
        if id_ev not in ids:
            err(ou, "aucun événement ne porte cet identifiant")
        for u_id, u in B.get("unites", {}).items():
            if u.get("camp") not in B.get("camps", {}):
                err(ou, f"unité « {u_id} » : camp inconnu")
            if u.get("forme") not in ("infanterie", "archers", "cavalerie", "caravane"):
                err(ou, f"unité « {u_id} » : forme attendue infanterie, archers, cavalerie ou caravane")
        for k, P in enumerate(B.get("phases", []), 1):
            for u_id, pos in P.get("positions", {}).items():
                if u_id not in B.get("unites", {}):
                    err(ou, f"étape {k} : unité « {u_id} » inconnue")
                elif not dans_carte(pos[0], pos[1]):
                    err(ou, f"étape {k} : position de « {u_id} » hors de la carte")
            presents = set(P.get("positions", {}))
            for paire in P.get("combats", []):
                if len(paire) != 2 or any(x not in presents for x in paire):
                    err(ou, f"étape {k} : combat {paire} entre unités absentes de l'étape")
            for t in P.get("tirs", []):
                if t.get("de") not in presents or t.get("vers") not in presents:
                    err(ou, f"étape {k} : tir {t} entre unités absentes de l'étape")
            for f in P.get("fleches", []):
                if f.get("camp") not in B.get("camps", {}):
                    err(ou, f"étape {k} : flèche d'un camp inconnu")
                if any(not dans_carte(*pt) for pt in f.get("points", [])):
                    err(ou, f"étape {k} : flèche hors de la carte")
        verifier_sources(ou, B, ouvrages)
        verifier_salat(ou, B)

    # Mode histoire : chapitres reliés aux événements, une seule option juste par choix, lieux connus.
    H = lire("histoire.json")
    equilibre_choix = []
    ids_chap = [c.get("evenement") for c in H.get("chapitres", [])]
    for l in H.get("livres", []):
        for c in l.get("chapitres", []):
            if c not in ids_chap:
                err("histoire", f"livre « {l.get('titre')} » : chapitre « {c} » absent")
    position = lambda x: isinstance(x, list) and len(x) == 2 and dans_carte(*x)
    for c in H.get("chapitres", []):
        ou = f"histoire {c.get('evenement', '?')}"
        if c.get("evenement") not in ids:
            err(ou, "aucun événement ne porte cet identifiant")
        for champ in ("titre", "titre_ar", "a_retenir", "statut", "etapes"):
            if champ not in c:
                err(ou, f"champ « {champ} » manquant")
        for k, e in enumerate(c.get("etapes", []), 1):
            o = f"{ou}, étape {k}"
            t = e.get("type")
            if t not in ("recit", "choix", "trouver", "itineraire", "trajet", "bataille", "mission", "ordre", "associer", "vraifaux", "estimer"):
                err(o, f"type « {t} » inconnu")
            v = e.get("vue")
            if v and not (v.get("hijaz") or position(v.get("point")) or v.get("lieu") in lieux):
                err(o, "vue : lieu inconnu ou point hors de la carte")
            for x in e.get("etiquettes", []):
                if x not in lieux:
                    err(o, f"étiquette « {x} » : lieu inconnu")
            if t in ("choix", "itineraire"):
                opts = e.get("options", [])
                if sum(1 for x in opts if x.get("juste")) != 1:
                    err(o, "il faut exactement une option « juste »")
                if t == "choix" and opts:
                    equilibre_choix.append((o, opts))
                for x in opts:
                    if x.get("juste") and not x.get("reponse"):
                        err(o, "option juste sans « reponse »")
                    if not x.get("juste") and not x.get("consequence"):
                        err(o, "option fausse sans « consequence »")
                    for p in x.get("etapes", []):
                        if not (position(p) or (isinstance(p, str) and (p in lieux or p in etapes))):
                            err(o, f"itinéraire : étape « {p} » inconnue")
            if t == "mission":
                n = verifier_mission(e.get("mission"), lieux, ouvrages)
                if n is not None and n != e.get("epreuves"):
                    err(o, f"mission « {e.get('mission')} » : « epreuves » vaut {e.get('epreuves')}, la mission en compte {n}")
            if t == "ordre":
                el = e.get("elements", [])
                if len(el) < 3 or not e.get("consigne") or not e.get("reponse"):
                    err(o, "ordre : au moins trois éléments, une consigne et une réponse")
                for x in el:
                    if isinstance(x, dict) and x.get("lieu") and x["lieu"] not in lieux and x["lieu"] not in etapes:
                        err(o, f"ordre : lieu « {x['lieu']} » inconnu")
            if t == "associer":
                if len(e.get("paires", [])) < 3 or any(len(p) < 2 for p in e.get("paires", [])) or not e.get("reponse"):
                    err(o, "associer : au moins trois paires et une réponse")
                for x in e.get("lieux", []) or []:
                    if x and x not in lieux:
                        err(o, f"associer : lieu « {x} » inconnu")
            if t == "vraifaux":
                af = e.get("affirmations", [])
                if len(af) < 3 or any(not isinstance(a.get("vrai"), bool) or not a.get("explication") for a in af):
                    err(o, "vrai ou faux : au moins trois affirmations, chacune avec « vrai » et une « explication »")
                elif not (0 < sum(a["vrai"] for a in af) < len(af)):
                    avert(o, "vrai ou faux : toutes les réponses sont identiques")
            if t == "estimer":
                if not (e.get("min", 0) < e.get("juste", -1) < e.get("max", 0)) or not e.get("tolerance") or not e.get("reponse"):
                    err(o, "estimer : il faut min < juste < max, une tolérance et une réponse")
            if t == "trouver":
                if not (position(e.get("cible")) or (isinstance(e.get("cible"), str) and e.get("cible") in lieux)):
                    err(o, "cible inconnue ou hors de la carte")
                if not e.get("rayon"):
                    err(o, "rayon manquant")
            if t == "trajet" and not next((x for x in evenements if x.get("id") == c.get("evenement") and "trajet" in x), None):
                err(o, "étape « trajet » pour un événement sans trajet")
            if t == "bataille":
                B = lire("batailles.json")["batailles"].get(c.get("evenement"))
                if not B or not (0 <= e.get("phase", -1) < len(B.get("phases", []))):
                    err(o, "étape de bataille inconnue")
        verifier_sources(ou, c, ouvrages)
        verifier_salat(ou, c)

    # La bonne réponse ne doit pas se reconnaître à sa longueur (choix des chapitres et des missions).
    equilibre_choix.extend(CHOIX_MISSIONS)
    plus_longue = 0
    for o, opts in equilibre_choix:
        lg = [len(x.get("texte", "")) for x in opts]
        juste = next(i for i, x in enumerate(opts) if x.get("juste")) if any(x.get("juste") for x in opts) else 0
        if max(lg) > 1.6 * min(lg) and max(lg) - min(lg) > 25:
            err(o, f"réponses de longueurs trop inégales ({min(lg)} à {max(lg)} caractères)")
        if lg[juste] == max(lg):
            plus_longue += 1
    if equilibre_choix:
        part = plus_longue / len(equilibre_choix)
        print(f"Choix : la bonne réponse est la plus longue dans {plus_longue} cas sur {len(equilibre_choix)} ({part:.0%}).")
        if part > 0.45:
            err("histoire", f"la bonne réponse est trop souvent la plus longue ({part:.0%}) : varier les longueurs")

    a_verifier = sum(1 for e in evenements if e.get("statut") != "validé")
    pages = sum(1 for a in avertissements if "page à compléter" in a)
    print(f"{len(evenements)} événements, {len(lieux)} lieux, {len(hadiths)} hadiths, {len(ouvrages)} ouvrages, {len(ids_chap)} chapitres du mode histoire.")
    print(f"{a_verifier} événement(s) à vérifier ; {pages} référence(s) sans numéro de page.")
    for a in avertissements:
        if "page à compléter" not in a:
            print("  avertissement –", a)
    if erreurs:
        print(f"\n{len(erreurs)} erreur(s) :")
        for e in erreurs:
            print("  ERREUR –", e)
        sys.exit(1)
    print("Aucune erreur.")


if __name__ == "__main__":
    main()
