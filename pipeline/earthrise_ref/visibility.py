"""How much of a disk (Sun or Earth) stands above the terrain horizon."""
import numpy as np


def disk_fraction(el_centre, el_horizon, radius):
    """Visible fraction of a disk cut by a level horizon.

    The horizon is taken as flat across the disk, at its elevation in the azimuth of the
    disk centre. This is the cut used by Barker et al. 2021. All angles in the same unit.
    """
    z = np.clip((el_horizon - el_centre) / radius, -1.0, 1.0)
    return (np.arccos(z) - z * np.sqrt(1 - z * z)) / np.pi


def horizon_at(az, haz, hel):
    """Horizon elevation at azimuth(s) az, linear between profile samples (degrees)."""
    return np.interp(az, haz, hel, period=360.0)


def longest_run(mask):
    """Length of the longest run of True values."""
    m = np.concatenate([[0], np.asarray(mask, dtype=np.int8), [0]])
    d = np.diff(m)
    s, e = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
    return int((e - s).max()) if len(s) else 0
