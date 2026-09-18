export const THEME_STORAGE_KEY = 'tokimeki.theme-mode';
export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = typeof THEME_MODES[number];
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export function parseThemeMode(value: unknown): ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value) ? value as ThemeMode : 'system';
}
export function readThemeMode(storage: Pick<Storage, 'getItem'>): ThemeMode {
  try { return parseThemeMode(storage.getItem(THEME_STORAGE_KEY)); } catch { return 'system'; }
}
export function writeThemeMode(storage: Pick<Storage, 'setItem'>, mode: ThemeMode): void {
  try { storage.setItem(THEME_STORAGE_KEY, mode); } catch { /* local preference unavailable */ }
}
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme { return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode; }
export function applyTheme(mode: ThemeMode, prefersDark = false, root: Pick<HTMLElement, 'setAttribute' | 'style'> = document.documentElement): ResolvedTheme {
  const resolved = resolveTheme(mode, prefersDark); root.setAttribute('data-theme', resolved); root.style.colorScheme = resolved; return resolved;
}
