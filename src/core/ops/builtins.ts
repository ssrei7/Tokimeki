import { z } from 'zod';
import type { WorldState } from '../../data/schema/save';
import { OpRegistry } from './registry';
import type { OpContext, OpResult } from './types';
import { advanceTime } from '../time';
import { movePlayer, revealNode } from '../map';
import { moveNpc, promoteNpc, proposeDeparture, resolveDeparture, triggerEncounter } from '../encounter';
import { canUnlockTopic, topicTreeKey } from '../topics';
import { evaluateGift, resolveRelationshipStageId } from '../relationship';
import { evaluateCondition, type ConditionScope } from '../expr';
import { makeAppointment } from '../appointments/op';
import { scheduleEvent } from '../events/director';

const StatTargetSchema = z.enum(['player', 'world']);
const AddStatSchema = z.object({ op: z.literal('add_stat'), target: StatTargetSchema, key: z.string().min(1), delta: z.number().finite() });
const SetStatSchema = z.object({ op: z.literal('set_stat'), target: StatTargetSchema, key: z.string().min(1), value: z.number().finite() });
const SetFlagSchema = z.object({ op: z.literal('set_flag'), target: StatTargetSchema.default('world'), key: z.string().min(1), value: z.boolean() });
const GiveItemSchema = z.object({ op: z.literal('give_item'), id: z.string().min(1), count: z.number().int().positive().default(1), from: z.string().min(1).optional() });
const TakeItemSchema = z.object({ op: z.literal('take_item'), id: z.string().min(1), count: z.number().int().positive().default(1) });
const AddMemorySchema = z.object({
  op: z.literal('add_memory'), target: z.string().min(1), text: z.string().min(1).max(1000),
  type: z.enum(['interaction', 'promise', 'preference', 'event', 'observation', 'other']).default('interaction'),
  importance: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
});
const AddNodeMemorySchema = z.object({ op: z.literal('add_node_memory'), nodeId: z.string().min(1).optional(), text: z.string().min(1).max(1000), charIds: z.array(z.string().min(1)).max(3).default([]), pinned: z.boolean().optional() });
const AdvanceTimeSchema = z.object({ op: z.literal('advance_time'), kind: z.string().min(1).optional(), slots: z.number().int().positive().default(1) });
const MovePlayerSchema = z.object({ op: z.literal('move_player'), nodeId: z.string().min(1) });
const RevealNodeSchema = z.object({ op: z.literal('reveal_node'), nodeId: z.string().min(1) });
const MoveNpcSchema = z.object({ op: z.literal('move_npc'), target: z.string().min(1), nodeId: z.string().min(1), slotId: z.string().min(1).optional(), activity: z.string().min(1).max(200).optional() });
const PromoteNpcSchema = z.object({ op: z.literal('promote_npc'), target: z.string().min(1), description: z.string().min(1).max(500).optional(), personality: z.string().min(1).max(500).optional(), scenario: z.string().min(1).max(500).optional(), firstMes: z.string().min(1).max(500).optional(), exampleDialogue: z.string().min(1).max(1000).optional() });
const UnlockTopicSchema = z.object({ op: z.literal('unlock_topic'), id: z.string().min(1) });
const MarkTopicUsedSchema = z.object({ op: z.literal('mark_topic_used'), id: z.string().min(1) });
const SetMoodSchema = z.object({ op: z.literal('set_mood'), target: z.string().min(1), word: z.string().min(1).max(80), decayDays: z.number().int().nonnegative().max(365) });
const AdjustRelationAxisSchema = z.object({ op: z.literal('adjust_relation_axis'), target: z.string().min(1), key: z.string().min(1), delta: z.number().finite() });
const AddKnotSchema = z.object({ op: z.literal('add_knot'), target: z.string().min(1), id: z.string().min(1), text: z.string().min(1).max(300), resolveCondition: z.string().min(1).optional() });
const ResolveKnotSchema = z.object({ op: z.literal('resolve_knot'), target: z.string().min(1), id: z.string().min(1) });
const OfferGiftSchema = z.object({ op: z.literal('offer_gift'), target: z.string().min(1), itemId: z.string().min(1) });
const ResolveGiftSchema = z.object({ op: z.literal('resolve_gift'), giftId: z.string().min(1), reaction: z.enum(['special', 'liked', 'disliked', 'neutral']) });
const MakeAppointmentSchema = z.object({ op: z.literal('make_appointment'), id: z.string().min(1), charId: z.string().min(1), day: z.number().int().positive(), slotId: z.string().min(1), nodeId: z.string().min(1), note: z.string().min(1).max(200).optional() });
const ProposeDepartureSchema = z.object({ op: z.literal('propose_departure'), entryId: z.string().min(1), kind: z.enum(['player_farewell', 'character_request']), speakerId: z.string().min(1).optional(), reason: z.string().min(1).max(300).optional() });
const ResolveDepartureSchema = z.object({ op: z.literal('resolve_departure'), entryId: z.string().min(1), outcome: z.enum(['stayed', 'left']) });
const QueueEventSchema = z.object({ op: z.literal('queue_event'), eventId: z.string().min(1), day: z.number().int().positive(), slotId: z.string().min(1), nodeId: z.string().min(1), charIds: z.array(z.string().min(1)).max(3).optional(), revealed: z.boolean().optional() });

