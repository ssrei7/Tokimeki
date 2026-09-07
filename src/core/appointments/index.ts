import type { CalendarConfig, DailySettlement, WorldState, Appointment } from '../../data/schema/save';

export interface AppointmentUpdate {
  id: string;
  before: Appointment['status'];
  after: Appointment['status'];
}

export { makeAppointment } from './op';

function slotOrder(calendar: CalendarConfig, slotId: string): number | undefined {
  return calendar.slots.find((slot) => slot.id === slotId)?.order;
}

function updateStatus(appointment: Appointment, status: Appointment['status'], updates: AppointmentUpdate[]): void {
  if (appointment.status === status) return;
  updates.push({ id: appointment.id, before: appointment.status, after: status });
  appointment.status = status;
}

/** Mark appointments when the player arrives at a location. */
export function markAppointmentOnEnter(
  world: WorldState,
  calendar: CalendarConfig,
  nodeId: string,
  day = world.clock.day,
  slotId = world.clock.slotId,
): AppointmentUpdate[] {
  const currentOrder = slotOrder(calendar, slotId);
  if (currentOrder === undefined) return [];
  const updates: AppointmentUpdate[] = [];
  for (const appointment of world.appointments) {
    if (appointment.status !== 'pending' || appointment.day !== day || appointment.nodeId !== nodeId) continue;
    const targetOrder = slotOrder(calendar, appointment.slotId);
    if (targetOrder === undefined) continue;
    updateStatus(appointment, currentOrder > targetOrder ? 'late' : 'kept', updates);
  }
  return updates;
}

/** Mark appointments as kept or late when a time transition reaches/passes their slot. */
export function markAppointmentOnTimeAdvance(
  world: WorldState,
  calendar: CalendarConfig,
  day: number,
  toSlotId: string,
): AppointmentUpdate[] {
  if (world.clock.day !== day) return [];
  const currentOrder = slotOrder(calendar, toSlotId);
  if (currentOrder === undefined) return [];
  const updates: AppointmentUpdate[] = [];
  for (const appointment of world.appointments) {
    if (appointment.status !== 'pending' || appointment.day !== day || appointment.nodeId !== world.player.nodeId) continue;
    const targetOrder = slotOrder(calendar, appointment.slotId);
    if (targetOrder === undefined || currentOrder < targetOrder) continue;
    updateStatus(appointment, currentOrder === targetOrder ? 'kept' : 'late', updates);
  }
  return updates;
}

/** Close today's appointments and expose tomorrow's pending list on the settlement. */
export function settleAppointments(world: WorldState, day: number, settlement?: DailySettlement): AppointmentUpdate[] {
  const updates: AppointmentUpdate[] = [];
  for (const appointment of world.appointments) {
    if (appointment.status === 'pending' && appointment.day <= day) updateStatus(appointment, 'missed', updates);
  }
  if (settlement) {
    settlement.appointmentsTomorrow = world.appointments
      .filter((appointment) => appointment.status === 'pending' && appointment.day === day + 1)
      .map((appointment) => ({ ...appointment }));
  }
  return updates;
}
