import { z } from 'zod';
import { CharacterCardSchema, WorldbookEntrySchema, type CharacterCard, type WorldbookEntry } from '../content';
import { EventDefSchema, FormalCharacterSchema, ItemDefSchema, MapSchema, NpcTemplateSchema, NpcLiteSchema, type EventDef, type FormalCharacter, type ItemDef, type MapState, type NpcLite, type NpcTemplate } from '../schema/save';

export const WorldPackageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  map: MapSchema,
  characters: z.record(z.string(), FormalCharacterSchema).default({}),
  npcs: z.record(z.string(), NpcLiteSchema).default({}),
  npcTemplates: z.record(z.string(), NpcTemplateSchema).default({}),
  items: z.record(z.string(), ItemDefSchema).default({}),
  eventDefs: z.record(z.string(), EventDefSchema).default({}),
  worldbooks: z.array(WorldbookEntrySchema).default([]),
  characterCards: z.array(CharacterCardSchema).default([]),
});
export type WorldPackage = z.infer<typeof WorldPackageSchema>;

export function createWorldPackage(input: { id: string; name: string; map: MapState; characters: Record<string, FormalCharacter>; npcs: Record<string, NpcLite>; npcTemplates: Record<string, NpcTemplate>; items: Record<string, ItemDef>; eventDefs: Record<string, EventDef>; worldbooks: readonly WorldbookEntry[]; characterCards: readonly CharacterCard[] }): WorldPackage {
  return WorldPackageSchema.parse(input);
}

export function sanitizeWorldMapForPackage(map: MapState): MapState {
  const next = structuredClone(map);
  next.nodes = Object.fromEntries(Object.entries(next.nodes).map(([id, node]) => [id, { ...node, discovered: false, visitCount: 0, memories: [] }]));
  return next;
}

export function remapWorldPackageAssetIds(pack: WorldPackage, replacements: ReadonlyMap<string, string>): WorldPackage {
  if (!replacements.size) return pack;
  const remap = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if ('kind' in value && 'assetId' in value && value.kind === 'stored' && typeof value.assetId === 'string') return { ...value, assetId: replacements.get(value.assetId) ?? value.assetId };
    if (Array.isArray(value)) return value.map(remap);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remap(child)]));
  };
  return WorldPackageSchema.parse(remap(pack));
}

export function mergeWorldPackage(target: { map: MapState; characters: Record<string, FormalCharacter>; npcs: Record<string, NpcLite>; npcTemplates: Record<string, NpcTemplate>; items: Record<string, ItemDef>; eventDefs: Record<string, EventDef> }, pack: WorldPackage): void {
  Object.assign(target.map.regions, structuredClone(pack.map.regions));
  Object.assign(target.map.nodes, structuredClone(pack.map.nodes));
  const edgeKeys = new Set(target.map.edges.map((edge) => `${edge.from}->${edge.to}:${edge.oneWay ? '1' : '0'}`));
  for (const edge of pack.map.edges) {
    const key = `${edge.from}->${edge.to}:${edge.oneWay ? '1' : '0'}`;
    if (!edgeKeys.has(key)) { target.map.edges.push(structuredClone(edge)); edgeKeys.add(key); }
  }
  target.map.view = structuredClone(pack.map.view);
  Object.assign(target.characters, structuredClone(pack.characters));
  Object.assign(target.npcs, structuredClone(pack.npcs));
  Object.assign(target.npcTemplates, structuredClone(pack.npcTemplates));
  Object.assign(target.items, structuredClone(pack.items));
  Object.assign(target.eventDefs, structuredClone(pack.eventDefs));
}
