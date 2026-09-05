import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events/bus';
import { advanceAction, advanceTime, availableSlots, endDay, slotsForPreset, updateDiaryEntry } from '../src/core/time';
import { DEFAULT_SLOT_DEFS } from '../src/data/schema/save';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { simulateDays } from '../src/dev/simulator';

function setup(preset: 'leisure' | 'standard' | 'tight' | 'sandbox' = 'standard') {
  const save = seedScenario(createCurrentSaveScenario({ id: `time-${preset}`, title: 'Time' }));
  save.config.calendar = {
    ...save.config.calendar,
    preset,
    unlimitedSlots: preset === 'sandbox',
    slots: [
      { id: 'morning', name: '早晨', order: 0 },
      { id: 'noon', name: '中午', order: 1 },
      { id: 'evening', name: '晚上', order: 2 },
      { id: 'night', name: '深夜', order: 3 },
      { id: 'late-night', name: '午夜', order: 4 },
      { id: 'dawn', name: '黎明', order: 5 },
    ],
  };
  return save;
}

describe('deterministic time kernel', () => {
  it('advances slots, settles a day, and starts the next day', () => {
    const save = setup();
    const calls: string[] = [];
    const bus = new EventBus();
    bus.subscribe('onTimeAdvance', (payload) => calls.push(`time:${payload.fromSlotId}>${payload.toSlotId}`));
    bus.subscribe('onDaySettle', (payload) => calls.push(`settle:${payload.day}`));
    bus.subscribe('onDayStart', (payload) => calls.push(`start:${payload.day}`));
    const result = advanceTime(save.world, save.config.calendar, 4, bus);
    expect(result.settledDays).toEqual([1]);
    expect(save.world.clock).toEqual({ day: 2, slotId: 'morning' });
    expect(save.world.slotsUsedToday).toBe(0);
    expect(save.world.diary[0]?.text).toContain('第 1 天结束');
    expect(calls).toEqual(['time:morning>noon', 'time:noon>evening', 'time:evening>night', 'time:night>morning', 'settle:1', 'start:2']);
  });

  it('supports preset capacity and sandbox no-consumption', () => {
    expect(slotsForPreset('leisure')).toBe(6);
    expect(slotsForPreset('standard')).toBe(4);
    expect(slotsForPreset('tight')).toBe(3);
    expect(availableSlots({ ...setup().config.calendar, preset: 'leisure', slots: [...DEFAULT_SLOT_DEFS] })).toBe(6);
    const sandbox = setup('sandbox');
    expect(availableSlots(sandbox.config.calendar)).toBe(6);
    expect(advanceTime(sandbox.world, sandbox.config.calendar, 3).advanced).toBe(0);
    expect(sandbox.world.clock.day).toBe(1);
    expect(endDay(sandbox.world, sandbox.config.calendar).day).toBe(1);
    expect(sandbox.world.clock).toEqual({ day: 2, slotId: 'morning' });
  });

  it('uses action costs without requiring an AI provider', () => {
    const save = setup();
    save.config.actionCosts = { explore: { slotCost: 2 } };
    const result = advanceAction(save.world, save.config.calendar, save.config.actionCosts, 'explore');
    expect(result.slotCost).toBe(2);
    expect(save.world.clock.slotId).toBe('evening');
  });

  it('repeats a fixed headless simulation deterministically', () => {
    const save = setup();
    expect(simulateDays(save.world, save.config.calendar, 3, 42)).toEqual(simulateDays(save.world, save.config.calendar, 3, 42));
    expect(simulateDays(save.world, save.config.calendar, 3, 42).settledDays).toEqual([1, 2, 3]);
  });

  it('runs a fixed-seed 30-day simulation through every daily settlement', () => {
    const save = setup();
    const report = simulateDays(save.world, save.config.calendar, 30, 20260905);
    expect(report.settledDays).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(report.timeAdvanceCount).toBeGreaterThanOrEqual(120);
    expect(report.dayStartCount).toBe(30);
    expect(report.finalDay).toBe(31);
    expect(DEFAULT_SLOT_DEFS.map((slot) => slot.id)).toContain(report.finalSlotId);
    expect(report).toEqual(simulateDays(save.world, save.config.calendar, 30, 20260905));
  });

  it('builds a local facts-only diary and keeps user edits authoritative', () => {
    const save = setup();
    advanceTime(save.world, save.config.calendar, 4);
    expect(save.world.diary[0]?.text).toContain('没有记录到新的相遇');
    expect(updateDiaryEntry(save.world, 1, '我自己写下的第一天。', '2026-09-05T00:00:00.000Z')).toBe(true);
    expect(save.world.diary[0]).toEqual({ day: 1, text: '我自己写下的第一天。', editedAt: '2026-09-05T00:00:00.000Z' });
    expect(save.world.settlements[0]?.diary).toBe('我自己写下的第一天。');
  });
});
