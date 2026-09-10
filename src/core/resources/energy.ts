import type { ActionCostTable, WorldState } from '../../data/schema/save';

export interface EnergyState {
  enabled: boolean;
  current: number;
  max: number;
  restRestore: number;
  statKey: string;
  enabledFlagKey: string;
}

export interface EnergyMutationResult {
  ok: boolean;
  changes: Array<{ path: string; before: unknown; after: unknown; description: string }>;
  warning?: string;
}

export function getEnergyState(world: WorldState): EnergyState | undefined {
  const rule = world.economy.energyRule;
  const current = world.player.stats[rule.statKey];
  const max = world.player.stats[rule.maxStatKey];
  const restRestore = world.player.stats[rule.restRestoreStatKey];
  if (!Number.isFinite(current) || !Number.isFinite(max) || max < 0 || !Number.isFinite(restRestore) || restRestore < 0) return undefined;
  return {
    enabled: world.player.flags[rule.enabledFlagKey] === true,
    current,
    max,
    restRestore,
    statKey: rule.statKey,
    enabledFlagKey: rule.enabledFlagKey,
  };
}

export function energyCostForAction(world: WorldState, costs: ActionCostTable, kind: string, multiplier = 1): number {
  const energy = getEnergyState(world);
  if (!energy?.enabled) return 0;
  return Math.max(0, costs[kind]?.energyCost ?? 0) * Math.max(0, multiplier);
}

export function canAffordEnergy(world: WorldState, costs: ActionCostTable, kind: string, multiplier = 1): boolean {
  const energy = getEnergyState(world);
  if (!energy) return false;
  return !energy.enabled || energy.current >= energyCostForAction(world, costs, kind, multiplier);
}

export function spendEnergyForAction(world: WorldState, costs: ActionCostTable, kind: string, multiplier = 1): EnergyMutationResult {
  const energy = getEnergyState(world);
  if (!energy) return { ok: false, changes: [], warning: '当前世界的体力规则或通用 stat 无效。' };
  if (!energy.enabled) return { ok: true, changes: [] };
  const cost = energyCostForAction(world, costs, kind, multiplier);
  if (cost > energy.current) return { ok: false, changes: [], warning: `体力不足：需要 ${cost}，当前 ${energy.current}。可以休息恢复，或在设置中关闭体力限制。` };
  if (cost === 0) return { ok: true, changes: [] };
  const after = energy.current - cost;
  world.player.stats[energy.statKey] = after;
  return { ok: true, changes: [
    { path: `world.player.stats.${energy.statKey}`, before: energy.current, after, description: `Spent ${cost} energy on ${kind}.` },
  ] };
}

export function movementEnergyKind(world: WorldState, targetNodeId: string): 'move_cross_region' | 'move_within_region' | undefined {
  const current = world.map.nodes[world.player.nodeId];
  const target = world.map.nodes[targetNodeId];
  if (!current || !target) return undefined;
  return current.regionId === target.regionId ? 'move_within_region' : 'move_cross_region';
}
