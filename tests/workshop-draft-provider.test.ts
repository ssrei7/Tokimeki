import { describe, expect, it, vi } from 'vitest';
import { createMockProviderConfig } from '../src/providers/adapters/mock';
import { buildWorkshopDraftMessages, generateWorkshopDraft, parseWorkshopDraftResponse } from '../src/providers/workshop-draft';
import type { ProviderConfig } from '../src/providers/types';

const base: ProviderConfig = { id: 'draft', name: 'Draft', kind: 'openai-compatible', endpoint: 'https://example.test/v1', model: 'demo', contextWindow: 8192, maxOutputTokens: 2048, temperature: 0.2 };
const packageJson = JSON.stringify({
  manifest: { type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'ai.sample', name: 'AI 示例', author: 'AI Draft', version: '1.0.0', permissions: [] },
  app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'text', text: '仅供预览' }] }] },
  rules: { rules: [] },
});

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
});
