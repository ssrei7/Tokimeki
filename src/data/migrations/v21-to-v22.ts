import type { Migration } from './types';

/** v22 adds a local presentation style for the morning world brief. */
export const migrateV21ToV22: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const config = (save.config ?? {}) as Record<string, unknown>;
  if (typeof config.morningStyle !== 'string') config.morningStyle = 'newspaper';
  save.config = config;
  save.schemaVersion = 22;
  return save;
};
