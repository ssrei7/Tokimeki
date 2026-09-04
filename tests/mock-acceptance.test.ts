import { describe, expect, it } from 'vitest';
import { createDefaultOpRegistry, parseReply } from '../src/core/ops';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { MOCK_FIXTURES } from '../src/providers/mock/fixtures';

function runFixture(id: keyof typeof MOCK_FIXTURES.narrate_main) {
  const save = seedScenario(createCurrentSaveScenario({ id: `mock-${id}`, title: `Mock ${id}`, stats: { 'custom-reputation': 0 } }));
  save.world.items['white-flower'] = { id: 'white-flower', name: '白色小花', tags: ['flower'], stackable: true, giftable: true };
  return { save, raw: MOCK_FIXTURES.narrate_main[id].chunks.join('') };
}

describe('stage 1 acceptance through the deterministic mock provider fixtures', () => {
  it('reproduces valid item and stat changes without hand-written model output', async () => {
    const { save, raw } = runFixture('perfect');
    const reply = await parseReply(raw);
    const applied = createDefaultOpRegistry().applyAll(reply.ops, { world: save.world, actorId: 'seir', day: 1, slotId: 'morning', nodeId: 'start', log: () => undefined }, 12);
    expect(applied.applied).toBe(2);
    expect(save.world.player.inventory[0].itemId).toBe('white-flower');
    expect(save.world.player.stats['custom-reputation']).toBe(2);
  });

  it('reproduces malformed, unknown-op, clamp, and empty-ops acceptance cases', async () => {
    expect((await parseReply(runFixture('malformed').raw)).opsFailed).toBe(true);
    const unknown = await parseReply(runFixture('unregistered-op').raw);
    const unknownState = runFixture('unregistered-op').save;
    const unknownApplied = createDefaultOpRegistry().applyAll(unknown.ops, { world: unknownState.world, day: 1, slotId: 'morning', nodeId: 'start', log: () => undefined }, 12);
    expect(unknownApplied.applied).toBe(1);
    expect(unknownState.world.flags['mock-valid']).toBe(true);
    const clamp = await parseReply(runFixture('clamp-exceeded').raw);
    const clampState = runFixture('clamp-exceeded').save;
    const clampApplied = createDefaultOpRegistry().applyAll(clamp.ops, { world: clampState.world, day: 1, slotId: 'morning', nodeId: 'start', log: () => undefined }, 12);
    expect(clampState.world.player.stats['custom-reputation']).toBe(10);
    expect(clampApplied.warnings.join(' ')).toContain('clamped from 100 to 10');
    expect((await parseReply(runFixture('empty-ops').raw)).ops).toEqual([]);
  });
});
