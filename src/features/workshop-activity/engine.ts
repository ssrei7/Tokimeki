import { z } from 'zod';
import { evaluateCondition, type ConditionScope } from '../../core/expr';
import { createDefaultOpRegistry } from '../../core/ops';
import { OpRegistry } from '../../core/ops/registry';
import type { ApplyOpsResult, Change, OpContext, OpResult } from '../../core/ops/types';
import type { WorkshopActivityCost, WorkshopPackage, WorkshopPackageRecord, WorkshopRule } from '../../data/workshop';
import { validateWorkshopPackage, WORKSHOP_ACTIVITY_EFFECT_OPS } from '../../data/workshop';

const RunWorkshopActivitySchema = z.object({
  op: z.literal('run_workshop_activity'),
  packageId: z.string().min(1),
  ruleId: z.string().min(1),
  source: z.enum(['manual', 'onEnterNode']),
}).strict();

type PackageResolver = (packageId: string) => WorkshopPackage | undefined;

export function createWorkshopActivityOpRegistry(resolvePackage: PackageResolver): OpRegistry {
  const registry = new OpRegistry();
  registry.register({
    op: 'run_workshop_activity',
    schema: RunWorkshopActivitySchema,
    clamp: {},
    promptDoc: 'run_workshop_activity is an internal declarative package command and is not exposed to narrative providers.',
    describe: (payload) => `run workshop activity ${payload.packageId}.${payload.ruleId}`,
    apply: (payload, context) => applyActivity(resolvePackage(payload.packageId), payload, context),
  });
  return registry;
}

export function runWorkshopActivity(record: WorkshopPackageRecord, ruleId: string, source: 'manual' | 'onEnterNode', context: OpContext): ApplyOpsResult {
  const registry = createWorkshopActivityOpRegistry((packageId) => packageId === record.id ? record.package : undefined);
  return registry.applyAll([{ op: 'run_workshop_activity', packageId: record.id, ruleId, source }], context, 1);
}

export function workshopActivityResultMessage(record: WorkshopPackageRecord, ruleId: string, result: ApplyOpsResult): string {
  const rule = record.package.rules.rules.find((candidate) => candidate.id === ruleId);
  if (result.applied === 1) {
    const base = rule?.result?.success ?? '活动已由确定性内核完成。';
    return result.warnings.length ? `${base} 校验提示：${result.warnings.join(' ')}` : base;
  }
  const reason = result.rejected[0]?.reason ?? result.warnings[0] ?? '活动未能执行。';
  return rule?.result?.failure ? `${rule.result.failure} 原因：${reason}` : reason;
}

function applyActivity(pack: WorkshopPackage | undefined, payload: z.infer<typeof RunWorkshopActivitySchema>, context: OpContext): OpResult {
  if (!pack || pack.manifest.id !== payload.packageId) return rejected('活动包未安装或未为当前世界启用。');
  const report = validateWorkshopPackage(pack);
  if (!report.canInstall) return rejected(`活动包运行时校验失败：${report.issues.find((issue) => issue.severity === 'error')?.message ?? '未知错误'}`);
  const rule = pack.rules.rules.find((candidate) => candidate.id === payload.ruleId);
  if (!rule) return rejected(`找不到活动规则：${payload.ruleId}。`);
  if (rule.hook !== payload.source) return rejected(`活动规则 ${rule.id} 不允许通过 ${payload.source} 触发。`);

  const state = activityStateKeys(pack.manifest.id, rule.id);
  if (rule.once && context.world.flags[state.completed] === true) return rejected('这项活动已经完成。');
  const lastDay = context.world.stats[state.lastDay];
  if (rule.cooldownDays !== undefined && Number.isFinite(lastDay) && context.day <= lastDay + rule.cooldownDays) {
    return rejected(`这项活动仍在冷却中，最早可在第 ${lastDay + rule.cooldownDays + 1} 天再次进行。`);
  }
  if (rule.when && !matchesRule(rule, context)) return rejected('当前世界事实不满足这项活动的条件。');

  const effects = rule.actions.map((action) => {
    if (action.type !== 'submit-op' || !WORKSHOP_ACTIVITY_EFFECT_OPS.includes(action.op as typeof WORKSHOP_ACTIVITY_EFFECT_OPS[number])) return undefined;
    return { ...action.payload, op: action.op };
  });
  if (effects.some((effect) => effect === undefined)) return rejected('活动规则包含未开放的效果。');

  const costError = validateActivityCosts(rule.costs, context);
  if (costError) return rejected(costError);
  const costs = rule.costs.map((cost) => activityCostOp(cost));

  const workingWorld = structuredClone(context.world);
  const effectRegistry = createDefaultOpRegistry();
  const operations = [...costs, ...effects];
  const applied = effectRegistry.applyAll(operations, { ...context, world: workingWorld, events: undefined }, operations.length);
  if (applied.applied !== operations.length || applied.rejected.length || applied.truncated) {
    return rejected(applied.rejected[0]?.reason ?? applied.warnings[0] ?? '活动效果未能完整应用。');
  }

  const stateChanges = recordActivityState(workingWorld.stats, workingWorld.flags, state, rule, context.day);
  replaceWorld(context.world, workingWorld);
  return { ok: true, changes: [...applied.changes, ...stateChanges], ...(applied.warnings.length ? { warning: applied.warnings.join(' ') } : {}) };
}

