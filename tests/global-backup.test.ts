import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { collectThemeBackup, collectTokimekiPreferences, exportGlobalBackup, importGlobalBackup, restoreTokimekiPreferences, themeBackupPreferences, type GlobalBackupData } from '../src/data/io/global-backup';

const base = { snapshots: [], content: { characters: [], personas: [], worldbooks: [], presets: [], presetBundles: [], storyScenePresets: [], chats: [], chatRecovery: [], memoryVectors: [], musicStates: [], terminalStickers: [], workshopPackages: [], workshopBindings: [], workshopStates: [] }, providers: [], ttsConfigs: [], bindings: [], characterBindings: [], imageConfigs: [], imageVisualConfigs: [], imageUserVisualConfigs: [], settings: [], localStorage: {}, theme: collectThemeBackup({ getItem: () => null }) } satisfies Omit<GlobalBackupData, 'currentSave'>;

describe('global backup IO', () => {
  it('round trips assets and strips secrets by default', async () => {
    const blob = await exportGlobalBackup({ ...base, providers: [{ id: 'p', name: 'P', kind: 'openai-compatible', endpoint: 'https://example.com/v1', apiKey: 'secret', model: 'm', contextWindow: 8192, maxOutputTokens: 10, temperature: 0.7 }], ttsConfigs: [] }, [{ id: 'asset-1', blob: new Blob(['x'], { type: 'audio/mpeg' }), mimeType: 'audio/mpeg', createdAt: '2026-09-15T00:00:00.000Z' }]);
    const imported = await importGlobalBackup(blob);
    expect(imported.data.providers[0]).not.toHaveProperty('apiKey');
    expect(imported.assets.get('asset-1')).toBeDefined();
    expect(imported.hasSecrets).toBe(false);
  });

  it('rejects malformed backup data before import', async () => {
    const zip = new JSZip(); zip.file('manifest.json', JSON.stringify({ type: 'global-backup', schemaVersion: 1 })); zip.file('data.json', JSON.stringify({ snapshots: [] }));
    await expect(importGlobalBackup(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow();
  });

  it('imports version 1 backups with empty image configuration defaults', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ type: 'global-backup', schemaVersion: 1 }));
    const { imageConfigs: _imageConfigs, imageVisualConfigs: _imageVisualConfigs, imageUserVisualConfigs: _imageUserVisualConfigs, ...legacyBase } = base;
    const { workshopPackages: _workshopPackages, workshopBindings: _workshopBindings, workshopStates: _workshopStates, ...legacyContent } = legacyBase.content;
    const legacy = { ...legacyBase, content: legacyContent };
    zip.file('data.json', JSON.stringify(legacy));
    const imported = await importGlobalBackup(await zip.generateAsync({ type: 'uint8array' }));
    expect(imported.data).toMatchObject({ imageConfigs: [], imageVisualConfigs: [], imageUserVisualConfigs: [], content: { workshopPackages: [], workshopBindings: [], workshopStates: [] } });
  });

  it('round trips image settings and lock references with their assets', async () => {
    const updatedAt = '2026-09-18T00:00:00.000Z';
    const data: GlobalBackupData = { ...base, imageConfigs: [{ id: 'image', size: '1024x1024', stylePrompt: '水彩', responseFormat: 'b64_json', referenceMode: 'openai-edits', requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt }], imageVisualConfigs: [{ id: 'world:rin', saveId: 'world', characterId: 'rin', appearancePrompt: '黑发', lockFaceEnabled: true, referenceImage: { kind: 'stored', assetId: 'face' }, updatedAt }], imageUserVisualConfigs: [] };
    const blob = await exportGlobalBackup(data, [{ id: 'face', blob: new Blob(['image'], { type: 'image/png' }), mimeType: 'image/png', category: 'image', createdAt: updatedAt }]);
    const imported = await importGlobalBackup(blob);
    expect(imported.data.imageConfigs[0].stylePrompt).toBe('水彩');
    expect(imported.data.imageVisualConfigs[0].referenceImage?.assetId).toBe('face');
    expect(imported.assets.has('face')).toBe(true);
    expect(imported.assetMeta.face.category).toBe('image');
  });

  it('round trips persona avatar references with local image assets', async () => {
    const updatedAt = '2026-09-19T00:00:00.000Z';
    const persona = { id: 'traveler', name: '旅人', displayName: '小明', description: '', avatar: { kind: 'stored' as const, assetId: 'persona-avatar' }, updatedAt };
    const blob = await exportGlobalBackup({ ...base, content: { ...base.content, personas: [persona] } }, [{ id: 'persona-avatar', blob: new Blob(['image'], { type: 'image/webp' }), mimeType: 'image/webp', category: 'image', createdAt: updatedAt }]);
    const imported = await importGlobalBackup(blob);
    expect(imported.data.content.personas[0].avatar).toEqual({ kind: 'stored', assetId: 'persona-avatar' });
    expect(imported.assets.has('persona-avatar')).toBe(true);
  });

  it('round trips local music references and music asset metadata', async () => {
    const updatedAt = '2026-09-19T00:00:00.000Z';
    const musicState = { id: 'default' as const, tracks: [{ id: 'local', title: 'Local', artist: '', asset: { kind: 'stored' as const, assetId: 'music-1' }, updatedAt }], currentTrackId: 'local', mode: 'sequence' as const, volume: 0.8, positionSeconds: 0, shuffleQueue: [], updatedAt };
    const blob = await exportGlobalBackup({ ...base, content: { ...base.content, musicStates: [musicState] } }, [{ id: 'music-1', blob: new Blob(['audio'], { type: 'audio/mpeg' }), mimeType: 'audio/mpeg', category: 'music', createdAt: updatedAt }]);
    const imported = await importGlobalBackup(blob);
    expect(imported.data.content.musicStates[0].tracks[0].asset).toEqual({ kind: 'stored', assetId: 'music-1' });
    expect(imported.assetMeta['music-1'].category).toBe('music');
    expect(imported.assets.has('music-1')).toBe(true);
  });

  it('round trips workshop packages, world bindings, local state and referenced assets', async () => {
    const updatedAt = '2026-09-20T00:00:00.000Z';
    const workshopPackage = {
      id: 'backup.workshop',
      package: {
        manifest: { type: 'workshop' as const, packageVersion: 1 as const, runtimeVersion: 1 as const, id: 'backup.workshop', name: '备份工坊', author: 'Tester', version: '1.0.0', permissions: [], iconAssetId: 'icon' },
        app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'image' as const, assetId: 'icon', alt: '图标' }] }] },
        rules: { rules: [] },
        assetMeta: { assets: [{ id: 'icon', path: 'assets/icon.png', mimeType: 'image/png' as const, bytes: 4 }] },
      },
      assetBindings: { icon: { kind: 'stored' as const, assetId: 'workshop-icon' } },
      installedAt: updatedAt,
      updatedAt,
    };
    const workshopBinding = { id: 'world:backup.workshop', saveId: 'world', packageId: 'backup.workshop', enabled: true, createdAt: updatedAt, updatedAt };
    const workshopState = { id: 'world:backup.workshop', saveId: 'world', packageId: 'backup.workshop', values: { note: '保留用户输入' }, updatedAt };
    const data: GlobalBackupData = { ...base, content: { ...base.content, workshopPackages: [workshopPackage], workshopBindings: [workshopBinding], workshopStates: [workshopState] } };
    const blob = await exportGlobalBackup(data, [{ id: 'workshop-icon', blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }), mimeType: 'image/png', category: 'image', createdAt: updatedAt }]);
    const imported = await importGlobalBackup(blob);
    expect(imported.data.content.workshopPackages[0]).toEqual(workshopPackage);
    expect(imported.data.content.workshopBindings[0]).toEqual(workshopBinding);
    expect(imported.data.content.workshopStates[0]?.values.note).toBe('保留用户输入');
    expect(imported.assets.has('workshop-icon')).toBe(true);
    expect(imported.workshopIntegrity).toMatchObject({ packageCount: 1, bindingCount: 1, localStateCount: 1, referencedAssetCount: 1, issues: [] });
  });

  it('previews broken workshop asset references instead of silently dropping package data', async () => {
    const updatedAt = '2026-09-20T00:00:00.000Z';
    const workshopPackage = {
      id: 'broken.workshop',
      package: {
        manifest: { type: 'workshop' as const, packageVersion: 1 as const, runtimeVersion: 1 as const, id: 'broken.workshop', name: '损坏工坊', author: 'Tester', version: '1.0.0', permissions: [], iconAssetId: 'icon' },
        app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'image' as const, assetId: 'icon', alt: '图标' }] }] },
        rules: { rules: [] },
        assetMeta: { assets: [{ id: 'icon', path: 'assets/icon.png', mimeType: 'image/png' as const, bytes: 4 }] },
      },
      assetBindings: { icon: { kind: 'stored' as const, assetId: 'missing-workshop-icon' } },
      installedAt: updatedAt,
      updatedAt,
    };
    const blob = await exportGlobalBackup({ ...base, content: { ...base.content, workshopPackages: [workshopPackage] } }, []);
    const imported = await importGlobalBackup(blob);
    expect(imported.data.content.workshopPackages).toHaveLength(1);
    expect(imported.workshopIntegrity.issues).toContainEqual(expect.objectContaining({ code: 'missing-stored-asset', severity: 'error', packageId: 'broken.workshop' }));
  });

  it('rejects duplicate workshop primary keys before IndexedDB can overwrite records', async () => {
    const updatedAt = '2026-09-20T00:00:00.000Z';
    const workshopPackage = {
      id: 'duplicate.workshop',
      package: {
        manifest: { type: 'workshop' as const, packageVersion: 1 as const, runtimeVersion: 1 as const, id: 'duplicate.workshop', name: '重复工坊', author: 'Tester', version: '1.0.0', permissions: [] },
        app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [] }] },
        rules: { rules: [] },
      },
      assetBindings: {},
      installedAt: updatedAt,
      updatedAt,
    };
    const blob = await exportGlobalBackup({ ...base, content: { ...base.content, workshopPackages: [workshopPackage, workshopPackage] } }, []);
    await expect(importGlobalBackup(blob)).rejects.toThrow('重复主键');
  });

  it('exports only Tokimeki preferences and removes stale keys on restore', () => {
    const values = new Map([['tokimeki.appName', '旧名称'], ['tokimeki.stale', '删除'], ['other.app', '保留']]);
    const storage = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(collectTokimekiPreferences(storage)).toEqual({ 'tokimeki.appName': '旧名称', 'tokimeki.stale': '删除' });
    restoreTokimekiPreferences(storage, { 'tokimeki.appName': '新名称' });
    expect(values.get('tokimeki.appName')).toBe('新名称');
    expect(values.has('tokimeki.stale')).toBe(false);
    expect(values.get('other.app')).toBe('保留');
  });

  it('round trips explicit theme data and lets it override legacy preference keys', async () => {
    const theme = { ...base.theme, mode: 'dark' as const, template: 'soft' as const, customCss: '.demo { color: red; }', desktopTitles: { settings: { migration: '备份迁移' } }, desktopIcons: { settings: { migration: { kind: 'url' as const, url: 'https://example.com/icon.png' } } } };
    const blob = await exportGlobalBackup({ ...base, theme, localStorage: { 'tokimeki.theme-mode': 'light' } }, []);
    const imported = await importGlobalBackup(blob);
    expect(imported.data.theme.mode).toBe('dark');
    expect(imported.data.theme.template).toBe('soft');
    expect(imported.data.theme.desktopTitles.settings.migration).toBe('备份迁移');
    expect(themeBackupPreferences(imported.data.theme)['tokimeki.theme-mode']).toBe('dark');
  });
});
