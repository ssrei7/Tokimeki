import { describe, expect, it } from 'vitest';
import { queryVectorMemories, rebuildVectorMemoryRecords } from '../src/providers/vector-memory';
import type { EmbeddingConfig } from '../src/providers/types';

const config = (enabled = true): EmbeddingConfig => ({ id: 'embedding', enabled, endpoint: 'https://embedding.test/v1/embeddings', model: 'embed-model', requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: new Date().toISOString() });

describe('vector memory provider orchestration', () => {
  it('embeds stale memories and query in one request, then reuses cached memory vectors', async () => {
    let calls = 0;
    let lastInput: string[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls += 1;
      lastInput = JSON.parse(String(init?.body)).input;
      return new Response(JSON.stringify({ data: lastInput.map((_, index) => ({ index, embedding: index === lastInput.length - 1 ? [0, 1] : [1, index] })) }), { status: 200 });
    };
    const memories = [{ id: 'm1', text: '第一条', day: 1 }, { id: 'm2', text: '第二条', day: 2 }];
    const first = await queryVectorMemories({ config: config(), saveId: 'save', characterId: 'char', query: '问题', memories, existingRecords: [], fetchImpl });
    expect(calls).toBe(1);
    expect(lastInput).toEqual(['第一条', '第二条', '问题']);
    expect(first.records).toHaveLength(2);
    const second = await queryVectorMemories({ config: config(), saveId: 'save', characterId: 'char', query: '另一个问题', memories, existingRecords: first.records, fetchImpl });
    expect(calls).toBe(2);
    expect(lastInput).toEqual(['另一个问题']);
    expect(second.records).toEqual([]);
    expect(second.scores.size).toBe(2);
  });

  it('does no network work while disabled and rebuilds all eligible entries as one batch', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls += 1;
      const input = JSON.parse(String(init?.body)).input as string[];
      return new Response(JSON.stringify({ data: input.map((_, index) => ({ index, embedding: [index + 1, 1] })) }), { status: 200 });
    };
    const memories = [{ id: 'm1', text: '保留', day: 1 }, { id: 'm2', text: '归档', day: 2, archived: true }];
    expect((await queryVectorMemories({ config: config(false), saveId: 'save', characterId: 'char', query: '问题', memories, existingRecords: [], fetchImpl })).scores.size).toBe(0);
    expect(calls).toBe(0);
    const records = await rebuildVectorMemoryRecords({ config: config(), saveId: 'save', entries: memories.map((memory) => ({ characterId: 'char', memory })), fetchImpl });
    expect(calls).toBe(1);
    expect(records.map((record) => record.memoryId)).toEqual(['m1']);
  });
});
