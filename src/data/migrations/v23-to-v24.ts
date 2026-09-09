import type { Migration } from './types';

/** v24 reserves event history fields for choices, result summaries and replayable narrative text. */
export const migrateV23ToV24: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!Array.isArray(world.eventHistory)) world.eventHistory = [];
  save.world = world;
  save.schemaVersion = 24;
  return save;
};
