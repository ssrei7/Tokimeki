import type { Migration } from './types';

export const migrateV9ToV10: Migration = (input) => ({
  ...((input ?? {}) as Record<string, unknown>),
  schemaVersion: 10,
});

