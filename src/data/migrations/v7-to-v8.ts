import type { Migration } from './types';

export const migrateV7ToV8: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = isRecord(old.world) ? old.world : {};
  return {
    ...old,
    schemaVersion: 8,
    world: {
      ...world,
      topicTrees: isRecord(world.topicTrees) ? world.topicTrees : {},
      usedTopics: isRecordOfPositiveIntegers(world.usedTopics) ? world.usedTopics : {},
      appointments: Array.isArray(world.appointments) ? world.appointments : [],
    },
  };
};

function isRecordOfPositiveIntegers(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'number' && Number.isInteger(entry) && entry > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
