import type { Migration } from './types';

/** v25 adds static event choices while keeping existing event definitions valid. */
export const migrateV24ToV25: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!world.eventDefs || typeof world.eventDefs !== 'object' || Array.isArray(world.eventDefs)) world.eventDefs = {};
  save.world = world;
  save.schemaVersion = 25;
  return save;
};
