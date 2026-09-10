import { DEFAULT_ECONOMY_V35_STATE } from '../schema/save';
import type { Migration } from './types';

/** v35 adds deterministic job rules, one active player job, and wage transactions. */
export const migrateV34ToV35: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  const player = (world.player ?? {}) as Record<string, unknown>;
  const stats = (player.stats && typeof player.stats === 'object' && !Array.isArray(player.stats)
    ? player.stats
    : {}) as Record<string, unknown>;
  const economy = (world.economy && typeof world.economy === 'object' && !Array.isArray(world.economy)
    ? world.economy
    : {}) as Record<string, unknown>;
  const clock = (world.clock && typeof world.clock === 'object' && !Array.isArray(world.clock)
    ? world.clock
    : {}) as Record<string, unknown>;

  if (typeof stats['economy.job.wage'] !== 'number') stats['economy.job.wage'] = 18;
  const shiftSlotId = typeof clock.slotId === 'string' && clock.slotId.trim()
    ? clock.slotId
    : DEFAULT_ECONOMY_V35_STATE.jobRules.standard.shiftSlotId;
  economy.jobRules = {
    standard: { ...DEFAULT_ECONOMY_V35_STATE.jobRules.standard, shiftSlotId },
  };

  player.stats = stats;
  world.player = player;
  world.economy = economy;
  save.world = world;
  save.schemaVersion = 35;
  return save;
};
