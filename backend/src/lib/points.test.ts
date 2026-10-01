import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POINTS, awardPoints, revokePoints, type Db } from './points';

vi.mock('./prisma', () => ({ prisma: {} }));

function makeDb() {
  return {
    xPTransaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

function asDb(db: ReturnType<typeof makeDb>): Db {
  return db as unknown as Db;
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
    db.xPTransaction.findUnique.mockResolvedValue(null);
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
    expect(db.xPTransaction.findUnique).not.toHaveBeenCalled();
    expect(db.xPTransaction.create).not.toHaveBeenCalled();
  });

  it('skips when the dedupe key was already recorded', async () => {
    const db = makeDb();
    db.xPTransaction.findUnique.mockResolvedValue({ id: 'xp1' });

    const applied = await awardPoints(asDb(db), {
      userId: 'u1',
      amount: 4,
      reason: 'habit:checkin:h1:2026-10-01',
      dedupeKey: 'habit:checkin:h1:2026-10-01',
    });

    expect(applied).toBe(0);
    expect(db.xPTransaction.create).not.toHaveBeenCalled();
  });

  it('treats a unique-constraint race as already applied', async () => {
    const db = makeDb();
    db.xPTransaction.findUnique.mockResolvedValue(null);
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
    db.xPTransaction.findUnique.mockResolvedValue(null);
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
    expect(db.xPTransaction.findUnique).not.toHaveBeenCalled();
    expect(db.xPTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dedupeKey: null }) })
    );
  });
});

describe('revokePoints', () => {
  it('returns the amount that was removed', async () => {
    const db = makeDb();
    db.xPTransaction.findUnique.mockResolvedValue({ amount: -5 });
    db.xPTransaction.deleteMany.mockResolvedValue({ count: 1 });

    const removed = await revokePoints(asDb(db), 'u1', 'habit:missed:h9:2026-10-01');

    expect(removed).toBe(5);
    expect(db.xPTransaction.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', dedupeKey: 'habit:missed:h9:2026-10-01' },
    });
  });

  it('returns 0 and deletes nothing when nothing was recorded', async () => {
    const db = makeDb();
    db.xPTransaction.findUnique.mockResolvedValue(null);

    const removed = await revokePoints(asDb(db), 'u1', 'habit:checkin:h9:2026-10-01');

    expect(removed).toBe(0);
    expect(db.xPTransaction.deleteMany).not.toHaveBeenCalled();
  });
});
