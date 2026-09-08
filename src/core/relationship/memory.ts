import type { WorldState } from '../../data/schema/save';

export function deleteRelationshipMemory(world: WorldState, charId: string, memoryId: string): { ok: boolean; warning?: string } {
  const relation = world.relations[charId];
  if (!relation) return { ok: false, warning: '当前角色还没有关系记忆。' };
  const index = relation.memories.findIndex((memory) => memory.id === memoryId);
  if (index < 0) return { ok: false, warning: '找不到这条关系记忆。' };
  relation.memories.splice(index, 1);
  return { ok: true };
}
