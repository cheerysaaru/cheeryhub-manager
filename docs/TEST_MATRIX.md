# TEST_MATRIX.md

Comprehensive test matrix for Personal Productivity Dashboard API contract verification.

## API Endpoint Coverage

### Authentication (`/api/auth/*`)

| Endpoint             | Method | Status         | Test Type | Notes                                         |
| -------------------- | ------ | -------------- | --------- | --------------------------------------------- |
| `/api/auth/register` | POST   | ✅ Implemented | API / E2E | Creates user, returns token + cookie          |
| `/api/auth/login`    | POST   | ✅ Implemented | API / E2E | Validates credentials, returns token + cookie |
| `/api/auth/logout`   | POST   | ✅ Implemented | API / E2E | Clears auth cookie                            |
| `/api/auth/me`       | GET    | ✅ Implemented | API / E2E | Returns current user profile                  |
| `/api/auth/refresh`  | POST   | ✅ Implemented | API / E2E | Returns new token, extends session            |
| `/api/auth/forgot`   | POST   | ✅ Implemented | API       | Returns reset token (dev mode)                |
| `/api/auth/reset`    | POST   | ✅ Implemented | API       | Resets password with token                    |

### Tasks (`/api/tasks/*`)

| Endpoint                   | Method | Status         | Test Type | Notes                      |
| -------------------------- | ------ | -------------- | --------- | -------------------------- |
| `/api/tasks`               | GET    | ✅ Implemented | API / E2E | Lists active tasks         |
| `/api/tasks/trash`         | GET    | ✅ Implemented | API       | Lists soft-deleted tasks   |
| `/api/tasks`               | POST   | ✅ Implemented | API / E2E | Creates task               |
| `/api/tasks/:id`           | GET    | ✅ Implemented | API / E2E | Gets single task           |
| `/api/tasks/:id`           | PUT    | ✅ Implemented | API / E2E | Updates task               |
| `/api/tasks/:id`           | DELETE | ✅ Implemented | API / E2E | Soft deletes task          |
| `/api/tasks/:id/complete`  | POST   | ✅ Implemented | API       | Marks task completed       |
| `/api/tasks/:id/checkin`   | POST   | ✅ Implemented | API       | Marks task in progress     |
| `/api/tasks/:id/extend`    | POST   | ✅ Implemented | API       | Extends task deadline      |
| `/api/tasks/:id/timer`     | POST   | ✅ Implemented | API       | Starts task timer          |
| `/api/tasks/:id/restore`   | POST   | ✅ Implemented | API       | Restores soft-deleted task |
| `/api/tasks/:id/permanent` | DELETE | ✅ Implemented | API       | Hard deletes task          |

### Habits (`/api/habits/*`)

| Endpoint                   | Method | Status         | Test Type | Notes                         |
| -------------------------- | ------ | -------------- | --------- | ----------------------------- |
| `/api/habits`              | GET    | ✅ Implemented | API / E2E | Lists habits                  |
| `/api/habits`              | POST   | ✅ Implemented | API / E2E | Creates habit                 |
| `/api/habits/:id`          | GET    | ✅ Implemented | API / E2E | Gets single habit             |
| `/api/habits/:id`          | PUT    | ✅ Implemented | API / E2E | Updates habit                 |
| `/api/habits/:id`          | DELETE | ✅ Implemented | API / E2E | Deletes habit                 |
| `/api/habits/:id/complete` | POST   | ✅ Implemented | API       | Marks habit complete for date |

### Goals (`/api/goals/*`)

| Endpoint         | Method | Status         | Test Type | Notes        |
| ---------------- | ------ | -------------- | --------- | ------------ |
| `/api/goals`     | GET    | ✅ Implemented | API / E2E | Lists goals  |
| `/api/goals`     | POST   | ✅ Implemented | API / E2E | Creates goal |
| `/api/goals/:id` | PUT    | ✅ Implemented | API / E2E | Updates goal |
| `/api/goals/:id` | DELETE | ✅ Implemented | API / E2E | Deletes goal |

### Skills (`/api/skills/*`)

| Endpoint          | Method | Status         | Test Type | Notes         |
| ----------------- | ------ | -------------- | --------- | ------------- |
| `/api/skills`     | GET    | ✅ Implemented | API / E2E | Lists skills  |
| `/api/skills`     | POST   | ✅ Implemented | API / E2E | Creates skill |
| `/api/skills/:id` | PUT    | ✅ Implemented | API       | Updates skill |

### Journal (`/api/journal/*`)

| Endpoint           | Method | Status         | Test Type | Notes                 |
| ------------------ | ------ | -------------- | --------- | --------------------- |
| `/api/journal`     | GET    | ✅ Implemented | API / E2E | Lists journal entries |
| `/api/journal`     | POST   | ✅ Implemented | API / E2E | Creates entry         |
| `/api/journal/:id` | GET    | ✅ Implemented | API       | Gets single entry     |
| `/api/journal/:id` | PUT    | ✅ Implemented | API       | Updates entry         |
| `/api/journal/:id` | DELETE | ✅ Implemented | API       | Deletes entry         |

