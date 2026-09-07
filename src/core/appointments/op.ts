import type { Appointment } from '../../data/schema/save';
import type { OpContext, OpResult } from '../ops/types';

type MakeAppointmentPayload = {
  op: 'make_appointment';
  id: string;
  charId: string;
  day: number;
  slotId: string;
  nodeId: string;
  note?: string;
};

export function makeAppointment(payload: MakeAppointmentPayload, context: OpContext): OpResult {
  const world = context.world;
  if (!world.characters[payload.charId] && !world.npcs[payload.charId]) return rejected(`Unknown appointment character: ${payload.charId}.`);
  if (world.appointments.some((appointment) => appointment.id === payload.id)) return rejected(`Appointment id already exists: ${payload.id}.`);
  if (payload.day <= context.day) return rejected('Appointment day must be in the future.');
  if (!context.calendar?.slots.some((slot) => slot.id === payload.slotId)) return rejected(`Unknown calendar slot: ${payload.slotId}.`);
  if (!world.map.nodes[payload.nodeId]) return rejected(`Unknown appointment location: ${payload.nodeId}.`);

  const appointment: Appointment = {
    id: payload.id,
    charId: payload.charId,
    day: payload.day,
    slotId: payload.slotId,
    nodeId: payload.nodeId,
    status: 'pending',
    ...(payload.note ? { note: payload.note.trim() } : {}),
  };
  const before = world.appointments.length;
  world.appointments.push(appointment);
  return { ok: true, changes: [{ path: 'world.appointments', before, after: world.appointments.length, description: `Created appointment ${payload.id}.` }] };
}

function rejected(warning: string): OpResult {
  return { ok: false, changes: [], warning };
}
