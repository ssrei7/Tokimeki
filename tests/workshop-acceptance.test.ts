import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assetDb, listAssets, loadAsset } from '../src/data/db/assets';
import { contentDb, listWorkshopBindings, listWorkshopPackages, loadWorkshopLocalState, saveWorkshopLocalState } from '../src/data/db/content';
import { collectThemeBackup, exportGlobalBackup, importGlobalBackup, type GlobalBackupData } from '../src/data/io/global-backup';
import { exportWorkshopPackage, importWorkshopPackage } from '../src/data/io/workshop-package';
import { resolveEnabledWorkshopPackages } from '../src/data/workshop-dependencies';
import { exportInstalledWorkshopPackage, installWorkshopPackage, uninstallWorkshopPackage, updateWorkshopPackage } from '../src/data/workshop-install';
import { queryWorkshopProjectInspection } from '../src/data/workshop-inspection';
import { auditWorkshopIntegrity } from '../src/data/workshop-integrity';
import { WorkshopPackageSchema, validateWorkshopPackage, type WorkshopPackage } from '../src/data/workshop';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { runWorkshopActivity } from '../src/features/workshop-activity';
import { runWorkshopEvent, syncWorkshopEventDefinitions } from '../src/features/workshop-event';
import { prepareWorkshopProviderText } from '../src/features/workshop-provider';
import { runWorkshopAgentTurn } from '../src/providers/workshop-draft';
import { requestWorkshopProviderText } from '../src/providers/workshop-text';
import type { ProviderConfig } from '../src/providers/types';

const worldId = 'acceptance-world';
const timestamp = '2026-09-20T00:00:00.000Z';
const iconBytes = new Uint8Array([137, 80, 78, 71]);

const provider: ProviderConfig = {
  id: 'acceptance-provider',
  name: 'Acceptance Provider',
  kind: 'openai-compatible',
  endpoint: 'https://example.test/v1',
  model: 'acceptance-model',
  contextWindow: 65_536,
  maxOutputTokens: 8_192,
  temperature: 0.2,
};

function dependencyPackage(): WorkshopPackage {
  return WorkshopPackageSchema.parse({
    manifest: {
      type: 'workshop', packageVersion: 1, runtimeVersion: 1,
      id: 'acceptance.base', name: '验收基础包', author: 'Acceptance', version: '1.0.0', permissions: [], iconAssetId: 'icon',
    },
    app: { entryPageId: 'home', pages: [{ id: 'home', title: '基础包', components: [{ kind: 'image', assetId: 'icon', alt: '验收图标' }] }] },
    rules: { rules: [] },
    assetMeta: { assets: [{ id: 'icon', path: 'assets/icon.png', mimeType: 'image/png', bytes: iconBytes.byteLength }] },
  });
}

function seedPackage(): WorkshopPackage {
  return WorkshopPackageSchema.parse({
    manifest: { type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'acceptance.app', name: '验收 App', author: 'Acceptance', version: '0.1.0', permissions: [] },
    app: { entryPageId: 'home', pages: [{ id: 'home', title: '待制作', components: [{ kind: 'text', text: '等待 Agent。' }] }] },
    rules: { rules: [] },
  });
}

function agentPackage(): WorkshopPackage {
  return WorkshopPackageSchema.parse({
    manifest: {
      type: 'workshop', packageVersion: 1, runtimeVersion: 1,
      id: 'acceptance.app', name: '验收 App', author: 'Acceptance', version: '1.0.0',
      dependencies: [{ id: 'acceptance.base', minVersion: '1.0.0', maxVersionExclusive: '2.0.0' }],
      permissions: [
        { capability: 'app.local-state' },
        { capability: 'navigation.local' },
        { capability: 'op.submit', resources: ['run_workshop_activity', 'add_stat', 'set_flag'] },
        { capability: 'event.install', resources: ['acceptance-notice'] },
        { capability: 'event.trigger', resources: ['acceptance-notice'] },
        { capability: 'prompt.register', resources: ['summarize_day'], maxTokens: 64 },
        { capability: 'provider.explicit-text', resources: ['summarize_day'] },
      ],
    },
    app: {
      entryPageId: 'home',
      pages: [
        { id: 'home', title: '验收首页', components: [
          { kind: 'input', key: 'note', label: '本地笔记', maxLength: 200 },
          { kind: 'button', label: '打开详情', action: { type: 'navigate', pageId: 'detail' } },
          { kind: 'button', label: '执行活动', action: { type: 'submit-op', op: 'run_workshop_activity', payload: { ruleId: 'acceptance-action' } } },
          { kind: 'button', label: '查看告示', action: { type: 'trigger-event', eventId: 'acceptance-notice' } },
          { kind: 'button', label: '整理笔记', action: { type: 'provider-text', taskId: 'summarize_day', promptBlockId: 'organize', inputKey: 'note', resultKey: 'summary' } },
          { kind: 'text', text: '尚无整理结果', binding: { source: 'local', key: 'summary', format: 'text' } },
        ] },
        { id: 'detail', title: '详情', components: [{ kind: 'text', text: '这是 Agent 生成的声明式页面。' }] },
      ],
    },
    rules: { rules: [{ id: 'acceptance-action', hook: 'manual', actions: [{ type: 'submit-op', op: 'add_stat', payload: { target: 'player', key: 'acceptance.score', delta: 2 } }], result: { success: '验收活动已结算。' } }] },
    events: { events: [{ id: 'acceptance-notice', title: '验收告示', trigger: { nodeIds: ['start'], slotIds: ['morning'] }, content: '你读完了验收告示。', once: true, ops: [{ op: 'set_flag', key: 'acceptance.notice-read', value: true }] }] },
    prompts: { blocks: [{ id: 'organize', role: 'system', priority: 50, order: 50, tokenBudget: 64, tasks: ['summarize_day'], text: '把用户笔记整理成一句简短摘要，不要修改任何游戏状态。' }] },
  });
}

