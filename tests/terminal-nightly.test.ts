import { describe, expect, it } from 'vitest';

import { createFriendRequest, deliverNightlyTerminalMessage, listTerminalMessages, simulateFriendAcceptance } from '../src/core/terminal';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

function makeSave() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'terminal-nightly', title: 'Terminal nightly' }));
  for (const [id, name] of [['formal-a', '甲'], ['formal-b', '乙']] as const) {
    save.world.characters[id] = {
      id, name, tier: 'formal', card: { description: name, personality: '稳重' },
      visuals: { portraits: [] }, homeNodeId: 'start', schedule: { grid: {}, overrides: {} },
    };
    const request = createFriendRequest(save.world, id, 'outgoing');
    simulateFriendAcceptance(save.world, request.request!.id);
  }
  return save;
}

describe('nightly terminal messages', () => {
  it('delivers one deterministic check-in per night and is idempotent', () => {
    const save = makeSave();
    const before = JSON.stringify({ clock: save.world.clock, relations: save.world.relations });
    const first = deliverNightlyTerminalMessage(save.world, 1, 'night');
    expect(first).toMatchObject({ ok: true, changed: true, message: { senderId: 'formal-a', createdDay: 1, createdSlotId: 'night' } });
    expect(deliverNightlyTerminalMessage(save.world, 1, 'night').changed).toBe(false);
    expect(listTerminalMessages(save.world, 'formal-a')).toHaveLength(1);
    expect(listTerminalMessages(save.world, 'formal-b')).toHaveLength(0);
    expect(deliverNightlyTerminalMessage(save.world, 2, 'late-night').message?.senderId).toBe('formal-b');
    expect(JSON.stringify({ clock: save.world.clock, relations: save.world.relations })).toBe(before);
  });

  it('does nothing during daytime or without accepted friends', () => {
    const save = makeSave();
    expect(deliverNightlyTerminalMessage(save.world, 1, 'evening')).toMatchObject({ ok: true, changed: false });
    save.world.terminal.friendRequests = [];
    expect(deliverNightlyTerminalMessage(save.world, 1, 'night')).toMatchObject({ ok: true, changed: false });
  });
});
