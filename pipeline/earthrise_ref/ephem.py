"""Sun and Earth as seen from the Moon, from SPICE.

Frame: MOON_ME (mean Earth / polar axis), the frame of the LOLA maps and of JPL Horizons.
Positions carry light-time and stellar aberration corrections ("LT+S").
"""
import numpy as np
import spiceypy as sp
from . import DATA_DIR, R_MOON, R_SUN_KM, R_EARTH_KM
from .proj import enu

KERNELS = ["naif0012.tls", "pck00011.tpc", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]
EPOCH = "2024-01-01T00:00:00"  # UTC, start of the hourly table

# DSN complexes: latitude, east longitude (deg). 10 deg elevation mask.
DSN = {"Goldstone": (35.4267, 243.1105), "Madrid": (40.4314, 355.7520), "Canberra": (-35.4014, 148.9817)}
DSN_MASK_DEG = 10.0

_loaded = False


def load():
    global _loaded
    if not _loaded:
        for k in KERNELS:
            sp.furnsh(str(DATA_DIR / "kernels" / k))
        _loaded = True


def et(utc):
    load()
    return sp.str2et(utc)


def vectors(ets):
    """Moon centre -> Sun and Moon centre -> Earth, km, MOON_ME, for an array of ET."""
    load()
    sun = np.array([sp.spkpos("SUN", t, "MOON_ME", "LT+S", "MOON")[0] for t in ets])
    earth = np.array([sp.spkpos("EARTH", t, "MOON_ME", "LT+S", "MOON")[0] for t in ets])
    return sun, earth


def azel(vec_km, lat, lon, h_m):
    """Azimuth (deg, clockwise from north), elevation (deg) and range (km) from a surface site."""
    up, east, north = enu(lat, lon)
    p = vec_km - up * (R_MOON + h_m) / 1e3
    dist = np.linalg.norm(p, axis=-1)
    v = p / dist[..., None]
    return np.degrees(np.arctan2(v @ east, v @ north)) % 360, np.degrees(np.arcsin(v @ up)), dist


def dsn_mask(ets):
    """Bit i set when DSN complex i has the Moon above its 10 deg mask (IAU_EARTH rotation)."""
    load()
    names = list(DSN)
    ups = []
    for la, lo in DSN.values():
        la, lo = np.radians(la), np.radians(lo)
        ups.append(np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)]))
    out = np.zeros(len(ets), dtype=np.uint8)
    for i, t in enumerate(ets):
        m = np.array(sp.spkpos("MOON", t, "IAU_EARTH", "LT+S", "EARTH")[0])
        for b, u in enumerate(ups):
            v = m - u * R_EARTH_KM
            if np.degrees(np.arcsin(v @ u / np.linalg.norm(v))) >= DSN_MASK_DEG:
                out[i] |= 1 << b
    return out, names


def eclipse_fraction(sun_km, earth_km):
    """Fraction of the Sun's disk hidden by the Earth, seen from the Moon's centre."""
    ds, de = np.linalg.norm(sun_km, axis=-1), np.linalg.norm(earth_km, axis=-1)
    rs, re = np.arcsin(R_SUN_KM / ds), np.arcsin(R_EARTH_KM / de)
    sep = np.arccos(np.clip(np.sum(sun_km * earth_km, axis=-1) / (ds * de), -1, 1))
    out = np.zeros_like(sep)
    full = sep <= re - rs
    part = (sep < re + rs) & ~full
    d, a, b = sep[part], rs[part], re[part]
    x = (d * d + a * a - b * b) / (2 * d * a)
    y = (d * d + b * b - a * a) / (2 * d * b)
    area = a * a * np.arccos(np.clip(x, -1, 1)) + b * b * np.arccos(np.clip(y, -1, 1)) \
        - 0.5 * np.sqrt(np.clip((-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b), 0, None))
    out[part] = area / (np.pi * a * a)
    out[full] = 1.0
    return out
