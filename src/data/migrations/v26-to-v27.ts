import type { Migration } from './types';

/** v27 adds local chapter summaries and milestone records. */
export const migrateV26ToV27: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!Array.isArray(world.chapters)) world.chapters = [];
  if (!Array.isArray(world.milestones)) world.milestones = [];
  save.world = world;
  save.schemaVersion = 27;
  return save;
};
