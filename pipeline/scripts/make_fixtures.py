"""Reference answers for the browser engine tests.

For a set of south-pole points this writes the horizon profile (720 azimuths) from the
reference model on the best maps we hold (20 m to 80 S, 240 m beyond), and the Sun and Earth
series over a test window. Output: app/public/data/fixtures-v2.json
(v2: the reference uses the adjusted maps and nests 5 m, 20 m and 240 m, as the engine does)
"""
import json
from pathlib import Path
import numpy as np
from earthrise_ref import dem, ephem
from earthrise_ref.horizon import horizon
from earthrise_ref.proj import ll2xy
from earthrise_ref.visibility import disk_fraction, horizon_at

OUT = Path(__file__).resolve().parents[2] / "app" / "public" / "data" / "fixtures-v2.json"
MAST = 2.0
POINTS = [  # name, lat, lon (deg east)
    ("Connecting ridge", -89.45, 222.69), ("Shackleton rim", -89.78, 204.0), ("Shackleton floor", -89.67, 129.2),
    ("de Gerlache rim", -88.67, 291.9), ("de Gerlache floor", -88.5, 272.0), ("Malapert massif", -85.99, 2.9),
    ("Mons Mouton", -84.79, 29.2), ("Haworth floor", -87.45, 355.0), ("Nobile rim 1", -85.43, 37.0),
    ("Shoemaker floor", -88.1, 45.0), ("Faustini rim", -87.6, 90.0), ("Slater plain", -88.1, 112.0),
    ("Cabeus floor", -84.9, 324.5), ("Amundsen rim", -84.3, 68.8), ("Sverdrup", -88.3, 208.0),
    ("Plain 86S 180E", -86.0, 180.0), ("Ridge 89.0S 120E", -89.0, 120.0), ("Ridge 88.8S 123.4E", -88.8, 123.4),
    ("Point 87S 300E", -87.0, 300.0), ("Point 85.5S 250E", -85.5, 250.0), ("Point 89.9S 0E", -89.9, 0.0),
    ("Point 86.5S 140E", -86.5, 140.0), ("Point 88S 330E", -88.0, 330.0), ("Point 84.5S 200E", -84.5, 200.0),
]

if __name__ == "__main__":
    stack = dem.south("5m")  # adjusted maps: 5 m to 87 S, 20 m to 80 S, 240 m beyond
    t0 = ephem.et("2027-01-01T00:00:00")
    hours0 = (t0 - ephem.et(ephem.EPOCH)) / 3600.0
    n = 24 * 59  # two lunar days, hourly
    ets = t0 + 3600.0 * np.arange(n)
    sun, earth = ephem.vectors(ets)
    out = {"mast": MAST, "naz": 720, "window": {"hours0": hours0, "steps": n, "dt_hours": 1.0}, "points": []}
    for name, lat_d, lon_d in POINTS:
        lat, lon = np.radians(lat_d), np.radians(lon_d)
        haz, hel, h0, _ = horizon(stack, lat, lon, mast=MAST, naz=720, d0=1.25)
        saz, sel, sd = ephem.azel(sun, lat, lon, h0 + MAST)
        eaz, eel, _ = ephem.azel(earth, lat, lon, h0 + MAST)
        fs = disk_fraction(sel, horizon_at(saz, haz, hel), np.degrees(np.arcsin(695700.0 / sd)))
        fs = fs * (1 - ephem.eclipse_fraction(sun, earth))
        clear = eel - horizon_at(eaz, haz, hel)
        x, y = ll2xy(lat, lon)
        out["points"].append({
            "name": name, "lat": lat_d, "lon": lon_d, "x": float(x), "y": float(y), "ground": h0,
            "finest_m": 5 if float(np.hypot(x, y)) < 90000 else 20,
            "horizon": np.round(hel, 4).tolist(),
            "lit_mean": float(fs.mean()), "lit_any": float((fs > 0).mean()),
            "earth_clear": float((clear >= 0).mean()),
        })
        print(f"{name:22s} h={h0:7.0f} m  horizon {hel.min():6.2f}..{hel.max():6.2f}  lit {fs.mean()*100:5.1f}%  earth {100*(clear>=0).mean():5.1f}%")
    OUT.write_text(json.dumps(out))
