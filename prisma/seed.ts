import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

async function main() {
  const email = 'user';
  const password = 'Abi14';
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'user',
      passwordHash,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    },
    create: {
      name: 'user',
      email,
      passwordHash,
      timezone: 'UTC',
      emailVerified: true,
      settings: { create: {} },
    },
  });

  const userId = user.id;

  const existingTasks = await prisma.task.count({ where: { userId } });
  if (existingTasks > 0) {
    console.log(`User "${email}" already has ${existingTasks} tasks — skipping dummy data.`);
    return;
  }

  // Skills
  const skillDev = await prisma.skill.create({
    data: { userId, name: 'TypeScript', currentLevel: 3, targetLevel: 5, progress: 62 },
  });
  const skillDesign = await prisma.skill.create({
    data: { userId, name: 'UI Design', currentLevel: 2, targetLevel: 5, progress: 40 },
  });
  const skillWriting = await prisma.skill.create({
    data: { userId, name: 'Technical Writing', currentLevel: 1, targetLevel: 4, progress: 25 },
  });

  // Goals
  const goalShip = await prisma.goal.create({
    data: {
      userId,
      title: 'Ship productivity app v1.0',
      description: 'Finish core features and deploy publicly.',
      progress: 65,
      deadline: daysFromNow(30),
      status: 'ACTIVE',
      milestones: {
        create: [
          { title: 'Complete CRUD API', completed: true, completedAt: daysAgo(10) },
          { title: 'Finish dashboard UI', completed: true, completedAt: daysAgo(5) },
          { title: 'Pass full QA pass', completed: false },
          { title: 'Deploy to production', completed: false },
        ],
      },
    },
  });
  const goalFitness = await prisma.goal.create({
    data: {
      userId,
      title: 'Run a 10K',
      description: 'Build endurance over 12 weeks.',
      progress: 35,
      deadline: daysFromNow(60),
      status: 'ACTIVE',
      milestones: {
        create: [
          { title: 'Run 5K without stopping', completed: true, completedAt: daysAgo(14) },
          { title: 'Run 7.5K', completed: false },
          { title: 'Race day', completed: false },
        ],
      },
    },
  });
  const goalRead = await prisma.goal.create({
    data: {
      userId,
      title: 'Read 24 books this year',
      progress: 50,
      deadline: daysFromNow(120),
      status: 'ACTIVE',
      milestones: {
        create: [{ title: '12 books done', completed: true, completedAt: daysAgo(7) }],
      },
    },
  });

  // Tasks
  const tasksData = [
    {
      title: 'Write launch announcement blog post',
      description: 'Draft and publish the v1.0 announcement.',
      category: 'Content',
      priority: 'HIGH' as const,
      status: 'IN_PROGRESS' as const,
      scheduledDate: daysAgo(0),
      scheduledTime: '10:00',
      deadlineTime: '17:00',
      recurrence: 'NONE' as const,
      isMandatory: true,
      reminderEnabled: true,
      estimatedMinutes: 90,
      goalId: goalShip.id,
      skillId: skillWriting.id,
    },
    {
      title: 'Review pull requests',
      category: 'Work',
      priority: 'MEDIUM' as const,
      status: 'TODO' as const,
      scheduledDate: daysAgo(0),
      scheduledTime: '14:00',
      recurrence: 'DAILY' as const,
      estimatedMinutes: 45,
      isMandatory: true,
    },
    {
      title: 'Evening run',
      category: 'Health',
      priority: 'MEDIUM' as const,
      status: 'TODO' as const,
      scheduledDate: daysAgo(0),
      scheduledTime: '18:30',
      recurrence: 'DAILY' as const,
      estimatedMinutes: 40,
      goalId: goalFitness.id,
    },
    {
      title: 'Design settings page polish',
      category: 'Design',
      priority: 'LOW' as const,
      status: 'TODO' as const,
      scheduledDate: daysAgo(1),
      recurrence: 'NONE' as const,
      estimatedMinutes: 60,
      skillId: skillDesign.id,
      goalId: goalShip.id,
    },
    {
      title: 'Fix socket event naming',
      description: 'Align backend plural events with frontend singular listeners.',
      category: 'Bug',
      priority: 'URGENT' as const,
      status: 'COMPLETED' as const,
      completedAt: daysAgo(1),
      scheduledDate: daysAgo(1),
      recurrence: 'NONE' as const,
      estimatedMinutes: 30,
      goalId: goalShip.id,
      skillId: skillDev.id,
    },
    {
      title: 'Complete TypeScript generics lesson',
      category: 'Learning',
      priority: 'MEDIUM' as const,
      status: 'COMPLETED' as const,
      completedAt: daysAgo(2),
      scheduledDate: daysAgo(2),
      recurrence: 'NONE' as const,
      estimatedMinutes: 50,
      skillId: skillDev.id,
    },
    {
      title: 'Plan next week',
      description: 'Review goals and schedule key tasks.',
      category: 'Planning',
      priority: 'MEDIUM' as const,
      status: 'TODO' as const,
      scheduledDate: daysFromNow(2),
      scheduledTime: '09:00',
      recurrence: 'WEEKLY' as const,
      estimatedMinutes: 30,
      isMandatory: true,
    },
    {
      title: 'Grocery shopping',
      category: 'Personal',
      priority: 'LOW' as const,
      status: 'TODO' as const,
      scheduledDate: daysFromNow(1),
      recurrence: 'WEEKLY' as const,
      estimatedMinutes: 45,
    },
    {
      title: 'Read 30 minutes',
      category: 'Learning',
      priority: 'LOW' as const,
      status: 'TODO' as const,
      scheduledDate: daysAgo(0),
      scheduledTime: '21:00',
      recurrence: 'DAILY' as const,
      estimatedMinutes: 30,
      goalId: goalRead.id,
    },
    {
      title: 'Archive old experiments',
      category: 'Cleanup',
      priority: 'LOW' as const,
      status: 'ARCHIVED' as const,
      scheduledDate: daysAgo(7),
      recurrence: 'NONE' as const,
      estimatedMinutes: 20,
    },
  ];

  const createdTasks = [];
  for (const t of tasksData) {
    createdTasks.push(await prisma.task.create({ data: { userId, ...t } }));
  }

  // Task check-ins (past week for the daily review task)
  const reviewTask = createdTasks[1];
  for (let i = 1; i <= 5; i++) {
    const date = daysAgo(i);
    await prisma.taskCheckIn.create({
      data: {
        taskId: reviewTask.id,
        userId,
        date,
        checked: i !== 3,
        checkedAt: i !== 3 ? date : null,
      },
    });
  }

  // Habits + completions
  const habitMeditate = await prisma.habit.create({
    data: { userId, name: 'Meditate 10 minutes', description: 'Morning mindfulness.', frequency: 'daily', active: true },
  });
  const habitWater = await prisma.habit.create({
    data: { userId, name: 'Drink 8 glasses of water', frequency: 'daily', active: true },
  });
  const habitJournal = await prisma.habit.create({
    data: { userId, name: 'Journal before bed', frequency: 'daily', active: true },
  });
  const habitGym = await prisma.habit.create({
    data: { userId, name: 'Gym session', frequency: '3x/week', active: true },
  });
  const habitScreen = await prisma.habit.create({
    data: { userId, name: 'No screens after 22:00', frequency: 'daily', active: false },
  });

  // Completions: last 14 days with some gaps
  const habitList = [habitMeditate, habitWater, habitJournal, habitGym];
  for (const habit of habitList) {
    for (let i = 0; i < 14; i++) {
      // meditate: almost every day; water: every other; journal: misses some; gym: Mon/Wed/Fri pattern
      let done = false;
      if (habit.id === habitMeditate.id) done = i % 7 !== 5;
      else if (habit.id === habitWater.id) done = i % 2 === 0;
      else if (habit.id === habitJournal.id) done = i % 3 !== 0;
      else if (habit.id === habitGym.id) {
        const day = daysAgo(i).getDay();
        done = day === 1 || day === 3 || day === 5;
      }
      if (done) {
        await prisma.habitCompletion.create({
          data: { habitId: habit.id, userId, date: daysAgo(i) },
        });
      }
    }
  }
  // Today's completions for meditate/water already created by the loop above (i=0).

  // Focus sessions (past 10 days)
  const completedTasks = createdTasks.filter((t) => t.status === 'COMPLETED');
  for (let i = 0; i < 10; i++) {
    const count = i % 3 === 0 ? 2 : 1;
    for (let j = 0; j < count; j++) {
      const started = daysAgo(i);
      started.setHours(10 + j, 0, 0, 0);
      const duration = [25, 50, 25, 90][j % 4];
      const completedAt = new Date(started.getTime() + duration * 60000);
      await prisma.focusSession.create({
        data: {
          userId,
          taskId: j === 0 && completedTasks.length > i % completedTasks.length ? completedTasks[i % completedTasks.length].id : undefined,
          durationMinutes: duration,
          startedAt: started,
          completedAt,
          status: 'COMPLETED',
        },
      });
    }
  }

  // Journal entries (past 7 days)
  const journalData = [
    {
      accomplishments: 'Shipped the auth flow and fixed cookie handling.',
      lessons: 'Cookie SameSite=None needs Secure in production.',
      procrastination: 'Avoided code review for an hour.',
      improvements: 'Time-box review sessions to 30 minutes.',
      gratitude: 'Grateful for a focused morning.',
      passionScore: 8,
    },
    {
      accomplishments: 'Wrote 1200 words of the launch post.',
      lessons: 'Outlining first saves rewriting later.',
      procrastination: 'Scrolling before starting deep work.',
      improvements: 'Phone in another room during writing blocks.',
      gratitude: 'Coffee was perfect today.',
      passionScore: 7,
    },
    {
      accomplishments: 'Completed 5K run and two focus sessions.',
      lessons: 'Afternoon runs are harder than morning ones.',
      procrastination: 'Almost skipped the run.',
      improvement: 'Lay out running clothes the night before.',
      gratitude: 'Sunny weather.',
      passionScore: 9,
    },
    {
      accomplishments: 'Refactored the analytics hook.',
      lessons: 'Narrow response types at the API boundary.',
      procrastination: 'None today.',
      improvements: 'Keep refactors under an hour.',
      gratitude: 'Helpful teammate feedback.',
      passionScore: 8,
    },
    {
      accomplishments: 'Reviewed three PRs and left detailed comments.',
      lessons: 'Examples in comments beat abstract guidance.',
      procrastination: 'Email inbox in the morning.',
      improvements: 'Batch email to twice a day.',
      gratitude: 'Good standup.',
      passionScore: 6,
    },
    {
      accomplishments: 'Finished the TypeScript generics lesson.',
      lessons: 'Conditional types click with real examples.',
      procrastination: 'Video rabbit hole.',
      improvements: 'Use a study timer.',
      gratitude: 'Quiet evening.',
      passionScore: 7,
    },
    {
      accomplishments: 'Planned the week ahead.',
      lessons: 'Fewer, clearer priorities work better.',
      procrastination: 'Late start.',
      improvements: 'Sunday evening planning ritual.',
      gratitude: 'Restful weekend.',
      passionScore: 8,
    },
  ];
  // Fix typo key from object literal above (improvements vs improvement)
  for (let i = 0; i < journalData.length; i++) {
    const raw = journalData[i] as Record<string, unknown>;
    const improvements =
      (raw.improvements as string | undefined) ?? (raw.improvement as string | undefined) ?? null;
    await prisma.journalEntry.create({
      data: {
        userId,
        date: daysAgo(i),
        accomplishments: raw.accomplishments as string,
        lessons: raw.lessons as string,
        procrastination: raw.procrastination as string,
        improvements,
        gratitude: raw.gratitude as string,
        passionScore: raw.passionScore as number,
      },
    });
  }

  // Reminders
  await prisma.reminder.createMany({
    data: [
      {
        userId,
        title: 'Standup meeting',
        description: 'Daily team sync.',
        reminderDate: daysFromNow(1),
        reminderTime: '09:30',
        repeatType: 'DAILY',
        enabled: true,
      },
      {
        userId,
        title: 'Pay rent',
        reminderDate: daysFromNow(5),
        reminderTime: '10:00',
        repeatType: 'MONTHLY',
        enabled: true,
      },
      {
        userId,
        title: 'Call mom',
        reminderDate: daysFromNow(3),
        reminderTime: '19:00',
        repeatType: 'WEEKLY',
        enabled: true,
      },
      {
        userId,
        title: 'Old one-off reminder',
        reminderDate: daysAgo(3),
        reminderTime: '12:00',
        repeatType: 'NONE',
        enabled: false,
      },
    ],
  });

  // Brand projects
  await prisma.brandProject.create({
    data: {
      userId,
      title: 'Personal Productivity Manager',
      description: 'Open-source productivity dashboard.',
      status: 'ACTIVE',
      progress: 70,
      milestones: {
        create: [
          { title: 'MVP complete', completed: true, completedAt: daysAgo(12) },
          { title: 'Design system', completed: true, completedAt: daysAgo(6) },
          { title: 'Public launch', completed: false },
        ],
      },
    },
  });
  await prisma.brandProject.create({
    data: {
      userId,
      title: 'Dev Tips Newsletter',
      description: 'Weekly short tips for developers.',
      status: 'IDEA',
      progress: 10,
      milestones: {
        create: [{ title: 'Name and logo', completed: false }],
      },
    },
  });
  await prisma.brandProject.create({
    data: {
      userId,
      title: 'YouTube channel',
      status: 'PAUSED',
      progress: 25,
      milestones: {
        create: [
          { title: 'First 10 videos', completed: true, completedAt: daysAgo(30) },
          { title: '100 subscribers', completed: false },
        ],
      },
    },
  });

  // XP transactions (past 14 days)
  const xpReasons = [
    { amount: 20, reason: 'Completed task: Fix socket event naming', taskId: createdTasks[4].id },
    { amount: 20, reason: 'Completed task: TypeScript lesson', taskId: createdTasks[5].id },
    { amount: 5, reason: 'Habit completed: Meditate', habitId: habitMeditate.id },
    { amount: 5, reason: 'Habit completed: Water', habitId: habitWater.id },
    { amount: 10, reason: 'Focus session 50 min' },
    { amount: 10, reason: 'Focus session 90 min' },
    { amount: 5, reason: 'Journal entry written' },
    { amount: 15, reason: 'Milestone completed: Complete CRUD API' },
    { amount: 15, reason: 'Milestone completed: Finish dashboard UI' },
    { amount: 5, reason: 'Habit completed: Journal', habitId: habitJournal.id },
    { amount: 5, reason: 'Habit completed: Gym', habitId: habitGym.id },
    { amount: 20, reason: 'Weekly review done' },
  ];
  for (let i = 0; i < xpReasons.length; i++) {
    const xp = xpReasons[i];
    await prisma.xPTransaction.create({
      data: {
        userId,
        amount: xp.amount,
        reason: xp.reason,
        taskId: xp.taskId,
        habitId: xp.habitId,
        createdAt: daysAgo(i % 14),
      },
    });
  }

  // Daily stats (past 14 days)
  for (let i = 0; i < 14; i++) {
    const tasksCompleted = [3, 2, 4, 1, 3, 2, 0, 3, 4, 2, 1, 3, 2, 4][i];
    const tasksTotal = 5;
    const habitsCompleted = [3, 2, 4, 3, 2, 4, 3, 3, 4, 2, 3, 4, 2, 3][i];
    const habitsTotal = 4;
    const focusMinutes = [75, 50, 120, 25, 75, 90, 0, 50, 75, 25, 100, 50, 25, 90][i];
    const xpEarned = [45, 30, 60, 15, 50, 40, 10, 45, 65, 35, 30, 55, 40, 70][i];
    const productivityPercentage = Math.round(
      ((tasksCompleted / tasksTotal) * 0.5 + (habitsCompleted / habitsTotal) * 0.5) * 100
    );
    await prisma.dailyStats.upsert({
      where: { userId_date: { userId, date: daysAgo(i) } },
      update: { tasksCompleted, tasksTotal, habitsCompleted, habitsTotal, focusMinutes, xpEarned, productivityPercentage },
      create: {
        userId,
        date: daysAgo(i),
        productivityPercentage,
        tasksCompleted,
        tasksTotal,
        habitsCompleted,
        habitsTotal,
        focusMinutes,
        xpEarned,
      },
    });
  }

  // Transactions (past 45 days)
  const txData = [
    { type: 'INCOME', category: 'SALARY', amount: 3200, description: 'Monthly salary', daysBack: 3, isRecurring: true, recurrencePattern: 'monthly', source: 'Employer' },
    { type: 'INCOME', category: 'FREELANCE', amount: 850, description: 'Landing page project', daysBack: 8, source: 'Acme Co' },
    { type: 'INCOME', category: 'INVESTMENTS', amount: 120.5, description: 'Dividend payout', daysBack: 15, source: 'Brokerage' },
    { type: 'INCOME', category: 'GIFTS', amount: 100, description: 'Birthday gift', daysBack: 20 },
    { type: 'EXPENSE', category: 'HOUSING', amount: 1100, description: 'Rent', daysBack: 3, isRecurring: true, recurrencePattern: 'monthly' },
    { type: 'EXPENSE', category: 'FOOD', amount: 62.4, description: 'Weekly groceries', daysBack: 2 },
    { type: 'EXPENSE', category: 'FOOD', amount: 28.5, description: 'Coffee shop', daysBack: 1 },
    { type: 'EXPENSE', category: 'FOOD', amount: 45, description: 'Dinner out', daysBack: 5 },
    { type: 'EXPENSE', category: 'TRANSPORTATION', amount: 35, description: 'Metro card top-up', daysBack: 4, isRecurring: true, recurrencePattern: 'monthly' },
    { type: 'EXPENSE', category: 'TRANSPORTATION', amount: 52, description: 'Rideshare', daysBack: 9 },
    { type: 'EXPENSE', category: 'UTILITIES', amount: 78.2, description: 'Electricity bill', daysBack: 6, isRecurring: true, recurrencePattern: 'monthly' },
    { type: 'EXPENSE', category: 'UTILITIES', amount: 45, description: 'Internet', daysBack: 6, isRecurring: true, recurrencePattern: 'monthly' },
    { type: 'EXPENSE', category: 'SUBSCRIPTIONS', amount: 15.99, description: 'Streaming service', daysBack: 10, isRecurring: true, recurrencePattern: 'monthly' },
    { type: 'EXPENSE', category: 'SUBSCRIPTIONS', amount: 20, description: 'Cloud storage', daysBack: 12, isRecurring: true, recurrencePattern: 'monthly' },
    { type: 'EXPENSE', category: 'SUBSCRIPTIONS', amount: 12, description: 'Dev tool subscription', daysBack: 14, isRecurring: true, recurrencePattern: 'monthly' },
    { type: 'EXPENSE', category: 'ENTERTAINMENT', amount: 32, description: 'Cinema tickets', daysBack: 7 },
    { type: 'EXPENSE', category: 'SHOPPING', amount: 89.99, description: 'Running shoes', daysBack: 11 },
    { type: 'EXPENSE', category: 'SHOPPING', amount: 24.9, description: 'Notebooks and pens', daysBack: 18 },
    { type: 'EXPENSE', category: 'FOOD', amount: 55.8, description: 'Groceries', daysBack: 9 },
    { type: 'EXPENSE', category: 'FOOD', amount: 18.75, description: 'Lunch', daysBack: 13 },
    { type: 'INCOME', category: 'FREELANCE', amount: 400, description: 'Consulting call', daysBack: 25, source: 'Startup X' },
    { type: 'EXPENSE', category: 'HOUSING', amount: 1100, description: 'Rent (last month)', daysBack: 33, isRecurring: true, recurrencePattern: 'monthly' },
    { type: 'EXPENSE', category: 'FOOD', amount: 70.2, description: 'Groceries', daysBack: 30 },
    { type: 'EXPENSE', category: 'HEALTHCARE', amount: 40, description: 'Pharmacy', daysBack: 35 },
  ] as const;

  for (const tx of txData) {
    await prisma.transaction.create({
      data: {
        userId,
        type: tx.type,
        category: tx.category,
        amount: tx.amount,
        description: tx.description,
        date: daysAgo(tx.daysBack),
        isRecurring: 'isRecurring' in tx ? tx.isRecurring : false,
        recurrencePattern: 'recurrencePattern' in tx ? tx.recurrencePattern : undefined,
        source: 'source' in tx ? tx.source : undefined,
      },
    });
  }

  console.log(`Seeded user "${email}" with dummy data:`);
  console.log(`  tasks: ${await prisma.task.count({ where: { userId } })}`);
  console.log(`  habits: ${await prisma.habit.count({ where: { userId } })}`);
  console.log(`  goals: ${await prisma.goal.count({ where: { userId } })}`);
  console.log(`  skills: ${await prisma.skill.count({ where: { userId } })}`);
  console.log(`  focusSessions: ${await prisma.focusSession.count({ where: { userId } })}`);
  console.log(`  journalEntries: ${await prisma.journalEntry.count({ where: { userId } })}`);
  console.log(`  reminders: ${await prisma.reminder.count({ where: { userId } })}`);
  console.log(`  brandProjects: ${await prisma.brandProject.count({ where: { userId } })}`);
  console.log(`  transactions: ${await prisma.transaction.count({ where: { userId } })}`);
  console.log(`  dailyStats: ${await prisma.dailyStats.count({ where: { userId } })}`);
  console.log(`  xpTransactions: ${await prisma.xPTransaction.count({ where: { userId } })}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
