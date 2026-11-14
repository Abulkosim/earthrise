"""Terrain horizon seen from a point on the Moon.

For each azimuth we walk outward along the great circle, read the terrain height
and keep the largest elevation angle. The geometry is exact on the sphere, so the
drop of the surface with distance is included. This follows the horizon method of
Mazarico et al. 2011 and Barker et al. 2021 (720 azimuths, nested maps).
"""
import numpy as np
from . import R_MOON
from .proj import enu


def distances(d0, dmax, growth):
    """Sample distances: start at d0, grow by `growth` per step, never step less than d0."""
    d = [d0]
    while d[-1] < dmax:
        d.append(d[-1] + max(d0, d[-1] * growth))
    return np.array(d)


def elevation(h_obs, h_t, theta):
    """Elevation angle (rad) of a terrain point at central angle theta, heights above the sphere.

    Written so that it stays accurate in single precision too:
    vertical = (h_t - h_obs) - (R + h_t) * 2 sin^2(theta/2).
    """
    vert = (h_t - h_obs) - (R_MOON + h_t) * 2 * np.sin(theta / 2) ** 2
    horiz = (R_MOON + h_t) * np.sin(theta)
    return np.arctan2(vert, horiz)


def horizon(dem, lat, lon, mast=2.0, naz=720, d0=20.0, dmax=400e3, growth=0.004):
    """Horizon profile at (lat, lon) in radians, for an observer `mast` metres above the ground.

    Returns azimuths (deg, clockwise from north), horizon elevation (deg), ground height (m)
    and the distance (m) of the terrain that forms the horizon in each direction.
    """
    up, east, north = enu(lat, lon)
    h0 = float(dem.height(np.array([lat]), np.array([lon]))[0])
    az = np.arange(naz) * 2 * np.pi / naz
    d = distances(d0, dmax, growth)
    th = d / R_MOON
    t = np.cos(az)[:, None] * north + np.sin(az)[:, None] * east
    q = np.cos(th)[None, :, None] * up + np.sin(th)[None, :, None] * t[:, None, :]
    hq = dem.height(np.arcsin(np.clip(q[..., 2], -1, 1)), np.arctan2(q[..., 1], q[..., 0]))
    el = elevation(h0 + mast, hq, th[None, :])
    k = el.argmax(axis=1)
    return np.degrees(az), np.degrees(el.max(axis=1)), h0, d[k]
