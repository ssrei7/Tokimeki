import type { Migration } from './types';

export const migrateV10ToV11: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = old.world && typeof old.world === 'object' && !Array.isArray(old.world) ? old.world as Record<string, unknown> : {};
  return { ...old, schemaVersion: 11, world: { ...world, giftHistory: Array.isArray(world.giftHistory) ? world.giftHistory : [] } };
};
