import { DEFAULT_HOUSING_TIERS, DEFAULT_HOUSING_UPGRADE_RULE } from '../schema/save';
import type { Migration } from './types';

const DEFAULT_UPGRADE_COST = 30;

/** v38 adds data-driven housing tiers and one stat-backed upgrade path. */
export const migrateV37ToV38: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  const economy = (world.economy && typeof world.economy === 'object' && !Array.isArray(world.economy)
    ? world.economy
    : {}) as Record<string, unknown>;
  const player = (world.player && typeof world.player === 'object' && !Array.isArray(world.player)
    ? world.player
    : {}) as Record<string, unknown>;
  const stats = (player.stats && typeof player.stats === 'object' && !Array.isArray(player.stats)
    ? player.stats
    : {}) as Record<string, unknown>;
  const configuredCost = stats[DEFAULT_HOUSING_UPGRADE_RULE.costStatKey];
  stats[DEFAULT_HOUSING_UPGRADE_RULE.costStatKey] = typeof configuredCost === 'number' && Number.isFinite(configuredCost) && configuredCost >= 0
    ? configuredCost
    : DEFAULT_UPGRADE_COST;

  economy.housingTiers = structuredClone(DEFAULT_HOUSING_TIERS);
  economy.housingUpgradeRules = { [DEFAULT_HOUSING_UPGRADE_RULE.id]: structuredClone(DEFAULT_HOUSING_UPGRADE_RULE) };

  const housing = player.housing;
  if (housing && typeof housing === 'object' && !Array.isArray(housing)) {
    (housing as Record<string, unknown>).tierId = 'basic';
  }

  player.stats = stats;
  world.player = player;
  world.economy = economy;
  save.world = world;
  save.schemaVersion = 38;
  return save;
};
