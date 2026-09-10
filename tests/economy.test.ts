import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events/bus';
import { advanceAction, endDay } from '../src/core/time';
import { createEconomyOpRegistry, getJobQuote, getJobShiftStatus, getRentalQuote, injectEconomyMorningAds, registerEconomyHooks } from '../src/features/economy';
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

  it('rejects a job rule that references an unknown currency', () => {
    const { save } = setup();
    save.world.economy.jobRules.standard.currencyId = 'missing';
    expect(SaveFileSchema.safeParse(save).success).toBe(false);
  });

  it('uses configured currency metadata and a stat-backed wage without trusting ad text', () => {
    const { save } = setup();
    save.world.economy.currencies.default = { id: 'default', name: '贝壳', symbol: '◇', decimals: 0, statKey: 'shells' };
    save.world.player.stats.shells = 4;
    save.world.player.stats['economy.job.wage'] = 12;
    expect(getJobQuote(save.world, 'start')).toMatchObject({ wage: 12, currency: { name: '贝壳', statKey: 'shells' }, rule: { shiftSlotId: 'morning' } });
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
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'ad', entryKind: 'housing', nodeId: 'start', source: 'local' }),
      expect.objectContaining({ category: 'ad', entryKind: 'job', nodeId: 'start', source: 'local' }),
    ]));
    save.world.player.housing = { id: 'rental-start', nodeId: 'start', rentRuleId: 'standard', nextDueDayStatKey: 'economy.rent.next-due-day' };
    save.world.player.job = { id: 'job-start-standard', nodeId: 'start', jobRuleId: 'standard' };
    expect(injectEconomyMorningAds(entries, save.world, 1)).toEqual(entries);
  });

  it('keeps both local economy entry points when a six-item morning brief is already full', () => {
    const { save } = setup();
    const full = Array.from({ length: 6 }, (_, index) => ({
      id: `entry-${index}`, day: 1, category: 'ambience' as const, title: `条目 ${index}`, body: '本地晨报', charIds: [], source: 'local' as const,
    }));
    const entries = injectEconomyMorningAds(full, save.world, 1);
    expect(entries).toHaveLength(6);
    expect(entries.some((entry) => entry.entryKind === 'housing')).toBe(true);
    expect(entries.some((entry) => entry.entryKind === 'job')).toBe(true);
  });

  it('accepts one deterministic node-bound job and only permits work at its scheduled place and time', () => {
    const { save, registry } = setup();
    const context = { world: save.world, day: 1, slotId: 'morning', nodeId: 'start', calendar: save.config.calendar, actionCosts: save.config.actionCosts, log: () => undefined };
    expect(registry.applyAll([{ op: 'accept_job', nodeId: 'start' }], context, 1).applied).toBe(1);
    expect(save.world.player.job).toMatchObject({ nodeId: 'start', jobRuleId: 'standard' });
    expect(getJobShiftStatus(save.world, save.config.calendar)).toBe('ready');
    expect(registry.applyAll([{ op: 'accept_job', nodeId: 'start' }], context, 1).rejected).toHaveLength(1);

    save.world.player.nodeId = 'missing';
    expect(getJobShiftStatus(save.world, save.config.calendar)).toBe('wrong_node');
    expect(registry.applyAll([{ op: 'work_job' }], { ...context, nodeId: 'missing' }, 1).rejected[0]?.reason).toContain('job node');
    save.world.player.nodeId = 'start';
    save.world.clock.slotId = 'noon';
    expect(getJobShiftStatus(save.world, save.config.calendar)).toBe('missed');
    expect(registry.applyAll([{ op: 'work_job' }], { ...context, slotId: 'noon' }, 1).rejected[0]?.reason).toContain('missed');
  });

  it('occupies the configured work slots and pays exactly one wage at daily settlement', () => {
    const { save, registry } = setup();
    const bus = new EventBus();
    registerEconomyHooks(bus, registry);
    const context = { world: save.world, day: 1, slotId: 'morning', nodeId: 'start', calendar: save.config.calendar, actionCosts: save.config.actionCosts, events: bus, log: () => undefined };
    registry.applyAll([{ op: 'accept_job', nodeId: 'start' }], context, 1);
    expect(registry.applyAll([{ op: 'work_job' }], context, 1).applied).toBe(1);
    const time = advanceAction(save.world, save.config.calendar, save.config.actionCosts, 'work', bus);
    expect(time.advanced).toBe(2);
    expect(save.world.clock.slotId).toBe('evening');
    expect(getJobShiftStatus(save.world, save.config.calendar)).toBe('worked');

    const settlement = endDay(save.world, save.config.calendar, bus);
    expect(save.world.player.stats.money).toBe(18);
    expect(settlement.income).toBe(18);
    expect(settlement.economyTransactions).toEqual([expect.objectContaining({ kind: 'wage', amount: 18, balanceBefore: 0, balanceAfter: 18 })]);
    expect(settlement.diary).toContain('获得¤18工资');
    expect(Object.keys(save.world.player.flags).some((key) => key.includes('.worked.'))).toBe(false);
  });

  it('keeps unemployment and a missed shift playable without creating wages', () => {
    const { save, registry } = setup();
    const bus = new EventBus();
    registerEconomyHooks(bus, registry);
    registry.applyAll([{ op: 'accept_job', nodeId: 'start' }], { world: save.world, day: 1, slotId: 'morning', nodeId: 'start', calendar: save.config.calendar, actionCosts: save.config.actionCosts, log: () => undefined }, 1);
    advanceAction(save.world, save.config.calendar, save.config.actionCosts, 'explore', bus);
    const settlement = endDay(save.world, save.config.calendar, bus);
    expect(save.world.clock.day).toBe(2);
    expect(save.world.player.stats.money).toBe(0);
    expect(settlement.income).toBe(0);
    expect(settlement.economyTransactions).toEqual([]);
  });
});
