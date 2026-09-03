import { interpolateTemplate, readJsonPath } from '../json-path';
import type { ProviderAdapter, ProviderConfig, ChatRequest, PreparedRequest } from '../types';

export const genericAdapter: ProviderAdapter = {
  kind: 'generic',
  prepare(config: ProviderConfig, request: ChatRequest): PreparedRequest {
    const template = config.bodyTemplate ?? '{"model":{{model}},"messages":{{messages}},"stream":{{stream}}}';
    const body = interpolateTemplate(template, { model: config.model, messages: request.messages, stream: request.stream ?? false, temperature: config.temperature, maxOutputTokens: config.maxOutputTokens });
    return { url: config.endpoint, init: { method: 'POST', headers: { 'content-type': 'application/json', ...(config.headers ?? {}), ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) }, body } };
  },
  extractText: (config, payload) => { const value = readJsonPath(payload, config.responsePath); return typeof value === 'string' ? value : null; },
  extractStreamText: (config, chunk) => {
    const framing = config.streamFraming ?? 'sse';
    let payload = chunk.trim();
    if (framing === 'json') return null;
    if (framing === 'sse') {
      if (!payload.startsWith('data:')) return null;
      payload = payload.slice('data:'.length).trim();
      if (!payload || payload === '[DONE]') return null;
    }
    try { return genericAdapter.extractText(config, JSON.parse(payload)); } catch { return null; }
  },
};
