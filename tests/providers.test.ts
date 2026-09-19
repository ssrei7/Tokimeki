import { describe, expect, it } from 'vitest';
import { getAdapter } from '../src/providers/adapters';
import { geminiGenerateUrl, geminiModelsUrl } from '../src/providers/adapters/gemini';
import { openAiChatUrl, openAiModelsUrl } from '../src/providers/adapters/openai';
import { testProviderConnection } from '../src/providers/connection-test';
import { ProviderManager } from '../src/providers/manager';
import { listProviderModels } from '../src/providers/models';
import { resolveProviderForCharacter, resolveProviderForTask, resolveProviderForTaskGroup, resolveTtsProviderForCharacter } from '../src/providers/router';
import { streamChat } from '../src/providers/stream';
import { CharacterProviderBindingSchema } from '../src/providers/types';
import type { ProviderConfig, TtsConfig } from '../src/providers/types';

const base: ProviderConfig = { id: 'default', name: 'Default', kind: 'openai-compatible', endpoint: 'https://example.test/v1/chat/completions', model: 'demo', contextWindow: 4096, maxOutputTokens: 100, temperature: 0.2 };
const ttsBase: TtsConfig = { id: 'tts-default', name: 'Default voice', enabled: true, endpoint: 'https://example.test/v1/audio/speech', model: 'tts-1', voice: 'alloy', format: 'mp3', requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: '2026-01-01T00:00:00.000Z' };

