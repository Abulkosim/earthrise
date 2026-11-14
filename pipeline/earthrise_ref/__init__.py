"""Reference model for Earthrise.

Sun and Earth as seen from the lunar surface, against the real terrain horizon.
Ephemeris comes from SPICE (DE440, MOON_ME frame), terrain from LOLA gridded maps.
This package is the ground truth the browser engine is tested against.

Written with AI assistance (Claude); see the README for how AI was used.
"""
import os
from pathlib import Path

R_MOON = 1737400.0  # m, LOLA reference sphere
R_SUN_KM = 695700.0
R_EARTH_KM = 6371.0

DATA_DIR = Path(os.environ.get("EARTHRISE_DATA", Path(__file__).resolve().parents[3] / "earthrise-data"))
