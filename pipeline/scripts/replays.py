# Written with AI assistance (Claude); see the README.
"""Replays of real landings: what the Sun and Earth did for missions that flew.

For each mission we take the catalogue coordinates (app/src/data/sites.json), put an observer
2 m above the ground and run the reference model over the stay: Sun elevation and visible disk
fraction at landing, the first time the whole disk goes behind the terrain (model sunset) and
the next sunrise, Earth above the terrain, and for Blue Ghost the eclipse of the Sun by the Earth.

Terrain: 20 m LOLA (with the 240 m map beyond it) poleward of 80 S, the 240 m map alone from
60 S to 80 S, a smooth sphere north of 60 S.
Output: app/src/data/replays.json. Run from pipeline/: .venv/bin/python scripts/replays.py
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import numpy as np
from earthrise_ref import DATA_DIR, R_MOON, R_SUN_KM, dem, ephem
from earthrise_ref.horizon import horizon
from earthrise_ref.visibility import disk_fraction, horizon_at

ROOT = Path(__file__).resolve().parents[2]
SITES = ROOT / "app" / "src" / "data" / "sites.json"
OUT = ROOT / "app" / "src" / "data" / "replays.json"
MAST = 2.0
STEP_MIN = 10  # minutes between samples over the whole span
NAZ = 720

# Times are UTC. "stayEnd" is when the mission really ended (used for the Earth-clear share);
# "endUtc" is the end of the span worth showing.
MISSIONS = [
    {
        "id": "chandrayaan-3-2023",
        "happened": 'Vikram landed on 23 August 2023 at 12:34 UTC, early in the local day. ISRO put Pragyan to sleep on 2 September and Vikram on 4 September at about 02:30 UTC, with charged batteries, as night came. Neither answered the wake-up calls that began on 22 September.', "siteId": "chandrayaan-3", "title": "Chandrayaan-3, August 2023",
        "landingUtc": "2023-08-23T12:34:00Z", "stayEnd": "2023-09-04T02:30:00Z", "endUtc": "2023-09-07T00:00:00Z",
        "sources": [
            "https://www.livescience.com/space/the-moon/india-lands-on-moon-chandrayaan-3-becomes-worlds-1st-spacecraft-to-land-near-lunar-south-pole",
            "https://www.businesstoday.in/latest/trends/story/chandrayaan-3-update-vikram-lander-set-into-sleep-mode-at-8-am-payloads-are-now-switched-off-says-isro-396766-2023-09-04",
            "https://spacepolicyonline.com/news/india-says-good-night-to-chandrayaan-3/",
            "https://planetarynames.wr.usgs.gov/Feature/16272",
        ],
    },
    {
        "id": "slim-2024",
        "happened": 'SLIM landed on 19 January 2024 at 15:20 UTC (00:20 on 20 January in Japan), but it came to rest on its nose with its solar cells facing west, and JAXA switched it off less than three hours later. Contact came back on 28 January, once sunlight reached the cells. It went dormant as night fell at the start of February, and answered again in late February, after the night.', "siteId": "slim", "title": "SLIM, January 2024",
        "landingUtc": "2024-01-19T15:20:00Z", "stayEnd": "2024-01-31T15:00:00Z", "endUtc": "2024-02-02T00:00:00Z",
        "sources": [
            "https://global.jaxa.jp/press/2024/01/20240125-1_e.html",
            "https://www.livescience.com/space/the-moon/japans-moon-sniper-resurrected-nearly-9-days-after-losing-power-thanks-to-solar-charge",
            "https://spacepolicyonline.com/news/slim-beats-the-odds-again/",
            "https://lroc.im-ldi.com/images/1358",
        ],
    },
    {
        "id": "im-1-2024",
        "happened": 'Odysseus landed near Malapert A on 22 February 2024 at 23:23 UTC and ended up on its side, with antennas that are fixed and could not be turned towards Earth. The team first expected about nine days before the Sun set on the site, then cut that estimate. Intuitive Machines put the lander in standby on 29 February.', "siteId": "im-1-odysseus", "title": "IM-1 Odysseus, February 2024",
        "landingUtc": "2024-02-22T23:23:00Z", "stayEnd": "2024-02-29T12:00:00Z", "endUtc": "2024-03-04T12:00:00Z",
        "sources": [
            "https://www.americaspace.com/2024/02/22/im-1-lands-safely-achieves-first-u-s-soft-lunar-touchdown-since-apollo-17/",
            "https://www.americaspace.com/2024/02/26/im-1-struggles-with-communications-after-tipping-over/",
            "https://satnews.com/2024/02/29/intuitive-machines-im-1-mission-success-american-ingenuity-never-gives-up/",
            "https://lroc.im-ldi.com/images/1360",
        ],
    },
    {
        "id": "im-2-2025",
        "happened": 'Athena landed on Mons Mouton on 6 March 2025 at about 17:31 UTC, about 250 m from its target, and came to rest on its side in a crater about 20 m across. Intuitive Machines said that with the direction of the Sun, the orientation of the panels and the cold in the crater it would not recharge, and declared the mission over on 7 March.', "siteId": "im-2-athena", "title": "IM-2 Athena, March 2025",
        "landingUtc": "2025-03-06T17:31:00Z", "stayEnd": "2025-03-07T14:30:00Z", "endUtc": "2025-03-09T00:00:00Z",
        "sources": [
            "https://www.space.com/the-universe/moon/intuitive-machines-lands-private-athena-lander-near-moon-south-pole-historic-touchdown",
            "https://spaceflightnow.com/?p=68928",
            "https://lroc.im-ldi.com/images/1408",
            "https://lroc.im-ldi.com/images/1401",
        ],
    },
    {
        "id": "blue-ghost-1-2025",
        "happened": 'Blue Ghost landed upright in Mare Crisium on 2 March 2025 at 08:34 UTC and worked through the whole lunar day. On 14 March it filmed the Earth covering the Sun, and on 16 March it imaged the sunset and ran just over five hours into the night; the last data arrived at about 23:15 UTC.', "siteId": "blue-ghost-1", "title": "Blue Ghost Mission 1, March 2025",
        "landingUtc": "2025-03-02T08:34:00Z", "stayEnd": "2025-03-16T23:15:00Z", "endUtc": "2025-03-17T12:00:00Z",
        "sources": [
            "https://fireflyspace.com/news/firefly-aerospace-becomes-first-commercial-company-to-successfully-land-on-the-moon/",
            "https://fireflyspace.com/?p=3576",
            "https://www.timeanddate.com/eclipse/lunar/2025-march-14",
            "https://lroc.im-ldi.com/images/1407",
        ],
    },
]

# IM-2 target as published by LROC before the landing (rounded to 0.01 deg there).
IM2_TARGET = (-84.78, 29.13)


def parse(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def iso(d):
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def et_of(d):
    return ephem.et(d.strftime("%Y-%m-%dT%H:%M:%S"))


_stacks = {}


def terrain_for(lat_d):
    if lat_d <= -80.0:
        if "20m" not in _stacks:
            _stacks["20m"] = dem.south("5m")  # 5 m where it exists (87-90 S), else 20 m
        return "20 m LOLA", _stacks["20m"]
    if lat_d <= -60.0:
        if "240m" not in _stacks:
            _stacks["240m"] = dem.NestedDem([dem.adjusted("240m")])
        return "240 m LOLA", _stacks["240m"]
    return "smooth sphere", None


def site_horizon(lat_d, lon_d):
    """Terrain label, azimuths, horizon elevations (deg) and ground height (m) for an observer at MAST."""
    name, stack = terrain_for(lat_d)
    lat, lon = np.radians(lat_d), np.radians(lon_d)
    if stack is None:
        dip = -np.degrees(np.arccos(R_MOON / (R_MOON + MAST)))
        haz = np.arange(NAZ) * 360.0 / NAZ
        return name, haz, np.full(NAZ, dip), 0.0
    d0 = 5.0 if name == "20 m LOLA" else 60.0
    haz, hel, h0, _ = horizon(stack, lat, lon, mast=MAST, naz=NAZ, d0=d0)
    return name, haz, hel, h0


def series(lat_d, lon_d, haz, hel, h0, t_start, t_end, step_min):
    n = int((t_end - t_start).total_seconds() // (60 * step_min)) + 1
    times = [t_start + timedelta(minutes=step_min * i) for i in range(n)]
    ets = et_of(t_start) + 60.0 * step_min * np.arange(n)
    sun, earth = ephem.vectors(ets)
    lat, lon = np.radians(lat_d), np.radians(lon_d)
    saz, sel, sd = ephem.azel(sun, lat, lon, h0 + MAST)
    eaz, eel, _ = ephem.azel(earth, lat, lon, h0 + MAST)
    srad = np.degrees(np.arcsin(R_SUN_KM / sd))
    sh = horizon_at(saz, haz, hel)
    frac_terrain = disk_fraction(sel, sh, srad)
    # Eclipse seen from the site itself, not the Moon's centre (the two differ by up to half an hour).
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    obs = up * (R_MOON + h0 + MAST) / 1e3
    ecl = ephem.eclipse_fraction(sun - obs, earth - obs)
    cosang = np.sum((sun - obs) * (earth - obs), axis=-1) / (
        np.linalg.norm(sun - obs, axis=-1) * np.linalg.norm(earth - obs, axis=-1))
    sep = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
    clear = eel - horizon_at(eaz, haz, hel)
    return {"t": times, "saz": saz, "sel": sel, "sh": sh, "frac": frac_terrain, "ecl": ecl,
            "eaz": eaz, "eel": eel, "clear": clear, "sep": sep, "srad": srad}


def first_index(mask, start=0):
    idx = np.flatnonzero(mask[start:])
    return int(idx[0]) + start if len(idx) else None


def run_mission(m, sites):
    site = sites[m["siteId"]]
    lat_d, lon_d = site["lat"], site["lon"]
    terrain, haz, hel, h0 = site_horizon(lat_d, lon_d)
    t_land, t_end, t_stay = parse(m["landingUtc"]), parse(m["endUtc"]), parse(m["stayEnd"])
    # Look far enough ahead to find the next sunset and sunrise even when they fall after endUtc.
    s = series(lat_d, lon_d, haz, hel, h0, t_land, t_end + timedelta(days=32), STEP_MIN)
    i_set = first_index(s["frac"] <= 0.0)  # eclipses do not count as sunset
    i_rise = first_index(s["frac"] > 0.0, i_set) if i_set is not None else None
    stay_n = int((t_stay - t_land).total_seconds() // (60 * STEP_MIN)) + 1
    num = {
        "sunElevationAtLandingDeg": round(float(s["sel"][0]), 2),
        "sunFractionAtLanding": round(float(s["frac"][0] * (1 - s["ecl"][0])), 3),
        "modelSunsetUtc": iso(s["t"][i_set]) if i_set is not None else None,
    }
    if i_rise is not None:
        num["modelSunriseUtc"] = iso(s["t"][i_rise])
    num["earthElevationAboveTerrainAtLandingDeg"] = round(float(s["clear"][0]), 2)
    num["earthClearShare"] = round(float((s["clear"][:stay_n] >= 0).mean()), 3)
    i_noon = int(np.argmax(s["sel"][: i_set or len(s["t"])]))
    ctx = {
        "terrain": terrain, "ground": h0, "set": s["t"][i_set] if i_set is not None else None,
        "rise": s["t"][i_rise] if i_rise is not None else None,
        "sunHorizonAtLanding": float(s["sh"][0]), "sunAzAtLanding": float(s["saz"][0]),
        "sunElAtStayEnd": float(s["sel"][stay_n - 1]), "fracAtStayEnd": float(s["frac"][stay_n - 1]),
        "sunHorizonAtStayEnd": float(s["sh"][stay_n - 1]),
        "earthMinClearStay": float(s["clear"][:stay_n].min()),
        "noon": s["t"][i_noon], "noonEl": float(s["sel"][i_noon]),
        "sunlitShareOfStay": float((s["frac"][:stay_n] > 0).mean()),
    }
    n_end = int((t_end - t_land).total_seconds() // (60 * STEP_MIN)) + 1
    if s["ecl"][:n_end].max() > 0:
        num["eclipse"], ctx["eclipse"] = eclipse(lat_d, lon_d, haz, hel, h0, s)
    return terrain, num, ctx


def eclipse(lat_d, lon_d, haz, hel, h0, s):
    """Start, maximum and end of the Sun being covered by the Earth, refined at 1 minute."""
    on = np.flatnonzero(s["ecl"] > 0)
    run_end = on[0]  # first contiguous run only
    while run_end + 1 < len(s["ecl"]) and s["ecl"][run_end + 1] > 0:
        run_end += 1
    f = series(lat_d, lon_d, haz, hel, h0, s["t"][on[0] - 1], s["t"][run_end + 1], 1)
    k = np.flatnonzero(f["ecl"] > 0)
    full = np.flatnonzero(f["ecl"] >= 1.0)
    out = {"startUtc": iso(f["t"][k[0]]), "maxUtc": iso(f["t"][int(np.argmin(f["sep"]))]),
           "endUtc": iso(f["t"][k[-1]])}
    ctx = {"maxFraction": float(f["ecl"].max()), "max": f["t"][int(np.argmin(f["sep"]))],
           "totalStart": f["t"][full[0]] if len(full) else None, "totalEnd": f["t"][full[-1]] if len(full) else None}
    return out, ctx


def hm(d):
    return d.strftime("%H:%M")


def day(d):
    return f"{d.day} {d:%B} at {d:%H:%M} UTC"


def model_text(m, num, c):
    el = num["sunElevationAtLandingDeg"]
    earth = num["earthElevationAboveTerrainAtLandingDeg"]
    t_land = parse(m["landingUtc"])
    after = lambda d: (d - t_land).total_seconds() / 86400
    if m["id"] == "chandrayaan-3-2023":
        sleep = parse(m["stayEnd"])
        gap = (c["set"] - sleep).total_seconds() / 3600
        return (f"On the 240 m map the Sun stood {el:.1f} degrees up at landing, fully clear of the terrain, "
                f"and the Earth {earth:.1f} degrees above it. The model's sunset is {day(c['set'])}, about "
                f"{gap:.0f} hours after Vikram was put to sleep with the Sun still {c['sunElAtStayEnd']:.1f} degrees up. "
                f"The next sunrise is {day(c['rise'])}, so the light did come back before the wake-up calls; "
                f"the model has no thermal part and cannot say why the lander did not answer.")
    if m["id"] == "slim-2024":
        return (f"This site is north of 60 S, so the model uses a smooth sphere. The Sun stood {el:.1f} degrees up "
                f"in the east at landing, crossed the meridian into the western sky on {day(c['noon'])} and set on "
                f"{day(c['set'])}, which matches the dormancy. With the array set the way SLIM's ended up, fixed, "
                f"upright and facing west, the model gives no power at landing, first light on the cells on "
                f"{day(c['panelFirst'])} and half of full output by {day(c['panelHalf'])}. JAXA regained contact on "
                f"28 January. This replay sets the array that way.")
    if m["id"] == "im-1-2024":
        return (f"On the 20 m map the Sun stood {el:.1f} degrees up at landing and the site stayed in full sunlight "
                f"until the model's sunset on {day(c['set'])}, {after(c['set']):.1f} days after landing, close to the "
                f"nine days first expected. At the standby on 29 February the Sun was still "
                f"{c['sunElAtStayEnd']:.1f} degrees up and fully clear of the terrain. So the early end was not the "
                f"terrain's shadow but how the tipped lander sat, which this model does not know.")
    if m["id"] == "im-2-2025":
        rise = c["sunHorizonAtLanding"]
        return (f"On the 20 m map the Sun stood only {el:.1f} degrees up at landing, {el - rise:.1f} degrees above "
                f"the terrain, and the point stays in sunlight until {day(c['set'])}; the target point published "
                f"by LROC gives almost the same ({day(c['targetSet'])}). So the map gives this site about "
                f"{after(c['set']):.0f} days of Sun, and the model cannot explain the end of the mission. "
                f"A 20 m crater is one pixel of this map, and with the Sun {el:.1f} degrees up anything 3 m tall "
                f"within 50 m can hide it; that, and a lander on its side, are below what the model can see.")
    if m["id"] == "blue-ghost-1-2025":
        e = c["eclipse"]
        firefly_night = parse(m["stayEnd"]) - timedelta(hours=5)
        need = c["elAtFireflyNight"] + c["sunRadius"]
        lag = (e["max"] - datetime(2025, 3, 14, 6, 58, 43, tzinfo=timezone.utc)).total_seconds() / 60
        return (f"On a smooth sphere (there is no terrain north of 60 S) the Sun stood {el:.1f} degrees up at landing. "
                f"On 14 March the Earth covered it completely from {hm(e['totalStart'])} to {hm(e['totalEnd'])} UTC, "
                f"middle at {hm(e['max'])}, {lag:.0f} minutes after the 06:58:43 peak seen from Earth, because the site "
                f"is on the Moon's trailing side and meets the shadow late. "
                f"The model's sunset is {day(c['set'])}, about {(parse(m['stayEnd']) - c['set']).total_seconds() / 3600:.0f} "
                f"hours before the last data rather than five; a western horizon about {need:.1f} degrees high, "
                f"which a smooth sphere cannot show, or a different meaning of night "
                f"(by Firefly's count it began a little before {hm(firefly_night)} UTC) would close the gap.")
    raise KeyError(m["id"])


if __name__ == "__main__":
    sites = {x["id"]: x for x in json.loads(SITES.read_text())}
    out = []
    for m in MISSIONS:
        terrain, num, ctx = run_mission(m, sites)
        if m["id"] == "im-2-2025":
            lat_d, lon_d = IM2_TARGET
            _, haz, hel, h0 = site_horizon(lat_d, lon_d)
            s = series(lat_d, lon_d, haz, hel, h0, parse(m["landingUtc"]), parse(m["endUtc"]) + timedelta(days=32), STEP_MIN)
            ctx["targetSet"] = s["t"][first_index(s["frac"] <= 0.0)]
            print(f"    IM-2 target {IM2_TARGET}: Sun {s['sel'][0]:.2f} deg, horizon {s['sh'][0]:.2f}, sunset {iso(ctx['targetSet'])}")
        if m["id"] == "slim-2024":
            # SLIM came to rest with its cells facing west. A fixed upright array facing azimuth 270:
            # output share = cos(elevation) * cos(azimuth - 270), never below zero (see panelGain in the app).
            site = sites[m["siteId"]]
            _, haz, hel, h0 = site_horizon(site["lat"], site["lon"])
            s = series(site["lat"], site["lon"], haz, hel, h0, parse(m["landingUtc"]), parse(m["endUtc"]), STEP_MIN)
            gain = np.maximum(0, np.cos(np.radians(s["sel"])) * np.cos(np.radians(s["saz"] - 270.0))) * (s["frac"] > 0)
            ctx["panelFirst"] = s["t"][first_index(gain > 0.001)]
            ctx["panelHalf"] = s["t"][first_index(gain >= 0.5)]
            print(f"    SLIM west-facing array: share at landing {gain[0]:.3f}, first light {iso(ctx['panelFirst'])}, half {iso(ctx['panelHalf'])}")
        if m["id"] == "blue-ghost-1-2025":
            site = sites[m["siteId"]]
            _, haz, hel, h0 = site_horizon(site["lat"], site["lon"])
            night = parse(m["stayEnd"]) - timedelta(hours=5)
            s = series(site["lat"], site["lon"], haz, hel, h0, night, night, 1)
            ctx["elAtFireflyNight"] = float(s["sel"][0])
            ctx["sunRadius"] = float(s["srad"][0])
        rec = {k: m[k] for k in ("id", "siteId", "title", "landingUtc", "endUtc")}
        rec["terrain"] = terrain
        rec["happened"] = m["happened"]
        rec["model"] = model_text(m, num, ctx)
        rec["numbers"] = num
        rec["sources"] = m["sources"]
        if m["id"] == "slim-2024":
            rec["mission"] = {"panelFixed": True, "panelAz": 270, "panelTilt": 90}
        out.append(rec)
        print(m["id"], terrain, json.dumps(num))
        print("   ", rec["model"])
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print("wrote", OUT)
