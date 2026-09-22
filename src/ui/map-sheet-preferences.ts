export type MapSheetPreferences = {
  toolProgress: number;
  detailProgress: number;
};

export const DEFAULT_MAP_SHEET_PREFERENCES: MapSheetPreferences = {
  toolProgress: 1,
  detailProgress: 0.5,
};

export const mapSheetStorageKey = (saveId: string, mode: string): string => `tokimeki.map-sheets.${saveId}.${mode}`;

export const clampMapSheetProgress = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
};

export function readMapSheetPreferences(
  storage: Pick<Storage, 'getItem'>,
  key: string,
  fallback: MapSheetPreferences = DEFAULT_MAP_SHEET_PREFERENCES,
): MapSheetPreferences {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const record = parsed as Record<string, unknown>;
    return {
      toolProgress: clampMapSheetProgress(record.toolProgress, fallback.toolProgress),
      detailProgress: clampMapSheetProgress(record.detailProgress, fallback.detailProgress),
    };
  } catch {
    return fallback;
  }
}

export function writeMapSheetPreferences(storage: Pick<Storage, 'setItem'>, key: string, preferences: MapSheetPreferences): void {
  try {
    storage.setItem(key, JSON.stringify({
      toolProgress: clampMapSheetProgress(preferences.toolProgress, DEFAULT_MAP_SHEET_PREFERENCES.toolProgress),
      detailProgress: clampMapSheetProgress(preferences.detailProgress, DEFAULT_MAP_SHEET_PREFERENCES.detailProgress),
    }));
  } catch {
    // Local UI preferences are optional when browser storage is unavailable.
  }
}
