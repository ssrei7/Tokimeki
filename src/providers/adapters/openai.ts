import type { ProviderAdapter, ProviderConfig, ChatRequest, PreparedRequest } from '../types';

export const openAiAdapter: ProviderAdapter = {
  kind: 'openai-compatible',
  prepare(config: ProviderConfig, request: ChatRequest): PreparedRequest {
    return { url: config.endpoint, init: { method: 'POST', headers: { 'content-type': 'application/json', ...(config.headers ?? {}), ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) }, body: JSON.stringify({ model: config.model, messages: request.messages, temperature: config.temperature, max_tokens: config.maxOutputTokens, stream: request.stream ?? false }) } };
  },
  extractText: (_config, payload) => { const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content; return typeof content === 'string' ? content : null; },
  extractStreamText: (_config, chunk) => { const line = chunk.replace(/^data:\s*/, '').trim(); if (!line || line === '[DONE]') return null; try { const content = (JSON.parse(line) as { choices?: Array<{ delta?: { content?: unknown } }> }).choices?.[0]?.delta?.content; return typeof content === 'string' ? content : null; } catch { return null; } },
};
