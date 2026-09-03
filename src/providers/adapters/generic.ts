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
  extractStreamText: (config, chunk) => { try { return genericAdapter.extractText(config, JSON.parse(chunk)); } catch { return null; } },
};
