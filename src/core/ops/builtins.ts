import { z } from 'zod';
import type { WorldState } from '../../data/schema/save';
import { OpRegistry } from './registry';
import type { OpContext, OpResult } from './types';
import { advanceTime } from '../time';
import { movePlayer, revealNode } from '../map';
import { moveNpc, triggerEncounter } from '../encounter';
import { canUnlockTopic, topicTreeKey } from '../topics';

const StatTargetSchema = z.enum(['player', 'world']);
const AddStatSchema = z.object({ op: z.literal('add_stat'), target: StatTargetSchema, key: z.string().min(1), delta: z.number().finite() });
const SetStatSchema = z.object({ op: z.literal('set_stat'), target: StatTargetSchema, key: z.string().min(1), value: z.number().finite() });
const SetFlagSchema = z.object({ op: z.literal('set_flag'), target: StatTargetSchema.default('world'), key: z.string().min(1), value: z.boolean() });
const GiveItemSchema = z.object({ op: z.literal('give_item'), id: z.string().min(1), count: z.number().int().positive().default(1), from: z.string().min(1).optional() });
const TakeItemSchema = z.object({ op: z.literal('take_item'), id: z.string().min(1), count: z.number().int().positive().default(1) });
const AddMemorySchema = z.object({ op: z.literal('add_memory'), target: z.string().min(1), text: z.string().min(1).max(1000) });
const AddNodeMemorySchema = z.object({ op: z.literal('add_node_memory'), nodeId: z.string().min(1).optional(), text: z.string().min(1).max(1000), charIds: z.array(z.string().min(1)).max(3).default([]), pinned: z.boolean().optional() });
const AdvanceTimeSchema = z.object({ op: z.literal('advance_time'), kind: z.string().min(1).optional(), slots: z.number().int().positive().default(1) });
const MovePlayerSchema = z.object({ op: z.literal('move_player'), nodeId: z.string().min(1) });
const RevealNodeSchema = z.object({ op: z.literal('reveal_node'), nodeId: z.string().min(1) });
const MoveNpcSchema = z.object({ op: z.literal('move_npc'), target: z.string().min(1), nodeId: z.string().min(1), slotId: z.string().min(1).optional(), activity: z.string().min(1).max(200).optional() });
const UnlockTopicSchema = z.object({ op: z.literal('unlock_topic'), id: z.string().min(1) });
const MarkTopicUsedSchema = z.object({ op: z.literal('mark_topic_used'), id: z.string().min(1) });

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
    promptDoc: 'add_memory: {"op":"add_memory","target":"current-character-id","text":"fact grounded in this scene"}.',
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
  return changed(`player.inventory.${payload.id}`, before, before + payload.count, `Received ${payload.id} x${payload.count}.`);
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
  const memory = { id: `memory-${payload.target}-${context.day}-${relation.memories.length + 1}`, text: payload.text, day: context.day, nodeId: context.nodeId };
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

function itemCount(world: WorldState, itemId: string): number {
  return world.player.inventory.filter((entry) => entry.itemId === itemId).reduce((sum, entry) => sum + entry.count, 0);
}

function changed(path: string, before: unknown, after: unknown, description: string): OpResult {
  return { ok: true, changes: [{ path, before, after, description }] };
}

function rejected(warning: string): OpResult {
  return { ok: false, changes: [], warning };
}
