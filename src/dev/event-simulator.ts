import { isEventEligible, refreshDirectorTension, scheduleDirectorEvent, triggerScheduledEvent } from '../core/events/director';
import type { CalendarConfig, WorldState } from '../data/schema/save';

export interface EventSimulationOptions {
  seeds?: readonly number[];
  days?: number;
  startDay?: number;
  nodeIds?: readonly string[];
}

export interface EventSeedReport {
  seed: number;
  days: number;
  triggeredEvents: number;
  cooldownHits: number;
  eventIntervals: number[];
  tensions: number[];
  eventsById: Record<string, number>;
  maxTension: number;
}

export interface EventDistributionReport {
  days: number;
  seeds: number[];
  runs: EventSeedReport[];
  aggregate: {
    triggeredEvents: number;
    cooldownHits: number;
    averageInterval: number;
    maxTension: number;
    eventsById: Record<string, number>;
  };
}

/** Run deterministic, provider-free event/tension simulations against cloned worlds. */
export function simulateEventDistribution(world: WorldState, calendar: CalendarConfig, options: EventSimulationOptions = {}): EventDistributionReport {
  const days = Math.max(1, Math.floor(options.days ?? 60));
  const seeds = options.seeds?.length ? options.seeds.map((seed) => Math.floor(seed)) : Array.from({ length: 20 }, (_, index) => index + 1);
  const nodeIds = (options.nodeIds?.length ? [...options.nodeIds] : Object.values(world.map.nodes).filter((node) => node.discovered).map((node) => node.id)).filter((id) => Boolean(world.map.nodes[id]));
  const runs = seeds.map((seed) => simulateEventSeed(world, calendar, { seed, days, startDay: options.startDay ?? world.clock.day, nodeIds }));
  const intervals = runs.flatMap((run) => run.eventIntervals);
  const eventsById = runs.reduce<Record<string, number>>((total, run) => {
    for (const [eventId, count] of Object.entries(run.eventsById)) total[eventId] = (total[eventId] ?? 0) + count;
    return total;
  }, {});
  const aggregate = {
    triggeredEvents: runs.reduce((sum, run) => sum + run.triggeredEvents, 0),
    cooldownHits: runs.reduce((sum, run) => sum + run.cooldownHits, 0),
    averageInterval: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0,
    maxTension: Math.max(0, ...runs.map((run) => run.maxTension)),
    eventsById,
  };
  return { days, seeds, runs, aggregate };
}

function simulateEventSeed(world: WorldState, calendar: CalendarConfig, options: { seed: number; days: number; startDay: number; nodeIds: string[] }): EventSeedReport {
  const copy = structuredClone(world);
  const slots = [...calendar.slots].sort((left, right) => left.order - right.order);
  const eventsById: Record<string, number> = {};
  const eventDays: number[] = [];
  const tensions: number[] = [];
  let cooldownHits = 0;
  let randomState = (Math.abs(options.seed) + 1) >>> 0;
  const nextRandom = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };

  if (!options.nodeIds.length || !slots.length) return { seed: options.seed, days: options.days, triggeredEvents: 0, cooldownHits: 0, eventIntervals: [], tensions: [], eventsById, maxTension: 0 };
  for (let dayOffset = 0; dayOffset < options.days; dayOffset += 1) {
    const day = options.startDay + dayOffset;
    for (const slot of slots) {
      const nodeId = options.nodeIds[Math.floor(nextRandom() * options.nodeIds.length)] ?? options.nodeIds[0];
      copy.player.nodeId = nodeId;
      copy.clock = { day, slotId: slot.id };
      const tension = refreshDirectorTension(copy, day);
      tensions.push(tension);
      for (const event of Object.values(copy.eventDefs ?? {})) {
        const eligibility = isEventEligible(copy, event, { nodeId, day, slotId: slot.id });
        if (!eligibility.eligible && eligibility.reason === 'Event is cooling down.') cooldownHits += 1;
      }
      const scheduled = scheduleDirectorEvent(copy, { nodeId, day, slotId: slot.id });
      if (!scheduled) continue;
      const triggered = triggerScheduledEvent(copy, scheduled.id);
      if (!triggered.ok) continue;
      eventsById[scheduled.eventId] = (eventsById[scheduled.eventId] ?? 0) + 1;
      eventDays.push(day);
    }
  }
  const eventIntervals = eventDays.slice(1).map((day, index) => Math.max(0, day - eventDays[index]));
  return { seed: options.seed, days: options.days, triggeredEvents: eventDays.length, cooldownHits, eventIntervals, tensions, eventsById, maxTension: Math.max(0, ...tensions) };
}
