import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PromptAssembler } from '../src/core/prompt/assembler';
import { createDefaultPromptBlocks, DEFAULT_PROMPT_BLOCK_IDS } from '../src/core/prompt/default-blocks';
import { TOPIC_TREE_PROMPT_BLOCKS } from '../src/core/prompt/topic-tree';
import { exportPresetBundle, exportSaveZip, importPresetBundle, importSaveZip } from '../src/data/io/zip';
import { UnsupportedSchemaVersionError } from '../src/data/migrations/types';
import type { SaveFile } from '../src/data/schema/save';
import { createDefaultMap, CURRENT_SCHEMA_VERSION } from '../src/data/schema/save';
import { createBuiltinNarrationPresetBundle, mergeBuiltinNarrationPresetBundle } from '../src/data/presets/builtins';
import { buildRelationshipStatePrompt, deriveRelationshipPromptState } from '../src/core/relationship';

describe('prompt assembler', () => {
  it('orders blocks and reports truncation', () => { const assembler = new PromptAssembler(); assembler.register({ id: 'low', role: 'system', priority: 10, order: 2, build: () => 'low '.repeat(20) }); assembler.register({ id: 'high', role: 'system', priority: 100, order: 1, build: () => 'high' }); const result = assembler.assemble({}, { budget: 4 }); expect(result.blocks.find((b) => b.id === 'high')?.dropped).toBe(false); expect(result.estimatedTokens).toBeLessThanOrEqual(4); });

  it('assembles TopicTree with the selected preset and JSON-only contract', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    for (const block of TOPIC_TREE_PROMPT_BLOCKS) assembler.register(block);
    const builtin = createBuiltinNarrationPresetBundle();
    const result = assembler.assemble({
      input: '', worldbooks: [], history: [], world: undefined,
      presetBundle: { ...builtin, entries: [{ ...builtin.entries[0], systemPrompt: `${builtin.entries[0].systemPrompt}\nTOPIC_TREE_MARKER` }] },
      topicTreeRequest: { day: 3, slotId: 'noon', usedTopics: {} },
    }, { budget: 4096, task: 'topic_tree' });
    const content = result.messages.map((message) => message.content).join('\n');
    expect(content).toContain('TOPIC_TREE_MARKER');
    expect(content).toContain('只输出 JSON');
    expect(content).toContain('"day":3');
    expect(content).not.toContain('先输出自然语言正文');
    expect(result.blocks.find((block) => block.id === 'preset_bundle')?.skipped).toBe(false);
    expect(result.blocks.find((block) => block.id === 'topic_tree_contract')?.skipped).toBe(false);
  });

  it('anchors the player and explicit addressees before the primary character in multi-character scenes', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const result = assembler.assemble({
      input: '', worldbooks: [], history: [], world: undefined,
      character: { id: 'rin', name: '凛', description: '花店店员', personality: '爽朗。', updatedAt: '2026-01-01T00:00:00.000Z' },
      participants: [
        { id: 'rin', name: '凛', description: '花店店员', personality: '爽朗。', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'seir', name: '塞伊尔', description: '码头青年', personality: '安静。', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      playerPersona: { id: 'traveler', name: '旅行身份', displayName: '旅人', description: '刚来到港口的外乡人。', updatedAt: '2026-01-01T00:00:00.000Z' },
    }, { budget: 4096, task: 'narrate_main' });
    const cast = result.blocks.find((block) => block.id === 'encounter_participants');
    expect(cast?.text).toContain('玩家（叙事主角与旁白视角主体）：旅人');
    expect(cast?.text).toContain('凛（主要聊天角色）');
    expect(cast?.text).toContain('塞伊尔（其他在场角色）');
    expect(cast?.text).toContain('第一人称旁白中的“我”');
    expect(cast?.text).toContain('第二人称旁白中的“你”');
    expect(cast?.text).toContain('第三人称代词若可能与在场角色混淆');
    expect(cast?.text).toContain('不得让另一名角色无提示地当作玩家回答');
    expect(cast?.text).toContain('如果他们暂时无视玩家，也要描写玩家仍在场');
    expect(result.blocks.findIndex((block) => block.id === 'encounter_participants')).toBeLessThan(result.blocks.findIndex((block) => block.id === 'character_core'));
    expect(result.blocks.find((block) => block.id === 'character_core')?.text).toContain('当前主要聊天角色（非玩家）：凛');
  });

  it('registers all default blocks and reports blocks without stage data as skipped', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    expect(assembler.listBlocks().map((block) => block.id)).toEqual([...DEFAULT_PROMPT_BLOCK_IDS]);
    const result = assembler.assemble({ input: '', worldbooks: [], history: [], world: undefined }, { budget: 200, task: 'narrate_main' });
    expect(result.blocks).toHaveLength(16);
    expect(result.blocks.find((block) => block.id === 'relationship_state')?.skipped).toBe(true);
    expect(result.messages.some((message) => message.content.includes('开放世界叙事游戏'))).toBe(true);
  });

  it('adds a regeneration request after the existing history only when requested', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const result = assembler.assemble({ input: '上一句', worldbooks: [], history: [{ role: 'assistant', content: '原回复' }], regenerationRequest: '更温柔一些，并缩短为两句。', world: undefined }, { budget: 500, task: 'narrate_main' });
    expect(result.messages.at(-1)).toEqual({ role: 'user', content: '[重生成上一条角色回复]\n用户要求：更温柔一些，并缩短为两句。\n请只输出替代上一条回复的自然语言正文。不要输出或提议任何 <ops> 状态操作。' });
    expect(result.blocks.find((block) => block.id === 'regeneration_request')?.skipped).toBe(false);
  });

  it('adds gift context only for a gift reaction request', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks('- resolve_gift: confirm gift reaction')) assembler.register(block);
    const result = assembler.assemble({ input: '（你送出了白色小花。）', worldbooks: [], history: [], world: undefined, giftContext: { giftId: 'gift-3-1', charId: 'seir', charName: '塞伊尔', itemId: 'white-flower', itemName: '白色小花', tags: ['flower'] } }, { budget: 4096, task: 'narrate_main' });
    const gift = result.blocks.find((block) => block.id === 'gift_context');
    expect(gift?.text).toContain('gift-3-1');
    expect(gift?.text).toContain('resolve_gift');
    expect(gift?.text).toContain('不要输出 offer_gift');
  });

  it('injects deterministic relationship labels without exposing axes by default', () => {
    const world = {
      clock: { day: 10, slotId: 'evening' }, player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {},
      relations: { rin: { memories: [], axes: { affection: 60, trust: 20 }, mood: { word: '疲惫', setDay: 9, decayDays: 2 }, situation: '在花店收拾打烊', lastSeenDay: 6, stageId: 'acquaintance' } },
    } as unknown as import('../src/data/schema/save').WorldState;
    const rules = [{ id: 'acquaintance', name: '熟人', when: 'axes.affection >= 0', order: 1 }];
    const state = deriveRelationshipPromptState(world, 'rin', rules, false);
    const prompt = buildRelationshipStatePrompt(state);
    expect(prompt).toContain('阶段：熟人');
    expect(prompt).toContain('当前心情：疲惫');
    expect(prompt).toContain('当前处境：在花店收拾打烊');
    expect(prompt).toContain('距上次见面：4 天');
    expect(prompt).not.toContain('affection');
    expect(buildRelationshipStatePrompt({ ...state!, showNumbers: true })).toContain('affection=60');
  });

  it('includes registered op documentation in the format contract', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks('- add_stat example')) assembler.register(block);
    const result = assembler.assemble({ input: '', worldbooks: [], history: [], world: undefined }, { budget: 300, task: 'narrate_main' });
    expect(result.messages[0].content).toContain('<ops>');
    expect(result.messages[0].content).toContain('add_stat example');
  });

  it('injects enabled preset entries first and preserves their bundle order', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const result = assembler.assemble({ input: '', worldbooks: [], history: [], world: undefined, presetBundle: {
      id: 'bundle', name: '组合风格', updatedAt: '2026-01-01T00:00:00.000Z', entries: [
        { id: 'a', name: '短句', systemPrompt: '使用短句。', enabled: true, temperature: 0.5, maxOutputTokens: 100, updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', name: '克制', systemPrompt: '保持克制。', enabled: true, temperature: 0.5, maxOutputTokens: 100, updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'c', name: '停用', systemPrompt: '不应发送。', enabled: false, temperature: 0.5, maxOutputTokens: 100, updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    } }, { budget: 300, task: 'narrate_main' });
    expect(result.blocks[0].id).toBe('preset_bundle');
    expect(result.messages[0].content.indexOf('使用短句。')).toBeLessThan(result.messages[0].content.indexOf('保持克制。'));
    expect(result.messages[0].content).not.toContain('不应发送。');
    expect(result.messages[1].content).toContain('开放世界叙事游戏');
    expect(result.messages[1].content).not.toContain('不要替玩家决定');
  });

  it('provides editable built-in narration controls including character initiative', () => {
    const bundle = createBuiltinNarrationPresetBundle();
    expect(bundle.entries.map((entry) => entry.name)).toEqual(['玩家代写方式', '旁白人称', '角色主动性']);
    expect(bundle.entries.every((entry) => entry.enabled)).toBe(true);
  });

  it('adds new built-in controls without overwriting stored user edits', () => {
    const old = createBuiltinNarrationPresetBundle();
    old.entries = old.entries.slice(0, 2);
    old.entries[0] = { ...old.entries[0], enabled: false, systemPrompt: '用户自定义的代写规则。' };
    const merged = mergeBuiltinNarrationPresetBundle(old);
    expect(merged.entries).toHaveLength(3);
    expect(merged.entries[0]).toMatchObject({ enabled: false, systemPrompt: '用户自定义的代写规则。' });
    expect(merged.entries[2].name).toBe('角色主动性');
  });

  it('uses the latest edited diary text in prompt context', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const result = assembler.assemble({ input: '', worldbooks: [], history: [], world: {
      clock: { day: 3, slotId: 'morning' }, slotsUsedToday: 0,
      player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] },
      stats: {}, flags: {}, items: {}, relations: {}, settlements: [], characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [],
      map: createDefaultMap(),
      diary: [{ day: 1, text: '原文' }, { day: 2, text: '用户编辑后的日记', editedAt: '2026-09-05T00:00:00.000Z' }],
    } }, { budget: 4096, task: 'narrate_main' });
    expect(result.blocks.find((block) => block.id === 'recent_diary')?.text).toContain('用户编辑后的日记');
  });

  it('injects only the current participants’ recent relationship memories', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const memories = Array.from({ length: 6 }, (_, index) => ({ id: `m-${index}`, text: `记忆 ${index}`, day: index + 1, nodeId: 'start' }));
    const result = assembler.assemble({
      input: '', worldbooks: [], history: [],
      participants: [
        { id: 'rin', name: '凛', description: '花店店员', personality: '爽朗。', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      world: {
        clock: { day: 8, slotId: 'morning' }, slotsUsedToday: 0,
        player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {},
        relations: { rin: { axes: {}, knots: [], memories } }, settlements: [], characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [],
        map: createDefaultMap(), diary: [],
      },
    }, { budget: 4096, task: 'narrate_main' });
    const memory = result.blocks.find((block) => block.id === 'char_memory');
    expect(memory?.text).toContain('角色长期记忆');
    expect(memory?.text).toContain('记忆 5');
    expect(memory?.text).not.toContain('记忆 0');
    expect(memory?.text).toContain('第 6 天');
  });

  it('injects recent node memories with local character names', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const map = createDefaultMap();
    map.nodes.start.memories = [{ id: 'memory-1', text: '在这里等过雨停。', day: 2, charIds: ['seir'] }];
    const result = assembler.assemble({ input: '', worldbooks: [], history: [], world: { clock: { day: 3, slotId: 'morning' }, slotsUsedToday: 0, player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, settlements: [], characters: { seir: { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '测试', personality: '安静' }, visuals: { portraits: [] } } }, npcs: {}, npcTemplates: {}, encounterLog: [], map, diary: [] } }, { budget: 4096, task: 'narrate_main' });
    expect(result.blocks.find((block) => block.id === 'node_memory')?.text).toContain('塞伊尔');
    expect(result.blocks.find((block) => block.id === 'node_memory')?.text).toContain('在这里等过雨停');
  });

  it('injects node-bound worldbook before keyword matches without duplicating it', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const map = createDefaultMap();
    map.nodes.start.worldbookIds = ['docks-lore'];
    const result = assembler.assemble({ input: '港口', worldbooks: [
      { id: 'docks-lore', name: '码头设定', content: '潮湿的木栈桥。', keys: ['港口'], enabled: true, priority: 50 },
      { id: 'keyword-lore', name: '关键词设定', content: '关键词条目。', keys: ['港口'], enabled: true, priority: 50 },
    ], history: [], world: { clock: { day: 1, slotId: 'morning' }, slotsUsedToday: 0, player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map, diary: [], settlements: [], characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [] } }, { budget: 4096, task: 'narrate_main' });
    const node = result.blocks.find((block) => block.id === 'node_worldbook');
    const keyword = result.blocks.find((block) => block.id === 'worldbook_keyword');
    expect(node?.text).toContain('潮湿的木栈桥');
    expect(keyword?.text).toContain('关键词条目');
    expect(keyword?.text).not.toContain('潮湿的木栈桥');
    expect(result.blocks.findIndex((block) => block.id === 'node_worldbook')).toBeLessThan(result.blocks.findIndex((block) => block.id === 'worldbook_keyword'));
  });
});

