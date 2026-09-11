import type { TerminalCallRecord, WorldState } from '../../data/schema/save';
import { isAcceptedFriend } from './contacts';

export type TerminalCallStatus = TerminalCallRecord['status'];

export interface TerminalCallResult {
  ok: boolean;
  changed: boolean;
  warning?: string;
  record?: TerminalCallRecord;
}

function characterExists(world: WorldState, characterId: string): boolean {
  return Boolean(world.characters[characterId] ?? world.npcs[characterId]);
}

export function listTerminalCalls(world: WorldState, characterId?: string): TerminalCallRecord[] {
  return world.terminal.callRecords.filter((record) => !characterId || record.characterId === characterId);
}

/** Persist a completed, missed, or cancelled local call. No time or relationship facts are changed. */
export function recordTerminalCall(world: WorldState, characterId: string, status: TerminalCallStatus, startedDay: number, startedSlotId: string, endedDay = world.clock.day, endedSlotId = world.clock.slotId, callId = `call-${characterId}-${world.terminal.callRecords.length + 1}`): TerminalCallResult {
  if (!characterExists(world, characterId)) return { ok: false, changed: false, warning: '通话联系人不存在。' };
  if (!isAcceptedFriend(world, characterId)) return { ok: false, changed: false, warning: '只有已接受的好友可以通话。' };
  if (!['missed', 'completed', 'cancelled'].includes(status)) return { ok: false, changed: false, warning: '通话状态无效。' };
  const existing = world.terminal.callRecords.find((record) => record.id === callId);
  if (existing) return { ok: true, changed: false, record: existing };
  const record: TerminalCallRecord = {
    id: callId,
    characterId,
    startedDay: Math.max(1, Math.floor(startedDay)),
    startedSlotId,
    endedDay: Math.max(1, Math.floor(endedDay)),
    endedSlotId,
    status,
  };
  world.terminal.callRecords.push(record);
  return { ok: true, changed: true, record };
}
