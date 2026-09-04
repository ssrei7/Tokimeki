import { getMockFixture, MOCK_FIXTURE_IDS } from '../mock/fixtures';
import type { ChatRequest, PreparedRequest, ProviderAdapter, ProviderConfig } from '../types';

export const mockAdapter: ProviderAdapter = {
  kind: 'mock',
  prepare(config: ProviderConfig, _request: ChatRequest): PreparedRequest {
    return { url: config.endpoint, init: { method: 'POST' } };
  },
  extractText: (_config, payload) => typeof payload === 'string' ? payload : null,
  extractStreamText: (_config, chunk) => chunk,
  async *stream(config, request) {
    const fixture = getMockFixture(request.taskId ?? 'narrate_main', config.model);
    for (const chunk of fixture.chunks) yield chunk;
    if (fixture.errorAfterChunks) throw new Error(fixture.errorAfterChunks);
  },
  listModels: async () => [...MOCK_FIXTURE_IDS],
};

export function createMockProviderConfig(fixtureId = 'perfect'): ProviderConfig {
  return {
    id: 'mock',
    name: 'Mock Provider',
    kind: 'mock',
    endpoint: 'mock://fixtures',
    model: fixtureId,
    contextWindow: 8192,
    maxOutputTokens: 1024,
    temperature: 0,
  };
}
