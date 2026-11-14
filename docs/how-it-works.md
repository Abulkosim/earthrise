# How Earthrise works

Constants are copied from the code: [app/src/engine/glsl.ts](../app/src/engine/glsl.ts), [app/src/engine/engine.ts](../app/src/engine/engine.ts), [app/src/model/sitecalc.ts](../app/src/model/sitecalc.ts) and the Python reference in [pipeline/earthrise_ref/](../pipeline/earthrise_ref/).

## Projection and frames

Maps use LOLA's south polar stereographic projection on a sphere of R = 1737400 m: x = 2R tan(π/4 + lat/2) sin(lon), y = 2R tan(π/4 + lat/2) cos(lon). Heights are metres above that sphere. Sun and Earth vectors come from SPICE (DE440) in MOON_ME, the frame of the LOLA maps, from the Moon's centre with light-time and stellar aberration. The pipeline tabulates them hourly from 2023-01-01 to 2045-01-01; the app interpolates between hours.

## The horizon walk

For a pixel and a direction, the shader follows the great circle q = up cos θ + dir sin θ, θ = t/R, reads the terrain height h_t, and keeps the largest

    tan(elevation) = vert / ((R + h_t) sin θ),   vert = (h_t - h_0) - (R + h_t) × 2 sin²(θ/2)

where h_0 is ground plus mast. Writing 1 - cos θ as 2 sin²(θ/2) matters: the plain form subtracts two radii near 1.7 million metres, which a 32-bit float holds only to about 0.1 m, a third of a degree at 20 m range. Curvature is in the formula, so far terrain sinks as it should.

## Three nested grids and the step schedule

- Focus: a 2048 × 2048 grid assembled from 512-pixel tiles at 20 m (LDEM_80S_20M, poleward of 84° S), 40 m or 80 m, the finest that covers 1.3 times the view. Used for the first 10 km of a walk.
- Mid: 80 to 90° S at 160 m (2 × 2 block mean of LDEM_80S_80M). Used up to 60 km.
- Far: 60 to 90° S at 960 m (4 × 4 block mean of LDEM_60S_240M). Used beyond.

Missing data falls back to the next coarser grid. The walk ends at 400 km. Each step is max(0.25 × grid spacing, 0.012 × distance), about 660 samples per direction on the 20 m grid. The Python reference uses 720 directions and a denser schedule (growth 0.004).

## The horizon cache

The map field is about 262,144 pixels. Each stores its horizon in 360 directions, one per degree, in a texture array of 120 RGB10_A2 layers: three directions per layer, 10 bits each, covering -4° up to a top chosen per bake: at least +20° (steps of about 0.023°), and higher when the view reaches latitudes where the Sun or the Earth can stand above that (the colatitude of the farthest corner plus 9°). Steeper horizons clamp to the top, which cannot change a result because neither body reaches it. The bake runs in small tiles so no draw is long enough to reset the GPU.

## Mission evaluation

A second shader steps through time, 96 steps per draw, carrying its state in three RGBA32F textures that are swapped between draws. For each pixel and step:

- Sun: above -4°, the horizon at its azimuth is interpolated between the two nearest degrees and the visible disk fraction is computed (below), times one minus the eclipse fraction. Lit means at least the threshold, 0.5 by default.
- Earth: its direction is taken from the lander, not the Moon's centre. Contact needs the Earth's centre to clear the horizon by the chosen margin and, if asked, a DSN complex that sees the Moon.
- Battery: charge += (array W × disk fraction − load) × hours, capped at capacity, with the lit or dark load. At zero the lander is dead for the rest of the stay.

Outputs per pixel: mean Sun fraction, longest dark run, contact share, longest silence, lowest charge, hours alive. "Where the mission works" passes a pixel when all of these meet the brief (default: 14 days from 3 Nov 2027, 2 m mast, 400 W array, 250 W lit and 60 W dark load, 1500 Wh battery, 1° Earth clearance with DSN). The "light at this moment" layer skips the cache and walks straight toward the Sun and the Earth for one instant.

## The disk fraction

The horizon is taken as level across the Sun's disk, at its height in the azimuth of the disk centre (Barker et al. 2021). With z = (horizon − centre elevation) / angular radius, clamped to [-1, 1], the visible fraction is (acos z − z √(1 − z²)) / π. The angular radius is asin(695700 km / distance).

## Earth clearance, DSN and eclipses

The DSN bits mark which of Goldstone (35.4267° N, 243.1105° E), Madrid (40.4314° N, 355.7520° E) and Canberra (35.4014° S, 148.9817° E) sees the Moon at least 10° up, with the IAU_EARTH rotation model and a 6371 km sphere. The eclipse fraction is the overlap of the Earth's and Sun's disks seen from the Moon's centre.

## The landing calendar

After the main run the engine repeats the stay in a second result slot, starting on each day of the 100-day timeline, with 2-hour steps, and records the share of pixels that meet the brief. Interrupted, it resumes; a new view or brief restarts it.

## Single sites

A clicked site gets its own horizon from a probe shader (one column per point, one row per direction, 720 directions, 32-bit output) on the finest grid around it. The CPU then runs the same model in double precision, hourly, keeping the 0.0007° Sun parallax the map ignores. That drives the panorama, time to the next sunset or Earthset, the stay summary and per-site landing windows. Sites north of 60.5° S get a smooth-sphere horizon, a dip of acos(R / (R + mast)).

## What is checked against what

- Ephemeris against JPL Horizons, Apollo touchdown Sun elevations and the Blue Ghost eclipse: [pipeline/tests/test_ephemeris.py](../pipeline/tests/test_ephemeris.py).
- Geometry against closed forms (smooth-sphere dip, a ring wall, disk fraction): [pipeline/tests/test_geometry.py](../pipeline/tests/test_geometry.py).
- GPU horizons and two-lunar-day shares against the reference at 24 points: [app/verify.html](../app/verify.html), fixtures from [pipeline/scripts/make_fixtures.py](../pipeline/scripts/make_fixtures.py).
- 18.6-year averages against NASA Goddard's maps, observer on the surface, 12-hour steps: `app/verify.html?mode=goddard`.

Results are in the [README](../README.md).
