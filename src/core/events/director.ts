import type {
  DirectorState,
  EventDef,
  EventHistoryEntry,
  EventScope,
  ScheduledEvent,
  WorldState,
} from '../../data/schema/save';
import { evaluateCondition, type ConditionScope } from '../expr';
import { deriveNodeScope } from '../encounter/scope';

export interface EventCoordinate {
  nodeId: string;
  day: number;
  slotId: string;
  charIds?: readonly string[];
  revealed?: boolean;
}

export interface EventScheduleResult {
  ok: boolean;
  scheduled?: ScheduledEvent;
  warning?: string;
}

export interface EventTriggerResult {
  ok: boolean;
  event?: EventDef;
  scheduled?: ScheduledEvent;
  history?: EventHistoryEntry;
  content?: string;
  ops: unknown[];
  warning?: string;
}

export function ensureDirector(world: WorldState): DirectorState {
  if (!world.director) world.director = { scheduled: [], lastFiredDay: {}, tension: 0 };
  return world.director;
}

/** Install an event package into the world without changing existing event IDs. */
export function installEventDefs(world: WorldState, events: readonly EventDef[]): { added: number; replaced: number } {
  if (!world.eventDefs) world.eventDefs = {};
  let added = 0;
  let replaced = 0;
  for (const event of events) {
    if (world.eventDefs[event.id]) replaced += 1;
    else added += 1;
    world.eventDefs[event.id] = structuredClone(event);
  }
  return { added, replaced };
}

/** Schedule every eligible static event at a coordinate in stable order. */
export function scheduleEventsForCoordinate(world: WorldState, coordinate: EventCoordinate): ScheduledEvent[] {
  const node = world.map.nodes[coordinate.nodeId];
  if (!node || coordinate.day < 1 || !coordinate.slotId) return [];
  const candidates = Object.values(world.eventDefs ?? {})
    .filter((event) => eventMatchesCoordinate(event, coordinate, world))
    .sort((left, right) => (right.weight ?? 1) - (left.weight ?? 1) || left.id.localeCompare(right.id));
  const scheduled: ScheduledEvent[] = [];
  for (const event of candidates) {
    const result = scheduleEvent(world, event.id, coordinate);
    if (result.ok && result.scheduled) scheduled.push(result.scheduled);
  }
  return scheduled;
}

export function scheduleEvent(world: WorldState, eventId: string, coordinate: EventCoordinate): EventScheduleResult {
  const event = world.eventDefs?.[eventId];
  if (!event) return { ok: false, warning: `Unknown event: ${eventId}.` };
  const node = world.map.nodes[coordinate.nodeId];
  if (!node) return { ok: false, warning: `Unknown event node: ${coordinate.nodeId}.` };
  if (!Number.isInteger(coordinate.day) || coordinate.day < 1) return { ok: false, warning: 'Event day must be a positive integer.' };
  if (!eventMatchesCoordinate(event, coordinate, world)) return { ok: false, warning: `Event ${eventId} does not match this coordinate.` };
  const director = ensureDirector(world);
  const id = eventScheduleId(eventId, coordinate);
  const existing = director.scheduled.find((item) => item.id === id);
  if (existing) return { ok: true, scheduled: existing, warning: `Event ${eventId} is already scheduled at this coordinate.` };
  const scheduled: ScheduledEvent = {
    id,
    eventId,
    day: coordinate.day,
    slotId: coordinate.slotId,
    nodeId: coordinate.nodeId,
    ...(coordinate.charIds?.length ? { charIds: [...new Set(coordinate.charIds)].slice(0, 3) } : {}),
    ...(coordinate.revealed === undefined ? {} : { revealed: coordinate.revealed }),
  };
  director.scheduled.push(scheduled);
  director.scheduled.sort(compareScheduledEvents);
  return { ok: true, scheduled };
}

export function listScheduledEvents(world: WorldState, coordinate?: Partial<EventCoordinate>): ScheduledEvent[] {
  return ensureDirector(world).scheduled.filter((item) => (
    (coordinate?.nodeId === undefined || item.nodeId === coordinate.nodeId)
    && (coordinate?.day === undefined || item.day === coordinate.day)
    && (coordinate?.slotId === undefined || item.slotId === coordinate.slotId)
  )).map((item) => structuredClone(item));
}

