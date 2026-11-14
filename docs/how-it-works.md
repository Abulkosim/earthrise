# How Earthrise works

Constants are copied from the code: [app/src/engine/glsl.ts](../app/src/engine/glsl.ts), [app/src/engine/engine.ts](../app/src/engine/engine.ts), [app/src/engine/data.ts](../app/src/engine/data.ts), [app/src/ui/MapView.tsx](../app/src/ui/MapView.tsx), [pipeline/scripts/build_web_data.py](../pipeline/scripts/build_web_data.py), [app/src/model/sitecalc.ts](../app/src/model/sitecalc.ts) and the Python reference in [pipeline/earthrise_ref/](../pipeline/earthrise_ref/).

## Projection and frames

Maps use LOLA's south polar stereographic projection on a sphere of R = 1737400 m: x = 2R tan(π/4 + lat/2) sin(lon), y = 2R tan(π/4 + lat/2) cos(lon). Heights are metres above that sphere. Heights come from NASA Goddard's track-adjusted LOLA maps (below). Sun and Earth vectors come from SPICE (DE440) in MOON_ME, the frame of the LOLA maps, from the Moon's centre with light-time and stellar aberration. The pipeline tabulates them hourly from 2023-01-01 to 2045-01-01; the app interpolates between hours.

## The horizon walk

For a pixel and a direction, the shader follows the great circle q = up cos θ + dir sin θ, θ = t/R, reads the terrain height h_t, and keeps the largest

    tan(elevation) = vert / ((R + h_t) sin θ),   vert = (h_t - h_0) - (R + h_t) × 2 sin²(θ/2)

where h_0 is ground plus mast. Writing 1 - cos θ as 2 sin²(θ/2) matters: the plain form subtracts two radii near 1.7 million metres, which a 32-bit float holds only to about 0.1 m, a third of a degree at 20 m range, more at 5 m. Curvature is in the formula, so far terrain sinks as it should.

## The terrain

NASA Goddard's track-adjusted LOLA maps: LDEM_87S_5MPP (Barker et al. 2021, PGDA product 81; 87 to 90° S at 5 m, from the USGS copy), LDEM_80S_20MPP_ADJ (80 to 90° S at 20 m) and LDEM_60S_240MPP_ADJ (60 to 90° S at 240 m), both Barker et al. 2023, PGDA product 90. The older PDS polar mosaics carry errors along the laser tracks: metre-scale ridges that cast false shadows under a grazing Sun. On the connecting ridge they cut the longest lit period from about 220 days to about 25. The adjusted maps remove them. The PDS mosaics are kept only for comparison (`south_pds()` in the reference model).

`scripts/convert_adj.py` decodes the GeoTIFFs to float grids. `scripts/build_web_data.py` cuts them into 512-pixel tiles:

| Level | Spacing | Source | Extent |
|---|---|---|---|
| t5 | 5 m | LDEM_87S_5MPP | 87 to 90° S |
| t10 | 10 m | LDEM_87S_5MPP, 2 × 2 block mean | 87 to 90° S |
| t20 | 20 m | LDEM_80S_20MPP_ADJ | poleward of 84° S |
| t40, t80 | 40, 80 m | LDEM_80S_20MPP_ADJ, 2 × 2 and 4 × 4 block mean | 80 to 90° S |
| mid | 160 m | LDEM_80S_20MPP_ADJ, 8 × 8 block mean | 80 to 90° S |
| far | 960 m | LDEM_60S_240MPP_ADJ, 4 × 4 block mean | 60 to 90° S |

Tile format: int32 centimetres above 1737.4 km, little-endian, gzip. Each value is stored as its residual from the plane through its left, upper and upper-left neighbours, which is small on smooth ground; the app restores heights with a running sum along rows, then along columns. Empty pixels are the int32 minimum. Centimetres matter at 5 m: a 0.5 m step there is a 6° stair. Tiles with no data are listed in the manifest so the app does not ask for them. The whole set is 2.4 GB.

## Four nested grids and the step schedule

The focus and ring are 2048 × 2048 grids assembled from tiles, snapped to a 256-pixel lattice so small pans reuse them.

