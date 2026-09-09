import type { ChatMessage } from '../../data/content';
import type { MorningBriefEntry, WorldState } from '../../data/schema/save';
import { z } from 'zod';

export const MorningBriefResponseSchema = z.array(z.object({
  category: z.enum(['lead', 'ambience', 'character', 'ad']),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  nodeId: z.string().min(1).optional(),
  slotId: z.string().min(1).optional(),
  charIds: z.array(z.string().min(1)).max(3).default([]),
  expiresDay: z.number().int().positive().optional(),
})).min(3).max(6);

export function buildLocalMorningBrief(world: WorldState, day: number): MorningBriefEntry[] {
  const previous = world.settlements.filter((settlement) => settlement.day < day).at(-1);
  const entries: MorningBriefEntry[] = [];
  if (previous?.footprint.length) entries.push({ id: `morning-${day}-lead`, day, category: 'lead', title: '昨日留下的脚步', body: `昨天有人在${previous.footprint.join('、')}留下了新的足迹，今天或许还能在那里发现后续。`, nodeId: previous.footprint.at(-1), source: 'local', charIds: [] });
  if (previous?.met.length) entries.push({ id: `morning-${day}-character`, day, category: 'character', title: '熟悉的名字', body: `昨天遇见过${previous.met.join('、')}，他们的日程仍由世界规则决定。`, charIds: previous.met.slice(0, 3), source: 'local' });
  entries.push({ id: `morning-${day}-ambience`, day, category: 'ambience', title: '街区照常苏醒', body: `第 ${day} 天已经开始。地点开放、角色日程和可触发事件以当前世界状态为准。`, source: 'local', charIds: [] });
  entries.push({ id: `morning-${day}-ad`, day, category: 'ad', title: '今日可去哪里', body: '打开地图查看已发现地点；前往地点不会因为晨报本身改变任何世界事实。', source: 'local', charIds: [] });
  return entries;
}

export function buildMorningPrompt(world: WorldState, day: number, previousDiary?: string): { role: 'system' | 'user'; content: string }[] {
  const prior = previousDiary?.trim() ? `\n前一天日记（仅作叙事回声，不是新的事实来源）：\n${previousDiary.trim()}` : '';
  return [
    { role: 'system', content: '你是世界晨报整理器。根据确定性世界事实，返回严格 JSON 数组，3–6 条，每条包含 category、title、body，可选 nodeId、slotId、charIds、expiresDay。category 只能是 lead、ambience、character、ad。不要创造不存在的地点、角色、时间或状态；lead 必须指向已知地点和可验证时段；ad 只写成入口描述，不直接改变世界。' },
    { role: 'user', content: JSON.stringify({ day, clock: world.clock, nodes: Object.values(world.map.nodes).map((node) => ({ id: node.id, name: node.name, openSlots: node.openSlots ?? [] })), characters: Object.values(world.characters).map((character) => ({ id: character.id, name: character.name })), settlements: world.settlements.slice(-3), diary: previousDiary ?? '' }) + prior },
  ];
}

export function parseMorningResponse(raw: string, day: number): MorningBriefEntry[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { return []; }
  const result = MorningBriefResponseSchema.safeParse(parsed);
  if (!result.success) return [];
  return result.data.map((entry, index) => ({ ...entry, id: `morning-${day}-${index + 1}`, day, source: 'ai' as const }));
}

export function hasMorningBrief(world: WorldState, day: number): boolean {
  return world.morningBriefs.some((entry) => entry.day === day);
}
