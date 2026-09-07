import { describe, expect, it } from 'vitest';
import { createDefaultOpRegistry, type OpContext } from '../src/core/ops';
import { isTopicTreeFresh, mergeDailyTopicTree, topicResponse, topicVisibility, topicTreeKey, visibleTopics } from '../src/core/topics';
import { parseGeneratedTopicTree } from '../src/core/topics/parser';
import { createStage4EncounterScenario } from '../src/dev/scenarios/stage4';
import { seedScenario } from '../src/dev/scenarios/seeder';

function setup() {
  const save = seedScenario(createStage4EncounterScenario());
  const context: OpContext = {
    world: save.world,
    actorId: 'seir',
    day: save.world.clock.day,
    slotId: save.world.clock.slotId,
    nodeId: 'docks',
    log: () => {},
  };
  return { save, context, registry: createDefaultOpRegistry() };
}

const rawTree = JSON.stringify({
  charId: 'seir', nodeId: 'docks', generatedDay: 3,
  topics: [
    { id: 'a', label: 'A', kind: 'daily', terminal: false, response: 'A response', usedResponse: 'A used', generatedDay: 3 },
    { id: 'b', label: 'B', kind: 'daily', terminal: false, require: 'flags.ready', response: 'B response', generatedDay: 3 },
    { id: 'c', label: 'C', kind: 'story', terminal: false, response: 'C response', unlocks: ['d'], generatedDay: 3 },
    { id: 'd', label: 'D', kind: 'story', terminal: true, require: 'flags.ready', response: 'D response', generatedDay: 3 },
  ],
});

describe('TopicTree', () => {
  it('parses a complete tree and supports fenced JSON', () => {
    expect(parseGeneratedTopicTree(rawTree, 'seir', 'docks', 3).topics).toHaveLength(4);
    expect(parseGeneratedTopicTree(`\`\`\`json\n${rawTree}\n\`\`\``, 'seir', 'docks', 3).charId).toBe('seir');
  });

  it('rejects malformed, mismatched, and out-of-range trees', () => {
    expect(() => parseGeneratedTopicTree('{"topics": [', 'seir', 'docks', 3)).toThrow();
    expect(() => parseGeneratedTopicTree(rawTree, 'rin', 'docks', 3)).toThrow();
    const tooFew = JSON.stringify({ charId: 'seir', nodeId: 'docks', generatedDay: 3, topics: [] });
    expect(() => parseGeneratedTopicTree(tooFew, 'seir', 'docks', 3)).toThrow();
  });

  it('filters requirements and returns used responses without changing the tree', () => {
    const { save } = setup();
    const tree = parseGeneratedTopicTree(rawTree, 'seir', 'docks', 3);
    expect(topicVisibility(tree.topics[1], save.world, 'hide')).toBe('hidden');
    expect(visibleTopics(tree, save.world, 'question_marks').find((entry) => entry.topic.id === 'b')?.label).toBe('???');
    save.world.usedTopics.a = 3;
    expect(topicResponse(tree.topics[0], save.world)).toBe('A used');
    expect(isTopicTreeFresh(tree, 3)).toBe(true);
    expect(isTopicTreeFresh(tree, 4)).toBe(false);
    const refreshed = mergeDailyTopicTree(tree, { ...tree, generatedDay: 4, topics: [tree.topics[0], { ...tree.topics[1], generatedDay: 4 }] });
    expect(refreshed.topics.some((topic) => topic.id === 'c')).toBe(true);
  });

  it('unlocks and marks topics through the registered ops', () => {
    const { save, context, registry } = setup();
    const tree = parseGeneratedTopicTree(rawTree, 'seir', 'docks', 3);
    save.world.topicTrees[topicTreeKey('seir', 'docks')] = tree;
    const unlocked = registry.applyAll([{ op: 'unlock_topic', id: 'b' }], context, 12);
    expect(unlocked.applied).toBe(1);
    expect(save.world.topicTrees['seir:docks'].topics.find((topic) => topic.id === 'b')?.require).toBeUndefined();
    const marked = registry.applyAll([{ op: 'mark_topic_used', id: 'a' }], context, 12);
    expect(marked.applied).toBe(1);
    expect(save.world.usedTopics.a).toBe(3);
    expect(registry.applyAll([{ op: 'mark_topic_used', id: 'missing' }], context, 12).rejected).toHaveLength(1);
  });
});
