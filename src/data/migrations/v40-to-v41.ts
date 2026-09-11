import { DEFAULT_TERMINAL_STATE } from '../schema/save';
import type { Migration } from './types';

/** v41 adds persistent terminal appointment proposals without changing existing terminal facts. */
export const migrateV40ToV41: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world && typeof save.world === 'object' && !Array.isArray(save.world)
    ? save.world
    : {}) as Record<string, unknown>;
  const terminal = (world.terminal && typeof world.terminal === 'object' && !Array.isArray(world.terminal)
    ? world.terminal
    : {}) as Record<string, unknown>;
  if (!Array.isArray(terminal.appointmentRequests)) terminal.appointmentRequests = structuredClone(DEFAULT_TERMINAL_STATE.appointmentRequests);
  world.terminal = terminal;
  save.world = world;
  save.schemaVersion = 41;
  return save;
};
