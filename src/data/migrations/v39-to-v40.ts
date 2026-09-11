import type { Migration } from './types';

/** v40 adds optional persisted metadata for generated terminal voice messages. */
export const migrateV39ToV40: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  save.schemaVersion = 40;
  return save;
};
