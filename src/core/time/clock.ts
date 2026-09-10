import type { EventBus } from '../events/bus';
import type { CalendarConfig, ActionCostTable, DailySettlement, WorldState } from '../../data/schema/save';
import { buildLocalDiary } from './diary';

export interface TimeAdvanceResult {
  requested: number;
  advanced: number;
  settledDays: number[];
  changes: Array<{ path: string; before: unknown; after: unknown; description: string }>;
}

export interface TimeActionResult extends TimeAdvanceResult {
  kind: string;
  slotCost: number;
}

export function slotsForPreset(preset: CalendarConfig['preset']): number | null {
  if (preset === 'leisure') return 6;
  if (preset === 'tight') return 3;
  if (preset === 'sandbox') return null;
  return 4;
}

export function availableSlots(calendar: CalendarConfig): number {
  const configured = Math.max(1, calendar.slots.length);
  const presetSlots = slotsForPreset(calendar.preset);
  return Math.max(1, Math.min(configured, presetSlots ?? configured));
}

export function advanceAction(world: WorldState, calendar: CalendarConfig, costs: ActionCostTable, kind: string, events?: EventBus): TimeActionResult {
  const slotCost = Math.max(0, Math.floor(costs[kind]?.slotCost ?? 0));
  const result = advanceTime(world, calendar, slotCost, events);
  return { ...result, kind, slotCost };
}

export function advanceTime(world: WorldState, calendar: CalendarConfig, slots: number, events?: EventBus): TimeAdvanceResult {
  const requested = Math.max(0, Math.floor(slots));
  const changes: TimeAdvanceResult['changes'] = [];
  const settledDays: number[] = [];
  if (requested === 0 || calendar.unlimitedSlots) return { requested, advanced: 0, settledDays, changes };
  const orderedSlots = [...calendar.slots].sort((a, b) => a.order - b.order).slice(0, availableSlots(calendar));
  if (!orderedSlots.length) return { requested, advanced: 0, settledDays, changes };
  let currentIndex = orderedSlots.findIndex((slot) => slot.id === world.clock.slotId);
  if (currentIndex < 0) currentIndex = 0;
  let advanced = 0;
  while (advanced < requested) {
    const fromDay = world.clock.day;
    const fromSlotId = world.clock.slotId;
    const nextIndex = (currentIndex + 1) % orderedSlots.length;
    world.clock.slotId = orderedSlots[nextIndex].id;
    currentIndex = nextIndex;
    world.slotsUsedToday += 1;
    advanced += 1;
    changes.push({ path: 'world.clock.slotId', before: fromSlotId, after: world.clock.slotId, description: `Time advanced from ${fromSlotId} to ${world.clock.slotId}.` });
    changes.push({ path: 'world.slotsUsedToday', before: world.slotsUsedToday - 1, after: world.slotsUsedToday, description: 'Consumed one time slot.' });
    const timePayload = { day: fromDay, fromSlotId, toSlotId: world.clock.slotId };
    Object.defineProperty(timePayload, 'world', { value: world, enumerable: false });
    events?.emit('onTimeAdvance', timePayload);
    if (world.slotsUsedToday >= availableSlots(calendar)) {
      const settled = settleDay(world, calendar, events);
      settledDays.push(settled.day);
      world.clock.day += 1;
      world.clock.slotId = orderedSlots[0].id;
      world.slotsUsedToday = 0;
      currentIndex = 0;
      changes.push({ path: 'world.clock.day', before: fromDay, after: world.clock.day, description: `Started day ${world.clock.day}.` });
      changes.push({ path: 'world.slotsUsedToday', before: availableSlots(calendar), after: 0, description: 'Reset daily slot usage.' });
      events?.emit('onDayStart', { day: world.clock.day });
    }
  }
  return { requested, advanced, settledDays, changes };
}

export function settleDay(world: WorldState, _calendar: CalendarConfig, events?: EventBus): DailySettlement {
  const day = world.clock.day;
  const facts = { day, footprint: [world.player.nodeId], met: [], relationChanges: [], income: 0, expense: 0, economyTransactions: [], itemsGained: [], appointmentsTomorrow: [] };
  const settlement: DailySettlement = { ...facts, diary: buildLocalDiary(facts) };
  world.settlements.push(settlement);
  if (!world.diary.some((entry) => entry.day === day)) world.diary.push({ day, text: settlement.diary });
  const settlePayload = { day, settlement };
  Object.defineProperty(settlePayload, 'world', { value: world, enumerable: false });
  events?.emit('onDaySettle', settlePayload);
  return settlement;
}

export function endDay(world: WorldState, calendar: CalendarConfig, events?: EventBus): DailySettlement {
  const settlement = settleDay(world, calendar, events);
  const orderedSlots = [...calendar.slots].sort((a, b) => a.order - b.order).slice(0, availableSlots(calendar));
  world.clock.day += 1;
  world.clock.slotId = orderedSlots[0]?.id ?? world.clock.slotId;
  world.slotsUsedToday = 0;
  events?.emit('onDayStart', { day: world.clock.day });
  return settlement;
}
