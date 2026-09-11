import type { AssetRef, TerminalMessage, WorldState } from '../../data/schema/save';
import { isAcceptedFriend } from './contacts';

export const TERMINAL_PLAYER_ID = 'player';

export interface TerminalMessageResult {
  ok: boolean;
  changed: boolean;
  warning?: string;
  message?: TerminalMessage;
}

export interface TerminalPromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function terminalThreadId(characterId: string): string {
  return `terminal-thread-${characterId}`;
}

export function listTerminalMessages(world: WorldState, characterId: string): TerminalMessage[] {
  return world.terminal.messageThreads[terminalThreadId(characterId)] ?? [];
}

export function buildTerminalReplyPrompt(world: WorldState, characterId: string): TerminalPromptMessage[] {
  const request = [...world.terminal.friendRequests].reverse().find((item) => item.characterId === characterId && item.status === 'accepted');
  if (!request) return [];
  const friendshipContext = request.direction === 'outgoing'
    ? '玩家主动添加了对方，随后申请被接受。'
    : '对方主动添加了玩家，玩家接受了申请。';
  return [
    { role: 'system', content: `这是终端远程聊天。${friendshipContext}好友关系已由确定性内核确认。只生成自然的聊天回复，不要输出 JSON、ops、金额、预约、地点变更或剧情推进，不要声称修改任何世界状态。` },
    ...listTerminalMessages(world, characterId).slice(-30).map((message) => ({
      role: message.senderId === TERMINAL_PLAYER_ID ? 'user' as const : 'assistant' as const,
      content: message.text ?? `[${message.type}]`,
    })),
  ];
}

function appendMessage(world: WorldState, characterId: string, message: Omit<TerminalMessage, 'id' | 'threadId'>): TerminalMessageResult {
  if (!isAcceptedFriend(world, characterId)) return { ok: false, changed: false, warning: '只有已接受的好友可以开始终端聊天。' };
  const threadId = terminalThreadId(characterId);
  const current = world.terminal.messageThreads[threadId] ?? [];
  const next: TerminalMessage = { ...message, id: `${threadId}-${current.length + 1}`, threadId };
  world.terminal.messageThreads[threadId] = [...current, next];
  return { ok: true, changed: true, message: next };
}

export function sendTerminalTextMessage(world: WorldState, characterId: string, text: string, day = world.clock.day, slotId = world.clock.slotId, quoteMessageId?: string): TerminalMessageResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, changed: false, warning: '消息不能为空。' };
  const thread = listTerminalMessages(world, characterId);
  const quote = quoteMessageId ? thread.find((message) => message.id === quoteMessageId) : undefined;
  if (quoteMessageId && !quote) return { ok: false, changed: false, warning: '引用的消息不存在。' };
  return appendMessage(world, characterId, {
    senderId: TERMINAL_PLAYER_ID,
    type: 'text',
    text: trimmed,
    createdDay: Math.max(1, Math.floor(day)),
    createdSlotId: slotId,
    ...(quote ? { quoteMessageId: quote.id, quotePreview: quote.text ?? `[${quote.type}]` } : {}),
  });
}

export function sendTerminalStickerMessage(world: WorldState, characterId: string, asset: AssetRef, day = world.clock.day, slotId = world.clock.slotId, quoteMessageId?: string): TerminalMessageResult {
  const thread = listTerminalMessages(world, characterId);
  const quote = quoteMessageId ? thread.find((message) => message.id === quoteMessageId) : undefined;
  if (quoteMessageId && !quote) return { ok: false, changed: false, warning: '引用的消息不存在。' };
  return appendMessage(world, characterId, {
    senderId: TERMINAL_PLAYER_ID,
    type: 'sticker',
    asset,
    createdDay: Math.max(1, Math.floor(day)),
    createdSlotId: slotId,
    ...(quote ? { quoteMessageId: quote.id, quotePreview: quote.text ?? `[${quote.type}]` } : {}),
  });
}

export function sendTerminalReplyMessage(world: WorldState, characterId: string, text: string, day = world.clock.day, slotId = world.clock.slotId): TerminalMessageResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, changed: false, warning: '回复不能为空。' };
  return appendMessage(world, characterId, {
    senderId: characterId,
    type: 'text',
    text: trimmed,
    createdDay: Math.max(1, Math.floor(day)),
    createdSlotId: slotId,
  });
}
