import type { Migration } from './types';

export const migrateV11ToV12: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = old.world && typeof old.world === 'object' && !Array.isArray(old.world) ? old.world as Record<string, unknown> : {};
  const giftHistory = Array.isArray(world.giftHistory)
    ? world.giftHistory.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const gift = entry as Record<string, unknown>;
      return { ...gift, status: gift.status === 'pending' ? 'pending' : 'resolved' };
    })
    : [];
  return { ...old, schemaVersion: 12, world: { ...world, giftHistory } };
};
