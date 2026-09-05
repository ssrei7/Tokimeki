import { createDefaultMap } from '../schema/save';
import type { Migration } from './types';

export const migrateV3ToV4: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = (old.world ?? {}) as Record<string, unknown>;
  return {
    ...old,
    schemaVersion: 4,
    world: {
      ...world,
      map: isRecord(world.map) ? world.map : createDefaultMap(),
    },
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
