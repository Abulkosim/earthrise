# Written with AI assistance (Claude); see the README.
"""Turn the NASA source files into what the browser engine loads.

Output (default app/public/data, not committed):
  manifest.json           projection, levels, time base, sources
  dem/far.bin.gz          60-90 S at 960 m, one grid
  dem/mid.bin.gz          80-90 S at 160 m, one grid
  dem/t80|t40|t20/r_c.bin.gz   512 px tiles at 80, 40 and 20 m (20 m poleward of 84 S)
  dem/t10|t5/r_c.bin.gz        512 px tiles at 10 and 5 m (87-90 S)
  ephem.bin               hourly Sun and Earth vectors, 2023-2045, float32

Terrain comes from NASA Goddard's track-adjusted LOLA maps (Barker et al. 2021, 2023), decoded by
scripts/convert_adj.py: 5 m to 87 S, 20 m to 80 S, 240 m to 60 S. Coarser grids are block means.
Heights are stored as int32 centimetres above 1737.4 km. Each value is replaced by its difference
from the plane through its left, upper and upper-left neighbours, which is small on smooth ground,
then gzip. Empty pixels are the int32 minimum.

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


NODATA = -2147483648
ADJ = json.loads((DATA_DIR / "adj.json").read_text()) if (DATA_DIR / "adj.json").exists() else {}
# level -> (source grid, block-mean factor)
LEVELS = {
    "t5": ("ldem_87s_5mpp", 1), "t10": ("ldem_87s_5mpp", 2),
    "t20": ("ldem_80s_20mpp_adj", 1), "t40": ("ldem_80s_20mpp_adj", 2), "t80": ("ldem_80s_20mpp_adj", 4),
}


def source(name):
    g = ADJ[name]
    return np.memmap(DATA_DIR / f"{name}.f32", dtype="<f4", mode="r", shape=(g["rows"], g["cols"])), g


def pack(h):
    """float metres (NaN where empty) -> gzip of int32 centimetres, each as its residual from the
    plane through its left, upper and upper-left neighbours."""
    v = np.where(np.isfinite(h), np.rint(h.astype(np.float64) * 100.0), NODATA).astype(np.int64)
    r = v.copy()
    r[:, 1:] -= v[:, :-1]
    r[1:, :] -= v[:-1, :]
    r[1:, 1:] += v[:-1, :-1]
    return gzip.compress((r & 0xFFFFFFFF).astype("<u4").tobytes(), 6, mtime=0)  # mtime=0: same input, same bytes


def block_mean(a, k):
    """Mean over k x k blocks, ignoring empty pixels; a block with no data stays empty."""
    if k == 1:
        return np.asarray(a, dtype=np.float32)
    n0, n1 = a.shape[0] // k, a.shape[1] // k
    b = np.asarray(a[: n0 * k, : n1 * k], dtype=np.float32).reshape(n0, k, n1, k)
    ok = np.isfinite(b)
    cnt = ok.sum(axis=(1, 3))
    tot = np.where(ok, b, 0).sum(axis=(1, 3), dtype=np.float64)
    return np.where(cnt > 0, tot / np.maximum(cnt, 1), np.nan).astype(np.float32)


def write_tile_rows(args):
    """Write the tiles of one level for a range of tile rows. Returns (level, written, bytes, missing)."""
    level, r_start, r_end, rmax = args
    name, k = LEVELS[level]
    a, g = source(name)
    n, res = g["cols"] // k, g["res_m"] * k
    d = OUT / "dem" / level
    d.mkdir(parents=True, exist_ok=True)
    nt = -(-n // TILE)
    total, count, missing = 0, 0, []
    for r in range(r_start, min(r_end, nt)):
        for c in range(nt):
            if rmax:  # skip tiles wholly outside the circle of radius rmax
                x0, x1 = (c * TILE - n / 2) * res, ((c + 1) * TILE - n / 2) * res
                y1, y0 = (n / 2 - r * TILE) * res, (n / 2 - (r + 1) * TILE) * res
                if np.hypot(min(max(0, x0), x1), min(max(0, y0), y1)) > rmax:
                    continue
            blk = block_mean(a[r * TILE * k:(r + 1) * TILE * k, c * TILE * k:(c + 1) * TILE * k], k)
            if not np.isfinite(blk).any():
                missing.append(f"{r}_{c}")
                continue
            t = np.full((TILE, TILE), np.nan, dtype=np.float32)
            t[: blk.shape[0], : blk.shape[1]] = blk
            b = pack(t)
            (d / f"{r}_{c}.bin.gz").write_bytes(b)
            total += len(b); count += 1
    return level, count, total, missing


def build_dem():
    (OUT / "dem").mkdir(parents=True, exist_ok=True)
    info = {"encoding": "int32 centimetres, residual from the plane through the left, upper and upper-left "
                        "neighbours (decode with a running sum along rows, then along columns), little-endian, gzip",
            "nodata": NODATA}
    sizes = {}
    far_src, gf = source("ldem_60s_240mpp_adj")
    far = block_mean(far_src, 4)
    mid_src, gm = source("ldem_80s_20mpp_adj")
    mid = np.concatenate([block_mean(mid_src[r:r + 4096], 8) for r in range(0, gm["rows"], 4096)], axis=0)
    for name, g in (("far", far), ("mid", mid)):
        b = pack(g)
        (OUT / "dem" / f"{name}.bin.gz").write_bytes(b)
        sizes[name] = len(b)
        print(f"{name}: {g.shape[0]} px, {len(b) / 1e6:.1f} MB")
    r20 = 2 * R_MOON * np.tan(np.radians(90 + T20_LAT) / 2)
    jobs, tiles = [], {"size": TILE}
    for level, (name, k) in LEVELS.items():
        g = ADJ[name]
        n = g["cols"] // k
        tiles[level] = {"n": n, "res": g["res_m"] * k, "dtype": "int32", "scale_m": 0.01,
                        "source": f"{name.upper()}" + (f", {k}x{k} block mean" if k > 1 else "")}
        nt = -(-n // TILE)
        jobs += [(level, r, r + 4, r20 if level == "t20" else 0.0) for r in range(0, nt, 4)]
    tiles["t20"]["max_radius_m"] = float(r20)
    counts = {k: 0 for k in LEVELS}
    missing = {k: [] for k in LEVELS}
    for k in LEVELS:
        sizes[k] = 0
    with ProcessPoolExecutor(8) as ex:
        for level, count, total, miss in ex.map(write_tile_rows, jobs):
            counts[level] += count; sizes[level] += total; missing[level] += miss
    for k in LEVELS:
        tiles[k]["missing"] = missing[k]  # tiles inside the grid that hold no data: the app does not ask for them
        print(f"{k}: {counts[k]} tiles, {sizes[k] / 1e6:.1f} MB, {len(missing[k])} empty")
    return {
        **info,
        "far": {"file": "dem/far.bin.gz", "n": int(far.shape[0]), "res": 960.0, "dtype": "int32", "scale_m": 0.01,
                "source": "LDEM_60S_240MPP_ADJ, 4x4 block mean"},
        "mid": {"file": "dem/mid.bin.gz", "n": int(mid.shape[0]), "res": 160.0, "dtype": "int32", "scale_m": 0.01,
                "source": "LDEM_80S_20MPP_ADJ, 8x8 block mean"},
        "tiles": tiles,
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


def pack16(a):
    """int16 grid -> gzip of row-wise deltas (the format of the Goddard visibility maps for the checks)."""
    d = a.astype(np.int16).copy()
    d[:, 1:] = a[:, 1:] - a[:, :-1]
    return gzip.compress(d.astype("<i2").tobytes(), 6, mtime=0)


def build_validation():
    """NASA Goddard's average visibility maps, repacked so the browser check can read them."""
    d = OUT / "validation"
    d.mkdir(parents=True, exist_ok=True)
    out = {}
    for key, src in (("sun", "avgvisib_85s_060m_201608.img"), ("earth", "avgvisib_85s_060m_201608_earth.img")):
        a = np.fromfile(DATA_DIR / src, dtype="<i2").reshape(5058, 5058)
        b = pack16(a)
        (d / f"avgvisib_{key}.bin.gz").write_bytes(b)
        out[key] = {"file": f"validation/avgvisib_{key}.bin.gz", "n": 5058, "res": 60.0, "scale": 0.00004,
                    "source": src.upper(), "bytes": len(b)}
        print(f"validation {key}: {len(b) / 1e6:.1f} MB")
        # crops: the central CROP x CROP pixels, centred on the pole, for the check on the public page
        o = (5058 - CROP) // 2
        b = pack16(a[o:o + CROP, o:o + CROP])
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
    if "dem" in what:
        m["dem"] = build_dem()
    if "ephem" in what:
        m["ephem"] = build_ephem()
    if "validation" in what:
        m["validation"] = build_validation()
    mf.write_text(json.dumps(m, indent=1))
