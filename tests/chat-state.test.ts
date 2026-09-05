import { describe, expect, it } from 'vitest';
import { canGenerateReply, hasQueuedUserMessage } from '../src/ui/chat-state';
import { splitDialogueMessage } from '../src/ui/dialogue';

describe('chat actions', () => {
  it('detects user messages waiting for a reply', () => {
    expect(hasQueuedUserMessage([{ role: 'user', content: 'one' }, { role: 'user', content: 'two' }])).toBe(true);
    expect(hasQueuedUserMessage([{ role: 'user', content: 'one' }, { role: 'assistant', content: 'reply' }])).toBe(false);
  });

  it('allows generation from text, queued messages, or an existing conversation', () => {
    expect(canGenerateReply([], '')).toBe(false);
    expect(canGenerateReply([], 'hello')).toBe(true);
    expect(canGenerateReply([{ role: 'user', content: 'hello' }], '')).toBe(true);
    expect(canGenerateReply([{ role: 'assistant', content: 'reply' }], '')).toBe(true);
  });
});

describe('dialogue line markers', () => {
  it('distinguishes speaker and narration while preserving plain legacy text', () => {
    expect(splitDialogueMessage({ role: 'assistant', content: '[说话人:凛] 你好。\n[旁白] 海风吹过。\n普通台词。' }, '塞伊尔')).toEqual([
      { kind: 'dialogue', speaker: '凛', text: '你好。' },
      { kind: 'narration', text: '海风吹过。' },
      { kind: 'dialogue', speaker: '塞伊尔', text: '普通台词。' },
    ]);
  });
});
