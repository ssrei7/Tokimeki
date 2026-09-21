import { describe, expect, it } from 'vitest';
import { activityInviteCandidates, buildActivityNarrationMessages, createConfirmedActivityNpc, parseActivityNarration, TemporaryNpcProposalSchema, validateActivityInvites } from '../src/core/place-activity';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { PlaceHighlightSchema } from '../src/data/schema/save';

function activitySave() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'place-activity', title: '活动测试', day: 3, slotId: 'evening' }));
  save.world.map.nodes.harbor = { ...save.world.map.nodes.start, id: 'harbor', name: '港口', discovered: true, pos: { x: 700, y: 350 } };
  save.world.player.nodeId = 'harbor';
  save.world.characters.rin = { id: 'rin', name: '凛', tier: 'formal', card: { description: '店员', personality: '爽朗' }, visuals: { portraits: [] }, homeNodeId: 'harbor' };
  save.world.npcs.vendor = { id: 'vendor', name: '摊主', tier: 'semi', facts: ['经营摊位'], tags: ['商贩'], lightMemory: [], homeNodeId: 'harbor' };
  save.world.npcs.away = { id: 'away', name: '远方的人', tier: 'semi', facts: [], tags: [], lightMemory: [], homeNodeId: 'start' };
  return save;
}

function highlight(kind: 'activity' | 'hotspot' = 'activity') {
  return PlaceHighlightSchema.parse({ id: 'harbor-event', nodeId: 'harbor', kind, title: '港口灯会', body: '灯火沿着水面展开。', allowsNewNpc: true, source: 'manual', createdDay: 3, updatedDay: 3 });
}

describe('place activity', () => {
  it('lists deterministic formal and semi-formal people at the activity location', () => {
    const save = activitySave();
    expect(activityInviteCandidates(save.world, 'harbor', 3, 'evening', 7).map((item) => [item.id, item.tier])).toEqual([['rin', 'formal'], ['vendor', 'semi']]);
  });

  it('rejects remote invites, hotspots, and participation away from the location', () => {
    const save = activitySave();
    expect(validateActivityInvites(save.world, highlight(), ['away']).ok).toBe(false);
    expect(validateActivityInvites(save.world, highlight('hotspot'), []).ok).toBe(false);
    save.world.player.nodeId = 'start';
    expect(validateActivityInvites(save.world, highlight(), []).ok).toBe(false);
  });

  it('bounds the one-call activity prompt and does not grant AI state authority', () => {
    const messages = buildActivityNarrationMessages({ playerName: '旅人', day: 3, slotId: 'evening', nodeName: '港口', highlight: highlight(), participants: [{ id: 'rin', name: '凛', tier: 'formal' }], requirements: '' });
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain('不得包含 ops');
    expect(JSON.parse(messages[1].content).activity.title).toBe('港口灯会');
  });

  it('parses narrative-only fallback and gates temporary NPCs by the activity flag', () => {
    expect(parseActivityNarration('一段活动叙事<ops>{"op":"set_flag"}</ops>', false)).toEqual({ narrative: '一段活动叙事' });
    expect(parseActivityNarration(JSON.stringify({ narrative: '灯会开始了。', newNpc: { name: '小葵', facts: ['喜欢灯谜'], tags: ['游客'] } }), true).newNpc?.name).toBe('小葵');
    expect(parseActivityNarration(JSON.stringify({ narrative: '灯会开始了。', newNpc: { name: '小葵', facts: ['喜欢灯谜'], tags: ['游客'] } }), false)).toEqual({ narrative: '灯会开始了。' });
    expect(parseActivityNarration(JSON.stringify({ narrative: '灯会仍在继续。', newNpc: { id: 'ai-chosen-id', name: '' } }), true)).toEqual({ narrative: '灯会仍在继续。' });
    expect(TemporaryNpcProposalSchema.safeParse({ name: 'x'.repeat(81), facts: [], tags: [] }).success).toBe(false);
  });

  it('creates a semi-formal NPC only after confirmation and retries conflicting ids', () => {
    const save = activitySave();
    let calls = 0;
    const proposal = { name: '小葵', facts: ['喜欢灯谜'], tags: ['游客'] };
    const npc = createConfirmedActivityNpc(proposal, save.world, () => calls++ === 0 ? 'rin' : 'activity-npc-1');
    expect(npc).toMatchObject({ id: 'activity-npc-1', tier: 'semi', homeNodeId: 'harbor', facts: ['喜欢灯谜'] });
    expect(save.world.npcs).not.toHaveProperty('activity-npc-1');
  });
});
