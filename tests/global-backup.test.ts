import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportGlobalBackup, importGlobalBackup, type GlobalBackupData } from '../src/data/io/global-backup';

const base = { snapshots: [], content: { characters: [], personas: [], worldbooks: [], presets: [], presetBundles: [], storyScenePresets: [], chats: [], chatRecovery: [], memoryVectors: [], musicStates: [], terminalStickers: [] }, providers: [], ttsConfigs: [], bindings: [], characterBindings: [], settings: [], localStorage: {} } satisfies Omit<GlobalBackupData, 'currentSave'>;

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
});

