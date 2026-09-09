import type { Migration } from './types';

/** v29 allows event packages to gate eligibility by configured relationship stages. */
export const migrateV28ToV29: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!world.eventDefs || typeof world.eventDefs !== 'object' || Array.isArray(world.eventDefs)) world.eventDefs = {};
  save.world = world;
  save.schemaVersion = 29;
  return save;
};
