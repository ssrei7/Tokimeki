import { DEFAULT_TERMINAL_STATE } from '../schema/save';
import type { Migration } from './types';

/** v39 reserves the local terminal persistence containers. */
export const migrateV38ToV39: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world && typeof save.world === 'object' && !Array.isArray(save.world)
    ? save.world
    : {}) as Record<string, unknown>;
  const terminal = world.terminal;
  if (!terminal || typeof terminal !== 'object' || Array.isArray(terminal)) {
    world.terminal = structuredClone(DEFAULT_TERMINAL_STATE);
  }
  save.world = world;
  save.schemaVersion = 39;
  return save;
};
