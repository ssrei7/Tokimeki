import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PromptAssembler } from '../src/core/prompt/assembler';
import { exportSaveZip, importSaveZip } from '../src/data/io/zip';
import { UnsupportedSchemaVersionError } from '../src/data/migrations/types';
import type { SaveFile } from '../src/data/schema/save';

describe('prompt assembler', () => {
  it('orders blocks and reports truncation', () => { const assembler = new PromptAssembler(); assembler.register({ id: 'low', role: 'system', priority: 10, order: 2, build: () => 'low '.repeat(20) }); assembler.register({ id: 'high', role: 'system', priority: 100, order: 1, build: () => 'high' }); const result = assembler.assemble({}, { budget: 4 }); expect(result.blocks.find((b) => b.id === 'high')?.dropped).toBe(false); expect(result.estimatedTokens).toBeLessThanOrEqual(4); });
});

describe('save zip IO', () => {
  const save = { schemaVersion: 1, meta: { id: 'save', title: 'Test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' }, config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12 }, world: { clock: { day: 1, slotId: 'morning' }, player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] } } } satisfies SaveFile;

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
    expect(imported.save.schemaVersion).toBe(1);
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
