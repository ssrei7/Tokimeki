import { describe, expect, it } from 'vitest';
import { PromptAssembler, estimateTokens } from '../src/core/prompt/assembler';
import { WorkshopPackageRecordSchema, validateWorkshopPackage, type WorkshopPackageRecord } from '../src/data/workshop';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { createWorkshopPromptBlocks, registerWorkshopPromptBlocks, workshopPromptBlockId } from '../src/features/workshop-prompt';

type PromptSpec = {
  id?: string;
  role?: 'system' | 'user';
  priority?: number;
  order?: number;
  tokenBudget?: number;
  tasks?: Array<'narrate_main' | 'topic_tree' | 'summarize_day'>;
  text?: string;
  when?: string;
};

function promptRecord(packageId: string, blocks: PromptSpec[], options: { permissions?: unknown[] } = {}): WorkshopPackageRecord {
  const tasks = [...new Set(blocks.flatMap((block) => block.tasks ?? ['narrate_main']))];
  const promptBudget = blocks.reduce((total, block) => total + (block.tokenBudget ?? 64), 0);
  return WorkshopPackageRecordSchema.parse({
    id: packageId,
    package: {
      manifest: {
        type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: packageId, name: packageId, author: 'Tester', version: '1.0.0',
        permissions: options.permissions ?? [{ capability: 'prompt.register', resources: tasks, maxTokens: Math.max(1, promptBudget) }],
      },
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'text', text: '本地页面' }] }] },
      rules: { rules: [] },
      prompts: { blocks: blocks.map((block, index) => ({
        id: block.id ?? `block-${index}`,
        role: block.role ?? 'system',
        priority: block.priority ?? 50,
        order: block.order ?? 50,
        tokenBudget: block.tokenBudget ?? 64,
        tasks: block.tasks ?? ['narrate_main'],
        text: block.text ?? '包内静态提示。',
        ...(block.when ? { when: block.when } : {}),
      })) },
    },
    assetBindings: {}, installedAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
  });
}

function promptWorld() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'prompt-world', title: 'Prompt world', day: 3, slotId: 'morning' }));
  save.world.player.stats.energy = 4;
  save.world.flags.raining = true;
  save.world.relations.rin = { axes: { trust: 2 }, knots: [], memories: [], stageId: 'friend' };
  return save.world;
}

describe('workshop prompt blocks', () => {
  it('namespaces equal block ids across packages and never replaces built-in blocks', () => {
    const assembler = new PromptAssembler();
    assembler.register({ id: 'shared', role: 'system', priority: 1, order: 1, build: () => '内置提示。' });
    const records = [
      promptRecord('pack.one', [{ id: 'shared', text: '包一提示。' }]),
      promptRecord('pack.two', [{ id: 'shared', text: '包二提示。' }]),
    ];
    const unregister = registerWorkshopPromptBlocks(assembler, records);
    expect(assembler.listBlocks().map((block) => block.id)).toEqual(expect.arrayContaining([
      'shared', workshopPromptBlockId('pack.one', 'shared'), workshopPromptBlockId('pack.two', 'shared'),
    ]));
    const result = assembler.assemble({ world: promptWorld() }, { budget: 1000, task: 'narrate_main' });
    expect(result.messages.map((message) => message.content)).toEqual(expect.arrayContaining(['内置提示。', '包一提示。', '包二提示。']));
    unregister();
    expect(assembler.listBlocks().map((block) => block.id)).toEqual(['shared']);
  });

  it('filters blocks to the two tasks that currently use PromptAssembler', () => {
    const blocks = createWorkshopPromptBlocks([promptRecord('pack.tasks', [
      { id: 'narration', tasks: ['narrate_main'], text: '只进叙事。' },
      { id: 'topics', tasks: ['topic_tree'], text: '只进话题树。' },
    ])]);
    const assembler = new PromptAssembler();
    blocks.forEach((block) => assembler.register(block));
    expect(assembler.assemble({ world: promptWorld() }, { budget: 1000, task: 'narrate_main' }).messages.map((message) => message.content)).toEqual(['只进叙事。']);
    expect(assembler.assemble({ world: promptWorld() }, { budget: 1000, task: 'topic_tree' }).messages.map((message) => message.content)).toEqual(['只进话题树。']);
  });

  it('evaluates when against a bounded world scope and skips false or malformed runtime facts', () => {
    const condition = 'day == 3 and slotId == "morning" and nodeId == "start" and player.stats.energy >= 4 and flags.raining and relations.rin.axes.trust == 2';
    const record = promptRecord('pack.condition', [{ when: condition, text: '条件成立。' }], { permissions: [
      { capability: 'prompt.register', resources: ['narrate_main'], maxTokens: 64 },
      { capability: 'world.read', resources: ['clock', 'player.location', 'player.stats', 'world.flags', 'relations'] },
    ] });
    const [block] = createWorkshopPromptBlocks([record]);
    expect(block?.build({ world: promptWorld() })).toBe('条件成立。');
    const world = promptWorld();
    world.player.stats.energy = 0;
    expect(block?.build({ world })).toBeNull();
    expect(block?.build({ world: { clock: { day: 3 } } })).toBeNull();
  });

  it('enforces each block budget before the global prompt budget without interpolating text', () => {
    const text = '{{world.flags.secret}}' + '很长的静态提示。'.repeat(100);
    const [block] = createWorkshopPromptBlocks([promptRecord('pack.budget', [{ tokenBudget: 12, text }])]);
    const assembler = new PromptAssembler();
    assembler.register(block!);
    const result = assembler.assemble({ world: promptWorld() }, { budget: 1000, task: 'narrate_main' });
    const built = result.blocks[0]!;
    expect(built.truncated).toBe(true);
    expect(estimateTokens(built.text)).toBeLessThanOrEqual(12);
    expect(built.text).not.toBe(text);
    expect(built.text).toContain('{{world.flags');
  });

  it('keeps the assembler allocation bounded even if a custom truncator returns too much text', () => {
    const assembler = new PromptAssembler();
    assembler.register({ id: 'bounded', role: 'system', priority: 1, order: 1, maxTokens: 2, build: () => '超长文本'.repeat(20), truncate: (text) => text });
    const result = assembler.assemble({}, { budget: 100 });
    expect(result.estimatedTokens).toBeLessThanOrEqual(2);
    expect(result.blocks[0]).toMatchObject({ truncated: true, dropped: false });
  });

  it('rechecks complete validation, permissions and package budget before registration', () => {
    const missingPermission = promptRecord('pack.no-permission', [{ text: '不应注册。' }], { permissions: [] });
    expect(validateWorkshopPackage(missingPermission.package).canInstall).toBe(false);
    expect(createWorkshopPromptBlocks([missingPermission])).toEqual([]);

    const unsupported = promptRecord('pack.unsupported', [{ tasks: ['summarize_day'], text: '当前任务不运行。' }]);
    expect(validateWorkshopPackage(unsupported.package).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported-prompt-task', severity: 'error' }),
    ]));
    expect(createWorkshopPromptBlocks([unsupported])).toEqual([]);
  });
});
