# Deploying Earthrise

Earthrise is a static site: HTML, JavaScript, and 2.4 GB of prepared data
files. Any static file server works. Nothing runs on the server.

The data is built by `pipeline/scripts/build_web_data.py` (see "Run it
yourself" in the [README](../README.md)) from NASA Goddard's track-adjusted LOLA
elevation maps, the SPICE ephemeris and Goddard's visibility maps. Most of it
is terrain tiles: about 1.2 GB at 5 m, 373 MB at 10 m, 388 MB at 20 m, 348 MB
at 40 m, 97 MB at 80 m. The app loads only the tiles around the view, so a
visitor downloads a small part of it. Copy all of `app/public/data` to the
server; the first upload takes a while.

## On GitHub Pages (how the team hosts it)

The app is at https://abulkosim.github.io/earthrise/. GitHub Pages is free for public repositories and
holds 1 GB a site, and the data is 2.4 GB, so the data lives in four
repositories, each with its own Pages site:

| Repository | Holds | Size |
|---|---|---|
| `earthrise-data` | manifest, ephemeris, validation files, terrain at 960, 160, 80 and 40 m | 0.5 GB |
| `earthrise-data-20m` | terrain tiles at 20 m and 10 m | 0.8 GB |
| `earthrise-data-5m-a` | the first half of the 5 m tiles (tile rows 0 to 38) | 0.6 GB |
| `earthrise-data-5m-b` | the second half | 0.6 GB |

The manifest in `earthrise-data` says where each level lives; the app reads
that (`base` and `bases` in `app/src/engine/data.ts`), so nothing about the
hosting is built into the app.

1. Build the data (see "Run it yourself" in the [README](../README.md)).
2. Lay it out: `python deploy/pages_data.py app/public/data ../earthrise-pages-data`.
3. Commit each of the four folders to its repository (a branch, then a pull
   request, as for code).
4. Make the five repositories public. Pages on a private repository needs a
   paid GitHub plan.
5. Run `deploy/go-live.sh`. It turns Pages on for the four data repositories,
   enables and runs `.github/workflows/pages.yml` (which builds the app with
   `VITE_DATA_BASE` set to the `earthrise-data` site), and waits until the app
   and one file from every data site answer.

After that the workflow publishes the app on every push to `main`.

## On your own server (the other way)

1. Point a domain at the server (an A record).
2. Install [Caddy](https://caddyserver.com/docs/install) on the server. It gets
   the HTTPS certificate by itself.
3. From your machine, with the data already built in `app/public/data`:

   ```sh
   deploy/deploy.sh user@your.server
   ```

4. On the server, copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, replace
   `{$DOMAIN:localhost}` with your domain, and run `sudo systemctl reload caddy`.

The site needs HTTPS only for the "Copy a link" button (browsers restrict the
clipboard to secure pages). Everything else works over plain HTTP too.

## What the server must not do

Do not let the server unzip or re-encode the `.bin.gz` files. The app expects
the gzip bytes and unpacks them itself. (If a host does unzip them on the way,
the app notices and carries on.)
