import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
async function main() {
  const email = process.env.SEED_EMAIL ?? 'you@example.com';
  const user = await prisma.user.upsert({ where: { email }, update: {}, create: { name: 'Your name', email, passwordHash: await bcrypt.hash(process.env.SEED_PASSWORD ?? 'change-this-password', 12), timezone: process.env.SEED_TIMEZONE ?? 'UTC', settings: { create: {} } } });
  await prisma.task.upsert({ where: { id: 'seed-plan-the-day' }, update: { userId: user.id, scheduledTime: '07:30', recurrence: 'DAILY', isMandatory: true, reminderEnabled: true }, create: { id: 'seed-plan-the-day', userId: user.id, title: 'Plan the day', category: 'Planning', priority: 'HIGH', scheduledTime: '07:30', recurrence: 'DAILY', isMandatory: true, reminderEnabled: true } });
  await prisma.task.upsert({ where: { id: 'seed-deep-work' }, update: { userId: user.id, scheduledTime: '09:00', recurrence: 'DAILY', isMandatory: true, reminderEnabled: true }, create: { id: 'seed-deep-work', userId: user.id, title: 'Deep work session', category: 'Work', priority: 'MEDIUM', scheduledTime: '09:00', recurrence: 'DAILY', isMandatory: true, reminderEnabled: true } });
  await prisma.habit.createMany({ data: [{ userId: user.id, name: 'Morning movement', frequency: 'Daily' }, { userId: user.id, name: 'Read before bed', frequency: 'Daily' }] });
  await prisma.goal.create({ data: { userId: user.id, title: 'Build a sustainable personal system', description: 'A durable foundation for focused work and reflection.' } });
  await prisma.skill.createMany({ data: [{ userId: user.id, name: 'Deep work' }, { userId: user.id, name: 'Writing' }] });
}
main().finally(() => prisma.$disconnect());