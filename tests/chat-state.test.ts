import { describe, expect, it } from 'vitest';
import { canGenerateReply, hasQueuedUserMessage } from '../src/ui/chat-state';

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
