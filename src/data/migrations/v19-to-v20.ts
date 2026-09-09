import type { Migration } from './types';

/** v20 adds optional typed entry metadata for morning advertisements. */
export const migrateV19ToV20: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  save.schemaVersion = 20;
  return save;
};
