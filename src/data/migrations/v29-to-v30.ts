import type { Migration } from './types';

/** v30 persists the deterministic director tension offset and refresh day. */
export const migrateV29ToV30: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  const director = (world.director ?? {}) as Record<string, unknown>;
  if (typeof director.tensionOffset !== 'number' || !Number.isFinite(director.tensionOffset)) director.tensionOffset = 0;
  if (typeof director.tensionUpdatedDay !== 'number' || !Number.isInteger(director.tensionUpdatedDay) || director.tensionUpdatedDay < 1) director.tensionUpdatedDay = 1;
  world.director = director;
  save.world = world;
  save.schemaVersion = 30;
  return save;
};