### Focus (`/api/focus/*`)

| Endpoint                  | Method | Status         | Test Type | Notes                |
| ------------------------- | ------ | -------------- | --------- | -------------------- |
| `/api/focus`              | GET    | ✅ Implemented | API / E2E | Lists focus sessions |
| `/api/focus`              | POST   | ✅ Implemented | API / E2E | Creates session      |
| `/api/focus/:id`          | GET    | ✅ Implemented | API       | Gets session         |
| `/api/focus/:id`          | PUT    | ✅ Implemented | API       | Updates session      |
| `/api/focus/:id/complete` | POST   | ✅ Implemented | API       | Completes session    |

### XP & Analytics (`/api/analytics/*`, `/api/analytics/xp`, `/api/analytics/charts`)

| Endpoint                | Method | Status         | Test Type | Notes                         |
| ----------------------- | ------ | -------------- | --------- | ----------------------------- |
| `/api/analytics`        | GET    | ✅ Implemented | API / E2E | Dashboard stats               |
| `/api/analytics/xp`     | GET    | ✅ Implemented | API       | XP history + total            |
| `/api/analytics/charts` | GET    | ✅ Implemented | API       | Chart data (daily, by reason) |

### Admin (`/api/admin/*`)

| Endpoint               | Method | Status         | Test Type | Notes                        |
| ---------------------- | ------ | -------------- | --------- | ---------------------------- |
| `/api/admin/users`     | GET    | ✅ Implemented | API       | Lists all users (admin only) |
| `/api/admin/users/:id` | GET    | ✅ Implemented | API       | Gets user details (admin)    |
| `/api/admin/users/:id` | PUT    | ✅ Implemented | API       | Updates role/status (admin)  |
| `/api/admin/stats`     | GET    | ✅ Implemented | API       | System statistics (admin)    |

### Achievements (`/api/achievements/*`)

| Endpoint                   | Method | Status         | Test Type | Notes                                   |
| -------------------------- | ------ | -------------- | --------- | --------------------------------------- |
| `/api/achievements`        | GET    | ✅ Implemented | API / E2E | Lists all achievements + unlocked state |
| `/api/achievements/unlock` | POST   | ✅ Implemented | API       | Unlocks achievement by key              |

### Notifications (`/api/notifications/*`)

| Endpoint                 | Method | Status         | Test Type | Notes                |
| ------------------------ | ------ | -------------- | --------- | -------------------- |
| `/api/notifications`     | GET    | ✅ Implemented | API / E2E | Lists notifications  |
| `/api/notifications/:id` | PUT    | ✅ Implemented | API       | Marks read/unread    |
| `/api/notifications/:id` | DELETE | ✅ Implemented | API       | Deletes notification |

### Reminders (`/api/reminders/*`)

| Endpoint             | Method | Status         | Test Type | Notes            |
| -------------------- | ------ | -------------- | --------- | ---------------- |
| `/api/reminders`     | GET    | ✅ Implemented | API / E2E | Lists reminders  |
| `/api/reminders`     | POST   | ✅ Implemented | API / E2E | Creates reminder |
| `/api/reminders/:id` | PUT    | ✅ Implemented | API       | Updates reminder |
| `/api/reminders/:id` | DELETE | ✅ Implemented | API       | Deletes reminder |

### Brand (`/api/brand/*`)

| Endpoint     | Method | Status         | Test Type | Notes                  |
| ------------ | ------ | -------------- | --------- | ---------------------- |
| `/api/brand` | GET    | ✅ Implemented | API / E2E | Gets brand settings    |
| `/api/brand` | PUT    | ✅ Implemented | API / E2E | Updates brand settings |

### Transactions (`/api/transactions/*`)

| Endpoint                 | Method | Status         | Test Type | Notes                              |
| ------------------------ | ------ | -------------- | --------- | ---------------------------------- |
| `/api/transactions`      | GET    | ✅ Implemented | API / E2E | Lists transactions (XPTransaction) |
| `/api/transactions`      | POST   | ✅ Implemented | API / E2E | Creates transaction                |
| `/api/analytics/summary` | GET    | ✅ Implemented | API       | XP summary (earned/spent/count)    |

### Streaks (`/api/streaks/*`)

| Endpoint                    | Method | Status         | Test Type | Notes                  |
| --------------------------- | ------ | -------------- | --------- | ---------------------- |
| `/api/streaks`              | GET    | ✅ Implemented | API / E2E | Gets habit streaks     |
| `/api/streaks/:id/check-in` | POST   | ✅ Implemented | API       | Records habit check-in |

### Settings (`/api/settings/*`)