export function createDefaultOpRegistry(): OpRegistry {
  const registry = new OpRegistry();
  registerBuiltInOps(registry);
  return registry;
}

export function registerBuiltInOps(registry: OpRegistry): void {
  registry.register({
    op: 'add_stat', schema: AddStatSchema, clamp: { numeric: { delta: { min: -10, max: 10 } } },
    promptDoc: 'add_stat: {"op":"add_stat","target":"player|world","key":"stat-id","delta":number}; delta is clamped to -10..10.',
    describe: (payload) => `${payload.target}.stats.${payload.key} ${payload.delta >= 0 ? '+' : ''}${payload.delta}`,
    apply: (payload, context) => updateStat(context.world, payload.target, payload.key, (before) => before + payload.delta, `${payload.target}.stats.${payload.key} changed by ${payload.delta}.`),
  });
  registry.register({
    op: 'set_stat', schema: SetStatSchema, clamp: { numeric: { value: { min: -1_000_000, max: 1_000_000 } } },
    promptDoc: 'set_stat: {"op":"set_stat","target":"player|world","key":"stat-id","value":number}.',
    describe: (payload) => `set ${payload.target}.stats.${payload.key} to ${payload.value}`,
    apply: (payload, context) => updateStat(context.world, payload.target, payload.key, () => payload.value, `${payload.target}.stats.${payload.key} set to ${payload.value}.`),
  });
  registry.register({
    op: 'set_flag', schema: SetFlagSchema, clamp: {},
    promptDoc: 'set_flag: {"op":"set_flag","target":"player|world","key":"flag-id","value":boolean}; target defaults to world.',
    describe: (payload) => `set ${payload.target}.flags.${payload.key} to ${payload.value}`,
    apply: (payload, context) => {
      const flags = payload.target === 'player' ? context.world.player.flags : context.world.flags;
      const before = flags[payload.key]; flags[payload.key] = payload.value;
      return changed(`${payload.target}.flags.${payload.key}`, before, payload.value, `Flag ${payload.key} set to ${payload.value}.`);
    },
  });
  registry.register({
    op: 'give_item', schema: GiveItemSchema, clamp: { numeric: { count: { min: 1, max: 99 } } },
    promptDoc: 'give_item: {"op":"give_item","id":"known-item-id","count":positive integer,"from":"character-id"}; count defaults to 1.',
    describe: (payload) => `give ${payload.id} x${payload.count}`,
    apply: (payload, context) => giveItem(payload, context),
  });
  registry.register({
    op: 'take_item', schema: TakeItemSchema, clamp: { numeric: { count: { min: 1, max: 99 } } },
    promptDoc: 'take_item: {"op":"take_item","id":"owned-item-id","count":positive integer}; count defaults to 1.',
    describe: (payload) => `take ${payload.id} x${payload.count}`,
    apply: (payload, context) => takeItem(payload, context),
  });
  registry.register({
    op: 'add_memory', schema: AddMemorySchema, clamp: {},
    promptDoc: 'add_memory: {"op":"add_memory","target":"current-character-id","text":"fact grounded in this scene","type":"interaction|promise|preference|event|observation|other","importance":"low|normal|high|critical"}.',
    describe: (payload) => `add memory for ${payload.target}: ${payload.text}`,
    apply: (payload, context) => addMemory(payload, context),
  });
  registry.register({
    op: 'add_node_memory', schema: AddNodeMemorySchema, clamp: {},
    promptDoc: 'add_node_memory: {"op":"add_node_memory","nodeId":"current-node-id","text":"fact grounded in this place","charIds":["character-id"],"pinned":false}; records a visit memory on the current node, keeping at most five memories.',
    describe: (payload) => `add node memory at ${payload.nodeId ?? 'current node'}: ${payload.text}`,
    apply: (payload, context) => addNodeMemory(payload, context),
  });
  registry.register({
    op: 'advance_time', schema: AdvanceTimeSchema, clamp: { numeric: { slots: { min: 1, max: 24 } } },
    promptDoc: 'advance_time: {"op":"advance_time","kind":"action-kind","slots":positive integer}; advances the deterministic world clock.',
    describe: (payload) => `advance time ${payload.kind ?? ''} x${payload.slots}`.trim(),
    apply: (payload, context) => {
      if (!context.calendar) return { ok: false, changes: [], warning: 'Calendar is unavailable.' };
      if (payload.kind && !context.actionCosts?.[payload.kind]) return { ok: false, changes: [], warning: `Unknown action kind: ${payload.kind}.` };
      const result = payload.kind
        ? advanceTime(context.world, context.calendar, Math.max(0, Math.floor((context.actionCosts ?? {})[payload.kind]?.slotCost ?? 0)) * payload.slots, context.events)
        : advanceTime(context.world, context.calendar, payload.slots, context.events);
      if (result.advanced === 0) return { ok: true, changes: [], warning: context.calendar.unlimitedSlots ? 'Sandbox time does not consume slots.' : 'No time slots were advanced.' };
      return { ok: true, changes: result.changes };
    },
  });
  registry.register({
    op: 'move_player', schema: MovePlayerSchema, clamp: {},
    promptDoc: 'move_player: {"op":"move_player","nodeId":"reachable-node-id"}; moves the player after deterministic route, fog, opening, and time checks.',
    describe: (payload) => `move player to ${payload.nodeId}`,
    apply: (payload, context) => {
      if (!context.calendar) return { ok: false, changes: [], warning: 'Calendar is unavailable.' };
      const result = movePlayer(context.world, context.calendar, payload.nodeId, context.events);
      if (!result.ok) return { ok: false, changes: result.changes, warning: result.warning };
      const encounter = context.encounterConfig && context.world.map.nodes[payload.nodeId]
        ? triggerEncounter(context.world, context.encounterConfig, { nodeId: payload.nodeId, trigger: 'enter', daysPerWeek: context.calendar.daysPerWeek, events: context.events })
        : undefined;
      return { ok: true, changes: [...result.changes, ...(encounter?.changes ?? [])], warning: result.warning };
    },
  });
  registry.register({
    op: 'reveal_node', schema: RevealNodeSchema, clamp: {},
    promptDoc: 'reveal_node: {"op":"reveal_node","nodeId":"node-id"}; reveals a known map node without consuming time.',
    describe: (payload) => `reveal node ${payload.nodeId}`,
    apply: (payload, context) => {
      const result = revealNode(context.world, payload.nodeId);
      return { ok: result.ok, changes: result.changes, warning: result.warning };
    },
  });
  registry.register({
    op: 'move_npc', schema: MoveNpcSchema, clamp: {},
    promptDoc: 'move_npc: {"op":"move_npc","target":"formal-character-id","nodeId":"node-id","slotId":"slot-id","activity":"what they are doing"}; writes a same-day schedule override for the current game day.',
    describe: (payload) => `move ${payload.target} to ${payload.nodeId}`,
    apply: (payload, context) => {
      const result = moveNpc(context.world, payload.target, payload.nodeId, context.day, payload.slotId ?? context.slotId, payload.activity);
      if (!result.ok) return { ok: false, changes: result.changes, warning: result.warning };
      const encounter = context.encounterConfig
        ? triggerEncounter(context.world, context.encounterConfig, { nodeId: payload.nodeId, trigger: 'character_move', day: context.day, slotId: payload.slotId ?? context.slotId, daysPerWeek: context.calendar?.daysPerWeek, events: context.events })
        : undefined;
      return { ok: true, changes: [...result.changes, ...(encounter?.changes ?? [])], warning: result.warning };
    },
  });
  registry.register({
    op: 'promote_npc', schema: PromoteNpcSchema, clamp: {},
    promptDoc: 'promote_npc: {"op":"promote_npc","target":"semi-npc-id","description":"角色简介","personality":"性格","scenario":"当前处境","firstMes":"初次完整对话开场","exampleDialogue":"示例台词"}; converts one known semi-formal NPC into a formal character while preserving schedule and light memories.',
    describe: (payload) => `promote NPC ${payload.target}`,
    apply: (payload, context) => {
      const beforeNpc = context.world.npcs[payload.target] ? structuredClone(context.world.npcs[payload.target]) : undefined;
      const result = promoteNpc(context.world, payload.target, payload);
      if (!result.ok || !result.character) return { ok: false, changes: [], warning: result.warning };
      return { ok: true, changes: [{ path: `world.characters.${payload.target}`, before: undefined, after: result.character, description: `Promoted ${result.character.name} to a formal character.` }, { path: `world.npcs.${payload.target}`, before: beforeNpc, after: undefined, description: `Removed semi-formal NPC ${payload.target} after promotion.` }] };
    },
  });
  registry.register({
    op: 'unlock_topic', schema: UnlockTopicSchema, clamp: {},
    promptDoc: 'unlock_topic: {"op":"unlock_topic","id":"topic-id"}; unlocks a topic already present in the current topic tree.',
    describe: (payload) => `unlock topic ${payload.id}`,
    apply: (payload, context) => unlockTopic(payload.id, context),
  });
  registry.register({
    op: 'mark_topic_used', schema: MarkTopicUsedSchema, clamp: {},
    promptDoc: 'mark_topic_used: {"op":"mark_topic_used","id":"topic-id"}; records that the current topic was used today.',
    describe: (payload) => `mark topic ${payload.id} used`,
    apply: (payload, context) => markTopicUsed(payload.id, context),
  });
  registry.register({
    op: 'set_mood', schema: SetMoodSchema, clamp: {},
    promptDoc: 'set_mood: {"op":"set_mood","target":"current-character-id","word":"心情词","decayDays":number}; writes a decaying mood for the current relationship.',
    describe: (payload) => `set mood for ${payload.target}: ${payload.word}`,
    apply: (payload, context) => setMood(payload, context),
  });
  registry.register({
    op: 'adjust_relation_axis', schema: AdjustRelationAxisSchema, clamp: { numeric: { delta: { min: -1_000_000, max: 1_000_000 } } },
    promptDoc: 'adjust_relation_axis: {"op":"adjust_relation_axis","target":"current-character-id","key":"axis-id","delta":number}; applies the configured axis clamp and refreshes the relationship stage.',
    describe: (payload) => `adjust ${payload.target}.${payload.key} by ${payload.delta}`,
    apply: (payload, context) => adjustRelationAxis(payload, context),
  });
  registry.register({
    op: 'add_knot', schema: AddKnotSchema, clamp: {},
    promptDoc: 'add_knot: {"op":"add_knot","target":"current-character-id","id":"knot-id","text":"持续存在的心结","resolveCondition":"条件表达式"}; adds a relationship knot owned by the deterministic core.',
    describe: (payload) => `add knot ${payload.target}.${payload.id}`,
    apply: (payload, context) => addKnot(payload, context),
  });
  registry.register({
    op: 'resolve_knot', schema: ResolveKnotSchema, clamp: {},
    promptDoc: 'resolve_knot: {"op":"resolve_knot","target":"current-character-id","id":"knot-id"}; resolves a knot only when its stored condition is true.',
    describe: (payload) => `resolve knot ${payload.target}.${payload.id}`,
    apply: (payload, context) => resolveKnot(payload, context),
  });
  registry.register({
    op: 'offer_gift', schema: OfferGiftSchema, clamp: {},
    promptDoc: 'offer_gift: {"op":"offer_gift","target":"current-character-id","itemId":"owned-giftable-item-id"}; consumes one owned gift and creates a pending gift reaction for the current character.',
    describe: (payload) => `offer gift ${payload.itemId} to ${payload.target}`,
    apply: (payload, context) => offerGift(payload, context),
  });
  registry.register({
    op: 'resolve_gift', schema: ResolveGiftSchema, clamp: {},
    promptDoc: 'resolve_gift: {"op":"resolve_gift","giftId":"pending-gift-id","reaction":"special|liked|disliked|neutral"}; confirms the current character\'s reaction to one pending gift. Do not use this for other state changes.',
    describe: (payload) => `resolve gift ${payload.giftId} as ${payload.reaction}`,
    apply: (payload, context) => resolveGift(payload, context),
  });
  registry.register({
    op: 'make_appointment', schema: MakeAppointmentSchema, clamp: {},
    promptDoc: 'make_appointment: {"op":"make_appointment","id":"appointment-id","charId":"character-id","day":future-day,"slotId":"calendar-slot-id","nodeId":"known-node-id","note":"optional reminder"}; creates a pending appointment without consuming time.',
    describe: (payload) => `make appointment ${payload.id} with ${payload.charId} on day ${payload.day}`,
    apply: (payload, context) => makeAppointment(payload, context),
  });
  registry.register({
    op: 'queue_event', schema: QueueEventSchema, clamp: {},
    promptDoc: 'queue_event: {"op":"queue_event","eventId":"known-event-id","day":future-day,"slotId":"calendar-slot-id","nodeId":"known-node-id","charIds":["participant-id"],"revealed":false}; schedules a known event without calling an API or applying its result.',
    describe: (payload) => `queue event ${payload.eventId} on day ${payload.day}`,
    apply: (payload, context) => {
      if (payload.day < context.day) return { ok: false, changes: [], warning: 'Event day cannot be earlier than the current day.' };
      const before = structuredClone(context.world.director?.scheduled ?? []);
      const result = scheduleEvent(context.world, payload.eventId, { nodeId: payload.nodeId, day: payload.day, slotId: payload.slotId, charIds: payload.charIds, revealed: payload.revealed, stageRules: context.stageRules });
      if (!result.ok || !result.scheduled) return { ok: false, changes: [], warning: result.warning };
      return { ok: true, changes: [{ path: 'world.director.scheduled', before, after: structuredClone(context.world.director?.scheduled ?? []), description: `Queued event ${payload.eventId} for day ${payload.day}.` }] };
    },
  });
  registry.register({
    op: 'propose_departure', schema: ProposeDepartureSchema, clamp: {},
    promptDoc: 'propose_departure: {"op":"propose_departure","entryId":"encounter-log-id","kind":"character_request|player_farewell","speakerId":"participant-id","reason":"optional reason"}; records a pending goodbye signal without changing time.',
    describe: (payload) => `propose ${payload.kind} for encounter ${payload.entryId}`,
    apply: (payload, context) => proposeDeparture(context.world, payload.entryId, payload.kind, payload.speakerId, payload.reason),
  });
  registry.register({
    op: 'resolve_departure', schema: ResolveDepartureSchema, clamp: {},
    promptDoc: 'resolve_departure: {"op":"resolve_departure","entryId":"encounter-log-id","outcome":"stayed|left"}; resolves a pending goodbye signal and records whether the scene continued or ended.',
    describe: (payload) => `resolve departure for encounter ${payload.entryId} as ${payload.outcome}`,
    apply: (payload, context) => resolveDeparture(context.world, payload.entryId, payload.outcome),
  });
}

