import type { EventBus } from '../../core/events/bus';
import type { WorldState } from '../../data/schema/save';
import type { WorkshopActivityHook, WorkshopPackageRecord } from '../../data/workshop';
import { createWorkshopActivityOpRegistry } from './engine';

type AutomaticWorkshopActivityHook = Exclude<WorkshopActivityHook, 'manual'>;

export function registerWorkshopActivityHooks(events: EventBus, records: readonly WorkshopPackageRecord[]): () => void {
  const packages = new Map(records.map((record) => [record.id, record.package]));
  const registry = createWorkshopActivityOpRegistry((packageId) => packages.get(packageId));
  const runHook = (hook: AutomaticWorkshopActivityHook, world: WorldState | undefined, coordinate: { day: number; slotId: string; nodeId: string }) => {
    if (!world) return;
    const inputs = records.flatMap((record) => record.package.rules.rules
      .filter((rule) => rule.hook === hook)
      .map((rule) => ({ op: 'run_workshop_activity', packageId: record.id, ruleId: rule.id, source: hook })));
    if (!inputs.length) return;
    const applied = registry.applyAll(inputs, {
      world,
      ...coordinate,
      log: () => undefined,
    }, inputs.length);
    if (applied.changes.length) events.emit('onOpsApply', { changes: applied.changes });
  };

  const unsubscribes = [
    events.subscribe('onEnterNode', ({ toNodeId, world }) => {
      if (!world) return;
      runHook('onEnterNode', world, { day: world.clock.day, slotId: world.clock.slotId, nodeId: toNodeId });
    }, -100),
    events.subscribe('onTimeAdvance', ({ day, toSlotId, world }) => {
      if (!world) return;
      runHook('onTimeAdvance', world, { day, slotId: toSlotId, nodeId: world.player.nodeId });
    }, -100),
    events.subscribe('onDaySettle', ({ day, world }) => {
      if (!world) return;
      runHook('onDaySettle', world, { day, slotId: world.clock.slotId, nodeId: world.player.nodeId });
    }, -100),
  ];
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}
