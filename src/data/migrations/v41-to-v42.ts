import type { Migration } from './types';

/** v42 allows new StoryScenes to omit deterministic time and location anchors; existing anchors remain intact. */
export const migrateV41ToV42: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  save.schemaVersion = 42;
  return save;
};
