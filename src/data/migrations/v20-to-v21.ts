import type { Migration } from './types';

/** v21 adds optional narrative event text to lead briefs and hooks. */
export const migrateV20ToV21: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  save.schemaVersion = 21;
  return save;
};
