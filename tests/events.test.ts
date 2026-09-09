import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { EventBus } from '../src/core/events/bus';
import { listPendingEvents, refreshDirectorTension, scheduleDirectorEvent, scheduleEvent, scheduleEventsForCoordinate, setScheduledEventRevealed, triggerScheduledEvent, updateEventHistory } from '../src/core/events/director';
import { createDefaultOpRegistry } from '../src/core/ops';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { exportEventPackage, importEventPackage } from '../src/data/io/zip';
import type { EventDef } from '../src/data/schema/save';
import type { EventPackage } from '../src/data/content';

describe('event bus', () => {
  it('runs allowed hooks by descending priority and supports unsubscribe', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const removeLow = bus.subscribe('beforePromptAssemble', () => calls.push('low'), 1);
    bus.subscribe('beforePromptAssemble', () => calls.push('high'), 10);
    bus.emit('beforePromptAssemble', { facts: {}, task: 'narrate_main' });
    expect(calls).toEqual(['high', 'low']);
    removeLow();
    bus.emit('beforePromptAssemble', { facts: {}, task: 'narrate_main' });
    expect(calls).toEqual(['high', 'low', 'high']);
  });

  it('rejects hooks outside the AGENTS whitelist at runtime', () => {
    const bus = new EventBus();
    expect(() => bus.subscribe('onItemGain' as never, (() => undefined) as never)).toThrow('Unsupported hook');
    expect(() => bus.emit('onStatChange' as never, {} as never)).toThrow('Unsupported hook');
  });
});

function setup() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'events', title: 'Events', day: 3, slotId: 'noon' }));
  save.world.map.nodes.docks = { ...save.world.map.nodes.start, id: 'docks', name: '西码头', openSlots: ['noon'] };
  save.world.player.nodeId = 'docks';
  return save;
}

