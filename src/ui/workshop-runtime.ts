import type { SaveFile } from '../data/schema/save';
import type { WorkshopPackageRecord, WorkshopPermission } from '../data/workshop';

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
