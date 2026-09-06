import type { EncounterLogEntry, WorldState } from '../../data/schema/save';

export interface EncounterTrace {
  day: number;
  daysAgo: number;
  characterIds: string[];
  characterNames: string[];
  trigger: EncounterLogEntry['trigger'];
  scope: EncounterLogEntry['scope'];
  outcome: EncounterLogEntry['outcome'];
}

export function recentEncounterTraces(world: WorldState, nodeId: string, currentDay = world.clock.day, maxAgeDays = 3, maxEntries = 3): EncounterTrace[] {
  const day = Math.max(1, Math.floor(currentDay));
  const age = Math.max(0, Math.floor(maxAgeDays));
  const limit = Math.max(0, Math.floor(maxEntries));
  if (!limit || !age) return [];
  const names = new Map<string, string>([
    ...Object.values(world.characters).map((character) => [character.id, character.name] as const),
    ...Object.values(world.npcs).map((npc) => [npc.id, npc.name] as const),
  ]);
  return world.encounterLog
    .map((entry) => ({ entry, daysAgo: day - entry.day }))
    .filter(({ entry, daysAgo }) => entry.nodeId === nodeId && daysAgo > 0 && daysAgo <= age)
    .sort((a, b) => b.entry.day - a.entry.day)
    .slice(0, limit)
    .map(({ entry, daysAgo }) => ({
      day: entry.day,
      daysAgo,
      characterIds: entry.characterIds,
      characterNames: entry.characterIds.map((id) => names.get(id) ?? id),
      trigger: entry.trigger,
      scope: entry.scope,
      outcome: entry.outcome,
    }));
}
