import type { ChatMessage } from '../data/content';

const GIFT_MESSAGE_PREFIX = '（你送出了';
const COLLECTION_MESSAGE_PREFIX = '（你向对方出示了收藏';

/** Player free-form lines and character replies can be edited or deleted from chat history. */
export function isEditableChatMessage(message: ChatMessage): boolean {
  if (message.role !== 'user' && message.role !== 'assistant') return false;
  return !message.content.startsWith(GIFT_MESSAGE_PREFIX) && !message.content.startsWith(COLLECTION_MESSAGE_PREFIX);
}

export function updateChatMessage(messages: ChatMessage[], index: number, content: string): ChatMessage[] {
  const nextContent = content.trim();
  if (!nextContent || !messages[index] || !isEditableChatMessage(messages[index])) return messages;
  return messages.map((message, messageIndex) => {
    if (messageIndex !== index) return message;
    const { voice: _voice, ...withoutVoice } = message;
    return { ...withoutVoice, content: nextContent };
  });
}

export function deleteChatMessage(messages: ChatMessage[], index: number): ChatMessage[] {
  if (!messages[index] || !isEditableChatMessage(messages[index])) return messages;
  return messages.filter((_message, messageIndex) => messageIndex !== index);
}
