import { describe, expect, it } from 'vitest';

import { createFriendRequest, listTerminalCalls, recordTerminalCall, simulateFriendAcceptance } from '../src/core/terminal';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

function makeSave() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'terminal-calls', title: 'Terminal calls' }));
  save.world.characters.formal = {
    id: 'formal', name: '正式角色', tier: 'formal', card: { description: '正式', personality: '稳重' },
    visuals: { portraits: [] }, homeNodeId: 'start', schedule: { grid: {}, overrides: {} },
  };
  return save;
}

describe('terminal calls', () => {
  it('records completed, missed and cancelled local calls idempotently', () => {
    const save = makeSave();
    const request = createFriendRequest(save.world, 'formal', 'outgoing');
    simulateFriendAcceptance(save.world, request.request!.id);
    const before = JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory });
    expect(recordTerminalCall(save.world, 'formal', 'completed', 1, 'morning', 1, 'noon', 'call-1')).toMatchObject({ ok: true, changed: true, record: { status: 'completed' } });
    expect(recordTerminalCall(save.world, 'formal', 'completed', 1, 'morning', 1, 'noon', 'call-1').changed).toBe(false);
    expect(recordTerminalCall(save.world, 'formal', 'missed', 1, 'evening', 1, 'evening', 'call-2')).toMatchObject({ ok: true, changed: true, record: { status: 'missed' } });
    expect(recordTerminalCall(save.world, 'formal', 'cancelled', 1, 'night', 1, 'night', 'call-3')).toMatchObject({ ok: true, changed: true, record: { status: 'cancelled' } });
    expect(listTerminalCalls(save.world, 'formal')).toHaveLength(3);
    expect(JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory })).toBe(before);
  });

  it('requires an existing accepted friend and rejects unknown call records', () => {
    const save = makeSave();
    expect(recordTerminalCall(save.world, 'formal', 'completed', 1, 'morning')).toMatchObject({ ok: false, changed: false });
    expect(recordTerminalCall(save.world, 'missing', 'completed', 1, 'morning')).toMatchObject({ ok: false, changed: false });
  });
});
