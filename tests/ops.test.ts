import { describe, expect, it } from 'vitest';
import { createDefaultOpRegistry, type OpContext } from '../src/core/ops';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

function setup() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'ops-test', title: 'Ops Test', stats: { custom: 1 } }));
  save.world.items.flower = { id: 'flower', name: '花', tags: ['flower'], stackable: true, giftable: true };
  const logs: string[] = [];
  const context: OpContext = {
    world: save.world, actorId: 'seir', day: 3, slotId: 'evening', nodeId: 'docks',
    log: (message: string) => logs.push(message), calendar: undefined, actionCosts: undefined,
  };
  return {
    registry: createDefaultOpRegistry(),
    world: save.world,
    logs,
    context,
  };
}

describe('op registry and built-ins', () => {
  it('registers complete prompt documentation for all stage 1 ops', () => {
    const docs = createDefaultOpRegistry().promptDocs();
    for (const op of ['add_stat', 'set_stat', 'set_flag', 'give_item', 'take_item', 'add_memory']) expect(docs).toContain(op);
  });

  it('clamps stat deltas and records a diff without hard-coded stat keys', () => {
    const state = setup();
    const result = state.registry.applyAll([{ op: 'add_stat', target: 'player', key: 'custom', delta: 100 }], state.context, 12);
    expect(state.world.player.stats.custom).toBe(11);
    expect(result.changes).toEqual([expect.objectContaining({ path: 'player.stats.custom', before: 1, after: 11 })]);
    expect(result.warnings.join(' ')).toContain('clamped from 100 to 10');
  });

  it('sets arbitrary player and world stats through the same generic path', () => {
    const state = setup();
    const result = state.registry.applyAll([
      { op: 'set_stat', target: 'player', key: 'custom', value: -4 },
      { op: 'set_stat', target: 'world', key: 'market-demand', value: 7 },
    ], state.context, 12);
    expect(result.applied).toBe(2);
    expect(state.world.player.stats.custom).toBe(-4);
    expect(state.world.stats['market-demand']).toBe(7);
  });

  it('drops an unregistered op while applying the remaining valid op', () => {
    const state = setup();
    const result = state.registry.applyAll([
      { op: 'teleport_anywhere', nodeId: 'moon' },
      { op: 'set_flag', key: 'met-at-docks', value: true },
    ], state.context, 12);
    expect(state.world.flags['met-at-docks']).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.warnings.join(' ')).toContain('Unregistered op discarded');
  });

  it('enforces the per-turn operation limit', () => {
    const state = setup();
    const result = state.registry.applyAll([
      { op: 'set_flag', key: 'first', value: true },
      { op: 'set_flag', key: 'second', value: true },
    ], state.context, 1);
    expect(state.world.flags).toEqual({ first: true });
    expect(result.truncated).toBe(1);
  });

  it('only gives known items and takes no more than the player owns', () => {
    const state = setup();
    const given = state.registry.applyAll([{ op: 'give_item', id: 'flower', count: 2, from: 'seir' }], state.context, 12);
    expect(given.applied).toBe(1);
    expect(state.world.player.inventory[0]).toEqual({ itemId: 'flower', count: 2, gotDay: 3, gotNodeId: 'docks', fromCharId: 'seir' });
    const rejected = state.registry.applyAll([
      { op: 'give_item', id: 'invented-item' },
      { op: 'give_item', id: 'flower', from: 'someone-else' },
      { op: 'take_item', id: 'flower', count: 3 },
    ], state.context, 12);
    expect(rejected.rejected).toHaveLength(3);
    expect(state.world.player.inventory[0].count).toBe(2);
    state.registry.applyAll([{ op: 'take_item', id: 'flower' }], state.context, 12);
    expect(state.world.player.inventory[0].count).toBe(1);
  });

  it('adds deterministic memories only for the current actor', () => {
    const state = setup();
    const result = state.registry.applyAll([
      { op: 'add_memory', target: 'unknown', text: '不应写入' },
      { op: 'add_memory', target: 'seir', text: '在码头交谈' },
    ], state.context, 12);
    expect(result.rejected).toHaveLength(1);
    expect(state.world.relations.unknown).toBeUndefined();
    expect(state.world.relations.seir.memories[0]).toEqual({ id: 'memory-seir-3-1', text: '在码头交谈', day: 3, nodeId: 'docks' });
  });

  it('advances deterministic time through the registered op', () => {
    const state = setup();
    state.context.calendar = {
      slots: [{ id: 'morning', name: '早晨', order: 0 }, { id: 'noon', name: '中午', order: 1 }],
      daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false,
    };
    state.context.actionCosts = { explore: { slotCost: 1 } };
    const result = state.registry.applyAll([{ op: 'advance_time', kind: 'explore' }], state.context, 12);
    expect(result.applied).toBe(1);
    expect(state.world.clock).toEqual({ day: 1, slotId: 'noon' });
    expect(state.world.slotsUsedToday).toBe(1);
  });
});
