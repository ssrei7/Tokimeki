import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events/bus';
import { createMapNode, deleteMapNode, movePlayer, revealAdjacentNode, revealNode, updateMapNode } from '../src/core/map';
import { createDefaultMap, CURRENT_SCHEMA_VERSION, DEFAULT_ECONOMY_STATE, SaveFileSchema, type WorldState } from '../src/data/schema/save';

function worldWithMap(): WorldState {
  const map = createDefaultMap();
  map.regions['harbor-region'] = { id: 'harbor-region', name: '港区' };
  map.nodes.market = { id: 'market', name: '旧市场', regionId: 'start-region', kind: ['commercial'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 250, y: 300 } };
  map.nodes.docks = { id: 'docks', name: '西码头', regionId: 'harbor-region', kind: ['outdoor'], worldbookIds: [], discovered: false, visitCount: 0, memories: [], pos: { x: 800, y: 300 } };
  map.edges.push({ from: 'start', to: 'market', travelSlots: 1 }, { from: 'market', to: 'docks', travelSlots: 2 });
  return SaveFileSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { id: 'map-test', title: '地图测试', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' },
    config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }, { id: 'noon', name: '中午', order: 1 }, { id: 'evening', name: '晚上', order: 2 }, { id: 'night', name: '深夜', order: 3 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12, encounter: { enabled: true, triggerOnLeave: true, leaveProbability: 0.35, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} } },
    world: { clock: { day: 1, slotId: 'morning' }, slotsUsedToday: 0, player: { name: 'P', nodeId: 'start', stats: { money: 0, 'economy.rent.amount': 10, 'economy.rent.interval-days': 7 }, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map, diary: [], settlements: [], characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [], economy: structuredClone(DEFAULT_ECONOMY_STATE) },
  }).world;
}

