import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('a number');
  if (!/[!@#$%^&*]/.test(password)) problems.push('a special character (!@#$%^&*)');
  return problems;
}

export function isStrongPassword(password: string): boolean {
  return passwordProblems(password).length === 0;
}

export const PASSWORD_REQUIREMENT =
  'Password must be at least 8 characters and include an uppercase letter, a number and a special character (!@#$%^&*).';

export function passwordError(password: string): string {
  const problems = passwordProblems(password);
  if (problems.length === 0) return '';
  return `Password needs ${problems.join(', ')}.`;
}

export const strongPasswordSchema = z
  .string()
  .max(200)
  .refine((value) => isStrongPassword(value), { message: PASSWORD_REQUIREMENT });

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(
    /^[A-Za-z0-9_]+$/,
    'Username may only contain letters, numbers and underscores'
  );

export const emailFormatSchema = z
  .string()
  .trim()
  .min(1)
  .max(254)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: 'Enter a valid email address',
  });