function statsFor(world: WorldState, target: z.infer<typeof StatTargetSchema>): Record<string, number> {
  return target === 'player' ? world.player.stats : world.stats;
}

function updateStat(world: WorldState, target: z.infer<typeof StatTargetSchema>, key: string, update: (before: number) => number, description: string): OpResult {
  const stats = statsFor(world, target); const before = stats[key] ?? 0; const after = update(before); stats[key] = after;
  return changed(`${target}.stats.${key}`, before, after, description);
}

function giveItem(payload: z.infer<typeof GiveItemSchema>, context: OpContext): OpResult {
  if (!context.world.items[payload.id]) return rejected(`Unknown item: ${payload.id}`);
  if (payload.from && payload.from !== context.actorId) return rejected('Item giver must be the current actor.');
  const before = itemCount(context.world, payload.id);
  const existing = context.world.player.inventory.find((entry) => entry.itemId === payload.id);
  if (existing) existing.count += payload.count;
  else context.world.player.inventory.push({ itemId: payload.id, count: payload.count, gotDay: context.day, gotNodeId: context.nodeId, ...(payload.from ? { fromCharId: payload.from } : {}) });
  const item = context.world.items[payload.id];
  const collectionBefore = context.world.collection.length;
  for (let index = 0; index < payload.count; index += 1) context.world.collection.push({ id: `collection-${payload.id}-${context.day}-${collectionBefore + index + 1}`, itemId: item.id, title: item.name, description: item.description ?? '', tags: [...item.tags], day: context.day, nodeId: context.nodeId, ...(payload.from ? { sourceCharId: payload.from } : {}) });
  return {
    ok: true,
    changes: [
      ...changed(`player.inventory.${payload.id}`, before, before + payload.count, `Received ${payload.id} x${payload.count}.`).changes,
      ...changed('world.collection', collectionBefore, context.world.collection.length, `Recorded ${payload.id} in collection.`).changes,
    ],
  };
}

