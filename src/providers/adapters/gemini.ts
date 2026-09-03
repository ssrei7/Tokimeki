import type { ProviderAdapter, ProviderConfig, ChatRequest, PreparedRequest } from '../types';

export const geminiAdapter: ProviderAdapter = {
  kind: 'gemini',
  prepare(config: ProviderConfig, request: ChatRequest): PreparedRequest {
    const contents = request.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const system = request.messages.filter((m) => m.role === 'system').map((m) => ({ text: m.content }));
    return { url: config.endpoint, init: { method: 'POST', headers: { 'content-type': 'application/json', ...(config.headers ?? {}), ...(config.apiKey ? { 'x-goog-api-key': config.apiKey } : {}) }, body: JSON.stringify({ ...(system.length ? { systemInstruction: { parts: system } } : {}), contents, generationConfig: { temperature: config.temperature, maxOutputTokens: config.maxOutputTokens } }) } };
  },
  extractText: (_config, payload) => { const parts = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> })?.candidates?.[0]?.content?.parts; const text = parts?.map((p) => p.text).filter((p): p is string => typeof p === 'string').join(''); return text || null; },
  extractStreamText: (config, chunk) => { try { return geminiAdapter.extractText(config, JSON.parse(chunk)); } catch { return null; } },
};
