import { advanceTime } from '../core/time';
import { EventBus } from '../core/events/bus';
import type { CalendarConfig, ActionCostTable, WorldState } from '../data/schema/save';

export interface HeadlessSimulationReport {
  seed: number;
  requestedDays: number;
  settledDays: number[];
  finalDay: number;
  finalSlotId: string;
}

export function simulateDays(world: WorldState, calendar: CalendarConfig, days: number, seed = 1, events = new EventBus()): HeadlessSimulationReport {
  const copy = structuredClone(world);
  const target = Math.max(0, Math.floor(days));
  const startDay = copy.clock.day;
  const settledDays: number[] = [];
  let guard = 0;
  while (copy.clock.day < startDay + target && guard < target * 100 + 100) {
    const result = advanceTime(copy, calendar, 1, events);
    settledDays.push(...result.settledDays);
    if (result.advanced === 0) break;
    guard += 1;
  }
  return { seed, requestedDays: target, settledDays, finalDay: copy.clock.day, finalSlotId: copy.clock.slotId };
}