describe('deterministic map movement', () => {
  it('moves within a region without consuming time and emits enter hook', () => {
    const world = worldWithMap(); const events = new EventBus(); const entered: unknown[] = [];
    events.subscribe('onEnterNode', (payload) => entered.push(payload));
    const result = movePlayer(world, { slots: [{ id: 'morning', name: '早晨', order: 0 }, { id: 'noon', name: '中午', order: 1 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, 'market', events);
    expect(result.ok).toBe(true); expect(result.cost).toBe(0); expect(world.player.nodeId).toBe('market'); expect(world.slotsUsedToday).toBe(0); expect(entered).toEqual([{ fromNodeId: 'start', toNodeId: 'market' }]);
  });

  it('rejects hidden or unknown destinations but allows travel across day boundaries', () => {
    const world = worldWithMap();
    const calendar = { slots: [{ id: 'morning', name: '早晨', order: 0 }, { id: 'noon', name: '中午', order: 1 }, { id: 'evening', name: '晚上', order: 2 }, { id: 'night', name: '深夜', order: 3 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard' as const, unlimitedSlots: false };
    expect(movePlayer(world, calendar, 'docks').warning).toContain('hidden');
    expect(movePlayer(world, calendar, 'unknown').warning).toContain('Unknown destination');
    expect(movePlayer(world, calendar, 'market').ok).toBe(true);
    world.map.nodes.docks.discovered = true; world.slotsUsedToday = 3;
    const result = movePlayer(world, calendar, 'docks');
    expect(result.ok).toBe(true); expect(result.cost).toBe(2); expect(world.clock.day).toBe(2); expect(world.slotsUsedToday).toBe(1);
  });

  it('finds a cheapest multi-edge route and treats open slots as non-blocking metadata', () => {
    const world = worldWithMap(); const calendar = { slots: [{ id: 'morning', name: '早晨', order: 0 }, { id: 'noon', name: '中午', order: 1 }, { id: 'evening', name: '晚上', order: 2 }, { id: 'night', name: '深夜', order: 3 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'leisure' as const, unlimitedSlots: false };
    world.map.nodes.docks.discovered = true; world.map.nodes.docks.openSlots = ['evening'];
    const result = movePlayer(world, calendar, 'docks');
    expect(result.ok).toBe(true); expect(result.cost).toBe(2); expect(world.slotsUsedToday).toBe(2); expect(world.clock.slotId).toBe('evening');
  });

  it('reveals a node without consuming time', () => {
    const world = worldWithMap(); const result = revealNode(world, 'docks');
    expect(result.ok).toBe(true); expect(world.map.nodes.docks.discovered).toBe(true); expect(world.slotsUsedToday).toBe(0);
  });

  it('reveals one undiscovered adjacent node in stable id order', () => {
    const world = worldWithMap();
    world.map.nodes.cafe = { id: 'cafe', name: '咖啡馆', regionId: 'start-region', kind: ['indoor'], worldbookIds: [], discovered: false, visitCount: 0, memories: [], pos: { x: 300, y: 200 } };
    world.map.edges.push({ from: 'start', to: 'cafe', travelSlots: 0 });
    const result = revealAdjacentNode(world);
    expect(result.ok).toBe(true);
    expect(result.toNodeId).toBe('cafe');
    expect(world.map.nodes.cafe.discovered).toBe(true);
    expect(world.map.nodes.docks.discovered).toBe(false);
    expect(world.slotsUsedToday).toBe(0);
  });

  it('does not reveal a non-adjacent node or spend a cost when no hidden neighbor exists', () => {
    const world = worldWithMap();
    world.map.nodes.market.discovered = true;
    const result = revealAdjacentNode(world);
    expect(result.ok).toBe(true);
    expect(result.toNodeId).toBeUndefined();
    expect(result.warning).toContain('No undiscovered adjacent node');
    expect(world.map.nodes.docks.discovered).toBe(false);
  });

  it('creates a validated map node and connecting edge with a unique id', () => {
    const world = worldWithMap();
    const first = createMapNode(world.map, { name: '海边咖啡馆', description: '可以看海。', regionId: 'start-region', kind: ['indoor', 'cafe'], openSlots: ['morning'], worldbookIds: ['coast-lore', 'coast-lore'], sceneBackground: { kind: 'url', url: 'https://example.test/cafe.webp' }, discovered: true, pos: { x: 1200, y: -20 }, anchorNodeId: 'start', travelSlots: 1 });
    const second = createMapNode(world.map, { name: '海边咖啡馆', regionId: 'start-region', kind: [], discovered: false, pos: { x: 400, y: 200 }, anchorNodeId: 'start', travelSlots: 0 });
    expect(first).toEqual({ ok: true, nodeId: '海边咖啡馆' });
    expect(second).toEqual({ ok: true, nodeId: '海边咖啡馆-2' });
    expect(world.map.nodes['海边咖啡馆'].pos).toEqual({ x: 1000, y: 0 });
    expect(world.map.nodes['海边咖啡馆'].openSlots).toEqual(['morning']);
    expect(world.map.nodes['海边咖啡馆'].worldbookIds).toEqual(['coast-lore']);
    expect(world.map.nodes['海边咖啡馆'].sceneBackground).toEqual({ kind: 'url', url: 'https://example.test/cafe.webp' });
    expect(world.map.edges.at(-2)).toEqual({ from: 'start', to: '海边咖啡馆', travelSlots: 1 });
  });

  it('rejects invalid manual map edits without changing the map', () => {
    const world = worldWithMap(); const before = structuredClone(world.map);
    expect(createMapNode(world.map, { name: '', regionId: 'start-region', kind: [], discovered: true, pos: { x: 1, y: 1 }, anchorNodeId: 'start', travelSlots: 1 }).ok).toBe(false);
    expect(createMapNode(world.map, { name: '未知区域', regionId: 'missing', kind: [], discovered: true, pos: { x: 1, y: 1 }, anchorNodeId: 'start', travelSlots: 1 }).ok).toBe(false);
    expect(createMapNode(world.map, { name: '无锚点', regionId: 'start-region', kind: [], discovered: true, pos: { x: 1, y: 1 }, anchorNodeId: 'missing', travelSlots: 1 }).ok).toBe(false);
    expect(world.map).toEqual(before);
  });

  it('updates editable node fields without changing its stable id', () => {
    const world = worldWithMap(); world.map.nodes.market.worldbookIds = ['market-lore'];
    const result = updateMapNode(world.map, 'market', { name: '中央市场', description: '重新整修后的市场。', regionId: 'start-region', kind: ['commercial', 'indoor'], openSlots: ['noon'], sceneBackground: { kind: 'url', url: 'https://example.test/market.webp' }, discovered: false, pos: { x: 320, y: 280 } });
    expect(result).toEqual({ ok: true, nodeId: 'market' });
    expect(world.map.nodes.market.id).toBe('market');
    expect(world.map.nodes.market.name).toBe('中央市场');
    expect(world.map.nodes.market.worldbookIds).toEqual(['market-lore']);
    expect(world.map.nodes.market.openSlots).toEqual(['noon']);
    expect(world.map.nodes.market.sceneBackground).toEqual({ kind: 'url', url: 'https://example.test/market.webp' });
    expect(updateMapNode(world.map, 'market', { name: '中央市场', regionId: 'start-region', kind: [], worldbookIds: ['new-lore'], discovered: true, pos: { x: 320, y: 280 } }).ok).toBe(true);
    expect(world.map.nodes.market.worldbookIds).toEqual(['new-lore']);
  });

  it('deletes only safe non-current nodes and their connected edges', () => {
    const world = worldWithMap();
    expect(deleteMapNode(world.map, 'start', 'start').warning).toContain('当前位置');
    expect(deleteMapNode(world.map, 'market', 'start').warning).toContain('孤立');
    expect(deleteMapNode(world.map, 'docks', 'start')).toEqual({ ok: true, nodeId: 'docks' });
    expect(world.map.nodes.docks).toBeUndefined();
    expect(world.map.edges.some((edge) => edge.from === 'docks' || edge.to === 'docks')).toBe(false);
  });
});
