export interface User {
  id: string;
  name: string;
  email: string;
  timezone: string;
  createdAt: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
  scheduledDate?: string;
  scheduledTime?: string;
  deadlineTime?: string;
  timerStartedAt?: string;
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  isMandatory: boolean;
  reminderEnabled: boolean;
  estimatedMinutes?: number;
  completedAt?: string;
  deletedAt?: string;
  goalId?: string;
  skillId?: string;
  createdAt: string;
  updatedAt: string;
  checkedToday: boolean;
  checkedDays: number;
  missedDays: number;
  isOverdue: boolean;
}

export interface Habit {
  id: string;
  userId: string;
  name: string;
  description?: string;
  frequency: string;
  active: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  completedToday: boolean;
  completedDays: number;
  weekCompletedDays: number;
  weekStart: string;
  weekDates: string[];
  completedDates: string[];
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  progress: number;
  deadline?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  milestones: GoalMilestone[];
  tasks?: Task[];
}

export interface GoalMilestone {
  id: string;
  goalId: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface Skill {
  id: string;
  userId: string;
  name: string;
  currentLevel: number;
  targetLevel: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface FocusSession {
  id: string;
  userId: string;
  taskId?: string;
  durationMinutes: number;
  startedAt: string;
  completedAt?: string;
  status: 'RUNNING' | 'COMPLETED' | 'CANCELLED';
  task?: Task;
}

export interface JournalEntry {
  id: string;
  userId: string;
  date: string;
  accomplishments?: string;
  lessons?: string;
  procrastination?: string;
  improvements?: string;
  gratitude?: string;
  passionScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  description?: string;
  reminderDate: string;
  reminderTime?: string;
  repeatType: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface XPTransaction {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  taskId?: string;
  habitId?: string;
  createdAt: string;
}

export interface DailyStats {
  id: string;
  userId: string;
  date: string;
  productivityPercentage: number;
  tasksCompleted: number;
  tasksTotal: number;
  habitsCompleted: number;
  habitsTotal: number;
  focusMinutes: number;
  xpEarned: number;
}

export interface BrandProject {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: 'IDEA' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  progress: number;
  createdAt: string;
  updatedAt: string;
  milestones: BrandMilestone[];
}

export interface BrandMilestone {
  id: string;
  brandProjectId: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  description?: string;
  date: string;
  isRecurring: boolean;
  recurrencePattern?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyReport {
  period: {
    weekStart: string;
    weekEnd: string;
    monthStart: string;
    monthEnd: string;
  };
  weekly: {
    income: number;
    expense: number;
    net: number;
    count: number;
    transactions: Transaction[];
  };
  monthly: {
    income: number;
    expense: number;
    net: number;
    count: number;
    byCategory: {
      income: Record<string, number>;
      expense: Record<string, number>;
    };
  };
}

export interface MonthlyReport {
  period: {
    year: number;
    month: number;
    monthStart: string;
    monthEnd: string;
  };
  summary: {
    income: number;
    expense: number;
    net: number;
    count: number;
  };
  byCategory: {
    income: Record<string, number>;
    expense: Record<string, number>;
  };
  byDay: Array<{ date: string; income: number; expense: number }>;
  transactions: Transaction[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  user: User;
  settings?: UserSettings;
  tasks: Task[];
  habits: Habit[];
  goals: Goal[];
  skills: Skill[];
  focusSessions: FocusSession[];
  journalEntries: JournalEntry[];
  reminders: Reminder[];
  xpTransactions: XPTransaction[];
  dailyStats: DailyStats[];
  brandProjects: BrandProject[];
}

export interface UserSettings {
  id: string;
  userId: string;
  wakeUpTime: string;
  sleepTime: string;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  defaultFocusDuration: number;
  defaultBreakDuration: number;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}