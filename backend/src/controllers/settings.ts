import type { Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';
import { z } from 'zod';

export async function getSettings(request: AuthRequest, response: Response) {
  const settings = await prisma.userSettings.upsert({
    where: { userId: request.userId! },
    update: {},
    create: { userId: request.userId! },
  });
  return ok(response, settings);
}

const settingsSchema = z.object({
  wakeUpTime: z.string().max(10).optional(),
  sleepTime: z.string().max(10).optional(),
  breakfastTime: z.string().max(10).optional(),
  lunchTime: z.string().max(10).optional(),
  dinnerTime: z.string().max(10).optional(),
  defaultFocusDuration: z.number().int().min(5).max(180).optional(),
  defaultBreakDuration: z.number().int().min(1).max(60).optional(),
  notificationsEnabled: z.boolean().optional(),
});

export async function updateSettings(request: AuthRequest, response: Response) {
  const parsed = settingsSchema.safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid settings data');
  const settings = await prisma.userSettings.upsert({
    where: { userId: request.userId! },
    update: parsed.data,
    create: { userId: request.userId!, ...parsed.data },
  });
  return ok(response, settings);
}

const milestoneSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function createGoalMilestone(request: AuthRequest, response: Response) {
  const goal = await prisma.goal.findFirst({ where: { id: String(request.params.id), userId: request.userId } });
  if (!goal) return fail(response, 'Goal not found', 404);
  const parsed = milestoneSchema.safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid milestone data');
  const milestone = await prisma.goalMilestone.create({ data: { ...parsed.data, goalId: goal.id } });
  return ok(response, milestone, 201);
}

export async function updateGoalMilestone(request: AuthRequest, response: Response) {
  const goal = await prisma.goal.findFirst({ where: { id: String(request.params.id), userId: request.userId } });
  if (!goal) return fail(response, 'Goal not found', 404);
  const milestone = await prisma.goalMilestone.findFirst({
    where: { id: String(request.params.milestoneId), goalId: goal.id },
  });
  if (!milestone) return fail(response, 'Milestone not found', 404);
  const parsed = milestoneSchema.partial().extend({ completed: z.boolean().optional() }).safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid milestone data');
  const updated = await prisma.goalMilestone.update({
    where: { id: milestone.id },
    data: { ...parsed.data, completedAt: parsed.data.completed ? new Date() : null },
  });
  return ok(response, updated);
}

export async function deleteGoalMilestone(request: AuthRequest, response: Response) {
  const goal = await prisma.goal.findFirst({ where: { id: String(request.params.id), userId: request.userId } });
  if (!goal) return fail(response, 'Goal not found', 404);
  const milestone = await prisma.goalMilestone.findFirst({
    where: { id: String(request.params.milestoneId), goalId: goal.id },
  });
  if (!milestone) return fail(response, 'Milestone not found', 404);
  await prisma.goalMilestone.delete({ where: { id: milestone.id } });
  return ok(response, { deleted: true });
}

export async function createBrandMilestone(request: AuthRequest, response: Response) {
  const project = await prisma.brandProject.findFirst({ where: { id: String(request.params.id), userId: request.userId } });
  if (!project) return fail(response, 'Brand project not found', 404);
  const parsed = milestoneSchema.safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid milestone data');
  const milestone = await prisma.brandMilestone.create({ data: { ...parsed.data, brandProjectId: project.id } });
  return ok(response, milestone, 201);
}

export async function updateBrandMilestone(request: AuthRequest, response: Response) {
  const project = await prisma.brandProject.findFirst({ where: { id: String(request.params.id), userId: request.userId } });
  if (!project) return fail(response, 'Brand project not found', 404);
  const milestone = await prisma.brandMilestone.findFirst({
    where: { id: String(request.params.milestoneId), brandProjectId: project.id },
  });
  if (!milestone) return fail(response, 'Milestone not found', 404);
  const parsed = milestoneSchema.partial().extend({ completed: z.boolean().optional() }).safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid milestone data');
  const updated = await prisma.brandMilestone.update({
    where: { id: milestone.id },
    data: { ...parsed.data, completedAt: parsed.data.completed ? new Date() : null },
  });
  return ok(response, updated);
}

export async function deleteBrandMilestone(request: AuthRequest, response: Response) {
  const project = await prisma.brandProject.findFirst({ where: { id: String(request.params.id), userId: request.userId } });
  if (!project) return fail(response, 'Brand project not found', 404);
  const milestone = await prisma.brandMilestone.findFirst({
    where: { id: String(request.params.milestoneId), brandProjectId: project.id },
  });
  if (!milestone) return fail(response, 'Milestone not found', 404);
  await prisma.brandMilestone.delete({ where: { id: milestone.id } });
  return ok(response, { deleted: true });
}