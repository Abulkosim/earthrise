# Deploying Earthrise

Earthrise is a static site: HTML, JavaScript, and about 390 MB of prepared data
files. Any static file server works. Nothing runs on the server.

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
disabled while the repositories are private.

## What the server must not do

Do not let the server unzip or re-encode the `.bin.gz` files. The app expects
the gzip bytes and unpacks them itself. (If a host does unzip them on the way,
the app notices and carries on.)