function takeItem(payload: z.infer<typeof TakeItemSchema>, context: OpContext): OpResult {
  const before = itemCount(context.world, payload.id);
  if (before < payload.count) return rejected(`Not enough ${payload.id}: requested ${payload.count}, owned ${before}.`);
  let remaining = payload.count;
  for (const entry of context.world.player.inventory) {
    if (entry.itemId !== payload.id || remaining === 0) continue;
    const taken = Math.min(entry.count, remaining); entry.count -= taken; remaining -= taken;
  }
  context.world.player.inventory = context.world.player.inventory.filter((entry) => entry.count > 0);
  return changed(`player.inventory.${payload.id}`, before, before - payload.count, `Removed ${payload.id} x${payload.count}.`);
}

function addMemory(payload: z.infer<typeof AddMemorySchema>, context: OpContext): OpResult {
  if (!context.actorId || payload.target !== context.actorId) return rejected('Memory target must be the current actor.');
  const relation = context.world.relations[payload.target] ?? { memories: [] };
  context.world.relations[payload.target] = relation;
  const source = context.memorySource?.chatCharacterId === payload.target
    ? { kind: context.memorySource.kind ?? 'chat', chatCharacterId: payload.target, chatMessageIndex: context.memorySource.messageIndex, ...(context.memorySource.messageIndices?.length ? { chatMessageIndices: context.memorySource.messageIndices } : {}) }
    : { kind: 'system' as const };
  const memory = {
    id: `memory-${payload.target}-${context.day}-${relation.memories.length + 1}`,
    text: payload.text,
    day: context.day,
    nodeId: context.nodeId,
    type: payload.type,
    importance: payload.importance,
    archived: false,
    inject: true,
    source,
    ...(context.memorySource?.chatCharacterId === payload.target ? { sourceChatMessageIndex: context.memorySource.messageIndex } : {}),
    ...(context.memorySource?.chatCharacterId === payload.target && context.memorySource.messageIndices?.length ? { sourceChatMessageIndices: context.memorySource.messageIndices } : {}),
  };
  relation.memories.push(memory);
  return changed(`relations.${payload.target}.memories`, relation.memories.length - 1, relation.memories.length, `Added memory for ${payload.target}.`);
}

