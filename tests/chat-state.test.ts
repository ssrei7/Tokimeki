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
      { kind: 'narration', text: '普通台词。' },
    ]);
    expect(splitDialogueMessage({ role: 'user', content: '我点了点头。' }, '塞伊尔', '旅人')).toEqual([{ kind: 'dialogue', speaker: '旅人', text: '我点了点头。' }]);
  });

  it('renders structured dialogue metadata and resolves speaker ids locally', () => {
    expect(splitDialogueMessage({ role: 'assistant', content: '欢迎回来。', kind: 'dialogue', speakerId: 'char-rin' }, '塞伊尔', '旅人', { 'char-rin': '凛' })).toEqual([{ kind: 'dialogue', speaker: '凛', text: '欢迎回来。' }]);
    expect(splitDialogueMessage({ role: 'user', content: '我留下。', kind: 'dialogue', speakerId: 'player' }, '塞伊尔', '旅人', { player: '旅人' })).toEqual([{ kind: 'dialogue', speaker: '旅人', text: '我留下。' }]);
    expect(splitDialogueMessage({ role: 'assistant', content: '灯光在雨里晕开。', kind: 'narration', speakerId: 'char-rin' }, '塞伊尔', '旅人', { 'char-rin': '凛' })).toEqual([{ kind: 'narration', text: '灯光在雨里晕开。' }]);
  });
});
