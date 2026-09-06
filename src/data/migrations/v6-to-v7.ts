import type { Migration } from './types';

export const migrateV6ToV7: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = isRecord(old.world) ? old.world : {};
  const map = isRecord(world.map) ? world.map : {};
  const nodes = isRecord(map.nodes) ? map.nodes : {};
  return {
    ...old,
    schemaVersion: 7,
    world: {
      ...world,
      map: {
        ...map,
        nodes: Object.fromEntries(Object.entries(nodes).map(([id, value]) => [id, isRecord(value) ? { ...value } : value])),
      },
    },
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
