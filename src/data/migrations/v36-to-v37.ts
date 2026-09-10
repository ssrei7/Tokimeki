import { DEFAULT_ACTION_COSTS, DEFAULT_SHOP_RULE } from '../schema/save';
import type { Migration } from './types';

/** v37 adds node-bound shops, configured business slots, and stat-backed open-day progress. */
export const migrateV36ToV37: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const config = (save.config ?? {}) as Record<string, unknown>;
  const actionCosts = (config.actionCosts && typeof config.actionCosts === 'object' && !Array.isArray(config.actionCosts)
    ? config.actionCosts
    : {}) as Record<string, unknown>;
  const defaultShopCost = DEFAULT_ACTION_COSTS.operate_shop;
  const currentShopCost = (actionCosts.operate_shop && typeof actionCosts.operate_shop === 'object' && !Array.isArray(actionCosts.operate_shop)
    ? actionCosts.operate_shop
    : {}) as Record<string, unknown>;
  actionCosts.operate_shop = {
    ...currentShopCost,
    slotCost: typeof currentShopCost.slotCost === 'number' ? currentShopCost.slotCost : defaultShopCost.slotCost,
    energyCost: typeof currentShopCost.energyCost === 'number' ? currentShopCost.energyCost : defaultShopCost.energyCost,
  };
  config.actionCosts = actionCosts;

  const calendar = (config.calendar && typeof config.calendar === 'object' && !Array.isArray(config.calendar)
    ? config.calendar
    : {}) as Record<string, unknown>;
  const slotIds = Array.isArray(calendar.slots)
    ? calendar.slots.flatMap((slot) => typeof slot === 'object' && slot !== null && !Array.isArray(slot) && typeof (slot as Record<string, unknown>).id === 'string' ? [(slot as Record<string, unknown>).id as string] : [])
    : [];
  const defaultOpenSlotIds = DEFAULT_SHOP_RULE.openSlotIds.filter((slotId) => slotIds.includes(slotId));
  const openSlotIds = defaultOpenSlotIds.length ? defaultOpenSlotIds : slotIds.slice(0, 2);

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
  const configuredOpenDays = stats[DEFAULT_SHOP_RULE.openDaysStatKey];
  stats[DEFAULT_SHOP_RULE.openDaysStatKey] = typeof configuredOpenDays === 'number' && Number.isFinite(configuredOpenDays) && configuredOpenDays >= 0
    ? Math.floor(configuredOpenDays)
    : 0;
  economy.shopRules = {
    standard: { ...DEFAULT_SHOP_RULE, openSlotIds: openSlotIds.length ? openSlotIds : [...DEFAULT_SHOP_RULE.openSlotIds] },
  };

  player.stats = stats;
  world.player = player;
  world.economy = economy;
  save.config = config;
  save.world = world;
  save.schemaVersion = 37;
  return save;
};
