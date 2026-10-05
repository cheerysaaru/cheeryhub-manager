# Personal Productivity Manager

A full-stack personal productivity system: React + Vite frontend, Express + TypeScript backend, Prisma ORM, SQLite for local development, and PostgreSQL for production. Includes email verification, PWA install, and real-time sync over Socket.IO.

## Structure

- `frontend/` — React client (design system, pages, hooks, services)
- `backend/` — Express API (auth, resources, analytics, settings, Socket.IO)
- `prisma/` — schema, migrations, seed script
- `.env.example` — environment variable template

## Getting started

1. Install Node.js 22+.
2. Copy `.env.example` to `backend/.env` (SQLite `DATABASE_URL`, a long random `JWT_SECRET`, `FRONTEND_URL=http://localhost:5173`).
3. Optional: set `VITE_API_URL=http://localhost:4000/api` in `frontend/.env`.
4. Install dependencies: `npm install`.
5. Apply migrations and generate the client: `npm run db:migrate`, `npm run db:generate`.
6. Seed a starter account (optional): `SEED_EMAIL=you@example.com SEED_PASSWORD="use-a-long-password" npm run db:seed`.
7. Start both apps: `npm run dev`.

- Frontend: `http://localhost:5173/personal-productivity-manager/`
- Backend: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

Default seed login (development only): `you@example.com` / password from `SEED_PASSWORD` (or `change-this-password`).

## Environment

Variables are validated with Zod at startup — the server **exits with a readable message** (variable names only, never values) if `JWT_SECRET` or `DATABASE_URL` is missing/invalid, and `GET /api/health` reports which variables are set as booleans. Templates: [`.env.example`](.env.example) (local) and [`backend/.env.example`](backend/.env.example) (full inventory).

| Variable | Required | Where it is read | Default |
| --- | --- | --- | --- |
| `JWT_SECRET` | yes (32+ chars, not the template placeholder) | Node server + Worker (secret) | — |
| `DATABASE_URL` | Node server only (Worker uses the D1 binding) | `prisma/schema.prisma`, boot check | — |
| `NODE_ENV` | no | both | `development` |
| `PORT` | no | Node server | `4000` |
| `FRONTEND_URL` | no | CORS + Socket.IO + Helmet `connect-src` (comma-separated origins) | `http://localhost:5173` |
| `APP_URL` | no | links in outgoing email | first `FRONTEND_URL` origin |
| `EMAIL_API_KEY` | optional | Resend; email silently skipped when unset | — |
| `EMAIL_FROM` | no | Resend sender | `Productivity <onboarding@resend.dev>` |
| `COOKIE_SECURE` / `COOKIE_SAME_SITE` / `COOKIE_DOMAIN` | no | auth cookie | `production→secure`, `lax` |
| `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_MAX`, `REGISTER_RATE_LIMIT_MAX` | no | rate limiter | see `backend/.env.example` |
| `VITE_API_URL` | frontend build | browser → API base URL | `http://localhost:4000/api` (fail-fast if unset in a production build) |
| `VITE_BASE` | frontend build | GitHub Pages base path | `/` |

How each platform supplies them:

- **Cloudflare Worker (production API):** `npx wrangler secret put JWT_SECRET` and `npx wrangler secret put EMAIL_API_KEY` for secrets; non-secret values live in `backend/wrangler.toml` `[vars]`. The worker validates its environment on cold start and fails loudly if `JWT_SECRET` is missing.
- **Local / systemd (Node):** `backend/.env` (root `.env` is also read). systemd uses `EnvironmentFile=backend/.env` ([deploy/cheeryhub-api.service](deploy/cheeryhub-api.service)).
- **Vercel (frontend):** project env var `VITE_API_URL=https://api.cheeryhub.space/api`.
- **CyberPanel (frontend):** GitHub Actions variable or secret `VITE_API_URL`; `.github/workflows/deploy.yml` builds the SPA and deploys only `frontend/dist/`.

Errors returned by the API always carry `{ error, code, requestId }`; the same `requestId` appears in server logs and in the `X-Request-Id` response header.

## Features

- Tasks, habits, goals + milestones, skills, reminders, brand projects, finance transactions, journal, focus timer, XP, analytics
- Email verification on register (Resend in production; dev mode logs the link to the backend console)
- Offline queue + service worker (PWA / Add to Home Screen on iPhone)
- Socket.IO rooms per user for live updates across tabs/devices
- Responsive design system with accessible controls

## API

Authentication uses bcrypt password hashes and an HTTP-only JWT cookie. Protected routes require a session; all resource queries are scoped to the session user. `DELETE` for tasks and habits is a soft delete.

Main routes: `/api/health` (status + config presence), `/api/auth/*` (register, login, logout, refresh, me, forgot, reset, verify-email, resend-verification), CRUD for `tasks`, `habits`, `goals`, `skills`, `reminders`, `brand`, `transactions`, plus completion/check-in/timer, goal/brand milestones, focus, journal, XP, settings, analytics, and backup export/import. Responses use `{ data: ... }` on success and `{ error, code?, requestId? }` on failure.

Sessions: the auth cookie lasts 7 days; `POST /api/auth/refresh` re-issues it from an expired-but-validly-signed token (and refuses tokens from before a password change). The frontend calls it automatically once after a `401` before asking the user to sign in again.

Reliability: outbound calls (email provider) use a timeout + exponential backoff + circuit breaker; clients retry `429`/network failures with `Retry-After` awareness; rate-limited responses are JSON (`{ error, code: "RATE_LIMITED", retryAfterSeconds }`) and are keyed by the real client IP (`CF-Connecting-IP` / last `X-Forwarded-For` entry), so one client cannot exhaust another's quota.

## Testing

```bash
npm test           # unit tests (vitest) + typecheck backend & frontend
npm run test:unit  # unit tests only
npm run build
```

Secret scan (CI/local):

```bash
npx gitleaks git --redact --verbose .   # whole history; never prints found secrets
```

## Production

- **CyberPanel frontend:** `.github/workflows/deploy.yml` builds the SPA using the required HTTPS `VITE_API_URL` Actions variable/secret, then syncs only `frontend/dist/` (including `.htaccess`) to `public_html`. The smoke test checks the HTML root, API health, and that `/.git/config` is forbidden.
- **CyberPanel Node backend:** backend and Prisma files are synced to `/home/cheeryhub.space/app/`, outside the document root. The documented systemd service binds to `127.0.0.1`; OpenLiteSpeed/CyberPanel exposes the API over HTTPS. CORS and Helmet `connect-src` use `FRONTEND_URL`. See [deploy/DEPLOY.md](deploy/DEPLOY.md) for host-key secrets, runtime setup, and data-preserving deployment steps.
- **Existing Worker configuration:** `backend/wrangler.toml` still configures `api.cheeryhub.space` as a Cloudflare Worker custom domain, and `.github/workflows/deploy-backend.yml` still deploys it. Before routing that same hostname to the CyberPanel Node service, move it off the Worker deliberately; do not run both backends behind the same API URL.
- Production database migrations are not part of the deployment workflow. Keep the database and backend `.env` on the server and outside `public_html`; review and back up the database before separately approved schema changes.
