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

See `.env.example` for `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `FRONTEND_URL`, `BASE_PATH`, cookie settings, and optional `EMAIL_API_KEY` / `EMAIL_FROM` (Resend). The frontend uses `VITE_API_URL` when the API is deployed separately.

## Features

- Tasks, habits, goals + milestones, skills, reminders, brand projects, finance transactions, journal, focus timer, XP, analytics
- Email verification on register (Resend in production; dev mode logs the link to the backend console)
- Offline queue + service worker (PWA / Add to Home Screen on iPhone)
- Socket.IO rooms per user for live updates across tabs/devices
- Responsive design system with accessible controls

## API

Authentication uses bcrypt password hashes and an HTTP-only JWT cookie. Protected routes require a session; all resource queries are scoped to the session user. `DELETE` for tasks and habits is a soft delete.

Main routes: `/api/health`, `/api/auth/*` (register, login, logout, me, verify-email, resend-verification), CRUD for `tasks`, `habits`, `goals`, `skills`, `reminders`, `brand`, `transactions`, plus completion/check-in/timer, goal/brand milestones, focus, journal, XP, settings, analytics, and backup export/import. Responses use `{ data: ... }` on success and `{ error: ... }` on failure.

## Testing

```bash
npm test   # typecheck backend + frontend
npm run build
```

## Production

- Architecture: **GitHub Pages (frontend) → CyberPanel backend (`https://api.cheeryhub.space`) → SQLite (`prisma/dev.db`)**.
- Step-by-step server setup: **[deploy/DEPLOY.md](deploy/DEPLOY.md)** — `sudo bash deploy/setup-server.sh` on the server, then attach the CyberPanel reverse proxy, then `bash deploy/verify.sh`.
- Backend on CyberPanel: upload `package.json`, `package-lock.json`, `backend/`, `prisma/` (not `frontend/`, not `node_modules/`). Then run `npm ci`, `npx prisma generate --schema=prisma/schema.prisma`, `npm run build --workspace backend`, `npx prisma migrate deploy --schema=prisma/schema.prisma` (skip if uploading an existing `prisma/dev.db`), and start with `npm start --workspace backend` (listens on `0.0.0.0:4000`).
- Backend env (server `.env`): `DATABASE_URL="file:./dev.db"`, `JWT_SECRET`, `NODE_ENV=production`, `FRONTEND_URL="https://cheerysaaru.github.io"`, `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`, optional `PORT` (default 4000), `COOKIE_DOMAIN`.
- Frontend: `frontend/.env.production` sets `VITE_API_URL=https://api.cheeryhub.space/api`; GitHub Actions (`.github/workflows/deploy.yml`) builds with `VITE_BASE=/cheeryhub-manager/` and deploys `frontend/dist` to GitHub Pages on push to `main`.
- Backups (SQLite): copy `prisma/dev.db` on a schedule; test restores regularly.
