# Written with AI assistance (Claude); see the README.
"""Turn the NASA source files into what the browser engine loads.

Output (default app/public/data, not committed):
  manifest.json           projection, levels, time base, sources
  dem/far.bin.gz          60-90 S at 960 m, one grid
  dem/mid.bin.gz          80-90 S at 160 m, one grid
  dem/t80|t40|t20/r_c.bin.gz   512 px tiles at 80, 40 and 20 m (20 m poleward of 84 S)
  ephem.bin               hourly Sun and Earth vectors, 2023-2045, float32

Grids are int16 (height = DN * 0.5 m above 1737.4 km), each row delta-coded, then gzip.
Coarser grids are block means of the LOLA maps.

Usage: python scripts/build_web_data.py [dem] [ephem] [validation]
"""
import gzip
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
from earthrise_ref import DATA_DIR, R_MOON, ephem

OUT = Path(__file__).resolve().parents[2] / "app" / "public" / "data"
TILE = 512
T20_LAT = -84.0  # 20 m tiles are written poleward of this latitude
CROP = 1024  # validation crop of the Goddard maps: 61 km at 60 m, centred on the pole


def pack(a):
    """int16 grid -> gzip of row-wise deltas."""
    d = a.astype(np.int16).copy()
    d[:, 1:] = a[:, 1:] - a[:, :-1]
    return gzip.compress(d.astype("<i2").tobytes(), 6)


def block_mean(a, k):
    n = a.shape[0] // k
    return np.rint(a[: n * k, : n * k].reshape(n, k, n, k).astype(np.float32).mean(axis=(1, 3))).astype(np.int16)


