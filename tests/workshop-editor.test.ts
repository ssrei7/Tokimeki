import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkshopEditor } from '../src/components/workshop-editor';
import { WorkshopManager } from '../src/components/workshop-manager';
import { WorkshopPackageSchema, type WorkshopAssetPayload } from '../src/data/workshop';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { analyzeWorkshopDraft, createWorkshopEditorTemplate, workshopEditorSource } from '../src/ui/workshop-editor';

describe('workshop local editor', () => {
  it('starts from a valid, installable local template', () => {
    const pack = createWorkshopEditorTemplate();
    const analysis = analyzeWorkshopDraft(workshopEditorSource(pack), new Set(), new Map());
    expect(analysis.package?.manifest.id).toBe('my.local-app');
    expect(analysis.report.canInstall).toBe(true);
    expect(analysis.canExport).toBe(true);
  });

  it('reports JSON, schema, permission and installed-id conflicts locally', () => {
    expect(analyzeWorkshopDraft('{bad', new Set(), new Map()).report.issues[0]?.code).toBe('draft-parse');
    expect(analyzeWorkshopDraft('{}', new Set(), new Map()).report.canInstall).toBe(false);
    const pack = WorkshopPackageSchema.parse({
      ...createWorkshopEditorTemplate(),
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'fact', resource: 'clock' }] }] },
    });
    const missingPermission = analyzeWorkshopDraft(workshopEditorSource(pack), new Set(), new Map());
    expect(missingPermission.report.requiredPermissions).toContain('world.read:clock');
    expect(missingPermission.report.issues).toContainEqual(expect.objectContaining({ code: 'permission-missing' }));
    const conflict = analyzeWorkshopDraft(workshopEditorSource(createWorkshopEditorTemplate()), new Set(['my.local-app']), new Map());
    expect(conflict.report.canInstall).toBe(false);
    expect(conflict.canExport).toBe(true);
    expect(conflict.report.issues).toContainEqual(expect.objectContaining({ code: 'package-id-conflict' }));
  });

  it('requires imported asset payloads to match editable metadata', () => {
    const pack = WorkshopPackageSchema.parse({
      ...createWorkshopEditorTemplate(),
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'image', assetId: 'cover', alt: '封面' }] }] },
      assetMeta: { assets: [{ id: 'cover', path: 'assets/cover.png', mimeType: 'image/png', bytes: 4 }] },
    });
    const missing = analyzeWorkshopDraft(workshopEditorSource(pack), new Set(), new Map());
    expect(missing.report.issues).toContainEqual(expect.objectContaining({ code: 'asset-payload-missing' }));
    const asset: WorkshopAssetPayload = { id: 'cover', path: 'assets/cover.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3, 4]) };
    const complete = analyzeWorkshopDraft(workshopEditorSource(pack), new Set(), new Map([['cover', asset]]));
    expect(complete.report.canInstall).toBe(true);
    expect(complete.canExport).toBe(true);
  });

  it('renders the editor, permission report and restricted live preview without executing actions', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'editor-world', title: 'Editor' }));
    const html = renderToStaticMarkup(createElement(WorkshopEditor, {
      save,
      installedIds: new Set<string>(),
      busy: false,
      agentConfigured: false,
      onAgentTurn: vi.fn(),
      onInstall: vi.fn(),
      onExport: vi.fn(),
      onClose: vi.fn(),
    }));
    expect(html).toContain('aria-label="工坊包 JSON"');
    expect(html).toContain('权限与冲突');
    expect(html).toContain('实时预览');
    expect(html).toContain('工坊 Agent');
    expect(html).toContain('本地能力目录');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>发送给 Agent<\/button>/);
    expect(html).toContain('这是一个纯本地声明式 App。');
  });

  it('shows generation as a single explicit provider action and keeps it disabled without a route', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'generation-world', title: 'Generation' }));
    const html = renderToStaticMarkup(createElement(WorkshopManager, { save, draftProviderConfigured: false, onGenerateDraft: vi.fn(), onAgentTurn: vi.fn() }));
    expect(html).toContain('Agent 新建工程');
    expect(html).toContain('用户 API');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>生成并送入编辑器<\/button>/);
  });
});
