import type { WorldState } from '../../data/schema/save';
import { listTerminalMessages, sendTerminalReplyMessage, type TerminalMessageResult } from './messages';

const NIGHT_SLOT_IDS = new Set(['night', 'late-night']);
const NIGHTLY_MESSAGE_TEMPLATES = [
  '夜深了，忽然想起你。今天过得还好吗？',
  '现在还没睡吗？有空的话，回我一句。',
  '今天路过一个地方，忽然想到你。',
  '夜里安静下来，想和你说声晚安。',
] as const;

export function isNightTerminalSlot(slotId: string): boolean {
  return NIGHT_SLOT_IDS.has(slotId);
}

function acceptedCharacterIds(world: WorldState): string[] {
  const accepted = new Set(world.terminal.friendRequests.filter((request) => request.status === 'accepted').map((request) => request.characterId));
  return [...accepted].filter((characterId) => Boolean(world.characters[characterId] ?? world.npcs[characterId])).sort();
}

function nightlyText(day: number): string {
  return NIGHTLY_MESSAGE_TEMPLATES[(Math.max(1, Math.floor(day)) - 1) % NIGHTLY_MESSAGE_TEMPLATES.length];
}

/** Deliver one deterministic local check-in when the clock enters a night slot. */
export function deliverNightlyTerminalMessage(world: WorldState, day = world.clock.day, slotId = world.clock.slotId): TerminalMessageResult {
  if (!isNightTerminalSlot(slotId)) return { ok: true, changed: false };
  const candidates = acceptedCharacterIds(world);
  if (!candidates.length) return { ok: true, changed: false };
  const normalizedDay = Math.max(1, Math.floor(day));
  const characterId = candidates[(normalizedDay - 1) % candidates.length];
  const existing = listTerminalMessages(world, characterId).find((message) => message.senderId === characterId && message.createdDay === normalizedDay && message.createdSlotId === slotId);
  if (existing) return { ok: true, changed: false, message: existing };
  return sendTerminalReplyMessage(world, characterId, nightlyText(day), day, slotId);
}
