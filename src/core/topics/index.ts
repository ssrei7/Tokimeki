import { evaluateCondition, type ConditionScope } from '../expr';
import type { Topic, TopicTree, WorldState } from '../../data/schema/save';

export type TopicVisibility = 'available' | 'used' | 'locked' | 'hidden';

export function topicTreeKey(charId: string, nodeId: string): string {
  return `${charId}:${nodeId}`;
}

export function isTopicTreeFresh(tree: TopicTree, day: number): boolean {
  return tree.topics.filter((topic) => topic.kind === 'daily').every((topic) => topic.generatedDay === day);
}

export function mergeDailyTopicTree(previous: TopicTree | undefined, next: TopicTree): TopicTree {
  if (!previous || previous.generatedDay === next.generatedDay) return next;
  const incomingStoryIds = new Set(next.topics.filter((topic) => topic.kind === 'story').map((topic) => topic.id));
  const retainedStory = previous.topics.filter((topic) => topic.kind === 'story' && !incomingStoryIds.has(topic.id));
  return { ...next, topics: [...retainedStory, ...next.topics].slice(0, 8) };
}

export function topicVisibility(topic: Topic, world: WorldState, hiddenTopicStyle: 'hide' | 'question_marks'): TopicVisibility {
  if (world.usedTopics[topic.id] !== undefined) return 'used';
  if (topic.require) {
    try {
      if (!evaluateCondition(topic.require, topicConditionScope(world))) return hiddenTopicStyle === 'hide' ? 'hidden' : 'locked';
    } catch {
      return hiddenTopicStyle === 'hide' ? 'hidden' : 'locked';
    }
  }
  return 'available';
}

export function visibleTopics(tree: TopicTree, world: WorldState, hiddenTopicStyle: 'hide' | 'question_marks'): Array<{ topic: Topic; visibility: TopicVisibility; label: string }> {
  return tree.topics
    .map((topic) => {
      const visibility = topicVisibility(topic, world, hiddenTopicStyle);
      return { topic, visibility, label: visibility === 'locked' ? '???' : topic.label };
    })
    .filter((entry) => entry.visibility !== 'hidden');
}

export function topicResponse(topic: Topic, world: WorldState): string {
  return world.usedTopics[topic.id] === undefined ? topic.response : topic.usedResponse ?? topic.response;
}

export function canUnlockTopic(world: WorldState, actorId: string | undefined, nodeId: string, topicId: string): boolean {
  if (!actorId) return false;
  const tree = world.topicTrees[topicTreeKey(actorId, nodeId)];
  return Boolean(tree?.topics.some((topic) => topic.id === topicId));
}

export function hasSelectableTopics(tree: TopicTree | undefined, world: WorldState, hiddenTopicStyle: 'hide' | 'question_marks'): boolean {
  if (!tree) return false;
  return visibleTopics(tree, world, hiddenTopicStyle).some((entry) => entry.visibility === 'available' || entry.visibility === 'used');
}

export function topicConditionScope(world: WorldState): ConditionScope {
  return {
    world: { stats: world.stats, flags: world.flags },
    player: { stats: world.player.stats, flags: world.player.flags },
    stats: world.stats,
    flags: world.flags,
    playerStats: world.player.stats,
    playerFlags: world.player.flags,
    usedTopics: world.usedTopics,
  } as unknown as ConditionScope;
}
