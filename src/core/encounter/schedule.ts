import type { FormalCharacter, NpcLite, ScheduleCell, WorldState } from '../../data/schema/save';

export interface PresentCharacter {
  id: string;
  name: string;
  tier: 'formal' | 'semi';
  nodeId: string;
  activity: string;
  source: 'schedule' | 'home';
}

export function weekdayIndex(day: number, daysPerWeek: number): number {
  const safeDays = Math.max(1, Math.floor(daysPerWeek));
  return ((Math.max(1, Math.floor(day)) - 1) % safeDays);
}

export function resolveScheduledCell(character: FormalCharacter, day: number, slotId: string, daysPerWeek: number): ScheduleCell | undefined {
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

function presentFormalCharacter(character: FormalCharacter, day: number, slotId: string, daysPerWeek: number): PresentCharacter | undefined {
  const cell = resolveScheduledCell(character, day, slotId, daysPerWeek);
  if (!cell) return undefined;
  return { id: character.id, name: character.name, tier: 'formal', nodeId: cell.nodeId, activity: cell.activity, source: character.schedule ? 'schedule' : 'home' };
}

function presentNpc(npc: NpcLite): PresentCharacter | undefined {
  if (!npc.homeNodeId) return undefined;
  return { id: npc.id, name: npc.name, tier: 'semi', nodeId: npc.homeNodeId, activity: '在附近', source: 'home' };
}

export function whoIsHere(world: WorldState, nodeId: string, day = world.clock.day, slotId = world.clock.slotId, daysPerWeek = 7): PresentCharacter[] {
  const present = Object.values(world.characters)
    .map((character) => presentFormalCharacter(character, day, slotId, daysPerWeek))
    .filter((character): character is PresentCharacter => Boolean(character && character.nodeId === nodeId));
  const semi = Object.values(world.npcs)
    .map(presentNpc)
    .filter((character): character is PresentCharacter => Boolean(character && character.nodeId === nodeId));
  return [...present, ...semi].sort((a, b) => (a.tier === b.tier ? a.id.localeCompare(b.id) : a.tier === 'formal' ? -1 : 1));
}
