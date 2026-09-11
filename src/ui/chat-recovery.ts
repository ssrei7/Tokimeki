import type { ChatMessage, ChatRecoveryRecord } from '../data/content';

export function createChatRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `chat-request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function markBackgroundRequestInterrupted(record: ChatRecoveryRecord | undefined): ChatRecoveryRecord | undefined {
  if (!record || (record.status !== 'requesting' && record.status !== 'generating')) return record;
  return { ...record, status: 'interrupted', updatedAt: new Date().toISOString() };
}

export function recoveryMessagesForRetry(record: ChatRecoveryRecord): ChatMessage[] {
  return record.baseMessages.map((message) => ({ ...message }));
}

export function recoveryHasAppliedOps(record: ChatRecoveryRecord | undefined): boolean {
  return Boolean(record?.opsApplied);
}
