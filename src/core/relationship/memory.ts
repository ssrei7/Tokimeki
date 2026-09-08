import type { WorldState } from '../../data/schema/save';

export function deleteRelationshipMemory(world: WorldState, charId: string, memoryId: string): { ok: boolean; warning?: string } {
  const relation = world.relations[charId];
  if (!relation) return { ok: false, warning: '当前角色还没有关系记忆。' };
  const index = relation.memories.findIndex((memory) => memory.id === memoryId);
  if (index < 0) return { ok: false, warning: '找不到这条关系记忆。' };
  relation.memories.splice(index, 1);
  return { ok: true };
}

export function removeRelationshipMemoriesFromMessage(world: WorldState, charId: string, messageIndex: number): number {
  const relation = world.relations[charId];
  if (!relation) return 0;
  const before = relation.memories.length;
  relation.memories = relation.memories.filter((memory) => memory.sourceChatMessageIndex === undefined || memory.sourceChatMessageIndex < messageIndex);
  return before - relation.memories.length;
}
