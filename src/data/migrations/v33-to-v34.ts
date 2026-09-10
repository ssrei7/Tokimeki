import { DEFAULT_ECONOMY_STATE } from '../schema/save';
import type { Migration } from './types';

/** v34 adds data-driven currencies, rent rules, housing contracts, and currency-aware settlement records. */
export const migrateV33ToV34: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  const player = (world.player ?? {}) as Record<string, unknown>;
  const stats = (player.stats && typeof player.stats === 'object' && !Array.isArray(player.stats)
    ? player.stats
    : {}) as Record<string, unknown>;

  if (typeof stats.money !== 'number') stats.money = 0;
  if (typeof stats['economy.rent.amount'] !== 'number') stats['economy.rent.amount'] = 10;
  if (typeof stats['economy.rent.interval-days'] !== 'number') stats['economy.rent.interval-days'] = 7;
  player.stats = stats;
  world.player = player;
  world.economy = structuredClone(DEFAULT_ECONOMY_STATE);

  if (Array.isArray(world.settlements)) {
    world.settlements = world.settlements.map((value) => {
      const settlement = (value ?? {}) as Record<string, unknown>;
      return { ...settlement, economyTransactions: Array.isArray(settlement.economyTransactions) ? settlement.economyTransactions : [] };
    });
  }

  save.world = world;
  save.schemaVersion = 34;
  return save;
};
