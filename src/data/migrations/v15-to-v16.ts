import type { Migration } from './types';

/** v16 records all chat messages that contributed to a consolidated memory. */
export const migrateV15ToV16: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  const relations = (world.relations ?? {}) as Record<string, unknown>;
  for (const relation of Object.values(relations)) {
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) continue;
    const memories = (relation as Record<string, unknown>).memories;
    if (!Array.isArray(memories)) continue;
    for (const memory of memories) {
      if (!memory || typeof memory !== 'object' || Array.isArray(memory)) continue;
      const entry = memory as Record<string, unknown>;
      const legacyIndex = entry.sourceChatMessageIndex;
      if (!Array.isArray(entry.sourceChatMessageIndices) && typeof legacyIndex === 'number') entry.sourceChatMessageIndices = [legacyIndex];
      const source = entry.source;
      if (source && typeof source === 'object' && !Array.isArray(source)) {
        const sourceRecord = source as Record<string, unknown>;
        if (!Array.isArray(sourceRecord.chatMessageIndices) && typeof sourceRecord.chatMessageIndex === 'number') sourceRecord.chatMessageIndices = [sourceRecord.chatMessageIndex];
      }
    }
  }
  save.schemaVersion = 16;
  return save;
};
