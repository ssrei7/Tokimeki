import JSZip from 'jszip';
import { ProviderConfigSchema, TtsConfigSchema, type CharacterProviderBinding, type ProviderBinding, type ProviderConfig, type TtsConfig } from '../../providers/types';
import type { CharacterCard, ChatRecord, ChatRecoveryRecord, MemoryVectorRecord, MusicState, Persona, Preset, PresetBundle, StoryScenePresetRecord, TerminalStickerRecord, WorldbookEntry } from '../content';
import type { SaveFile } from '../schema/save';
import type { SaveSnapshot } from '../db/save';
import type { StoredAsset } from '../db/assets';

export const GLOBAL_BACKUP_VERSION = 1;
export interface GlobalBackupData {
  currentSave?: SaveFile;
  snapshots: SaveSnapshot[];
  content: { characters: CharacterCard[]; personas: Persona[]; worldbooks: WorldbookEntry[]; presets: Preset[]; presetBundles: PresetBundle[]; storyScenePresets: StoryScenePresetRecord[]; chats: ChatRecord[]; chatRecovery: ChatRecoveryRecord[]; memoryVectors: MemoryVectorRecord[]; musicStates: MusicState[]; terminalStickers: TerminalStickerRecord[] };
  providers: ProviderConfig[];
  ttsConfigs: TtsConfig[];
  bindings: ProviderBinding[];
  characterBindings: CharacterProviderBinding[];
  settings: Array<{ key: 'defaultProviderId' | 'defaultTtsProviderId' | 'chatPlayerLabel'; value: string }>;
  localStorage: Record<string, string>;
}
export interface ImportedGlobalBackup { data: GlobalBackupData; assets: Map<string, Uint8Array>; assetMeta: Record<string, Omit<StoredAsset, 'blob' | 'id'>>; hasSecrets: boolean }

export async function exportGlobalBackup(data: GlobalBackupData, assets: readonly StoredAsset[], includeSecrets = false): Promise<Blob> {
  const zip = new JSZip();
  const safe = structuredClone(data);
  if (!includeSecrets) {
    safe.providers = safe.providers.map(({ apiKey: _key, ...provider }) => ({ ...provider, headers: stripSecretHeaders(provider.headers) }));
    safe.ttsConfigs = safe.ttsConfigs.map(({ apiKey: _key, pendingRequest: _pending, lastError: _error, lastCalledAt: _called, ...tts }) => ({ ...tts, headers: stripSecretHeaders(tts.headers), requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: new Date().toISOString() }));
  }
  zip.file('manifest.json', JSON.stringify({ type: 'global-backup', schemaVersion: GLOBAL_BACKUP_VERSION, appVersion: data.currentSave?.meta.appVersion ?? '0.0.1', exportedAt: new Date().toISOString(), includeSecrets }, null, 2));
  zip.file('data.json', JSON.stringify(safe));
  zip.file('asset-meta.json', JSON.stringify(Object.fromEntries(assets.map(({ id, blob: _blob, ...meta }) => [id, meta]))));
  for (const asset of assets) zip.file(`assets/${asset.id}`, asset.blob);
  return zip.generateAsync({ type: 'blob' });
}

export async function importGlobalBackup(input: Blob | ArrayBuffer | Uint8Array): Promise<ImportedGlobalBackup> {
  const source = typeof Blob !== 'undefined' && input instanceof Blob ? await input.arrayBuffer() : input;
  const zip = await JSZip.loadAsync(source); const manifestFile = zip.file('manifest.json'); const dataFile = zip.file('data.json');
  if (!manifestFile || !dataFile) throw new Error('全局备份缺少 manifest.json 或 data.json。');
  const manifest = JSON.parse(await manifestFile.async('text')) as { type?: string; schemaVersion?: number; includeSecrets?: boolean };
  if (manifest.type !== 'global-backup') throw new Error('这不是 Tokimeki 全局备份。');
  if (manifest.schemaVersion !== GLOBAL_BACKUP_VERSION) throw new Error(`全局备份版本不受支持：v${manifest.schemaVersion ?? '未知'}。`);
  const data = JSON.parse(await dataFile.async('text')) as GlobalBackupData;
  const assets = new Map<string, Uint8Array>(); for (const [name, entry] of Object.entries(zip.files)) if (name.startsWith('assets/') && !entry.dir) assets.set(name.slice(7), await entry.async('uint8array'));
  const metaFile = zip.file('asset-meta.json'); const assetMeta = metaFile ? JSON.parse(await metaFile.async('text')) as ImportedGlobalBackup['assetMeta'] : {};
  return { data, assets, assetMeta, hasSecrets: Boolean(manifest.includeSecrets || data.providers.some((item) => item.apiKey) || data.ttsConfigs.some((item) => item.apiKey)) };
}

function stripSecretHeaders(headers?: Record<string, string>): Record<string, string> | undefined { const kept = Object.entries(headers ?? {}).filter(([key]) => !/^(authorization|proxy-authorization|api-key|x-api-key|cookie|set-cookie)$/i.test(key)); return kept.length ? Object.fromEntries(kept) : undefined; }
void ProviderConfigSchema; void TtsConfigSchema;
