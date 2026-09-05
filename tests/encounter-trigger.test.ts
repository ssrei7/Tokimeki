import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events/bus';
import { triggerEncounter, updateEncounterOutcome } from '../src/core/encounter';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

function setup() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'encounter-trigger', title: 'Encounter trigger', day: 3, slotId: 'morning' }));
  save.world.characters.seir = {
    id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '码头青年', personality: '安静' }, visuals: { portraits: [] }, homeNodeId: 'start',
    schedule: { grid: { '2:morning': { nodeId: 'start', activity: '等人' } }, overrides: {} },
  };
  return save;
}

const config = { enabled: true, triggerOnLeave: true, leaveProbability: 0, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} };

describe('encounter trigger and log', () => {
  it('records an entered encounter with derived scope and emits onEncounter', () => {
    const save = setup();
    save.world.map.nodes.start.openSlots = ['noon'];
    const events = new EventBus();
    const handler = vi.fn();
    events.subscribe('onEncounter', handler);
    const result = triggerEncounter(save.world, config, { nodeId: 'start', trigger: 'enter', seed: 3, events });
    expect(result.triggered).toBe(true);
    expect(result.entry).toEqual(expect.objectContaining({ characterIds: ['seir'], scope: 'peripheral', outcome: 'continued' }));
    expect(save.world.encounterLog).toEqual([result.entry]);
    expect(handler).toHaveBeenCalledWith({ characterIds: ['seir'], nodeId: 'start' });
  });

  it('gates leave encounters by probability but lets the unseen guarantee win', () => {
    const save = setup();
    save.world.encounterLog.push({ id: 'recent', day: 2, slotId: 'morning', nodeId: 'start', characterIds: ['seir'], trigger: 'enter', scope: 'formal', outcome: 'continued' });
    expect(triggerEncounter(save.world, config, { nodeId: 'start', trigger: 'leave', seed: 1 }).triggered).toBe(false);
    save.world.encounterLog = [];
    expect(triggerEncounter(save.world, config, { nodeId: 'start', trigger: 'leave', seed: 1 }).triggered).toBe(true);
  });

  it('does nothing when disabled, leave triggers are off, or the player is elsewhere', () => {
    const save = setup();
    expect(triggerEncounter(save.world, { ...config, enabled: false }, { nodeId: 'start', trigger: 'enter' }).triggered).toBe(false);
    expect(triggerEncounter(save.world, { ...config, triggerOnLeave: false }, { nodeId: 'start', trigger: 'leave' }).triggered).toBe(false);
    save.world.map.nodes.docks = { id: 'docks', name: '西码头', regionId: 'start-region', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 800, y: 350 } };
    expect(triggerEncounter(save.world, config, { nodeId: 'docks', trigger: 'character_move' }).triggered).toBe(false);
    expect(save.world.encounterLog).toHaveLength(0);
  });

  it('records the player choice without consuming time', () => {
    const save = setup();
    const result = triggerEncounter(save.world, config, { nodeId: 'start', trigger: 'enter' });
    const beforeClock = structuredClone(save.world.clock);
    const updated = updateEncounterOutcome(save.world, result.entry!.id, 'urgent_leave');
    expect(updated.ok).toBe(true);
    expect(save.world.encounterLog[0].outcome).toBe('urgent_leave');
    expect(save.world.clock).toEqual(beforeClock);
  });
});
