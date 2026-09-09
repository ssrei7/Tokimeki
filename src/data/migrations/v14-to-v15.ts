import type { Migration } from './types';

/** v15 adds searchable relationship-memory metadata while preserving v14 provenance. */
export const migrateV14ToV15: Migration = (input) => {
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
      entry.type ??= 'interaction';
      entry.importance ??= 'normal';
      entry.archived ??= false;
      entry.inject ??= true;
      if (!entry.source) {
        entry.source = typeof entry.sourceChatMessageIndex === 'number'
          ? { kind: 'chat', chatMessageIndex: entry.sourceChatMessageIndex }
          : { kind: 'legacy' };
      }
    }
  }

  save.schemaVersion = 15;
  return save;
};
