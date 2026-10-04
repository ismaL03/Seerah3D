#!/usr/bin/env python3
"""Fabrique le relief réel d'une zone de la carte (par défaut : le Hijaz).

Produit, dans data/relief/ :
  <zone>.png             altitudes : PNG en niveaux de gris 16 bits, valeur = altitude (m) + 1000,
                         lignes du nord au sud ; la mer porte une profondeur stylisée (négative)
  <zone>.json            emprise, dimensions, sources et attributions
  <zone>-satellite.jpg   image Sentinel-2 (couleurs vraies) calée sur la même emprise,
                         utilisée pour styliser le sol (sable, roche, harrât)

Sources :
  - Copernicus DEM GLO-90 (bucket public AWS copernicus-dem-90m)
  - Sentinel-2 L2A (bucket public AWS sentinel-cogs), aperçus internes des images TCI

Usage :
  pip install -r tools/requirements.txt
  python3 tools/relief.py                  # zone hijaz
  python3 tools/relief.py --sans-satellite # relief seul
Les tuiles téléchargées sont gardées dans tools/cache/ (ignoré par git).
"""
import argparse
import datetime as dt
import hashlib
import http.client
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import rasterio
import rasterio.errors
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from scipy import ndimage

RACINE = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "cache"
SORTIE = RACINE / "data" / "relief"

# Emprises : ouest, sud, est, nord (degrés) ; résolution en secondes d'arc.
ZONES = {
    "hijaz": {
        "nom": "Hijaz",
        "emprise": (37.0, 20.6, 41.0, 26.4),
        "resolution_arcsec": 20,
        "satellite_facteur": 2,  # image satellite deux fois plus fine que le relief
        "apercu": 3,             # aperçu Sentinel-2 au 1/16 (≈ 160 m)
    },
    # Encarts détaillés, fondus dans la carte du Hijaz quand on s'approche.
    # Leur emprise est calée sur la grille du Hijaz (voir caler) et leur pas en divise
    # exactement la maille : le raccord avec la carte générale est ainsi sans fissure.
    "makkah": {
        "nom": "La Mecque et ses environs",
        "emprise": (39.70, 21.30, 40.06, 21.52),
        "resolution_arcsec": 20 / 6,
        "satellite_facteur": 1,
        "apercu": 2,             # aperçu au 1/8 (≈ 80 m)
        "encart": True,
    },
    "madinah": {
        "nom": "Médine et ses environs",
        "emprise": (39.50, 24.36, 39.72, 24.56),
        "resolution_arcsec": 20 / 6,
        "satellite_facteur": 1,
        "apercu": 2,
        "encart": True,
    },
    # Autres lieux de bataille ou de traité, pour un relief net de près.
    "badr": {"nom": "Badr", "emprise": (38.70, 23.68, 38.84, 23.80), "resolution_arcsec": 20 / 6, "satellite_facteur": 1, "apercu": 2, "encart": True},
    "khaybar": {"nom": "Khaybar", "emprise": (39.20, 25.62, 39.38, 25.78), "resolution_arcsec": 20 / 6, "satellite_facteur": 1, "apercu": 2, "encart": True},
    "taif": {"nom": "Tâ'if", "emprise": (40.34, 21.20, 40.48, 21.34), "resolution_arcsec": 20 / 6, "satellite_facteur": 1, "apercu": 2, "encart": True},
    "hudaybiya": {"nom": "al-Hudaybiya", "emprise": (39.56, 21.40, 39.675, 21.48), "resolution_arcsec": 20 / 6, "satellite_facteur": 1, "apercu": 2, "encart": True},
}

DEM_URL = ("https://copernicus-dem-90m.s3.amazonaws.com/"
           "Copernicus_DSM_COG_30_{lat}_00_{lon}_00_DEM/Copernicus_DSM_COG_30_{lat}_00_{lon}_00_DEM.tif")
