import { describe, expect, it } from 'vitest';
import { markBackgroundRequestInterrupted, recoveryHasAppliedOps, recoveryMessagesForRetry } from '../src/ui/chat-recovery';
import type { ChatRecoveryRecord } from '../src/data/content';

const record = (status: ChatRecoveryRecord['status'] = 'generating'): ChatRecoveryRecord => ({
  characterId: 'char', requestId: 'request-1', status, input: '草稿', messages: [{ role: 'user', content: '你好' }, { role: 'assistant', content: '途中' }], baseMessages: [{ role: 'user', content: '你好' }], assistantText: '途中', raw: '途中', opsApplied: false, updatedAt: new Date().toISOString(),
});

describe('chat recovery', () => {
  it('marks only active requests interrupted', () => {
    expect(markBackgroundRequestInterrupted(record())?.status).toBe('interrupted');
    expect(markBackgroundRequestInterrupted(record('error'))?.status).toBe('error');
  });
  it('retries from the pre-response messages and preserves the draft separately', () => {
    expect(recoveryMessagesForRetry(record())).toEqual([{ role: 'user', content: '你好' }]);
    expect(record().input).toBe('草稿');
  });
  it('exposes persisted ops idempotency state', () => {
    expect(recoveryHasAppliedOps(record())).toBe(false);
    expect(recoveryHasAppliedOps({ ...record(), opsApplied: true })).toBe(true);
  });
});
