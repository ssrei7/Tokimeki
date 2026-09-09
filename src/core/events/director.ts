import type {
  DirectorState,
  EventDef,
  EventChoice,
  EventHistoryEntry,
  EventScope,
  ScheduledEvent,
  StageRule,
  WorldState,
} from '../../data/schema/save';
import { evaluateCondition, type ConditionScope } from '../expr';
import { deriveNodeScope } from '../encounter/scope';
import { resolveRelationshipStageId } from '../relationship';
import { upsertMilestone } from '../story';

export interface EventCoordinate {
  nodeId: string;
  day: number;
  slotId: string;
  charIds?: readonly string[];
  revealed?: boolean;
  stageRules?: readonly StageRule[];
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

export interface EventHistoryUpdate {
  choice?: string;
  resultSummary?: string;
  narrative?: string;
}

export interface EventChoiceResult {
  ok: boolean;
  event?: EventDef;
  choice?: EventChoice;
  history?: EventHistoryEntry;
  ops: unknown[];
  warning?: string;
}

export interface EventEligibility {
  eligible: boolean;
  reason?: string;
}

export function ensureDirector(world: WorldState): DirectorState {
  if (!world.director) world.director = { scheduled: [], lastFiredDay: {}, tension: 0, tensionOffset: 0, tensionUpdatedDay: world.clock.day };
  else {
    if (!Number.isFinite(world.director.tensionOffset)) world.director.tensionOffset = 0;
    if (!Number.isInteger(world.director.tensionUpdatedDay) || world.director.tensionUpdatedDay! < 1) world.director.tensionUpdatedDay = world.clock.day;
  }
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
    .filter((event) => isEventEligible(world, event, coordinate).eligible)
    .sort((left, right) => (right.weight ?? 1) - (left.weight ?? 1) || left.id.localeCompare(right.id));
  const scheduled: ScheduledEvent[] = [];
  for (const event of candidates) {
    const result = scheduleEvent(world, event.id, coordinate);
    if (result.ok && result.scheduled) scheduled.push(result.scheduled);
  }
  return scheduled;
}

/** Choose one eligible event with a stable weighted roll for this coordinate. */
export function scheduleDirectorEvent(world: WorldState, coordinate: EventCoordinate): ScheduledEvent | undefined {
  refreshDirectorTension(world, coordinate.day);
  const candidates = Object.values(world.eventDefs ?? {})
    .filter((event) => isEventEligible(world, event, coordinate).eligible)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!candidates.length) return undefined;
  const totalWeight = candidates.reduce((sum, event) => sum + effectiveEventWeight(event, world.director?.tension ?? 0), 0);
  if (totalWeight <= 0) return undefined;
  const roll = stableUnit(`${coordinate.nodeId}:${coordinate.day}:${coordinate.slotId}:${world.director?.tension ?? 0}`) * totalWeight;
  let cursor = 0;
  for (const event of candidates) {
    cursor += effectiveEventWeight(event, world.director?.tension ?? 0);
    if (roll < cursor) return scheduleEvent(world, event.id, coordinate).scheduled;
  }
  return scheduleEvent(world, candidates.at(-1)!.id, coordinate).scheduled;
}

export function isEventEligible(world: WorldState, event: EventDef, coordinate: EventCoordinate): EventEligibility {
  if (!eventMatchesCoordinate(event, coordinate, world)) return { eligible: false, reason: 'Event trigger does not match this coordinate.' };
  const director = ensureDirector(world);
  refreshDirectorTension(world, coordinate.day);
  if (event.once && director.lastFiredDay[event.id] !== undefined) return { eligible: false, reason: 'Event has already fired.' };
  const lastFired = director.lastFiredDay[event.id];
  if (event.cooldownDays !== undefined && lastFired !== undefined && coordinate.day - lastFired <= event.cooldownDays) return { eligible: false, reason: 'Event is cooling down.' };
  if (director.globalCooldownUntilDay !== undefined && coordinate.day < director.globalCooldownUntilDay) return { eligible: false, reason: 'Director is in a global cooldown.' };
  if (event.when && !matchesCondition(event.when, world, { id: eventScheduleId(event.id, coordinate), eventId: event.id, day: coordinate.day, slotId: coordinate.slotId, nodeId: coordinate.nodeId, ...(coordinate.charIds?.length ? { charIds: [...coordinate.charIds] } : {}) })) return { eligible: false, reason: 'Event condition is not satisfied.' };
  const tension = director.tension;
  if (event.tension?.min !== undefined && tension < event.tension.min) return { eligible: false, reason: 'Event tension is below its minimum.' };
  if (event.tension?.max !== undefined && tension > event.tension.max) return { eligible: false, reason: 'Event tension is above its maximum.' };
  return { eligible: true };
}

