# Written with AI assistance (Claude); see the README.
"""Decode NASA Goddard's track-adjusted LOLA maps (Barker et al. 2021, 2023) to raw float grids.

The PDS polar mosaics carry errors along the laser tracks: metre-scale ridges that, at a grazing
Sun, cast shadows that are not there. The adjusted maps remove them. Checked on the connecting
ridge against Barker et al. 2021, Table 2: with the PDS 5 m mosaic the longest lit period comes out
near 25 days, with the adjusted map near 220, as published.

Input (EARTHRISE_DATA/adj/): ldem_87s_5mpp.tif, ldem_80s_20mpp_adj.tif, ldem_60s_240mpp_adj.tif
Output (EARTHRISE_DATA/): the same names with .f32, float32 metres above 1737.4 km, NaN where empty,
and adj.json with each grid's size, origin and spacing.
"""
import json
from earthrise_ref import DATA_DIR, geotiff

if __name__ == "__main__":
    info = {}
    for name in ("ldem_60s_240mpp_adj", "ldem_80s_20mpp_adj", "ldem_87s_5mpp"):
        src = DATA_DIR / "adj" / f"{name}.tif"
        w, h, left, top, res = geotiff.convert(src, DATA_DIR / f"{name}.f32")
        info[name] = {"cols": w, "rows": h, "left_m": left, "top_m": top, "res_m": res}
        print(name, info[name])
    (DATA_DIR / "adj.json").write_text(json.dumps(info, indent=1))
