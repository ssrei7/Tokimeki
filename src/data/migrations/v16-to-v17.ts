import type { Migration } from './types';

/** v17 adds persisted morning-brief entries. */
export const migrateV16ToV17: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!Array.isArray(world.morningBriefs)) world.morningBriefs = [];
  save.schemaVersion = 17;
  return save;
};
