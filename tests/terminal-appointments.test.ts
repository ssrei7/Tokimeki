import { describe, expect, it } from 'vitest';

import { confirmTerminalAppointment, createFriendRequest, createTerminalAppointmentRequest, listTerminalAppointmentRequests, resolveTerminalAppointmentRequest, simulateFriendAcceptance, simulateTerminalAppointmentAcceptance } from '../src/core/terminal';
import { migrateSave } from '../src/data/migrations';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

function makeSave() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'terminal-appointments', title: 'Terminal appointments' }));
  save.world.characters.formal = {
    id: 'formal', name: '正式角色', tier: 'formal', card: { description: '正式', personality: '稳重' },
    visuals: { portraits: [] }, homeNodeId: 'start', schedule: { grid: {}, overrides: {} },
  };
  return save;
}

function acceptFriend(save: ReturnType<typeof makeSave>) {
  const request = createFriendRequest(save.world, 'formal', 'outgoing');
  simulateFriendAcceptance(save.world, request.request!.id);
}

describe('terminal appointments', () => {
  it('migrates v40 saves with an empty appointment proposal container', () => {
    const save = makeSave();
    const legacy = structuredClone(save) as Record<string, unknown>;
    legacy.schemaVersion = 40;
    delete ((legacy.world as Record<string, unknown>).terminal as Record<string, unknown>).appointmentRequests;
    const migrated = migrateSave(legacy);
    expect(migrated.schemaVersion).toBe(41);
    expect(migrated.world.terminal.appointmentRequests).toEqual([]);
    expect(migrated.world.terminal.messageThreads).toEqual(save.world.terminal.messageThreads);
  });

  it('keeps outgoing proposals pending until simulated acceptance and explicit calendar confirmation', () => {
    const save = makeSave();
    acceptFriend(save);
    const before = JSON.stringify({ clock: save.world.clock, relations: save.world.relations, events: save.world.eventHistory });
    const created = createTerminalAppointmentRequest(save.world, save.config.calendar, 'formal', { day: 2, slotId: 'noon', nodeId: 'start', note: '一起喝茶' });
    expect(created).toMatchObject({ ok: true, changed: true, request: { direction: 'outgoing', status: 'pending' } });
    expect(save.world.appointments).toEqual([]);
    expect(createTerminalAppointmentRequest(save.world, save.config.calendar, 'formal', { day: 2, slotId: 'noon', nodeId: 'start' }).changed).toBe(false);
    expect(simulateTerminalAppointmentAcceptance(save.world, created.request!.id)).toMatchObject({ ok: true, changed: true, request: { status: 'accepted' } });
    expect(save.world.appointments).toEqual([]);
    expect(confirmTerminalAppointment(save.world, save.config.calendar, created.request!.id)).toMatchObject({ ok: true, changed: true, appointment: { charId: 'formal', day: 2, slotId: 'noon', nodeId: 'start', status: 'pending' } });
    expect(confirmTerminalAppointment(save.world, save.config.calendar, created.request!.id).changed).toBe(false);
    expect(save.world.appointments).toHaveLength(1);
    expect(JSON.stringify({ clock: save.world.clock, relations: save.world.relations, events: save.world.eventHistory })).toBe(before);
  });

  it('supports incoming accept/reject and outgoing revoke idempotently', () => {
    const save = makeSave();
    acceptFriend(save);
    const incoming = createTerminalAppointmentRequest(save.world, save.config.calendar, 'formal', { day: 2, slotId: 'morning', nodeId: 'start' }, 'incoming');
    expect(resolveTerminalAppointmentRequest(save.world, incoming.request!.id, 'accept')).toMatchObject({ ok: true, changed: true, request: { status: 'accepted' } });
    expect(resolveTerminalAppointmentRequest(save.world, incoming.request!.id, 'accept').changed).toBe(false);
    const rejected = createTerminalAppointmentRequest(save.world, save.config.calendar, 'formal', { day: 3, slotId: 'noon', nodeId: 'start' }, 'incoming');
    expect(resolveTerminalAppointmentRequest(save.world, rejected.request!.id, 'reject').request?.status).toBe('rejected');
    const outgoing = createTerminalAppointmentRequest(save.world, save.config.calendar, 'formal', { day: 4, slotId: 'evening', nodeId: 'start' });
    expect(resolveTerminalAppointmentRequest(save.world, outgoing.request!.id, 'revoke').request?.status).toBe('revoked');
    expect(listTerminalAppointmentRequests(save.world, 'formal')).toHaveLength(3);
  });

  it('rejects non-friends and invalid future coordinates', () => {
    const save = makeSave();
    expect(createTerminalAppointmentRequest(save.world, save.config.calendar, 'formal', { day: 2, slotId: 'noon', nodeId: 'start' }).ok).toBe(false);
    acceptFriend(save);
    expect(createTerminalAppointmentRequest(save.world, save.config.calendar, 'formal', { day: 1, slotId: 'noon', nodeId: 'start' }).ok).toBe(false);
    expect(createTerminalAppointmentRequest(save.world, save.config.calendar, 'formal', { day: 2, slotId: 'missing', nodeId: 'start' }).ok).toBe(false);
    expect(createTerminalAppointmentRequest(save.world, save.config.calendar, 'formal', { day: 2, slotId: 'noon', nodeId: 'missing' }).ok).toBe(false);
  });
});
