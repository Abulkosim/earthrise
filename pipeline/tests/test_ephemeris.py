"""The ephemeris, checked against sources outside this project."""
import json
import urllib.parse
import urllib.request
import numpy as np
import pytest
from earthrise_ref import ephem


def horizons(target, lon, lat, h_km, start, stop, step):
    """Azimuth and elevation of a target from a lunar surface site, from the JPL Horizons API."""
    q = {
        "format": "json", "COMMAND": f"'{target}'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER", "CENTER": "'coord@301'", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{lon},{lat},{h_km}'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'", "QUANTITIES": "'4'", "ANG_FORMAT": "DEG", "CSV_FORMAT": "YES",
        "APPARENT": "AIRLESS", "TIME_DIGITS": "MINUTES",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    txt = json.load(urllib.request.urlopen(url, timeout=120))["result"]
    rows = []
    for line in txt.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        c = [x.strip() for x in line.split(",")]
        rows.append((c[0].replace("A.D. ", ""), float(c[-3]), float(c[-2])))
    return rows


SITES = {"near the pole": (0.0, -89.5, 0.0), "86 S": (0.0, -86.0, 1.5), "Apollo 11": (23.47314, 0.67416, 0.0)}


@pytest.mark.network
@pytest.mark.parametrize("site", SITES)
@pytest.mark.parametrize("target,tid", [("SUN", "10"), ("EARTH", "399")])
def test_matches_jpl_horizons(site, target, tid):
    """Azimuth and elevation agree with JPL Horizons to better than 0.001 deg over a lunar month."""
    lon, lat, h_km = SITES[site]
    rows = horizons(tid, lon, lat, h_km, "2027-03-01 00:00", "2027-03-29 00:00", "6 h")
    ets = np.array([ephem.et(t + " UTC") for t, _, _ in rows])
    sun, earth = ephem.vectors(ets)
    az, el, _ = ephem.azel(sun if target == "SUN" else earth, np.radians(lat), np.radians(lon), h_km * 1e3)
    h_az, h_el = np.array([r[1] for r in rows]), np.array([r[2] for r in rows])
    d_az = ((az - h_az + 180) % 360 - 180) * np.cos(np.radians(h_el))
    assert np.abs(el - h_el).max() < 1e-3
    assert np.abs(d_az).max() < 1e-3


# Sun elevation at touchdown, from the Apollo Lunar Surface Journal table by J. Scotti:
# https://www.nasa.gov/wp-content/uploads/static/history/alsj/Scotti_AltAz.txt
APOLLO = [
    ("Apollo 11", 0.6875, 23.4333, "1969-07-20T20:17:39", 10.65),
    ("Apollo 12", -3.1975, -23.3856, "1969-11-19T06:54:36", 5.19),
    ("Apollo 14", -3.6733, -17.4653, "1971-02-05T09:18:13", 10.36),
    ("Apollo 15", 26.1008, 3.6528, "1971-07-30T22:16:29", 12.05),
    ("Apollo 16", -8.9914, 15.5144, "1972-04-21T02:23:35", 14.76),
    ("Apollo 17", 20.1653, 30.7658, "1972-12-11T19:54:58", 13.33),
]


@pytest.mark.parametrize("name,lat,lon,utc,sun_el", APOLLO)
def test_apollo_landing_sun_elevation(name, lat, lon, utc, sun_el):
    """The Sun stood where the Apollo records say it did when each lander touched down."""
    sun, _ = ephem.vectors(np.array([ephem.et(utc)]))
    _, el, _ = ephem.azel(sun, np.radians(lat), np.radians(lon), 0.0)
    assert abs(el[0] - sun_el) < 0.15, f"{name}: {el[0]:.2f} vs {sun_el}"


def test_blue_ghost_saw_the_eclipse():
    """On 2025-03-14 the Earth covered the Sun as seen from the Moon (Blue Ghost imaged it)."""
    ets = ephem.et("2025-03-14T00:00:00") + np.arange(0, 24 * 3600, 600.0)
    sun, earth = ephem.vectors(ets)
    f = ephem.eclipse_fraction(sun, earth)
    assert f.max() == 1.0
    day_before = ephem.eclipse_fraction(*ephem.vectors(ets - 86400 * 3))
    assert day_before.max() == 0.0