function addNodeMemory(payload: z.infer<typeof AddNodeMemorySchema>, context: OpContext): OpResult {
  const nodeId = payload.nodeId ?? context.nodeId;
  if (nodeId !== context.nodeId) return rejected('Node memory must target the current node.');
  const node = context.world.map.nodes[nodeId];
  if (!node) return rejected(`Unknown node: ${nodeId}.`);
  const text = payload.text.trim();
  if (!text) return rejected('Node memory text cannot be blank.');
  const knownCharacterIds = new Set([...Object.keys(context.world.characters), ...Object.keys(context.world.npcs)]);
  const charIds = [...new Set(payload.charIds)].filter((id) => knownCharacterIds.has(id));
  const invalidCharIds = payload.charIds.filter((id) => !knownCharacterIds.has(id));
  if (invalidCharIds.length) return rejected(`Unknown character in node memory: ${invalidCharIds[0]}.`);
  const before = structuredClone(node.memories);
  const memory = {
    id: `node-memory-${nodeId}-${context.day}-${node.memories.length + 1}`,
    text,
    day: Math.max(1, Math.floor(context.day)),
    charIds,
    ...(payload.pinned === undefined ? {} : { pinned: payload.pinned }),
  };
  if (node.memories.length >= 5) {
    const removeIndex = node.memories.findIndex((item) => !item.pinned);
    if (removeIndex < 0) return rejected('Node memory limit reached; all existing memories are pinned.');
    node.memories.splice(removeIndex, 1);
  }
  node.memories.push(memory);
  return changed(`world.map.nodes.${nodeId}.memories`, before, structuredClone(node.memories), `Added a memory to ${nodeId}.`);
}

