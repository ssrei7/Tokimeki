import type { Migration } from './types';

/** v19 persists the merged morning weather/update envelope. */
export const migrateV18ToV19: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!Array.isArray(world.morningUpdates)) world.morningUpdates = [];
  save.schemaVersion = 19;
  return save;
};
