import type { ChatMessage } from '../data/content';

export function hasQueuedUserMessage(messages: ChatMessage[]): boolean {
  let lastAssistant = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') { lastAssistant = index; break; }
  }
  return messages.slice(lastAssistant + 1).some((message) => message.role === 'user');
}

export function canGenerateReply(messages: ChatMessage[], input: string): boolean {
  return Boolean(input.trim()) || messages.length > 0;
}

export type ReplyProgressIndicator = 'first-line' | 'next-line' | null;

export function replyProgressIndicator(active: boolean, requestStatus: 'idle' | 'requesting' | 'generating' | 'success' | 'error', hasCurrentAssistantText: boolean): ReplyProgressIndicator {
  if (!active || requestStatus === 'error') return null;
  if (requestStatus === 'requesting' || !hasCurrentAssistantText) return 'first-line';
  return 'next-line';
}
