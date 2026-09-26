# Deploying the backend to the CyberPanel server

Your GitHub Pages frontend is already correct — it builds with
`VITE_API_URL=https://api.cheeryhub.space/api` (see `frontend/.env.production`).
The only missing piece is a **running backend** on `api.cheeryhub.space`
(46.250.227.248). Right now that server still shows the default
"CyberPanel Installed" placeholder and answers `404` for every `/api/*` call,
which is why the site reports "Cannot reach the server / VITE_API_URL".

```
GitHub Pages (frontend)  ──HTTPS──▶  api.cheeryhub.space  ──proxy──▶  127.0.0.1:4000 (Express)
cheerysaaru.github.io                                   (LiteSpeed)      SQLite prisma/dev.db
```

## 0. Prerequisites

- SSH as `root` on the server (`api.cheeryhub.space` → 46.250.227.248)
- DNS already correct: `A api.cheeryhub.space → 46.250.227.248` ✅

## 1. Get the code on the server

Either clone (repo must be reachable by the server):

```bash
git clone https://github.com/cheerysaaru/cheeryhub-manager.git /opt/cheeryhub
```

or upload this repo (without `node_modules/`) via SFTP to `/opt/cheeryhub`.

## 2. Run the bootstrap script

```bash
cd /opt/cheeryhub
sudo bash deploy/setup-server.sh
```

It will: install Node 22 if missing → `npm ci` → `prisma generate` →
build the backend → create `backend/.env` (auto-generated `JWT_SECRET`,
`FRONTEND_URL=https://cheerysaaru.github.io`, `COOKIE_SAME_SITE=none`,
`COOKIE_SECURE=true`) → apply migrations → install + start the
`cheeryhub-api` systemd service → smoke-test `http://127.0.0.1:4000/api/health`.

Already have an existing `prisma/dev.db` with tables? Run with
`SKIP_MIGRATE=1 sudo -E bash deploy/setup-server.sh`.

## 3. Attach the reverse proxy in CyberPanel

1. **Websites → Create Website** → domain `api.cheeryhub.space`, package
   "Default", PHP (any). This replaces the placeholder page.
2. **Websites → (click the site) → Reverse Proxy → Add Reverse Proxy**
   - Source: `https://api.cheeryhub.space` (or `/`)
   - Target: `http://127.0.0.1:4000`
3. **Websites → SSL → Issue SSL** (Let's Encrypt) for `api.cheeryhub.space`,
   then enable **Force HTTPS**.
4. Restart the web server:

   ```bash
   systemctl restart lsws
   ```

If your CyberPanel build has no Reverse Proxy UI, edit the vhost config
(`/usr/local/lsws/conf/vhosts/api.cheeryhub.space/vhconf.conf`) and add a
proxy context, then `systemctl restart lsws`:

```
context / {
  type            proxy
  location        http://127.0.0.1:4000
  host            127.0.0.1
  port            4000
}
```

> Socket.IO uses WebSocket first and automatically falls back to HTTP
> long-polling, so realtime sync keeps working even if the proxy does not
> forward the WebSocket upgrade.

## 4. Verify

```bash
bash deploy/verify.sh
```

Expected: health `200 {"status":"ok"}`, CORS preflight echoing
`access-control-allow-origin: https://cheerysaaru.github.io`, `/api/tasks`
→ `401`, and `/` → `404` (placeholder gone).

## 5. Done

Open <https://cheerysaaru.github.io/cheeryhub-manager/> — no frontend rebuild
is needed, the API URL is already baked into the Pages build.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/` still shows "CyberPanel Installed" | Reverse proxy not attached, or website not created (step 3) |
| `502`/`504` from the domain | `systemctl status cheeryhub-api` and `journalctl -u cheeryhub-api -n 50 --no-pager` |
| `{"error":"CORS: Origin not allowed"}` | `FRONTEND_URL` in `backend/.env` must be exactly `https://cheerysaaru.github.io` (no trailing slash), then `systemctl restart cheeryhub-api` |
| Login works locally but not on Pages | Cookies need `COOKIE_SAME_SITE=none` + `COOKIE_SECURE=true` (cross-site), already set by the script |
| DB errors | `cd /opt/cheeryhub && sudo -u cheeryhub npx prisma migrate deploy --schema=prisma/schema.prisma` |
| Socket never connects | Check proxy passes `Upgrade`/`Connection` headers; polling fallback still keeps the app usable |

## Local smoke test (no server needed)

```bash
# terminal 1
npm run dev --workspace backend
# terminal 2
bash deploy/verify.sh http://127.0.0.1:4000
```
