import { describe, expect, it } from 'vitest';
import { createEmbeddings, EmbeddingProviderError, parseEmbeddingResponse } from '../src/providers/embedding';

describe('explicit embedding provider', () => {
  it('batches texts into one request and preserves indexed order', async () => {
    let calls = 0;
    const vectors = await createEmbeddings({ endpoint: 'https://embedding.test/v1/embeddings', model: 'text-model', apiKey: 'secret', texts: ['  第一条  ', '第二条'], fetchImpl: async (_input, init) => {
      calls += 1;
      expect(JSON.parse(String(init?.body))).toEqual({ model: 'text-model', input: ['第一条', '第二条'] });
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
      return new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }), { status: 200 });
    } });
    expect(calls).toBe(1);
    expect(vectors).toEqual([[1, 0], [0, 1]]);
  });

  it('does not call the network for an empty batch and rejects malformed vectors', async () => {
    let calls = 0;
    expect(await createEmbeddings({ endpoint: 'https://embedding.test', model: 'model', texts: [], fetchImpl: async () => { calls += 1; return new Response('{}'); } })).toEqual([]);
    expect(calls).toBe(0);
    expect(() => parseEmbeddingResponse({ data: [{ embedding: [1, Number.NaN] }] })).toThrow(EmbeddingProviderError);
  });
});
