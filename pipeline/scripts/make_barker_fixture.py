# Written with AI assistance (Claude); see the README.
"""A published result to check the engine against: Barker et al. 2021, Table 2.

Barker et al. (Planetary and Space Science 203:105119) give, for seven regions of interest on the
connecting ridge between Shackleton and de Gerlache (their Site 1), the average visible fraction
of the Sun, the longest continuous illumination and the longest continuous shadow between
1 Jan 2024 and 1 Jan 2026, at 1 m and 5 m above the surface, from 5 m LOLA terrain.

This script reads the region outlines NASA Goddard publishes with the site maps
(https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_ROIs.tgz, unpacked into
EARTHRISE_DATA/barker/), lists the 5 m pixel centres inside each region, and writes them with the
table's numbers to app/public/data/validation/barker-site1.json for the browser check.

The table gives percentiles over 100 error clones of the terrain: the 1st percentile of average
illumination and of the longest lit period, and the 99th percentile of the longest shadow. Our
single run on the nominal terrain should sit at or above the first two and at or below the third.
"""
import json
import struct
from pathlib import Path
from earthrise_ref import DATA_DIR

OUT = Path(__file__).resolve().parents[2] / "app" / "public" / "data" / "validation" / "barker-site1.json"
SHP = DATA_DIR / "barker" / "Site01_ROIs.shp"

# Table 2, case A (the region is averaged for each clone, then percentiles are taken). Order: RoI 1..7.
TABLE = {
    "x_km": [-11.5825, -11.4875, -11.3525, -11.2875, -11.1025, -10.8025, -10.2275],
    "y_km": [-12.4625, -12.5575, -12.5025, -12.1675, -11.9425, -11.7375, -11.5525],
    "area_m2": [8625, 7550, 3825, 13300, 10075, 10000, 7075],
    "1m": {"avg_p1": [68.03, 70.32, 67.51, 69.61, 70.38, 71.15, 67.36],
           "lcip_p1_days": [63.35, 113.80, 117.86, 136.49, 142.17, 81.01, 100.23],
           "lcsp_p99_days": [16.55, 17.84, 22.23, 13.27, 15.24, 12.74, 14.54]},
    "5m": {"avg_p1": [89.26, 88.51, 84.53, 88.12, 85.71, 87.35, 82.79],
           "lcip_p1_days": [215.79, 216.28, 216.89, 231.20, 218.98, 220.98, 119.07],
           "lcsp_p99_days": [5.29, 7.31, 8.41, 4.00, 4.52, 4.16, 5.42]},
}


def read_polygons(path):
    """Polygons of an ESRI shapefile (shape type 5), each a list of rings of (x, y)."""
    b = path.read_bytes()
    out, pos = [], 100
    while pos < len(b):
        _, length = struct.unpack(">ii", b[pos:pos + 8])
        rec = b[pos + 8: pos + 8 + 2 * length]
        pos += 8 + 2 * length
        if struct.unpack("<i", rec[:4])[0] != 5:
            continue
        nparts, npts = struct.unpack("<ii", rec[36:44])
        parts = list(struct.unpack(f"<{nparts}i", rec[44:44 + 4 * nparts])) + [npts]
        pts = struct.unpack(f"<{2 * npts}d", rec[44 + 4 * nparts: 44 + 4 * nparts + 16 * npts])
        xy = list(zip(pts[0::2], pts[1::2]))
        out.append([xy[parts[i]:parts[i + 1]] for i in range(nparts)])
    return out


def inside(x, y, rings):
    """Even-odd rule over all rings."""
    c = False
    for ring in rings:
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
                c = not c
    return c


if __name__ == "__main__":
    polys = read_polygons(SHP)
    unit = 1000.0 if max(abs(v) for p in polys for r in p for xy in r for v in xy) < 1000 else 1.0  # km or m
    rois = []
    for k in range(7):
        cx, cy = TABLE["x_km"][k] * 1000, TABLE["y_km"][k] * 1000
        # the outline whose bounding box holds the table's centre
        match = None
        for p in polys:
            xs = [x * unit for r in p for x, _ in r]; ys = [y * unit for r in p for _, y in r]
            if min(xs) - 3 <= cx <= max(xs) + 3 and min(ys) - 3 <= cy <= max(ys) + 3:
                if match is None or (max(xs) - min(xs)) < match[1]:
                    match = (p, max(xs) - min(xs), min(xs), max(xs), min(ys), max(ys))
        if match is None:
            raise SystemExit(f"no outline found for RoI {k + 1}")
        p, _, x0, x1, y0, y1 = match
        rings = [[(x * unit, y * unit) for x, y in r] for r in p]
        pts = []
        # 5 m pixel centres sit at ...2.5 and ...7.5 metres (pixel registration)
        gx = [2.5 + 5 * i for i in range(int((x0 - 2.5) // 5), int((x1 - 2.5) // 5) + 2)]
        gy = [2.5 + 5 * j for j in range(int((y0 - 2.5) // 5), int((y1 - 2.5) // 5) + 2)]
        for y in gy:
            for x in gx:
                if inside(x, y, rings):
                    pts.append([x, y])
        rois.append({"roi": k + 1, "centre_m": [cx, cy], "area_m2_paper": TABLE["area_m2"][k],
                     "area_m2_from_pixels": len(pts) * 25, "points_m": pts,
                     "paper": {h: {m: TABLE[h][m][k] for m in TABLE[h]} for h in ("1m", "5m")}})
        print(f"RoI {k + 1}: {len(pts)} pixels = {len(pts) * 25} m2 (paper: {TABLE['area_m2'][k]} m2)")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "Barker et al. 2021, Planetary and Space Science 203:105119, Table 2, case A; "
                  "region outlines from https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_ROIs.tgz",
        "window_utc": ["2024-01-01T00:00:00", "2026-01-01T00:00:00"], "step_hours": 1,
        "note": "avg_p1 and lcip_p1_days are 1st percentiles over 100 terrain clones, lcsp_p99_days is the 99th.",
        "rois": rois}))
