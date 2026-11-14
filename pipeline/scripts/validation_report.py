# Written with AI assistance (Claude); see the README.
"""Numbers for the public validation page, from the reference model.

Writes app/src/data/validation.json with:
  apollo    Sun elevation at the six Apollo touchdowns: the Apollo Lunar Surface Journal value and ours
  horizons  largest difference from the JPL Horizons API per site and body, over a lunar month in 2027
  eclipse   the 2025-03-14 eclipse of the Sun by the Earth, seen from the Moon's centre

Needs the SPICE kernels and, for the Horizons part, internet.
Usage (from pipeline/): .venv/bin/python scripts/validation_report.py [--date YYYY-MM-DD]
"""
import argparse
import json
import sys
from pathlib import Path
import numpy as np
from earthrise_ref import ephem

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from test_ephemeris import APOLLO, SITES, horizons  # noqa: E402  the same inputs and API call as the tests

OUT = Path(__file__).resolve().parents[2] / "app" / "src" / "data" / "validation.json"
GENERATED = "2026-11-14"
HORIZONS_WINDOW = ("2027-03-01 00:00", "2027-03-29 00:00", "6 h")


def apollo():
    rows = []
    for name, lat, lon, utc, recorded in APOLLO:
        sun, _ = ephem.vectors(np.array([ephem.et(utc)]))
        _, el, _ = ephem.azel(sun, np.radians(lat), np.radians(lon), 0.0)
        ours = float(el[0])
        rows.append({"mission": name, "lat": lat, "lon": lon, "utc": utc, "recorded_deg": recorded,
                     "ours_deg": round(ours, 3), "diff_deg": round(ours - recorded, 3)})
        print(f"{name:10s} recorded {recorded:6.2f}  ours {ours:6.3f}  diff {ours - recorded:+.3f}")
    return rows


def horizons_check():
    rows = []
    for site, (lon, lat, h_km) in SITES.items():
        for body, tid in (("Sun", "10"), ("Earth", "399")):
            res = horizons(tid, lon, lat, h_km, *HORIZONS_WINDOW)
            ets = np.array([ephem.et(t + " UTC") for t, _, _ in res])
            sun, earth = ephem.vectors(ets)
            az, el, _ = ephem.azel(sun if body == "Sun" else earth, np.radians(lat), np.radians(lon), h_km * 1e3)
            h_az, h_el = np.array([r[1] for r in res]), np.array([r[2] for r in res])
            d_az = ((az - h_az + 180) % 360 - 180) * np.cos(np.radians(h_el))  # on the sky, as in the test
            row = {"site": site, "lat": lat, "lon": lon, "height_km": h_km, "body": body, "samples": len(res),
                   "max_az_diff_deg": float(np.abs(d_az).max()), "max_el_diff_deg": float(np.abs(el - h_el).max())}
            rows.append(row)
            print(f"{site:14s} {body:5s} n={len(res)}  max |d az| {row['max_az_diff_deg']:.6f}  max |d el| {row['max_el_diff_deg']:.6f} deg")
    return rows


def eclipse():
    t0 = ephem.et("2025-03-14T00:00:00")
    ets = t0 + np.arange(0, 24 * 3600 + 1, 30.0)
    sun, earth = ephem.vectors(ets)
    f = ephem.eclipse_fraction(sun, earth)
    sep = np.degrees(np.arccos(np.clip(np.sum(sun * earth, axis=1) / (np.linalg.norm(sun, axis=1) * np.linalg.norm(earth, axis=1)), -1, 1)))
    utc = lambda t: ephem.sp.et2utc(t, "ISOC", 0)  # noqa: E731
    i = int(np.argmin(sep))
    part, total = np.flatnonzero(f > 0), np.flatnonzero(f >= 1.0)
    out = {"date": "2025-03-14", "where": "Moon centre", "step_s": 30,
           "max_fraction": float(f.max()), "max_utc": utc(ets[i]),
           "partial_start_utc": utc(ets[part[0]]), "partial_end_utc": utc(ets[part[-1]]),
           "total_start_utc": utc(ets[total[0]]) if len(total) else None,
           "total_end_utc": utc(ets[total[-1]]) if len(total) else None,
           "total_minutes": round(len(total) * 30 / 60) if len(total) else 0}
    print("eclipse", out)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=GENERATED, help="generation date written to the file")
    a = ap.parse_args()
    ephem.load()
    rep = {"generated": a.date, "apollo": apollo(), "eclipse": eclipse(),
           "horizons_window": {"start": HORIZONS_WINDOW[0], "stop": HORIZONS_WINDOW[1], "step": HORIZONS_WINDOW[2]},
           "horizons": horizons_check()}
    OUT.write_text(json.dumps(rep, indent=1) + "\n")
    print(f"wrote {OUT}")