- Focus, the finest level that fits: 5 m if the view is at most half of 2048 × 5 m across and inside the 5 m square, else 10 m on the same rule; else 20 m if 1.3 times the view fits and the view lies within the 20 m disc; else 40 m or 80 m on the 1.3 rule. A walk reads it for the first min(10 km, 500 × spacing): 2.5 km at 5 m, 5 km at 10 m, 10 km at 20 m and coarser.
- Ring: around a 5 or 10 m focus, a 20 m grid (40 m when the view is within 20 km of the edge of the 20 m disc). Read up to 10 km.
- Mid: 80 to 90° S at 160 m. Read up to 60 km.
- Far: 60 to 90° S at 960 m. Read beyond.

At each step the walk takes the finest grid whose reach it has not passed and that has data there; missing data falls back to the next coarser grid. This is the nesting Barker et al. 2021 use. A single-point probe takes the finest level that covers the point. The walk ends at 400 km. Each step is max(0.25 × grid spacing, 0.012 × distance). The Python reference nests 5 m, 20 m and 240 m, with 720 directions and a denser schedule (growth 0.004).

## The horizon cache

The map field is about 262,144 pixels. Each stores its horizon in 360 directions, one per degree, in a texture array of 120 RGB10_A2 layers: three directions per layer, 10 bits each, covering -4° up to a top chosen per bake: at least +20° (steps of about 0.023°), and higher when the view reaches latitudes where the Sun or the Earth can stand above that (the colatitude of the farthest corner plus 9°). Steeper horizons clamp to the top, which cannot change a result because neither body reaches it. The bake runs in small tiles so no draw is long enough to reset the GPU.

## Mission evaluation

A second shader steps through time, 96 steps per draw, carrying its state in three RGBA32F textures that are swapped between draws. For each pixel and step:

- Sun: above -4°, the horizon at its azimuth is interpolated between the two nearest degrees and the visible disk fraction is computed (below), times one minus the eclipse fraction. Lit means at least the threshold, 0.5 by default.
- Earth: its direction is taken from the lander, not the Moon's centre. Contact needs the Earth's centre to clear the horizon by the chosen margin and, if asked, a DSN complex that sees the Moon.
- Array: a tracking array gives its rated power times the disk fraction. A fixed array (facing, tilt) also multiplies by the cosine of the angle between its normal and the Sun, the same formula on the GPU and in the site model.
- Battery: charge += (array output − load) × hours, capped at capacity, with the lit or dark load. At zero the lander is dead for the rest of the stay.

Outputs per pixel: mean Sun fraction, longest dark run, contact share, longest silence, lowest charge, hours alive, and the number of steps with any part of the Sun in view. "Where the mission works" passes a pixel when all of these meet the brief (default: 14 days from 3 Nov 2027, 2 m mast, 450 W array, 200 W lit and 40 W dark load, 3000 Wh battery, 1° Earth clearance with DSN; Sun at least 50% of the time, no dark stretch over 72 h, contact at least 30%, battery never empty) and, if the brief asks, permanent shadow is close enough (below). The "light at this moment" layer walks straight toward the Sun and the Earth for one instant, for every screen pixel. That walk is done only when the view and the time are at rest, and for at most about 1.6 million pixels. While time plays, the picture comes from the cached horizons instead: one lookup per pixel at the field's resolution. While the map moves, the last picture is reused and redrawn coarsely about five times a second. No new heavy frame is issued until the GPU has finished the last one.

## Field size

The field starts at 262,144 points (65,536 on touch devices). During a bake the rate between 5% and 12% of the work gives the time for the whole bake; the first few percent are left out because they include shader compiling and tile loading. If the estimate is over 15 s, the bake restarts with as many points as fit in about 8 s, down to 16,384. If a reduced field then bakes in under 2.5 s, it grows toward what the GPU does in about 4 s (at most 8 times, at most 262,144) and is traced again. A fresh load on an M2 Pro ends at 266,256 points in 3.6 s.

## Landing odds and the best place to land

Landers miss their aim point; IM-2 came down 250 m from its target. `landingOdds()` reads the last evaluation back from the GPU and counts, among the field pixels within 500 m of a point, the share that meets the brief. It is the site sheet's tile "If the landing misses". `bestPoint()` builds a summed-area table of the pass mask and scores every passing pixel by the share of passing pixels in a square of side 2 × 500 m around it, the full square always in the denominator so points at the edge of the view do not win by default; ties go to more sunlight. That is "The best place to land" in the Show me menu.

