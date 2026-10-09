/**
 * Every client-side page path in one place.
 *
 * The dashboard is the hub: the Tasks page and the Commitments history page
 * are deliberately NOT navbar items — they are reached through the "View all"
 * links on the dashboard cards, but their routes stay registered so a browser
 * refresh on them never 404s.
 */
export const ROUTES = {
  dashboard: "/",
  tasks: "/tasks",
  commitments: "/commitments",
  commitmentsHistory: "/commitments/history",
  goals: "/goals",
  skills: "/skills",
  achievements: "/achievements",
  analytics: "/analytics",
  brand: "/brand",
  finance: "/finance",
  settings: "/settings",
  admin: "/admin",
} as const;

/**
 * Tabs that were removed from the product (Journal, Focus, Reminders). Their
 * paths still resolve — main.tsx redirects them to the dashboard so old links
 * and bookmarks keep working. The backend routes and their tables stay intact.
 */
export const LEGACY_TAB_PATHS = ["/focus", "/journal", "/reminders"] as const;

/**
 * Paths that are not navbar entries but must still resolve directly (the
 * server answers them with the SPA shell so a hard refresh keeps working).
 */
export const HIDDEN_PAGE_PATHS: readonly string[] = [
  ROUTES.tasks,
  ROUTES.commitmentsHistory,
];
