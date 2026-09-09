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
  relation.memories = relation.memories.filter((memory) => {
    const indices = memory.sourceChatMessageIndices ?? memory.source?.chatMessageIndices;
    if (indices?.some((index) => index >= messageIndex)) return false;
    return memory.sourceChatMessageIndex === undefined || memory.sourceChatMessageIndex < messageIndex;
  });
  return before - relation.memories.length;
}

export function updateRelationshipMemory(world: WorldState, charId: string, memoryId: string, patch: { text?: string; type?: string; importance?: string }): { ok: boolean; warning?: string } {
  const memory = world.relations[charId]?.memories.find((item) => item.id === memoryId);
  if (!memory) return { ok: false, warning: '找不到这条关系记忆。' };
  if (patch.text !== undefined) {
    const text = patch.text.trim();
    if (!text) return { ok: false, warning: '记忆内容不能为空。' };
    memory.text = text;
  }
  if (patch.type !== undefined) memory.type = patch.type as typeof memory.type;
  if (patch.importance !== undefined) memory.importance = patch.importance as typeof memory.importance;
  return { ok: true };
}

export function setRelationshipMemoryArchived(world: WorldState, charId: string, memoryId: string, archived: boolean): { ok: boolean; warning?: string } {
  const memory = world.relations[charId]?.memories.find((item) => item.id === memoryId);
  if (!memory) return { ok: false, warning: '找不到这条关系记忆。' };
  memory.archived = archived;
  return { ok: true };
}

export function setRelationshipMemoryInject(world: WorldState, charId: string, memoryId: string, inject: boolean): { ok: boolean; warning?: string } {
  const memory = world.relations[charId]?.memories.find((item) => item.id === memoryId);
  if (!memory) return { ok: false, warning: '找不到这条关系记忆。' };
  memory.inject = inject;
  return { ok: true };
}
