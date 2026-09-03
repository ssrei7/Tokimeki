import { describe, expect, it } from 'vitest';
import { getAdapter } from '../src/providers/adapters';
import { testProviderConnection } from '../src/providers/connection-test';
import { ProviderManager } from '../src/providers/manager';
import type { ProviderConfig } from '../src/providers/types';

const base: ProviderConfig = { id: 'default', name: 'Default', kind: 'openai-compatible', endpoint: 'https://example.test/v1/chat/completions', model: 'demo', contextWindow: 4096, maxOutputTokens: 100, temperature: 0.2 };

describe('provider adapters and routing', () => {
  it('formats OpenAI-compatible requests and extracts text', () => { const prepared = getAdapter('openai-compatible').prepare({ ...base, apiKey: 'secret' }, { messages: [{ role: 'user', content: 'hi' }] }); expect(prepared.url).toContain('/chat/completions'); expect(JSON.parse(String(prepared.init.body)).model).toBe('demo'); expect(getAdapter('openai-compatible').extractText(base, { choices: [{ message: { content: 'hello' } }] })).toBe('hello'); });
  it('adds Anthropic browser header and extracts Gemini text', () => { const request = getAdapter('anthropic').prepare({ ...base, kind: 'anthropic', endpoint: 'https://example.test/messages' }, { messages: [{ role: 'user', content: 'hi' }] }); expect((request.init.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true'); expect(getAdapter('gemini').extractText({ ...base, kind: 'gemini' }, { candidates: [{ content: { parts: [{ text: 'hello' }] } }] })).toBe('hello'); });
  it('routes tasks with default fallback and cleans removed bindings', () => { const manager = new ProviderManager(); manager.upsertProvider(base); manager.upsertProvider({ ...base, id: 'cheap', name: 'Cheap' }); manager.bindTask({ taskId: 'narrate_main', providerId: 'cheap' }); expect(manager.resolve('narrate_main')?.id).toBe('cheap'); expect(manager.resolve('summarize_day')?.id).toBe('default'); manager.removeProvider('cheap'); expect(manager.resolve('narrate_main')?.id).toBe('default'); });
});

describe('connection test classification', () => {
  it('classifies auth, not found, timeout, CORS and format failures', async () => {
    const response = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); const run = (fetchImpl: typeof fetch) => testProviderConnection(base, { fetchImpl, timeoutMs: 10 });
    expect((await run(async () => response(401, {}))).kind).toBe('unauthorized'); expect((await run(async () => response(404, {}))).kind).toBe('not_found'); expect((await run(async () => response(200, {}))).kind).toBe('format'); expect((await run(async () => { throw new TypeError('Failed to fetch'); })).kind).toBe('cors'); expect((await run((_url, init) => new Promise<Response>((_, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); }))).kind).toBe('timeout');
  });
});
