import { advanceTime } from '../core/time';
import { EventBus } from '../core/events/bus';
import type { CalendarConfig, ActionCostTable, WorldState } from '../data/schema/save';

export interface HeadlessSimulationReport {
  seed: number;
  requestedDays: number;
  settledDays: number[];
  timeAdvanceCount: number;
  dayStartCount: number;
  finalDay: number;
  finalSlotId: string;
}

export function simulateDays(world: WorldState, calendar: CalendarConfig, days: number, seed = 1, events = new EventBus()): HeadlessSimulationReport {
  const copy = structuredClone(world);
  const target = Math.max(0, Math.floor(days));
  const startDay = copy.clock.day;
  const settledDays: number[] = [];
  let timeAdvanceCount = 0;
  let dayStartCount = 0;
  events.subscribe('onTimeAdvance', () => { timeAdvanceCount += 1; });
  events.subscribe('onDayStart', () => { dayStartCount += 1; });
  let state = (Math.abs(Math.floor(seed)) + 1) >>> 0;
  const nextRandom = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  let guard = 0;
  while (copy.clock.day < startDay + target && guard < target * 100 + 100) {
    const requestedSlots = 1 + Math.floor(nextRandom() * 2);
    const result = advanceTime(copy, calendar, requestedSlots, events);
    settledDays.push(...result.settledDays);
    if (result.advanced === 0) break;
    guard += 1;
  }
  return { seed, requestedDays: target, settledDays, timeAdvanceCount, dayStartCount, finalDay: copy.clock.day, finalSlotId: copy.clock.slotId };
}
