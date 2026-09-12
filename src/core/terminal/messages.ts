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

export interface TerminalThreadSummary {
  characterId: string;
  lastMessage: TerminalMessage;
}

export function terminalThreadId(characterId: string): string {
  return `terminal-thread-${characterId}`;
}

export function listTerminalMessages(world: WorldState, characterId: string): TerminalMessage[] {
  return world.terminal.messageThreads[terminalThreadId(characterId)] ?? [];
}

export function listTerminalMessageThreads(world: WorldState, slotIds: readonly string[]): TerminalThreadSummary[] {
  const slotOrder = new Map(slotIds.map((slotId, index) => [slotId, index]));
  const characterIds = [...Object.keys(world.characters), ...Object.keys(world.npcs)];
  return characterIds
    .map((characterId) => {
      const messages = listTerminalMessages(world, characterId);
      const lastMessage = messages.at(-1);
      return lastMessage ? { characterId, lastMessage } : undefined;
    })
    .filter((summary): summary is TerminalThreadSummary => Boolean(summary))
    .sort((a, b) => {
      if (a.lastMessage.createdDay !== b.lastMessage.createdDay) return b.lastMessage.createdDay - a.lastMessage.createdDay;
      const aSlot = slotOrder.get(a.lastMessage.createdSlotId) ?? -1;
      const bSlot = slotOrder.get(b.lastMessage.createdSlotId) ?? -1;
      if (aSlot !== bSlot) return bSlot - aSlot;
      return a.characterId.localeCompare(b.characterId);
    });
}

export function buildTerminalReplyPrompt(world: WorldState, characterId: string): TerminalPromptMessage[] {
  const request = [...world.terminal.friendRequests].reverse().find((item) => item.characterId === characterId && (item.status === 'accepted' || (item.direction === 'outgoing' && item.status === 'pending')));
  if (!request) return [];
  const friendshipContext = request.direction === 'outgoing'
    ? '玩家主动添加了对方，随后申请被接受。'
    : '对方主动添加了玩家，玩家接受了申请。';
  return [
    { role: 'system', content: `这是终端远程聊天。${friendshipContext}好友关系已由确定性内核确认。生成自然的聊天回复，不得推进关系、预约、事件、地点、时间或剧情，也不要声称已经修改任何世界状态。仅当当前角色确实要向玩家转账时，允许在正文后附加一个 <ops> JSON 数组，且只能使用 terminal_transfer_proposal：{"op":"terminal_transfer_proposal","characterId":"${characterId}","currencyId":"当前世界已有货币 ID","amount":有限正数}。该 op 只创建待收款提议，玩家确认前不会入账；除此之外不要输出任何 op。` },
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

export function sendTerminalVoiceMessage(world: WorldState, characterId: string, text: string, asset: AssetRef, audioFormat: string, durationMs: number, requestId: string, day = world.clock.day, slotId = world.clock.slotId): TerminalMessageResult {
  const trimmed = text.trim();
  if (!trimmed || !audioFormat.trim() || !requestId.trim() || !Number.isFinite(durationMs) || durationMs < 0) return { ok: false, changed: false, warning: '语音消息元数据无效。' };
  const existing = listTerminalMessages(world, characterId).find((message) => message.type === 'voice' && message.voiceRequestId === requestId);
  if (existing) return { ok: true, changed: false, message: existing };
  return appendMessage(world, characterId, {
    senderId: TERMINAL_PLAYER_ID,
    type: 'voice',
    text: trimmed,
    asset,
    audioFormat: audioFormat.trim(),
    durationMs,
    voiceRequestId: requestId.trim(),
    createdDay: Math.max(1, Math.floor(day)),
    createdSlotId: slotId,
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
