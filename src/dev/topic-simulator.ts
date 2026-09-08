import { visibleTopics } from '../core/topics';
import type { WorldState } from '../data/schema/save';

export interface TopicSimulationOptions {
  seeds?: number[];
  days?: number;
  startDay?: number;
  treeKeys?: string[];
}

export interface TopicSeedReport {
  seed: number;
  days: number;
  availableTopicCounts: number[];
  exhaustionDayByTree: Record<string, number | null>;
  dailyRefreshCoverage: number;
}

export interface TopicDistributionReport {
  days: number;
  seeds: number[];
  runs: TopicSeedReport[];
  aggregate: {
    averageAvailableTopics: number;
    averageExhaustionDay: number;
    dailyRefreshCoverage: number;
  };
}

/** Runs deterministic, provider-free topic usage simulations against stored trees. */
export function simulateTopicDistribution(world: WorldState, options: TopicSimulationOptions = {}): TopicDistributionReport {
  const days = Math.max(1, Math.floor(options.days ?? 7));
  const seeds = options.seeds?.length ? options.seeds.map((seed) => Math.floor(seed)) : Array.from({ length: 20 }, (_, index) => index + 1);
  const treeKeys = (options.treeKeys?.length ? options.treeKeys : Object.keys(world.topicTrees)).filter((key) => Boolean(world.topicTrees[key]));
  const runs = seeds.map((seed) => simulateTopicSeed(world, treeKeys, { seed, days, startDay: options.startDay ?? world.clock.day }));
  const allCounts = runs.flatMap((run) => run.availableTopicCounts);
  const exhaustionDays = runs.flatMap((run) => Object.values(run.exhaustionDayByTree).filter((day): day is number => day !== null));
  return {
    days,
    seeds,
    runs,
    aggregate: {
      averageAvailableTopics: allCounts.length ? allCounts.reduce((sum, count) => sum + count, 0) / allCounts.length : 0,
      averageExhaustionDay: exhaustionDays.length ? exhaustionDays.reduce((sum, day) => sum + day, 0) / exhaustionDays.length : 0,
      dailyRefreshCoverage: runs.length ? runs.reduce((sum, run) => sum + run.dailyRefreshCoverage, 0) / runs.length : 0,
    },
  };
}

function simulateTopicSeed(world: WorldState, treeKeys: string[], options: { seed: number; days: number; startDay: number }): TopicSeedReport {
  const copy = structuredClone(world);
  const exhaustionDayByTree = Object.fromEntries(treeKeys.map((key) => [key, null])) as Record<string, number | null>;
  const availableTopicCounts: number[] = [];
  let randomState = (Math.abs(options.seed) + 1) >>> 0;
  const nextRandom = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };
  let dailyTreeCount = 0;
  let refreshedDailyTreeCount = 0;
  for (let dayOffset = 0; dayOffset < options.days; dayOffset += 1) {
    const day = options.startDay + dayOffset;
    const orderedKeys = [...treeKeys].sort((a, b) => a.localeCompare(b));
    const rotation = orderedKeys.length ? Math.floor(nextRandom() * orderedKeys.length) : 0;
    const visitOrder = [...orderedKeys.slice(rotation), ...orderedKeys.slice(0, rotation)];
    for (const key of visitOrder) {
      const tree = copy.topicTrees[key];
      if (!tree) continue;
      const dailyTopics = tree.topics.filter((topic) => topic.kind === 'daily');
      if (dailyTopics.length) {
        dailyTreeCount += 1;
        if (dailyTopics.every((topic) => topic.generatedDay === day)) refreshedDailyTreeCount += 1;
      }
      const available = visibleTopics(tree, copy, 'hide').filter((entry) => entry.visibility === 'available');
      availableTopicCounts.push(available.length);
      if (!available.length) {
        if (exhaustionDayByTree[key] === null) exhaustionDayByTree[key] = day;
        continue;
      }
      const chosen = available[Math.floor(nextRandom() * available.length)]?.topic;
      if (chosen) copy.usedTopics[chosen.id] = day;
    }
  }
  return {
    seed: options.seed,
    days: options.days,
    availableTopicCounts,
    exhaustionDayByTree,
    dailyRefreshCoverage: dailyTreeCount ? refreshedDailyTreeCount / dailyTreeCount : 0,
  };
}
