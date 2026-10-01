import { describe, it, expect } from 'vitest';
import { adminItems, isActiveNavPath, navItems } from './navItems';
import { HIDDEN_PAGE_PATHS, ROUTES } from '../routes';

describe('navbar items', () => {
  it('shows the original list, without Tasks or Commitments', () => {
    expect(navItems.map((item) => item.label)).toEqual([
      'Dashboard',
      'Goals',
      'Skills',
      'Achievements',
      'Focus',
      'Journal',
      'Reminders',
      'Analytics',
      'Brand',
      'Finance',
      'Settings',
    ]);
    expect(adminItems.map((item) => item.label)).toEqual(['Admin']);
  });

  it('never exposes the Tasks or Commitments pages in the nav', () => {
    const paths = navItems.map((item) => item.path);
    expect(paths).not.toContain(ROUTES.tasks);
    expect(paths).not.toContain(ROUTES.commitments);
    expect(paths).not.toContain(ROUTES.commitmentsHistory);
    // The Trash Bin has no route at all: it opens from the dashboard card icon.
    expect(paths.some((path) => path.includes('trash'))).toBe(false);
  });

  it('points every nav entry at a real route', () => {
    for (const item of [...navItems, ...adminItems]) {
      expect(item.path.startsWith('/')).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon).toBeTruthy();
    }
  });
});

describe('active nav highlighting', () => {
  it('keeps Dashboard highlighted on the hidden hub pages', () => {
    expect(isActiveNavPath('/', ROUTES.dashboard)).toBe(true);
    expect(isActiveNavPath('/tasks', ROUTES.dashboard)).toBe(true);
    expect(isActiveNavPath('/commitments', ROUTES.dashboard)).toBe(true);
    expect(isActiveNavPath('/commitments/history', ROUTES.dashboard)).toBe(true);
  });

  it('matches regular pages exactly, one item at a time', () => {
    expect(isActiveNavPath('/goals', ROUTES.dashboard)).toBe(false);
    expect(isActiveNavPath('/goals', ROUTES.goals)).toBe(true);
    expect(isActiveNavPath('/goals/extra', ROUTES.goals)).toBe(false);
    expect(isActiveNavPath('/tasks', ROUTES.goals)).toBe(false);
    expect(isActiveNavPath('/analytics', ROUTES.analytics)).toBe(true);
    expect(isActiveNavPath('/admin', ROUTES.dashboard)).toBe(false);
    expect(isActiveNavPath('/admin', ROUTES.admin)).toBe(true);
  });
});

describe('hidden but refresh-safe routes', () => {
  it('keeps /tasks and /commitments/history reachable on refresh', () => {
    expect(HIDDEN_PAGE_PATHS).toContain(ROUTES.tasks);
    expect(HIDDEN_PAGE_PATHS).toContain('/commitments/history');
  });

  it('keeps those routes out of the navbar', () => {
    const navPaths = navItems.map((item) => item.path);
    for (const hidden of HIDDEN_PAGE_PATHS) {
      expect(navPaths).not.toContain(hidden);
    }
  });
});
