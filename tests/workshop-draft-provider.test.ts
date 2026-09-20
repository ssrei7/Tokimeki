import { describe, expect, it, vi } from 'vitest';
import { createMockProviderConfig } from '../src/providers/adapters/mock';
import { queryWorkshopCapabilityCatalog } from '../src/data/workshop-capabilities';
import { queryWorkshopProjectInspection } from '../src/data/workshop-inspection';
import { WorkshopActionSchema, WorkshopComponentSchema, WorkshopPackageSchema } from '../src/data/workshop';
import { buildWorkshopAgentMessages, buildWorkshopDraftMessages, generateWorkshopDraft, parseWorkshopAgentResponse, parseWorkshopDraftResponse, runWorkshopAgentTurn } from '../src/providers/workshop-draft';
import { applyWorkshopProjectPatch, WORKSHOP_AGENT_PATCH_OPERATION_LIMIT, WORKSHOP_AGENT_PROTOCOL_VERSION, WorkshopAgentProtocolResponseSchema } from '../src/providers/workshop-agent-protocol';
import { DEFAULT_WORKSHOP_AGENT_BUDGET, estimateWorkshopAgentInputTokens, prepareWorkshopAgentRequest } from '../src/providers/workshop-agent-budget';
import type { ProviderConfig } from '../src/providers/types';

const base: ProviderConfig = { id: 'draft', name: 'Draft', kind: 'openai-compatible', endpoint: 'https://example.test/v1', model: 'demo', contextWindow: 8192, maxOutputTokens: 2048, temperature: 0.2 };
const packageJson = JSON.stringify({
  manifest: { type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'ai.sample', name: 'AI 示例', author: 'AI Draft', version: '1.0.0', permissions: [] },
  app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'text', text: '仅供预览' }] }] },
  rules: { rules: [] },
});

function validInspection() {
  return queryWorkshopProjectInspection({
    package: WorkshopPackageSchema.parse(JSON.parse(packageJson)),
    report: { canInstall: true, issues: [], requiredPermissions: [] },
    syntaxValid: true,
    schemaValid: true,
    canExport: true,
  });
}

