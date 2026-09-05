import { evaluateCondition } from '../expr';
import { advanceTime, availableSlots } from '../time';
import type { EventBus } from '../events/bus';
import type { CalendarConfig, MapEdge, WorldState } from '../../data/schema/save';

export interface MapOperationResult {
  ok: boolean;
  changes: Array<{ path: string; before: unknown; after: unknown; description: string }>;
  warning?: string;
  cost: number;
  fromNodeId?: string;
  toNodeId?: string;
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

  const edge = findEdge(map.edges, fromNodeId, targetNodeId);
  if (!edge) return rejected(`No reachable edge from ${fromNodeId} to ${targetNodeId}.`);
  if (target.openSlots && !target.openSlots.includes(world.clock.slotId)) {
    return rejected(`Destination ${target.name} is closed during slot ${world.clock.slotId}.`);
  }
  if (edge.condition) {
    try {
      const scope = { player: world.player, world } as unknown as Parameters<typeof evaluateCondition>[1];
      if (!evaluateCondition(edge.condition, scope)) return rejected('The route condition is not satisfied.');
    } catch (error) {
      return rejected(`Route condition could not be evaluated: ${error instanceof Error ? error.message : 'unknown error'}.`);
    }
  }

  const cost = fromNode.regionId === target.regionId ? 0 : edge.travelSlots;
  if (!calendar.unlimitedSlots && world.slotsUsedToday + cost > availableSlots(calendar)) {
    return rejected(`Not enough time slots for this move: requires ${cost}, remaining ${Math.max(0, availableSlots(calendar) - world.slotsUsedToday)}.`);
  }

  const changes: MapOperationResult['changes'] = [];
  if (cost > 0) changes.push(...advanceTime(world, calendar, cost, events).changes);
  const beforeNodeId = world.player.nodeId;
  world.player.nodeId = targetNodeId;
  const beforeVisitCount = target.visitCount;
  target.visitCount += 1;
  changes.push({ path: 'world.player.nodeId', before: beforeNodeId, after: targetNodeId, description: `Moved from ${fromNodeId} to ${targetNodeId}.` });
  changes.push({ path: `world.map.nodes.${targetNodeId}.visitCount`, before: beforeVisitCount, after: target.visitCount, description: `Visited ${target.name}.` });
  events?.emit('onEnterNode', { fromNodeId, toNodeId: targetNodeId });
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

function findEdge(edges: MapEdge[], from: string, to: string): MapEdge | undefined {
  return edges.find((edge) => (edge.from === from && edge.to === to) || (!edge.oneWay && edge.from === to && edge.to === from));
}

function rejected(warning: string): MapOperationResult {
  return { ok: false, changes: [], warning, cost: 0 };
}

export { parseGeneratedMap, parseGeneratedMapExpansion } from './generator';
