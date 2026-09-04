import { type Migration } from './types';
import { DEFAULT_ACTION_COSTS } from '../schema/save';

export const migrateV2ToV3: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = (old.world ?? {}) as Record<string, unknown>;
  return {
    ...old,
    schemaVersion: 3,
    world: {
      ...world,
      slotsUsedToday: typeof world.slotsUsedToday === 'number' ? world.slotsUsedToday : 0,
      diary: Array.isArray(world.diary) ? world.diary : [],
      settlements: Array.isArray(world.settlements) ? world.settlements : [],
    },
    config: {
      ...(old.config as Record<string, unknown> | undefined),
      actionCosts: mergeCosts((old.config as Record<string, unknown> | undefined)?.actionCosts),
    },
  };
};

function mergeCosts(value: unknown): Record<string, { slotCost: number }> {
  const existing = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, { slotCost: number }> : {};
  return { ...DEFAULT_ACTION_COSTS, ...existing };
}
