import { z } from 'zod';
import { MorningNpcMoveSchema, ScheduleSchema, WeatherSchema, type MorningBriefEntry, type MorningNpcMove, type MorningWorldUpdate, type WorldState } from '../../data/schema/save';

const MorningNewsSchema = z.object({
  category: z.enum(['lead', 'ambience', 'character', 'ad']),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  nodeId: z.string().min(1).optional(),
  slotId: z.string().min(1).optional(),
  charIds: z.array(z.string().min(1)).max(3).default([]),
  expiresDay: z.number().int().positive().optional(),
});

export const MorningBriefResponseSchema = z.array(MorningNewsSchema).min(3).max(6);

export const MorningWorldResponseSchema = z.object({
  news: MorningBriefResponseSchema,
  weather: WeatherSchema,
  npcMoves: z.array(MorningNpcMoveSchema).max(200).default([]),
  worldNote: z.string().max(1000).optional(),
});

export interface ParsedMorningUpdate {
  entries: MorningBriefEntry[];
  weather: MorningWorldUpdate['weather'];
  npcMoves: MorningNpcMove[];
  worldNote?: string;
}

export function buildLocalMorningBrief(world: WorldState, day: number): MorningBriefEntry[] {
  return buildLocalMorningUpdate(world, day).entries;
}

export function buildLocalMorningUpdate(world: WorldState, day: number): ParsedMorningUpdate {
  const previous = world.settlements.filter((settlement) => settlement.day < day).at(-1);
  const entries: MorningBriefEntry[] = [];
  if (previous?.footprint.length) {
    const echo = previous.footprint.flatMap((nodeId) => world.map.nodes[nodeId]?.memories.filter((memory) => memory.day === previous.day) ?? []).at(-1);
    entries.push({ id: `morning-${day}-lead`, day, category: 'lead', title: echo ? '昨日事件仍有回声' : '昨日留下的脚步', body: echo ? `${echo.text} 今天或许还能在那里发现后续。` : `昨天有人在${previous.footprint.join('、')}留下了新的足迹，今天或许还能在那里发现后续。`, nodeId: previous.footprint.at(-1), source: 'local', charIds: echo?.charIds ?? [] });
  }
  if (previous?.met.length) entries.push({ id: `morning-${day}-character`, day, category: 'character', title: '熟悉的名字', body: `昨天遇见过${previous.met.join('、')}，他们的日程仍由世界规则决定。`, charIds: previous.met.slice(0, 3), source: 'local' });
  entries.push({ id: `morning-${day}-ambience`, day, category: 'ambience', title: '街区照常苏醒', body: `第 ${day} 天已经开始。地点开放、角色日程和可触发事件以当前世界状态为准。`, source: 'local', charIds: [] });
  entries.push({ id: `morning-${day}-ad`, day, category: 'ad', title: '今日可去哪里', body: '打开地图查看已发现地点；前往地点不会因为晨报本身改变任何世界事实。', source: 'local', charIds: [] });
  return { entries, weather: { id: 'clear', label: '晴朗', tags: [] }, npcMoves: [] };
}

export function buildMorningPrompt(world: WorldState, day: number, previousDiary?: string): { role: 'system' | 'user'; content: string }[] {
  const prior = previousDiary?.trim() ? `\n前一天日记（仅作叙事回声，不是新的事实来源）：\n${previousDiary.trim()}` : '';
  return [
    { role: 'system', content: '你是世界晨报整理器。根据确定性世界事实，返回严格 JSON 对象，包含 news、weather、npcMoves、可选 worldNote。news 必须是 3–6 条，每条包含 category、title、body，可选 nodeId、slotId、charIds、expiresDay。category 只能是 lead、ambience、character、ad。不要创造不存在的地点、角色、时间或状态；lead 必须指向已知地点和可验证时段；ad 只写成入口描述，不直接改变世界。npcMoves 只能安排列出的角色去列出的地点和时段。' },
    { role: 'user', content: JSON.stringify({ day, clock: world.clock, nodes: Object.values(world.map.nodes).map((node) => ({ id: node.id, name: node.name, openSlots: node.openSlots ?? [] })), characters: Object.values(world.characters).map((character) => ({ id: character.id, name: character.name })), npcs: Object.values(world.npcs).map((npc) => ({ id: npc.id, name: npc.name, tags: npc.tags, homeNodeId: npc.homeNodeId })), settlements: world.settlements.slice(-3), diary: previousDiary ?? '' }) + prior },
  ];
}