S2_BUCKET = "https://sentinel-cogs.s3.us-west-2.amazonaws.com"
S2_PREFIXE = "sentinel-s2-l2a-cogs"
S2_ANNEE = 2024
S2_MOIS = (1, 2, 12, 11, 3, 10)  # hiver d'abord : air plus clair qu'en été

ATTRIBUTION_DEM = ("Copernicus DEM GLO-90 — © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH "
                   "2014-2018, fourni dans le cadre de COPERNICUS par l'Union européenne et l'ESA")
DECALAGE = 1000  # valeur du PNG = altitude + DECALAGE (la mer est négative)
ATTRIBUTION_S2 = "Contient des données Copernicus Sentinel modifiées ({annee})"


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def lire_url(url, essais=4):
    """Lit une URL, avec quelques reprises en cas de coupure réseau."""
    for i in range(essais):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, http.client.HTTPException, ConnectionError, TimeoutError):
            if i == essais - 1:
                raise
            time.sleep(2 ** (i + 1))


def lire_en_cache(url, dossier):
    chemin = CACHE / dossier / hashlib.sha1(url.encode()).hexdigest()
    if chemin.exists():
        return chemin.read_bytes()
    donnees = lire_url(url)
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_bytes(donnees)
    return donnees


def telecharger(url, chemin):
    """Télécharge url vers chemin (avec cache). Renvoie False si le fichier n'existe pas (404)."""
    if chemin.exists():
        return True
    chemin.parent.mkdir(parents=True, exist_ok=True)
    try:
        donnees = lire_url(url)
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            return False
        raise
    tmp = chemin.with_suffix(chemin.suffix + ".part")
    tmp.write_bytes(donnees)
    tmp.rename(chemin)
    return True


def caler(zone):
    """Emprise d'un encart, élargie aux centres de pixels pairs de la grille du Hijaz.
    Renvoie l'emprise calée et les indices (colonnes, lignes) correspondants dans le Hijaz."""
    o0, s0, e0, n0 = ZONES["hijaz"]["emprise"]
    p = ZONES["hijaz"]["resolution_arcsec"] / 3600
    o, s, e, n = zone["emprise"]
    c0 = 2 * math.floor(((o - o0) / p - 0.5) / 2)
    c1 = 2 * math.ceil(((e - o0) / p - 0.5) / 2)
    r0 = 2 * math.floor(((n0 - n) / p - 0.5) / 2)
    r1 = 2 * math.ceil(((n0 - s) / p - 0.5) / 2)
    cale = (o0 + (c0 + 0.5) * p, n0 - (r1 + 0.5) * p, o0 + (c1 + 0.5) * p, n0 - (r0 + 0.5) * p)
    return cale, {"c0": c0, "c1": c1, "r0": r0, "r1": r1}


def grille(zone):
    o, s, e, n = zone["emprise"]
    pas = zone["resolution_arcsec"] / 3600
    largeur = round((e - o) / pas)
    hauteur = round((n - s) / pas)
    return from_origin(o, n, pas, pas), largeur, hauteur, pas


