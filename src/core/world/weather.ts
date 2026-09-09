import type { Weather, WorldState } from '../../data/schema/save';

export interface WeatherGate {
  all?: string[];
  any?: string[];
  none?: string[];
}

export function weatherForDay(world: WorldState, day = world.clock.day): Weather | undefined {
  return (world.morningUpdates ?? []).find((update) => update.day === day)?.weather;
}

export function weatherHasTag(world: WorldState, tag: string, day = world.clock.day): boolean {
  const normalized = tag.trim().toLocaleLowerCase();
  return Boolean(normalized && weatherForDay(world, day)?.tags.some((item) => item.toLocaleLowerCase() === normalized));
}

/** Pure event gate: required tags must be present, forbidden tags must be absent. */
export function weatherAllows(world: WorldState, gate: WeatherGate | undefined, day = world.clock.day): boolean {
  if (!gate) return true;
  const tags = new Set((weatherForDay(world, day)?.tags ?? []).map((tag) => tag.toLocaleLowerCase()));
  const all = (gate.all ?? []).map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean);
  const any = (gate.any ?? []).map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean);
  const none = (gate.none ?? []).map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean);
  if (all.some((tag) => !tags.has(tag))) return false;
  if (any.length > 0 && !any.some((tag) => tags.has(tag))) return false;
  if (none.some((tag) => tags.has(tag))) return false;
  return true;
}
