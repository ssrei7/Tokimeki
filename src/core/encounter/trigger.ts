import type { EventBus } from '../events/bus';
import type { EncounterConfig, EncounterLogEntry, WorldState } from '../../data/schema/save';
import { deriveNodeScope } from './scope';
import { encounterRoll, selectEncounterCandidates, type EncounterCandidate } from './selection';
import { weatherAllows, type WeatherGate } from '../world/weather';

export interface EncounterTriggerOptions {
  nodeId: string;
  trigger: EncounterLogEntry['trigger'];
  day?: number;
  slotId?: string;
  daysPerWeek?: number;
  seed?: number;
  outcome?: EncounterLogEntry['outcome'];
  events?: EventBus;
  weatherGate?: WeatherGate;
}

export interface EncounterTriggerResult {
  triggered: boolean;
  candidates: EncounterCandidate[];
  entry?: EncounterLogEntry;
  changes: Array<{ path: string; before: unknown; after: unknown; description: string }>;
}

export interface EncounterOutcomeResult {
  ok: boolean;
  changes: Array<{ path: string; before: unknown; after: unknown; description: string }>;
  warning?: string;
}

/** Resolve and record one encounter without making any provider/API call. */
export function triggerEncounter(world: WorldState, config: EncounterConfig, options: EncounterTriggerOptions): EncounterTriggerResult {
  const day = Math.max(1, Math.floor(options.day ?? world.clock.day));
  const slotId = options.slotId ?? world.clock.slotId;
  if (!config.enabled || (options.trigger !== 'enter' && !config.triggerOnLeave)) return emptyResult();
  if (world.player.nodeId !== options.nodeId) return emptyResult();
  if (!weatherAllows(world, options.weatherGate, day)) return emptyResult();
  const candidates = selectEncounterCandidates({ world, config, nodeId: options.nodeId, day, slotId, daysPerWeek: options.daysPerWeek, seed: options.seed });
  if (!candidates.length) return emptyResult();
  const guaranteed = config.guaranteeAfterDays > 0 && candidates.some((candidate) => candidate.daysSinceLastEncounter >= config.guaranteeAfterDays);
  if (options.trigger !== 'enter' && !guaranteed && encounterRoll(options.seed ?? 0, day, slotId, options.nodeId, options.trigger) >= Math.max(0, Math.min(1, config.leaveProbability))) return { triggered: false, candidates, changes: [] };
  const node = world.map.nodes[options.nodeId];
  if (!node) return emptyResult();
  const scope = deriveNodeScope(node, slotId);
  const entry: EncounterLogEntry = {
    id: `encounter-${day}-${slotId}-${world.encounterLog.length + 1}`,
    day,
    slotId,
    nodeId: options.nodeId,
    characterIds: candidates.map((candidate) => candidate.id).slice(0, 3),
    trigger: options.trigger,
    scope,
    outcome: options.outcome ?? 'continued',
  };
  const before = world.encounterLog.length;
  world.encounterLog.push(entry);
  options.events?.emit('onEncounter', { characterIds: entry.characterIds, nodeId: entry.nodeId });
  return {
    triggered: true,
    candidates,
    entry,
    changes: [{ path: 'world.encounterLog', before, after: world.encounterLog.length, description: `Encountered ${entry.characterIds.join(', ')} at ${entry.nodeId}.` }],
  };
}

export function updateEncounterOutcome(world: WorldState, entryId: string, outcome: EncounterLogEntry['outcome']): EncounterOutcomeResult {
  const index = world.encounterLog.findIndex((entry) => entry.id === entryId);
  if (index < 0) return { ok: false, changes: [], warning: `Unknown encounter: ${entryId}.` };
  const entry = world.encounterLog[index];
  if (entry.outcome === outcome) return { ok: true, changes: [] };
  const before = entry.outcome;
  entry.outcome = outcome;
  return {
    ok: true,
    changes: [{ path: `world.encounterLog.${index}.outcome`, before, after: outcome, description: `Encounter ${entryId} outcome changed to ${outcome}.` }],
  };
}

function emptyResult(): EncounterTriggerResult {
  return { triggered: false, candidates: [], changes: [] };
}
