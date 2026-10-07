import { describe, it, expect } from 'vitest';
import { type Db } from './points';
import {
  applyHabitDayPoints,
  planHabitDayPoints,
  revokeHabitDayPoints,
  type HabitPointsStatus,
} from './habitPoints';

/**
 * In-memory ledger double implementing exactly the subset of the Prisma
 * client the append-only points code uses (count / findUnique / create with
 * a unique (userId, dedupeKey)). Rows are never mutated once written.
 */
interface LedgerRow {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  dedupeKey: string | null;
  taskId: string | null;
  habitId: string | null;
}

type WhereClause = {
  userId: string;
  OR?: Array<{ dedupeKey: string } | { dedupeKey: { startsWith: string } }>;
  dedupeKey?: string | { startsWith: string };
};

function makeLedger() {
  const rows: LedgerRow[] = [];

  function matches(row: LedgerRow, where: WhereClause): boolean {
    if (row.userId !== where.userId) return false;
    if (where.OR) {
      const ok = where.OR.some((cond) => {
        if (typeof cond.dedupeKey === 'object' && 'startsWith' in cond.dedupeKey) {
          return row.dedupeKey !== null && row.dedupeKey.startsWith(cond.dedupeKey.startsWith);
        }
        return row.dedupeKey === cond.dedupeKey;
      });
      if (!ok) return false;
    }
    if (where.dedupeKey !== undefined) {
      if (typeof where.dedupeKey === 'object' && 'startsWith' in where.dedupeKey) {
        if (row.dedupeKey === null || !row.dedupeKey.startsWith(where.dedupeKey.startsWith)) return false;
      } else if (row.dedupeKey !== where.dedupeKey) {
        return false;
      }
    }
    return true;
  }

  const db = {
    xPTransaction: {
      count: async ({ where }: { where: WhereClause }) => rows.filter((r) => matches(r, where)).length,
      findUnique: async ({
        where,
      }: {
        where: { userId_dedupeKey: { userId: string; dedupeKey: string } };
      }) =>
        rows.find(
          (r) => r.userId === where.userId_dedupeKey.userId && r.dedupeKey === where.userId_dedupeKey.dedupeKey
        ) ?? null,
      create: async ({ data }: { data: Omit<LedgerRow, 'id'> }) => {
        if (
          data.dedupeKey !== null &&
          rows.some((r) => r.userId === data.userId && r.dedupeKey === data.dedupeKey)
        ) {
          throw { code: 'P2002' };
        }
        const row: LedgerRow = { id: `r${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
    },
  };

  const snapshot = () => JSON.parse(JSON.stringify(rows)) as LedgerRow[];

  return {
    rows,
    db: db as unknown as Db,
    snapshot,
    total: () => rows.reduce((sum, r) => sum + r.amount, 0),
  };
}

const INPUT = { userId: 'u1', habitId: 'h1', dayKey: '2026-10-01' };

async function setDay(ledger: ReturnType<typeof makeLedger>, status: HabitPointsStatus) {
  return applyHabitDayPoints(ledger.db, { ...INPUT, status });
}

describe('commitment day ledger transitions', () => {
  it('plans a check-in as a transaction operation with the correct points delta', async () => {
    const ledger = makeLedger();
    const plan = await planHabitDayPoints(ledger.db, { ...INPUT, status: 'COMPLETED' });

    expect(plan.delta).toBe(4);
    expect(plan.reason).toBe('Daily commitment checked in');
    expect(plan.operations).toHaveLength(1);
    await Promise.all(plan.operations);
    expect(ledger.total()).toBe(4);
  });

  it('plans undo reversals as append-only operations', async () => {
    const ledger = makeLedger();
    await setDay(ledger, 'COMPLETED');
    const before = ledger.snapshot();
    const plan = await planHabitDayPoints(ledger.db, { ...INPUT, status: 'SKIPPED' });

    expect(plan.delta).toBe(-4);
    expect(plan.operations).toHaveLength(1);
    await Promise.all(plan.operations);
    expect(ledger.total()).toBe(0);
    expect(ledger.rows[0]).toEqual(before[0]);
    expect(ledger.rows[1].amount).toBe(-4);
    expect(ledger.rows[1].dedupeKey).toBe('habit:checkin:h1:2026-10-01#rev1');
  });

  it('check-in adds 4 once and stays idempotent when tapped again', async () => {
    const ledger = makeLedger();

    expect((await setDay(ledger, 'COMPLETED')).delta).toBe(4);
    expect((await setDay(ledger, 'COMPLETED')).delta).toBe(0);

    expect(ledger.total()).toBe(4);
    expect(ledger.rows).toHaveLength(1);
  });

  it('undo appends a reversal (net 0) and never edits or deletes a row', async () => {
    const ledger = makeLedger();
    await setDay(ledger, 'COMPLETED');
    const before = ledger.snapshot();

    const undo = await revokeHabitDayPoints(ledger.db, INPUT);

    expect(undo.delta).toBe(-4);
    expect(ledger.total()).toBe(0);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0]).toEqual(before[0]);
    expect(ledger.rows[1].dedupeKey).toBe('habit:checkin:h1:2026-10-01#rev1');
    expect(ledger.rows[1].amount).toBe(-4);
  });

  it('re-check after undo awards 4 again without double counting', async () => {
    const ledger = makeLedger();
    await setDay(ledger, 'COMPLETED');
    await revokeHabitDayPoints(ledger.db, INPUT);
    const redo = await setDay(ledger, 'COMPLETED');

    expect(redo.delta).toBe(4);
    expect(ledger.total()).toBe(4);
    expect(ledger.rows).toHaveLength(3);
    expect(ledger.rows[2].dedupeKey).toBe('habit:checkin:h1:2026-10-01#g2');
  });

  it('failed day deducts 5 (mirrored in the returned delta)', async () => {
    const ledger = makeLedger();
    const res = await setDay(ledger, 'FAILED');

    expect(res.delta).toBe(-5);
    expect(res.reason).toBe('Daily commitment missed');
    expect(ledger.total()).toBe(-5);
  });

  it('failed -> checked in reverses the -5 miss and awards +4', async () => {
    const ledger = makeLedger();
    await setDay(ledger, 'FAILED');
    const res = await setDay(ledger, 'COMPLETED');

    expect(res.delta).toBe(9); // +5 reversal of the miss, +4 fresh check-in
    expect(ledger.total()).toBe(4); // miss fully reversed, only the check-in remains
    expect(ledger.rows).toHaveLength(3); // miss, miss reversal, new check-in
  });

  it('checked -> failed reverses the check-in (-4) and deducts the miss (-5)', async () => {
    const ledger = makeLedger();
    await setDay(ledger, 'COMPLETED');
    const res = await setDay(ledger, 'FAILED');

    expect(res.delta).toBe(-9);
    expect(ledger.total()).toBe(-5);
  });

  it('leave yields 0 and clears an active check-in', async () => {
    const ledger = makeLedger();
    await setDay(ledger, 'COMPLETED');

    const leave = await applyHabitDayPoints(ledger.db, { ...INPUT, status: 'SKIPPED' });

    expect(leave.delta).toBe(-4);
    expect(ledger.total()).toBe(0);
  });

  it('leave on an untouched day writes nothing and moves 0 points', async () => {
    const ledger = makeLedger();
    const leave = await applyHabitDayPoints(ledger.db, { ...INPUT, status: 'SKIPPED' });

    expect(leave.delta).toBe(0);
    expect(leave.reason).toBe('');
    expect(ledger.rows).toHaveLength(0);
  });

  it('full check -> undo -> recheck -> failed -> undo cycle never double counts and only grows the audit trail', async () => {
    const ledger = makeLedger();

    await setDay(ledger, 'COMPLETED'); // +4
    await revokeHabitDayPoints(ledger.db, INPUT); // 0
    await setDay(ledger, 'COMPLETED'); // +4
    await setDay(ledger, 'FAILED'); // -5 (reverses the +4, deducts miss)
    const step4 = ledger.snapshot();
    expect(ledger.total()).toBe(-5);

    const undoFail = await revokeHabitDayPoints(ledger.db, INPUT); // reverses the miss
    expect(undoFail.delta).toBe(5);
    expect(ledger.total()).toBe(0);

    // every historical row is byte-identical after the run
    for (const row of step4) {
      expect(ledger.rows.find((r) => r.id === row.id)).toEqual(row);
    }
    expect(ledger.rows.length).toBeGreaterThanOrEqual(step4.length);
  });

  it('gives the same day key across midnight-safe separate inputs (per-day isolation)', async () => {
    const ledger = makeLedger();
    await applyHabitDayPoints(ledger.db, { ...INPUT, dayKey: '2026-10-01', status: 'COMPLETED' });
    await applyHabitDayPoints(ledger.db, { ...INPUT, dayKey: '2026-10-02', status: 'FAILED' });

    expect(ledger.total()).toBe(4 - 5);
    expect(ledger.rows).toHaveLength(2);
  });
});