/** Derive a bounded quiet-period tension value from the last fired event day. */
export function refreshDirectorTension(world: WorldState, day = world.clock.day): number {
  const director = ensureDirector(world);
  const latestFiredDay = Math.max(0, ...Object.values(director.lastFiredDay));
  const previousDay = director.tensionUpdatedDay ?? day;
  const elapsedDays = Math.max(0, day - previousDay);
  if (elapsedDays > 0) director.tensionOffset = Math.max(0, director.tensionOffset - elapsedDays);
  director.tensionUpdatedDay = day;
  const quietDays = Math.max(0, day - Math.max(1, latestFiredDay));
  director.tension = Math.max(0, Math.min(100, quietDays * 10 + director.tensionOffset));
  return director.tension;
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

export function listPendingEvents(world: WorldState, options: { fromDay?: number; toDay?: number; revealed?: boolean } = {}): ScheduledEvent[] {
  const fromDay = options.fromDay ?? world.clock.day;
  return listScheduledEvents(world).filter((item) => (
    item.day >= fromDay
    && (options.toDay === undefined || item.day <= options.toDay)
    && (options.revealed === undefined || Boolean(item.revealed) === options.revealed)
  ));
}

export function setScheduledEventRevealed(world: WorldState, scheduledId: string, revealed = true): { ok: boolean; warning?: string } {
  const scheduled = ensureDirector(world).scheduled.find((item) => item.id === scheduledId);
  if (!scheduled) return { ok: false, warning: 'Unknown scheduled event.' };
  scheduled.revealed = revealed;
  return { ok: true };
}

export function triggerScheduledEvent(world: WorldState, scheduledId: string, options: { charIds?: readonly string[]; stageRules?: readonly StageRule[] } = {}): EventTriggerResult {
  const director = ensureDirector(world);
  refreshDirectorTension(world);
  const scheduled = director.scheduled.find((item) => item.id === scheduledId);
  if (!scheduled) return rejectedEvent('Unknown scheduled event.');
  if (scheduled.day !== world.clock.day || scheduled.slotId !== world.clock.slotId || scheduled.nodeId !== world.player.nodeId) {
    return rejectedEvent('Scheduled event is not at the current day, slot, and player location.');
  }
  const event = world.eventDefs?.[scheduled.eventId];
  if (!event) return rejectedEvent(`Event definition is missing: ${scheduled.eventId}.`);
  const charIds = [...new Set(options.charIds ?? scheduled.charIds ?? [])].slice(0, 3);
  if (!eventMatchesCoordinate(event, { nodeId: scheduled.nodeId, day: scheduled.day, slotId: scheduled.slotId, charIds, stageRules: options.stageRules }, world)) {
    return rejectedEvent(`Event ${event.id} does not match the current location scope or participants.`);
  }
  const eligibility = isEventEligible(world, event, { nodeId: scheduled.nodeId, day: scheduled.day, slotId: scheduled.slotId, charIds, stageRules: options.stageRules });
  if (!eligibility.eligible) return rejectedEvent(eligibility.reason ?? `Event ${event.id} is not eligible.`);

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
    ...(event.content ? { narrative: event.content } : {}),
  };
  director.scheduled = director.scheduled.filter((item) => item.id !== scheduled.id);
  director.lastFiredDay[event.id] = scheduled.day;
  director.tensionOffset = Math.max(-100, Math.min(100, director.tensionOffset + (event.tension?.delta ?? 0)));
  refreshDirectorTension(world, scheduled.day);
  world.eventHistory = [...(world.eventHistory ?? []), history].slice(-500);
  if (event.milestone) upsertMilestone(world, { id: `milestone-${scheduled.id}`, day: scheduled.day, text: event.milestone.text, charIds: event.milestone.charIds ?? charIds });
  return { ok: true, event, scheduled: structuredClone(scheduled), history, content: event.content, ops: event.ops ? structuredClone(event.ops) : [] };
}