export function triggerScheduledEvent(world: WorldState, scheduledId: string, options: { charIds?: readonly string[] } = {}): EventTriggerResult {
  const director = ensureDirector(world);
  const scheduled = director.scheduled.find((item) => item.id === scheduledId);
  if (!scheduled) return rejectedEvent('Unknown scheduled event.');
  if (scheduled.day !== world.clock.day || scheduled.slotId !== world.clock.slotId || scheduled.nodeId !== world.player.nodeId) {
    return rejectedEvent('Scheduled event is not at the current day, slot, and player location.');
  }
  const event = world.eventDefs?.[scheduled.eventId];
  if (!event) return rejectedEvent(`Event definition is missing: ${scheduled.eventId}.`);
  const charIds = [...new Set(options.charIds ?? scheduled.charIds ?? [])].slice(0, 3);
  if (!eventMatchesCoordinate(event, { nodeId: scheduled.nodeId, day: scheduled.day, slotId: scheduled.slotId, charIds }, world)) {
    return rejectedEvent(`Event ${event.id} does not match the current location scope or participants.`);
  }
  if (event.once && director.lastFiredDay[event.id] !== undefined) return rejectedEvent(`Event ${event.id} can only trigger once.`);
  const lastFired = director.lastFiredDay[event.id];
  if (event.cooldownDays !== undefined && lastFired !== undefined && scheduled.day - lastFired <= event.cooldownDays) {
    return rejectedEvent(`Event ${event.id} is cooling down.`);
  }
  if (event.when && !matchesCondition(event.when, world, scheduled)) return rejectedEvent(`Event ${event.id} condition is not satisfied.`);

  const scope = deriveNodeScope(world.map.nodes[scheduled.nodeId], scheduled.slotId);
  const history: EventHistoryEntry = {
    id: `event-history-${scheduled.id}`,
    eventId: event.id,
    title: event.title,
    day: scheduled.day,
    slotId: scheduled.slotId,
    nodeId: scheduled.nodeId,
    charIds,
    scope,
    ...(event.content ? { content: event.content } : {}),
  };
  director.scheduled = director.scheduled.filter((item) => item.id !== scheduled.id);
  director.lastFiredDay[event.id] = scheduled.day;
  world.eventHistory = [...(world.eventHistory ?? []), history].slice(-500);
  return { ok: true, event, scheduled: structuredClone(scheduled), history, content: event.content, ops: event.ops ? structuredClone(event.ops) : [] };
}

function eventMatchesCoordinate(event: EventDef, coordinate: EventCoordinate, world: WorldState): boolean {
  const trigger = event.trigger;
  if (trigger.nodeIds?.length && !trigger.nodeIds.includes(coordinate.nodeId)) return false;
  if (trigger.slotIds?.length && !trigger.slotIds.includes(coordinate.slotId)) return false;
  if (trigger.charIds?.length) {
    const participants = new Set(coordinate.charIds ?? []);
    if (trigger.charIds.some((charId) => !participants.has(charId))) return false;
  }
  const expectedScope: EventScope | undefined = trigger.scope ?? (trigger.nodeIds?.length ? 'formal' : undefined);
  if (expectedScope && deriveNodeScope(world.map.nodes[coordinate.nodeId], coordinate.slotId) !== expectedScope) return false;
  return true;
}

function matchesCondition(condition: string, world: WorldState, scheduled: ScheduledEvent): boolean {
  try {
    return evaluateCondition(condition, {
      day: scheduled.day,
      slotId: scheduled.slotId,
      nodeId: scheduled.nodeId,
      stats: world.stats,
      flags: world.flags,
      player: { nodeId: world.player.nodeId, stats: world.player.stats, flags: world.player.flags },
      relations: world.relations,
    } as unknown as ConditionScope);
  } catch {
    return false;
  }
}

function eventScheduleId(eventId: string, coordinate: EventCoordinate): string {
  return `scheduled-${eventId}-${coordinate.nodeId}-${coordinate.day}-${coordinate.slotId}`;
}

function compareScheduledEvents(left: ScheduledEvent, right: ScheduledEvent): number {
  return left.day - right.day || left.slotId.localeCompare(right.slotId) || left.nodeId.localeCompare(right.nodeId) || left.eventId.localeCompare(right.eventId);
}

function rejectedEvent(warning: string): EventTriggerResult {
  return { ok: false, ops: [], warning };
}

export type { EventScope };
