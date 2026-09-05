import { DEFAULT_SLOT_DEFS } from '../schema/save';
import type { Migration } from './types';

export const migrateV4ToV5: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const config = isRecord(old.config) ? old.config : {};
  const calendar = isRecord(config.calendar) ? config.calendar : {};
  const slots = Array.isArray(calendar.slots) ? calendar.slots : [];
  const world = isRecord(old.world) ? old.world : {};
  return {
    ...old,
    schemaVersion: 5,
    config: {
      ...config,
      calendar: {
        ...calendar,
        slots: isLegacySingleSlotCalendar(slots) ? [...DEFAULT_SLOT_DEFS] : slots,
      },
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

export function repairLegacyV5Save(input: unknown): unknown {
  const old = (input ?? {}) as Record<string, unknown>;
  const config = isRecord(old.config) ? old.config : {};
  const calendar = isRecord(config.calendar) ? config.calendar : {};
  const slots = Array.isArray(calendar.slots) ? calendar.slots : [];
  if (!isLegacySingleSlotCalendar(slots)) return input;
  return {
    ...old,
    config: { ...config, calendar: { ...calendar, slots: [...DEFAULT_SLOT_DEFS] } },
  };
}

function isLegacySingleSlotCalendar(slots: unknown[]): boolean {
  return slots.length === 1 && isRecord(slots[0]) && slots[0].id === 'morning';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
