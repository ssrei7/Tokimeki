import type { EncounterConfig, EncounterLogEntry, WorldState } from '../../data/schema/save';
import { whoIsHere, type PresentCharacter } from './schedule';

export const NPC_PREFERENCE_MAX_MATCHES = 4;
export const NPC_PREFERENCE_BOOST_PER_MATCH = 0.35;
export const NPC_PREFERENCE_AVOID_PENALTY_PER_MATCH = 0.2;
export const NPC_PREFERENCE_MIN_FACTOR = 0.35;
export const NPC_PREFERENCE_MAX_FACTOR = 2.4;

export interface EncounterCandidate extends PresentCharacter {
  weight: number;
  daysSinceLastEncounter: number;
  homeDistance: number | null;
}

export interface EncounterSelectionOptions {
  world: WorldState;
  config: EncounterConfig;
  nodeId: string;
  day?: number;
  slotId?: string;
  daysPerWeek?: number;
  seed?: number;
}

/**
 * Selects a deterministic encounter set from people already present at a node.
 * This function is pure: it never mutates the world or encounter log.
 */
export function selectEncounterCandidates(options: EncounterSelectionOptions): EncounterCandidate[] {
  const { world, config } = options;
  if (!config.enabled || config.maxParticipants < 1) return [];
  const day = Math.max(1, Math.floor(options.day ?? world.clock.day));
  const slotId = options.slotId ?? world.clock.slotId;
  const daysPerWeek = Math.max(1, Math.floor(options.daysPerWeek ?? 7));
  const present = whoIsHere(world, options.nodeId, day, slotId, daysPerWeek);
  const candidates = present
    .map((person) => buildCandidate(world, config, person, options.nodeId, day))
    .filter((candidate): candidate is EncounterCandidate => candidate !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!candidates.length) return [];

  const limit = Math.min(Math.floor(config.maxParticipants), candidates.length);
  const selected: EncounterCandidate[] = [];
  const guaranteed = [...candidates]
    .filter((candidate) => config.guaranteeAfterDays > 0 && candidate.daysSinceLastEncounter >= config.guaranteeAfterDays)
    .sort((a, b) => b.daysSinceLastEncounter - a.daysSinceLastEncounter || b.weight - a.weight || a.id.localeCompare(b.id));
  if (guaranteed[0]) selected.push(guaranteed[0]);

  const remaining = candidates.filter((candidate) => !selected.some((item) => item.id === candidate.id));
  const rng = createRng(hashSeed(options.seed ?? 0, day, slotId, options.nodeId));
  while (selected.length < limit && remaining.length) {
    const total = remaining.reduce((sum, candidate) => sum + candidate.weight, 0);
    if (!(total > 0)) break;
    let cursor = rng() * total;
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i += 1) {
      cursor -= remaining[i].weight;
      if (cursor <= 0) { index = i; break; }
    }
    selected.push(remaining.splice(index, 1)[0]);
  }
  return selected;
}

function buildCandidate(world: WorldState, config: EncounterConfig, person: PresentCharacter, nodeId: string, day: number): EncounterCandidate | undefined {
  const configuredWeight = config.weights[person.id] ?? 1;
  if (!Number.isFinite(configuredWeight) || configuredWeight <= 0) return undefined;
  const homeNodeId = person.tier === 'formal' ? world.characters[person.id]?.homeNodeId : world.npcs[person.id]?.homeNodeId;
  const homeDistance = homeNodeId ? graphDistance(world, homeNodeId, nodeId) : null;
  const proximityFactor = homeDistance === 0 ? 1.5 : homeDistance === 1 ? 1.2 : 1;
  const presenceFactor = person.source === 'schedule' ? 3 : 1;
  const daysSinceLastEncounter = daysSinceEncounter(world.encounterLog, person.id, day);
  const guarantee = Math.max(1, config.guaranteeAfterDays);
  const absenceFactor = 1 + Math.min(daysSinceLastEncounter, guarantee) / guarantee;
  const preferenceFactor = person.tier === 'semi' ? npcPreferenceFactor(world, person.id) : 1;
  return {
    ...person,
    weight: Number((configuredWeight * presenceFactor * proximityFactor * absenceFactor * preferenceFactor).toFixed(6)),
    daysSinceLastEncounter,
    homeDistance,
  };
}

function npcPreferenceFactor(world: WorldState, npcId: string): number {
  const preferences = world.director?.preferences;
  const npc = world.npcs[npcId];
  if (!preferences || !npc) return 1;
  const preferred = new Set(preferences.npcPreferenceTags.map(normalizeTag).filter(Boolean));
  const avoided = new Set(preferences.avoidTags.map(normalizeTag).filter(Boolean));
  if (!preferred.size && !avoided.size) return 1;
  const tags = new Set(npc.tags.map(normalizeTag).filter(Boolean));
  const preferredMatches = [...tags].filter((tag) => preferred.has(tag)).length;
  const avoidedMatches = [...tags].filter((tag) => avoided.has(tag)).length;
  const boost = 1 + Math.min(preferredMatches, NPC_PREFERENCE_MAX_MATCHES) * NPC_PREFERENCE_BOOST_PER_MATCH;
  const penalty = Math.max(NPC_PREFERENCE_MIN_FACTOR, 1 - Math.min(avoidedMatches, NPC_PREFERENCE_MAX_MATCHES) * NPC_PREFERENCE_AVOID_PENALTY_PER_MATCH);
  return Math.max(NPC_PREFERENCE_MIN_FACTOR, Math.min(NPC_PREFERENCE_MAX_FACTOR, boost * penalty));
}

function normalizeTag(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function daysSinceEncounter(log: EncounterLogEntry[], characterId: string, day: number): number {
  let latest = 0;
  for (const entry of log) if (entry.characterIds.includes(characterId) && entry.day <= day) latest = Math.max(latest, entry.day);
  return latest > 0 ? Math.max(0, day - latest) : day;
}

function graphDistance(world: WorldState, fromNodeId: string, toNodeId: string): number | null {
  if (!world.map.nodes[fromNodeId] || !world.map.nodes[toNodeId]) return null;
  if (fromNodeId === toNodeId) return 0;
  const distances = new Map<string, number>([[fromNodeId, 0]]);
  const queue = [fromNodeId];
  while (queue.length) {
    const current = queue.shift()!;
    const distance = distances.get(current)!;
    for (const edge of world.map.edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;
      if (!next || distances.has(next)) continue;
      if (next === toNodeId) return distance + 1;
      distances.set(next, distance + 1);
      queue.push(next);
    }
  }
  return null;
}

function hashSeed(seed: number, day: number, slotId: string, nodeId: string): number {
  let hash = (Math.floor(seed) >>> 0) ^ (Math.floor(day) >>> 0);
  for (const value of `${slotId}:${nodeId}`) hash = Math.imul(hash ^ value.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function encounterRoll(seed: number, day: number, slotId: string, nodeId: string, salt = ''): number {
  return createRng(hashSeed(seed, day, slotId, `${nodeId}:${salt}`))();
}

function createRng(seed: number): () => number {
  let state = seed || 0x9e3779b9;
  return () => {
    state = Math.imul(state ^ (state >>> 16), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 0x100000000;
  };
}