function unlockTopic(topicId: string, context: OpContext): OpResult {
  if (!canUnlockTopic(context.world, context.actorId, context.nodeId, topicId)) return rejected(`Unknown topic in current tree: ${topicId}.`);
  const tree = context.world.topicTrees[topicTreeKey(context.actorId!, context.nodeId)]!;
  const topic = tree.topics.find((item) => item.id === topicId)!;
  if (!topic.require) return { ok: true, changes: [], warning: `Topic ${topicId} is already unlocked.` };
  const before = topic.require;
  delete topic.require;
  return changed(`world.topicTrees.${topicTreeKey(context.actorId!, context.nodeId)}.topics.${topicId}.require`, before, undefined, `Unlocked topic ${topicId}.`);
}

function markTopicUsed(topicId: string, context: OpContext): OpResult {
  if (!canUnlockTopic(context.world, context.actorId, context.nodeId, topicId)) return rejected(`Unknown topic in current tree: ${topicId}.`);
  const before = context.world.usedTopics[topicId];
  context.world.usedTopics[topicId] = context.day;
  return changed(`world.usedTopics.${topicId}`, before, context.day, `Marked topic ${topicId} as used.`);
}

function setMood(payload: z.infer<typeof SetMoodSchema>, context: OpContext): OpResult {
  if (!context.actorId || payload.target !== context.actorId) return rejected('Mood target must be the current actor.');
  const word = payload.word.trim();
  if (!word) return rejected('Mood word cannot be blank.');
  const relation = context.world.relations[payload.target] ?? { axes: {}, knots: [], memories: [] };
  const before = relation.mood;
  relation.mood = { word, setDay: context.day, decayDays: payload.decayDays };
  context.world.relations[payload.target] = relation;
  return changed(`relations.${payload.target}.mood`, before, relation.mood, `Set mood for ${payload.target}.`);
}

