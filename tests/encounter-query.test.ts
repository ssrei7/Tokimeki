import { describe, expect, it } from 'vitest';
import { deriveNodeScope, recentEncounterTraces, resolveRoamingCell, resolveScheduledCell, whoIsHere, whoIsWhere } from '../src/core/encounter';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import type { FormalCharacter, WorldState } from '../src/data/schema/save';

function character(overrides: Partial<FormalCharacter> = {}): FormalCharacter {
  return {
    id: 'seir',
    name: '塞伊尔',
    tier: 'formal',
    card: { description: '在码头工作的青年。', personality: '安静。' },
    visuals: { portraits: [], accentColor: '#315efb' },
    ...overrides,
  };
}

function setup(): WorldState {
  const save = seedScenario(createCurrentSaveScenario({ id: 'encounter-query', title: 'Encounter query' }));
  save.world.characters.seir = character({
    homeNodeId: 'start',
    schedule: {
      grid: { '1:afternoon': { nodeId: 'docks', activity: '整理渔网' } },
      overrides: { '3:morning': { nodeId: 'docks', activity: '等待朋友' } },
    },
  });
  save.world.npcs['vendor-1'] = {
    id: 'vendor-1', name: '摊主', tier: 'semi', facts: ['卖花'], tags: ['merchant'],
    homeNodeId: 'docks', lightMemory: [], seed: 7,
  };
  return save.world;
}

describe('deterministic schedule presence query', () => {
  it('derives formal or peripheral scope from node opening slots', () => {
    const world = setup();
    expect(deriveNodeScope(world.map.nodes.start, 'evening')).toBe('formal');
    world.map.nodes.start.openSlots = ['morning'];
    expect(deriveNodeScope(world.map.nodes.start, 'morning')).toBe('formal');
    expect(deriveNodeScope(world.map.nodes.start, 'evening')).toBe('peripheral');
  });

  it('prefers a day override over the weekly grid', () => {
    const world = setup();
    expect(resolveScheduledCell(world.characters.seir, 3, 'morning', 7)).toEqual({ nodeId: 'docks', activity: '等待朋友' });
    expect(resolveScheduledCell(world.characters.seir, 3, 'noon', 7)).toEqual({ nodeId: 'start', activity: '在附近' });
  });

  it('uses the weekday grid and includes semi-formal NPCs at home', () => {
    const world = setup();
    expect(whoIsHere(world, 'docks', 3, 'afternoon', 7)).toEqual([
      { id: 'vendor-1', name: '摊主', tier: 'semi', nodeId: 'docks', activity: '在附近', source: 'home' },
    ]);
    expect(whoIsHere(world, 'docks', 3, 'morning', 7)).toEqual([
      { id: 'seir', name: '塞伊尔', tier: 'formal', nodeId: 'docks', activity: '等待朋友', source: 'schedule' },
      { id: 'vendor-1', name: '摊主', tier: 'semi', nodeId: 'docks', activity: '在附近', source: 'home' },
    ]);
    expect(whoIsHere(world, 'docks', 2, 'afternoon', 7)).toEqual([
      { id: 'seir', name: '塞伊尔', tier: 'formal', nodeId: 'docks', activity: '整理渔网', source: 'schedule' },
      { id: 'vendor-1', name: '摊主', tier: 'semi', nodeId: 'docks', activity: '在附近', source: 'home' },
    ]);
  });

  it('uses a semi-formal NPC day override when one is present', () => {
    const world = setup();
    world.npcs['vendor-1'].schedule = { grid: {}, overrides: { '3:morning': { nodeId: 'start', activity: '去街角送货' } } };
    expect(whoIsHere(world, 'start', 3, 'morning', 7)).toEqual([
      { id: 'vendor-1', name: '摊主', tier: 'semi', nodeId: 'start', activity: '去街角送货', source: 'schedule' },
    ]);
  });

  it('returns every known location in one local query', () => {
    const world = setup();
    expect(whoIsWhere(world, 3, 'morning', 7).map(({ id, nodeId }) => ({ id, nodeId }))).toEqual([
      { id: 'seir', nodeId: 'docks' },
      { id: 'vendor-1', nodeId: 'docks' },
    ]);
  });

  it('derives recent encounter traces without changing world state', () => {
    const world = setup();
    world.encounterLog.push({ id: 'trace-old', day: 1, slotId: 'morning', nodeId: 'docks', characterIds: ['seir'], trigger: 'enter', scope: 'formal', outcome: 'continued' });
    world.encounterLog.push({ id: 'trace-recent', day: 2, slotId: 'afternoon', nodeId: 'docks', characterIds: ['vendor-1'], trigger: 'leave', scope: 'peripheral', outcome: 'urgent_leave' });
    const before = structuredClone(world);
    expect(recentEncounterTraces(world, 'docks', 4, 2)).toEqual([{ day: 2, daysAgo: 2, characterIds: ['vendor-1'], characterNames: ['摊主'], trigger: 'leave', scope: 'peripheral', outcome: 'urgent_leave' }]);
    expect(world).toEqual(before);
  });

  it('does not query providers or create state while reading presence', () => {
    const world = setup();
    const before = structuredClone(world);
    whoIsHere(world, 'start', 1, 'morning', 7);
    expect(world).toEqual(before);
  });

  it('derives stable temporary roaming only after a time slot has been consumed', () => {
    const world = setup();
    world.map.nodes.start.discovered = true;
    world.map.nodes.docks = { id: 'docks', name: '码头', regionId: 'start-region', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 700, y: 300 } };
    world.slotsUsedToday = 1;
    const personId = Array.from({ length: 100 }, (_, index) => `roamer-${index}`).find((id) => resolveRoamingCell(world, id)?.nodeId);
    expect(personId).toBeDefined();
    const first = resolveRoamingCell(world, personId!);
    expect(first).toBeDefined();
    expect(first?.nodeId === 'start' || first?.nodeId === 'docks').toBe(true);
    expect(resolveRoamingCell(world, personId!)).toEqual(first);
    world.slotsUsedToday = 0;
    expect(resolveRoamingCell(world, personId!)).toBeUndefined();
  });
});
