import { z } from 'zod';
import type { WorldState } from '../../data/schema/save';
import { OpRegistry } from './registry';
import type { OpContext, OpResult } from './types';

const StatTargetSchema = z.enum(['player', 'world']);
const AddStatSchema = z.object({ op: z.literal('add_stat'), target: StatTargetSchema, key: z.string().min(1), delta: z.number().finite() });
const SetStatSchema = z.object({ op: z.literal('set_stat'), target: StatTargetSchema, key: z.string().min(1), value: z.number().finite() });
const SetFlagSchema = z.object({ op: z.literal('set_flag'), target: StatTargetSchema.default('world'), key: z.string().min(1), value: z.boolean() });
const GiveItemSchema = z.object({ op: z.literal('give_item'), id: z.string().min(1), count: z.number().int().positive().default(1), from: z.string().min(1).optional() });
const TakeItemSchema = z.object({ op: z.literal('take_item'), id: z.string().min(1), count: z.number().int().positive().default(1) });
const AddMemorySchema = z.object({ op: z.literal('add_memory'), target: z.string().min(1), text: z.string().min(1).max(1000) });

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

function itemCount(world: WorldState, itemId: string): number {
  return world.player.inventory.filter((entry) => entry.itemId === itemId).reduce((sum, entry) => sum + entry.count, 0);
}

function changed(path: string, before: unknown, after: unknown, description: string): OpResult {
  return { ok: true, changes: [{ path, before, after, description }] };
}

function rejected(warning: string): OpResult {
  return { ok: false, changes: [], warning };
}
