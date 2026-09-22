import type { FormalCharacter, NpcLite, ScheduleCell, WorldState } from '../../data/schema/save';

export interface PresentCharacter {
  id: string;
  name: string;
  tier: 'formal' | 'semi';
  nodeId: string;
  activity: string;
  source: 'schedule' | 'home' | 'roaming';
}

const ROAMING_CHANCE_PERCENT = 45;

export function weekdayIndex(day: number, daysPerWeek: number): number {
  const safeDays = Math.max(1, Math.floor(daysPerWeek));
  return ((Math.max(1, Math.floor(day)) - 1) % safeDays);
}

type ScheduledPerson = Pick<FormalCharacter | NpcLite, 'schedule' | 'homeNodeId'>;

export function resolveScheduledCell(character: ScheduledPerson, day: number, slotId: string, daysPerWeek: number): ScheduleCell | undefined {
  const schedule = character.schedule;
  if (schedule) {
    const override = schedule.overrides[`${day}:${slotId}`];
    if (override) return override;
    const weekly = schedule.grid[`${weekdayIndex(day, daysPerWeek)}:${slotId}`];
    if (weekly) return weekly;
  }
  if (character.homeNodeId) return { nodeId: character.homeNodeId, activity: '在附近' };
  return undefined;
}

function explicitScheduleCell(character: ScheduledPerson, day: number, slotId: string, daysPerWeek: number): ScheduleCell | undefined {
  const schedule = character.schedule;
  if (!schedule) return undefined;
  return schedule.overrides[`${day}:${slotId}`] ?? schedule.grid[`${weekdayIndex(day, daysPerWeek)}:${slotId}`];
}

export function resolveRoamingCell(world: WorldState, personId: string, day = world.clock.day, slotId = world.clock.slotId): ScheduleCell | undefined {
  if (world.slotsUsedToday <= 0 || day !== world.clock.day || slotId !== world.clock.slotId) return undefined;
  const nodes = Object.values(world.map.nodes).filter((node) => node.discovered).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  if (!nodes.length) return undefined;
  const seed = stableHash(`${personId}:${Math.max(1, Math.floor(day))}:${slotId}`);
  if (seed % 100 >= ROAMING_CHANCE_PERCENT) return undefined;
  return { nodeId: nodes[stableHash(`${personId}:${Math.max(1, Math.floor(day))}:${slotId}:node`) % nodes.length].id, activity: '临时漫游' };
}

function presentFormalCharacter(world: WorldState, character: FormalCharacter, day: number, slotId: string, daysPerWeek: number): PresentCharacter | undefined {
  const scheduled = explicitScheduleCell(character, day, slotId, daysPerWeek);
  const roaming = scheduled ? undefined : resolveRoamingCell(world, character.id, day, slotId);
  const cell = scheduled ?? roaming ?? (character.homeNodeId ? { nodeId: character.homeNodeId, activity: '在附近' } : undefined);
  if (!cell) return undefined;
  return { id: character.id, name: character.name, tier: 'formal', nodeId: cell.nodeId, activity: cell.activity, source: scheduled ? 'schedule' : roaming ? 'roaming' : 'home' };
}

function presentNpc(world: WorldState, npc: NpcLite, day: number, slotId: string, daysPerWeek: number): PresentCharacter | undefined {
  const scheduled = explicitScheduleCell(npc, day, slotId, daysPerWeek);
  const roaming = scheduled ? undefined : resolveRoamingCell(world, npc.id, day, slotId);
  const cell = scheduled ?? roaming ?? (npc.homeNodeId ? { nodeId: npc.homeNodeId, activity: '在附近' } : undefined);
  if (!cell) return undefined;
  return { id: npc.id, name: npc.name, tier: 'semi', nodeId: cell.nodeId, activity: cell.activity, source: scheduled ? 'schedule' : roaming ? 'roaming' : 'home' };
}

export function whoIsWhere(world: WorldState, day = world.clock.day, slotId = world.clock.slotId, daysPerWeek = 7): PresentCharacter[] {
  const present = Object.values(world.characters)
    .map((character) => presentFormalCharacter(world, character, day, slotId, daysPerWeek))
    .filter((character): character is PresentCharacter => Boolean(character));
  const semi = Object.values(world.npcs)
    .map((npc) => presentNpc(world, npc, day, slotId, daysPerWeek))
    .filter((character): character is PresentCharacter => Boolean(character));
  return [...present, ...semi].sort((a, b) => (a.tier === b.tier ? a.id.localeCompare(b.id) : a.tier === 'formal' ? -1 : 1));
}

export function whoIsHere(world: WorldState, nodeId: string, day = world.clock.day, slotId = world.clock.slotId, daysPerWeek = 7): PresentCharacter[] {
  return whoIsWhere(world, day, slotId, daysPerWeek).filter((character) => character.nodeId === nodeId);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
