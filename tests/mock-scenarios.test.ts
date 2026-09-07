import { describe, expect, it } from 'vitest';
import { importSaveZip } from '../src/data/io/zip';
import { CURRENT_SCHEMA_VERSION, SaveFileSchema } from '../src/data/schema/save';
import { createCurrentSaveScenario, exportScenarioZip, seedScenario } from '../src/dev/scenarios/seeder';
import { createMockProviderConfig } from '../src/providers/adapters/mock';
import { MOCK_FIXTURE_IDS, MOCK_FIXTURES } from '../src/providers/mock/fixtures';
import { listProviderModels } from '../src/providers/models';
import { streamChat } from '../src/providers/stream';
import { TASK_IDS } from '../src/providers/types';
import { createStage4EncounterScenario } from '../src/dev/scenarios/stage4';

describe('mock provider', () => {
  it('groups every fixed fixture by TaskId', () => {
    for (const taskId of TASK_IDS) expect(Object.keys(MOCK_FIXTURES[taskId])).toEqual([...MOCK_FIXTURE_IDS]);
  });

  it('streams deterministically without calling fetch', async () => {
    const provider = createMockProviderConfig('perfect');
    const deltas: string[] = [];
    const statuses: string[] = [];
    const fetchImpl = async () => { throw new Error('Mock provider must not call fetch'); };
    const result = await streamChat(provider, [{ role: 'user', content: 'ignored' }], (delta) => deltas.push(delta), {
      taskId: 'narrate_daily', fetchImpl, onStatus: (status) => statuses.push(status),
    });
    expect(result).toBe(deltas.join(''));
    expect(result).toContain('[mock:narrate_daily]');
    expect(result).toContain('"op":"give_item"');
    expect(statuses).toEqual(['requesting', 'generating', 'success']);
    await expect(listProviderModels(provider, fetchImpl)).resolves.toEqual([...MOCK_FIXTURE_IDS]);
  });

  it('adapts topic tree fixture identity to the selected conversation character', async () => {
    const deltas: string[] = [];
    await streamChat(createMockProviderConfig('perfect'), [{ role: 'user', content: JSON.stringify({ day: 3, node: { id: 'docks' }, character: { id: 'rin', name: '凛' } }) }], (delta) => deltas.push(delta), { taskId: 'topic_tree' });
    const result = deltas.join('');
    expect(result).toContain('"charId":"rin"');
    expect(result).toContain('[说话人:凛]');
  });

  it('reproduces an interrupted stream after emitting partial text', async () => {
    const deltas: string[] = [];
    const statuses: string[] = [];
    await expect(streamChat(createMockProviderConfig('interrupted-stream'), [], (delta) => deltas.push(delta), {
      taskId: 'extract_ops', onStatus: (status) => statuses.push(status),
    })).rejects.toThrow('Mock stream interrupted for extract_ops');
    expect(deltas.join('')).toContain('流式正文已经开始');
    expect(statuses).toEqual(['requesting', 'generating', 'error']);
  });
});

describe('version-aware scenario seeder', () => {
  const definition = createCurrentSaveScenario({
    id: 'day-40-demo', title: '第 40 天演示', day: 40, stats: { money: 120 }, flags: { met: true },
  });

  it('creates deterministic saves that pass the current schema', () => {
    const first = seedScenario(definition);
    const second = seedScenario(definition);
    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(first.world.clock.day).toBe(40);
    expect(SaveFileSchema.safeParse(first).success).toBe(true);
  });

  it('migrates old scenario output and rejects a mismatched declaration', () => {
    const legacy = seedScenario({ id: 'legacy', schemaVersion: 0, create: () => ({ schemaVersion: 0, meta: { id: 'legacy', title: 'Legacy' }, player: { name: '旧玩家', nodeId: 'start' } }) });
    expect(legacy.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(() => seedScenario({ id: 'bad', schemaVersion: 0, create: () => ({ schemaVersion: 1 }) })).toThrow('declared schema v0');
  });

  it('exports a scenario through the ordinary save zip path', async () => {
    const imported = await importSaveZip(await exportScenarioZip(definition));
    expect(imported.manifest.type).toBe('save');
    expect(imported.save).toEqual(seedScenario(definition));
  });

  it('provides a deterministic stage 4 encounter fixture with scheduled characters', () => {
    const fixture = seedScenario(createStage4EncounterScenario());
    expect(fixture.world.clock).toEqual({ day: 3, slotId: 'noon' });
    expect(fixture.world.map.nodes.docks?.openSlots).toEqual(['noon']);
    expect(Object.keys(fixture.world.characters)).toEqual(['seir', 'rin']);
    expect(fixture.world.characters.seir.schedule?.grid['2:noon']?.nodeId).toBe('docks');
    expect(fixture.world.npcs['vendor-1']?.homeNodeId).toBe('docks');
  });
});
