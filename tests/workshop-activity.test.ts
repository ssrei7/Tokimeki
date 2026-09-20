import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events/bus';
import { WorkshopPackageRecordSchema, type WorkshopPackageRecord } from '../src/data/workshop';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { registerWorkshopActivityHooks, runWorkshopActivity, workshopActivityResultMessage } from '../src/features/workshop-activity';

function activityRecord(options: { hook?: 'manual' | 'onEnterNode'; when?: string; once?: boolean; cooldownDays?: number; costs?: Array<{ kind: 'stat'; target: 'player' | 'world'; key: string; amount: number; minimumAfter?: number } | { kind: 'item'; id: string; count: number }>; result?: { success: string; failure?: string }; actions?: Array<{ type: 'submit-op'; op: 'add_stat' | 'set_flag' | 'give_item' | 'take_item'; payload: Record<string, unknown> }> } = {}): WorkshopPackageRecord {
  const hook = options.hook ?? 'manual';
  const actions = options.actions ?? [{ type: 'submit-op' as const, op: 'add_stat' as const, payload: { target: 'player', key: 'fishing.skill', delta: 2 } }];
  const effectOps = [...new Set([...actions.map((action) => action.op), ...(options.costs ?? []).map((cost) => cost.kind === 'stat' ? 'add_stat' as const : 'take_item' as const)])];
  return WorkshopPackageRecordSchema.parse({
    id: 'activity.fishing',
    package: {
      manifest: {
        type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'activity.fishing', name: '钓鱼活动', author: 'Tester', version: '1.0.0',
        permissions: [{ capability: 'op.submit', resources: ['run_workshop_activity', ...effectOps] }, ...(options.when ? [{ capability: 'world.read', resources: ['player.location'] as const }] : [])],
      },
      app: {
        entryPageId: 'home', pages: [{ id: 'home', title: '钓鱼', components: hook === 'manual' ? [{ kind: 'button', label: '开始钓鱼', action: { type: 'submit-op', op: 'run_workshop_activity', payload: { ruleId: 'fish' } } }] : [{ kind: 'text', text: '到达时自动检查。' }] }],
      },
      rules: { rules: [{ id: 'fish', hook, ...(options.when ? { when: options.when } : {}), ...(options.costs ? { costs: options.costs } : {}), actions, ...(options.result ? { result: options.result } : {}), ...(options.once ? { once: true } : {}), ...(options.cooldownDays !== undefined ? { cooldownDays: options.cooldownDays } : {}) }] },
    },
    assetBindings: {}, installedAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
  });
}

function setup(record = activityRecord()) {
  const save = seedScenario(createCurrentSaveScenario({ id: 'activity-world', title: 'Activity', day: 3, slotId: 'morning' }));
  save.world.items.bait = { id: 'bait', name: '鱼饵', tags: ['fishing'], stackable: true };
  save.world.items.fish = { id: 'fish', name: '鱼', tags: ['fishing'], stackable: true };
  const context = { world: save.world, day: save.world.clock.day, slotId: save.world.clock.slotId, nodeId: save.world.player.nodeId, log: vi.fn() };
  return { save, record, context };
}

