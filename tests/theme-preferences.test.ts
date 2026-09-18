import { describe, expect, it } from 'vitest';
import { applyTheme, parseThemeMode, readThemeMode, resolveTheme, THEME_STORAGE_KEY, writeThemeMode } from '../src/ui/theme/preferences';
describe('theme preferences', () => {
  it('parses invalid values as system', () => { expect(parseThemeMode('dark')).toBe('dark'); expect(parseThemeMode('sepia')).toBe('system'); expect(parseThemeMode(null)).toBe('system'); });
  it('round trips through local storage', () => { const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; writeThemeMode(storage, 'dark'); expect(values.get(THEME_STORAGE_KEY)).toBe('dark'); expect(readThemeMode(storage)).toBe('dark'); });
  it('resolves system mode from OS preference', () => { expect(resolveTheme('system', true)).toBe('dark'); expect(resolveTheme('system', false)).toBe('light'); expect(resolveTheme('light', true)).toBe('light'); });
  it('applies deterministic root attributes', () => { const attrs = new Map<string, string>(); const root = { style: { colorScheme: '' }, setAttribute: (key: string, value: string) => attrs.set(key, value) }; expect(applyTheme('dark', false, root)).toBe('dark'); expect(attrs.get('data-theme')).toBe('dark'); expect(root.style.colorScheme).toBe('dark'); });
});