export function parseMorningUpdate(raw: string, day: number, world: WorldState, validSlotIds: readonly string[] = []): ParsedMorningUpdate | undefined {
  const trimmed = stripJsonFence(raw);
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { return undefined; }
  const result = MorningWorldResponseSchema.safeParse(parsed);
  if (!result.success) return undefined;
  const entries = normalizeNews(result.data.news, day, world, validSlotIds);
  if (entries.length < 3) return undefined;
  const npcMoves = normalizeNpcMoves(result.data.npcMoves, world, validSlotIds);
  return { entries, weather: result.data.weather, npcMoves, ...(result.data.worldNote?.trim() ? { worldNote: result.data.worldNote.trim() } : {}) };
}

/** Backward-compatible news-only parser for older fixtures and callers. */
export function parseMorningResponse(raw: string, day: number): MorningBriefEntry[] {
  const trimmed = stripJsonFence(raw);
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { return []; }
  const source = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && 'news' in parsed ? (parsed as { news?: unknown }).news : undefined);
  const result = MorningBriefResponseSchema.safeParse(source);
  if (!result.success) return [];
  return result.data.map((entry, index) => ({ ...entry, id: `morning-${day}-${index + 1}`, day, source: 'ai' as const }));
}

export function applyMorningNpcMoves(world: WorldState, day: number, moves: readonly MorningNpcMove[]): number {
  let applied = 0;
  for (const move of moves) {
    const target = world.characters[move.charId] ?? world.npcs[move.charId];
    if (!target) continue;
    const schedule = target.schedule ?? ScheduleSchema.parse({ grid: {}, overrides: {} });
    target.schedule = schedule;
    schedule.overrides[`${day}:${move.slotId}`] = { nodeId: move.nodeId, activity: move.note?.trim() || '临时停留' };
    applied += 1;
  }
  return applied;
}

export function hasMorningBrief(world: WorldState, day: number): boolean {
  return world.morningBriefs.some((entry) => entry.day === day);
}

export function hasMorningUpdate(world: WorldState, day: number): boolean {
  return world.morningUpdates.some((entry) => entry.day === day);
}

function normalizeNews(news: z.infer<typeof MorningBriefResponseSchema>, day: number, world: WorldState, validSlotIds: readonly string[]): MorningBriefEntry[] {
  const knownChars = new Set([...Object.keys(world.characters), ...Object.keys(world.npcs)]);
  const knownSlots = new Set(validSlotIds);
  return news.flatMap((entry, index) => {
    if (entry.nodeId && !world.map.nodes[entry.nodeId]) return [];
    if (entry.slotId && knownSlots.size && !knownSlots.has(entry.slotId)) return [];
    if (entry.charIds.some((charId) => !knownChars.has(charId))) return [];
    const isLeadWithoutNode = entry.category === 'lead' && !entry.nodeId;
    const category = isLeadWithoutNode ? 'ambience' : entry.category;
    const expiresDay = entry.expiresDay ?? (category === 'lead' || category === 'ad' ? day + 3 : undefined);
    return [{ id: `morning-${day}-${index + 1}`, day, category, title: entry.title, body: entry.body, ...(entry.nodeId ? { nodeId: entry.nodeId } : {}), ...(entry.slotId ? { slotId: entry.slotId } : {}), charIds: entry.charIds, ...(expiresDay ? { expiresDay } : {}), source: 'ai' as const }];
  });
}

function normalizeNpcMoves(moves: z.infer<typeof MorningNpcMoveSchema>[], world: WorldState, validSlotIds: readonly string[]): MorningNpcMove[] {
  const knownSlots = new Set(validSlotIds);
  const seen = new Set<string>();
  return moves.filter((move) => {
    if (!(world.characters[move.charId] || world.npcs[move.charId])) return false;
    if (!world.map.nodes[move.nodeId]) return false;
    if (knownSlots.size && !knownSlots.has(move.slotId)) return false;
    const key = `${move.charId}:${move.slotId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripJsonFence(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}
