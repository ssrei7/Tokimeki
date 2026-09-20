import { describe, expect, it } from 'vitest';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { buildNpcExpansionPrompt, buildPromoteNpcOp, characterCardFromPromotedCharacter, createNpcPromotionConversationContext, createNpcPromotionDraft, parseNpcExpansionResponse, summarizeNpcSchedule } from '../src/ui/npc-promotion';

describe('NPC promotion UI data', () => {
  it('prefills editable fields without mutating the semi-formal NPC', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'promotion-draft', title: 'Promotion draft' }));
    const npc = {
      id: 'vendor-1', name: '摊主', tier: 'semi' as const,
      facts: [' 卖花 ', '熟悉港口'], tags: [' 爽朗 ', '细心'], lightMemory: ['见过玩家'], homeNodeId: 'start',
    };
    save.world.npcs[npc.id] = npc;
    const before = structuredClone(npc);
    const draft = createNpcPromotionDraft(npc);
    draft.description = '玩家编辑后的简介。';
    expect(createNpcPromotionDraft(npc)).toMatchObject({ description: '卖花；熟悉港口', personality: '爽朗、细心' });
    expect(npc).toEqual(before);
    expect(save.world.characters[npc.id]).toBeUndefined();
  });

  it('trims the registered op payload and omits blank optional fields', () => {
    const op = buildPromoteNpcOp('vendor-1', {
      description: ' 经营花摊。 ', personality: ' 爽朗。 ', scenario: ' ', firstMes: ' 早上好。 ', exampleDialogue: '',
    });
    expect(op).toEqual({ op: 'promote_npc', target: 'vendor-1', description: '经营花摊。', personality: '爽朗。', firstMes: '早上好。' });
  });

  it('summarizes weekly and override schedules with local labels', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'promotion-schedule', title: 'Promotion schedule' }));
    const npc = {
      id: 'vendor-1', name: '摊主', tier: 'semi' as const, facts: [], tags: [], lightMemory: [], homeNodeId: 'start',
      schedule: {
        grid: { '0:morning': { nodeId: 'start', activity: '开店' } },
        overrides: { '3:evening': { nodeId: 'start', activity: '提前收摊' } },
      },
    };
    expect(summarizeNpcSchedule(npc, save.world.map.nodes, save.config.calendar)).toEqual([
      expect.stringContaining('开店'),
      expect.stringContaining('D3'),
    ]);
  });

  it('creates the content-library card from the promoted formal character', () => {
    const updatedAt = '2026-09-14T00:00:00.000Z';
    const card = characterCardFromPromotedCharacter({
      id: 'vendor-1', name: '摊主', tier: 'formal', card: { description: '经营花摊。', personality: '爽朗。', scenario: '港口清晨' },
      visuals: { portraits: [] }, schedule: { grid: {}, overrides: {} }, source: 'promoted',
    }, updatedAt);
    expect(card).toEqual({ id: 'vendor-1', name: '摊主', description: '经营花摊。', personality: '爽朗。', scenario: '港口清晨', updatedAt });
  });

  it('parses an explicit JSON expansion into a draft without accepting ops or facts outside the schema', () => {
    const fallback = { description: '原简介', personality: '原性格', scenario: '', firstMes: '', exampleDialogue: '' };
    const prompt = buildNpcExpansionPrompt({ id: 'npc', name: '路人', tier: 'semi', facts: ['卖花'], tags: ['细心'], lightMemory: [] }, fallback);
    expect(prompt[0].content).toContain('只返回一个 JSON 对象');
    expect(prompt[0].content).toContain('对话摘录只可用于推断口吻');
    expect(parseNpcExpansionResponse('建议如下：{"description":"新简介","personality":"新性格","scenario":"","firstMes":"你好","exampleDialogue":""}', fallback)).toEqual({ description: '新简介', personality: '新性格', scenario: '', firstMes: '你好', exampleDialogue: '' });
    expect(parseNpcExpansionResponse('{"description":"","personality":"新性格"}', fallback)).toEqual({ ...fallback, personality: '新性格' });
    expect(parseNpcExpansionResponse('{"description":"新简介","personality":"新性格","ops":[{"op":"set_flag"}]}', fallback)).toEqual({ ...fallback, description: '新简介', personality: '新性格' });
  });

  it('adds bounded relevant face-to-face and terminal dialogue excerpts to the expansion prompt', () => {
    const faceToFace = [
      { role: 'system' as const, content: '系统内容' },
      { role: 'user' as const, content: '  你喜欢什么花？  ', kind: 'dialogue' as const, speakerId: 'player' },
      { role: 'assistant' as const, content: '我喜欢清晨刚开的花。', kind: 'dialogue' as const, speakerId: 'npc' },
      { role: 'assistant' as const, content: '另一个角色的话', kind: 'dialogue' as const, speakerId: 'other' },
      { role: 'assistant' as const, content: '海风吹过。', kind: 'narration' as const, speakerId: 'npc' },
    ];
    const terminal = [
      { id: 't1', threadId: 'terminal-thread-npc', senderId: 'player', type: 'text' as const, text: '今天还开店吗？', createdDay: 1, createdSlotId: 'noon' },
      { id: 't2', threadId: 'terminal-thread-npc', senderId: 'npc', type: 'voice' as const, text: '给你留了一束。', createdDay: 1, createdSlotId: 'noon' },
      { id: 't3', threadId: 'terminal-thread-npc', senderId: 'npc', type: 'sticker' as const, createdDay: 1, createdSlotId: 'noon' },
    ];
    const context = createNpcPromotionConversationContext('npc', faceToFace, terminal);
    expect(context).toEqual({
      faceToFace: [{ speaker: 'player', text: '你喜欢什么花？' }, { speaker: 'character', text: '我喜欢清晨刚开的花。' }],
      terminal: [{ speaker: 'player', text: '今天还开店吗？' }, { speaker: 'character', text: '给你留了一束。' }],
    });
    const prompt = buildNpcExpansionPrompt({ id: 'npc', name: '花店老板', tier: 'semi', facts: ['经营花店'], tags: ['细心'], lightMemory: [] }, { description: '简介', personality: '性格', scenario: '', firstMes: '', exampleDialogue: '' }, context);
    expect(JSON.parse(prompt[1].content).conversationExcerpts).toEqual(context);
    const longMessages = Array.from({ length: 20 }, (_, index) => ({ role: 'user' as const, content: `${index}-${'字'.repeat(500)}` }));
    const bounded = createNpcPromotionConversationContext('npc', longMessages, []);
    expect(bounded.faceToFace).toHaveLength(12);
    expect(bounded.faceToFace.every((line) => line.text.length <= 320)).toBe(true);
  });
});
