"""Geometry checks that need no data files."""
import numpy as np
from earthrise_ref import R_MOON
from earthrise_ref.horizon import horizon, elevation
from earthrise_ref.proj import ll2xy, xy2ll
from earthrise_ref.visibility import disk_fraction, longest_run


class Flat:
    """A Moon with no relief."""

    def height(self, lat, lon):
        return np.zeros(np.shape(lat))


class Wall(Flat):
    """A 1 km plateau everywhere north of 80 S latitude ... seen from the pole it is a ring wall."""

    def height(self, lat, lon):
        return np.where(np.degrees(lat) > -89.0, 1000.0, 0.0)


def test_projection_round_trip():
    lat, lon = np.radians(-85.3), np.radians(137.2)
    la, lo = xy2ll(*ll2xy(lat, lon))
    assert abs(la - lat) < 1e-12 and abs(lo - lon) < 1e-12


def test_projection_matches_lola_label():
    # LDEM_80S: the 80 S parallel lies 304 km from the pole (7600 px * 80 m / 2).
    x, y = ll2xy(np.radians(-80.0), 0.0)
    assert abs(x) < 1e-6 and abs(y - 304000.0) < 60.0


def test_smooth_sphere_horizon_is_the_dip_angle():
    """From height h above a smooth sphere the horizon lies acos(R/(R+h)) below level."""
    for h in (2.0, 100.0, 2000.0):
        _, el, _, _ = horizon(Flat(), np.radians(-89.0), 0.3, mast=h, naz=8, d0=5.0, dmax=600e3, growth=0.002)
        dip = -np.degrees(np.arccos(R_MOON / (R_MOON + h)))
        assert np.abs(el - dip).max() < 2e-3, (h, el, dip)


def test_ring_wall_elevation():
    """A 1 km wall 1 deg of arc away, from the pole: closed form."""
    _, el, _, _ = horizon(Wall(), np.radians(-90.0 + 1e-7), 0.0, mast=0.0, naz=4, d0=5.0, dmax=200e3, growth=0.0005)
    theta = np.radians(1.0)
    want = np.degrees(elevation(0.0, 1000.0, theta))
    assert np.abs(el - want).max() < 5e-3


def test_disk_fraction():
    assert disk_fraction(0.0, 0.0, 0.27) == 0.5
    assert disk_fraction(1.0, 0.0, 0.27) == 1.0
    assert disk_fraction(-1.0, 0.0, 0.27) == 0.0
    # a cut at half a radius below centre leaves 80.45 % visible
    assert abs(disk_fraction(0.135, 0.0, 0.27) - 0.80450) < 1e-4


def test_longest_run():
    assert longest_run([0, 1, 1, 0, 1, 1, 1, 0]) == 3
    assert longest_run([0, 0]) == 0
