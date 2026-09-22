import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_MAP_SHEET_PREFERENCES, clampMapSheetProgress, mapSheetStorageKey, readMapSheetPreferences, writeMapSheetPreferences } from '../src/ui/map-sheet-preferences';

describe('map sheet preferences', () => {
  it('scopes preferences by save and map mode', () => {
    expect(mapSheetStorageKey('save-1', 'graph')).toBe('tokimeki.map-sheets.save-1.graph');
    expect(DEFAULT_MAP_SHEET_PREFERENCES.detailProgress).toBe(0.42);
  });

  it('clamps valid values and falls back for malformed values', () => {
    expect(clampMapSheetProgress(1.5, 0.5)).toBe(1);
    expect(clampMapSheetProgress(-1, 0.5)).toBe(0);
    expect(clampMapSheetProgress('half', 0.5)).toBe(0.5);
    const storage = new Map<string, string>([['key', JSON.stringify({ toolProgress: 1.4, detailProgress: 'bad' })]]);
    expect(readMapSheetPreferences({ getItem: (key) => storage.get(key) ?? null }, 'key')).toEqual({ ...DEFAULT_MAP_SHEET_PREFERENCES, toolProgress: 1 });
  });

  it('writes preferences for the next panel expansion', () => {
    const storage = new Map<string, string>();
    const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
    writeMapSheetPreferences(adapter, 'key', { toolProgress: 0.63, detailProgress: 0.81 });
    expect(readMapSheetPreferences(adapter, 'key')).toEqual({ toolProgress: 0.63, detailProgress: 0.81 });
  });

  it('opens a new map node at the remembered detail height', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('const detailProgress = sheetPreferences.detailProgress > 0.04 ? sheetPreferences.detailProgress : DEFAULT_MAP_SHEET_PREFERENCES.detailProgress;');
    expect(source).toContain('setDetailSheetProgress(detailProgress);');
    expect(source).not.toContain('setDetailSheetProgress(1); setDetailSheetState(\'expanded\');');
  });
});
