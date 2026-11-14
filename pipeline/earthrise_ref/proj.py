"""South polar stereographic projection used by the LOLA polar maps.

Spherical, radius 1737.4 km, true scale at the pole, longitude 0 pointing up (+y).
    x = 2R tan(pi/4 + lat/2) sin(lon)
    y = 2R tan(pi/4 + lat/2) cos(lon)
Angles are radians, distances metres.
"""
import numpy as np
from . import R_MOON


def ll2xy(lat, lon):
    r = 2 * R_MOON * np.tan(np.pi / 4 + lat / 2)
    return r * np.sin(lon), r * np.cos(lon)


def xy2ll(x, y):
    lat = 2 * np.arctan(np.hypot(x, y) / (2 * R_MOON)) - np.pi / 2
    return lat, np.arctan2(x, y)


def unit(lat, lon):
    """Body-fixed unit vector of a point."""
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def enu(lat, lon):
    """Local up, east and north unit vectors at a point (scalars in, 3-vectors out)."""
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    return up, east, np.cross(up, east)