def relief(zone):
    o, s, e, n = zone["emprise"]
    transform, largeur, hauteur, pas = grille(zone)
    alt = np.full((hauteur, largeur), np.nan, dtype=np.float32)
    for lat in range(math.floor(s), math.ceil(n)):
        for lon in range(math.floor(o), math.ceil(e)):
            nlat, nlon = f"N{lat:02d}", f"E{lon:03d}"
            chemin = CACHE / "dem" / f"{nlat}{nlon}.tif"
            if not telecharger(DEM_URL.format(lat=nlat, lon=nlon), chemin):
                log(f"  {nlat}{nlon} : pas de tuile (pleine mer)")
                continue
            log(f"  {nlat}{nlon}")
            with rasterio.open(chemin) as src:
                tmp = np.full_like(alt, np.nan)
                reproject(rasterio.band(src, 1), tmp, dst_transform=transform, dst_crs="EPSG:4326",
                          dst_nodata=np.nan, resampling=Resampling.average)
            alt = np.where(np.isnan(alt), tmp, alt)

    # Mer : altitude 0 (ou absence de tuile) reliée à la pleine mer.
    candidat = np.isnan(alt) | (alt <= 0)
    etiquettes, _ = ndimage.label(candidat)
    bords = np.concatenate([etiquettes[0], etiquettes[-1], etiquettes[:, 0], etiquettes[:, -1]])
    ids_mer = [i for i in np.unique(bords) if i]
    # composantes trop petites au bord (salines) : on ne garde que les grandes
    tailles = ndimage.sum(candidat, etiquettes, ids_mer)
    ids_mer = [i for i, t in zip(ids_mer, tailles) if t > 2000]
    mer = np.isin(etiquettes, ids_mer)
    terre = ~mer
    alt = np.where(terre & (np.isnan(alt) | (alt < 1)), 1, alt)

    # Profondeur stylisée (pas de bathymétrie réelle) : plateau côtier puis pente.
    lat_moy = math.radians((s + n) / 2)
    dy_km = pas * 110.57
    dx_km = pas * 111.32 * math.cos(lat_moy)
    dist = ndimage.distance_transform_edt(mer, sampling=(dy_km, dx_km))
    profondeur = -np.minimum(800, 4 + 30 * dist ** 0.75)
    alt = np.where(mer, profondeur, alt)
    return np.round(alt).astype("<i2"), mer


def tuiles_mgrs(zone):
    import mgrs
    m = mgrs.MGRS()
    o, s, e, n = zone["emprise"]
    ids = set()
    for lat in np.arange(s, n + 0.01, 0.1):
        for lon in np.arange(o, e + 0.01, 0.1):
            ids.add(m.toMGRS(float(lat), float(lon), MGRSPrecision=0))
    return sorted(ids)


def lister(prefixe):
    url = f"{S2_BUCKET}/?list-type=2&delimiter=/&prefix={prefixe}"
    racine = ET.fromstring(lire_en_cache(url, "s2"))
    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    return [p.text for p in racine.findall("s3:CommonPrefixes/s3:Prefix", ns)]


def scenes(tuile):
    """Scènes candidates d'une tuile MGRS, les plus complètes d'abord, puis de préférence en janvier."""
    zone_utm, bande, carre = tuile[:2], tuile[2], tuile[3:]
    out = []
    for rang, mois in enumerate(S2_MOIS):
        for p in lister(f"{S2_PREFIXE}/{int(zone_utm)}/{bande}/{carre}/{S2_ANNEE}/{mois}/"):
            nom = p.rstrip("/").split("/")[-1]
            try:
                props = json.loads(lire_en_cache(f"{S2_BUCKET}/{p}{nom}.json", "s2"))["properties"]
            except (urllib.error.HTTPError, KeyError, json.JSONDecodeError):
                continue
            nuages = props.get("eo:cloud_cover", 100)
            vide = props.get("s2:nodata_pixel_percentage", 100)
            if nuages <= 3:
                out.append((vide, nuages, f"{S2_BUCKET}/{p}TCI.tif", nom, rang))
        # une scène complète suffit ; sinon trois mois de candidates (bord de fauchée)
        if any(c[0] < 1 for c in out) or (rang >= 2 and out):
            break
    return sorted(out, key=lambda c: (round(c[0] / 2), c[4], c[1]))


def apercu(url, nom, zone_id, transform, forme, niveau):
    """Aperçu interne d'une image TCI (niveau 3 = 1/16, 2 = 1/8), reprojeté sur la grille ; gardé en cache."""
    chemin = CACHE / "s2" / f"{nom}-{zone_id}-{forme[1]}x{forme[2]}.npy"
    if chemin.exists():
        return np.load(chemin)
    tmp = np.zeros(forme, dtype=np.uint8)
    for essai in range(4):
        try:
            with rasterio.open("/vsicurl/" + url, OVERVIEW_LEVEL=niveau) as src:
                for b in range(3):
                    reproject(rasterio.band(src, b + 1), tmp[b], src_nodata=0, dst_transform=transform,
                              dst_crs="EPSG:4326", dst_nodata=0, resampling=Resampling.average)
            break
        except rasterio.errors.RasterioIOError:
            if essai == 3:
                raise
            time.sleep(2 ** (essai + 1))
    chemin.parent.mkdir(parents=True, exist_ok=True)
    np.save(chemin, tmp)
    return tmp


