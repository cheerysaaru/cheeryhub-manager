/**
 * Every client-side page path in one place.
 *
 * The dashboard is the hub: the Tasks page and the Commitments history page
 * are deliberately NOT navbar items — they are reached through the "View all"
 * links on the dashboard cards, but their routes stay registered so a browser
 * refresh on them never 404s.
 */
export const ROUTES = {
  dashboard: '/',
  tasks: '/tasks',
  commitments: '/commitments',
  commitmentsHistory: '/commitments/history',
  goals: '/goals',
  skills: '/skills',
  achievements: '/achievements',
  focus: '/focus',
  journal: '/journal',
  reminders: '/reminders',
  analytics: '/analytics',
  brand: '/brand',
  finance: '/finance',
  settings: '/settings',
  admin: '/admin',
} as const;

/**
 * Paths that are not navbar entries but must still resolve directly (the
 * server answers them with the SPA shell so a hard refresh keeps working).
 */
export const HIDDEN_PAGE_PATHS: readonly string[] = [
  ROUTES.tasks,
  ROUTES.commitmentsHistory,
];
