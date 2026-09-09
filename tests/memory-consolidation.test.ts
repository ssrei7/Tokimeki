import { buildMemoryConsolidationPrompt, countConsolidationMessages, parseMemoryConsolidationResponse, shouldConsolidateMemories } from '../src/core/relationship/consolidation';
import { describe, expect, it } from 'vitest';

describe('memory consolidation', () => {
  const messages = [
    { role: 'user' as const, content: '我喜欢下雨天。' },
    { role: 'assistant' as const, content: '我记住了。' },
    { role: 'user' as const, content: '下次一起听海浪声吧。' },
    { role: 'assistant' as const, content: '好啊。' },
    { role: 'user' as const, content: '我周末通常在码头。' },
    { role: 'assistant' as const, content: '那我会去找你。' },
  ];

  it('uses a six-message threshold and builds a single transcript prompt', () => {
    expect(countConsolidationMessages(messages)).toBe(6);
    expect(shouldConsolidateMemories(messages)).toBe(true);
    expect(shouldConsolidateMemories(messages.slice(0, 5))).toBe(false);
    expect(buildMemoryConsolidationPrompt(messages, 'seir', '塞伊尔')).toHaveLength(2);
  });

  it('parses bounded JSON candidates and fails closed', () => {
    expect(parseMemoryConsolidationResponse('```json\n[{"target":"seir","text":"喜欢下雨天","type":"preference","importance":"normal"}]\n```')).toMatchObject([{ target: 'seir', type: 'preference' }]);
    expect(parseMemoryConsolidationResponse('[{"target":"seir"}]')).toEqual([]);
    expect(parseMemoryConsolidationResponse('not json')).toEqual([]);
  });
});
