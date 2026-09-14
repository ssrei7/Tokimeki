import type { EventPackage } from './content';
import type { SaveFile } from './schema/save';
import { validateConditionSyntax } from '../core/expr';

export interface EventPackageAuditIssue {
  severity: 'error' | 'warning';
  eventId?: string;
  message: string;
}

export interface EventPackageAuditReport {
  errors: EventPackageAuditIssue[];
  warnings: EventPackageAuditIssue[];
}

/** Local, deterministic checks for event package references before installation. */
export function auditEventPackage(pack: EventPackage, save: SaveFile): EventPackageAuditReport {
  const errors: EventPackageAuditIssue[] = [];
  const warnings: EventPackageAuditIssue[] = [];
  const nodeIds = new Set(Object.keys(save.world.map.nodes));
  const characterIds = new Set([...Object.keys(save.world.characters), ...Object.keys(save.world.npcs)]);
  const stageIds = new Set(save.config.stageRules.map((rule) => rule.id));
  for (const event of pack.events) {
    for (const nodeId of event.trigger.nodeIds ?? []) if (!nodeIds.has(nodeId)) errors.push({ severity: 'error', eventId: event.id, message: `引用了不存在的地图节点：${nodeId}` });
    for (const charId of event.trigger.charIds ?? []) if (!characterIds.has(charId)) errors.push({ severity: 'error', eventId: event.id, message: `引用了不存在的角色或 NPC：${charId}` });
    for (const stageId of [event.stageRange?.min, event.stageRange?.max].filter(Boolean) as string[]) if (!stageIds.has(stageId)) errors.push({ severity: 'error', eventId: event.id, message: `引用了不存在的关系阶段：${stageId}` });
    if (event.when) {
      try { validateConditionSyntax(event.when); }
      catch (error) { errors.push({ severity: 'error', eventId: event.id, message: `when 条件语法无效：${error instanceof Error ? error.message : String(error)}` }); }
    }
    if (!(event.trigger.nodeIds?.length || event.trigger.slotIds?.length || event.trigger.charIds?.length)) warnings.push({ severity: 'warning', eventId: event.id, message: '触发条件没有限定地点、时段或角色，可能在很多位置触发。' });
    if (event.trigger.slotIds?.some((slotId) => !save.config.calendar.slots.some((slot) => slot.id === slotId))) warnings.push({ severity: 'warning', eventId: event.id, message: '触发条件包含当前日历中不存在的时段，可能永远不会触发。' });
  }
  return { errors, warnings };
}

