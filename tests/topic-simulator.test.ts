import { describe, expect, it } from 'vitest';
import { simulateTopicDistribution } from '../src/dev/topic-simulator';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

describe('provider-free topic simulation', () => {
  it('produces deterministic exhaustion and refresh metrics for fixed seeds', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'topic-simulation', title: 'Topic simulation', day: 3 }));
    save.world.topicTrees['seir:start'] = {
      charId: 'seir', nodeId: 'start', generatedDay: 3,
      topics: [
        { id: 'daily-a', label: '日常', kind: 'daily', terminal: false, response: 'A', generatedDay: 3 },
        { id: 'story-a', label: '故事', kind: 'story', terminal: false, response: 'B', generatedDay: 3 },
      ],
    };
    const options = { seeds: [7, 11], days: 2, startDay: 3, treeKeys: ['seir:start'] };
    const first = simulateTopicDistribution(save.world, options);
    const second = simulateTopicDistribution(save.world, options);
    expect(first).toEqual(second);
    expect(first.runs[0].availableTopicCounts).toEqual([2, 1]);
    expect(first.runs[0].exhaustionDayByTree['seir:start']).toBeNull();
    expect(first.aggregate.dailyRefreshCoverage).toBe(0.5);
  });
});
