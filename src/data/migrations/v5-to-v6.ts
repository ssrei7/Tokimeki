import type { Migration } from './types';

export const migrateV5ToV6: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = isRecord(old.world) ? old.world : {};
  const player = isRecord(world.player) ? world.player : {};
  return {
    ...old,
    schemaVersion: 6,
    world: { ...world, player: { ...player, ...(typeof player.personaId === 'string' && player.personaId ? { personaId: player.personaId } : {}) } },
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
