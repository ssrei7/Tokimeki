import { describe, expect, it } from 'vitest';
import { applyThemeTemplate, parseDesktopTitleOverrides, parseThemeTemplate, readDesktopTitleOverrides, readThemeTemplate, THEME_TEMPLATE_STORAGE_KEY, writeDesktopTitleOverrides, writeThemeTemplate } from '../src/ui/theme/preferences';

describe('theme templates', () => {
  it('falls back safely for unknown values', () => { expect(parseThemeTemplate('soft')).toBe('soft'); expect(parseThemeTemplate('neon')).toBe('default'); });
  it('round trips locally', () => { const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }; writeThemeTemplate(storage, 'compact'); expect(values.get(THEME_TEMPLATE_STORAGE_KEY)).toBe('compact'); expect(readThemeTemplate(storage)).toBe('compact'); });
  it('applies a root data attribute', () => { let value = ''; applyThemeTemplate('soft', { setAttribute: (_key, next) => { value = next; } }); expect(value).toBe('soft'); });
  it('round trips desktop title overrides and drops invalid values', () => { const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (_key: string) => undefined }; const parsed = parseDesktopTitleOverrides({ terminal: { messages: '私信', bad: 12, long: 'x'.repeat(41) } }); expect(parsed).toEqual({ terminal: { messages: '私信' } }); writeDesktopTitleOverrides(storage, parsed); expect(readDesktopTitleOverrides(storage)).toEqual(parsed); });
});
