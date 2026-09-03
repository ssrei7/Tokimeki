import type { ProviderAdapter, ProviderConfig, ChatRequest, PreparedRequest } from '../types';

function trimEndpoint(endpoint: string): string { return endpoint.replace(/\/+$/, ''); }
function geminiHeaders(config: ProviderConfig): Record<string, string> { return { 'content-type': 'application/json', ...(config.headers ?? {}), ...(config.apiKey ? { 'x-goog-api-key': config.apiKey } : {}) }; }
export function geminiGenerateUrl(endpoint: string, model: string, stream: boolean): string {
  const value = trimEndpoint(endpoint);
  if (/\/models\/[^/]+:(?:streamGenerateContent|generateContent)(?:\?.*)?$/i.test(value)) return value;
  return `${value}/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
}
export function geminiModelsUrl(endpoint: string): string {
  const value = trimEndpoint(endpoint).replace(/\/models\/[^/]+:(?:streamGenerateContent|generateContent)(?:\?.*)?$/i, '');
  return /\/models$/i.test(value) ? value : `${value}/models`;
}

export const geminiAdapter: ProviderAdapter = {
  kind: 'gemini',
  prepare(config: ProviderConfig, request: ChatRequest): PreparedRequest {
    const contents = request.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const system = request.messages.filter((m) => m.role === 'system').map((m) => ({ text: m.content }));
    return { url: geminiGenerateUrl(config.endpoint, config.model, request.stream ?? false), init: { method: 'POST', headers: geminiHeaders(config), body: JSON.stringify({ ...(system.length ? { systemInstruction: { parts: system } } : {}), contents, generationConfig: { temperature: config.temperature, maxOutputTokens: config.maxOutputTokens } }) } };
  },
  extractText: (_config, payload) => { const parts = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> })?.candidates?.[0]?.content?.parts; const text = parts?.map((p) => p.text).filter((p): p is string => typeof p === 'string').join(''); return text || null; },
  extractStreamText: (config, chunk) => { try { return geminiAdapter.extractText(config, JSON.parse(chunk.replace(/^data:\s*/, '').trim())); } catch { return null; } },
  listModels: async (config, fetchImpl = fetch) => { const response = await fetchImpl(geminiModelsUrl(config.endpoint), { headers: geminiHeaders(config) }); if (!response.ok) throw new Error(`模型列表请求失败（HTTP ${response.status}）`); const payload = await response.json() as { models?: Array<{ name?: unknown }> }; return (payload.models ?? []).map((item) => typeof item.name === 'string' ? item.name.replace(/^models\//, '') : null).filter((id): id is string => Boolean(id)); },
};
