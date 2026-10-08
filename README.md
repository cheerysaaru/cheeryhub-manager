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

| Variable                                                                                 | Required                                      | Where it is read                                                  | Default                                                                                       |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                                                             | yes (32+ chars, not the template placeholder) | Node server + Worker (secret)                                     | —                                                                                             |
| `DATABASE_URL`                                                                           | Node server only (Worker uses the D1 binding) | `prisma/schema.prisma`, boot check                                | —                                                                                             |
| `NODE_ENV`                                                                               | no                                            | both                                                              | `development`                                                                                 |
| `PORT`                                                                                   | no                                            | Node server                                                       | `4000`                                                                                        |
| `FRONTEND_URL`                                                                           | no                                            | CORS + Socket.IO + Helmet `connect-src` (comma-separated origins) | `http://localhost:5173`                                                                       |
| `APP_URL`                                                                                | no                                            | links in outgoing email                                           | first `FRONTEND_URL` origin                                                                   |
| `EMAIL_API_KEY`                                                                          | optional                                      | Resend; email silently skipped when unset                         | —                                                                                             |
| `EMAIL_FROM`                                                                             | no                                            | Resend sender                                                     | `Productivity <onboarding@resend.dev>`                                                        |
| `COOKIE_SECURE` / `COOKIE_SAME_SITE` / `COOKIE_DOMAIN`                                   | no                                            | auth cookie                                                       | `production→secure`, `lax`                                                                    |
| `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_MAX`, `REGISTER_RATE_LIMIT_MAX` | no                                            | rate limiter                                                      | see `backend/.env.example`                                                                    |
| `VITE_API_URL`                                                                           | frontend build                                | browser → API base URL                                            | `http://localhost:4000/api` locally; production fallback is `https://api.cheeryhub.space/api` |
| `VITE_SOCKET_URL`                                                                        | frontend build                                | optional Socket.IO service URL                                    | unset (realtime disabled)                                                                     |
| `VITE_BASE`                                                                              | frontend build                                | Vite base path                                                    | `/` for the custom domain                                                                     |

How each platform supplies them:

- **Cloudflare Worker (production API):** bind D1 as `DB`; set `JWT_SECRET` as a Worker secret and optionally set `EMAIL_API_KEY`. Non-secret values live in `backend/wrangler.toml` `[vars]`. The worker validates its environment on cold start and fails loudly if `JWT_SECRET` is missing.
- **Local / systemd (Node):** `backend/.env` (root `.env` is also read). systemd uses `EnvironmentFile=backend/.env` ([deploy/cheeryhub-api.service](deploy/cheeryhub-api.service)).
- **Vercel (frontend):** project env var `VITE_API_URL=https://api.cheeryhub.space/api`.
- **GitHub Pages (frontend):** optionally define the Actions variable `VITE_API_URL` as `https://api.cheeryhub.space/api`; `.github/workflows/deploy-pages.yml` builds the SPA and deploys `frontend/dist/`. `frontend/public/CNAME` preserves the `cheeryhub.space` custom domain.

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

- **GitHub Pages frontend:** `.github/workflows/deploy-pages.yml` builds and deploys the SPA on pushes to `main`; GitHub Pages must be configured to use **GitHub Actions** as its source. The build uses the `VITE_API_URL` Actions variable when present and otherwise uses the production Worker URL.
- **Cloudflare Worker API:** `.github/workflows/deploy-backend.yml` deploys the Worker and applies pending D1 migrations on changes to `backend/` or `prisma/`. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets, and verify the D1 migration history before the first automated migration run.
- **Legacy CyberPanel Node deployment:** the `deploy/` scripts and service file remain for installations that deliberately use the Node server. They are not used by the GitHub Pages/Worker workflows; do not route `api.cheeryhub.space` to both runtimes.
- `FRONTEND_URL` is the comma-separated CORS and Socket.IO origin allow-list; production includes both `https://cheeryhub.space` and `https://www.cheeryhub.space`.
- Health/status: `GET https://api.cheeryhub.space/api/health` reports database and configuration status without exposing secret values.
- Data lives in the D1 database configured in `backend/wrangler.toml`; migrations are in `backend/migrations`.
