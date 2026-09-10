import { describe, expect, it } from 'vitest';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { createDefaultOpRegistry } from '../src/core/ops';
import { createEconomyOpRegistry } from '../src/features/economy';
import { canAffordEnergy, createEnergyOpRegistry, energyCostForAction, getEnergyState, movementEnergyKind, registerEnergyOps } from '../src/features/energy';

function setup() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'energy', title: 'Energy' }));
  const context = {
    world: save.world,
    day: save.world.clock.day,
    slotId: save.world.clock.slotId,
    nodeId: save.world.player.nodeId,
    actionCosts: save.config.actionCosts,
    calendar: save.config.calendar,
    log: () => undefined,
  };
  return { save, context };
}

describe('stage 8 stat-backed energy slice', () => {
  it('reads energy entirely from configured stats and a flag', () => {
    const { save } = setup();
    expect(getEnergyState(save.world)).toMatchObject({ enabled: true, current: 6, max: 6, restRestore: 2, statKey: 'energy' });
    expect(energyCostForAction(save.world, save.config.actionCosts, 'explore')).toBe(1);
    expect(energyCostForAction(save.world, save.config.actionCosts, 'work')).toBe(2);
  });

  it('deducts configured action costs and rejects overspending without changing the stat', () => {
    const { save, context } = setup();
    const registry = createEnergyOpRegistry();
    expect(registry.applyAll([{ op: 'spend_energy', kind: 'explore' }], context, 1).applied).toBe(1);
    expect(save.world.player.stats.energy).toBe(5);
    save.world.player.stats.energy = 0;
    const rejected = registry.applyAll([{ op: 'spend_energy', kind: 'work' }], context, 1);
    expect(rejected.rejected[0]?.reason).toContain('体力不足');
    expect(save.world.player.stats.energy).toBe(0);
    expect(canAffordEnergy(save.world, save.config.actionCosts, 'work')).toBe(false);
  });

  it('restores through the configured stat and clamps to the configured maximum', () => {
    const { save, context } = setup();
    const registry = createEnergyOpRegistry();
    save.world.player.stats.energy = 5;
    registry.applyAll([{ op: 'restore_energy' }], context, 1);
    expect(save.world.player.stats.energy).toBe(6);
    save.world.player.stats.energy = 1;
    registry.applyAll([{ op: 'restore_energy' }], context, 1);
    expect(save.world.player.stats.energy).toBe(3);
  });

  it('preserves the numeric state while the flag disables all energy costs', () => {
    const { save, context } = setup();
    const registry = createEnergyOpRegistry();
    registry.applyAll([{ op: 'set_energy_enabled', enabled: false }], context, 1);
    expect(getEnergyState(save.world)?.enabled).toBe(false);
    expect(energyCostForAction(save.world, save.config.actionCosts, 'work')).toBe(0);
    registry.applyAll([{ op: 'spend_energy', kind: 'work' }], context, 1);
    expect(save.world.player.stats.energy).toBe(6);
    registry.applyAll([{ op: 'set_energy_enabled', enabled: true }], context, 1);
    expect(getEnergyState(save.world)?.enabled).toBe(true);
  });

  it('records enabling an absent flag as a real deterministic change', () => {
    const { save, context } = setup();
    const registry = createEnergyOpRegistry();
    delete save.world.player.flags['economy.energy.enabled'];
    const applied = registry.applyAll([{ op: 'set_energy_enabled', enabled: true }], context, 1);
    expect(applied.changes).toHaveLength(1);
    expect(applied.changes[0]).toMatchObject({ before: false, after: true });
    expect(getEnergyState(save.world)?.enabled).toBe(true);
  });

  it('derives movement energy kinds from deterministic map regions', () => {
    const { save } = setup();
    save.world.map.nodes.market = { id: 'market', name: '市场', regionId: 'start-region', kind: ['commercial'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 200, y: 200 } };
    save.world.map.regions.harbor = { id: 'harbor', name: '港区' };
    save.world.map.nodes.docks = { id: 'docks', name: '码头', regionId: 'harbor', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 800, y: 200 } };
    expect(movementEnergyKind(save.world, 'market')).toBe('move_within_region');
    expect(movementEnergyKind(save.world, 'docks')).toBe('move_cross_region');
    expect(movementEnergyKind(save.world, 'missing')).toBeUndefined();
  });

  it('combines work energy and the deterministic job op in one local transaction', () => {
    const { save, context } = setup();
    const registry = createEconomyOpRegistry();
    registerEnergyOps(registry);
    registry.applyAll([{ op: 'accept_job', nodeId: 'start' }], context, 1);
    const applied = registry.applyAll([{ op: 'spend_energy', kind: 'work' }, { op: 'work_job' }], context, 2);
    expect(applied.applied).toBe(2);
    expect(save.world.player.stats.energy).toBe(4);
    expect(Object.keys(save.world.player.flags).some((key) => key.includes('.worked.1'))).toBe(true);
  });

  it('enforces the same costs for narrative advance_time and move_player proposals', () => {
    const { save, context } = setup();
    const registry = createDefaultOpRegistry();
    expect(registry.applyAll([{ op: 'advance_time', kind: 'explore', slots: 2 }], context, 1).applied).toBe(1);
    expect(save.world.player.stats.energy).toBe(4);
    save.world.map.regions.harbor = { id: 'harbor', name: '港区' };
    save.world.map.nodes.docks = { id: 'docks', name: '码头', regionId: 'harbor', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 800, y: 200 } };
    save.world.map.edges.push({ from: 'start', to: 'docks', travelSlots: 1 });
    expect(registry.applyAll([{ op: 'move_player', nodeId: 'docks' }], context, 1).applied).toBe(1);
    expect(save.world.player.stats.energy).toBe(3);
    save.world.player.stats.energy = 0;
    const beforeClock = structuredClone(save.world.clock);
    const rejected = registry.applyAll([{ op: 'advance_time', kind: 'work' }], context, 1);
    expect(rejected.rejected[0]?.reason).toContain('体力不足');
    expect(save.world.clock).toEqual(beforeClock);
  });

  it('rejects narrative movement when the cost table is unavailable', () => {
    const { save, context } = setup();
    const registry = createDefaultOpRegistry();
    save.world.map.nodes.market = { id: 'market', name: '市场', regionId: 'start-region', kind: ['commercial'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 200, y: 200 } };
    save.world.map.edges.push({ from: 'start', to: 'market', travelSlots: 0 });
    const { actionCosts: _actionCosts, ...contextWithoutCosts } = context;
    const rejected = registry.applyAll([{ op: 'move_player', nodeId: 'market' }], contextWithoutCosts, 1);
    expect(rejected.rejected[0]?.reason).toContain('Action costs are unavailable');
    expect(save.world.player.nodeId).toBe('start');
  });
});
