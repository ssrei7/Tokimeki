import type { HookPoolEntry, MorningBriefEntry, WorldState } from '../../data/schema/save';

export interface HookMatch {
  hook: HookPoolEntry;
  nodeId: string;
  slotId: string;
}

export function syncLeadHooks(world: WorldState, entries: readonly MorningBriefEntry[]): number {
  let added = 0;
  for (const entry of entries) {
    if (entry.category !== 'lead' || !entry.nodeId || world.hooks.some((hook) => hook.sourceBriefId === entry.id)) continue;
    world.hooks.push({ id: `hook-${entry.id}`, sourceBriefId: entry.id, category: 'lead', title: entry.title, body: entry.body, nodeId: entry.nodeId, ...(entry.slotId ? { slotId: entry.slotId } : {}), charIds: entry.charIds, createdDay: entry.day, ...(entry.expiresDay ? { expiresDay: entry.expiresDay } : {}), status: 'available', triggerCount: 0 });
    added += 1;
  }
  return added;
}

export function settleHookPool(world: WorldState, day: number): number {
  let expired = 0;
  for (const hook of world.hooks) {
    if (hook.status === 'available' && hook.expiresDay !== undefined && day > hook.expiresDay) { hook.status = 'expired'; expired += 1; }
  }
  return expired;
}

export function findMatchingHooks(world: WorldState, nodeId: string, slotId: string, day = world.clock.day): HookMatch[] {
  settleHookPool(world, day);
  return world.hooks.filter((hook) => hook.status === 'available' && hook.nodeId === nodeId && (!hook.slotId || hook.slotId === slotId)).map((hook) => ({ hook, nodeId, slotId }));
}

export function triggerHook(world: WorldState, hookId: string): { ok: boolean; warning?: string; hook?: HookPoolEntry } {
  const hook = world.hooks.find((entry) => entry.id === hookId);
  if (!hook) return { ok: false, warning: '找不到这条世界线索。' };
  if (hook.status !== 'available') return { ok: false, warning: '这条世界线索已经触发或过期。' };
  hook.status = 'triggered';
  hook.triggerCount += 1;
  return { ok: true, hook };
}