def satellite(zone_id, zone, mer):
    o, s, e, n = zone["emprise"]
    f = zone["satellite_facteur"]
    pas = zone["resolution_arcsec"] / 3600 / f
    largeur, hauteur = round((e - o) / pas), round((n - s) / pas)
    transform = from_origin(o, n, pas, pas)
    img = np.zeros((3, hauteur, largeur), dtype=np.uint8)
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
    os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")
    utilisees = []
    for tuile in tuiles_mgrs(zone):
        cands = scenes(tuile)
        if not cands:
            log(f"  {tuile} : aucune scène claire")
            continue
        retenues = 0
        for vide, nuages, url, nom, _ in cands[:6]:
            tmp = apercu(url, nom, zone_id, transform, img.shape, zone["apercu"]).astype(np.float32)
            # Bords de fauchée : pixels quasi noirs (les champs de lave restent bien plus clairs).
            pleins = tmp.sum(0) > 45
            vides = img.sum(0) == 0
            if (vides & pleins).sum() < 200:
                continue  # n'apporte rien de nouveau
            # Harmonise la luminosité sur la partie déjà couverte (dates différentes).
            commun = pleins & ~vides
            if commun.sum() > 500:
                for b in range(3):
                    gain = img[b][commun].mean() / max(1.0, tmp[b][commun].mean())
                    tmp[b] *= min(1.33, max(0.75, gain))
            tmp = np.where(pleins, np.clip(tmp, 1, 255), 0).astype(np.uint8)
            img[:, vides & pleins] = tmp[:, vides & pleins]
            utilisees.append(nom)
            retenues += 1
            log(f"  {tuile} : {nom} (nuages {nuages:.1f} %, vide {vide:.1f} %)")
            if vide < 1 or retenues == 3:
                break
    # Derniers trous : moyenne pondérée des pixels voisins, de proche en proche.
    trous = img.sum(0) == 0
    sigma = 2
    while trous.any() and sigma < 200:
        valide = (~trous).astype(np.float32)
        poids = ndimage.gaussian_filter(valide, sigma)
        for b in range(3):
            flou = ndimage.gaussian_filter(img[b].astype(np.float32) * valide, sigma)
            remplis = trous & (poids > 0.05)
            img[b][remplis] = np.clip(flou[remplis] / poids[remplis], 1, 255)
        trous = img.sum(0) == 0
        sigma *= 2
    if not mer.any():
        return img, utilisees
    # Au large (plus de 3 km de la côte) : une seule teinte de mer, sans reflets ni nuages masqués.
    mer_fine = np.kron(mer, np.ones((f, f), dtype=bool))[:hauteur, :largeur]
    dist = ndimage.distance_transform_edt(mer_fine) * pas * 111
    teinte = np.median(img[:, mer_fine & (dist > 1) & (dist < 3)], axis=1)
    melange = np.clip((dist - 3) / 4, 0, 1)
    img = (img * (1 - melange) + teinte[:, None, None] * melange).astype(np.uint8)
    return img, utilisees


def accorder(img, zone):
    """Accorde les couleurs d'un encart sur celles de la mosaïque du Hijaz (même gain par canal)."""
    from PIL import Image
    ref_json, ref_img = SORTIE / "hijaz.json", SORTIE / "hijaz-satellite.jpg"
    if not (ref_json.exists() and ref_img.exists()):
        return img
    ref = json.loads(ref_json.read_text(encoding="utf-8"))
    e, (o, s, est, n) = ref["emprise"], zone["emprise"]
    im = Image.open(ref_img)
    fx, fy = im.width / (e["est"] - e["ouest"]), im.height / (e["nord"] - e["sud"])
    boite = (round((o - e["ouest"]) * fx), round((e["nord"] - n) * fy), round((est - e["ouest"]) * fx), round((e["nord"] - s) * fy))
    morceau = np.asarray(im.crop(boite), dtype=np.float32)
    petit = np.asarray(Image.fromarray(np.moveaxis(img, 0, -1)).resize(morceau.shape[1::-1], Image.BILINEAR), dtype=np.float32)
    gain = morceau.reshape(-1, 3).mean(0) / np.maximum(1, petit.reshape(-1, 3).mean(0))
    log(f"  couleurs accordées sur le Hijaz (gain {np.round(gain, 3).tolist()})")
    return np.clip(img * gain[:, None, None], 0, 255).astype(np.uint8)


