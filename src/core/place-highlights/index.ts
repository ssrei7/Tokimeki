import { z } from 'zod';
import { PlaceHighlightSchema, type MapNode, type MapState, type PlaceHighlight } from '../../data/schema/save';

export const PLACE_HIGHLIGHT_GENERATION_MIN = 1;
export const PLACE_HIGHLIGHT_GENERATION_MAX = 8;

export const PlaceHighlightDraftSchema = z.object({
  nodeId: z.string().trim().min(1),
  kind: z.enum(['hotspot', 'activity']),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(1000),
  allowsNewNpc: z.boolean(),
}).strict();

export type PlaceHighlightDraft = z.infer<typeof PlaceHighlightDraftSchema>;

export interface PlaceHighlightInput {
  nodeId: string;
  kind: PlaceHighlight['kind'];
  title: string;
  body: string;
  allowsNewNpc: boolean;
}

export function createPlaceHighlight(
  highlights: readonly PlaceHighlight[],
  map: MapState,
  input: PlaceHighlightInput,
  meta: { id: string; day: number; source: PlaceHighlight['source'] },
): PlaceHighlight[] {
  if (!map.nodes[input.nodeId]) throw new Error(`地点不存在：${input.nodeId}。`);
  if (highlights.some((item) => item.id === meta.id)) throw new Error(`地点动态 ID 已存在：${meta.id}。`);
  const created = PlaceHighlightSchema.parse({ ...input, id: meta.id, source: meta.source, createdDay: meta.day, updatedDay: meta.day });
  return [...highlights, created];
}

export function updatePlaceHighlight(
  highlights: readonly PlaceHighlight[],
  map: MapState,
  highlightId: string,
  input: PlaceHighlightInput,
  day: number,
): PlaceHighlight[] {
  if (!map.nodes[input.nodeId]) throw new Error(`地点不存在：${input.nodeId}。`);
  let found = false;
  const next = highlights.map((item) => {
    if (item.id !== highlightId) return item;
    found = true;
    return PlaceHighlightSchema.parse({ ...item, ...input, updatedDay: day });
  });
  if (!found) throw new Error(`找不到地点动态：${highlightId}。`);
  return next;
}

export function deletePlaceHighlight(highlights: readonly PlaceHighlight[], highlightId: string): PlaceHighlight[] {
  if (!highlights.some((item) => item.id === highlightId)) throw new Error(`找不到地点动态：${highlightId}。`);
  return highlights.filter((item) => item.id !== highlightId);
}

export function visiblePlaceHighlights(highlights: readonly PlaceHighlight[], map: MapState): PlaceHighlight[] {
  return highlights.filter((item) => Boolean(map.nodes[item.nodeId]?.discovered));
}

export function placeHighlightReferences(highlights: readonly PlaceHighlight[], nodeId: string): PlaceHighlight[] {
  return highlights.filter((item) => item.nodeId === nodeId);
}

export function selectPlaceHighlightNodes(
  map: MapState,
  count: number,
  random: () => number = Math.random,
  onlyNodeId?: string,
): MapNode[] {
  if (!Number.isInteger(count) || count < PLACE_HIGHLIGHT_GENERATION_MIN || count > PLACE_HIGHLIGHT_GENERATION_MAX) {
    throw new Error(`生成数量必须是 ${PLACE_HIGHLIGHT_GENERATION_MIN}–${PLACE_HIGHLIGHT_GENERATION_MAX} 的整数。`);
  }
  if (onlyNodeId) {
    const node = map.nodes[onlyNodeId];
    if (!node) throw new Error(`地点不存在：${onlyNodeId}。`);
    if (count !== 1) throw new Error('单地点生成每次只能生成 1 条。');
    return [node];
  }
  const candidates = Object.values(map.nodes);
  if (!candidates.length) throw new Error('地图中没有可用于生成动态的地点。');
  const targetCount = Math.min(count, candidates.length);
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = random();
    const swapIndex = Math.max(0, Math.min(index, Math.floor(randomValue * (index + 1))));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, targetCount);
}

export function buildPlaceHighlightGenerationMessages(nodes: readonly MapNode[], requirements: string): Array<{ role: 'system' | 'user'; content: string }> {
  if (!nodes.length || nodes.length > PLACE_HIGHLIGHT_GENERATION_MAX) throw new Error('允许地点数量必须为 1–8。');
  const allowedIds = new Set(nodes.map((node) => node.id));
  if (allowedIds.size !== nodes.length) throw new Error('允许地点不能重复。');
  return [
    {
      role: 'system',
      content: `为指定地点生成纯叙事的地点动态。只返回 JSON，不要 Markdown，格式为 {"highlights":[{"nodeId":"地点 ID","kind":"hotspot 或 activity","title":"1–80 字符","body":"1–1000 字符","allowsNewNpc":false}]}。必须恰好返回 ${nodes.length} 条，每个允许地点各一条；不得输出坐标、ID、时间、奖励、状态变化或 ops。hotspot 只表示可查看的热点，activity 表示到场后可选择参加的活动。`,
    },
    {
      role: 'user',
      content: JSON.stringify({ requirements: requirements.trim(), allowedLocations: nodes.map((node) => ({ id: node.id, name: node.name, description: node.description ?? '', kind: node.kind })) }),
    },
  ];
}

export function parseGeneratedPlaceHighlights(raw: string, allowedNodeIds: readonly string[]): PlaceHighlightDraft[] {
  if (!allowedNodeIds.length || allowedNodeIds.length > PLACE_HIGHLIGHT_GENERATION_MAX) throw new Error('允许地点数量必须为 1–8。');
  const allowed = new Set(allowedNodeIds);
  if (allowed.size !== allowedNodeIds.length) throw new Error('允许地点不能重复。');
  const parsed = parseJsonPayload(raw);
  const result = z.object({ highlights: z.array(PlaceHighlightDraftSchema).min(1).max(PLACE_HIGHLIGHT_GENERATION_MAX) }).strict().parse(parsed);
  if (result.highlights.length !== allowed.size) throw new Error(`AI 必须恰好返回 ${allowed.size} 条地点动态。`);
  const seen = new Set<string>();
  for (const draft of result.highlights) {
    if (!allowed.has(draft.nodeId)) throw new Error(`AI 返回了未授权地点：${draft.nodeId}。`);
    if (seen.has(draft.nodeId)) throw new Error(`AI 重复返回地点：${draft.nodeId}。`);
    seen.add(draft.nodeId);
  }
  if (seen.size !== allowed.size) throw new Error('AI 没有覆盖全部允许地点。');
  return result.highlights;
}

export function confirmGeneratedPlaceHighlights(
  highlights: readonly PlaceHighlight[],
  map: MapState,
  drafts: readonly PlaceHighlightDraft[],
  day: number,
  createId: (index: number) => string,
): PlaceHighlight[] {
  return drafts.reduce<PlaceHighlight[]>((current, draft, index) => createPlaceHighlight(current, map, draft, { id: createId(index), day, source: 'ai' }), [...highlights]);
}

function parseJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('AI 没有返回地点动态。');
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  try { return JSON.parse(fenced ?? trimmed); }
  catch { throw new Error('AI 返回的地点动态不是有效 JSON。'); }
}
