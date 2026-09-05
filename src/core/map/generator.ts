import { z } from 'zod';
import { MapEdgeSchema, MapViewSchema, type MapState } from '../../data/schema/save';

const GeneratedNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  regionId: z.string().min(1),
  kind: z.array(z.string()).default([]),
  description: z.string().optional(),
  worldbookIds: z.array(z.string().min(1)).default([]),
  openSlots: z.array(z.string().min(1)).optional(),
  discovered: z.boolean().optional(),
  visitCount: z.number().int().nonnegative().optional(),
  memories: z.array(z.object({ id: z.string().min(1), text: z.string().min(1), day: z.number().int().positive(), charIds: z.array(z.string().min(1)), pinned: z.boolean().optional() })).default([]),
  pos: z.object({ x: z.number().finite(), y: z.number().finite() }),
  parentNodeId: z.string().min(1).optional(),
});

const GeneratedRegionSchema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().optional() });
const GeneratedMapSchema = z.object({
  regions: z.union([z.record(z.string(), GeneratedRegionSchema), z.array(GeneratedRegionSchema)]).optional(),
  nodes: z.union([z.record(z.string(), GeneratedNodeSchema), z.array(GeneratedNodeSchema)]),
  edges: z.array(MapEdgeSchema),
  view: MapViewSchema.partial().optional(),
});

export function parseGeneratedMap(text: string, currentNodeId: string): MapState {
  const raw = extractJson(text);
  const parsed = GeneratedMapSchema.parse(raw);
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : Object.values(parsed.nodes);
  if (nodes.length < 8 || nodes.length > 15) throw new Error(`地图节点数量必须在 8–15 个之间，当前为 ${nodes.length}。`);
  if (!nodes.some((node) => node.id === currentNodeId)) throw new Error(`生成地图缺少当前节点 ${currentNodeId}。`);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const regions = normalizeRegions(parsed.regions, nodes);
  for (const node of nodes) if (!regions[node.regionId]) throw new Error(`节点 ${node.id} 引用了不存在的区域 ${node.regionId}。`);
  for (const edge of parsed.edges) if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`边 ${edge.from} → ${edge.to} 引用了不存在的节点。`);
  if (!isConnected(nodes.map((node) => node.id), parsed.edges)) throw new Error('地图存在孤立节点，必须保证所有节点连通。');
  const nodeRecord: MapState['nodes'] = {};
  for (const node of nodes) nodeRecord[node.id] = {
    ...node,
    discovered: node.id === currentNodeId ? true : node.discovered ?? false,
    visitCount: node.visitCount ?? 0,
    memories: node.memories,
  };
  return {
    regions,
    nodes: nodeRecord,
    edges: parsed.edges,
    view: { mode: parsed.view?.mode ?? 'graph', background: parsed.view?.background, size: parsed.view?.size ?? { w: 1000, h: 700 } },
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf('{'); const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('地图生成结果不是有效 JSON。');
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function normalizeRegions(value: z.infer<typeof GeneratedMapSchema>['regions'], nodes: Array<z.infer<typeof GeneratedNodeSchema>>): MapState['regions'] {
  if (Array.isArray(value)) return Object.fromEntries(value.map((region) => [region.id, region]));
  if (value) return value;
  return Object.fromEntries([...new Set(nodes.map((node) => node.regionId))].map((id) => [id, { id, name: id }]));
}

function isConnected(nodeIds: string[], edges: z.infer<typeof MapEdgeSchema>[]): boolean {
  if (nodeIds.length === 0) return false;
  const adjacent = new Map(nodeIds.map((id) => [id, new Set<string>()]));
  for (const edge of edges) { adjacent.get(edge.from)?.add(edge.to); adjacent.get(edge.to)?.add(edge.from); }
  const seen = new Set<string>(); const queue = [nodeIds[0]];
  while (queue.length) { const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); for (const next of adjacent.get(id) ?? []) if (!seen.has(next)) queue.push(next); }
  return seen.size === nodeIds.length;
}
