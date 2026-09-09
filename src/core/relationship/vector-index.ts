export interface VectorIndexEntry {
  id: string;
  vector: readonly number[];
}

export interface VectorMemoryIndex {
  dimensions: number;
  entries: VectorIndexEntry[];
}

export interface VectorSearchResult {
  id: string;
  score: number;
}

/** Build a disposable local index; invalid or mismatched vectors are skipped rather than becoming facts. */
export function buildVectorMemoryIndex(entries: readonly VectorIndexEntry[]): VectorMemoryIndex {
  const dimensions = entries.find((entry) => validVector(entry.vector))?.vector.length ?? 0;
  if (!dimensions) return { dimensions: 0, entries: [] };
  const valid = entries
    .filter((entry) => entry.id.trim() && entry.vector.length === dimensions && validVector(entry.vector))
    .map((entry) => ({ id: entry.id, vector: [...entry.vector] }));
  return { dimensions, entries: valid };
}

/** Search a local index with deterministic cosine similarity and stable ID tie-breaking. */
export function searchVectorMemoryIndex(index: VectorMemoryIndex, query: readonly number[], limit = 8): VectorSearchResult[] {
  if (!index.dimensions || query.length !== index.dimensions || !validVector(query)) return [];
  const safeLimit = Math.max(0, Math.floor(limit));
  return index.entries
    .map((entry) => ({ id: entry.id, score: cosineSimilarity(entry.vector, query) }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, safeLimit);
}

function validVector(vector: readonly number[]): boolean {
  return vector.length > 0 && vector.every((value) => Number.isFinite(value));
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}
