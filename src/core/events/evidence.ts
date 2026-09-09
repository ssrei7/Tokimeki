import type { CollectionEntry, EventDef, EventEvidenceRule, EventHistoryEntry, WorldState } from '../../data/schema/save';
import { evaluateCondition, type ConditionScope } from '../expr';

export interface EvidenceReactionResult {
  ok: boolean;
  matched: boolean;
  event?: EventDef;
  history?: EventHistoryEntry;
  collection?: CollectionEntry;
  rule?: EventEvidenceRule;
  response?: string;
  ops: unknown[];
  warning?: string;
}

/** Match one owned collection entry against the event's deterministic evidence rules. */
export function evaluateEvidenceReaction(world: WorldState, historyId: string, collectionId: string): EvidenceReactionResult {
  const history = (world.eventHistory ?? []).find((entry) => entry.id === historyId);
  if (!history) return { ok: false, matched: false, ops: [], warning: 'Unknown event history entry.' };
  const event = world.eventDefs?.[history.eventId];
  if (!event) return { ok: false, matched: false, ops: [], warning: `Event definition is missing: ${history.eventId}.` };
  const collection = (world.collection ?? []).find((entry) => entry.id === collectionId);
  if (!collection) return { ok: false, matched: false, event, history: structuredClone(history), ops: [], warning: 'Unknown collection entry.' };
  const owned = world.player.inventory.some((entry) => entry.itemId === collection.itemId && entry.count > 0);
  if (!owned) return { ok: false, matched: false, event, history: structuredClone(history), collection: structuredClone(collection), ops: [], warning: 'The player no longer owns this collection item.' };
  const item = world.items[collection.itemId];
  const itemTags = new Set(item?.tags ?? collection.tags);
  const rule = (event.evidenceRules ?? []).find((candidate) => matchesRule(candidate, history, collection, itemTags, world));
  if (!rule) return { ok: true, matched: false, event, history: structuredClone(history), collection: structuredClone(collection), ops: [] };
  return { ok: true, matched: true, event, history: structuredClone(history), collection: structuredClone(collection), rule: structuredClone(rule), response: rule.response, ops: rule.ops ? structuredClone(rule.ops) : [] };
}

function matchesRule(rule: EventEvidenceRule, history: EventHistoryEntry, collection: CollectionEntry, itemTags: Set<string>, world: WorldState): boolean {
  if (rule.itemId && rule.itemId !== collection.itemId) return false;
  if (rule.tags?.some((tag) => !itemTags.has(tag))) return false;
  if (rule.charIds?.length && !rule.charIds.some((charId) => history.charIds.includes(charId))) return false;
  if (!rule.when) return true;
  try {
    return evaluateCondition(rule.when, {
      day: history.day, slotId: history.slotId, nodeId: history.nodeId,
      stats: world.stats, flags: world.flags,
      player: { nodeId: world.player.nodeId, stats: world.player.stats, flags: world.player.flags },
      relations: world.relations,
    } as unknown as ConditionScope);
  } catch {
    return false;
  }
}
