import { describe, expect, it, vi } from 'vitest';
import { validateWorkshopPackage, WorkshopPackageRecordSchema, type WorkshopPackageRecord } from '../src/data/workshop';
import { prepareWorkshopProviderText } from '../src/features/workshop-provider';
import { requestWorkshopProviderText } from '../src/providers/workshop-text';
import type { ProviderConfig } from '../src/providers/types';

const provider: ProviderConfig = {
  id: 'user-api', name: 'User API', kind: 'openai-compatible', endpoint: 'https://example.test/v1', model: 'demo',
  contextWindow: 4096, maxOutputTokens: 256, temperature: 0.2,
};

function providerRecord(options: { taskId?: 'summarize_day' | 'narrate_main'; inputKey?: string; resultKey?: string; promptTasks?: Array<'summarize_day' | 'narrate_main'>; permissions?: unknown[] } = {}): WorkshopPackageRecord {
  const taskId = options.taskId ?? 'summarize_day';
  const promptTasks = options.promptTasks ?? [taskId];
  return WorkshopPackageRecordSchema.parse({
    id: 'provider.notes',
    package: {
      manifest: {
        type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'provider.notes', name: '本地整理', author: 'Tester', version: '1.0.0',
        permissions: options.permissions ?? [
          { capability: 'app.local-state' },
          { capability: 'prompt.register', resources: promptTasks, maxTokens: 64 },
          { capability: 'provider.explicit-text', resources: [taskId] },
        ],
      },
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '整理', components: [
        { kind: 'input', key: options.inputKey ?? 'draft', label: '草稿' },
        { kind: 'button', label: '整理', action: { type: 'provider-text', taskId, promptBlockId: 'organize', inputKey: options.inputKey ?? 'draft', resultKey: options.resultKey ?? 'answer' } },
        { kind: 'text', text: '尚无结果', binding: { source: 'local', key: options.resultKey ?? 'answer', format: 'text' } },
      ] }] },
      rules: { rules: [] },
      prompts: { blocks: [{ id: 'organize', role: 'system', priority: 50, order: 50, tokenBudget: 64, tasks: promptTasks, text: '把用户输入整理成简短清单。不要修改游戏状态。' }] },
    },
    assetBindings: {}, installedAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
  });
}

describe('workshop explicit provider text', () => {
  it('accepts a prompt task used only by an explicit same-package Provider action', () => {
    const report = validateWorkshopPackage(providerRecord().package);
    expect(report.canInstall).toBe(true);
    expect(report.requiredPermissions).toEqual(expect.arrayContaining([
      'app.local-state', 'prompt.register:summarize_day', 'provider.explicit-text:summarize_day',
    ]));
  });

  it('rejects task mismatches and missing local-state permission during full validation', () => {
    const mismatch = providerRecord({ taskId: 'summarize_day', promptTasks: ['narrate_main'] });
    expect(validateWorkshopPackage(mismatch.package).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'provider-prompt-task-mismatch', severity: 'error' }),
    ]));
    const missingLocal = providerRecord({ permissions: [
      { capability: 'prompt.register', resources: ['summarize_day'], maxTokens: 64 },
      { capability: 'provider.explicit-text', resources: ['summarize_day'] },
    ] });
    expect(validateWorkshopPackage(missingLocal.package).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'permission-missing', message: expect.stringContaining('app.local-state') }),
    ]));
  });

  it('sends only the fixed contract, bounded package prompt and selected local input', () => {
    const record = providerRecord();
    const prepared = prepareWorkshopProviderText(record, {
      type: 'provider-text', taskId: 'summarize_day', promptBlockId: 'organize', inputKey: 'draft', resultKey: 'answer',
    }, { world: { secret: 'must-not-leak' } }, { draft: '买花\n写信', unrelated: 'private' });
    expect(prepared).toMatchObject({ taskId: 'summarize_day', resultKey: 'answer' });
    expect(prepared.messages.at(-1)).toEqual({ role: 'user', content: '买花\n写信' });
    const serialized = JSON.stringify(prepared.messages);
    expect(serialized).not.toContain('must-not-leak');
    expect(serialized).not.toContain('unrelated');
    expect(serialized).toContain('不能直接改变游戏时间');
  });

  it('makes exactly one user-configured request and returns response text without applying embedded ops', async () => {
    const prepared = prepareWorkshopProviderText(providerRecord(), {
      type: 'provider-text', taskId: 'summarize_day', promptBlockId: 'organize', inputKey: 'draft', resultKey: 'answer',
    }, {}, { draft: '整理我' });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages).toEqual(prepared.messages);
      expect(body.max_tokens).toBe(256);
      return new Response(JSON.stringify({ choices: [{ message: { content: `清单完成。\n<ops>[{"op":"set_flag","key":"unsafe","value":true}]</ops>${'附加'.repeat(6000)}` } }] }), { status: 200 });
    });
    const text = await requestWorkshopProviderText(provider, prepared.messages, prepared.taskId, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(text).toHaveLength(10_000);
    expect(text).toContain('<ops>');
    expect(text).toContain('set_flag');
  });

  it('rejects oversized context locally before any network call', async () => {
    const fetchImpl = vi.fn();
    await expect(requestWorkshopProviderText({ ...provider, contextWindow: 80 }, [{ role: 'user', content: '内容'.repeat(200) }], 'summarize_day', { fetchImpl })).rejects.toThrow('联网前被拒绝');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses missing input and runtime permission drift', () => {
    const action = { type: 'provider-text' as const, taskId: 'summarize_day' as const, promptBlockId: 'organize', inputKey: 'draft', resultKey: 'answer' };
    expect(() => prepareWorkshopProviderText(providerRecord(), action, {}, {})).toThrow('请先填写本地输入');
    const record = providerRecord();
    record.package.manifest.permissions = record.package.manifest.permissions.filter((permission) => permission.capability !== 'provider.explicit-text');
    expect(() => prepareWorkshopProviderText(record, action, {}, { draft: '文本' })).toThrow('运行时校验');
  });
});
