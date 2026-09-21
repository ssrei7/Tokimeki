import type { Migration } from './types';

/** v44 adds save-local director preferences without changing scheduled events or tension. */
export const migrateV43ToV44: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = save.world as Record<string, unknown> | undefined;
  const director = world?.director as Record<string, unknown> | undefined;
  if (director && (!director.preferences || typeof director.preferences !== 'object' || Array.isArray(director.preferences))) {
    director.preferences = {
      storyDirection: '',
      toneTags: [],
      pace: 'slice_of_life',
      playerRoleNotes: '',
      npcPreferenceTags: [],
      avoidTags: [],
      shortTermGoal: '',
      focusCharacterIds: [],
    };
  }
  save.schemaVersion = 44;
  return save;
};
