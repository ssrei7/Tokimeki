import { describe, expect, it } from 'vitest';
import { deleteRelationshipMemory, removeRelationshipMemoriesFromMessage, retrieveRelationshipMemories, setRelationshipMemoryArchived, setRelationshipMemoryInject, updateRelationshipMemory } from '../src/core/relationship';
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

  it('removes only memories sourced from an edited chat message onward', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory-source', title: 'Relationship memory source' }));
    const world = save.world;
    world.relations.seir = { axes: {}, knots: [], memories: [
      { id: 'old', text: '旧', day: 1 },
      { id: 'reply-2', text: '第二条回复', day: 2, sourceChatMessageIndex: 2 },
      { id: 'reply-5', text: '第五条回复', day: 2, sourceChatMessageIndex: 5 },
    ] };
    expect(removeRelationshipMemoriesFromMessage(world, 'seir', 4)).toBe(1);
    expect(world.relations.seir.memories.map((memory) => memory.id)).toEqual(['old', 'reply-2']);
  });

  it('retrieves memories deterministically and excludes archived or disabled entries', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory-retrieval', title: 'Relationship memory retrieval' }));
    save.world.relations.seir = { axes: {}, knots: [], memories: [
      { id: 'old', text: '在码头约好下次见。', day: 1, nodeId: 'docks', type: 'promise', importance: 'high', archived: false, inject: true, source: { kind: 'chat', chatCharacterId: 'seir', chatMessageIndex: 1 } },
      { id: 'hidden', text: '在码头的旧记忆。', day: 3, nodeId: 'docks', archived: true, inject: true, source: { kind: 'legacy' } },
      { id: 'disabled', text: '在码头的普通记忆。', day: 4, nodeId: 'docks', archived: false, inject: false, source: { kind: 'manual' } },
    ] };
    expect(retrieveRelationshipMemories(save.world, 'seir', { query: '码头', nodeId: 'docks', limit: 5 }).map(({ memory }) => memory.id)).toEqual(['old']);
    expect(retrieveRelationshipMemories(save.world, 'seir', { includeArchived: true, includeDisabled: true, query: '码头' }).map(({ memory }) => memory.id)).toEqual(['old', 'disabled', 'hidden']);
  });

  it('supports editing, archiving, restoring, and disabling injection locally', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory-edit', title: 'Relationship memory edit' }));
    save.world.relations.seir = { axes: {}, knots: [], memories: [{ id: 'm1', text: '旧内容', day: 1, source: { kind: 'legacy' } }] };
    expect(updateRelationshipMemory(save.world, 'seir', 'm1', { text: '新内容', type: 'event', importance: 'critical' })).toEqual({ ok: true });
    expect(setRelationshipMemoryArchived(save.world, 'seir', 'm1', true)).toEqual({ ok: true });
    expect(setRelationshipMemoryInject(save.world, 'seir', 'm1', false)).toEqual({ ok: true });
    expect(save.world.relations.seir.memories[0]).toMatchObject({ text: '新内容', type: 'event', importance: 'critical', archived: true, inject: false });
  });
});
