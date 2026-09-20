import type { SaveFile } from '../data/schema/save';
import type { WorkshopLocalValue, WorkshopPackageRecord, WorkshopPermission, WorkshopValueBinding } from '../data/workshop';

export const WORKSHOP_CHANGED_EVENT = 'tokimeki:workshop-change';
export const WORKSHOP_ROUTE_PREFIX = 'workshop-app:';

export function workshopRoute(packageId: string): string {
  return `${WORKSHOP_ROUTE_PREFIX}${packageId}`;
}

export function workshopPackageIdFromRoute(route: string | null | undefined): string | undefined {
  if (!route?.startsWith(WORKSHOP_ROUTE_PREFIX)) return undefined;
  const id = route.slice(WORKSHOP_ROUTE_PREFIX.length);
  return id || undefined;
}

export function notifyWorkshopChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(WORKSHOP_CHANGED_EVENT));
}

export function hasWorkshopPermission(record: WorkshopPackageRecord, capability: WorkshopPermission['capability'], resource?: string): boolean {
  return record.package.manifest.permissions.some((permission) => {
    if (permission.capability !== capability) return false;
    return resource === undefined || ('resources' in permission && (permission.resources as readonly string[]).includes(resource));
  });
}

export interface WorkshopFactView {
  label: string;
  lines: string[];
}

export type WorkshopBindingStatus = 'resolved' | 'missing' | 'unauthorized';
export interface WorkshopBindingResult { status: WorkshopBindingStatus; value?: unknown }

function workshopWorldResource(resource: Extract<WorkshopValueBinding, { source: 'world' }>['resource'], save: SaveFile): unknown {
  const { world } = save;
  switch (resource) {
    case 'clock': return { day: world.clock.day, slotId: world.clock.slotId };
    case 'world.stats': return { ...world.stats };
    case 'world.flags': return { ...world.flags };
    case 'player.identity': return { name: world.player.name, personaId: world.player.personaId ?? null };
    case 'player.location': {
      const node = world.map.nodes[world.player.nodeId];
      return { nodeId: world.player.nodeId, name: node?.name ?? world.player.nodeId };
    }
    case 'player.stats': return { ...world.player.stats };
    case 'player.flags': return { ...world.player.flags };
    case 'player.inventory': return world.player.inventory.map((item) => ({ itemId: item.itemId, name: world.items[item.itemId]?.name ?? item.itemId, count: item.count }));
    case 'map': return {
      regions: Object.values(world.map.regions).map((region) => ({ id: region.id, name: region.name })),
      nodes: Object.values(world.map.nodes).map((node) => ({ id: node.id, name: node.name })),
    };
    case 'characters': return Object.values(world.characters).map((character) => ({ id: character.id, name: character.name }));
    case 'relations': return Object.entries(world.relations).map(([characterId, relation]) => ({ characterId, name: world.characters[characterId]?.name ?? characterId, stageId: relation.stageId ?? null, axes: { ...relation.axes } }));
    case 'events': return { definitionCount: Object.keys(world.eventDefs).length, scheduledCount: world.director.scheduled.length, historyCount: world.eventHistory.length };
    case 'economy': return {
      defaultCurrencyId: world.economy.defaultCurrencyId,
      defaultCurrencyName: world.economy.currencies[world.economy.defaultCurrencyId]?.name ?? world.economy.defaultCurrencyId,
      jobRuleCount: Object.keys(world.economy.jobRules).length,
      shopRuleCount: Object.keys(world.economy.shopRules).length,
    };
    default: return undefined;
  }
}

