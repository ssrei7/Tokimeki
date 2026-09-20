import { describe, expect, it } from 'vitest';
import { WorkshopPackageRecordSchema, type WorkshopPackageRecord } from '../src/data/workshop';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { runWorkshopEvent, runWorkshopEventChoice, syncWorkshopEventDefinitions, workshopEventPackId } from '../src/features/workshop-event';

function eventRecord(options: { once?: boolean; promptOnly?: boolean; ops?: unknown[]; choices?: Array<{ id: string; label: string; resultSummary?: string; ops?: unknown[] }> } = {}): WorkshopPackageRecord {
  const operations = [...(options.ops ?? []), ...(options.choices ?? []).flatMap((choice) => choice.ops ?? [])];
  const opNames = [...new Set(operations.map((op) => (op as { op?: string }).op).filter((op): op is string => Boolean(op)))];
  return WorkshopPackageRecordSchema.parse({
    id: 'event.sample',
    package: {
      manifest: {
        type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'event.sample', name: '事件示例', author: 'Tester', version: '1.0.0',
        permissions: [
          { capability: 'event.install', resources: ['arrival'] },
          { capability: 'event.trigger', resources: ['arrival'] },
          ...(opNames.length ? [{ capability: 'op.submit' as const, resources: opNames }] : []),
        ],
      },
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '事件', components: [{ kind: 'button', label: '查看告示', action: { type: 'trigger-event', eventId: 'arrival' } }] }] },
      rules: { rules: [] },
      events: { events: [{
        id: 'arrival', title: '新的告示', trigger: { nodeIds: ['start'], slotIds: ['morning'] },
        ...(options.promptOnly ? { prompt: '生成一段告示内容。' } : { content: '你读完了刚贴出的告示。' }),
        ...(options.once ? { once: true } : {}),
        ...(options.ops ? { ops: options.ops } : {}),
        ...(options.choices ? { choices: options.choices } : {}),
      }] },
    },
    assetBindings: {}, installedAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
  });
}

function setup() {
  return seedScenario(createCurrentSaveScenario({ id: 'workshop-events', title: 'Workshop Events', day: 3, slotId: 'morning' }));
}

describe('workshop declarative events', () => {
  it('syncs enabled definitions without entering the random director pool and removes them when disabled', () => {
    const save = setup();
    const record = eventRecord();
    const installed = syncWorkshopEventDefinitions(save, [record]);
    expect(installed).toMatchObject({ changed: true, installed: 1, removed: 0, warnings: [] });
    expect(save.world.eventDefs.arrival).toMatchObject({ id: 'arrival', packId: workshopEventPackId(record.id), weight: 0 });

    save.world.director.scheduled.push({ id: 'scheduled-arrival', eventId: 'arrival', day: 4, slotId: 'morning', nodeId: 'start' });
    const removed = syncWorkshopEventDefinitions(save, []);
    expect(removed).toMatchObject({ changed: true, removed: 1 });
    expect(save.world.eventDefs.arrival).toBeUndefined();
    expect(save.world.director.scheduled).toHaveLength(0);
  });

  it('triggers a same-package event locally and atomically applies its declared ops', () => {
    const save = setup();
    const record = eventRecord({ once: true, ops: [{ op: 'set_flag', key: 'read_notice', value: true }] });
    syncWorkshopEventDefinitions(save, [record]);
    const result = runWorkshopEvent(record, 'arrival', save);
    expect(result).toMatchObject({ ok: true, message: '你读完了刚贴出的告示。' });
    expect(save.world.flags.read_notice).toBe(true);
    expect(save.world.eventHistory).toContainEqual(expect.objectContaining({ eventId: 'arrival', day: 3, nodeId: 'start' }));
    expect(runWorkshopEvent(record, 'arrival', save).ok).toBe(false);
  });

  it('rolls back event history and earlier effects when any event op is rejected', () => {
    const save = setup();
    const record = eventRecord({ ops: [
      { op: 'set_flag', key: 'should_rollback', value: true },
      { op: 'give_item', id: 'missing-item', count: 1 },
    ] });
    const result = runWorkshopEvent(record, 'arrival', save);
    expect(result.ok).toBe(false);
    expect(save.world.flags.should_rollback).toBeUndefined();
    expect(save.world.eventHistory).toHaveLength(0);
    const unsafe = runWorkshopEvent(eventRecord({ ops: [{ op: 'advance_time', slots: 1 }] }), 'arrival', save);
    expect(unsafe.message).toContain('非原子安全');
    expect(save.world.clock).toMatchObject({ day: 3, slotId: 'morning' });
  });

  it('resolves package event choices through the same atomic permission boundary', () => {
    const save = setup();
    const record = eventRecord({ choices: [{ id: 'read', label: '仔细阅读', resultSummary: '你记住了告示内容。', ops: [{ op: 'set_flag', key: 'notice_understood', value: true }] }] });
    const triggered = runWorkshopEvent(record, 'arrival', save);
    expect(triggered.ok).toBe(true);
    const resolved = runWorkshopEventChoice(record, triggered.historyId!, 'read', save);
    expect(resolved).toMatchObject({ ok: true, message: '你记住了告示内容。' });
    expect(save.world.flags.notice_understood).toBe(true);
    expect(save.world.eventHistory[0]).toMatchObject({ choice: '仔细阅读', resultSummary: '你记住了告示内容。' });
  });

  it('preserves conflicting world events and refuses prompt-only events without a Provider call', () => {
    const save = setup();
    save.world.eventDefs.arrival = { id: 'arrival', title: '世界原有事件', trigger: {}, content: '原有内容。' };
    const record = eventRecord();
    const synced = syncWorkshopEventDefinitions(save, [record]);
    expect(synced.warnings[0]).toContain('已有事件冲突');
    expect(save.world.eventDefs.arrival.title).toBe('世界原有事件');
    expect(runWorkshopEvent(record, 'arrival', save).message).toContain('冲突');

    delete save.world.eventDefs.arrival;
    expect(runWorkshopEvent(eventRecord({ promptOnly: true }), 'arrival', save).message).toContain('Prompt 能力');
  });
});
