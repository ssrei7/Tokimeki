import { describe, expect, it } from 'vitest';
import { createDefaultOpRegistry, type OpContext } from '../src/core/ops';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { evaluateGift } from '../src/core/relationship';

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
    for (const op of ['add_stat', 'set_stat', 'set_flag', 'give_item', 'take_item', 'add_memory', 'add_node_memory', 'move_player', 'reveal_node', 'move_npc']) expect(docs).toContain(op);
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

  it('sets a decaying mood only for the current actor', () => {
    const state = setup();
    const applied = state.registry.applyAll([{ op: 'set_mood', target: 'seir', word: '放松', decayDays: 2 }], state.context, 12);
    expect(applied.applied).toBe(1);
    expect(state.world.relations.seir.mood).toEqual({ word: '放松', setDay: 3, decayDays: 2 });
    const rejected = state.registry.applyAll([{ op: 'set_mood', target: 'rin', word: '忙碌', decayDays: 1 }], state.context, 12);
    expect(rejected.rejected).toHaveLength(1);
    expect(state.world.relations.rin).toBeUndefined();
  });

  it('clamps relation axes and refreshes the derived stage', () => {
    const state = setup();
    state.context.axisDefs = [{ id: 'affection', name: '亲密', min: 0, max: 100, initial: 10, clampPerTurn: 5 }];
    state.context.stageRules = [
      { id: 'stranger', name: '陌生人', when: 'axes.affection < 50', order: 0 },
      { id: 'acquaintance', name: '熟人', when: 'axes.affection >= 50', order: 1 },
    ];
    const first = state.registry.applyAll([{ op: 'adjust_relation_axis', target: 'seir', key: 'affection', delta: 20 }], state.context, 12);
    expect(first.applied).toBe(1);
    expect(state.world.relations.seir.axes.affection).toBe(15);
    expect(state.world.relations.seir.stageId).toBe('stranger');
    const second = state.registry.applyAll([{ op: 'adjust_relation_axis', target: 'seir', key: 'affection', delta: 100 }], state.context, 12);
    expect(state.world.relations.seir.axes.affection).toBe(20);
    expect(second.warnings).toHaveLength(0);
    expect(state.registry.applyAll([{ op: 'adjust_relation_axis', target: 'seir', key: 'missing', delta: 1 }], state.context, 12).rejected).toHaveLength(1);
  });

  it('keeps knots until their deterministic resolve condition is satisfied', () => {
    const state = setup();
    state.context.axisDefs = [{ id: 'trust', name: '信任', min: 0, max: 100, initial: 0, clampPerTurn: 100 }];
    const added = state.registry.applyAll([{ op: 'add_knot', target: 'seir', id: 'old-promise', text: '还没有兑现的约定。', resolveCondition: 'axes.trust >= 50' }], state.context, 12);
    expect(added.applied).toBe(1);
    expect(state.world.relations.seir.knots).toHaveLength(1);
    expect(state.registry.applyAll([{ op: 'resolve_knot', target: 'seir', id: 'old-promise' }], state.context, 12).rejected).toHaveLength(1);
    state.registry.applyAll([{ op: 'adjust_relation_axis', target: 'seir', key: 'trust', delta: 50 }], state.context, 12);
    const resolved = state.registry.applyAll([{ op: 'resolve_knot', target: 'seir', id: 'old-promise' }], state.context, 12);
    expect(resolved.applied).toBe(1);
    expect(state.world.relations.seir.knots).toEqual([]);
  });

  it('evaluates and consumes gifts deterministically without AI-provided outcomes', () => {
    const state = setup();
    state.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '测试角色', personality: '安静' }, visuals: { portraits: [] }, schedule: { grid: {}, overrides: {} } };
    state.world.relations.seir = { axes: {}, knots: [], memories: [] };
    state.world.characters.seir.giftPrefs = { likeTags: ['flower'], dislikeTags: ['metal'], specialItems: { 'flower-item': 3 } };
    state.world.items['flower-item'] = { id: 'flower-item', name: '花束', tags: ['flower'], giftable: true };
    state.world.player.inventory.push({ itemId: 'flower-item', count: 1, gotDay: 3 });
    const evaluation = evaluateGift(state.world.items['flower-item'], state.world.characters.seir, state.world.relations.seir);
    expect(evaluation).toMatchObject({ reaction: 'special', specialItem: true, stageId: undefined });
    const applied = state.registry.applyAll([{ op: 'offer_gift', target: 'seir', itemId: 'flower-item' }], state.context, 12);
    expect(applied.applied).toBe(1);
    expect(state.world.player.inventory.some((entry) => entry.itemId === 'flower-item')).toBe(false);
  });

  it('records current-node memories, validates participants, and keeps five entries', () => {
    const state = setup();
    state.context.nodeId = 'start';
    state.world.map.nodes.docks = { ...state.world.map.nodes.start, id: 'docks', name: '西码头' };
    state.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '测试角色', personality: '安静' }, visuals: { portraits: [] }, schedule: { grid: {}, overrides: {} } };
    const first = state.registry.applyAll([{ op: 'add_node_memory', text: '在码头一起看过潮汐。', charIds: ['seir'], pinned: true }], state.context, 12);
    expect(first.applied).toBe(1);
    expect(state.world.map.nodes.start.memories[0]).toEqual({ id: 'node-memory-start-3-1', text: '在码头一起看过潮汐。', day: 3, charIds: ['seir'], pinned: true });
    expect(state.registry.applyAll([{ op: 'add_node_memory', nodeId: 'docks', text: '不应写入。' }], state.context, 12).rejected).toHaveLength(1);
    expect(state.registry.applyAll([{ op: 'add_node_memory', text: '未知角色。', charIds: ['missing'] }], state.context, 12).rejected).toHaveLength(1);
    for (let index = 0; index < 5; index += 1) state.registry.applyAll([{ op: 'add_node_memory', text: `记忆 ${index}` }], state.context, 12);
    expect(state.world.map.nodes.start.memories).toHaveLength(5);
    expect(state.world.map.nodes.start.memories[0].text).toBe('在码头一起看过潮汐。');
    expect(state.world.map.nodes.start.memories.at(-1)?.text).toBe('记忆 4');
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

  it('moves and reveals nodes through the registered ops', () => {
    const state = setup();
    state.world.map.nodes.market = { id: 'market', name: '旧市场', regionId: 'start-region', kind: ['commercial'], worldbookIds: [], discovered: false, visitCount: 0, memories: [], pos: { x: 100, y: 100 } };
    state.world.map.edges.push({ from: 'start', to: 'market', travelSlots: 1 });
    state.context.calendar = {
      slots: [{ id: 'morning', name: '早晨', order: 0 }, { id: 'noon', name: '中午', order: 1 }],
      daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false,
    };
    const hidden = state.registry.applyAll([{ op: 'move_player', nodeId: 'market' }], state.context, 12);
    expect(hidden.applied).toBe(0);
    expect(state.registry.applyAll([{ op: 'reveal_node', nodeId: 'market' }], state.context, 12).applied).toBe(1);
    const moved = state.registry.applyAll([{ op: 'move_player', nodeId: 'market' }], state.context, 12);
    expect(moved.applied).toBe(1);
    expect(state.world.player.nodeId).toBe('market');
    expect(state.world.slotsUsedToday).toBe(0);
  });

  it('writes a same-day schedule override through move_npc', () => {
    const state = setup();
    state.world.characters.seir = {
      id: 'seir', name: '塞伊尔', tier: 'formal',
      card: { description: '测试角色', personality: '安静' },
      visuals: { portraits: [] },
      schedule: { grid: {}, overrides: {} },
    };
    state.world.map.nodes.docks = { id: 'docks', name: '西码头', regionId: 'start-region', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 100, y: 100 } };
    const result = state.registry.applyAll([{ op: 'move_npc', target: 'seir', nodeId: 'docks', slotId: 'night', activity: '收拾渔网' }], state.context, 12);
    expect(result.applied).toBe(1);
    expect(state.world.characters.seir.schedule?.overrides['3:night']).toEqual({ nodeId: 'docks', activity: '收拾渔网' });
  });
});
