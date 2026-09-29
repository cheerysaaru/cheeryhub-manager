export type ThemeMode = 'light' | 'dark';

export function getTheme(): ThemeMode {
  try {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* Storage may be unavailable. */
  }
  document.documentElement.setAttribute('data-theme', theme);
}
