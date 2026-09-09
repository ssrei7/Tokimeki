import type { Migration } from './types';

/** v18 adds the deterministic hook pool used by morning lead entries. */
export const migrateV17ToV18: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!Array.isArray(world.hooks)) world.hooks = [];
  save.schemaVersion = 18;
  return save;
};
