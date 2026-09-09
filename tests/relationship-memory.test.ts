import { describe, expect, it } from 'vitest';
import { buildVectorMemoryIndex, searchVectorMemoryIndex } from '../src/core/relationship';
import { deleteRelationshipMemory, removeRelationshipMemoriesFromMessage, retrieveRelationshipMemories, retrieveRelationshipMemoriesHybrid, setRelationshipMemoryArchived, setRelationshipMemoryInject, updateRelationshipMemory } from '../src/core/relationship';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

describe('relationship memory library operations', () => {
  it('rebuilds and searches a disposable local vector index deterministically', () => {
    const index = buildVectorMemoryIndex([
      { id: 'near', vector: [1, 0] },
      { id: 'far', vector: [0, 1] },
      { id: 'bad', vector: [Number.NaN, 1] },
    ]);
    expect(index.dimensions).toBe(2);
    expect(searchVectorMemoryIndex(index, [1, 0], 2)).toEqual([{ id: 'near', score: 1 }, { id: 'far', score: 0 }]);
    expect(searchVectorMemoryIndex(index, [1], 2)).toEqual([]);
  });

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

  it('removes consolidated memories when any contributing message is edited', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory-range', title: 'Relationship memory range' }));
    save.world.relations.seir = { axes: {}, knots: [], memories: [{ id: 'summary', text: '整理结果', day: 2, sourceChatMessageIndices: [1, 3, 5] }] };
    expect(removeRelationshipMemoriesFromMessage(save.world, 'seir', 3)).toBe(1);
    expect(save.world.relations.seir.memories).toEqual([]);
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

  it('blends normalized vector scores after deterministic kernel filtering', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory-hybrid', title: 'Relationship memory hybrid' }));
    save.world.relations.seir = { axes: {}, knots: [], memories: [
      { id: 'keyword', text: '码头的约定', day: 1, nodeId: 'docks', importance: 'high' },
      { id: 'semantic', text: '海边的约定', day: 2, nodeId: 'beach', importance: 'normal' },
      { id: 'archived', text: '码头的旧记忆', day: 3, nodeId: 'docks', archived: true },
    ] };
    const result = retrieveRelationshipMemoriesHybrid(save.world, 'seir', {
      query: '码头',
      vectorScores: new Map([['keyword', 0.1], ['semantic', 0.9], ['archived', 1]]),
      keywordWeight: 0.25,
      vectorWeight: 0.75,
    });
    expect(result.map(({ memory }) => memory.id)).toEqual(['keyword']);
  });

  it('lets vector similarity change ranking among kernel-approved memories', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory-hybrid-order', title: 'Relationship memory hybrid order' }));
    save.world.relations.seir = { axes: {}, knots: [], memories: [
      { id: 'first', text: '同一话题', day: 1, importance: 'high' },
      { id: 'second', text: '同一话题', day: 2, importance: 'normal' },
    ] };
    expect(retrieveRelationshipMemoriesHybrid(save.world, 'seir', {
      query: '话题',
      vectorScores: new Map([['first', 0], ['second', 1]]),
      keywordWeight: 0.25,
      vectorWeight: 0.75,
    }).map(({ memory }) => memory.id)).toEqual(['second', 'first']);
  });

  it('falls back to the existing retrieval order without vector scores', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory-hybrid-fallback', title: 'Relationship memory hybrid fallback' }));
    save.world.relations.seir = { axes: {}, knots: [], memories: [
      { id: 'newer', text: '同一话题', day: 2 },
      { id: 'older', text: '同一话题', day: 1 },
    ] };
    const options = { query: '话题' };
    expect(retrieveRelationshipMemoriesHybrid(save.world, 'seir', options)).toEqual(retrieveRelationshipMemories(save.world, 'seir', options));
  });

  it('keeps stable day and id tie-breaking for equal hybrid scores', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'relationship-memory-hybrid-tie', title: 'Relationship memory hybrid tie' }));
    save.world.relations.seir = { axes: {}, knots: [], memories: [
      { id: 'same-a', text: '同一话题', day: 1 },
      { id: 'same-b', text: '同一话题', day: 1 },
    ] };
    const result = retrieveRelationshipMemoriesHybrid(save.world, 'seir', {
      query: '话题',
      vectorScores: new Map([['same-a', 0.5], ['same-b', 0.5]]),
    });
    expect(result.map(({ memory }) => memory.id)).toEqual(['same-a', 'same-b']);
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
