import type { Migration } from './types';

/** v26 adds optional deterministic evidence reaction rules to event definitions. */
export const migrateV25ToV26: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!world.eventDefs || typeof world.eventDefs !== 'object' || Array.isArray(world.eventDefs)) world.eventDefs = {};
  save.world = world;
  save.schemaVersion = 26;
  return save;
};
