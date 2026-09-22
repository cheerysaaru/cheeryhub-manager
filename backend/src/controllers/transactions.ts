import { z } from 'zod';
import type { Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';

const transactionSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.enum([
    'SALARY', 'FREELANCE', 'INVESTMENTS', 'BUSINESS', 'GIFTS', 'REFUNDS', 'OTHER_INCOME',
    'HOUSING', 'FOOD', 'TRANSPORTATION', 'UTILITIES', 'HEALTHCARE', 'ENTERTAINMENT',
    'SHOPPING', 'EDUCATION', 'PERSONAL_CARE', 'SUBSCRIPTIONS', 'INSURANCE',
    'DEBT_PAYMENTS', 'SAVINGS', 'INVESTMENTS_EXPENSE', 'GIFTS_DONATIONS', 'OTHER_EXPENSE'
  ]),
  amount: z.number().positive().max(99999999.99),
  description: z.string().max(500).optional(),
  date: z.coerce.date().optional(),
  isRecurring: z.boolean().optional(),
  recurrencePattern: z.string().max(50).optional(),
  source: z.string().max(100).optional(),
});

function getQueryParam(query: Record<string, unknown>, key: string): string | undefined {
  const value = query[key];
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

export async function listTransactions(request: AuthRequest, response: Response) {
  const startDate = getQueryParam(request.query, 'startDate');
  const endDate = getQueryParam(request.query, 'endDate');
  const type = getQueryParam(request.query, 'type');
  const category = getQueryParam(request.query, 'category');

  const where: any = { userId: request.userId };

  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(startDate);
    if (endDate) where.date.lte = new Date(endDate);
  }
  if (type) where.type = type;
  if (category) where.category = category;

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { date: 'desc' },
  });

  return ok(response, transactions);
}

export async function createTransaction(request: AuthRequest, response: Response) {
  const parsed = transactionSchema.safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid request data', 400);

  const transaction = await prisma.transaction.create({
    data: { ...parsed.data, userId: request.userId! },
  });

  return ok(response, transaction, 201);
}

export async function updateTransaction(request: AuthRequest, response: Response) {
  const parsed = transactionSchema.partial().safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid request data', 400);

  const id = String(request.params.id);
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: request.userId },
  });
  if (!existing) return fail(response, 'Transaction not found', 404);

  const updated = await prisma.transaction.update({
    where: { id: existing.id },
    data: parsed.data,
  });

  return ok(response, updated);
}

export async function deleteTransaction(request: AuthRequest, response: Response) {
  const id = String(request.params.id);
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: request.userId },
  });
  if (!existing) return fail(response, 'Transaction not found', 404);

  await prisma.transaction.delete({ where: { id: existing.id } });
  return ok(response, { deleted: true });
}

export async function getWeeklyReport(request: AuthRequest, response: Response) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const weekStart = new Date(today);
  weekStart.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const [weeklyTransactions, monthlyTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: request.userId!, date: { gte: weekStart, lt: weekEnd } },
      orderBy: { date: 'desc' },
    }),
    prisma.transaction.findMany({
      where: { userId: request.userId!, date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: 'desc' },
    }),
  ]);

  const weeklyIncome = weeklyTransactions
    .filter(t => t.type === 'INCOME')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const weeklyExpense = weeklyTransactions
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const monthlyIncome = monthlyTransactions
    .filter(t => t.type === 'INCOME')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const monthlyExpense = monthlyTransactions
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const byCategory = {
    income: {} as Record<string, number>,
    expense: {} as Record<string, number>,
  };
  monthlyTransactions.forEach(t => {
    const cat = byCategory[t.type === 'INCOME' ? 'income' : 'expense'];
    cat[t.category] = (cat[t.category] || 0) + Number(t.amount);
  });

  return ok(response, {
    period: {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      monthStart: monthStart.toISOString().slice(0, 10),
      monthEnd: new Date(monthEnd.getTime() - 1).toISOString().slice(0, 10),
    },
    weekly: {
      income: weeklyIncome,
      expense: weeklyExpense,
      net: weeklyIncome - weeklyExpense,
      count: weeklyTransactions.length,
      transactions: weeklyTransactions,
    },
    monthly: {
      income: monthlyIncome,
      expense: monthlyExpense,
      net: monthlyIncome - monthlyExpense,
      count: monthlyTransactions.length,
      byCategory,
    },
  });
}

export async function getMonthlyReport(request: AuthRequest, response: Response) {
  const year = getQueryParam(request.query, 'year');
  const month = getQueryParam(request.query, 'month');
  const targetYear = year ? parseInt(year) : new Date().getFullYear();
  const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();

  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 1);

  const transactions = await prisma.transaction.findMany({
    where: { userId: request.userId!, date: { gte: monthStart, lt: monthEnd } },
    orderBy: { date: 'desc' },
  });

  const income = transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
  const expense = transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);

  const byCategory = {
    income: {} as Record<string, number>,
    expense: {} as Record<string, number>,
  };
  transactions.forEach(t => {
    const cat = byCategory[t.type === 'INCOME' ? 'income' : 'expense'];
    cat[t.category] = (cat[t.category] || 0) + Number(t.amount);
  });

  const byDay: Record<string, { income: number; expense: number }> = {};
  transactions.forEach(t => {
    const day = new Date(t.date).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { income: 0, expense: 0 };
    if (t.type === 'INCOME') byDay[day].income += Number(t.amount);
    else byDay[day].expense += Number(t.amount);
  });

  return ok(response, {
    period: {
      year: targetYear,
      month: targetMonth + 1,
      monthStart: monthStart.toISOString().slice(0, 10),
      monthEnd: new Date(monthEnd.getTime() - 1).toISOString().slice(0, 10),
    },
    summary: {
      income,
      expense,
      net: income - expense,
      count: transactions.length,
    },
    byCategory,
    byDay: Object.entries(byDay).map(([date, values]) => ({ date, ...values })),
    transactions,
  });
}