| Endpoint        | Method | Status         | Test Type | Notes                 |
| --------------- | ------ | -------------- | --------- | --------------------- |
| `/api/settings` | GET    | ✅ Implemented | API / E2E | Gets user settings    |
| `/api/settings` | PUT    | ✅ Implemented | API / E2E | Updates user settings |

### Backup (`/api/backup/*`)

| Endpoint              | Method | Status         | Test Type | Notes                         |
| --------------------- | ------ | -------------- | --------- | ----------------------------- |
| `/api/backup/export`  | POST   | ✅ Implemented | API / E2E | Exports all user data as JSON |
| `/api/backup/import`  | POST   | ✅ Implemented | API       | Imports backup JSON           |
| `/api/backup/history` | GET    | ✅ Implemented | API       | Gets backup metadata          |

### Health (`/api/health`)

| Endpoint      | Method | Status         | Test Type | Notes        |
| ------------- | ------ | -------------- | --------- | ------------ |
| `/api/health` | GET    | ✅ Implemented | API / E2E | Health check |

## Database Schema Alignment

| Model             | Migration | Key Fields Added                                  | Frontend Contract                                       |
| ----------------- | --------- | ------------------------------------------------- | ------------------------------------------------------- |
| `Habit`           | 0006      | `title` (alias for `name`), `targetDays`          | Uses `title` not `name`; `targetDays` for frequency     |
| `Goal`            | 0006      | `targetDate` (alias for `deadline`)               | Uses `targetDate` not `deadline`                        |
| `Skill`           | 0006      | `level` (alias for `currentLevel`), `description` | Uses `level` not `currentLevel`; supports `description` |
| `HabitCompletion` | 0006      | —                                                 | Requires `userId` in INSERT                             |
| `Transaction`     | 0006      | —                                                 | Finance uses `Transaction` model                        |
| `Achievement`     | 0006      | New model                                         | Achievement system                                      |
| `JournalEntry`    | 0006      | New model                                         | Journal CRUD                                            |
| `FocusSession`    | 0006      | New model                                         | Focus CRUD                                              |
| `BrandProject`    | 0006      | New model                                         | Brand CRUD                                              |
| `BrandMilestone`  | 0006      | New model                                         | Brand milestones                                        |
| `TaskCheckIn`     | 0006      | New model                                         | Task check-ins                                          |

## Test Types & Coverage Targets

| Test Layer               | Target                   | Current        | Location                          |
| ------------------------ | ------------------------ | -------------- | --------------------------------- |
| Unit (utils, validators) | ≥80%                     | TBD            | `backend/src/utils/**/*.test.ts`  |
| Component (React)        | ≥80%                     | TBD            | `frontend/src/**/*.test.{ts,tsx}` |
| Form/Integration (API)   | All endpoints            | 100% routes    | `backend/src/routes/**/*.test.ts` |
| E2E (Playwright)         | All routes × 2 viewports | 28 screenshots | `frontend/e2e/sweep.spec.ts`      |
| Accessibility (axe)      | 0 violations             | Pending        | Phase 4                           |
| Performance (Lighthouse) | ≥90 all categories       | Pending        | Phase 4                           |

## Test Commands

```bash
# All gates (run in order)
npm run lint          # ESLint + Prettier
npm run format:check  # Prettier
npm run typecheck     # tsc --noEmit (both workspaces)
npm run test          # vitest run (unit + integration)
npm run test:e2e      # playwright test (E2E)
npm run build         # Build both workspaces

# Individual workspaces
npm run test --workspace backend
npm run test --workspace frontend
npm run build --workspace backend
npm run build --workspace frontend
```

## CI/CD Integration

The `deploy-backend.yml` and `deploy-frontend.yml` workflows run:

1. `npm ci` (clean install)
2. `npm run typecheck --workspace backend`
3. `npm run build --workspace backend` (validates wrangler bundle)
4. D1 migrations (backend)
5. Deploy to Cloudflare Workers

## Known Gaps / Future Work

1. **Unit tests**: Add vitest tests for utils (`jwt`, `password`, `validation`, `errors`, `response`, `date`, `deadline`, `points`, `xpBreakdown`, `commitmentCalendar`, `archivedments`, `notify`, `profile`, `theme`, `misc`)
2. **Component tests**: Add React Testing Library tests for hooks (`useAuth`, `useTasks`, `useHabits`, `useGoals`, `useSkills`, `useReminders`, `useTransactions`, `useBrand`, `useJournal`, `useFocus`, `useNotifications`, `useAnalytics`, `useLongPress`, `useSocket`, `useDayActions`)
3. **Form tests**: React Hook Form + Zod validation tests
4. **API integration tests**: More comprehensive vitest tests for each route with auth scenarios
5. **Accessibility**: axe-core integration in Playwright
6. **Performance**: Lighthouse CI in GitHub Actions
7. **Security headers**: CSP, HSTS, etc. verification
8. **Rate limiting**: Test auth endpoints for brute-force protection
