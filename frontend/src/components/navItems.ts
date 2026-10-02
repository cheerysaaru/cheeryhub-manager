import {
  Home,
  Target,
  Trophy,
  Award,
  Brain,
  BookOpen,
  Bell,
  Settings,
  DollarSign,
  BarChart2,
  Briefcase,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTES } from '../routes';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The navbar is intentionally free of "Tasks" and "Commitments": both pages
 * are reachable only through the dashboard card "View all" links. The Trash
 * Bin likewise opens from the Today's Tasks card icon, never from the nav.
 */
export const navItems: NavItem[] = [
  { path: ROUTES.dashboard, label: 'Dashboard', icon: Home },
  { path: ROUTES.goals, label: 'Goals', icon: Target },
  { path: ROUTES.skills, label: 'Skills', icon: Trophy },
  { path: ROUTES.achievements, label: 'Achievements', icon: Award },
  { path: ROUTES.focus, label: 'Focus', icon: Brain },
  { path: ROUTES.journal, label: 'Journal', icon: BookOpen },
  { path: ROUTES.reminders, label: 'Reminders', icon: Bell },
  { path: ROUTES.analytics, label: 'Analytics', icon: BarChart2 },
  { path: ROUTES.brand, label: 'Brand', icon: Briefcase },
  { path: ROUTES.finance, label: 'Finance', icon: DollarSign },
  { path: ROUTES.settings, label: 'Settings', icon: Settings },
];

export const adminItems: NavItem[] = [
  { path: ROUTES.admin, label: 'Admin', icon: Shield },
];

/**
 * Dashboard stays highlighted on the hub-adjacent pages that are hidden from
 * the navbar (Tasks, Commitments history) so the nav never looks "dead".
 * Every other item matches its own path exactly.
 */
export function isActiveNavPath(pathname: string, itemPath: string): boolean {
  if (itemPath === ROUTES.dashboard) {
    return (
      pathname === ROUTES.dashboard ||
      pathname === ROUTES.tasks ||
      pathname.startsWith(`${ROUTES.commitments}`)
    );
  }
  return pathname === itemPath;
}
