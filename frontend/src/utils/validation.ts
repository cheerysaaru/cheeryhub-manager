export const PASSWORD_RULES =
  'Use at least 8 characters with an uppercase letter, a number and a special character (!@#$%^&*).';

export const USERNAME_RULES = '3–20 characters: letters, numbers and underscores only.';

export const USERNAME_ERROR = 'Username must be 3–20 characters: letters, numbers and underscores only.';

export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 8) problems.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('a number');
  if (!/[!@#$%^&*]/.test(password)) problems.push('a special character (!@#$%^&*)');
  return problems;
}

export function passwordProblem(password: string): string {
  const problems = passwordProblems(password);
  return problems.length ? `Password needs ${problems.join(', ')}.` : '';
}

export function usernameProblem(username: string): string {
  if (username.length < 3 || username.length > 20) return USERNAME_ERROR;
  if (!/^[A-Za-z0-9_]+$/.test(username)) return USERNAME_ERROR;
  return '';
}