function adjustRelationAxis(payload: z.infer<typeof AdjustRelationAxisSchema>, context: OpContext): OpResult {
  if (!context.actorId || payload.target !== context.actorId) return rejected('Relation axis target must be the current actor.');
  const axisDef = context.axisDefs?.find((axis) => axis.id === payload.key);
  if (!axisDef) return rejected(`Unknown relation axis: ${payload.key}.`);
  const relation = context.world.relations[payload.target] ?? { axes: {}, knots: [], memories: [] };
  const before = relation.axes[payload.key] ?? axisDef.initial;
  const signedLimit = axisDef.clampPerTurn;
  const boundedDelta = Math.min(signedLimit, Math.max(axisDef.monotonic ? 0 : -signedLimit, payload.delta));
  const after = Math.min(axisDef.max, Math.max(axisDef.min, before + boundedDelta));
  relation.axes[payload.key] = after;
  const stageId = resolveRelationshipStageId(relation.axes, context.world, context.stageRules ?? []);
  const previousStageId = relation.stageId;
  if (stageId) relation.stageId = stageId;
  context.world.relations[payload.target] = relation;
  const changes = [...changed(`relations.${payload.target}.axes.${payload.key}`, before, after, `Adjusted relation axis ${payload.key} by ${boundedDelta}.`).changes];
  if (stageId && stageId !== previousStageId) changes.push(...changed(`relations.${payload.target}.stageId`, previousStageId, stageId, `Relationship stage changed to ${stageId}.`).changes);
  return { ok: true, changes };
}

function addKnot(payload: z.infer<typeof AddKnotSchema>, context: OpContext): OpResult {
  if (!context.actorId || payload.target !== context.actorId) return rejected('Knot target must be the current actor.');
  const relation = context.world.relations[payload.target] ?? { axes: {}, knots: [], memories: [] };
  if (relation.knots.some((knot) => knot.id === payload.id)) return rejected(`Knot already exists: ${payload.id}.`);
  const knot = { id: payload.id, text: payload.text.trim(), sinceDay: context.day, ...(payload.resolveCondition ? { resolveCondition: payload.resolveCondition } : {}) };
  relation.knots.push(knot);
  context.world.relations[payload.target] = relation;
  return changed(`relations.${payload.target}.knots`, relation.knots.length - 1, relation.knots.length, `Added knot ${payload.id}.`);
}

