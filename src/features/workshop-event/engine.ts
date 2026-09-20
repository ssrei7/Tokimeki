import { whoIsHere } from '../../core/encounter/schedule';
import { resolveEventChoice, scheduleEvent, triggerScheduledEvent } from '../../core/events';
import { createDefaultOpRegistry } from '../../core/ops';
import type { ApplyOpsResult, Change } from '../../core/ops/types';
import type { EventDef, SaveFile } from '../../data/schema/save';
import { validateWorkshopPackage, type WorkshopPackageRecord } from '../../data/workshop';

const WORKSHOP_EVENT_PACK_PREFIX = 'workshop.';

export interface WorkshopEventRunResult {
  ok: boolean;
  message: string;
  changes: Change[];
  warnings: string[];
  historyId?: string;
}

export interface WorkshopEventSyncResult {
  changed: boolean;
  installed: number;
  removed: number;
  warnings: string[];
}

export function workshopEventPackId(packageId: string): string {
  return `${WORKSHOP_EVENT_PACK_PREFIX}${packageId}`;
}

export function workshopPackageIdFromEvent(event: EventDef | undefined): string | undefined {
  if (!event?.packId?.startsWith(WORKSHOP_EVENT_PACK_PREFIX)) return undefined;
  const packageId = event.packId.slice(WORKSHOP_EVENT_PACK_PREFIX.length);
  return packageId || undefined;
}

export function syncWorkshopEventDefinitions(save: SaveFile, records: readonly WorkshopPackageRecord[]): WorkshopEventSyncResult {
  const warnings: string[] = [];
  const desired = new Map<string, { event: EventDef; packageId: string }>();
  const blocked = new Set<string>();
  for (const record of records) {
    const report = validateWorkshopPackage(record.package);
    if (!report.canInstall) {
      warnings.push(`工坊包 ${record.id} 未通过运行时校验，事件未安装。`);
      continue;
    }
    for (const event of record.package.events?.events ?? []) {
      const referenceError = eventReferenceError(event, save);
      if (referenceError) {
        warnings.push(`工坊事件 ${record.id}.${event.id} 未安装：${referenceError}`);
        continue;
      }
      const existing = desired.get(event.id);
      if (existing && existing.packageId !== record.id) {
        blocked.add(event.id);
        warnings.push(`工坊事件 ID 冲突：${existing.packageId}.${event.id} 与 ${record.id}.${event.id}。`);
        continue;
      }
      desired.set(event.id, { event, packageId: record.id });
    }
  }
  blocked.forEach((eventId) => desired.delete(eventId));

  let installed = 0;
  let removed = 0;
  let changed = false;
  for (const [eventId, current] of Object.entries(save.world.eventDefs)) {
    const owner = workshopPackageIdFromEvent(current);
    if (!owner || desired.has(eventId)) continue;
    delete save.world.eventDefs[eventId];
    save.world.director.scheduled = save.world.director.scheduled.filter((item) => item.eventId !== eventId);
    removed += 1;
    changed = true;
  }

  for (const [eventId, entry] of desired) {
    const current = save.world.eventDefs[eventId];
    const owner = workshopPackageIdFromEvent(current);
    if (current && owner !== entry.packageId) {
      warnings.push(`工坊事件 ${entry.packageId}.${eventId} 与当前世界已有事件冲突，未覆盖。`);
      continue;
    }
    const installedEvent = installedEventDef(entry.event, entry.packageId);
    if (JSON.stringify(current) === JSON.stringify(installedEvent)) continue;
    save.world.eventDefs[eventId] = installedEvent;
    installed += 1;
    changed = true;
  }
  return { changed, installed, removed, warnings };
}

export function runWorkshopEvent(record: WorkshopPackageRecord, eventId: string, save: SaveFile): WorkshopEventRunResult {
  const validationError = runtimeValidationError(record);
  if (validationError) return rejected(validationError);
  const event = record.package.events?.events.find((candidate) => candidate.id === eventId);
  if (!event) return rejected(`找不到包内事件：${eventId}。`);
  if (!hasPermission(record, 'event.install', eventId) || !hasPermission(record, 'event.trigger', eventId)) return rejected(`事件 ${eventId} 缺少安装或触发权限。`);
  if (!event.content?.trim() && !event.choices?.length) return rejected('当前事件只有 prompt，必须等待工坊 Prompt 能力开放后才能运行。');
  const referenceError = eventReferenceError(event, save);
  if (referenceError) return rejected(referenceError);
  const current = save.world.eventDefs[eventId];
  const owner = workshopPackageIdFromEvent(current);
  if (current && owner !== record.id) return rejected(`事件 ID 与当前世界已有定义冲突：${eventId}。`);

  const workingWorld = structuredClone(save.world);
  workingWorld.eventDefs[eventId] = installedEventDef(event, record.id);
  const requiredParticipants = event.trigger.charIds ?? [];
  const presentIds = new Set(whoIsHere(workingWorld, workingWorld.player.nodeId, workingWorld.clock.day, workingWorld.clock.slotId, save.config.calendar.daysPerWeek).map((person) => person.id));
  const missingParticipant = requiredParticipants.find((characterId) => !presentIds.has(characterId));
  if (missingParticipant) return rejected(`事件所需角色当前不在场：${missingParticipant}。`);
  const coordinate = {
    nodeId: workingWorld.player.nodeId,
    day: workingWorld.clock.day,
    slotId: workingWorld.clock.slotId,
    ...(requiredParticipants.length ? { charIds: requiredParticipants } : {}),
    stageRules: save.config.stageRules,
  };
  const scheduled = scheduleEvent(workingWorld, eventId, coordinate);
  if (!scheduled.ok || !scheduled.scheduled) return rejected(scheduled.warning ?? `事件 ${eventId} 当前不能排程。`);
  if (workingWorld.eventHistory.some((entry) => entry.id === `event-history-${scheduled.scheduled!.id}`)) return rejected('这个事件在当前时间地点已经触发过。');
  const triggered = triggerScheduledEvent(workingWorld, scheduled.scheduled.id, { charIds: requiredParticipants, stageRules: save.config.stageRules });
  if (!triggered.ok || !triggered.history) return rejected(triggered.warning ?? `事件 ${eventId} 当前不能触发。`);
  const applied = applyEventOps(triggered.ops, workingWorld, save);
  if (!opsFullyApplied(triggered.ops, applied)) return rejected(firstApplyError(applied));
  replaceWorld(save.world, workingWorld);
  const message = triggered.content?.trim() || `事件「${event.title}」已触发。`;
  return { ok: true, message, changes: applied.changes, warnings: applied.warnings, historyId: triggered.history.id };
}

