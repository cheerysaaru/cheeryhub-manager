# CyberPanel deployment

The GitHub Actions workflow deploys the compiled SPA to
`/home/cheeryhub.space/public_html/`. It deploys the Node backend, Prisma
schema, package manifests, and systemd unit to
`/home/cheeryhub.space/app/`, outside the document root. The frontend build
copies `frontend/public/.htaccess` into `frontend/dist/` for SPA route fallback.

## GitHub Actions configuration

Configure these repository secrets:

- `HOST`: CyberPanel SSH host.
- `SSH_KEY`: private deployment key.
- `SSH_KNOWN_HOSTS`: the verified known-hosts line for the server on SSH port
  `69` (for example, `[host.example]:69 ssh-ed25519 AAAA...`). Obtain the host
  key and verify its fingerprint through the hosting provider or another
  trusted channel before saving it. The workflow requires strict host-key
  checking and does not use `ssh-keyscan`.

The workflows default `VITE_API_URL` to
`https://api.cheeryhub.space/api`. To change it without editing workflow
files, configure `VITE_API_URL` as a GitHub Actions **variable** (recommended)
or secret. The CyberPanel deploy workflow fails before building if the value
is not HTTPS, does not end in `/api`, or is a placeholder.
`CYBERPANEL_SITE_URL` is an optional Actions variable; it defaults to
`https://cheeryhub.space` and is used by the post-deploy checks.

Deploy runs for pushes to `main` and can also be started manually. Review the
branch and configured secrets before using manual dispatch.

## Backend runtime and HTTPS proxy

Run one backend instance under systemd. Create the application environment file
on the server at
`/home/cheeryhub.space/app/backend/.env`; it is intentionally excluded from
every sync. Keep `JWT_SECRET` and the existing production `DATABASE_URL` there,
with at least:

```dotenv
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://cheeryhub.space
APP_URL=https://cheeryhub.space
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

Add any other required application settings to that file. `FRONTEND_URL` is
also the CORS allow-list and the source for Helmet's `connect-src` directive;
use a comma-separated list of exact HTTPS frontend origins if there is more
than one. Do not use `*` for credentialed CORS. The Node server binds only to
`127.0.0.1`, so it is not directly reachable from the public network.

Install Node.js 22+, then install/build the application as the service user
without running migrations:

```bash
cd /home/cheeryhub.space/app
npm ci
npx prisma generate --schema=prisma/schema.prisma
npm run build --workspace backend
```

The workflow's current SSH account is `cheer2867`; it can also be used as the
systemd service user so it can read the deployed files and the server-only
environment file. Install the deployed systemd unit:

```bash
sudo install -d /home/cheeryhub.space/app
sudo chmod 600 /home/cheeryhub.space/app/backend/.env
sudo sed \
  -e 's|__APP_DIR__|/home/cheeryhub.space/app|g' \
  -e 's|__SERVICE_USER__|cheer2867|g' \
  /home/cheeryhub.space/app/deploy/cheeryhub-api.service \
  | sudo tee /etc/systemd/system/cheeryhub-api.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now cheeryhub-api
```

For subsequent backend releases, build as the service user and restart the unit
after the workflow has synced the files:

```bash
cd /home/cheeryhub.space/app
npm ci
npx prisma generate --schema=prisma/schema.prisma
npm run build --workspace backend
sudo systemctl restart cheeryhub-api
```

Expose the API over HTTPS using either an `api` subdomain or an OpenLiteSpeed
proxy context. In CyberPanel, point the API virtual host at
`http://127.0.0.1:4000`, issue/enable a valid TLS certificate, and force HTTPS.
If configuring the proxy directly, preserve HTTP/1.1 `Upgrade` and `Connection`
headers for Socket.IO WebSockets. Never expose port 4000 publicly.

The existing `api.cheeryhub.space` is also configured as a Cloudflare Worker
custom domain in `backend/wrangler.toml`. Before routing that hostname to this
Node service, deliberately move the hostname off the Worker; do not run two
production backends with separate session secrets behind the same API URL.

## Database and deployment safety

The workflow only transfers built frontend files and application source. It
does not execute Prisma migrations, seed data, create/replace a database,
restart services, or use `rsync --delete`. Both rsync transfers of app code
exclude `.env`, database files, `node_modules`, and `uploads`; the web root
receives only `frontend/dist/` (including `.htaccess`). The `.htaccess` rules
also deny requests for repository metadata, source directories, environment
files, uploads, and database files that may have been left by an earlier
deployment. Keep production database files outside `public_html` and preserve
the existing database URL.

Do not run `prisma migrate deploy` as part of routine code deployment. Review
and back up the live database before any separately approved schema migration.
The deployment does not synchronize or replace user data.

## Post-deploy smoke checks

The workflow calls `deploy/verify.sh` after syncing. It checks that:

1. `GET $CYBERPANEL_SITE_URL/` returns `200` and an HTML document.
2. `GET $VITE_API_URL/health` returns `200`.
3. `GET $CYBERPANEL_SITE_URL/.git/config` returns `404` or `403`.

Run the same checks manually with:

```bash
bash deploy/verify.sh https://cheeryhub.space https://api.cheeryhub.space/api
```
