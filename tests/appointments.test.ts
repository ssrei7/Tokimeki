import { describe, expect, it } from 'vitest';
import { markAppointmentOnEnter, markAppointmentOnTimeAdvance, settleAppointments } from '../src/core/appointments';
import { createDefaultOpRegistry, type OpContext } from '../src/core/ops';
import { settleDay } from '../src/core/time';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

function setup() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'appointments-test', title: 'Appointments', day: 1, slotId: 'morning' }));
  save.world.characters.seir = {
    id: 'seir', name: '塞伊尔', tier: 'formal',
    card: { description: '测试角色', personality: '安静' }, visuals: { portraits: [] }, schedule: { grid: {}, overrides: {} },
  };
  save.world.map.nodes.docks = { ...save.world.map.nodes.start, id: 'docks', name: '西码头' };
  const context: OpContext = {
    world: save.world, actorId: 'seir', day: 1, slotId: 'morning', nodeId: 'start',
    log: () => {}, calendar: save.config.calendar,
  };
  return { save, context, registry: createDefaultOpRegistry() };
}

describe('deterministic appointments', () => {
  it('creates future appointments and rejects invalid references', () => {
    const state = setup();
    expect(state.registry.applyAll([{ op: 'make_appointment', id: 'meet-seir', charId: 'seir', day: 2, slotId: 'noon', nodeId: 'docks', note: '一起喝茶' }], state.context, 12).applied).toBe(1);
    expect(state.save.world.appointments[0]).toMatchObject({ id: 'meet-seir', status: 'pending', day: 2, slotId: 'noon', nodeId: 'docks' });
    expect(state.registry.applyAll([{ op: 'make_appointment', id: 'duplicate', charId: 'missing', day: 2, slotId: 'noon', nodeId: 'docks' }], state.context, 12).rejected).toHaveLength(1);
    expect(state.registry.applyAll([{ op: 'make_appointment', id: 'past', charId: 'seir', day: 1, slotId: 'noon', nodeId: 'docks' }], state.context, 12).rejected).toHaveLength(1);
    expect(state.registry.applyAll([{ op: 'make_appointment', id: 'bad-slot', charId: 'seir', day: 2, slotId: 'missing', nodeId: 'docks' }], state.context, 12).rejected).toHaveLength(1);
    expect(state.registry.applyAll([{ op: 'make_appointment', id: 'bad-node', charId: 'seir', day: 2, slotId: 'noon', nodeId: 'missing' }], state.context, 12).rejected).toHaveLength(1);
  });

  it('marks a same-slot arrival kept and a later arrival late', () => {
    const state = setup();
    state.save.world.appointments.push({ id: 'kept', charId: 'seir', day: 1, slotId: 'noon', nodeId: 'docks', status: 'pending' });
    state.save.world.player.nodeId = 'docks';
    expect(markAppointmentOnTimeAdvance(state.save.world, state.save.config.calendar, 1, 'noon')).toEqual([{ id: 'kept', before: 'pending', after: 'kept' }]);
    state.save.world.appointments.push({ id: 'late', charId: 'seir', day: 1, slotId: 'evening', nodeId: 'docks', status: 'pending' });
    expect(markAppointmentOnEnter(state.save.world, state.save.config.calendar, 'docks', 1, 'night')).toEqual([{ id: 'late', before: 'pending', after: 'late' }]);
  });

  it('marks unfulfilled appointments missed and exposes tomorrow pending items', () => {
    const state = setup();
    state.save.world.appointments.push(
      { id: 'missed', charId: 'seir', day: 1, slotId: 'noon', nodeId: 'docks', status: 'pending' },
      { id: 'tomorrow', charId: 'seir', day: 2, slotId: 'evening', nodeId: 'docks', status: 'pending', note: '明晚见' },
    );
    const settlement = settleDay(state.save.world, state.save.config.calendar);
    expect(settleAppointments(state.save.world, 1, settlement)).toEqual([{ id: 'missed', before: 'pending', after: 'missed' }]);
    expect(state.save.world.appointments.find((item) => item.id === 'missed')?.status).toBe('missed');
    expect(settlement.appointmentsTomorrow).toEqual([expect.objectContaining({ id: 'tomorrow', status: 'pending', note: '明晚见' })]);
  });
});

