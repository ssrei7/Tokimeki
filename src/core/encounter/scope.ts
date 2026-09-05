import type { MapNode } from '../../data/schema/save';

export type NodeScope = 'formal' | 'peripheral';

export function deriveNodeScope(node: MapNode | undefined, slotId: string): NodeScope {
  if (!node) return 'peripheral';
  return !node.openSlots || node.openSlots.includes(slotId) ? 'formal' : 'peripheral';
}

export function nodeScopeLabel(scope: NodeScope): string {
  return scope === 'formal' ? '正式进入范围' : '附近外围范围';
}
