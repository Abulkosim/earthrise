"""Download the NASA source files Earthrise is built from.

Usage: python scripts/fetch_data.py [kernels] [dem] [validation]
Files land in EARTHRISE_DATA (default: ../earthrise-data next to the repo).
"""
import sys
import urllib.request
from earthrise_ref import DATA_DIR

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
LOLA = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img"
ILLUM = "http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG"

# group -> (local path, url, size in bytes, what it is)
SOURCES = {
    "kernels": [
        ("kernels/naif0012.tls", f"{NAIF}/lsk/naif0012.tls", 5257, "leap seconds"),
        ("kernels/pck00011.tpc", f"{NAIF}/pck/pck00011.tpc", 131226, "planetary constants"),
        ("kernels/de440s.bsp", f"{NAIF}/spk/planets/de440s.bsp", 32726016, "JPL DE440 ephemeris, 1849-2150"),
        ("kernels/moon_pa_de440_200625.bpc", f"{NAIF}/pck/moon_pa_de440_200625.bpc", 12863488, "lunar orientation"),
        ("kernels/moon_de440_250416.tf", f"{NAIF}/fk/satellites/moon_de440_250416.tf", 19478, "lunar frames (MOON_ME)"),
    ],
    "dem": [
        ("ldem_80s_20m.img", f"{LOLA}/ldem_80s_20m.img", 1848320000, "LOLA elevation, 80-90 S, 20 m"),
        ("ldem_80s_40m.img", f"{LOLA}/ldem_80s_40m.img", 462080000, "LOLA elevation, 80-90 S, 40 m"),
        ("ldem_80s_80m.img", f"{LOLA}/ldem_80s_80m.img", 115520000, "LOLA elevation, 80-90 S, 80 m"),
        ("ldem_60s_240m.img", f"{LOLA}/ldem_60s_240m.img", 120435200, "LOLA elevation, 60-90 S, 240 m"),
    ],
    "validation": [
        ("avgvisib_85s_060m_201608.img", f"{ILLUM}/AVGVISIB_85S_060M_201608.IMG", 51166728,
         "NASA Goddard average Sun visibility, 85-90 S, 60 m (Mazarico et al. 2011 method)"),
        ("avgvisib_85s_060m_201608_earth.img", f"{ILLUM}/AVGVISIB_85S_060M_201608_EARTH.IMG", 51166728,
         "NASA Goddard average Earth visibility, 85-90 S, 60 m"),
    ],
}


def main(groups):
    for g in groups or SOURCES:
        for rel, url, size, what in SOURCES[g]:
            dst = DATA_DIR / rel
            if dst.exists() and dst.stat().st_size == size:
                print(f"ok      {rel}")
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            print(f"fetch   {rel}  ({size / 1e6:.1f} MB)  {what}")
            urllib.request.urlretrieve(url, dst)
            if dst.stat().st_size != size:
                raise SystemExit(f"size mismatch for {rel}: {dst.stat().st_size} != {size}")


if __name__ == "__main__":
    main(sys.argv[1:])