describe('save zip IO', () => {
  const save = { schemaVersion: CURRENT_SCHEMA_VERSION, meta: { id: 'save', title: 'Test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' }, config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12, encounter: { enabled: true, triggerOnLeave: true, leaveProbability: 0.35, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} } }, world: { clock: { day: 1, slotId: 'morning' }, slotsUsedToday: 0, player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map: createDefaultMap(), diary: [], settlements: [], characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [], topicTrees: {}, usedTopics: {}, appointments: [] } } satisfies SaveFile;

  it('round trips save, assets, and all character chats without provider secrets', async () => {
    const chats = [
      { characterId: 'alice', messages: [{ role: 'user', content: 'one' }], updatedAt: '2026-01-01T00:00:00.000Z' },
      { characterId: 'bob', messages: [{ role: 'assistant', content: 'two' }], updatedAt: '2026-01-02T00:00:00.000Z' },
    ];
    const blob = await exportSaveZip(save, { 'a.bin': new Uint8Array([1, 2, 3]) }, { chats });
    const imported = await importSaveZip(blob);
    expect(imported.save.world.player.name).toBe('P');
    expect([...imported.assets.get('a.bin') ?? []]).toEqual([1, 2, 3]);
    expect(imported.extras.chats).toEqual(chats);
  });

  it('migrates a v0 save through the real zip import path', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ type: 'save', appVersion: '0.0.0', schemaVersion: 0 }));
    zip.file('save.json', JSON.stringify({ schemaVersion: 0, meta: { id: 'old', title: 'Old' }, player: { name: 'Old Player', nodeId: 'start' } }));
    const imported = await importSaveZip(await zip.generateAsync({ type: 'uint8array' }));
    expect(imported.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(imported.save.world.player.name).toBe('Old Player');
  });

  it('rejects a newer save through the real zip import path', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ type: 'save', appVersion: '999.0.0', schemaVersion: 999 }));
    zip.file('save.json', JSON.stringify({ schemaVersion: 999 }));
    const importing = importSaveZip(await zip.generateAsync({ type: 'uint8array' }));
    await expect(importing).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    await expect(importing).rejects.toThrow('请升级 Tokimeki');
  });
});