describe('workshop deterministic activities', () => {
  it('runs a validated manual rule through registered effect ops and records cooldown state', () => {
    const record = activityRecord({ cooldownDays: 1, actions: [
      { type: 'submit-op', op: 'add_stat', payload: { target: 'player', key: 'fishing.skill', delta: 2 } },
      { type: 'submit-op', op: 'give_item', payload: { id: 'fish', count: 1 } },
    ] });
    const { save, context } = setup(record);
    const applied = runWorkshopActivity(record, 'fish', 'manual', context);
    expect(applied.applied).toBe(1);
    expect(save.world.player.stats['fishing.skill']).toBe(2);
    expect(save.world.player.inventory).toContainEqual(expect.objectContaining({ itemId: 'fish', count: 1 }));
    expect(save.world.stats['workshop.activity.activity.fishing.fish.last-day']).toBe(3);
    expect(runWorkshopActivity(record, 'fish', 'manual', context).applied).toBe(0);
  });

  it('checks safe conditions and leaves the original world untouched when any effect fails', () => {
    const record = activityRecord({ when: 'player.nodeId == "start"', actions: [
      { type: 'submit-op', op: 'add_stat', payload: { target: 'player', key: 'fishing.skill', delta: 2 } },
      { type: 'submit-op', op: 'take_item', payload: { id: 'bait', count: 1 } },
    ] });
    const { save, context } = setup(record);
    const applied = runWorkshopActivity(record, 'fish', 'manual', context);
    expect(applied.applied).toBe(0);
    expect(save.world.player.stats['fishing.skill']).toBeUndefined();
    expect(save.world.player.inventory).toHaveLength(0);
  });

  it('checks aggregated stat and item costs before applying costs and rewards atomically', () => {
    const record = activityRecord({
      costs: [
        { kind: 'stat', target: 'player', key: 'energy', amount: 2, minimumAfter: 0 },
        { kind: 'item', id: 'bait', count: 1 },
      ],
      result: { success: '钓鱼完成，结果已经结算。', failure: '这次无法开始钓鱼。' },
      actions: [{ type: 'submit-op', op: 'give_item', payload: { id: 'fish', count: 1 } }],
    });
    const { save, context } = setup(record);
    save.world.player.stats.energy = 5;
    save.world.player.inventory.push({ itemId: 'bait', count: 2 });
    const applied = runWorkshopActivity(record, 'fish', 'manual', context);
    expect(applied.applied).toBe(1);
    expect(save.world.player.stats.energy).toBe(3);
    expect(save.world.player.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: 'bait', count: 1 }),
      expect.objectContaining({ itemId: 'fish', count: 1 }),
    ]));
    expect(workshopActivityResultMessage(record, 'fish', applied)).toBe('钓鱼完成，结果已经结算。');
  });

  it('rejects insufficient aggregated costs without consuming any resource or granting rewards', () => {
    const record = activityRecord({
      costs: [
        { kind: 'stat', target: 'player', key: 'energy', amount: 2, minimumAfter: 0 },
        { kind: 'stat', target: 'player', key: 'energy', amount: 2, minimumAfter: 0 },
        { kind: 'item', id: 'bait', count: 2 },
      ],
      result: { success: '完成', failure: '资源不足' },
      actions: [{ type: 'submit-op', op: 'give_item', payload: { id: 'fish', count: 1 } }],
    });
    const { save, context } = setup(record);
    save.world.player.stats.energy = 3;
    save.world.player.inventory.push({ itemId: 'bait', count: 2 });
    const rejected = runWorkshopActivity(record, 'fish', 'manual', context);
    expect(rejected.applied).toBe(0);
    expect(save.world.player.stats.energy).toBe(3);
    expect(save.world.player.inventory).toEqual([{ itemId: 'bait', count: 2 }]);
    expect(workshopActivityResultMessage(record, 'fish', rejected)).toContain('资源不足 原因：活动成本不足');
  });

  it('rolls back valid costs when a later deterministic effect is rejected', () => {
    const record = activityRecord({
      costs: [{ kind: 'item', id: 'bait', count: 1 }],
      actions: [{ type: 'submit-op', op: 'give_item', payload: { id: 'unknown-reward', count: 1 } }],
    });
    const { save, context } = setup(record);
    save.world.player.inventory.push({ itemId: 'bait', count: 1 });
    const rejected = runWorkshopActivity(record, 'fish', 'manual', context);
    expect(rejected.applied).toBe(0);
    expect(save.world.player.inventory).toEqual([{ itemId: 'bait', count: 1 }]);
  });

  it('runs enabled onEnterNode rules locally and reports their deterministic changes through onOpsApply', () => {
    const record = activityRecord({ hook: 'onEnterNode', once: true });
    const { save } = setup(record);
    const events = new EventBus();
    const observed = vi.fn();
    events.subscribe('onOpsApply', observed);
    const unsubscribe = registerWorkshopActivityHooks(events, [record]);
    events.emit('onEnterNode', { fromNodeId: 'elsewhere', toNodeId: 'start', world: save.world });
    expect(save.world.player.stats['fishing.skill']).toBe(2);
    expect(save.world.flags['workshop.activity.activity.fishing.fish.completed']).toBe(true);
    expect(observed).toHaveBeenCalledTimes(1);
    events.emit('onEnterNode', { fromNodeId: 'elsewhere', toNodeId: 'start', world: save.world });
    expect(save.world.player.stats['fishing.skill']).toBe(2);
    unsubscribe();
  });
});