function inspection(pack: WorkshopPackage) {
  const report = validateWorkshopPackage(pack);
  return queryWorkshopProjectInspection({ package: pack, report, syntaxValid: true, schemaValid: true, canExport: report.canInstall });
}

function agentResponse(message: string, toolCall: Record<string, unknown>): string {
  return JSON.stringify({ protocolVersion: 1, message, toolCalls: [toolCall] });
}

function openAiResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function deleteDatabases(): Promise<void> {
  await Promise.all([contentDb.delete(), assetDb.delete()]);
}

async function resetDatabases(): Promise<void> {
  await deleteDatabases();
  await Promise.all([contentDb.open(), assetDb.open()]);
}

describe('workshop end-to-end acceptance', () => {
  beforeAll(resetDatabases);
  afterAll(deleteDatabases);

  it('runs Agent creation, install, runtime, update, share, uninstall and re-import through real Dexie code', async () => {
    const basePack = dependencyPackage();
    const baseArchive = await exportWorkshopPackage(basePack, new Map([['icon', iconBytes]]));
    const importedBase = await importWorkshopPackage(await baseArchive.arrayBuffer());
    const baseRecord = await installWorkshopPackage(importedBase, worldId, timestamp);
    expect(await loadAsset(baseRecord.assetBindings.icon!.assetId)).toMatchObject({ mimeType: 'image/png', category: 'image' });

    const seed = seedPackage();
    const firstResponse = agentResponse('已生成可安装的验收 App。', { id: 'create-app', name: 'project.replace', arguments: { package: agentPackage() } });
    const createFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      const payload = JSON.parse(request.messages[1].content);
      expect(payload.instruction).toBe('制作一个带本地笔记、确定性活动、事件和显式 AI 整理按钮的 App');
      expect(payload.capabilityQuery.name).toBe('capabilities.list');
      expect(payload.inspectionQuery.name).toBe('project.inspect');
      return openAiResponse(firstResponse);
    });
    const created = await runWorkshopAgentTurn(provider, {
      instruction: '制作一个带本地笔记、确定性活动、事件和显式 AI 整理按钮的 App',
      currentSource: JSON.stringify(seed),
      inspection: inspection(seed),
      budget: { maxSteps: 2, maxRequests: 2, maxOutputTokensPerRequest: 8_192, maxTotalOutputTokens: 16_384, safetyMarginTokens: 512 },
    }, { fetchImpl: createFetch });
    expect(createFetch).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({ toolName: 'project.replace', repairAttempts: 0 });
    expect(validateWorkshopPackage(created.package).canInstall).toBe(true);

    const appArchive = await exportWorkshopPackage(created.package, new Map());
    const importedApp = await importWorkshopPackage(await appArchive.arrayBuffer());
    const appRecord = await installWorkshopPackage(importedApp, worldId, '2026-09-20T01:00:00.000Z');
    await saveWorkshopLocalState(worldId, appRecord.id, { note: '请保留这份用户笔记' }, '2026-09-20T01:05:00.000Z');
    expect(resolveEnabledWorkshopPackages(worldId, await listWorkshopPackages(), await listWorkshopBindings()).map((record) => record.id)).toEqual(['acceptance.base', 'acceptance.app']);

    const save = seedScenario(createCurrentSaveScenario({ id: worldId, title: 'Workshop acceptance', day: 3, slotId: 'morning' }));
    const activity = runWorkshopActivity(appRecord, 'acceptance-action', 'manual', { world: save.world, day: 3, slotId: 'morning', nodeId: 'start', log: vi.fn() });
    expect(activity.applied).toBe(1);
    expect(save.world.player.stats['acceptance.score']).toBe(2);
    expect(syncWorkshopEventDefinitions(save, [appRecord])).toMatchObject({ installed: 1, warnings: [] });
    expect(runWorkshopEvent(appRecord, 'acceptance-notice', save)).toMatchObject({ ok: true, message: '你读完了验收告示。' });
    expect(save.world.flags['acceptance.notice-read']).toBe(true);

    const providerAction = { type: 'provider-text' as const, taskId: 'summarize_day' as const, promptBlockId: 'organize', inputKey: 'note', resultKey: 'summary' };
    const localState = await loadWorkshopLocalState(worldId, appRecord.id);
    const prepared = prepareWorkshopProviderText(appRecord, providerAction, {}, localState!.values);
    const textFetch = vi.fn(async () => openAiResponse('保留下来的简短摘要。'));
    const summary = await requestWorkshopProviderText(provider, prepared.messages, prepared.taskId, { fetchImpl: textFetch });
    expect(textFetch).toHaveBeenCalledTimes(1);
    expect(summary).toBe('保留下来的简短摘要。');
    await saveWorkshopLocalState(worldId, appRecord.id, { ...localState!.values, summary }, '2026-09-20T01:10:00.000Z');

    const patchResponse = agentResponse('已升级页面标题和版本。', { id: 'update-app', name: 'project.patch', arguments: { operations: [
      { op: 'replace', path: '/manifest/version', value: '1.1.0' },
      { op: 'replace', path: '/app/pages/0/title', value: '验收首页 v2' },
    ] } });
    const updateFetch = vi.fn(async () => openAiResponse(patchResponse));
    const patched = await runWorkshopAgentTurn(provider, {
      instruction: '升级版本并调整首页标题',
      currentSource: JSON.stringify(appRecord.package),
      inspection: inspection(appRecord.package),
      budget: { maxSteps: 2, maxRequests: 2, maxOutputTokensPerRequest: 2_048, maxTotalOutputTokens: 4_096, safetyMarginTokens: 512 },
    }, { fetchImpl: updateFetch });
    expect(patched).toMatchObject({ toolName: 'project.patch', repairAttempts: 0 });
    const updateArchive = await exportWorkshopPackage(patched.package, new Map());
    const updated = await updateWorkshopPackage(await importWorkshopPackage(await updateArchive.arrayBuffer()), '2026-09-20T02:00:00.000Z');
    expect(updated.record.package.manifest.version).toBe('1.1.0');
    expect(updated.record.installedAt).toBe(appRecord.installedAt);
    expect((await loadWorkshopLocalState(worldId, appRecord.id))?.values).toEqual({ note: '请保留这份用户笔记', summary: '保留下来的简短摘要。' });

    const sharedAppArchive = await exportInstalledWorkshopPackage(updated.record);
    const sharedBaseArchive = await exportInstalledWorkshopPackage(baseRecord);
    await expect(uninstallWorkshopPackage(baseRecord.id)).rejects.toThrow('请先卸载');
    expect((await uninstallWorkshopPackage(updated.record.id)).removedBindings).toHaveLength(1);
    expect((await loadWorkshopLocalState(worldId, updated.record.id))?.values.note).toBe('请保留这份用户笔记');
    const removedBase = await uninstallWorkshopPackage(baseRecord.id);
    expect(removedBase.retainedAssetIds).toEqual([baseRecord.assetBindings.icon!.assetId]);
    expect(await loadAsset(baseRecord.assetBindings.icon!.assetId)).toBeDefined();

    await installWorkshopPackage(await importWorkshopPackage(await sharedBaseArchive.arrayBuffer()), worldId, '2026-09-20T03:00:00.000Z');
    await installWorkshopPackage(await importWorkshopPackage(await sharedAppArchive.arrayBuffer()), worldId, '2026-09-20T03:05:00.000Z');
    expect((await loadWorkshopLocalState(worldId, 'acceptance.app'))?.values.summary).toBe('保留下来的简短摘要。');

    const [records, bindings, states, assets] = await Promise.all([
      listWorkshopPackages(),
      listWorkshopBindings(),
      contentDb.workshopStates.toArray(),
      listAssets(),
    ]);
    const integrity = auditWorkshopIntegrity(records, bindings, states, new Set(assets.filter((asset) => asset.blob.size > 0).map((asset) => asset.id)));
    expect(integrity).toMatchObject({ packageCount: 2, bindingCount: 2, localStateCount: 1, retainedLocalStateCount: 0, issues: [] });

    const backupData = {
      snapshots: [],
      content: { characters: [], personas: [], worldbooks: [], presets: [], presetBundles: [], storyScenePresets: [], chats: [], chatRecovery: [], memoryVectors: [], musicStates: [], terminalStickers: [], workshopPackages: records, workshopBindings: bindings, workshopStates: states },
      providers: [], ttsConfigs: [], bindings: [], characterBindings: [], imageConfigs: [], imageVisualConfigs: [], imageUserVisualConfigs: [], settings: [], localStorage: {},
      theme: collectThemeBackup({ getItem: () => null }),
    } satisfies GlobalBackupData;
    const importedBackup = await importGlobalBackup(await exportGlobalBackup(backupData, assets));
    expect(importedBackup.data.content.workshopStates[0]?.values.note).toBe('请保留这份用户笔记');
    expect(importedBackup.workshopIntegrity.issues).toEqual([]);
  });
});