## The disk fraction

The horizon is taken as level across the Sun's disk, at its height in the azimuth of the disk centre (Barker et al. 2021). With z = (horizon − centre elevation) / angular radius, clamped to [-1, 1], the visible fraction is (acos z − z √(1 − z²)) / π. The angular radius is asin(695700 km / distance).

## Earth clearance, DSN and eclipses

The DSN bits mark which of Goldstone (35.4267° N, 243.1105° E), Madrid (40.4314° N, 355.7520° E) and Canberra (35.4014° S, 148.9817° E) sees the Moon at least 10° up, with the IAU_EARTH rotation model and a 6371 km sphere. The eclipse fraction is the overlap of the Earth's and Sun's disks seen from the Moon's centre.

## The landing calendar

After the main run the engine repeats the stay in a second result slot, starting on each day of the 100-day timeline, with 2-hour steps, and records the share of pixels that meet the brief. Interrupted, it resumes; a new view or brief restarts it.

## The long run and permanent shadow

Once per bake, after the stay, `Engine.climate()` runs 18.6 years, one turn of the Moon's orbital plane, from 1 Jan 2023 in 12 h steps (13,587 steps) for every pixel, in a third result slot, at the brief's mast height. It takes about 2 s on an M2 Pro. The mean Sun fraction is the layer "Sunlight over 18.6 years". A pixel with no step in which any part of the Sun's disk clears its horizon is permanent shadow, where ice can last.

The CPU then gives every pixel its distance to the nearest permanent shadow with an exact Euclidean distance transform (Felzenszwalb and Huttenlocher), rows then columns, times the field's cell size. Only shadow inside the view counts. That is the layer "Distance to permanent shadow" (0 to 6 km, the shadow itself black), the hover readout and the site panel's "Nearest permanent shadow".

The brief has a sentence for the science team: permanent shadow within N km of the landing point (off by default; 2 km when switched on). When it is on, the map, the landing calendar, the timeline's landing-window lanes and the site verdict all apply it: a site farther away fails, with the distance given as the reason.

## Single sites

A clicked site gets its own horizon from a probe shader (one column per point, one row per direction, 720 directions, 32-bit output) on the finest grid around it. The CPU then runs the same model in double precision, hourly, keeping the 0.0007° Sun parallax the map ignores. That drives the panorama, time to the next sunset or Earthset, the stay summary and per-site landing windows. The distance to permanent shadow is read from the map's long run at the site's pixel. Sites north of 60.5° S get a smooth-sphere horizon, a dip of acos(R / (R + mast)).

## What is checked against what

- Ephemeris against JPL Horizons, Apollo touchdown Sun elevations and the Blue Ghost eclipse: [pipeline/tests/test_ephemeris.py](../pipeline/tests/test_ephemeris.py).
- Geometry against closed forms (smooth-sphere dip, a ring wall, disk fraction): [pipeline/tests/test_geometry.py](../pipeline/tests/test_geometry.py).
- GPU horizons and two-lunar-day shares against the reference at 24 points, each viewed at 5 m per pixel: [app/verify.html](../app/verify.html), fixtures (fixtures-v2.json) from [pipeline/scripts/make_fixtures.py](../pipeline/scripts/make_fixtures.py).
- Barker et al. 2021, Table 2: `app/verify.html?mode=barker`, `barkerCheck()` in [app/src/checks.ts](../app/src/checks.ts), regions from [pipeline/scripts/make_barker_fixture.py](../pipeline/scripts/make_barker_fixture.py). Seven regions on the connecting ridge, 2,114 pixels at 5 m, each with its own horizon, hourly from 1 Jan 2024 to 1 Jan 2026 at 1 m and 5 m height, against the paper's percentile bounds over 100 terrain clones.
- 18.6-year averages against NASA Goddard's maps, observer on the surface, 12-hour steps: `app/verify.html?mode=goddard`. The validation page's live run also compares permanent shadow: of the points either map never lights, how many the other map never lights too.

Results are in the [README](../README.md).
