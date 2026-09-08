import { describe, expect, it } from 'vitest';
import { deleteRelationshipMemory } from '../src/core/relationship';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

describe('relationship memory library operations', () => {
  it('deletes one memory without changing other relationship state', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory', title: 'Relationship memory' }));
    save.world.relations.seir = { axes: {}, knots: [], memories: [] };
    save.world.relations.seir.memories.push(
      { id: 'memory-one', text: '一起看过海。', day: 2, nodeId: 'start' },
      { id: 'memory-two', text: '约好下次见。', day: 3 },
    );
    save.world.relations.seir.axes = { affection: 12 };

    expect(deleteRelationshipMemory(save.world, 'seir', 'memory-one')).toEqual({ ok: true });
    expect(save.world.relations.seir.memories).toEqual([
      { id: 'memory-two', text: '约好下次见。', day: 3 },
    ]);
    expect(save.world.relations.seir.axes).toEqual({ affection: 12 });
  });

  it('rejects unknown memories and characters', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory-missing', title: 'Relationship memory missing' }));
    expect(deleteRelationshipMemory(save.world, 'seir', 'missing')).toMatchObject({ ok: false });
    expect(deleteRelationshipMemory(save.world, 'missing', 'memory-one')).toMatchObject({ ok: false });
  });
});
