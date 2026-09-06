import type { CalendarConfig, EncounterConfig, WorldState } from '../data/schema/save';
import { triggerEncounter } from '../core/encounter';

export interface EncounterSimulationOptions {
  seeds?: number[];
  days?: number;
  startDay?: number;
  nodeIds?: string[];
}

export interface EncounterCharacterStats {
  id: string;
  name: string;
  encounters: number;
  maxUnseenDays: number;
}

export interface EncounterSeedReport {
  seed: number;
  days: number;
  totalEncounters: number;
  characters: EncounterCharacterStats[];
}

export interface EncounterDistributionReport {
  days: number;
  seeds: number[];
  runs: EncounterSeedReport[];
  aggregate: EncounterCharacterStats[];
}

/**
 * Runs deterministic, provider-free encounter simulations over a cloned world.
 * Each seed wanders among discovered nodes once per configured slot and records
 * only the encounters selected by the local kernel.
 */
export function simulateEncounterDistribution(world: WorldState, calendar: CalendarConfig, config: EncounterConfig, options: EncounterSimulationOptions = {}): EncounterDistributionReport {
  const days = Math.max(1, Math.floor(options.days ?? 60));
  const seeds = options.seeds?.length ? options.seeds.map((seed) => Math.floor(seed)) : Array.from({ length: 20 }, (_, index) => index + 1);
  const nodeIds = (options.nodeIds?.length ? options.nodeIds : Object.values(world.map.nodes).filter((node) => node.discovered).map((node) => node.id)).filter((id) => Boolean(world.map.nodes[id]));
  const runs = seeds.map((seed) => simulateEncounterSeed(world, calendar, config, { seed, days, startDay: options.startDay ?? world.clock.day, nodeIds }));
  const roster = Object.values({ ...world.characters, ...world.npcs });
  const aggregate = roster.map((character) => {
    const stats = runs.map((run) => run.characters.find((item) => item.id === character.id)).filter((item): item is EncounterCharacterStats => Boolean(item));
    return {
      id: character.id,
      name: character.name,
      encounters: stats.reduce((sum, item) => sum + item.encounters, 0),
      maxUnseenDays: Math.max(0, ...stats.map((item) => item.maxUnseenDays)),
    };
  });
  return { days, seeds, runs, aggregate };
}

function simulateEncounterSeed(world: WorldState, calendar: CalendarConfig, config: EncounterConfig, options: { seed: number; days: number; startDay: number; nodeIds: string[] }): EncounterSeedReport {
  const copy = structuredClone(world);
  copy.encounterLog = [];
  const roster = Object.values({ ...copy.characters, ...copy.npcs });
  const stats = new Map(roster.map((character) => [character.id, { id: character.id, name: character.name, encounters: 0, maxUnseenDays: 0 }]));
  if (!options.nodeIds.length || !stats.size) return { seed: options.seed, days: options.days, totalEncounters: 0, characters: [...stats.values()] };
  const slots = [...calendar.slots].sort((a, b) => a.order - b.order).slice(0, Math.max(1, calendar.slots.length));
  let randomState = (Math.abs(options.seed) + 1) >>> 0;
  const nextRandom = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };
  for (let dayOffset = 0; dayOffset < options.days; dayOffset += 1) {
    const day = options.startDay + dayOffset;
    for (const slot of slots) {
      const nodeId = options.nodeIds[Math.floor(nextRandom() * options.nodeIds.length)] ?? options.nodeIds[0];
      copy.player.nodeId = nodeId;
      copy.clock = { day, slotId: slot.id };
      const result = triggerEncounter(copy, config, { nodeId, trigger: 'enter', day, slotId: slot.id, daysPerWeek: calendar.daysPerWeek, seed: nextRandom() * 0xffffffff });
      if (!result.triggered || !result.entry) continue;
      for (const characterId of result.entry.characterIds) {
        const item = stats.get(characterId);
        if (!item) continue;
        const previous = [...copy.encounterLog].slice(0, -1).reverse().find((entry) => entry.characterIds.includes(characterId));
        const previousDay = previous?.day ?? options.startDay - 1;
        item.maxUnseenDays = Math.max(item.maxUnseenDays, day - previousDay - 1);
        item.encounters += 1;
      }
    }
  }
  for (const item of stats.values()) {
    const latest = [...copy.encounterLog].reverse().find((entry) => entry.characterIds.includes(item.id));
    const latestDay = latest?.day ?? options.startDay - 1;
    item.maxUnseenDays = Math.max(item.maxUnseenDays, options.startDay + options.days - 1 - latestDay);
  }
  return { seed: options.seed, days: options.days, totalEncounters: copy.encounterLog.length, characters: [...stats.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
