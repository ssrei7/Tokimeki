export interface EmbeddingRequest {
  endpoint: string;
  model: string;
  texts: readonly string[];
  apiKey?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class EmbeddingProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}

/** Call an explicitly configured OpenAI-compatible embedding endpoint once for a batch of texts. */
export async function createEmbeddings(request: EmbeddingRequest): Promise<number[][]> {
  const texts = request.texts.map((text) => text.trim());
  if (texts.length === 0) return [];
  if (!request.endpoint.trim() || !request.model.trim()) throw new EmbeddingProviderError('Embedding endpoint and model are required.');
  const fetchImpl = request.fetchImpl ?? fetch;
  const response = await fetchImpl(request.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(request.apiKey ? { Authorization: `Bearer ${request.apiKey}` } : {}), ...(request.headers ?? {}) },
    body: JSON.stringify({ model: request.model, input: texts }),
    signal: request.signal,
  });
  if (!response.ok) throw new EmbeddingProviderError(`Embedding request failed with HTTP ${response.status}.`);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new EmbeddingProviderError('Embedding response was not valid JSON.'); }
  return parseEmbeddingResponse(payload, texts.length);
}

export function parseEmbeddingResponse(payload: unknown, expectedCount?: number): number[][] {
  if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as { data?: unknown }).data)) throw new EmbeddingProviderError('Embedding response must contain a data array.');
  const data = (payload as { data: unknown[] }).data.map((item, fallbackIndex) => {
    if (typeof item !== 'object' || item === null || !Array.isArray((item as { embedding?: unknown }).embedding)) throw new EmbeddingProviderError('Embedding item is missing its vector.');
    const vector = (item as { embedding: unknown[] }).embedding;
    const numericVector = vector.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (!numericVector.length || numericVector.length !== vector.length) throw new EmbeddingProviderError('Embedding vector contains invalid values.');
    const index = typeof (item as { index?: unknown }).index === 'number' && Number.isInteger((item as { index: number }).index) ? (item as { index: number }).index : fallbackIndex;
    return { index, vector: [...numericVector] };
  }).sort((left, right) => left.index - right.index);
  if (expectedCount !== undefined && data.length !== expectedCount) throw new EmbeddingProviderError('Embedding response count does not match the request.');
  const dimensions = data[0]?.vector.length ?? 0;
  if (data.some((item) => item.vector.length !== dimensions)) throw new EmbeddingProviderError('Embedding vectors have inconsistent dimensions.');
  return data.map((item) => item.vector);
}
