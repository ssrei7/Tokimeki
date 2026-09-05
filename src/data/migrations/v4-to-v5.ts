import type { Migration } from './types';

export const migrateV4ToV5: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const config = isRecord(old.config) ? old.config : {};
  const world = isRecord(old.world) ? old.world : {};
  return {
    ...old,
    schemaVersion: 5,
    config: {
      ...config,
      encounter: isRecord(config.encounter) ? config.encounter : {
        enabled: true,
        triggerOnLeave: true,
        leaveProbability: 0.35,
        guaranteeAfterDays: 3,
        maxParticipants: 3,
        weights: {},
      },
    },
    world: {
      ...world,
      characters: isRecord(world.characters) ? world.characters : {},
      npcs: isRecord(world.npcs) ? world.npcs : {},
      npcTemplates: isRecord(world.npcTemplates) ? world.npcTemplates : {},
      encounterLog: Array.isArray(world.encounterLog) ? world.encounterLog : [],
    },
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