function selectWorkshopBindingPath(root: unknown, path: readonly (string | number)[]): unknown {
  let current = root;
  for (const segment of path) {
    const key = String(segment);
    if (['__proto__', 'prototype', 'constructor'].includes(key) || current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function resolveWorkshopBinding(binding: WorkshopValueBinding, record: WorkshopPackageRecord, save: SaveFile, values: Readonly<Record<string, WorkshopLocalValue>>): WorkshopBindingResult {
  let root: unknown;
  if (binding.source === 'local') {
    if (!hasWorkshopPermission(record, 'app.local-state')) return { status: 'unauthorized' };
    root = values[binding.key];
  } else {
    if (!hasWorkshopPermission(record, 'world.read', binding.resource)) return { status: 'unauthorized' };
    root = workshopWorldResource(binding.resource, save);
  }
  const selected = selectWorkshopBindingPath(root, binding.path ?? []);
  if (selected !== undefined) return { status: 'resolved', value: selected };
  return 'fallback' in binding ? { status: 'resolved', value: binding.fallback } : { status: 'missing' };
}

function plainWorkshopValue(value: unknown, format: WorkshopValueBinding['format']): string | undefined {
  if (format === 'number') return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
  if (format === 'boolean') return typeof value === 'boolean' ? (value ? '是' : '否') : undefined;
  if (format === 'json') {
    try { return JSON.stringify(value); } catch { return undefined; }
  }
  if (value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (format === 'text') return undefined;
  try { return JSON.stringify(value); } catch { return undefined; }
}

export function formatWorkshopBinding(binding: WorkshopValueBinding, result: WorkshopBindingResult, fallback: string): string {
  if (result.status !== 'resolved') return fallback;
  const text = plainWorkshopValue(result.value, binding.format ?? 'auto');
  if (text === undefined) return fallback;
  return `${binding.prefix ?? ''}${text}${binding.suffix ?? ''}`.slice(0, 10_000);
}

export function listWorkshopBinding(binding: WorkshopValueBinding, result: WorkshopBindingResult, fallback: readonly string[]): string[] {
  if (result.status !== 'resolved') return [...fallback];
  const value = result.value;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).slice(0, 100).map(([key, item]) => `${binding.prefix ?? ''}${key}: ${plainWorkshopValue(item, binding.format ?? 'auto') ?? ''}${binding.suffix ?? ''}`.slice(0, 1000));
  }
  const items = Array.isArray(value) ? value : [value];
  return items.slice(0, 100).map((item) => `${binding.prefix ?? ''}${plainWorkshopValue(item, binding.format ?? 'auto') ?? ''}${binding.suffix ?? ''}`.slice(0, 1000));
}

export function numberWorkshopBinding(binding: WorkshopValueBinding | undefined, result: WorkshopBindingResult | undefined, fallback: number): number {
  return binding && result?.status === 'resolved' && typeof result.value === 'number' && Number.isFinite(result.value) ? result.value : fallback;
}

function entries(value: Record<string, string | number | boolean>): string[] {
  const result = Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`);
  return result.length ? result : ['暂无'];
}

export function resolveWorkshopFact(resource: string, save: SaveFile): WorkshopFactView {
  const { world } = save;
  switch (resource) {
    case 'clock': return { label: '时间', lines: [`第 ${world.clock.day} 天`, world.clock.slotId] };
    case 'world.stats': return { label: '世界数值', lines: entries(world.stats) };
    case 'world.flags': return { label: '世界标记', lines: entries(world.flags) };
    case 'player.identity': return { label: '玩家身份', lines: [world.player.name, ...(world.player.personaId ? [`身份 ID: ${world.player.personaId}`] : [])] };
    case 'player.location': {
      const node = world.map.nodes[world.player.nodeId];
      return { label: '当前位置', lines: [node?.name ?? world.player.nodeId] };
    }
    case 'player.stats': return { label: '玩家数值', lines: entries(world.player.stats) };
    case 'player.flags': return { label: '玩家标记', lines: entries(world.player.flags) };
    case 'player.inventory': return { label: '背包', lines: world.player.inventory.length ? world.player.inventory.map((item) => `${world.items[item.itemId]?.name ?? item.itemId} × ${item.count}`) : ['暂无'] };
    case 'map': return { label: '地图', lines: [`${Object.keys(world.map.regions).length} 个区域`, `${Object.keys(world.map.nodes).length} 个地点`] };
    case 'characters': {
      const names = Object.values(world.characters).map((character) => character.name);
      return { label: '正式角色', lines: names.length ? names : ['暂无'] };
    }
    case 'relations': {
      const relations = Object.entries(world.relations).map(([id, relation]) => {
        const name = world.characters[id]?.name ?? id;
        return `${name}: ${relation.stageId ?? '未分阶段'}`;
      });
      return { label: '关系', lines: relations.length ? relations : ['暂无'] };
    }
    case 'events': return { label: '事件', lines: [`${Object.keys(world.eventDefs).length} 个定义`, `${world.director.scheduled.length} 个待触发`, `${world.eventHistory.length} 条历史`] };
    case 'economy': return { label: '经济', lines: [`默认货币: ${world.economy.currencies[world.economy.defaultCurrencyId]?.name ?? world.economy.defaultCurrencyId}`, `${Object.keys(world.economy.jobRules).length} 种工作`, `${Object.keys(world.economy.shopRules).length} 种经营规则`] };
    default: return { label: resource, lines: ['不支持的只读事实'] };
  }
}