export function runWorkshopEventChoice(record: WorkshopPackageRecord, historyId: string, choiceId: string, save: SaveFile): WorkshopEventRunResult {
  const validationError = runtimeValidationError(record);
  if (validationError) return rejected(validationError);
  const history = save.world.eventHistory.find((entry) => entry.id === historyId);
  if (!history) return rejected('找不到事件回顾。');
  const installed = save.world.eventDefs[history.eventId];
  if (workshopPackageIdFromEvent(installed) !== record.id) return rejected('事件不属于当前已启用的工坊包。');
  const declared = record.package.events?.events.find((event) => event.id === history.eventId);
  if (!declared) return rejected(`当前包不再声明事件：${history.eventId}。`);
  if (!hasPermission(record, 'event.install', history.eventId) || !hasPermission(record, 'event.trigger', history.eventId)) return rejected(`事件 ${history.eventId} 缺少安装或触发权限。`);

  const workingWorld = structuredClone(save.world);
  const resolved = resolveEventChoice(workingWorld, historyId, choiceId);
  if (!resolved.ok || !resolved.history) return rejected(resolved.warning ?? '事件选择无法执行。');
  const applied = applyEventOps(resolved.ops, workingWorld, save, resolved.history.day, resolved.history.slotId, resolved.history.nodeId);
  if (!opsFullyApplied(resolved.ops, applied)) return rejected(firstApplyError(applied));
  replaceWorld(save.world, workingWorld);
  return { ok: true, message: resolved.choice?.resultSummary ?? resolved.choice?.narrative ?? '事件选择已记录，结果已写入世界。', changes: applied.changes, warnings: applied.warnings, historyId };
}

function installedEventDef(event: EventDef, packageId: string): EventDef {
  return structuredClone({ ...event, packId: workshopEventPackId(packageId), weight: 0 });
}

function eventReferenceError(event: EventDef, save: SaveFile): string | undefined {
  for (const nodeId of event.trigger.nodeIds ?? []) if (!save.world.map.nodes[nodeId]) return `事件引用了不存在的地点：${nodeId}。`;
  for (const slotId of event.trigger.slotIds ?? []) if (!save.config.calendar.slots.some((slot) => slot.id === slotId)) return `事件引用了不存在的时段：${slotId}。`;
  for (const characterId of event.trigger.charIds ?? []) if (!save.world.characters[characterId] && !save.world.npcs[characterId]) return `事件引用了不存在的角色：${characterId}。`;
  for (const stageId of [event.stageRange?.min, event.stageRange?.max]) if (stageId && !save.config.stageRules.some((stage) => stage.id === stageId)) return `事件引用了不存在的关系阶段：${stageId}。`;
  for (const rule of event.evidenceRules ?? []) if (rule.itemId && !save.world.items[rule.itemId]) return `事件证物规则引用了不存在的物品：${rule.itemId}。`;
  return undefined;
}

function runtimeValidationError(record: WorkshopPackageRecord): string | undefined {
  const report = validateWorkshopPackage(record.package);
  return report.canInstall ? undefined : `工坊包运行时校验失败：${report.issues.find((issue) => issue.severity === 'error')?.message ?? '未知错误'}`;
}

function hasPermission(record: WorkshopPackageRecord, capability: 'event.install' | 'event.trigger', resource: string): boolean {
  return record.package.manifest.permissions.some((permission) => permission.capability === capability && permission.resources.includes(resource));
}

function applyEventOps(ops: readonly unknown[], world: SaveFile['world'], save: SaveFile, day = world.clock.day, slotId = world.clock.slotId, nodeId = world.player.nodeId): ApplyOpsResult {
  return createDefaultOpRegistry().applyAll(ops, {
    world,
    day,
    slotId,
    nodeId,
    calendar: save.config.calendar,
    actionCosts: save.config.actionCosts,
    encounterConfig: save.config.encounter,
    stageRules: save.config.stageRules,
    log: () => undefined,
  }, Math.min(32, save.config.opsLimitPerTurn));
}

function opsFullyApplied(ops: readonly unknown[], result: ApplyOpsResult): boolean {
  return result.applied === ops.length && result.rejected.length === 0 && result.truncated === 0;
}

function firstApplyError(result: ApplyOpsResult): string {
  return result.rejected[0]?.reason ?? result.warnings[0] ?? '事件效果未能完整应用。';
}

function replaceWorld(target: SaveFile['world'], source: SaveFile['world']): void {
  for (const key of Object.keys(target)) delete (target as unknown as Record<string, unknown>)[key];
  Object.assign(target, source);
}

function rejected(message: string): WorkshopEventRunResult {
  return { ok: false, message, changes: [], warnings: [] };
}
