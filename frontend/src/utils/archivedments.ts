import { getLocalDateString } from "./date";

export interface Archivedment {
  id: string;
  emoji?: string;
  title: string;
  description?: string;
  date: string;
  source: "manual" | "goal";
}

const KEY = "archivedments";

export function readArchivedments(): Archivedment[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Archivedment[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: Archivedment[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* Storage may be unavailable. */
  }
}

export function addArchivedment(
  item: Omit<Archivedment, "id" | "date" | "source"> & { date?: string },
): Archivedment {
  const items = readArchivedments();
  const entry: Archivedment = {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    emoji: item.emoji || undefined,
    title: item.title,
    description: item.description || undefined,
    date: item.date || getLocalDateString(),
    source: "manual",
  };
  items.unshift(entry);
  writeAll(items);
  return entry;
}

export function archiveGoal(goal: {
  id: string;
  title: string;
  description?: string;
}): boolean {
  const items = readArchivedments();
  if (items.some((item) => item.id === goal.id)) return false;
  items.unshift({
    id: goal.id,
    title: goal.title,
    description: goal.description || undefined,
    date: getLocalDateString(),
    source: "goal",
  });
  writeAll(items);
  return true;
}
