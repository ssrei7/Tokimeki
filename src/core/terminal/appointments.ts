import type { CalendarConfig, TerminalAppointmentRequest, WorldState } from '../../data/schema/save';
import { makeAppointment } from '../appointments/op';
import { isAcceptedFriend } from './contacts';

export type TerminalAppointmentDirection = TerminalAppointmentRequest['direction'];
export type TerminalAppointmentAction = 'accept' | 'reject' | 'revoke';

export interface TerminalAppointmentInput {
  day: number;
  slotId: string;
  nodeId: string;
  note?: string;
}

export interface TerminalAppointmentResult {
  ok: boolean;
  changed: boolean;
  warning?: string;
  request?: TerminalAppointmentRequest;
  appointment?: WorldState['appointments'][number];
}

function characterExists(world: WorldState, characterId: string): boolean {
  return Boolean(world.characters[characterId] ?? world.npcs[characterId]);
}

function latestRequest(world: WorldState, requestId: string): TerminalAppointmentRequest | undefined {
  return world.terminal.appointmentRequests.find((request) => request.id === requestId);
}

function requestId(world: WorldState, characterId: string, input: TerminalAppointmentInput, direction: TerminalAppointmentDirection): string {
  const base = `terminal-appointment-${characterId}-${direction}-${Math.max(1, Math.floor(input.day))}-${input.slotId}-${input.nodeId}`;
  return world.terminal.appointmentRequests.some((request) => request.id === base && request.status !== 'revoked' && request.status !== 'rejected')
    ? `${base}-${world.terminal.appointmentRequests.length + 1}`
    : base;
}

export function listTerminalAppointmentRequests(world: WorldState, characterId?: string): TerminalAppointmentRequest[] {
  return world.terminal.appointmentRequests.filter((request) => !characterId || request.characterId === characterId);
}

export function createTerminalAppointmentRequest(
  world: WorldState,
  calendar: CalendarConfig,
  characterId: string,
  input: TerminalAppointmentInput,
  direction: TerminalAppointmentDirection = 'outgoing',
  createdDay = world.clock.day,
): TerminalAppointmentResult {
  if (!characterExists(world, characterId)) return { ok: false, changed: false, warning: '约定联系人不存在。' };
  if (!isAcceptedFriend(world, characterId)) return { ok: false, changed: false, warning: '只有已接受的好友可以远程约定。' };
  const day = Math.floor(input.day);
  if (!Number.isFinite(day) || day <= world.clock.day) return { ok: false, changed: false, warning: '约定日期必须晚于当前日期。' };
  if (!calendar.slots.some((slot) => slot.id === input.slotId)) return { ok: false, changed: false, warning: '约定时段不存在。' };
  if (!world.map.nodes[input.nodeId]) return { ok: false, changed: false, warning: '约定地点不存在。' };
  const note = input.note?.trim();
  if (note && note.length > 200) return { ok: false, changed: false, warning: '约定备注不能超过 200 字。' };
  const duplicate = world.terminal.appointmentRequests.find((request) => request.characterId === characterId && request.direction === direction && (request.status === 'pending' || request.status === 'accepted') && request.day === day && request.slotId === input.slotId && request.nodeId === input.nodeId);
  if (duplicate) return { ok: true, changed: false, request: duplicate };
  const normalizedCreatedDay = Math.max(1, Math.floor(createdDay));
  const request: TerminalAppointmentRequest = {
    id: requestId(world, characterId, input, direction),
    characterId,
    direction,
    day,
    slotId: input.slotId,
    nodeId: input.nodeId,
    status: direction === 'outgoing' ? 'accepted' : 'pending',
    ...(note ? { note } : {}),
    createdDay: normalizedCreatedDay,
    updatedDay: normalizedCreatedDay,
  };
  world.terminal.appointmentRequests.push(request);
  return { ok: true, changed: true, request };
}

export function resolveTerminalAppointmentRequest(world: WorldState, requestIdValue: string, action: TerminalAppointmentAction, day = world.clock.day): TerminalAppointmentResult {
  const request = latestRequest(world, requestIdValue);
  if (!request) return { ok: false, changed: false, warning: '远程约定提议不存在。' };
  const targetStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'revoked';
  if (request.status === targetStatus) return { ok: true, changed: false, request };
  if (request.status !== 'pending') return { ok: true, changed: false, request };
  if (action === 'accept' && request.direction !== 'incoming') return { ok: false, changed: false, warning: '只能接受 TA 发来的约定提议。', request };
  if (action === 'reject' && request.direction !== 'incoming') return { ok: false, changed: false, warning: '只能拒绝 TA 发来的约定提议。', request };
  if (action === 'revoke' && request.direction !== 'outgoing') return { ok: false, changed: false, warning: '只能撤回自己发出的约定提议。', request };
  request.status = targetStatus;
  request.updatedDay = Math.max(1, Math.floor(day));
  return { ok: true, changed: true, request };
}

/** Apply an accepted terminal proposal to the existing local appointment fact. */
export function confirmTerminalAppointment(world: WorldState, calendar: CalendarConfig, requestIdValue: string): TerminalAppointmentResult {
  const request = latestRequest(world, requestIdValue);
  if (!request) return { ok: false, changed: false, warning: '远程约定提议不存在。' };
  const legacyPendingOutgoing = request.direction === 'outgoing' && request.status === 'pending';
  if (request.status !== 'accepted' && !legacyPendingOutgoing) return { ok: false, changed: false, warning: '只有已接受的约定提议才能加入日历。', request };
  const appointmentId = `terminal-appointment-${request.id}`;
  const existing = world.appointments.find((appointment) => appointment.id === appointmentId);
  if (existing) return { ok: true, changed: false, request, appointment: existing };
  const result = makeAppointment({ op: 'make_appointment', id: appointmentId, charId: request.characterId, day: request.day, slotId: request.slotId, nodeId: request.nodeId, note: request.note }, {
    world,
    day: world.clock.day,
    slotId: world.clock.slotId,
    nodeId: world.player.nodeId,
    calendar,
    log: () => undefined,
  });
  if (!result.ok) return { ok: false, changed: false, warning: result.warning, request };
  if (legacyPendingOutgoing) {
    request.status = 'accepted';
    request.updatedDay = Math.max(1, Math.floor(world.clock.day));
  }
  return { ok: true, changed: true, request, appointment: world.appointments.find((appointment) => appointment.id === appointmentId) };
}
