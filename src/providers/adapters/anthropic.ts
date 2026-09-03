import type { ProviderAdapter, ProviderConfig, ChatRequest, PreparedRequest } from '../types';

export const anthropicAdapter: ProviderAdapter = {
  kind: 'anthropic',
  prepare(config: ProviderConfig, request: ChatRequest): PreparedRequest {
    const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = request.messages.filter((m) => m.role !== 'system');
    return { url: config.endpoint, init: { method: 'POST', headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', ...(config.headers ?? {}), ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}) }, body: JSON.stringify({ model: config.model, max_tokens: config.maxOutputTokens, temperature: config.temperature, ...(system ? { system } : {}), messages, stream: request.stream ?? false }) } };
  },
  extractText: (_config, payload) => { const text = (payload as { content?: Array<{ type?: string; text?: unknown }> })?.content?.find((item) => item.type === 'text')?.text; return typeof text === 'string' ? text : null; },
  extractStreamText: (_config, chunk) => { try { const text = (JSON.parse(chunk.replace(/^data:\s*/, '').trim()) as { delta?: { text?: unknown } }).delta?.text; return typeof text === 'string' ? text : null; } catch { return null; } },
};
