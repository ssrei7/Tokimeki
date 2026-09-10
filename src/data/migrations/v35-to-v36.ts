import { DEFAULT_ACTION_COSTS, DEFAULT_ENERGY_RULE } from '../schema/save';
import type { Migration } from './types';

/** v36 enables stat-backed energy costs, rest recovery, and a flag-backed toggle. */
export const migrateV35ToV36: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const config = (save.config ?? {}) as Record<string, unknown>;
  const actionCosts = (config.actionCosts && typeof config.actionCosts === 'object' && !Array.isArray(config.actionCosts)
    ? config.actionCosts
    : {}) as Record<string, unknown>;
  for (const [kind, defaults] of Object.entries(DEFAULT_ACTION_COSTS)) {
    const current = (actionCosts[kind] && typeof actionCosts[kind] === 'object' && !Array.isArray(actionCosts[kind])
      ? actionCosts[kind]
      : {}) as Record<string, unknown>;
    actionCosts[kind] = {
      ...current,
      slotCost: typeof current.slotCost === 'number' ? current.slotCost : defaults.slotCost,
      energyCost: typeof current.energyCost === 'number' ? current.energyCost : defaults.energyCost,
    };
  }
  config.actionCosts = actionCosts;

  const world = (save.world ?? {}) as Record<string, unknown>;
  const player = (world.player ?? {}) as Record<string, unknown>;
  const stats = (player.stats && typeof player.stats === 'object' && !Array.isArray(player.stats)
    ? player.stats
    : {}) as Record<string, unknown>;
  const flags = (player.flags && typeof player.flags === 'object' && !Array.isArray(player.flags)
    ? player.flags
    : {}) as Record<string, unknown>;
  const economy = (world.economy && typeof world.economy === 'object' && !Array.isArray(world.economy)
    ? world.economy
    : {}) as Record<string, unknown>;

  const configuredMax = stats[DEFAULT_ENERGY_RULE.maxStatKey];
  const max = typeof configuredMax === 'number' && Number.isFinite(configuredMax) && configuredMax >= 0 ? configuredMax : 6;
  const configuredCurrent = stats[DEFAULT_ENERGY_RULE.statKey];
  const current = typeof configuredCurrent === 'number' && Number.isFinite(configuredCurrent) ? Math.min(max, Math.max(0, configuredCurrent)) : max;
  const configuredRestore = stats[DEFAULT_ENERGY_RULE.restRestoreStatKey];
  const restRestore = typeof configuredRestore === 'number' && Number.isFinite(configuredRestore) && configuredRestore >= 0 ? configuredRestore : 2;
  stats[DEFAULT_ENERGY_RULE.maxStatKey] = max;
  stats[DEFAULT_ENERGY_RULE.statKey] = current;
  stats[DEFAULT_ENERGY_RULE.restRestoreStatKey] = restRestore;
  if (typeof flags[DEFAULT_ENERGY_RULE.enabledFlagKey] !== 'boolean') flags[DEFAULT_ENERGY_RULE.enabledFlagKey] = true;
  economy.energyRule = structuredClone(DEFAULT_ENERGY_RULE);

  player.stats = stats;
  player.flags = flags;
  world.player = player;
  world.economy = economy;
  save.config = config;
  save.world = world;
  save.schemaVersion = 36;
  return save;
};
