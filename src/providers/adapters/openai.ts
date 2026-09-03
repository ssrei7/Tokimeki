import type { ProviderAdapter, ProviderConfig, ChatRequest, PreparedRequest } from '../types';

function trimEndpoint(endpoint: string): string { return endpoint.replace(/\/+$/, ''); }
export function openAiChatUrl(endpoint: string): string {
  const value = trimEndpoint(endpoint);
  return /\/chat\/completions$/i.test(value) ? value : `${value}/chat/completions`;
}
export function openAiModelsUrl(endpoint: string): string {
  const value = trimEndpoint(endpoint);
  return /\/chat\/completions$/i.test(value) ? value.replace(/\/chat\/completions$/i, '/models') : /\/models$/i.test(value) ? value : `${value}/models`;
}

function headers(config: ProviderConfig): Record<string, string> {
  return { 'content-type': 'application/json', ...(config.headers ?? {}), ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) };
}

export const openAiAdapter: ProviderAdapter = {
  kind: 'openai-compatible',
  prepare(config: ProviderConfig, request: ChatRequest): PreparedRequest {
    return { url: openAiChatUrl(config.endpoint), init: { method: 'POST', headers: headers(config), body: JSON.stringify({ model: config.model, messages: request.messages, temperature: config.temperature, max_tokens: config.maxOutputTokens, stream: request.stream ?? false }) } };
  },
  extractText: (_config, payload) => { const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content; return typeof content === 'string' ? content : null; },
  extractStreamText: (_config, chunk) => { const line = chunk.replace(/^data:\s*/, '').trim(); if (!line || line === '[DONE]') return null; try { const content = (JSON.parse(line) as { choices?: Array<{ delta?: { content?: unknown } }> }).choices?.[0]?.delta?.content; return typeof content === 'string' ? content : null; } catch { return null; } },
  listModels: async (config, fetchImpl = fetch) => { const response = await fetchImpl(openAiModelsUrl(config.endpoint), { headers: headers(config) }); if (!response.ok) throw new Error(`模型列表请求失败（HTTP ${response.status}）`); const payload = await response.json() as { data?: Array<{ id?: unknown }> }; return (payload.data ?? []).map((item) => item.id).filter((id): id is string => typeof id === 'string'); },
};