def write_tiles(args):
    name, src, n, res, rmax = args
    a = np.memmap(DATA_DIR / src, dtype="<i2", mode="r", shape=(n, n))
    d = OUT / "dem" / name
    d.mkdir(parents=True, exist_ok=True)
    nt = -(-n // TILE)
    total, count = 0, 0
    for r in range(nt):
        for c in range(nt):
            if rmax:  # skip tiles wholly outside the circle of radius rmax
                x0, x1 = (c * TILE - n / 2) * res, ((c + 1) * TILE - n / 2) * res
                y1, y0 = (n / 2 - r * TILE) * res, (n / 2 - (r + 1) * TILE) * res
                nx, ny = min(max(0, x0), x1), min(max(0, y0), y1)
                if np.hypot(nx, ny) > rmax:
                    continue
            t = np.full((TILE, TILE), -32768, dtype=np.int16)
            blk = a[r * TILE:(r + 1) * TILE, c * TILE:(c + 1) * TILE]
            t[: blk.shape[0], : blk.shape[1]] = blk
            b = pack(t)
            (d / f"{r}_{c}.bin.gz").write_bytes(b)
            total += len(b); count += 1
    return name, count, total


def build_dem():
    (OUT / "dem").mkdir(parents=True, exist_ok=True)
    far = block_mean(np.memmap(DATA_DIR / "ldem_60s_240m.img", dtype="<i2", mode="r", shape=(7760, 7760)), 4)
    mid = block_mean(np.memmap(DATA_DIR / "ldem_80s_80m.img", dtype="<i2", mode="r", shape=(7600, 7600)), 2)
    sizes = {}
    for name, g in (("far", far), ("mid", mid)):
        b = pack(g)
        (OUT / "dem" / f"{name}.bin.gz").write_bytes(b)
        sizes[name] = len(b)
        print(f"{name}: {g.shape[0]} px, {len(b) / 1e6:.1f} MB")
    r20 = 2 * R_MOON * np.tan(np.radians(90 + T20_LAT) / 2)
    jobs = [("t80", "ldem_80s_80m.img", 7600, 80.0, 0.0), ("t40", "ldem_80s_40m.img", 15200, 40.0, 0.0),
            ("t20", "ldem_80s_20m.img", 30400, 20.0, r20)]
    with ProcessPoolExecutor(3) as ex:
        for name, count, total in ex.map(write_tiles, jobs):
            sizes[name] = total
            print(f"{name}: {count} tiles, {total / 1e6:.1f} MB")
    return {
        "far": {"file": "dem/far.bin.gz", "n": int(far.shape[0]), "res": 960.0, "source": "LDEM_60S_240M block mean 4x4"},
        "mid": {"file": "dem/mid.bin.gz", "n": int(mid.shape[0]), "res": 160.0, "source": "LDEM_80S_80M block mean 2x2"},
        "tiles": {
            "size": TILE, "nodata": -32768,
            "t80": {"n": 7600, "res": 80.0, "source": "LDEM_80S_80M"},
            "t40": {"n": 15200, "res": 40.0, "source": "LDEM_80S_40M"},
            "t20": {"n": 30400, "res": 20.0, "source": "LDEM_80S_20M", "min_radius_m": 0, "max_radius_m": float(r20)},
        },
        "bytes": sizes,
    }


def build_ephem():
    t0 = ephem.et(ephem.EPOCH)
    n = int((ephem.et("2045-01-01T00:00:00") - t0) // 3600) + 1
    ets = t0 + 3600.0 * np.arange(n)
    sun, earth = ephem.vectors(ets)
    sd = np.linalg.norm(sun, axis=1)
    dsn, names = ephem.dsn_mask(ets)
    ecl = ephem.eclipse_fraction(sun, earth)
    tab = np.zeros((n, 8), dtype="<f4")
    tab[:, 0:3] = sun / sd[:, None]
    tab[:, 3] = sd
    tab[:, 4:7] = earth
    tab[:, 7] = dsn + np.minimum(ecl, 0.999)  # integer part: DSN bits, fraction: eclipse
    (OUT / "ephem.bin").write_bytes(tab.tobytes())
    print(f"ephem: {n} rows, {tab.nbytes / 1e6:.1f} MB")
    return {
        "file": "ephem.bin", "epoch_utc": ephem.EPOCH, "step_s": 3600, "rows": n,
        "columns": ["sun_x", "sun_y", "sun_z", "sun_dist_km", "earth_x_km", "earth_y_km", "earth_z_km", "dsn_bits_plus_eclipse"],
        "frame": "MOON_ME (DE440), light time and stellar aberration applied, origin Moon centre",
        "dsn": {"stations": names, "mask_deg": ephem.DSN_MASK_DEG, "earth_rotation": "IAU_EARTH"},
        "kernels": ephem.KERNELS,
    }


def build_validation():
    """NASA Goddard's average visibility maps, repacked so the browser check can read them."""
    d = OUT / "validation"
    d.mkdir(parents=True, exist_ok=True)
    out = {}
    for key, src in (("sun", "avgvisib_85s_060m_201608.img"), ("earth", "avgvisib_85s_060m_201608_earth.img")):
        a = np.fromfile(DATA_DIR / src, dtype="<i2").reshape(5058, 5058)
        b = pack(a)
        (d / f"avgvisib_{key}.bin.gz").write_bytes(b)
        out[key] = {"file": f"validation/avgvisib_{key}.bin.gz", "n": 5058, "res": 60.0, "scale": 0.00004,
                    "source": src.upper(), "bytes": len(b)}
        print(f"validation {key}: {len(b) / 1e6:.1f} MB")
        # crops: the central CROP x CROP pixels, centred on the pole, for the check on the public page
        o = (5058 - CROP) // 2
        b = pack(a[o:o + CROP, o:o + CROP])
        (d / f"avgvisib_{key}_crop.bin.gz").write_bytes(b)
        out[f"{key}_crop"] = {"file": f"validation/avgvisib_{key}_crop.bin.gz", "n": CROP, "res": 60.0, "scale": 0.00004,
                              "offset": o, "source": f"{src.upper()} rows and columns {o} to {o + CROP - 1}", "bytes": len(b)}
        print(f"validation {key} crop: {CROP} px, {len(b) / 1e6:.1f} MB")
    return out


if __name__ == "__main__":
    what = sys.argv[1:] or ["dem", "ephem"]
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "manifest.json"
    m = json.loads(mf.read_text()) if mf.exists() else {}
    m["projection"] = {"type": "south polar stereographic, spherical", "radius_m": R_MOON, "lon0_deg": 0,
                       "note": "x = 2R tan(pi/4+lat/2) sin(lon), y = 2R tan(pi/4+lat/2) cos(lon); row 0 is +y"}
    m["height"] = {"dtype": "int16", "scale_m": 0.5, "encoding": "row-wise delta, little-endian, gzip"}
    if "dem" in what:
        m["dem"] = build_dem()
    if "ephem" in what:
        m["ephem"] = build_ephem()
    if "validation" in what:
        m["validation"] = build_validation()
    mf.write_text(json.dumps(m, indent=1))
