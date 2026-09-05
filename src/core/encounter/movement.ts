import { ScheduleSchema, type WorldState } from '../../data/schema/save';

export interface MoveNpcResult {
  ok: boolean;
  changes: Array<{ path: string; before: unknown; after: unknown; description: string }>;
  warning?: string;
}

export function moveNpc(world: WorldState, charId: string, nodeId: string, day = world.clock.day, slotId = world.clock.slotId, activity?: string): MoveNpcResult {
  const character = world.characters[charId];
  if (!character) return rejected(`Unknown formal character: ${charId}.`);
  if (!world.map.nodes[nodeId]) return rejected(`Unknown destination node: ${nodeId}.`);
  const safeDay = Math.max(1, Math.floor(day));
  const key = `${safeDay}:${slotId}`;
  const schedule = character.schedule ?? ScheduleSchema.parse({ grid: {}, overrides: {} });
  const before = schedule.overrides[key];
  const after = { nodeId, activity: activity?.trim() || '临时停留' };
  character.schedule = schedule;
  schedule.overrides[key] = after;
  return {
    ok: true,
    changes: [{ path: `world.characters.${charId}.schedule.overrides.${key}`, before, after, description: `Moved ${character.name} to ${world.map.nodes[nodeId].name} for day ${safeDay}, slot ${slotId}.` }],
  };
}

function rejected(warning: string): MoveNpcResult {
  return { ok: false, changes: [], warning };
}
