import { type Migration } from './types';

export const migrateV1ToV2: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = (old.world ?? {}) as Record<string, unknown>;

  return {
    ...old,
    schemaVersion: 2,
    world: {
      ...world,
      stats: isRecord(world.stats) ? world.stats : {},
      flags: isRecord(world.flags) ? world.flags : {},
      items: isRecord(world.items) ? world.items : {},
      relations: isRecord(world.relations) ? world.relations : {},
    },
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
