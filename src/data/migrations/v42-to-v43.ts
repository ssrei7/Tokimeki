import type { Migration } from './types';

/** v43 adds save-local place highlights without changing world package content. */
export const migrateV42ToV43: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = save.world as Record<string, unknown> | undefined;
  if (world && !Array.isArray(world.placeHighlights)) world.placeHighlights = [];
  save.schemaVersion = 43;
  return save;
};
