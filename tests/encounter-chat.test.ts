import { describe, expect, it } from 'vitest';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { encounterPromptParticipant, encounterPromptParticipants, localEncounterOpening, parseEncounterChatSession, rejectNpcTargetedOps } from '../src/ui/encounter-chat';

function encounterSave() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'encounter-chat', title: 'Encounter chat', playerName: '旅人', day: 3, slotId: 'evening' }));
  save.world.characters.rin = {
    id: 'rin', name: '凛', tier: 'formal', card: { description: '花店店员', personality: '爽朗', firstMes: '欢迎。' }, visuals: { portraits: [] },
  };
  save.world.npcs.vendor = {
    id: 'vendor', name: '摊主', tier: 'semi', facts: ['经营夜市摊位'], tags: ['商贩'], lightMemory: ['见过旅人一次'],
  };
  return save;
}

describe('encounter chat session compatibility', () => {
  it('accepts legacy modes and the new opening/choice modes', () => {
    for (const mode of ['topics', 'manual', 'ended', 'opening', 'choice']) {
      expect(parseEncounterChatSession(JSON.stringify({ characterId: 'rin', participantIds: ['rin'], nodeId: 'start', mode }))?.mode).toBe(mode);
    }
  });

  it('rejects malformed sessions and sessions whose primary target is absent', () => {
    expect(parseEncounterChatSession('{bad')).toBeNull();
    expect(parseEncounterChatSession(JSON.stringify({ characterId: 'rin', participantIds: ['vendor'], nodeId: 'start', mode: 'choice' }))).toBeNull();
  });
});

describe('encounter participant prompt projection', () => {
  it('keeps formal cards complete and limits NPCs to facts, tags, and light memory', () => {
    const save = encounterSave();
    const cards = [{ id: 'rin', name: '凛', description: '完整角色卡简介', personality: '外向', firstMes: '嗨。', updatedAt: '2026-01-01T00:00:00.000Z' }];
    expect(encounterPromptParticipant(save.world, cards, 'rin')).toMatchObject({ tier: 'formal', description: '完整角色卡简介', personality: '外向', firstMes: '嗨。' });
    expect(encounterPromptParticipant(save.world, cards, 'vendor')).toEqual({ id: 'vendor', name: '摊主', tier: 'semi', facts: ['经营夜市摊位'], tags: ['商贩'], lightMemory: ['见过旅人一次'] });
    expect(encounterPromptParticipants(save.world, cards, ['vendor', 'rin', 'vendor']).map((item) => item.id)).toEqual(['vendor', 'rin']);
  });

  it('builds a deterministic local fallback from kernel-owned scene facts', () => {
    const save = encounterSave();
    const first = localEncounterOpening(save.world, ['rin', 'vendor']);
    const second = localEncounterOpening(save.world, ['rin', 'vendor']);
    expect(first).toBe(second);
    expect(first).toContain('第 3 天');
    expect(first).toContain('evening');
    expect(first).toContain(save.world.map.nodes.start.name);
    expect(first).toContain('凛、摊主');
  });

  it('rejects mixed-scene ops that explicitly target a semi-formal NPC', () => {
    const result = rejectNpcTargetedOps([
      { op: 'add_memory', target: 'vendor', text: '不应写入' },
      { op: 'give_item', id: 'flower', from: 'vendor' },
      { op: 'add_node_memory', nodeId: 'start', charIds: ['rin', 'vendor'], text: '不应写入' },
      { op: 'add_memory', target: 'rin', text: '正式角色可保留' },
      { op: 'set_flag', key: 'scene-seen', value: true },
    ], ['vendor']);
    expect(result.rejected).toBe(3);
    expect(result.ops).toEqual([
      { op: 'add_memory', target: 'rin', text: '正式角色可保留' },
      { op: 'set_flag', key: 'scene-seen', value: true },
    ]);
  });
});
