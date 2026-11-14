# Written with AI assistance (Claude); see the README.
"""Reference answers for the app's CPU model tests (app/src/model/sitecalc.test.ts).

Five sites (the app's three default compared sites, the catalogue's connecting-ridge point and
Apollo 11 on a smooth sphere), a 14-day window from 2027-11-03T00:00Z at 1 h steps. For each site
this writes the horizon profile, the ground height, and the Sun and Earth series computed in double
precision straight from SPICE. It also writes the rows of the hourly ephemeris table that cover
the window, made exactly as build_web_data.build_ephem makes them, so the test can feed the
app's own table interpolation. Output: app/src/model/__fixtures__/reference.json

Run from pipeline/: .venv/bin/python scripts/make_test_fixtures.py
"""
import json
from pathlib import Path
import numpy as np
from earthrise_ref import R_MOON, dem, ephem
from earthrise_ref.horizon import horizon
from earthrise_ref.visibility import disk_fraction, horizon_at, longest_run

OUT = Path(__file__).resolve().parents[2] / "app" / "src" / "model" / "__fixtures__" / "reference.json"
MAST = 2.0
NAZ = 720
START = "2027-11-03T00:00:00"
STEPS = 14 * 24
LIT_MIN = 0.5
EARTH_MARGIN = 1.0
SITES = [  # catalogue id (app/src/data/sites.json), name, lat, lon (deg east), terrain
    ("barker-site1-roi4", "Connecting ridge, region 4", -89.45267, 222.8513, True),
    ("connecting-ridge", "Connecting ridge", -89.45, 222.69, True),
    ("a3-malapert-massif", "Malapert Massif region centre", -86.0, 359.76, True),
    ("a3-mons-mouton-plateau", "Mons Mouton Plateau region centre", -84.3, 30.6, True),
    ("apollo-11", "Apollo 11", 0.67416, 23.47314, False),
]


def f32(a):
    """float32 values as the shortest decimals that read back to the same float32."""
    return [float(str(np.float32(v))) for v in np.ravel(a)]


def table_rows(ets):
    """Rows of the hourly table, exactly as build_ephem makes them."""
    sun, earth = ephem.vectors(ets)
    sd = np.linalg.norm(sun, axis=1)
    dsn, _ = ephem.dsn_mask(ets)
    ecl = ephem.eclipse_fraction(sun, earth)
    tab = np.zeros((len(ets), 8), dtype="<f4")
    tab[:, 0:3] = sun / sd[:, None]
    tab[:, 3] = sd
    tab[:, 4:7] = earth
    tab[:, 7] = dsn + np.minimum(ecl, 0.999)
    return tab


if __name__ == "__main__":
    epoch = ephem.et(ephem.EPOCH)
    hours0 = (ephem.et(START) - epoch) / 3600.0
    row0 = int(np.floor(hours0 + 1e-9))
    # hours0 sits 1.4 ms short of a whole hour (the table counts TDB seconds, not UTC ones), so
    # rows row0 .. row0 + STEPS + 1 cover every step and its interpolation partner
    tab = table_rows(epoch + 3600.0 * (row0 + np.arange(STEPS + 2)))

    ets = ephem.et(START) + 3600.0 * np.arange(STEPS)
    sun, earth = ephem.vectors(ets)
    dsn, _ = ephem.dsn_mask(ets)
    ecl = ephem.eclipse_fraction(sun, earth)

    stack = None
    sites = []
    for sid, name, lat_d, lon_d, terrain in SITES:
        lat, lon = np.radians(lat_d), np.radians(lon_d)
        if terrain:
            stack = stack or dem.south("5m")
            # first step 1.25 m, as in make_fixtures.py: with 5 m steps the walk skips terrain on the 5 m map,
            # and on the connecting ridge that moved the horizon by up to 0.37 degrees and the longest dark by 2 h
            _, hel, h0, _ = horizon(stack, lat, lon, mast=MAST, naz=NAZ, d0=1.25)
        else:
            hel, h0 = np.full(NAZ, -np.degrees(np.arccos(R_MOON / (R_MOON + MAST)))), 0.0
        hel = np.round(hel, 4)
        haz = np.arange(NAZ) * 360.0 / NAZ
        saz, sel, sd = ephem.azel(sun, lat, lon, h0 + MAST)
        eaz, eel, _ = ephem.azel(earth, lat, lon, h0 + MAST)
        frac = disk_fraction(sel, horizon_at(saz, haz, hel), np.degrees(np.arcsin(695700.0 / sd))) * (1 - ecl)
        clear = eel - horizon_at(eaz, haz, hel)
        comm = (clear >= EARTH_MARGIN) & (dsn > 0)
        summary = {
            "lit": float(frac.mean()),
            "longestDarkH": longest_run(frac < LIT_MIN),
            "comm": float(comm.mean()),
            "longestSilenceH": longest_run(~comm),
        }
        sites.append({
            "id": sid, "name": name, "lat": lat_d, "lon": lon_d, "terrain": terrain, "ground": round(float(h0), 3),
            "horizon": hel.tolist(),
            "sunAz": np.round(saz, 6).tolist(), "sunEl": np.round(sel, 6).tolist(),
            "sunFrac": np.round(frac, 6).tolist(), "earthClear": np.round(clear, 6).tolist(),
            "dsn": dsn.astype(int).tolist(), "summary": summary,
        })
        print(f"{name:30s} h={h0:7.0f} m  lit {summary['lit'] * 100:5.1f}%  dark {summary['longestDarkH']:3d} h"
              f"  contact {summary['comm'] * 100:5.1f}%  silence {summary['longestSilenceH']:3d} h")

    out = {
        "start_utc": START, "epoch_utc": ephem.EPOCH, "hours0": hours0, "row0": row0, "steps": STEPS, "dt_hours": 1.0,
        "mission": {"mast": MAST, "litMin": LIT_MIN, "earthMargin": EARTH_MARGIN, "needDsn": True},
        "naz": NAZ, "rows": f32(tab), "sites": sites,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"{OUT}: {OUT.stat().st_size / 1e3:.0f} kB")
