import { describe, expect, it } from 'vitest';
import { selectEncounterCandidates } from '../src/core/encounter';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import type { FormalCharacter } from '../src/data/schema/save';

function setup() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'encounter-selection', title: 'Encounter selection' }));
  save.world.map.nodes.docks = { id: 'docks', name: '西码头', regionId: 'start-region', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 800, y: 350 } };
  save.world.map.edges.push({ from: 'start', to: 'docks', travelSlots: 1 });
  const character: FormalCharacter = {
    id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '码头青年', personality: '安静' }, visuals: { portraits: [] }, homeNodeId: 'start',
    schedule: { grid: { '2:morning': { nodeId: 'docks', activity: '整理渔网' } }, overrides: {} },
  };
  save.world.characters.seir = character;
  save.world.npcs['vendor-1'] = { id: 'vendor-1', name: '摊主', tier: 'semi', facts: ['卖花'], tags: ['merchant'], homeNodeId: 'docks', lightMemory: [] };
  return save;
}

const config = { enabled: true, triggerOnLeave: true, leaveProbability: 1, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} };

describe('deterministic encounter selection', () => {
  it('selects scheduled people locally and deterministically', () => {
    const save = setup();
    const options = { world: save.world, config, nodeId: 'docks', day: 3, slotId: 'morning', daysPerWeek: 7, seed: 42 };
    const first = selectEncounterCandidates(options);
    const second = selectEncounterCandidates(options);
    expect(first).toEqual(second);
    expect(first.map((candidate) => candidate.id)).toEqual(['seir', 'vendor-1']);
    expect(first[0].weight).toBeGreaterThan(first[1].weight);
  });

  it('guarantees a candidate after the configured unseen interval', () => {
    const save = setup();
    save.world.characters.seir.schedule!.overrides['4:night'] = { nodeId: 'docks', activity: '夜间值守' };
    save.world.encounterLog.push({ id: 'old', day: 1, slotId: 'morning', nodeId: 'docks', characterIds: ['vendor-1'], trigger: 'enter', scope: 'formal', outcome: 'continued' });
    const selected = selectEncounterCandidates({ world: save.world, config: { ...config, maxParticipants: 1 }, nodeId: 'docks', day: 4, slotId: 'night', seed: 1 });
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('seir');
    expect(selected[0].daysSinceLastEncounter).toBe(4);
  });

  it('respects the global switch, weights, participant cap, and purity', () => {
    const save = setup();
    const before = structuredClone(save.world);
    expect(selectEncounterCandidates({ world: save.world, config: { ...config, enabled: false }, nodeId: 'docks', seed: 8 })).toEqual([]);
    const selected = selectEncounterCandidates({ world: save.world, config: { ...config, maxParticipants: 1, weights: { seir: 0 } }, nodeId: 'docks', seed: 8 });
    expect(selected.map((candidate) => candidate.id)).toEqual(['vendor-1']);
    expect(save.world).toEqual(before);
  });
});
