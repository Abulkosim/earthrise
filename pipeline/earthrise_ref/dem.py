"""LOLA polar elevation maps.

Default: NASA Goddard's track-adjusted maps (Barker et al. 2021 and 2023), decoded to float32 by
scripts/convert_adj.py: 5 m to 87 S, 20 m to 80 S, 240 m to 60 S. The older PDS mosaics
(int16, height = DN * 0.5 m) are kept for comparison: they carry errors along the laser tracks.
"""
import json
from dataclasses import dataclass
from pathlib import Path
import numpy as np
from . import DATA_DIR
from .proj import ll2xy

NODATA = -1.0e5  # far below any terrain, so it can never form a horizon


@dataclass
class PolarDem:
    path: Path
    n: int  # pixels per side
    res: float  # metres per pixel
    dtype: str = "<i2"  # PDS maps: int16 in 0.5 m steps. Adjusted maps: float32 metres, NaN where empty.
    scale: float = 0.5

    def __post_init__(self):
        self.a = np.memmap(self.path, dtype=self.dtype, mode="r", shape=(self.n, self.n))

    def pix(self, x, y):
        """Map metres -> fractional (row, col) of pixel centres."""
        return self.n / 2 - y / self.res - 0.5, x / self.res + self.n / 2 - 0.5

    def sample(self, x, y):
        """Bilinear height in metres and a mask of points that lie inside the map and have data."""
        r, c = self.pix(x, y)
        ok = (r >= 0) & (r <= self.n - 1) & (c >= 0) & (c <= self.n - 1)
        r, c = np.clip(r, 0, self.n - 1.001), np.clip(c, 0, self.n - 1.001)
        i, j = r.astype(np.int64), c.astype(np.int64)
        fr, fc = r - i, c - j
        a = self.a
        h = (a[i, j] * (1 - fr) * (1 - fc) + a[i + 1, j] * fr * (1 - fc)
             + a[i, j + 1] * (1 - fr) * fc + a[i + 1, j + 1] * fr * fc) * self.scale
        return h, ok & np.isfinite(h)


class NestedDem:
    """Several maps, finest first. A point takes its height from the finest map that covers it."""

    def __init__(self, levels):
        self.levels = levels

    def height_xy(self, x, y):
        x, y = np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64)
        out = np.full(x.shape, NODATA)
        todo = np.ones(x.shape, dtype=bool)
        for lv in self.levels:
            if not todo.any():
                break
            h, ok = lv.sample(x[todo], y[todo])
            idx = np.flatnonzero(todo)
            out.flat[idx[ok]] = h[ok]
            todo.flat[idx[ok]] = False
        return out

    def height(self, lat, lon):
        return self.height_xy(*ll2xy(lat, lon))


PDS = {  # the older mosaics: file, pixels per side, metres per pixel
    "5m": ("ldem_875s_5m.img", 30336, 5.0), "10m": ("ldem_85s_10m.img", 30336, 10.0),
    "20m": ("ldem_80s_20m.img", 30400, 20.0), "40m": ("ldem_80s_40m.img", 15200, 40.0),
    "80m": ("ldem_80s_80m.img", 7600, 80.0), "240m": ("ldem_60s_240m.img", 7760, 240.0),
}
ADJ = {"5m": "ldem_87s_5mpp", "20m": "ldem_80s_20mpp_adj", "240m": "ldem_60s_240mpp_adj"}


def adjusted(key):
    g = json.loads((DATA_DIR / "adj.json").read_text())[ADJ[key]]
    return PolarDem(DATA_DIR / f"{ADJ[key]}.f32", g["cols"], g["res_m"], "<f4", 1.0)


def south(fine="5m"):
    """South-pole stack of the adjusted maps, finest first.

    "5m": 5 m (87-90 S), 20 m (80-90 S), 240 m (60-90 S), the way Barker et al. 2021 nest a 5 m
    map inside coarser ones. "20m": 20 m and 240 m only.
    """
    return NestedDem([adjusted(k) for k in {"5m": ["5m", "20m", "240m"], "20m": ["20m", "240m"]}[fine]])


def south_pds(fine="20m"):
    """The same stack from the older PDS mosaics, for comparison."""
    order = {"5m": ["5m", "10m", "20m", "240m"], "20m": ["20m", "240m"], "40m": ["40m", "240m"], "80m": ["80m", "240m"]}[fine]
    return NestedDem([PolarDem(DATA_DIR / PDS[k][0], PDS[k][1], PDS[k][2]) for k in order])
