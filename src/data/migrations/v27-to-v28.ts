import type { Migration } from './types';

/** v28 allows event packages to declare a deterministic milestone on trigger. */
export const migrateV27ToV28: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!Array.isArray(world.chapters)) world.chapters = [];
  if (!Array.isArray(world.milestones)) world.milestones = [];
  save.world = world;
  save.schemaVersion = 28;
  return save;
};
