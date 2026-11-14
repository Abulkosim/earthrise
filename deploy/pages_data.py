# Written with AI assistance (Claude); see the README.
"""Lays the built data out for GitHub Pages.

GitHub Pages holds 1 GB a site and the data is 2.4 GB, so it goes to four repositories, each with
its own Pages site:

  earthrise-data        manifest, ephemeris, validation files, terrain at 960, 160, 80 and 40 m
  earthrise-data-20m    terrain tiles at 20 m and 10 m
  earthrise-data-5m-a   the first half of the 5 m tiles, by tile row
  earthrise-data-5m-b   the second half

The manifest written to earthrise-data says where each level lives (see `base` and `bases` in
app/src/engine/data.ts). Files are cloned, not copied, where the file system allows it.

  python deploy/pages_data.py [built data folder] [output folder] [user or organisation]
"""
import json
import os
import shutil
import sys
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else "app/public/data").resolve()
out = Path(sys.argv[2] if len(sys.argv) > 2 else "../earthrise-pages-data").resolve()
owner = (sys.argv[3] if len(sys.argv) > 3 else "abulkosim").lower()
site = f"https://{owner}.github.io/"
LIMIT = 1000 * 2**20


def put(path: Path, repo: str):
    dst = out / repo / path.relative_to(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if path.is_dir():
        shutil.copytree(path, dst, dirs_exist_ok=True)
    else:
        shutil.copy2(path, dst)


for name in ("ephem.bin", "fixtures-v2.json", "validation", "dem/far.bin.gz", "dem/mid.bin.gz", "dem/t80", "dem/t40"):
    put(src / name, "earthrise-data")
for name in ("dem/t20", "dem/t10"):
    put(src / name, "earthrise-data-20m")

# the 5 m tiles: cut at the tile row that halves the bytes
rows: dict[int, int] = {}
tiles = sorted((src / "dem/t5").iterdir())
for f in tiles:
    r = int(f.name.split("_")[0])
    rows[r] = rows.get(r, 0) + f.stat().st_size
half, acc, split = sum(rows.values()) / 2, 0, 0
for r in sorted(rows):
    acc += rows[r]
    if acc >= half:
        split = r + 1
        break
for f in tiles:
    put(f, "earthrise-data-5m-a" if int(f.name.split("_")[0]) < split else "earthrise-data-5m-b")

m = json.loads((src / "manifest.json").read_text())
t = m["dem"]["tiles"]
t["t20"]["base"] = t["t10"]["base"] = site + "earthrise-data-20m/"
t["t5"]["bases"] = {"split_row": split, "urls": [site + "earthrise-data-5m-a/", site + "earthrise-data-5m-b/"]}
m["dem"]["hosting"] = ("GitHub Pages holds 1 GB a site, so the tiles are spread over four sites. A level with \"base\" "
                       "is fetched from there; t5 rows below \"split_row\" come from the first of \"bases.urls\", the "
                       "rest from the second. Everything else sits beside this manifest.")
for k in ("sun", "earth"):  # the full-size comparison maps are not published; the page uses the crops
    m["validation"].pop(k, None)
(out / "earthrise-data" / "manifest.json").write_text(json.dumps(m, indent=1))

for repo in ("earthrise-data", "earthrise-data-20m", "earthrise-data-5m-a", "earthrise-data-5m-b"):
    (out / repo / ".nojekyll").write_text("")  # serve the files as they are
    size = sum(f.stat().st_size for f in (out / repo).rglob("*") if f.is_file() and ".git" not in f.parts)
    print(f"{repo}: {size / 2**20:.0f} MB{'  OVER THE 1 GB LIMIT' if size > LIMIT else ''}")
print(f"5 m tiles cut at row {split}")
