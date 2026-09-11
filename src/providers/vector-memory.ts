import { buildVectorMemoryIndex, searchVectorMemoryIndex } from '../core/relationship';
import type { MemoryEntry } from '../data/schema/save';
import type { MemoryVectorRecord } from '../data/content';
import type { EmbeddingConfig } from './types';
import { createEmbeddings } from './embedding';

export interface VectorMemoryQueryResult {
  scores: Map<string, number>;
  records: MemoryVectorRecord[];
  embeddedCount: number;
}

export async function rebuildVectorMemoryRecords(input: {
  config: EmbeddingConfig;
  saveId: string;
  entries: readonly { characterId: string; memory: MemoryEntry }[];
  fetchImpl?: typeof fetch;
}): Promise<MemoryVectorRecord[]> {
  const entries = input.entries.filter(({ memory }) => memory.archived !== true && memory.inject !== false);
  if (!input.config.enabled || entries.length === 0) return [];
  const vectors = await createEmbeddings({ endpoint: input.config.endpoint, model: input.config.model, apiKey: input.config.apiKey, headers: input.config.headers, texts: entries.map(({ memory }) => memory.text), fetchImpl: input.fetchImpl });
  const fingerprint = embeddingFingerprint(input.config);
  const updatedAt = new Date().toISOString();
  return entries.map(({ characterId, memory }, index) => ({ id: memoryVectorId(input.saveId, characterId, memory.id), saveId: input.saveId, characterId, memoryId: memory.id, text: memory.text, providerFingerprint: fingerprint, vector: vectors[index] ?? [], updatedAt }));
}

export function embeddingFingerprint(config: Pick<EmbeddingConfig, 'endpoint' | 'model'>): string {
  return `${config.endpoint.trim()}\n${config.model.trim()}`;
}

export function memoryVectorId(saveId: string, characterId: string, memoryId: string): string {
  return JSON.stringify([saveId, characterId, memoryId]);
}

export async function queryVectorMemories(input: {
  config: EmbeddingConfig;
  saveId: string;
  characterId: string;
  query: string;
  memories: readonly MemoryEntry[];
  existingRecords: readonly MemoryVectorRecord[];
  fetchImpl?: typeof fetch;
}): Promise<VectorMemoryQueryResult> {
  const query = input.query.trim();
  const memories = input.memories.filter((memory) => memory.archived !== true && memory.inject !== false);
  if (!input.config.enabled || !query || memories.length === 0) return { scores: new Map(), records: [], embeddedCount: 0 };
  const fingerprint = embeddingFingerprint(input.config);
  const existing = new Map(input.existingRecords
    .filter((record) => record.providerFingerprint === fingerprint && memories.some((memory) => memory.id === record.memoryId && memory.text === record.text))
    .map((record) => [record.memoryId, record]));
  const missing = memories.filter((memory) => !existing.has(memory.id));
  const vectors = await createEmbeddings({ endpoint: input.config.endpoint, model: input.config.model, apiKey: input.config.apiKey, headers: input.config.headers, texts: [...missing.map((memory) => memory.text), query], fetchImpl: input.fetchImpl });
  const timestamp = new Date().toISOString();
  const records = missing.map((memory, index): MemoryVectorRecord => ({ id: memoryVectorId(input.saveId, input.characterId, memory.id), saveId: input.saveId, characterId: input.characterId, memoryId: memory.id, text: memory.text, providerFingerprint: fingerprint, vector: vectors[index] ?? [], updatedAt: timestamp }));
  const all = [...existing.values(), ...records];
  const queryVector = vectors.at(-1) ?? [];
  const index = buildVectorMemoryIndex(all.map((record) => ({ id: record.memoryId, vector: record.vector })));
  return { scores: new Map(searchVectorMemoryIndex(index, queryVector, memories.length).map((result) => [result.id, result.score])), records, embeddedCount: missing.length };
}