describe('workshop draft provider', () => {
  it('sends only the fixed contract and explicit user requirement', () => {
    const messages = buildWorkshopDraftMessages('制作一个本地打卡 App');
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('只输出一个 JSON 对象');
    expect(messages[1]?.content).toBe(JSON.stringify({ requirement: '制作一个本地打卡 App' }));
    expect(messages.map((message) => message.content).join('\n')).not.toContain('SaveFile');
    expect(() => buildWorkshopDraftMessages(' ')).toThrow('请先填写');
  });

  it('accepts strict JSON or a single JSON fence and rejects invalid package output', () => {
    expect(parseWorkshopDraftResponse(packageJson).manifest.id).toBe('ai.sample');
    expect(parseWorkshopDraftResponse(`\`\`\`json\n${packageJson}\n\`\`\``).app.entryPageId).toBe('home');
    expect(() => parseWorkshopDraftResponse(`说明\n${packageJson}`)).toThrow('不是有效 JSON');
    expect(() => parseWorkshopDraftResponse('{}')).toThrow('不符合工坊包 schema');
    const withRules = JSON.stringify({ ...JSON.parse(packageJson), rules: { rules: [{ id: 'future', actions: [{ type: 'set-local', key: 'x', value: true }] }] } });
    expect(() => parseWorkshopDraftResponse(withRules)).toThrow('不能包含事件、Prompt、资产或规则');
  });

  it('makes exactly one provider request and parses the result without installing it', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.messages[1].content).toContain('本地打卡');
      return new Response(JSON.stringify({ choices: [{ message: { content: packageJson } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const pack = await generateWorkshopDraft(base, '本地打卡', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(pack.manifest.id).toBe('ai.sample');
  });

  it('supports deterministic mock generation without network access', async () => {
    const pack = await generateWorkshopDraft(createMockProviderConfig('perfect'), '任意需求', { fetchImpl: async () => { throw new Error('must not fetch'); } });
    expect(pack.manifest.id).toBe('mock.generated-app');
    await expect(generateWorkshopDraft(createMockProviderConfig('malformed'), '任意需求')).rejects.toThrow('不是有效 JSON');
  });

  it('builds an agent turn from the current project, recent dialogue and local inspection', () => {
    const inspection = queryWorkshopProjectInspection({
      package: WorkshopPackageSchema.parse(JSON.parse(packageJson)),
      report: { canInstall: false, issues: [{ severity: 'error', code: 'permission-missing', message: '缺少权限', path: 'manifest.permissions' }], requiredPermissions: ['world.read:clock'] },
      syntaxValid: true,
      schemaValid: true,
      canExport: false,
    });
    const messages = buildWorkshopAgentMessages({
      instruction: '增加图鉴页',
      currentSource: packageJson,
      inspection,
      history: [{ role: 'user', content: '先做一个首页' }, { role: 'assistant', content: '首页已完成' }],
    });
    const payload = JSON.parse(messages[1]!.content);
    expect(payload).toMatchObject({ protocolVersion: WORKSHOP_AGENT_PROTOCOL_VERSION, instruction: '增加图鉴页', currentSource: packageJson });
    expect(messages[0]!.content).toContain('project.replace');
    expect(payload.history).toHaveLength(2);
    expect(payload.capabilityQuery.name).toBe('capabilities.list');
    expect(payload.capabilityQuery.result.activities).toMatchObject({ hooks: ['manual', 'onEnterNode'], effectOps: ['add_stat', 'set_flag', 'give_item', 'take_item'] });
    expect(payload.capabilityQuery.result.ui.actions.disabled).toEqual(['trigger-event', 'provider-text']);
    expect(payload.inspectionQuery.name).toBe('project.inspect');
    expect(payload.inspectionQuery.result.diagnostics[0].code).toBe('permission-missing');
    expect(payload.inspectionQuery.result.preview).toMatchObject({ entryPageId: 'home', totals: { pages: 1, components: 1, actions: 0, rules: 0, events: 0, promptBlocks: 0, assets: 0 } });
    expect(payload.diagnostics).toBeUndefined();
    expect(payload.save).toBeUndefined();
    expect(payload.budget).toBeUndefined();
  });

  it('queries a deterministic read-only capability catalog without world or provider data', () => {
    const first = queryWorkshopCapabilityCatalog();
    first.ui.components.pop();
    const second = queryWorkshopCapabilityCatalog();
    expect(second.catalogVersion).toBe(1);
    expect(second.ui.components).toContain('confirm');
    expect(second.worldRead.resources).toContain('player.inventory');
    expect(second.declaredOnly).toMatchObject({ events: true, prompts: true, providerText: true });
    expect(second.assets.agentMayCreateBinary).toBe(false);
    expect(WorkshopComponentSchema.options.map((schema) => schema.shape.kind.value)).toEqual(second.ui.components);
    expect(WorkshopActionSchema.options.map((schema) => schema.shape.type.value).sort()).toEqual([
      ...second.ui.actions.enabled,
      ...second.ui.actions.conditional.map((action) => action.name),
      ...second.ui.actions.disabled,
    ].sort());
    expect(JSON.stringify(second)).not.toMatch(/apiKey|SaveFile|endpoint|model/);
  });

  it('runs one user-configured API turn and accepts a complete declarative project update', async () => {
    const response = JSON.stringify({ protocolVersion: 1, message: '已增加图鉴页。', toolCalls: [{ id: 'replace-project', name: 'project.replace', arguments: { package: JSON.parse(packageJson) } }] });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(JSON.parse(body.messages[1].content).instruction).toBe('增加图鉴页');
      return new Response(JSON.stringify({ choices: [{ message: { content: response } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const result = await runWorkshopAgentTurn(base, { instruction: '增加图鉴页', currentSource: packageJson, inspection: validInspection() }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.message).toContain('图鉴');
    expect(result.package.manifest.id).toBe('ai.sample');
    expect(result.toolCallId).toBe('replace-project');
    expect(result.toolName).toBe('project.replace');
    expect(parseWorkshopAgentResponse(packageJson).message).toContain('已更新');
  });

  it('enforces request and token budgets in the provider execution layer', async () => {
    const response = JSON.stringify({ protocolVersion: 1, message: '已按预算修改。', toolCalls: [{ id: 'replace-project', name: 'project.replace', arguments: { package: JSON.parse(packageJson) } }] });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.max_tokens).toBe(256);
      return new Response(JSON.stringify({ choices: [{ message: { content: response } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const result = await runWorkshopAgentTurn(base, {
      instruction: '按预算修改',
      currentSource: packageJson,
      inspection: validInspection(),
      budget: { ...DEFAULT_WORKSHOP_AGENT_BUDGET, maxSteps: 2, maxRequests: 2, maxOutputTokensPerRequest: 512, maxTotalOutputTokens: 256 },
    }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.budgetReport).toMatchObject({ stepsUsed: 1, requestsUsed: 1, outputTokenLimit: 256 });
    expect(result.budgetReport!.estimatedInputTokens).toBeLessThanOrEqual(result.budgetReport!.inputTokenLimit);

    const messages = buildWorkshopAgentMessages({ instruction: '继续', currentSource: packageJson, inspection: validInspection() });
    expect(() => prepareWorkshopAgentRequest(base, messages, DEFAULT_WORKSHOP_AGENT_BUDGET, { stepsUsed: 4, requestsUsed: 1, estimatedOutputTokensUsed: 10 })).toThrow('达到 4 步');
    expect(() => prepareWorkshopAgentRequest(base, messages, DEFAULT_WORKSHOP_AGENT_BUDGET, { stepsUsed: 1, requestsUsed: 4, estimatedOutputTokensUsed: 10 })).toThrow('达到 4 次 API');
    expect(() => prepareWorkshopAgentRequest(base, messages, DEFAULT_WORKSHOP_AGENT_BUDGET, { stepsUsed: 1, requestsUsed: 1, estimatedOutputTokensUsed: 8192 })).toThrow('用尽总输出 token');
  });

  it('rejects an oversized agent context before making a provider request', async () => {
    const fetchImpl = vi.fn();
    await expect(runWorkshopAgentTurn({ ...base, contextWindow: 512 }, {
      instruction: '修改',
      currentSource: packageJson,
      inspection: validInspection(),
      budget: { ...DEFAULT_WORKSHOP_AGENT_BUDGET, maxOutputTokensPerRequest: 128, maxTotalOutputTokens: 128, safetyMarginTokens: 64 },
    }, { fetchImpl })).rejects.toThrow('上下文预检超限');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('automatically repairs locally rejected output within the configured budgets', async () => {
    const valid = JSON.stringify({ protocolVersion: 1, message: '第二步已修复。', toolCalls: [{ id: 'replace-project', name: 'project.replace', arguments: { package: JSON.parse(packageJson) } }] });
    const invalidPackage = JSON.parse(packageJson);
    invalidPackage.app.pages[0].components = [{ kind: 'fact', resource: 'clock' }];
    const locallyInvalid = JSON.stringify({ protocolVersion: 1, message: '遗漏了权限。', toolCalls: [{ id: 'replace-project', name: 'project.replace', arguments: { package: invalidPackage } }] });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      if (fetchImpl.mock.calls.length === 1) return new Response(JSON.stringify({ choices: [{ message: { content: locallyInvalid } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      const repair = JSON.parse(payload.messages[1].content).repair;
      expect(repair.failedStep).toBe(1);
      expect(repair.previousResponseExcerpt).toContain('遗漏了权限');
      expect(repair.validationError).toContain('permission-missing');
      return new Response(JSON.stringify({ choices: [{ message: { content: valid } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const result = await runWorkshopAgentTurn(base, {
      instruction: '修复并完成', currentSource: packageJson, inspection: validInspection(),
      budget: { ...DEFAULT_WORKSHOP_AGENT_BUDGET, maxSteps: 3, maxRequests: 3 },
    }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.message).toContain('第二步');
    expect(result.repairAttempts).toBe(1);
    expect(result.budgetReport).toMatchObject({ stepsUsed: 2, requestsUsed: 2, maxSteps: 3, maxRequests: 3 });
  });

  it('stops automatic repair at the request budget without changing the project', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(runWorkshopAgentTurn(base, {
      instruction: '修改', currentSource: packageJson, inspection: validInspection(),
      budget: { ...DEFAULT_WORKSHOP_AGENT_BUDGET, maxSteps: 4, maxRequests: 1 },
    }, { fetchImpl })).rejects.toThrow('1 步、1 次 API 后达到预算上限');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry transport failures', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network unavailable'); });
    await expect(runWorkshopAgentTurn(base, {
      instruction: '修改', currentSource: packageJson, inspection: validInspection(),
      budget: { ...DEFAULT_WORKSHOP_AGENT_BUDGET, maxSteps: 4, maxRequests: 4 },
    }, { fetchImpl })).rejects.toThrow('network unavailable');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('minifies valid source and drops oldest dialogue locally before the context preflight', async () => {
    const prettySource = JSON.stringify(JSON.parse(packageJson), null, 2);
    const history = [{ role: 'user' as const, content: '旧请求'.repeat(2000) }, { role: 'assistant' as const, content: '旧回复'.repeat(2000) }];
    const noHistoryMessages = buildWorkshopAgentMessages({ instruction: '修改', currentSource: prettySource, inspection: validInspection(), history }, { historyLimit: 0 });
    const response = JSON.stringify({ protocolVersion: 1, message: '已完成。', toolCalls: [{ id: 'replace-project', name: 'project.replace', arguments: { package: JSON.parse(packageJson) } }] });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const userPayload = JSON.parse(payload.messages[1].content);
      expect(userPayload.currentSource).toBe(packageJson);
      expect(userPayload.history).toEqual([]);
      return new Response(JSON.stringify({ choices: [{ message: { content: response } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const outputTokens = 512;
    const result = await runWorkshopAgentTurn({ ...base, contextWindow: estimateWorkshopAgentInputTokens(noHistoryMessages) + outputTokens, maxOutputTokens: outputTokens }, {
      instruction: '修改', currentSource: prettySource, inspection: validInspection(), history,
      budget: { ...DEFAULT_WORKSHOP_AGENT_BUDGET, maxOutputTokensPerRequest: outputTokens, maxTotalOutputTokens: outputTokens, safetyMarginTokens: 0 },
    }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.contextReport).toMatchObject({ sourceMinified: true, historyEntriesSent: 0, historyEntriesDropped: 2 });
  });

  it('applies a validated local project patch atomically', () => {
    const current = JSON.parse(packageJson);
    const response = JSON.stringify({
      protocolVersion: 1,
      message: '已局部更新标题和内容。',
      toolCalls: [{
        id: 'patch-project',
        name: 'project.patch',
        arguments: { operations: [
          { op: 'replace', path: '/app/pages/0/title', value: '图鉴' },
          { op: 'add', path: '/app/pages/0/components/-', value: { kind: 'text', text: '新增内容' } },
          { op: 'remove', path: '/app/pages/0/components/0' },
          { op: 'add', path: '/manifest/description', value: '局部修改示例' },
        ] },
      }],
    });
    const result = parseWorkshopAgentResponse(response, JSON.stringify(current));
    expect(result.toolName).toBe('project.patch');
    expect(result.package.app.pages[0]).toMatchObject({ title: '图鉴', components: [{ kind: 'text', text: '新增内容' }] });
    expect(result.package.manifest.description).toBe('局部修改示例');
    expect(current.app.pages[0].title).toBe('首页');
  });

  it('rejects unsafe, out-of-range and schema-breaking project patches', () => {
    const response = (operations: unknown[]) => JSON.stringify({ protocolVersion: 1, message: '修改', toolCalls: [{ id: 'patch', name: 'project.patch', arguments: { operations } }] });
    const current = JSON.parse(packageJson);
    expect(() => applyWorkshopProjectPatch(current, [
      { op: 'replace', path: '/app/pages/0/title', value: '不会提交' },
      { op: 'replace', path: '/app/pages/9/title', value: '越界' },
    ])).toThrow('越界');
    expect(current.app.pages[0].title).toBe('首页');
    expect(() => parseWorkshopAgentResponse(response([{ op: 'add', path: '/app/__proto__/polluted', value: true }]), packageJson)).toThrow('不安全');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(() => parseWorkshopAgentResponse(response([{ op: 'add', path: '/app/~2invalid', value: true }]), packageJson)).toThrow('无效 JSON Pointer');
    expect(() => parseWorkshopAgentResponse(response([{ op: 'replace', path: '/app/pages/9/title', value: '越界' }]), packageJson)).toThrow('越界');
    expect(() => parseWorkshopAgentResponse(response([{ op: 'replace', path: '/manifest/id', value: '非法 ID' }]), packageJson)).toThrow('不符合工坊包 schema');
    expect(() => parseWorkshopAgentResponse(response([{ op: 'replace', path: '/manifest/description', value: '不存在' }]), packageJson)).toThrow('路径不存在');
    expect(() => parseWorkshopAgentResponse(response([{ op: 'replace', path: '/app/pages/0/title', value: '标题' }]))).toThrow('需要当前工程');
    expect(() => parseWorkshopAgentResponse(response([{ op: 'replace', path: '/app/pages/0/title', value: '标题' }]), '{')).toThrow('当前工程不是有效 JSON');
    expect(WorkshopAgentProtocolResponseSchema.safeParse(JSON.parse(response(Array.from({ length: WORKSHOP_AGENT_PATCH_OPERATION_LIMIT + 1 }, () => ({ op: 'replace', path: '/app/entryPageId', value: 'home' }))))).success).toBe(false);
  });

  it('strictly rejects unknown, duplicated or malformed tool calls', () => {
    const pack = JSON.parse(packageJson);
    expect(WorkshopAgentProtocolResponseSchema.safeParse({ protocolVersion: 1, message: '完成', toolCalls: [{ id: 'replace', name: 'project.replace', arguments: { package: pack } }] }).success).toBe(true);
    expect(() => parseWorkshopAgentResponse(JSON.stringify({ protocolVersion: 1, message: '完成', toolCalls: [{ id: 'unknown', name: 'world.write', arguments: {} }] }))).toThrow('不符合工具协议');
    expect(() => parseWorkshopAgentResponse(JSON.stringify({ protocolVersion: 1, message: '完成', toolCalls: [
      { id: 'one', name: 'project.replace', arguments: { package: pack } },
      { id: 'two', name: 'project.replace', arguments: { package: pack } },
    ] }))).toThrow('不符合工具协议');
    expect(() => parseWorkshopAgentResponse(JSON.stringify({ protocolVersion: 2, message: '完成', toolCalls: [{ id: 'replace', name: 'project.replace', arguments: { package: pack } }] }))).toThrow('protocolVersion');
    expect(() => parseWorkshopAgentResponse(JSON.stringify({ protocolVersion: 1, message: '完成', toolCalls: [{ id: 'replace', name: 'project.replace', arguments: { package: pack } }], extra: true }))).toThrow('不符合工具协议');
    expect(() => parseWorkshopAgentResponse(JSON.stringify({ protocolVersion: 1, message: '完成', toolCalls: [{ id: 'replace', name: 'project.replace', arguments: { package: {} } }] }))).toThrow('不符合工具协议');
    expect(() => parseWorkshopAgentResponse(JSON.stringify({ protocolVersion: 1, message: '完成', toolCalls: [{ id: 'patch', name: 'project.patch', arguments: { operations: [{ op: 'add', path: '/manifest/description' }] } }] }), packageJson)).toThrow('不符合工具协议');
    expect(() => parseWorkshopAgentResponse(JSON.stringify({ protocolVersion: 1, message: '完成', toolCalls: [{ id: 'patch', name: 'project.patch', arguments: { operations: [{ op: 'move', path: '/manifest/name', from: '/manifest/author' }] } }] }), packageJson)).toThrow('不符合工具协议');
  });

  it('keeps the previous complete-project response compatible during protocol migration', () => {
    const legacy = parseWorkshopAgentResponse(JSON.stringify({ message: '兼容旧响应。', package: JSON.parse(packageJson) }));
    expect(legacy.message).toBe('兼容旧响应。');
    expect(legacy.package.manifest.id).toBe('ai.sample');
    expect(legacy.toolCallId).toBeUndefined();
  });
});