describe('deterministic local story events', () => {
  it('schedules a matching event once for a stable coordinate', () => {
    const save = setup();
    const event: EventDef = { id: 'dock-note', title: '码头的告示', trigger: { nodeIds: ['docks'], slotIds: ['noon'], scope: 'formal' }, content: '木桩上多了一张新告示。' };
    save.world.eventDefs = { [event.id]: event };
    const first = scheduleEventsForCoordinate(save.world, { nodeId: 'docks', day: 3, slotId: 'noon' });
    const second = scheduleEventsForCoordinate(save.world, { nodeId: 'docks', day: 3, slotId: 'noon' });
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(save.world.director?.scheduled).toEqual(first);
  });

  it('blocks formal events outside opening hours but allows peripheral events', () => {
    const save = setup();
    save.world.clock.slotId = 'evening';
    const formal: EventDef = { id: 'formal', title: '室内会面', trigger: { nodeIds: ['docks'], scope: 'formal' }, content: '正式会面。' };
    const peripheral: EventDef = { id: 'peripheral', title: '外围传闻', trigger: { nodeIds: ['docks'], scope: 'peripheral' }, content: '远处传来传闻。' };
    save.world.eventDefs = { formal, peripheral };
    expect(scheduleEventsForCoordinate(save.world, { nodeId: 'docks', day: 3, slotId: 'evening' }).map((item) => item.eventId)).toEqual(['peripheral']);
  });

  it('triggers static content locally and records the minimal event history', () => {
    const save = setup();
    const event: EventDef = { id: 'dock-note', title: '码头的告示', trigger: { nodeIds: ['docks'], slotIds: ['noon'] }, content: '木桩上多了一张新告示。', ops: [{ op: 'set_flag', key: 'saw_note', value: true }] };
    save.world.eventDefs = { [event.id]: event };
    const scheduled = scheduleEvent(save.world, event.id, { nodeId: 'docks', day: 3, slotId: 'noon' }).scheduled!;
    const result = triggerScheduledEvent(save.world, scheduled.id);
    expect(result.ok).toBe(true);
    expect(result.content).toBe(event.content);
    expect(result.ops).toEqual(event.ops);
    expect(save.world.director?.scheduled).toEqual([]);
    expect(save.world.eventHistory).toEqual([expect.objectContaining({ eventId: event.id, nodeId: 'docks', day: 3, slotId: 'noon', scope: 'formal', content: event.content })]);
    expect(save.world.eventHistory[0].narrative).toBe(event.content);
    const updated = updateEventHistory(save.world, save.world.eventHistory[0].id, { choice: '查看告示', resultSummary: '确认了港口的新安排。', narrative: '你在木桩前读完了告示。' });
    expect(updated.ok).toBe(true);
    expect(save.world.eventHistory[0]).toMatchObject({ choice: '查看告示', resultSummary: '确认了港口的新安排。', narrative: '你在木桩前读完了告示。' });
  });

  it('does not trigger a scheduled event at the wrong time or location', () => {
    const save = setup();
    const event: EventDef = { id: 'dock-note', title: '码头的告示', trigger: { nodeIds: ['docks'] }, content: '木桩上多了一张新告示。' };
    save.world.eventDefs = { [event.id]: event };
    const scheduled = scheduleEvent(save.world, event.id, { nodeId: 'docks', day: 4, slotId: 'noon' }).scheduled!;
    expect(triggerScheduledEvent(save.world, scheduled.id)).toMatchObject({ ok: false });
    expect(save.world.eventHistory ?? []).toHaveLength(0);
  });

  it('queues future events through the whitelisted op and exposes pending/revealed views locally', () => {
    const save = setup();
    const event: EventDef = { id: 'future-note', title: '三日后的告示', trigger: { nodeIds: ['docks'], slotIds: ['noon'] }, content: '届时再来。' };
    save.world.eventDefs = { [event.id]: event };
    const result = createDefaultOpRegistry().applyAll([{ op: 'queue_event', eventId: event.id, day: 6, slotId: 'noon', nodeId: 'docks' }], {
      world: save.world, day: 3, slotId: 'noon', nodeId: 'docks', log: () => undefined,
    }, 12);
    expect(result.applied).toBe(1);
    const pending = listPendingEvents(save.world, { revealed: false });
    expect(pending).toHaveLength(1);
    expect(setScheduledEventRevealed(save.world, pending[0].id)).toEqual({ ok: true });
    expect(listPendingEvents(save.world, { revealed: true })[0].revealed).toBe(true);
  });

  it('uses stable weighted selection and filters once/cooldown/condition eligibility', () => {
    const save = setup();
    const once: EventDef = { id: 'once', title: '一次事件', once: true, trigger: { nodeIds: ['docks'] }, content: '只发生一次。' };
    const blocked: EventDef = { id: 'blocked', title: '被条件挡住', trigger: { nodeIds: ['docks'] }, when: 'flags.never', content: '不会发生。' };
    const weighted: EventDef = { id: 'weighted', title: '加权事件', weight: 4, trigger: { nodeIds: ['docks'] }, content: '加权选择。' };
    save.world.eventDefs = { once, blocked, weighted };
    const first = scheduleDirectorEvent(save.world, { nodeId: 'docks', day: 3, slotId: 'noon' });
    const clone = structuredClone(save.world);
    clone.director.scheduled = [];
    const second = scheduleDirectorEvent(clone, { nodeId: 'docks', day: 3, slotId: 'noon' });
    expect(first?.eventId).toBe(second?.eventId);
    const trigger = first && triggerScheduledEvent(save.world, first.id);
    expect(trigger?.ok).toBe(true);
    const onceSave = setup();
    onceSave.world.eventDefs = { once };
    const onceScheduled = scheduleEvent(onceSave.world, once.id, { nodeId: 'docks', day: 3, slotId: 'noon' });
    expect(onceScheduled.ok).toBe(true);
    expect(triggerScheduledEvent(onceSave.world, onceScheduled.scheduled!.id).ok).toBe(true);
    onceSave.world.clock.day = 4;
    expect(scheduleDirectorEvent(onceSave.world, { nodeId: 'docks', day: 4, slotId: 'noon' })).toBeUndefined();
    save.world.clock.day = 4;
    expect(refreshDirectorTension(save.world, 10)).toBe(7);
  });
});

describe('event package IO', () => {
  it('round trips a static event package', async () => {
    const pack: EventPackage = { id: 'harbor-events', name: '港口事件', events: [{ id: 'e1', title: '小事', trigger: {}, content: '一阵风吹过。' }] };
    const blob = await exportEventPackage(pack);
    const imported = await importEventPackage(blob);
    expect(imported.manifest.type).toBe('events');
    expect(imported.pack).toMatchObject(pack);
  });

  it('imports the legacy event-package filename and rejects a future schema', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ type: 'events', appVersion: '0.0.1', schemaVersion: 22 }));
    zip.file('event-package.json', JSON.stringify({ id: 'legacy-events', name: '旧事件包', events: [{ id: 'legacy', title: '旧事件', trigger: {}, content: '旧内容。' }] }));
    const imported = await importEventPackage(await zip.generateAsync({ type: 'uint8array' }));
    expect(imported.pack.events[0].id).toBe('legacy');

    const future = new JSZip();
    future.file('manifest.json', JSON.stringify({ type: 'events', appVersion: '9.9.9', schemaVersion: 999 }));
    future.file('events.json', JSON.stringify({ id: 'future', name: '未来', events: [{ id: 'future', title: '未来事件', trigger: {}, content: '未来。' }] }));
    await expect(importEventPackage(await future.generateAsync({ type: 'uint8array' }))).rejects.toThrow('请升级 Tokimeki');
  });
});
