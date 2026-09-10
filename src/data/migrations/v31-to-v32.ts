import type { Migration } from './types';

/** v32 turns each StoryScene outline into at least one deterministic static stage. */
export const migrateV31ToV32: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  const scenes = Array.isArray(world.storyScenes) ? world.storyScenes : [];
  world.storyScenes = scenes.map((value) => {
    const scene = (value ?? {}) as Record<string, unknown>;
    if (Array.isArray(scene.stages) && scene.stages.length > 0) return scene;
    const currentStageId = typeof scene.currentStageId === 'string' && scene.currentStageId.trim() ? scene.currentStageId : 'opening';
    const outline = typeof scene.outline === 'string' && scene.outline.trim() ? scene.outline : '剧情开始。';
    return { ...scene, currentStageId, stages: [{ id: currentStageId, title: '开场', content: outline }] };
  });
  save.world = world;
  save.schemaVersion = 32;
  return save;
};
