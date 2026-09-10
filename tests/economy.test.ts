import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events/bus';
import { endDay } from '../src/core/time';
import { createEconomyOpRegistry, getRentalQuote, injectEconomyMorningAds, registerEconomyHooks } from '../src/features/economy';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { SaveFileSchema } from '../src/data/schema/save';

function setup() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'economy', title: 'Economy' }));
  const registry = createEconomyOpRegistry();
  return { save, registry };
}

describe('stage 8 economy and rent slice', () => {
  it('uses configured currency metadata and stat-backed rent terms', () => {
    const { save } = setup();
    save.world.economy.currencies.default = { id: 'default', name: '贝壳', symbol: '◇', decimals: 0, statKey: 'shells' };
    save.world.player.stats.shells = 30;
    const quote = getRentalQuote(save.world, 'start');
    expect(quote).toMatchObject({ amount: 10, intervalDays: 7, currency: { name: '贝壳', statKey: 'shells' } });
  });

  it('rejects broken currency and rent-rule references at the save boundary', () => {
    const { save } = setup();
    save.world.economy.defaultCurrencyId = 'missing';
    save.world.economy.rentRules.standard.currencyId = 'missing';
    expect(SaveFileSchema.safeParse(save).success).toBe(false);
  });

  it('accepts one local rental contract and records home plus the next due day', () => {
    const { save, registry } = setup();
    const applied = registry.applyAll([{ op: 'accept_rental', nodeId: 'start', rentRuleId: 'standard' }], {
      world: save.world, day: 1, slotId: 'morning', nodeId: 'start', log: () => undefined,
    }, 1);
    expect(applied.applied).toBe(1);
    expect(save.world.player.homeNodeId).toBe('start');
    expect(save.world.player.housing).toMatchObject({ nodeId: 'start', rentRuleId: 'standard' });
    expect(save.world.player.stats['economy.rent.next-due-day']).toBe(8);
    expect(registry.applyAll([{ op: 'accept_rental', nodeId: 'start' }], { world: save.world, day: 1, slotId: 'morning', nodeId: 'start', log: () => undefined }, 1).rejected).toHaveLength(1);
  });

  it('deducts due rent during onDaySettle without blocking play when balance becomes negative', () => {
    const { save, registry } = setup();
    registry.applyAll([{ op: 'accept_rental', nodeId: 'start' }], { world: save.world, day: 1, slotId: 'morning', nodeId: 'start', log: () => undefined }, 1);
    save.world.player.stats.money = 5;
    save.world.player.stats['economy.rent.next-due-day'] = 1;
    const bus = new EventBus();
    registerEconomyHooks(bus, registry);
    const settlement = endDay(save.world, save.config.calendar, bus);
    expect(save.world.player.stats.money).toBe(-5);
    expect(save.world.clock.day).toBe(2);
    expect(save.world.player.stats['economy.rent.next-due-day']).toBe(8);
    expect(settlement.expense).toBe(10);
    expect(settlement.economyTransactions).toHaveLength(1);
    expect(settlement.economyTransactions[0]).toMatchObject({ kind: 'rent', currencyId: 'default', balanceBefore: 5, balanceAfter: -5 });
    expect(settlement.diary).toContain('起点街区房租 ¤10');
  });

  it('adds a local housing ad without trusting generated advertisement amounts', () => {
    const { save } = setup();
    const entries = injectEconomyMorningAds([], save.world, 1);
    expect(entries).toEqual([expect.objectContaining({ category: 'ad', entryKind: 'housing', nodeId: 'start', source: 'local' })]);
    save.world.player.housing = { id: 'rental-start', nodeId: 'start', rentRuleId: 'standard', nextDueDayStatKey: 'economy.rent.next-due-day' };
    expect(injectEconomyMorningAds(entries, save.world, 1)).toEqual(entries);
  });
});
