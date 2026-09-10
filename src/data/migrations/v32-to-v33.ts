import type { Migration } from './types';

/** v33 adds independent StoryScene reading progress and resume state. */
export const migrateV32ToV33: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  const scenes = Array.isArray(world.storyScenes) ? world.storyScenes : [];
  world.storyScenes = scenes.map((value) => {
    const scene = (value ?? {}) as Record<string, unknown>;
    const stages = Array.isArray(scene.stages) ? scene.stages : [];
    const firstStageId = typeof stages[0] === 'object' && stages[0] !== null && typeof (stages[0] as Record<string, unknown>).id === 'string'
      ? (stages[0] as Record<string, unknown>).id as string
      : 'opening';
    const readingStageId = typeof scene.readingStageId === 'string' && scene.readingStageId.trim() ? scene.readingStageId : firstStageId;
    const readStageIds = Array.isArray(scene.readStageIds) ? scene.readStageIds : [];
    return { ...scene, readingStageId, readStageIds };
  });
  save.world = world;
  save.schemaVersion = 33;
  return save;
};
