import { describe, expect, it } from 'vitest';
import { PromptAssembler } from '../src/core/prompt/assembler';
import { exportSaveZip, importSaveZip } from '../src/data/io/zip';
import type { SaveFile } from '../src/data/schema/save';

describe('prompt assembler', () => {
  it('orders blocks and reports truncation', () => { const assembler = new PromptAssembler(); assembler.register({ id: 'low', role: 'system', priority: 10, order: 2, build: () => 'low '.repeat(20) }); assembler.register({ id: 'high', role: 'system', priority: 100, order: 1, build: () => 'high' }); const result = assembler.assemble({}, { budget: 4 }); expect(result.blocks.find((b) => b.id === 'high')?.dropped).toBe(false); expect(result.estimatedTokens).toBeLessThanOrEqual(4); });
});

describe('save zip IO', () => {
  it('round trips save and assets without provider secrets', async () => { const save = { schemaVersion: 1, meta: { id: 'save', title: 'Test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' }, config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12 }, world: { clock: { day: 1, slotId: 'morning' }, player: { name: 'P', nodeId: 'start', stats: {}, flags: {}, inventory: [] } } } satisfies SaveFile; const blob = await exportSaveZip(save, { 'a.bin': new Uint8Array([1, 2, 3]) }); const imported = await importSaveZip(blob); expect(imported.save.world.player.name).toBe('P'); expect([...imported.assets.get('a.bin') ?? []]).toEqual([1, 2, 3]); });
});
