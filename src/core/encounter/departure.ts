import type { EncounterDeparture, EncounterLogEntry, WorldState } from '../../data/schema/save';

export interface DepartureResult {
  ok: boolean;
  changes: Array<{ path: string; before: unknown; after: unknown; description: string }>;
  warning?: string;
}

export function proposeDeparture(
  world: WorldState,
  entryId: string,
  kind: EncounterDeparture['kind'],
  speakerId?: string,
  reason?: string,
): DepartureResult {
  const located = locate(world, entryId);
  if (!located) return rejected(`Unknown encounter: ${entryId}.`);
  const { entry, index } = located;
  if (entry.departure?.status === 'pending') return rejected('This encounter already has a pending departure.');
  if (entry.departure?.status === 'left') return rejected('This encounter has already ended.');
  if (kind === 'character_request' && (!speakerId || !entry.characterIds.includes(speakerId))) return rejected('Departure speaker must be a participant in this encounter.');
  if (kind === 'player_farewell' && speakerId) return rejected('Player farewell cannot name a character speaker.');
  const departure: EncounterDeparture = {
    kind,
    status: 'pending',
    ...(speakerId ? { speakerId } : {}),
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
    requestedDay: world.clock.day,
  };
  const before = entry.departure;
  entry.departure = departure;
  return changed(`world.encounterLog.${index}.departure`, before, departure, `Departure proposed for encounter ${entryId}.`);
}

export function resolveDeparture(world: WorldState, entryId: string, outcome: Extract<EncounterDeparture['status'], 'stayed' | 'left'>): DepartureResult {
  const located = locate(world, entryId);
  if (!located) return rejected(`Unknown encounter: ${entryId}.`);
  const { entry, index } = located;
  if (!entry.departure || entry.departure.status !== 'pending') return rejected('This encounter has no pending departure.');
  const before = structuredClone(entry.departure);
  entry.departure.status = outcome;
  entry.departure.resolvedDay = world.clock.day;
  const changes = [changed(`world.encounterLog.${index}.departure`, before, structuredClone(entry.departure), `Departure resolved as ${outcome}.`).changes[0]];
  if (outcome === 'left' && entry.outcome !== 'urgent_leave') {
    const previous = entry.outcome;
    entry.outcome = 'urgent_leave';
    changes.push(changed(`world.encounterLog.${index}.outcome`, previous, entry.outcome, `Encounter ${entryId} ended after departure.`).changes[0]);
  }
  return { ok: true, changes };
}

function locate(world: WorldState, entryId: string): { entry: EncounterLogEntry; index: number } | undefined {
  const index = world.encounterLog.findIndex((entry) => entry.id === entryId);
  return index < 0 ? undefined : { entry: world.encounterLog[index], index };
}

function changed(path: string, before: unknown, after: unknown, description: string): DepartureResult {
  return { ok: true, changes: [{ path, before, after, description }] };
}

function rejected(warning: string): DepartureResult {
  return { ok: false, changes: [], warning };
}