def main():
    for z in ZONES.values():
        if z.get("encart"):
            z["emprise"], z["grille_hijaz"] = caler(z)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zone", default="toutes", choices=["toutes"] + sorted(ZONES))
    ap.add_argument("--sans-satellite", action="store_true", help="ne pas refaire l'image satellite")
    args = ap.parse_args()
    SORTIE.mkdir(parents=True, exist_ok=True)
    # le Hijaz d'abord : les encarts accordent leurs couleurs sur sa mosaïque
    for zone_id in (ZONES if args.zone == "toutes" else [args.zone]):
        produire(zone_id, ZONES[zone_id], args.sans_satellite)


def produire(zone_id, zone, sans_satellite):
    log(f"Relief {zone['nom']} (Copernicus DEM GLO-90)…")
    alt, mer = relief(zone)
    _, largeur, hauteur, pas = grille(zone)
    from PIL import Image
    Image.fromarray((alt.astype(np.int32) + DECALAGE).astype(np.uint16)).save(SORTIE / f"{zone_id}.png", optimize=True)

    meta = {
        "zone": zone_id,
        "nom": zone["nom"],
        "emprise": dict(zip(("ouest", "sud", "est", "nord"), zone["emprise"])),
        "largeur": largeur,
        "hauteur": hauteur,
        "resolution_arcsec": zone["resolution_arcsec"],
        "format": "PNG gris 16 bits, lignes du nord au sud ; altitude (m) = valeur - decalage",
        "decalage": DECALAGE,
        "altitude_min": int(alt[~mer].min()),
        "altitude_max": int(alt.max()),
        "mer": "profondeur stylisée (distance à la côte), pas une bathymétrie réelle" if mer.any() else None,
        "genere_le": dt.date.today().isoformat(),
        "encart": bool(zone.get("encart")),
        "grille_hijaz": zone.get("grille_hijaz"),
        "encarts": [k for k, z in ZONES.items() if z.get("encart")] if not zone.get("encart") else [],
        "sources": [{"nom": "Copernicus DEM GLO-90", "attribution": ATTRIBUTION_DEM}],
    }
    if not sans_satellite:
        log("Image Sentinel-2…")
        img, utilisees = satellite(zone_id, zone, mer)
        if zone.get("encart"):
            img = accorder(img, zone)
        Image.fromarray(np.moveaxis(img, 0, -1)).save(SORTIE / f"{zone_id}-satellite.jpg", quality=84, optimize=True)
        meta["satellite"] = {
            "fichier": f"{zone_id}-satellite.jpg",
            "largeur": img.shape[2],
            "hauteur": img.shape[1],
            "scenes": utilisees,
        }
        meta["sources"].append({"nom": "Sentinel-2 L2A", "attribution": ATTRIBUTION_S2.format(annee=S2_ANNEE)})
    else:
        ancien = SORTIE / f"{zone_id}.json"
        if ancien.exists():
            prec = json.loads(ancien.read_text(encoding="utf-8"))
            if "satellite" in prec:
                meta["satellite"] = prec["satellite"]
                meta["sources"] += [x for x in prec["sources"] if x["nom"].startswith("Sentinel")]
    (SORTIE / f"{zone_id}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"OK {zone_id} : {largeur}×{hauteur}, altitudes {meta['altitude_min']}–{meta['altitude_max']} m")


if __name__ == "__main__":
    main()