/** Update replay metadata without changing any deterministic world facts. */
export function updateEventHistory(world: WorldState, historyId: string, update: EventHistoryUpdate): { ok: boolean; warning?: string; history?: EventHistoryEntry } {
  const history = (world.eventHistory ?? []).find((entry) => entry.id === historyId);
  if (!history) return { ok: false, warning: 'Unknown event history entry.' };
  if (update.choice !== undefined) history.choice = update.choice.slice(0, 1000);
  if (update.resultSummary !== undefined) history.resultSummary = update.resultSummary.slice(0, 2000);
  if (update.narrative !== undefined) history.narrative = update.narrative.slice(0, 10000);
  return { ok: true, history: structuredClone(history) };
}

/** Resolve one package-declared choice and return its whitelisted ops for the caller to apply. */
export function resolveEventChoice(world: WorldState, historyId: string, choiceId: string): EventChoiceResult {
  const history = (world.eventHistory ?? []).find((entry) => entry.id === historyId);
  if (!history) return { ok: false, ops: [], warning: 'Unknown event history entry.' };
  if (history.choice) return { ok: false, ops: [], warning: 'This event already has a recorded choice.' };
  const event = world.eventDefs?.[history.eventId];
  if (!event) return { ok: false, ops: [], warning: `Event definition is missing: ${history.eventId}.` };
  const choice = event.choices?.find((item) => item.id === choiceId);
  if (!choice) return { ok: false, ops: [], warning: `Unknown choice for event ${event.id}.` };
  history.choice = choice.label;
  if (choice.resultSummary) history.resultSummary = choice.resultSummary;
  if (choice.narrative) history.narrative = choice.narrative;
  return { ok: true, event, choice: structuredClone(choice), history: structuredClone(history), ops: choice.ops ? structuredClone(choice.ops) : [] };
}

function eventMatchesCoordinate(event: EventDef, coordinate: EventCoordinate, world: WorldState): boolean {
  const trigger = event.trigger;
  if (trigger.nodeIds?.length && !trigger.nodeIds.includes(coordinate.nodeId)) return false;
  if (trigger.slotIds?.length && !trigger.slotIds.includes(coordinate.slotId)) return false;
  if (trigger.charIds?.length) {
    const participants = new Set(coordinate.charIds ?? []);
    if (trigger.charIds.some((charId) => !participants.has(charId))) return false;
  }
  if (event.stageRange && !stageRangeMatches(event, coordinate, world)) return false;
  const expectedScope: EventScope | undefined = trigger.scope ?? (trigger.nodeIds?.length ? 'formal' : undefined);
  if (expectedScope && deriveNodeScope(world.map.nodes[coordinate.nodeId], coordinate.slotId) !== expectedScope) return false;
  return true;
}

function stageRangeMatches(event: EventDef, coordinate: EventCoordinate, world: WorldState): boolean {
  const range = event.stageRange;
  if (!range) return true;
  const participants = coordinate.charIds ?? [];
  const rules = [...(coordinate.stageRules ?? [])].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const minIndex = range.min ? rules.findIndex((rule) => rule.id === range.min) : 0;
  const maxIndex = range.max ? rules.findIndex((rule) => rule.id === range.max) : rules.length - 1;
  if (!participants.length || !rules.length || minIndex < 0 || maxIndex < 0 || minIndex > maxIndex) return false;
  return participants.every((charId) => {
    const relation = world.relations[charId];
    if (!relation) return false;
    const stageId = relation.stageId ?? resolveRelationshipStageId(relation.axes, world, rules);
    if (!stageId) return false;
    const index = rules.findIndex((rule) => rule.id === stageId);
    return index >= minIndex && index <= maxIndex;
  });
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

function stableUnit(source: string): number {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function eventScheduleId(eventId: string, coordinate: EventCoordinate): string {
  return `scheduled-${eventId}-${coordinate.nodeId}-${coordinate.day}-${coordinate.slotId}`;
}

function compareScheduledEvents(left: ScheduledEvent, right: ScheduledEvent): number {
  return left.day - right.day || left.slotId.localeCompare(right.slotId) || left.nodeId.localeCompare(right.nodeId) || left.eventId.localeCompare(right.eventId);
}

function effectiveEventWeight(event: EventDef, tension: number): number {
  const base = Math.max(0, event.weight ?? 1);
  const boost = Math.max(0, event.tension?.weightBoost ?? 0);
  return base * (1 + (tension / 100) * boost);
}

function rejectedEvent(warning: string): EventTriggerResult {
  return { ok: false, ops: [], warning };
}

export type { EventScope };
