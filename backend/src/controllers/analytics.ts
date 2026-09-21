import type { Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { ok } from '../utils/response';

export async function analytics(request: AuthRequest, response: Response) {
  const [stats, xp, tasks, habits] = await Promise.all([prisma.dailyStats.findMany({ where: { userId: request.userId }, orderBy: { date: 'asc' } }), prisma.xPTransaction.aggregate({ where: { userId: request.userId }, _sum: { amount: true } }), prisma.task.count({ where: { userId: request.userId, status: 'COMPLETED' } }), prisma.habitCompletion.count({ where: { userId: request.userId } })]);
  return ok(response, { stats, totals: { xp: xp._sum.amount ?? 0, tasksCompleted: tasks, habitsCompleted: habits }, period: request.params.period ?? 'all' });
}
export async function exportData(request: AuthRequest, response: Response) {
  const userId = request.userId!; const [user, settings, tasks, habits, goals, skills, focusSessions, journalEntries, reminders, xpTransactions, dailyStats, brandProjects] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, timezone: true, createdAt: true } }), prisma.userSettings.findUnique({ where: { userId } }), prisma.task.findMany({ where: { userId } }), prisma.habit.findMany({ where: { userId }, include: { completions: true } }), prisma.goal.findMany({ where: { userId }, include: { milestones: true } }), prisma.skill.findMany({ where: { userId } }), prisma.focusSession.findMany({ where: { userId } }), prisma.journalEntry.findMany({ where: { userId } }), prisma.reminder.findMany({ where: { userId } }), prisma.xPTransaction.findMany({ where: { userId } }), prisma.dailyStats.findMany({ where: { userId } }), prisma.brandProject.findMany({ where: { userId }, include: { milestones: true } })]);
  response.setHeader('Content-Disposition', `attachment; filename="productivity-backup-${new Date().toISOString().slice(0, 10)}.json"`); return response.json({ version: 1, exportedAt: new Date().toISOString(), user, settings, tasks, habits, goals, skills, focusSessions, journalEntries, reminders, xpTransactions, dailyStats, brandProjects });
}