describe('provider adapters and routing', () => {
  it('formats OpenAI-compatible requests and extracts text', () => { const prepared = getAdapter('openai-compatible').prepare({ ...base, apiKey: 'secret' }, { messages: [{ role: 'user', content: 'hi' }] }); expect(prepared.url).toContain('/chat/completions'); expect(JSON.parse(String(prepared.init.body)).model).toBe('demo'); expect(getAdapter('openai-compatible').extractText(base, { choices: [{ message: { content: 'hello' } }] })).toBe('hello'); });
  it('adds task-scoped structured output modes without affecting narrative requests', () => {
    const adapter = getAdapter('openai-compatible');
    const structured = JSON.parse(String(adapter.prepare({ ...base, outputMode: 'auto' }, { taskId: 'topic_tree', outputMode: 'auto', messages: [{ role: 'user', content: 'hi' }] }).init.body));
    expect(structured.response_format.type).toBe('json_schema');
    expect(structured.response_format.json_schema.strict).toBe(true);
    const jsonMode = JSON.parse(String(adapter.prepare({ ...base, outputMode: 'json_object' }, { taskId: 'topic_tree', outputMode: 'json_object', messages: [{ role: 'user', content: 'hi' }] }).init.body));
    expect(jsonMode.response_format).toEqual({ type: 'json_object' });
    const workshop = JSON.parse(String(adapter.prepare({ ...base }, { taskId: 'workshop_draft', outputMode: 'json_object', messages: [{ role: 'user', content: 'hi' }] }).init.body));
    expect(workshop.response_format).toEqual({ type: 'json_object' });
    const narrative = JSON.parse(String(adapter.prepare({ ...base, outputMode: 'auto' }, { taskId: 'narrate_main', outputMode: 'auto', messages: [{ role: 'user', content: 'hi' }] }).init.body));
    expect(narrative.response_format).toBeUndefined();
  });
  it('adds Anthropic browser header and extracts Gemini text', () => { const request = getAdapter('anthropic').prepare({ ...base, kind: 'anthropic', endpoint: 'https://example.test/messages' }, { messages: [{ role: 'user', content: 'hi' }] }); expect((request.init.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true'); const gemini = getAdapter('gemini'); expect(gemini.extractText({ ...base, kind: 'gemini' }, { candidates: [{ content: { parts: [{ text: 'hello' }] } }] })).toBe('hello'); expect(gemini.extractStreamText({ ...base, kind: 'gemini' }, 'data: {"candidates":[{"content":{"parts":[{"text":"stream"}]}}]}')).toBe('stream'); });
  it('routes tasks with default fallback and cleans removed bindings', () => { const manager = new ProviderManager(); manager.upsertProvider(base); manager.upsertProvider({ ...base, id: 'cheap', name: 'Cheap' }); manager.bindTask({ taskId: 'narrate_main', providerId: 'cheap' }); expect(manager.resolve('narrate_main')?.id).toBe('cheap'); expect(manager.resolve('summarize_day')?.id).toBe('default'); manager.removeProvider('cheap'); expect(manager.resolve('narrate_main')?.id).toBe('default'); });
  it('resolves a bound provider and falls back to the selected default', () => {
    const providers = [{ ...base, id: 'primary' }, { ...base, id: 'narrator' }];
    const bindings = [{ taskId: 'narrate_main' as const, providerId: 'narrator' }];
    expect(resolveProviderForTask(providers, bindings, 'narrate_main', 'primary')?.id).toBe('narrator');
    expect(resolveProviderForTask(providers, bindings, 'summarize_day', 'primary')?.id).toBe('primary');
    expect(resolveProviderForTask(providers, [{ taskId: 'narrate_main', providerId: 'missing' }], 'narrate_main', 'primary')?.id).toBe('primary');
  });
  it('resolves a merged world morning request through the first available task binding', () => {
    const providers = [{ ...base, id: 'primary' }, { ...base, id: 'npc' }];
    expect(resolveProviderForTaskGroup(providers, [{ taskId: 'npc_batch', providerId: 'npc' }], ['world_morning', 'npc_batch'], 'primary')?.id).toBe('npc');
    expect(resolveProviderForTaskGroup(providers, [{ taskId: 'world_morning', providerId: 'missing' }, { taskId: 'npc_batch', providerId: 'npc' }], ['world_morning', 'npc_batch'], 'primary')?.id).toBe('npc');
  });
  it('allows character ordinary bindings only for narrate_main and keeps world tasks task-routed', () => {
    const providers = [{ ...base, id: 'primary' }, { ...base, id: 'character' }, { ...base, id: 'world' }];
    const taskBindings = [{ taskId: 'narrate_main' as const, providerId: 'world' }];
    const characterBindings = [{ id: 'world-a:alice', saveId: 'world-a', characterId: 'alice', providerId: 'character' }];
    expect(resolveProviderForCharacter(providers, taskBindings, characterBindings, 'world-a', 'alice', 'narrate_main', 'primary')?.id).toBe('character');
    expect(resolveProviderForCharacter(providers, taskBindings, characterBindings, 'world-a', 'alice', 'world_morning', 'primary')?.id).toBe('primary');
    expect(resolveProviderForCharacter(providers, taskBindings, characterBindings, 'world-b', 'alice', 'narrate_main', 'primary')?.id).toBe('world');
    expect(resolveProviderForCharacter(providers, taskBindings, [{ id: 'world-a:alice', saveId: 'world-a', characterId: 'alice', providerId: 'missing' }], 'world-a', 'alice', 'narrate_main', 'primary')?.id).toBe('world');
  });
  it('resolves TTS bindings by world and character, with default fallback', () => {
    const configs = [ttsBase, { ...ttsBase, id: 'tts-character', name: 'Character voice' }];
    const bindings = [{ id: 'world-a:alice', saveId: 'world-a', characterId: 'alice', ttsProviderId: 'tts-character' }];
    expect(resolveTtsProviderForCharacter(configs, bindings, 'world-a', 'alice', 'tts-default')?.id).toBe('tts-character');
    expect(resolveTtsProviderForCharacter(configs, bindings, 'world-b', 'alice', 'tts-default')?.id).toBe('tts-default');
    expect(resolveTtsProviderForCharacter(configs, [{ ...bindings[0], ttsProviderId: 'missing' }], 'world-a', 'alice', 'tts-default')?.id).toBe('tts-default');
    expect(resolveTtsProviderForCharacter(configs, bindings, 'world-a', 'bob', 'missing')).toBeUndefined();
  });
  it('rejects an empty character binding', () => {
    expect(() => CharacterProviderBindingSchema.parse({ id: 'world-a:alice', saveId: 'world-a', characterId: 'alice' })).toThrow();
  });
  it('applies generic templates, custom headers, response paths, and framing', () => {
    const config: ProviderConfig = { ...base, kind: 'generic', headers: { 'x-client': 'tokimeki' }, bodyTemplate: '{"model":{{model}},"messages":{{messages}}}', responsePath: '$.output.text', streamFraming: 'sse' };
    const adapter = getAdapter('generic');
    const prepared = adapter.prepare(config, { messages: [{ role: 'user', content: 'hi' }] });
    expect((prepared.init.headers as Record<string, string>)['x-client']).toBe('tokimeki');
    expect(JSON.parse(String(prepared.init.body))).toEqual({ model: 'demo', messages: [{ role: 'user', content: 'hi' }] });
    expect(adapter.extractText(config, { output: { text: 'complete' } })).toBe('complete');
    expect(adapter.extractStreamText(config, 'data: {"output":{"text":"stream"}}')).toBe('stream');
    expect(adapter.extractStreamText({ ...config, streamFraming: 'ndjson' }, '{"output":{"text":"line"}}')).toBe('line');
    expect(adapter.extractStreamText({ ...config, streamFraming: 'json' }, '{"output":{"text":"deferred"}}')).toBeNull();
  });
  it('lists models for OpenAI-compatible providers', async () => { const models = await listProviderModels(base, async () => new Response(JSON.stringify({ data: [{ id: 'one' }, { id: 'two' }] }), { status: 200 })); expect(models).toEqual(['one', 'two']); });
  it('allows model discovery before a model is selected and sends auth', async () => {
    let request: RequestInfo | URL | undefined; let init: RequestInit | undefined;
    const models = await listProviderModels({ ...base, model: '', apiKey: 'secret' }, async (input, options) => { request = input; init = options; return new Response(JSON.stringify({ data: [{ id: 'one' }] }), { status: 200 }); });
    expect(models).toEqual(['one']); expect(String(request)).toBe('https://example.test/v1/models'); expect((init?.headers as Record<string, string>).authorization).toBe('Bearer secret');
  });
  it('normalizes base and full endpoints without duplicating paths', () => {
    expect(openAiChatUrl('https://example.test/v1')).toBe('https://example.test/v1/chat/completions');
    expect(openAiChatUrl('https://example.test/v1/chat/completions')).toBe('https://example.test/v1/chat/completions');
    expect(openAiModelsUrl('https://example.test/v1/chat/completions')).toBe('https://example.test/v1/models');
    expect(geminiGenerateUrl('https://example.test/v1beta', 'gemini-pro', true)).toBe('https://example.test/v1beta/models/gemini-pro:streamGenerateContent?alt=sse');
    expect(geminiModelsUrl('https://example.test/v1beta/models/gemini-pro:generateContent')).toBe('https://example.test/v1beta/models');
  });
});

describe('connection test classification', () => {
  it('classifies auth, not found, timeout, CORS and format failures', async () => {
    const response = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); const run = (fetchImpl: typeof fetch) => testProviderConnection(base, { fetchImpl, timeoutMs: 10 });
    expect((await run(async () => response(401, {}))).kind).toBe('unauthorized'); expect((await run(async () => response(404, {}))).kind).toBe('not_found'); expect((await run(async () => response(200, {}))).kind).toBe('format'); expect((await run(async () => { throw new TypeError('Failed to fetch'); })).kind).toBe('cors'); expect((await run((_url, init) => new Promise<Response>((_, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); }))).kind).toBe('timeout');
  });
});

describe('stream fallback', () => {
  it('falls back to a normal JSON response and reports request lifecycle', async () => { const chunks = [new TextEncoder().encode(JSON.stringify({ choices: [{ message: { content: 'fallback text' } }] }))]; const body = new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }); const received: string[] = []; const statuses: string[] = []; const result = await streamChat(base, [{ role: 'user', content: 'hi' }], (text) => received.push(text), { fetchImpl: async () => new Response(body, { status: 200 }), onStatus: (status) => statuses.push(status) }); expect(result).toBe('fallback text'); expect(received).toEqual(['fallback text']); expect(statuses).toEqual(['requesting', 'generating', 'success']); });
  it('streams generic SSE frames through the configured response path', async () => {
    const config: ProviderConfig = { ...base, kind: 'generic', responsePath: '$.output.text', streamFraming: 'sse' };
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"output":{"text":"one"}}\n\ndata: {"output":{"text":"two"}}\n\n')); controller.close(); } });
    const received: string[] = [];
    const result = await streamChat(config, [{ role: 'user', content: 'hi' }], (text) => received.push(text), { fetchImpl: async () => new Response(body, { status: 200 }) });
    expect(result).toBe('onetwo');
    expect(received).toEqual(['one', 'two']);
  });
});
