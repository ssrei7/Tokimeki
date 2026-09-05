import { describe, expect, it } from 'vitest';
import { resolveScheduledCell, whoIsHere } from '../src/core/encounter';
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

  it('does not query providers or create state while reading presence', () => {
    const world = setup();
    const before = structuredClone(world);
    whoIsHere(world, 'start', 1, 'morning', 7);
    expect(world).toEqual(before);
  });
});
