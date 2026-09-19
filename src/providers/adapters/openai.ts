import type { ProviderAdapter, ProviderConfig, ChatRequest, PreparedRequest } from '../types';
import { TOPIC_TREE_RESPONSE_SCHEMA } from '../structured-output';

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
    const body: Record<string, unknown> = { model: config.model, messages: request.messages, temperature: config.temperature, max_tokens: config.maxOutputTokens, stream: request.stream ?? false };
    if (request.taskId === 'topic_tree' && request.outputMode !== 'off') {
      body.response_format = request.outputMode === 'json_object' ? { type: 'json_object' } : { type: 'json_schema', json_schema: { name: 'topic_tree', strict: true, schema: TOPIC_TREE_RESPONSE_SCHEMA } };
    } else if (request.taskId === 'workshop_draft' && request.outputMode !== 'off') {
      body.response_format = { type: 'json_object' };
    }
    return { url: openAiChatUrl(config.endpoint), init: { method: 'POST', headers: headers(config), body: JSON.stringify(body) } };
  },
  extractText: (_config, payload) => { const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content; return typeof content === 'string' ? content : null; },
  extractStreamText: (_config, chunk) => { const line = chunk.replace(/^data:\s*/, '').trim(); if (!line || line === '[DONE]') return null; try { const content = (JSON.parse(line) as { choices?: Array<{ delta?: { content?: unknown } }> }).choices?.[0]?.delta?.content; return typeof content === 'string' ? content : null; } catch { return null; } },
  listModels: async (config, fetchImpl = fetch) => { const response = await fetchImpl(openAiModelsUrl(config.endpoint), { headers: headers(config) }); if (!response.ok) throw new Error(`模型列表请求失败（HTTP ${response.status}）`); const payload = await response.json() as { data?: Array<{ id?: unknown }> }; return (payload.data ?? []).map((item) => item.id).filter((id): id is string => typeof id === 'string'); },
};
