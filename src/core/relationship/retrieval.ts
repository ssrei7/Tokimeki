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

export interface HybridMemorySearchOptions extends MemorySearchOptions {
  /** Optional provider-supplied scores keyed by memory id. The kernel still owns filtering. */
  vectorScores?: ReadonlyMap<string, number>;
  /** Weight for the normalized local/vector score. Defaults to 0.5. */
  vectorWeight?: number;
  /** Weight for the normalized deterministic kernel score. Defaults to 0.5. */
  keywordWeight?: number;
}

export interface RetrievedMemory {
  memory: MemoryEntry;
  score: number;
}

const IMPORTANCE_SCORE: Record<MemoryEntry['importance'], number> = { low: 0, normal: 1, high: 2, critical: 3 };

/** Deterministic, provider-free retrieval for one formal character's memories. */
export function retrieveRelationshipMemories(world: WorldState, charId: string, options: MemorySearchOptions = {}): RetrievedMemory[] {
  const candidates = collectCandidates(world, charId, options)
    .sort((a, b) => b.score - a.score || b.memory.day - a.memory.day || a.memory.id.localeCompare(b.memory.id));
  return typeof options.limit === 'number' ? candidates.slice(0, Math.max(0, Math.floor(options.limit))) : candidates;
}

/**
 * Blend deterministic kernel retrieval with optional caller-provided vector scores.
 * Vectors can influence ranking only after the kernel has applied all factual filters.
 */
export function retrieveRelationshipMemoriesHybrid(
  world: WorldState,
  charId: string,
  options: HybridMemorySearchOptions = {},
): RetrievedMemory[] {
  const candidates = collectCandidates(world, charId, options);
  const vectorScores = options.vectorScores;
  const vectorWeight = nonNegativeFinite(options.vectorWeight, 0.5);
  const keywordWeight = nonNegativeFinite(options.keywordWeight, 0.5);
  const hasUsableVectorScore = vectorScores
    ? candidates.some(({ memory }) => Number.isFinite(vectorScores.get(memory.id)))
    : false;
  if (!vectorScores || !hasUsableVectorScore || vectorWeight + keywordWeight <= 0 || candidates.length === 0) {
    return sortAndLimit(candidates, options.limit);
  }

  const kernelValues = candidates.map(({ score }) => score);
  const vectorValues = candidates.map(({ memory }) => vectorScores.get(memory.id) ?? 0);
  const normalizedKernel = normalizeScores(kernelValues);
  const normalizedVector = normalizeScores(vectorValues);
  const totalWeight = vectorWeight + keywordWeight;
  const blended = candidates.map(({ memory }, index) => ({
    memory,
    score: (normalizedKernel[index] * keywordWeight + normalizedVector[index] * vectorWeight) / totalWeight,
  }));
  return sortAndLimit(blended, options.limit);
}

export function searchRelationshipMemories(world: WorldState, charId: string, options: MemorySearchOptions = {}): MemoryEntry[] {
  return retrieveRelationshipMemories(world, charId, options).map(({ memory }) => memory);
}

function collectCandidates(world: WorldState, charId: string, options: MemorySearchOptions): RetrievedMemory[] {
  const memories = world.relations[charId]?.memories ?? [];
  const queryTokens = tokenize(options.query ?? '');
  const typeSet = options.types?.length ? new Set(options.types) : undefined;
  const sourceSet = options.sources?.length ? new Set(options.sources) : undefined;
  return memories
    .filter((memory) => options.includeArchived || memory.archived !== true)
    .filter((memory) => options.includeDisabled || memory.inject !== false)
    .filter((memory) => !typeSet || typeSet.has(memory.type ?? 'interaction'))
    .filter((memory) => !sourceSet || sourceSet.has(memory.source?.kind ?? 'legacy'))
    .map((memory) => ({ memory, score: scoreMemory(memory, options.nodeId, queryTokens) }))
    .filter(({ memory }) => queryTokens.length === 0 || matchesQuery(memory.text, queryTokens));
}

function sortAndLimit(candidates: RetrievedMemory[], limit: number | undefined): RetrievedMemory[] {
  const sorted = candidates.sort((a, b) => b.score - a.score || b.memory.day - a.memory.day || a.memory.id.localeCompare(b.memory.id));
  return typeof limit === 'number' ? sorted.slice(0, Math.max(0, Math.floor(limit))) : sorted;
}

function normalizeScores(scores: readonly number[]): number[] {
  const finite = scores.filter((score) => Number.isFinite(score));
  if (finite.length === 0) return scores.map(() => 0);
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  if (maximum === minimum) return scores.map((score) => (Number.isFinite(score) ? 1 : 0));
  return scores.map((score) => (Number.isFinite(score) ? (score - minimum) / (maximum - minimum) : 0));
}

function nonNegativeFinite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function scoreMemory(memory: MemoryEntry, nodeId: string | undefined, queryTokens: string[]): number {
  const normalized = memory.text.toLocaleLowerCase();
  const keywordScore = queryTokens.reduce((score, token) => score + (normalized.includes(token) ? 10 : 0), 0);
  const nodeScore = nodeId && memory.nodeId === nodeId ? 5 : 0;
  const importanceScore = IMPORTANCE_SCORE[memory.importance ?? 'normal'];
  return keywordScore + nodeScore + importanceScore * 2 + Math.max(0, memory.day) / 100000;
}

function matchesQuery(text: string, queryTokens: readonly string[]): boolean {
  const normalized = text.toLocaleLowerCase();
  return queryTokens.some((token) => normalized.includes(token));
}

function tokenize(value: string): string[] {
  return [...new Set((value.toLocaleLowerCase().match(/[\u4e00-\u9fff]|[a-z0-9]+/g) ?? []).filter(Boolean))];
}
