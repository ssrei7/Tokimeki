import type { Migration } from './types';

/** v14 adds optional provenance to relationship memories; existing memories remain valid. */
export const migrateV13ToV14: Migration = (input) => ({ ...(input as Record<string, unknown>), schemaVersion: 14 });
