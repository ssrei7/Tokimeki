import { PresetBundleSchema, type PresetBundle } from '../content';

export const CURRENT_PRESET_BUNDLE_SCHEMA_VERSION = 2;

export function migratePresetBundle(input: unknown, fromVersion: number): PresetBundle {
  if (!Number.isInteger(fromVersion) || fromVersion < 1 || fromVersion > CURRENT_PRESET_BUNDLE_SCHEMA_VERSION) {
    throw new Error(`Unsupported preset bundle schema version: ${fromVersion}.`);
  }
  if (fromVersion === 1) {
    const source = input as { entries?: unknown[] };
    const entries = Array.isArray(source?.entries)
      ? source.entries.map((entry) => ({ ...(entry as Record<string, unknown>), enabled: typeof (entry as { enabled?: unknown }).enabled === 'boolean' ? (entry as { enabled: boolean }).enabled : true }))
      : source?.entries;
    return PresetBundleSchema.parse({ ...(input as Record<string, unknown>), entries });
  }
  return PresetBundleSchema.parse(input);
}
