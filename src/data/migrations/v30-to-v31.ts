import type { Migration } from './types';

/** v31 adds persisted StoryScene drafts and lifecycle state. */
export const migrateV30ToV31: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!Array.isArray(world.storyScenes)) world.storyScenes = [];
  save.world = world;
  save.schemaVersion = 31;
  return save;
};
