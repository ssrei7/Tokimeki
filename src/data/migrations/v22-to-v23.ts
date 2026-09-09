import type { Migration } from './types';

/** v23 adds the deterministic local event pool, schedule queue and minimal event history. */
export const migrateV22ToV23: Migration = (input) => {
  const save = structuredClone(input) as Record<string, unknown>;
  const world = (save.world ?? {}) as Record<string, unknown>;
  if (!world.eventDefs || typeof world.eventDefs !== 'object' || Array.isArray(world.eventDefs)) world.eventDefs = {};
  if (!world.director || typeof world.director !== 'object' || Array.isArray(world.director)) {
    world.director = { scheduled: [], lastFiredDay: {}, tension: 0 };
  } else {
    const director = world.director as Record<string, unknown>;
    if (!Array.isArray(director.scheduled)) director.scheduled = [];
    if (!director.lastFiredDay || typeof director.lastFiredDay !== 'object' || Array.isArray(director.lastFiredDay)) director.lastFiredDay = {};
    if (typeof director.tension !== 'number' || !Number.isFinite(director.tension)) director.tension = 0;
  }
  if (!Array.isArray(world.eventHistory)) world.eventHistory = [];
  save.world = world;
  save.schemaVersion = 23;
  return save;
};
