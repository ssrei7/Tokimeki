import type { MemoryEntry, MemorySource, MemoryType, WorldState } from '../../data/schema/save';

export interface MemorySearchOptions {
  query?: string;
  nodeId?: string;
  types?: MemoryType[];
  sources?: MemorySource['kind'][];
  includeArchived?: boolean;
  includeDisabled?: boolean;
  limit?: number;
}

export interface RetrievedMemory {
  memory: MemoryEntry;
  score: number;
}

const IMPORTANCE_SCORE: Record<MemoryEntry['importance'], number> = { low: 0, normal: 1, high: 2, critical: 3 };

/** Deterministic, provider-free retrieval for one formal character's memories. */
export function retrieveRelationshipMemories(world: WorldState, charId: string, options: MemorySearchOptions = {}): RetrievedMemory[] {
  const memories = world.relations[charId]?.memories ?? [];
  const queryTokens = tokenize(options.query ?? '');
  const typeSet = options.types?.length ? new Set(options.types) : undefined;
  const sourceSet = options.sources?.length ? new Set(options.sources) : undefined;
  const candidates = memories
    .filter((memory) => options.includeArchived || memory.archived !== true)
    .filter((memory) => options.includeDisabled || memory.inject !== false)
    .filter((memory) => !typeSet || typeSet.has(memory.type ?? 'interaction'))
    .filter((memory) => !sourceSet || sourceSet.has(memory.source?.kind ?? 'legacy'))
    .map((memory) => ({ memory, score: scoreMemory(memory, options.nodeId, queryTokens) }))
    .filter(({ score }) => queryTokens.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || b.memory.day - a.memory.day || a.memory.id.localeCompare(b.memory.id));
  return typeof options.limit === 'number' ? candidates.slice(0, Math.max(0, Math.floor(options.limit))) : candidates;
}

export function searchRelationshipMemories(world: WorldState, charId: string, options: MemorySearchOptions = {}): MemoryEntry[] {
  return retrieveRelationshipMemories(world, charId, options).map(({ memory }) => memory);
}

function scoreMemory(memory: MemoryEntry, nodeId: string | undefined, queryTokens: string[]): number {
  const normalized = memory.text.toLocaleLowerCase();
  const keywordScore = queryTokens.reduce((score, token) => score + (normalized.includes(token) ? 10 : 0), 0);
  const nodeScore = nodeId && memory.nodeId === nodeId ? 5 : 0;
  const importanceScore = IMPORTANCE_SCORE[memory.importance ?? 'normal'];
  return keywordScore + nodeScore + importanceScore * 2 + Math.max(0, memory.day) / 100000;
}

function tokenize(value: string): string[] {
  return [...new Set((value.toLocaleLowerCase().match(/[\u4e00-\u9fff]|[a-z0-9]+/g) ?? []).filter(Boolean))];
}
