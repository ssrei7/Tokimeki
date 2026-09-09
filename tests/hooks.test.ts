import { describe, expect, it } from 'vitest';
import { findMatchingHooks, settleHookPool, syncLeadHooks, triggerHook } from '../src/core/world/hooks';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

describe('morning lead hook pool', () => {
  it('keeps untriggered leads available and matches location plus optional slot', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'hooks', title: 'Hooks' }));
    save.world.map.nodes.docks = { ...save.world.map.nodes.start, id: 'docks', name: '西码头', openSlots: ['noon'] };
    const added = syncLeadHooks(save.world, [{ id: 'morning-2-1', day: 2, category: 'lead', title: '码头动静', body: '去码头看看。', nodeId: 'docks', slotId: 'noon', charIds: [], source: 'local' }]);
    expect(added).toBe(1);
    expect(findMatchingHooks(save.world, 'docks', 'morning', 2)).toEqual([]);
    const matches = findMatchingHooks(save.world, 'docks', 'noon', 2);
    expect(matches).toHaveLength(1);
    save.world.clock.day = 2;
    expect(triggerHook(save.world, matches[0].hook.id).ok).toBe(true);
    expect(save.world.map.nodes.docks.memories.at(-1)).toMatchObject({ day: 2, charIds: [], text: expect.stringContaining('码头动静') });
    expect(findMatchingHooks(save.world, 'docks', 'noon', 2)).toEqual([]);
  });

  it('expires untriggered hooks after their expiry day', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'hooks-expire', title: 'Hooks expire' }));
    syncLeadHooks(save.world, [{ id: 'morning-2-1', day: 2, category: 'lead', title: '临时线索', body: '只有今天。', nodeId: 'start', charIds: [], expiresDay: 2, source: 'local' }]);
    expect(settleHookPool(save.world, 3)).toBe(1);
    expect(save.world.hooks[0].status).toBe('expired');
  });
});
