import { describe, expect, it } from 'vitest';
import { simulateEventDistribution } from '../src/dev/event-simulator';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import type { EventDef } from '../src/data/schema/save';

describe('provider-free event and tension simulation', () => {
  it('produces reproducible event intervals, cooldown hits, and tension curves', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'event-sim', title: 'Event sim', day: 1 }));
    save.world.map.nodes.start.openSlots = ['morning'];
    const event: EventDef = { id: 'daily-note', title: '每日告示', trigger: { nodeIds: ['start'], slotIds: ['morning'] }, cooldownDays: 2, content: '今天也有一张告示。' };
    save.world.eventDefs[event.id] = event;
    const first = simulateEventDistribution(save.world, save.config.calendar, { seeds: [7, 8], days: 8, nodeIds: ['start'] });
    const second = simulateEventDistribution(save.world, save.config.calendar, { seeds: [7, 8], days: 8, nodeIds: ['start'] });
    expect(first).toEqual(second);
    expect(first.aggregate.triggeredEvents).toBeGreaterThan(0);
    expect(first.aggregate.cooldownHits).toBeGreaterThan(0);
    expect(first.aggregate.maxTension).toBeGreaterThanOrEqual(0);
  });

  it('does not mutate the source world', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'event-sim-pure', title: 'Event sim pure', day: 1 }));
    save.world.map.nodes.start.openSlots = ['morning'];
    save.world.eventDefs.note = { id: 'note', title: '告示', trigger: { nodeIds: ['start'], slotIds: ['morning'] }, content: '一张告示。' };
    const before = structuredClone(save.world);
    simulateEventDistribution(save.world, save.config.calendar, { seeds: [1], days: 4, nodeIds: ['start'] });
    expect(save.world).toEqual(before);
  });
});
