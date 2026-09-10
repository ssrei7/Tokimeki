import { z } from 'zod';
import { OpRegistry } from '../../core/ops/registry';
import type { OpContext, OpResult } from '../../core/ops/types';
import { getEnergyState, spendEnergyForAction } from '../../core/resources/energy';

const SpendEnergySchema = z.object({
  op: z.literal('spend_energy'),
  kind: z.string().min(1),
});

const RestoreEnergySchema = z.object({
  op: z.literal('restore_energy'),
});

const SetEnergyEnabledSchema = z.object({
  op: z.literal('set_energy_enabled'),
  enabled: z.boolean(),
});

export function createEnergyOpRegistry(): OpRegistry {
  const registry = new OpRegistry();
  registerEnergyOps(registry);
  return registry;
}

export function registerEnergyOps(registry: OpRegistry): void {
  registry.register({
    op: 'spend_energy',
    schema: SpendEnergySchema,
    clamp: {},
    promptDoc: 'spend_energy is a local action-cost command and is not exposed to narrative providers.',
    describe: (payload) => `spend energy for ${payload.kind}`,
    apply: (payload, context) => spendEnergy(payload.kind, context),
  });
  registry.register({
    op: 'restore_energy',
    schema: RestoreEnergySchema,
    clamp: {},
    promptDoc: 'restore_energy is a local rest command and is not exposed to narrative providers.',
    describe: () => 'restore energy through rest',
    apply: (_payload, context) => restoreEnergy(context),
  });
  registry.register({
    op: 'set_energy_enabled',
    schema: SetEnergyEnabledSchema,
    clamp: {},
    promptDoc: 'set_energy_enabled is a local settings command and is not exposed to narrative providers.',
    describe: (payload) => `${payload.enabled ? 'enable' : 'disable'} energy costs`,
    apply: (payload, context) => setEnergyEnabled(payload.enabled, context),
  });
}

function spendEnergy(kind: string, context: OpContext): OpResult {
  if (!context.actionCosts) return rejected('缺少行动成本表，无法结算体力。');
  return spendEnergyForAction(context.world, context.actionCosts, kind);
}

function restoreEnergy(context: OpContext): OpResult {
  const energy = getEnergyState(context.world);
  if (!energy) return rejected('当前世界的体力规则或通用 stat 无效。');
  if (!energy.enabled || energy.restRestore === 0 || energy.current >= energy.max) return { ok: true, changes: [] };
  const after = Math.min(energy.max, energy.current + energy.restRestore);
  context.world.player.stats[energy.statKey] = after;
  return { ok: true, changes: [
    { path: `world.player.stats.${energy.statKey}`, before: energy.current, after, description: `Restored energy to ${after}.` },
  ] };
}

function setEnergyEnabled(enabled: boolean, context: OpContext): OpResult {
  const energy = getEnergyState(context.world);
  if (!energy) return rejected('当前世界的体力规则或通用 stat 无效。');
  const before = context.world.player.flags[energy.enabledFlagKey] === true;
  context.world.player.flags[energy.enabledFlagKey] = enabled;
  return { ok: true, changes: before === enabled ? [] : [
    { path: `world.player.flags.${energy.enabledFlagKey}`, before, after: enabled, description: `${enabled ? 'Enabled' : 'Disabled'} energy costs.` },
  ] };
}

function rejected(warning: string): OpResult {
  return { ok: false, changes: [], warning };
}
