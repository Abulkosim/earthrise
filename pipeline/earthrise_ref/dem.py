"""LOLA polar elevation maps (PDS IMG: little-endian int16, height = DN * 0.5 m above 1737.4 km)."""
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

    def __post_init__(self):
        self.a = np.memmap(self.path, dtype="<i2", mode="r", shape=(self.n, self.n))

    def pix(self, x, y):
        """Map metres -> fractional (row, col) of pixel centres."""
        return self.n / 2 - y / self.res - 0.5, x / self.res + self.n / 2 - 0.5

    def sample(self, x, y):
        """Bilinear height in metres and a mask of points inside the map."""
        r, c = self.pix(x, y)
        ok = (r >= 0) & (r <= self.n - 1) & (c >= 0) & (c <= self.n - 1)
        r, c = np.clip(r, 0, self.n - 1.001), np.clip(c, 0, self.n - 1.001)
        i, j = r.astype(np.int64), c.astype(np.int64)
        fr, fc = r - i, c - j
        a = self.a
        h = (a[i, j] * (1 - fr) * (1 - fc) + a[i + 1, j] * fr * (1 - fc)
             + a[i, j + 1] * (1 - fr) * fc + a[i + 1, j + 1] * fr * fc) * 0.5
        return h, ok


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


def south(fine="20m"):
    """South-pole stack: a fine map poleward of 80 S, the 240 m map out to 60 S."""
    spec = {"20m": ("ldem_80s_20m.img", 30400, 20.0), "40m": ("ldem_80s_40m.img", 15200, 40.0),
            "80m": ("ldem_80s_80m.img", 7600, 80.0)}[fine]
    return NestedDem([PolarDem(DATA_DIR / spec[0], spec[1], spec[2]),
                      PolarDem(DATA_DIR / "ldem_60s_240m.img", 7760, 240.0)])
