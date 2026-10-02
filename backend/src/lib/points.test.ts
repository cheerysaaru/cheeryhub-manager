import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POINTS, awardPoints, revokePoints, type Db } from './points';

vi.mock('./prisma', () => ({ prisma: {} }));

function makeDb() {
  return {
    xPTransaction: {
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
}

function asDb(db: ReturnType<typeof makeDb>): Db {
  return db as unknown as Db;
}

/** chainState runs two counts: [awards, reversals]. */
function chain(db: ReturnType<typeof makeDb>, awards: number, reversals: number) {
  db.xPTransaction.count.mockResolvedValueOnce(awards).mockResolvedValueOnce(reversals);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POINTS', () => {
  it('matches the agreed economy', () => {
    expect(POINTS).toEqual({
      TASK_ON_TIME: 2,
      TASK_OVERDUE_EXTENDED: 1,
      TASK_OVERDUE_NO_EXTENSION: 0,
      TASK_MISSED: -5,
      COMMITMENT_CHECK_IN: 4,
      COMMITMENT_MISSED: -5,
      COMMITMENT_SKIPPED: 0,
      GOAL_DONE: 5,
      GOAL_MISSED: -3,
      ACHIEVEMENT: 5,
    });
  });
});

describe('awardPoints', () => {
  it('applies the amount and returns it', async () => {
    const db = makeDb();
    chain(db, 0, 0);
    db.xPTransaction.create.mockResolvedValue({});

    const applied = await awardPoints(asDb(db), {
      userId: 'u1',
      amount: POINTS.TASK_ON_TIME,
      reason: 'task:ontime:t1:2026-10-01',
      dedupeKey: 'task:ontime:t1:2026-10-01',
      taskId: 't1',
    });

    expect(applied).toBe(2);
    expect(db.xPTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        amount: 2,
        reason: 'task:ontime:t1:2026-10-01',
        dedupeKey: 'task:ontime:t1:2026-10-01',
        taskId: 't1',
        habitId: null,
      },
    });
  });

  it('returns 0 without touching the database when the amount is zero', async () => {
    const db = makeDb();
    const applied = await awardPoints(asDb(db), {
      userId: 'u1',
      amount: POINTS.TASK_OVERDUE_NO_EXTENSION,
      reason: 'task:overdue:t2',
      dedupeKey: 'task:overdue:t2',
    });
    expect(applied).toBe(0);
    expect(db.xPTransaction.count).not.toHaveBeenCalled();
    expect(db.xPTransaction.create).not.toHaveBeenCalled();
  });

  it('skips when the award is still active for the chain', async () => {
    const db = makeDb();
    chain(db, 1, 0);

    const applied = await awardPoints(asDb(db), {
      userId: 'u1',
      amount: 4,
      reason: 'habit:checkin:h1:2026-10-01',
      dedupeKey: 'habit:checkin:h1:2026-10-01',
    });

    expect(applied).toBe(0);
    expect(db.xPTransaction.create).not.toHaveBeenCalled();
  });

  it('appends a fresh award under a new key after a reversal (never reuses a row)', async () => {
    const db = makeDb();
    chain(db, 1, 1);
    db.xPTransaction.create.mockResolvedValue({});

    const applied = await awardPoints(asDb(db), {
      userId: 'u1',
      amount: 4,
      reason: 'habit:checkin:h1:2026-10-01',
      dedupeKey: 'habit:checkin:h1:2026-10-01',
    });

    expect(applied).toBe(4);
    expect(db.xPTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupeKey: 'habit:checkin:h1:2026-10-01#g2' }),
      })
    );
  });

  it('treats a unique-constraint race as already applied', async () => {
    const db = makeDb();
    chain(db, 0, 0);
    db.xPTransaction.create.mockRejectedValue({ code: 'P2002' });

    const applied = await awardPoints(asDb(db), {
      userId: 'u1',
      amount: 5,
      reason: 'goal:done:g1',
      dedupeKey: 'goal:done:g1',
    });

    expect(applied).toBe(0);
  });

  it('rethrows unexpected database errors', async () => {
    const db = makeDb();
    chain(db, 0, 0);
    db.xPTransaction.create.mockRejectedValue(new Error('connection lost'));

    await expect(
      awardPoints(asDb(db), { userId: 'u1', amount: 2, reason: 'task:ontime:t3' })
    ).rejects.toThrow('connection lost');
  });

  it('stores null dedupe key when none is provided', async () => {
    const db = makeDb();
    db.xPTransaction.create.mockResolvedValue({});

    const applied = await awardPoints(asDb(db), { userId: 'u1', amount: -3, reason: 'goal:missed:g2' });

    expect(applied).toBe(-3);
    expect(db.xPTransaction.count).not.toHaveBeenCalled();
    expect(db.xPTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dedupeKey: null }) })
    );
  });
});

describe('revokePoints', () => {
  it('appends a reversing row instead of deleting anything', async () => {
    const db = makeDb();
    chain(db, 1, 0);
    db.xPTransaction.findUnique.mockResolvedValue({
      amount: -5,
      reason: 'Daily commitment missed',
      taskId: null,
      habitId: 'h9',
    });
    db.xPTransaction.create.mockResolvedValue({});

    const removed = await revokePoints(asDb(db), 'u1', 'habit:missed:h9:2026-10-01');

    expect(removed).toBe(5);
    expect(db.xPTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        amount: 5,
        reason: 'Reversed: Daily commitment missed',
        dedupeKey: 'habit:missed:h9:2026-10-01#rev1',
        taskId: null,
        habitId: 'h9',
      },
    });
    expect(db.xPTransaction).not.toHaveProperty('deleteMany');
  });

  it('reverses the second award in the chain by its generation key', async () => {
    const db = makeDb();
    chain(db, 2, 1);
    db.xPTransaction.findUnique.mockResolvedValue({
      amount: 4,
      reason: 'Daily commitment checked in',
      taskId: null,
      habitId: 'h9',
    });
    db.xPTransaction.create.mockResolvedValue({});

    const removed = await revokePoints(asDb(db), 'u1', 'habit:checkin:h9:2026-10-01');

    expect(removed).toBe(-4);
    expect(db.xPTransaction.findUnique).toHaveBeenCalledWith({
      where: {
        userId_dedupeKey: { userId: 'u1', dedupeKey: 'habit:checkin:h9:2026-10-01#g2' },
      },
    });
    expect(db.xPTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: -4,
          dedupeKey: 'habit:checkin:h9:2026-10-01#rev2',
        }),
      })
    );
  });

  it('returns 0 and writes nothing when nothing was recorded', async () => {
    const db = makeDb();
    chain(db, 0, 0);

    const removed = await revokePoints(asDb(db), 'u1', 'habit:checkin:h9:2026-10-01');

    expect(removed).toBe(0);
    expect(db.xPTransaction.create).not.toHaveBeenCalled();
    expect(db.xPTransaction.findUnique).not.toHaveBeenCalled();
  });

  it('returns 0 when the award is already reversed (idempotent undo)', async () => {
    const db = makeDb();
    chain(db, 1, 1);

    const removed = await revokePoints(asDb(db), 'u1', 'habit:checkin:h9:2026-10-01');

    expect(removed).toBe(0);
    expect(db.xPTransaction.create).not.toHaveBeenCalled();
  });
});