describe('preset bundle IO', () => {
  it('round trips multiple prompt presets as one bundle', async () => {
    const presets = [
      { id: 'quiet', name: '克制文风', systemPrompt: '短句、克制。', enabled: true, temperature: 0.4, maxOutputTokens: 800, updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'lyric', name: '抒情文风', systemPrompt: '细腻、抒情。', enabled: true, temperature: 0.8, maxOutputTokens: 1200, updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    await expect(importPresetBundle(await exportPresetBundle(presets))).resolves.toEqual(expect.objectContaining({ entries: presets }));
  });

  it('migrates a version 1 preset bundle by enabling legacy entries', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ type: 'preset', appVersion: '0.0.1', schemaVersion: 1 }));
    zip.file('preset-bundle.json', JSON.stringify({ id: 'legacy', name: '旧预设包', updatedAt: '2026-01-01T00:00:00.000Z', entries: [
      { id: 'legacy-entry', name: '旧条目', systemPrompt: '旧提示词。', temperature: 0.7, maxOutputTokens: 1024, updatedAt: '2026-01-01T00:00:00.000Z' },
    ] }));
    const imported = await importPresetBundle(await zip.generateAsync({ type: 'uint8array' }));
    expect(imported.entries[0].enabled).toBe(true);
  });
});
