import { evaluateCondition, type ConditionScope } from '../expr';
import type { StageRule, WorldState } from '../../data/schema/save';

export interface RelationshipPromptState {
  axes?: Record<string, number>;
  stageName?: string;
  mood?: { word: string; setDay: number; decayDays: number };
  situation?: string;
  lastSeenDay?: number;
  today: number;
  showNumbers?: boolean;
}

export function buildRelationshipStatePrompt(state: RelationshipPromptState | undefined): string | null {
  if (!state) return null;
  const lines: string[] = [];
  if (state.stageName) lines.push(`阶段：${state.stageName}`);
  if (state.showNumbers && state.axes && Object.keys(state.axes).length) lines.push(`关系轴：${Object.entries(state.axes).map(([key, value]) => `${key}=${value}`).join('，')}`);
  if (state.mood?.word && state.today - state.mood.setDay <= state.mood.decayDays) lines.push(`当前心情：${state.mood.word}`);
  if (state.situation) lines.push(`当前处境：${state.situation}`);
  if (typeof state.lastSeenDay === 'number' && state.today > state.lastSeenDay) lines.push(`距上次见面：${state.today - state.lastSeenDay} 天`);
  if (!lines.length) return null;
  return `[关系状态]\n${lines.join('\n')}\n以上均为确定性内核事实，只可用于叙述，不要自行修改或补造关系数值。`;
}

export function deriveRelationshipPromptState(world: WorldState, charId: string, stageRules: StageRule[], showNumbers = false): RelationshipPromptState | undefined {
  const relation = world.relations[charId] as unknown as Record<string, unknown> | undefined;
  if (!relation) return undefined;
  const axes = isRecord(relation.axes)
    ? Object.fromEntries(Object.entries(relation.axes).filter(([, value]) => typeof value === 'number')) as Record<string, number>
    : {};
  const stageId = typeof relation.stageId === 'string' ? relation.stageId : undefined;
  const matchedRule = [...stageRules].sort((a, b) => a.order - b.order).find((rule) => {
    try {
      return evaluateCondition(rule.when, { axes, stats: world.stats, flags: world.flags, playerStats: world.player.stats, playerFlags: world.player.flags } as unknown as ConditionScope);
    } catch {
      return false;
    }
  });
  const stageName = matchedRule?.name ?? (stageId ? stageRules.find((rule) => rule.id === stageId)?.name ?? stageId : undefined);
  const mood = isRecord(relation.mood) && typeof relation.mood.word === 'string' && typeof relation.mood.setDay === 'number' && typeof relation.mood.decayDays === 'number'
    ? { word: relation.mood.word, setDay: relation.mood.setDay, decayDays: relation.mood.decayDays }
    : undefined;
  const situation = typeof relation.situation === 'string' ? relation.situation : undefined;
  const lastSeenDay = typeof relation.lastSeenDay === 'number' ? relation.lastSeenDay : undefined;
  return { axes, stageName, mood, situation, lastSeenDay, today: world.clock.day, showNumbers };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
