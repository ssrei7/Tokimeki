import type { Migration } from './types';

export const migrateV12ToV13: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const world = old.world && typeof old.world === 'object' && !Array.isArray(old.world) ? old.world as Record<string, unknown> : {};
  const existing = Array.isArray(world.collection) ? world.collection : undefined;
  const inventory = Array.isArray(world.player) ? [] : (world.player && typeof world.player === 'object' && !Array.isArray(world.player) ? (world.player as Record<string, unknown>).inventory : undefined);
  const items = world.items && typeof world.items === 'object' && !Array.isArray(world.items) ? world.items as Record<string, unknown> : {};
  const collection = existing ?? (Array.isArray(inventory) ? inventory.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const itemId = typeof record.itemId === 'string' ? record.itemId : '';
    const item = itemId && items[itemId] && typeof items[itemId] === 'object' && !Array.isArray(items[itemId]) ? items[itemId] as Record<string, unknown> : {};
    const title = typeof item.name === 'string' && item.name ? item.name : itemId || `收藏 ${index + 1}`;
    const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [];
    const day = typeof record.gotDay === 'number' && Number.isInteger(record.gotDay) && record.gotDay > 0 ? record.gotDay : 1;
    return [{ id: `collection-${itemId || 'unknown'}-${day}-${index + 1}`, itemId: itemId || `legacy-${index + 1}`, title, description: typeof item.description === 'string' ? item.description : '', tags, day, ...(typeof record.gotNodeId === 'string' ? { nodeId: record.gotNodeId } : {}), ...(typeof record.fromCharId === 'string' ? { sourceCharId: record.fromCharId } : {}) }];
  }) : []);
  return { ...old, schemaVersion: 13, world: { ...world, collection } };
};
