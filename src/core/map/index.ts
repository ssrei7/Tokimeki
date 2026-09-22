import { advanceTime } from '../time';
import type { EventBus } from '../events/bus';
import { MapEdgeSchema, MapNodeSchema, type AssetRef, type CalendarConfig, type MapEdge, type MapState, type WorldState } from '../../data/schema/save';

export interface MapOperationResult {
  ok: boolean;
  changes: Array<{ path: string; before: unknown; after: unknown; description: string }>;
  warning?: string;
  cost: number;
  fromNodeId?: string;
  toNodeId?: string;
}

export interface CreateMapNodeInput {
  name: string;
  description?: string;
  regionId: string;
  kind: string[];
  openSlots?: string[];
  discovered: boolean;
  pos: { x: number; y: number };
  anchorNodeId: string;
  travelSlots: number;
  worldbookIds?: string[];
  sceneBackground?: AssetRef;
}

export interface MapEditResult {
  ok: boolean;
  nodeId?: string;
  warning?: string;
}

export interface UpdateMapNodeInput {
  name: string;
  description?: string;
  regionId: string;
  kind: string[];
  openSlots?: string[];
  discovered: boolean;
  pos: { x: number; y: number };
  worldbookIds?: string[];
  sceneBackground?: AssetRef;
}

export function createMapNode(map: MapState, input: CreateMapNodeInput): MapEditResult {
  const name = input.name.trim();
  if (!name) return { ok: false, warning: '地点名称不能为空。' };
  if (!map.regions[input.regionId]) return { ok: false, warning: `区域不存在：${input.regionId}。` };
  if (!map.nodes[input.anchorNodeId]) return { ok: false, warning: `连接锚点不存在：${input.anchorNodeId}。` };
  if (!Number.isFinite(input.pos.x) || !Number.isFinite(input.pos.y)) return { ok: false, warning: '地点坐标无效。' };
  if (!Number.isInteger(input.travelSlots) || input.travelSlots < 0) return { ok: false, warning: '移动成本必须是非负整数。' };
  const baseId = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'location';
  let nodeId = baseId; let suffix = 2;
  while (map.nodes[nodeId]) { nodeId = `${baseId}-${suffix}`; suffix += 1; }
  const node = MapNodeSchema.parse({
    id: nodeId,
    name,
    regionId: input.regionId,
    kind: [...new Set(input.kind.map((value) => value.trim()).filter(Boolean))],
    description: input.description?.trim() || undefined,
    worldbookIds: [...new Set((input.worldbookIds ?? []).map((value) => value.trim()).filter(Boolean))],
    openSlots: input.openSlots?.length ? [...new Set(input.openSlots)] : undefined,
    discovered: input.discovered,
    visitCount: 0,
    memories: [],
    pos: { x: Math.max(0, Math.min(map.view.size.w, input.pos.x)), y: Math.max(0, Math.min(map.view.size.h, input.pos.y)) },
    sceneBackground: input.sceneBackground,
  });
  const edge = MapEdgeSchema.parse({ from: input.anchorNodeId, to: nodeId, travelSlots: input.travelSlots });
  map.nodes[nodeId] = node;
  map.edges.push(edge);
  return { ok: true, nodeId };
}

export function updateMapNode(map: MapState, nodeId: string, input: UpdateMapNodeInput): MapEditResult {
  const existing = map.nodes[nodeId];
  if (!existing) return { ok: false, warning: `地点不存在：${nodeId}。` };
  const name = input.name.trim();
  if (!name) return { ok: false, warning: '地点名称不能为空。' };
  if (!map.regions[input.regionId]) return { ok: false, warning: `区域不存在：${input.regionId}。` };
  if (!Number.isFinite(input.pos.x) || !Number.isFinite(input.pos.y)) return { ok: false, warning: '地点坐标无效。' };
  map.nodes[nodeId] = MapNodeSchema.parse({
    ...existing,
    name,
    description: input.description?.trim() || undefined,
    regionId: input.regionId,
    kind: [...new Set(input.kind.map((value) => value.trim()).filter(Boolean))],
    openSlots: input.openSlots?.length ? [...new Set(input.openSlots)] : undefined,
    worldbookIds: input.worldbookIds ? [...new Set(input.worldbookIds.map((value) => value.trim()).filter(Boolean))] : existing.worldbookIds,
    discovered: input.discovered,
    pos: { x: Math.max(0, Math.min(map.view.size.w, input.pos.x)), y: Math.max(0, Math.min(map.view.size.h, input.pos.y)) },
    sceneBackground: input.sceneBackground ?? existing.sceneBackground,
  });
  return { ok: true, nodeId };
}

export function deleteMapNode(map: MapState, nodeId: string, currentNodeId: string): MapEditResult {
  if (!map.nodes[nodeId]) return { ok: false, warning: `地点不存在：${nodeId}。` };
  if (nodeId === currentNodeId) return { ok: false, warning: '不能删除玩家当前位置。' };
  const remainingIds = Object.keys(map.nodes).filter((id) => id !== nodeId);
  if (remainingIds.length === 0) return { ok: false, warning: '地图至少需要保留一个地点。' };
  const remainingEdges = map.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  if (!isMapConnected(remainingIds, remainingEdges)) return { ok: false, warning: '删除该地点会使地图产生孤立区域，请先调整路线。' };
  delete map.nodes[nodeId];
  map.edges = remainingEdges;
  return { ok: true, nodeId };
}

