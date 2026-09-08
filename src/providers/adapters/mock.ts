import { adaptTopicTreeFixture, getMockFixture, MOCK_FIXTURE_IDS } from '../mock/fixtures';
import type { ChatRequest, PreparedRequest, ProviderAdapter, ProviderConfig } from '../types';

export const mockAdapter: ProviderAdapter = {
  kind: 'mock',
  prepare(config: ProviderConfig, _request: ChatRequest): PreparedRequest {
    return { url: config.endpoint, init: { method: 'POST' } };
  },
  extractText: (_config, payload) => typeof payload === 'string' ? payload : null,
  extractStreamText: (_config, chunk) => chunk,
  async *stream(config, request) {
    const taskId = request.taskId ?? 'narrate_main';
    const baseFixture = getMockFixture(taskId, config.model);
    const fixture = taskId === 'topic_tree' ? adaptTopicTreeFixture(baseFixture, request.messages) : adaptGiftFixture(baseFixture, request.messages);
    for (const chunk of fixture.chunks) yield chunk;
    if (fixture.errorAfterChunks) throw new Error(fixture.errorAfterChunks);
  },
  listModels: async () => [...MOCK_FIXTURE_IDS],
};

function adaptGiftFixture(fixture: ReturnType<typeof getMockFixture>, messages: readonly { role: string; content: string }[]): ReturnType<typeof getMockFixture> {
  const context = messages.find((message) => message.content.includes('[送礼回应上下文]'))?.content;
  if (!context) return fixture;
  const giftId = context.match(/礼物 id：([^）]+）?)/)?.[1]?.replace(/）$/, '');
  const charName = context.match(/送给([^（]+)（礼物/)?.[1];
  if (!giftId && !charName) return fixture;
  return { ...fixture, chunks: fixture.chunks.map((chunk) => chunk.replace('gift-placeholder', giftId ?? 'gift-placeholder').replace('塞伊尔', charName ?? '塞伊尔')) };
}

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
