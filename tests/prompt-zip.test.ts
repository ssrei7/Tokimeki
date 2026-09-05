import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PromptAssembler } from '../src/core/prompt/assembler';
import { createDefaultPromptBlocks, DEFAULT_PROMPT_BLOCK_IDS } from '../src/core/prompt/default-blocks';
import { exportPresetBundle, exportSaveZip, importPresetBundle, importSaveZip } from '../src/data/io/zip';
import { UnsupportedSchemaVersionError } from '../src/data/migrations/types';
import type { SaveFile } from '../src/data/schema/save';
import { createDefaultMap } from '../src/data/schema/save';

describe('prompt assembler', () => {
  it('orders blocks and reports truncation', () => { const assembler = new PromptAssembler(); assembler.register({ id: 'low', role: 'system', priority: 10, order: 2, build: () => 'low '.repeat(20) }); assembler.register({ id: 'high', role: 'system', priority: 100, order: 1, build: () => 'high' }); const result = assembler.assemble({}, { budget: 4 }); expect(result.blocks.find((b) => b.id === 'high')?.dropped).toBe(false); expect(result.estimatedTokens).toBeLessThanOrEqual(4); });

  it('registers all default blocks and reports blocks without stage data as skipped', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    expect(assembler.listBlocks().map((block) => block.id)).toEqual([...DEFAULT_PROMPT_BLOCK_IDS]);
    const result = assembler.assemble({ input: '', worldbooks: [], history: [], world: undefined }, { budget: 200, task: 'narrate_main' });
    expect(result.blocks).toHaveLength(12);
    expect(result.blocks.find((block) => block.id === 'relationship_state')?.skipped).toBe(true);
    expect(result.messages.some((message) => message.content.includes('开放世界叙事游戏'))).toBe(true);
  });

  it('includes registered op documentation in the format contract', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks('- add_stat example')) assembler.register(block);
    const result = assembler.assemble({ input: '', worldbooks: [], history: [], world: undefined }, { budget: 300, task: 'narrate_main' });
    expect(result.messages[0].content).toContain('<ops>');
    expect(result.messages[0].content).toContain('add_stat example');
  });

  it('injects every entry from the selected preset bundle together', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const result = assembler.assemble({ input: '', worldbooks: [], history: [], world: undefined, presetBundle: {
      id: 'bundle', name: '组合风格', updatedAt: '2026-01-01T00:00:00.000Z', entries: [
        { id: 'a', name: '短句', systemPrompt: '使用短句。', temperature: 0.5, maxOutputTokens: 100, updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', name: '克制', systemPrompt: '保持克制。', temperature: 0.5, maxOutputTokens: 100, updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    } }, { budget: 300, task: 'narrate_main' });
    expect(result.messages[0].content).toContain('使用短句。');
    expect(result.messages[0].content).toContain('保持克制。');
  });

  it('uses the latest edited diary text in prompt context', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const result = assembler.assemble({ input: '', worldbooks: [], history: [], world: {
      clock: { day: 3, slotId: 'morning' }, slotsUsedToday: 0,
      player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] },
      stats: {}, flags: {}, items: {}, relations: {}, settlements: [],
      map: createDefaultMap(),
      diary: [{ day: 1, text: '原文' }, { day: 2, text: '用户编辑后的日记', editedAt: '2026-09-05T00:00:00.000Z' }],
    } }, { budget: 4096, task: 'narrate_main' });
    expect(result.blocks.find((block) => block.id === 'recent_diary')?.text).toContain('用户编辑后的日记');
  });

  it('injects node-bound worldbook before keyword matches without duplicating it', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const map = createDefaultMap();
    map.nodes.start.worldbookIds = ['docks-lore'];
    const result = assembler.assemble({ input: '港口', worldbooks: [
      { id: 'docks-lore', name: '码头设定', content: '潮湿的木栈桥。', keys: ['港口'], enabled: true, priority: 50 },
      { id: 'keyword-lore', name: '关键词设定', content: '关键词条目。', keys: ['港口'], enabled: true, priority: 50 },
    ], history: [], world: { clock: { day: 1, slotId: 'morning' }, slotsUsedToday: 0, player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map, diary: [], settlements: [] } }, { budget: 4096, task: 'narrate_main' });
    const node = result.blocks.find((block) => block.id === 'node_worldbook');
    const keyword = result.blocks.find((block) => block.id === 'worldbook_keyword');
    expect(node?.text).toContain('潮湿的木栈桥');
    expect(keyword?.text).toContain('关键词条目');
    expect(keyword?.text).not.toContain('潮湿的木栈桥');
    expect(result.blocks.findIndex((block) => block.id === 'node_worldbook')).toBeLessThan(result.blocks.findIndex((block) => block.id === 'worldbook_keyword'));
  });
});

describe('save zip IO', () => {
  const save = { schemaVersion: 4, meta: { id: 'save', title: 'Test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' }, config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12 }, world: { clock: { day: 1, slotId: 'morning' }, slotsUsedToday: 0, player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map: createDefaultMap(), diary: [], settlements: [] } } satisfies SaveFile;

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
    expect(imported.save.schemaVersion).toBe(4);
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
      { id: 'quiet', name: '克制文风', systemPrompt: '短句、克制。', temperature: 0.4, maxOutputTokens: 800, updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'lyric', name: '抒情文风', systemPrompt: '细腻、抒情。', temperature: 0.8, maxOutputTokens: 1200, updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    await expect(importPresetBundle(await exportPresetBundle(presets))).resolves.toEqual(expect.objectContaining({ entries: presets }));
  });
});