function resolveKnot(payload: z.infer<typeof ResolveKnotSchema>, context: OpContext): OpResult {
  if (!context.actorId || payload.target !== context.actorId) return rejected('Knot target must be the current actor.');
  const relation = context.world.relations[payload.target];
  const knot = relation?.knots.find((item) => item.id === payload.id);
  if (!relation || !knot) return rejected(`Unknown knot: ${payload.id}.`);
  if (!knot.resolveCondition) return rejected(`Knot ${payload.id} has no resolve condition.`);
  try {
    const allowed = evaluateCondition(knot.resolveCondition, { axes: relation.axes, stats: context.world.stats, flags: context.world.flags, playerStats: context.world.player.stats, playerFlags: context.world.player.flags } as unknown as ConditionScope);
    if (!allowed) return rejected(`Knot ${payload.id} resolve condition is not satisfied.`);
  } catch (error) {
    return rejected(`Knot ${payload.id} resolve condition is invalid: ${error instanceof Error ? error.message : String(error)}.`);
  }
  const before = structuredClone(relation.knots);
  relation.knots = relation.knots.filter((item) => item.id !== payload.id);
  return changed(`relations.${payload.target}.knots`, before, relation.knots, `Resolved knot ${payload.id}.`);
}

function offerGift(payload: z.infer<typeof OfferGiftSchema>, context: OpContext): OpResult {
  if (!context.actorId || payload.target !== context.actorId) return rejected('Gift target must be the current actor.');
  const character = context.world.characters[payload.target];
  const item = context.world.items[payload.itemId];
  if (!character) return rejected(`Unknown gift target: ${payload.target}.`);
  if (!item || item.giftable === false) return rejected(`Item is not a giftable known item: ${payload.itemId}.`);
  const entry = context.world.player.inventory.find((candidate) => candidate.itemId === payload.itemId);
  if (!entry || entry.count < 1) return rejected(`Gift item is not owned: ${payload.itemId}.`);
  const evaluation = evaluateGift(item, character, context.world.relations[payload.target]);
  const before = entry.count;
  entry.count -= 1;
  context.world.player.inventory = context.world.player.inventory.filter((candidate) => candidate.count > 0);
  const historyBefore = context.world.giftHistory.length;
  context.world.giftHistory.push({
    id: `gift-${context.day}-${context.world.giftHistory.length + 1}`,
    day: context.day,
    slotId: context.slotId,
    nodeId: context.nodeId,
    charId: payload.target,
    itemId: payload.itemId,
    status: 'pending',
    score: evaluation.score,
    specialItem: evaluation.specialItem,
    matchedLikeTags: evaluation.matchedLikeTags,
    matchedDislikeTags: evaluation.matchedDislikeTags,
  });
  return { ok: true, changes: [
    ...changed(`player.inventory.${payload.itemId}`, before, before - 1, `Gift to ${character.name}; awaiting reaction.`).changes,
    ...changed('world.giftHistory', historyBefore, context.world.giftHistory.length, `Recorded pending gift for ${character.name}.`).changes,
  ] };
}

function resolveGift(payload: z.infer<typeof ResolveGiftSchema>, context: OpContext): OpResult {
  if (!context.actorId) return rejected('Gift reaction requires a current actor.');
  const entry = context.world.giftHistory.find((candidate) => candidate.id === payload.giftId);
  if (!entry) return rejected(`Unknown gift: ${payload.giftId}.`);
  if (entry.status !== 'pending') return rejected(`Gift ${payload.giftId} is already resolved.`);
  if (entry.charId !== context.actorId) return rejected('Gift reaction must target the current actor.');
  const before = structuredClone(entry);
  entry.status = 'resolved';
  entry.reaction = payload.reaction;
  entry.accepted = payload.reaction !== 'disliked';
  return changed(`world.giftHistory.${entry.id}`, before, structuredClone(entry), `Recorded ${payload.reaction} reaction for ${entry.charId}.`);
}

function itemCount(world: WorldState, itemId: string): number {
  return world.player.inventory.filter((entry) => entry.itemId === itemId).reduce((sum, entry) => sum + entry.count, 0);
}

function changed(path: string, before: unknown, after: unknown, description: string): OpResult {
  return { ok: true, changes: [{ path, before, after, description }] };
}

function rejected(warning: string): OpResult {
  return { ok: false, changes: [], warning };
}
