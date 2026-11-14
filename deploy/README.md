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

## On your own server

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

## On GitHub Pages

`.github/workflows/pages.yml` builds and publishes the app on every push to
`main`, reading the data from the `earthrise-data` repository's own Pages site.
Pages on a private repository needs a paid GitHub plan; the workflow is
disabled while the repositories are private. With the adjusted terrain the data is 2.4 GB, over
GitHub Pages' size limit for a site, so the team's own server is the way to
host it.

## What the server must not do

Do not let the server unzip or re-encode the `.bin.gz` files. The app expects
the gzip bytes and unpacks them itself. (If a host does unzip them on the way,
the app notices and carries on.)
