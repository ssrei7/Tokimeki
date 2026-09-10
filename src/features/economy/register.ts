import type { EventBus } from '../../core/events/bus';
import type { OpRegistry } from '../../core/ops/registry';

export function registerEconomyHooks(events: EventBus, registry: OpRegistry): () => void {
  return events.subscribe('onDaySettle', ({ day, settlement, world }) => {
    if (!world || !settlement) return;
    registry.applyAll([{ op: 'settle_rent' }, { op: 'settle_job_wage' }, { op: 'settle_shop_day' }], {
      world,
      day,
      slotId: world.clock.slotId,
      nodeId: world.player.nodeId,
      settlement,
      log: () => undefined,
    }, 3);
  }, 100);
}