function isMapConnected(nodeIds: string[], edges: MapEdge[]): boolean {
  if (nodeIds.length < 2) return nodeIds.length === 1;
  const adjacent = new Map(nodeIds.map((id) => [id, new Set<string>()]));
  for (const edge of edges) { adjacent.get(edge.from)?.add(edge.to); adjacent.get(edge.to)?.add(edge.from); }
  const seen = new Set<string>(); const queue = [nodeIds[0]];
  while (queue.length) { const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); for (const next of adjacent.get(id) ?? []) if (!seen.has(next)) queue.push(next); }
  return seen.size === nodeIds.length;
}

export function movePlayer(world: WorldState, calendar: CalendarConfig, targetNodeId: string, events?: EventBus): MapOperationResult {
  const map = world.map;
  const fromNodeId = world.player.nodeId;
  const fromNode = map.nodes[fromNodeId];
  const target = map.nodes[targetNodeId];
  if (!fromNode) return rejected(`Current node does not exist: ${fromNodeId}.`);
  if (!target) return rejected(`Unknown destination node: ${targetNodeId}.`);
  if (fromNodeId === targetNodeId) return { ok: true, changes: [], cost: 0, fromNodeId, toNodeId: targetNodeId, warning: 'Already at this node.' };
  if (!target.discovered) return rejected(`Destination node is hidden: ${targetNodeId}.`);

  const route = findShortestRoute(map, fromNodeId, targetNodeId);
  if (!route) return rejected(`No route from ${fromNodeId} to ${targetNodeId}.`);
  const cost = calendar.unlimitedSlots ? 0 : route.cost;

  const changes: MapOperationResult['changes'] = [];
  if (cost > 0) changes.push(...advanceTime(world, calendar, cost, events).changes);
  const beforeNodeId = world.player.nodeId;
  world.player.nodeId = targetNodeId;
  const beforeVisitCount = target.visitCount;
  target.visitCount += 1;
  changes.push({ path: 'world.player.nodeId', before: beforeNodeId, after: targetNodeId, description: `Moved from ${fromNodeId} to ${targetNodeId}.` });
  changes.push({ path: `world.map.nodes.${targetNodeId}.visitCount`, before: beforeVisitCount, after: target.visitCount, description: `Visited ${target.name}.` });
  const enterPayload = { fromNodeId, toNodeId: targetNodeId };
  Object.defineProperty(enterPayload, 'world', { value: world, enumerable: false });
  events?.emit('onEnterNode', enterPayload);
  return { ok: true, changes, cost, fromNodeId, toNodeId: targetNodeId };
}

export function revealNode(world: WorldState, nodeId: string): MapOperationResult {
  const node = world.map.nodes[nodeId];
  if (!node) return rejected(`Unknown node: ${nodeId}.`);
  if (node.discovered) return { ok: true, changes: [], cost: 0, toNodeId: nodeId, warning: 'Node is already revealed.' };
  node.discovered = true;
  return {
    ok: true,
    changes: [{ path: `world.map.nodes.${nodeId}.discovered`, before: false, after: true, description: `Revealed ${node.name}.` }],
    cost: 0,
    toNodeId: nodeId,
  };
}

/** Reveal the first undiscovered node directly adjacent to the player's location. */
export function revealAdjacentNode(world: WorldState): MapOperationResult {
  const currentNodeId = world.player.nodeId;
  const currentNode = world.map.nodes[currentNodeId];
  if (!currentNode) return rejected(`Current node does not exist: ${currentNodeId}.`);

  const candidates = new Set<string>();
  for (const edge of world.map.edges) {
    const nextNodeId = edge.from === currentNodeId ? edge.to : edge.to === currentNodeId ? edge.from : undefined;
    if (nextNodeId && world.map.nodes[nextNodeId] && !world.map.nodes[nextNodeId].discovered) candidates.add(nextNodeId);
  }
  const targetNodeId = [...candidates].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))[0];
  if (!targetNodeId) return { ok: true, changes: [], cost: 0, warning: 'No undiscovered adjacent node.' };
  return revealNode(world, targetNodeId);
}

function findShortestRoute(map: MapState, fromNodeId: string, toNodeId: string): { cost: number } | undefined {
  const distances = new Map<string, number>(Object.keys(map.nodes).map((id) => [id, id === fromNodeId ? 0 : Number.POSITIVE_INFINITY]));
  const pending = new Set(distances.keys());
  while (pending.size) {
    let current: string | undefined; let currentDistance = Number.POSITIVE_INFINITY;
    for (const id of pending) { const distance = distances.get(id) ?? Number.POSITIVE_INFINITY; if (distance < currentDistance) { current = id; currentDistance = distance; } }
    if (!current || !Number.isFinite(currentDistance)) break;
    if (current === toNodeId) return { cost: currentDistance };
    pending.delete(current);
    for (const edge of map.edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;
      if (!next || !pending.has(next)) continue;
      const from = map.nodes[current]; const to = map.nodes[next];
      if (!from || !to) continue;
      const edgeCost = from.regionId === to.regionId ? 0 : edge.travelSlots;
      const candidate = currentDistance + edgeCost;
      if (candidate < (distances.get(next) ?? Number.POSITIVE_INFINITY)) distances.set(next, candidate);
    }
  }
  return undefined;
}

function rejected(warning: string): MapOperationResult {
  return { ok: false, changes: [], warning, cost: 0 };
}

export { parseGeneratedMap, parseGeneratedMapExpansion, parseGeneratedNodeSuggestion } from './generator';
