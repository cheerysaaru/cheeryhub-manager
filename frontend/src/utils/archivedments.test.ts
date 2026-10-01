import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readArchivedments,
  addArchivedment,
  archiveGoal,
  type Archivedment,
} from './archivedments';
import { getLocalDateString } from './date';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('readArchivedments', () => {
  it('starts empty', () => {
    expect(readArchivedments()).toEqual([]);
  });

  it('recovers from corrupted storage', () => {
    localStorage.setItem('archivedments', '{not json');
    expect(readArchivedments()).toEqual([]);
    localStorage.setItem('archivedments', '{"a":1}');
    expect(readArchivedments()).toEqual([]);
  });
});

describe('addArchivedment', () => {
  it('prepends a manual entry and returns it', () => {
    const first = addArchivedment({ title: 'Shipped app' });
    const second = addArchivedment({ title: 'Ran a marathon', emoji: '🏃' });

    const items = readArchivedments();
    expect(items.map((i) => i.title)).toEqual(['Ran a marathon', 'Shipped app']);
    expect(second.id).not.toBe(first.id);
    expect(second.source).toBe('manual');
    expect(second.date).toBe(getLocalDateString());
    expect(second.emoji).toBe('🏃');
    expect(first.emoji).toBeUndefined();
  });

  it('keeps an explicitly provided date', () => {
    const entry = addArchivedment({ title: 'Old win', date: '2025-01-02' });
    expect(entry.date).toBe('2025-01-02');
  });
});

describe('archiveGoal', () => {
  it('adds a goal once and refuses duplicates', () => {
    expect(archiveGoal({ id: 'g1', title: 'Learn Rust' })).toBe(true);
    expect(archiveGoal({ id: 'g1', title: 'Learn Rust' })).toBe(false);

    const items = readArchivedments();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'g1', source: 'goal', title: 'Learn Rust' });
  });

  it('does not collide with manual entries', () => {
    addArchivedment({ title: 'Manual' });
    archiveGoal({ id: 'g2', title: 'Goal' });
    const items = readArchivedments();
    expect(items.map((i: Archivedment) => i.source)).toEqual(['goal', 'manual']);
  });
});
