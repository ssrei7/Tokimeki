import type { Migration } from './types';

export const migrateV8ToV9: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = isRecord(old.world) ? old.world : {};
  const relations = isRecord(world.relations) ? world.relations : {};
  return {
    ...old,
    schemaVersion: 9,
    world: {
      ...world,
      relations: Object.fromEntries(Object.entries(relations).map(([id, value]) => {
        const relation = isRecord(value) ? value : {};
        return [id, { ...relation, axes: isRecordOfNumbers(relation.axes) ? relation.axes : {}, knots: Array.isArray(relation.knots) ? relation.knots : [], memories: Array.isArray(relation.memories) ? relation.memories : [] }];
      })),
    },
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}