function activityCostOp(cost: WorkshopActivityCost): Record<string, unknown> {
  return cost.kind === 'stat'
    ? { op: 'add_stat', target: cost.target, key: cost.key, delta: -cost.amount }
    : { op: 'take_item', id: cost.id, count: cost.count };
}

function validateActivityCosts(costs: readonly WorkshopActivityCost[], context: OpContext): string | undefined {
  const statCosts = new Map<string, { target: 'player' | 'world'; key: string; amount: number; minimumAfter: number }>();
  const itemCosts = new Map<string, number>();
  for (const cost of costs) {
    if (cost.kind === 'item') {
      itemCosts.set(cost.id, (itemCosts.get(cost.id) ?? 0) + cost.count);
      continue;
    }
    const id = `${cost.target}:${cost.key}`;
    const current = statCosts.get(id);
    statCosts.set(id, {
      target: cost.target,
      key: cost.key,
      amount: (current?.amount ?? 0) + cost.amount,
      minimumAfter: Math.max(current?.minimumAfter ?? Number.NEGATIVE_INFINITY, cost.minimumAfter),
    });
  }
  for (const cost of statCosts.values()) {
    const stats = cost.target === 'player' ? context.world.player.stats : context.world.stats;
    const before = stats[cost.key] ?? 0;
    if (before - cost.amount < cost.minimumAfter) return `活动成本不足：${cost.target}.stats.${cost.key} 需要 ${cost.amount}，扣除后不得低于 ${cost.minimumAfter}。`;
  }
  for (const [itemId, count] of itemCosts) {
    const owned = context.world.player.inventory.find((item) => item.itemId === itemId)?.count ?? 0;
    if (owned < count) return `活动成本不足：物品 ${context.world.items[itemId]?.name ?? itemId} 需要 ${count}，当前只有 ${owned}。`;
  }
  return undefined;
}

function matchesRule(rule: WorkshopRule, context: OpContext): boolean {
  try {
    return evaluateCondition(rule.when ?? 'true', {
      day: context.day,
      slotId: context.slotId,
      nodeId: context.nodeId,
      stats: context.world.stats,
      flags: context.world.flags,
      player: { nodeId: context.world.player.nodeId, stats: context.world.player.stats, flags: context.world.player.flags },
      relations: context.world.relations,
    } as unknown as ConditionScope);
  } catch {
    return false;
  }
}

function activityStateKeys(packageId: string, ruleId: string): { completed: string; lastDay: string } {
  const prefix = `workshop.activity.${packageId}.${ruleId}`;
  return { completed: `${prefix}.completed`, lastDay: `${prefix}.last-day` };
}

function recordActivityState(stats: Record<string, number>, flags: Record<string, boolean>, keys: ReturnType<typeof activityStateKeys>, rule: WorkshopRule, day: number): Change[] {
  const changes: Change[] = [];
  if (rule.cooldownDays !== undefined) {
    const before = stats[keys.lastDay];
    stats[keys.lastDay] = day;
    changes.push({ path: `world.stats.${keys.lastDay}`, before, after: day, description: `Recorded activity ${rule.id} on day ${day}.` });
  }
  if (rule.once) {
    const before = flags[keys.completed];
    flags[keys.completed] = true;
    changes.push({ path: `world.flags.${keys.completed}`, before, after: true, description: `Completed one-time activity ${rule.id}.` });
  }
  return changes;
}

function replaceWorld(target: OpContext['world'], source: OpContext['world']): void {
  for (const key of Object.keys(target)) delete (target as unknown as Record<string, unknown>)[key];
  Object.assign(target, source);
}

function rejected(warning: string): OpResult {
  return { ok: false, changes: [], warning };
}
