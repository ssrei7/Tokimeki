import type { EventBus } from '../../core/events/bus';
import type { WorkshopPackageRecord } from '../../data/workshop';
import { createWorkshopActivityOpRegistry } from './engine';

export function registerWorkshopActivityHooks(events: EventBus, records: readonly WorkshopPackageRecord[]): () => void {
  const packages = new Map(records.map((record) => [record.id, record.package]));
  const registry = createWorkshopActivityOpRegistry((packageId) => packages.get(packageId));
  return events.subscribe('onEnterNode', ({ toNodeId, world }) => {
    if (!world) return;
    const inputs = records.flatMap((record) => record.package.rules.rules
      .filter((rule) => rule.hook === 'onEnterNode')
      .map((rule) => ({ op: 'run_workshop_activity', packageId: record.id, ruleId: rule.id, source: 'onEnterNode' as const })));
    if (!inputs.length) return;
    const applied = registry.applyAll(inputs, {
      world,
      day: world.clock.day,
      slotId: world.clock.slotId,
      nodeId: toNodeId,
      log: () => undefined,
    }, inputs.length);
    if (applied.changes.length) events.emit('onOpsApply', { changes: applied.changes });
  }, -100);
}
