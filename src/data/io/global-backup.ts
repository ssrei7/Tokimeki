import JSZip from 'jszip';
import { z } from 'zod';
import { CharacterProviderBindingSchema, ProviderBindingSchema, ProviderConfigSchema, ProviderSettingSchema, TtsConfigSchema, type CharacterProviderBinding, type ProviderBinding, type ProviderConfig, type TtsConfig } from '../../providers/types';
import { CharacterCardSchema, ChatRecordSchema, ChatRecoveryRecordSchema, MemoryVectorRecordSchema, MusicStateSchema, PersonaSchema, PresetBundleSchema, PresetSchema, StoryScenePresetSchema, TerminalStickerRecordSchema, WorldbookEntrySchema, type CharacterCard, type ChatRecord, type ChatRecoveryRecord, type MemoryVectorRecord, type MusicState, type Persona, type Preset, type PresetBundle, type StoryScenePresetRecord, type TerminalStickerRecord, type WorldbookEntry } from '../content';
import { migrateSave } from '../migrations';
import { SaveFileSchema, type SaveFile } from '../schema/save';
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
export interface GlobalBackupRestoreSelection { world: boolean; content: boolean; providers: boolean; assets: boolean; preferences: boolean }

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
  for (const asset of assets) zip.file(`assets/${asset.id}`, await asset.blob.arrayBuffer());
  return zip.generateAsync({ type: 'blob' });
}

export async function importGlobalBackup(input: Blob | ArrayBuffer | Uint8Array): Promise<ImportedGlobalBackup> {
  const source = typeof Blob !== 'undefined' && input instanceof Blob ? await input.arrayBuffer() : input;
  const zip = await JSZip.loadAsync(source); const manifestFile = zip.file('manifest.json'); const dataFile = zip.file('data.json');
  if (!manifestFile || !dataFile) throw new Error('全局备份缺少 manifest.json 或 data.json。');
  const manifest = JSON.parse(await manifestFile.async('text')) as { type?: string; schemaVersion?: number; includeSecrets?: boolean };
  if (manifest.type !== 'global-backup') throw new Error('这不是 Tokimeki 全局备份。');
  if (manifest.schemaVersion !== GLOBAL_BACKUP_VERSION) throw new Error(`全局备份版本不受支持：v${manifest.schemaVersion ?? '未知'}。`);
  const data = parseGlobalBackupData(JSON.parse(await dataFile.async('text')));
  const assets = new Map<string, Uint8Array>(); for (const [name, entry] of Object.entries(zip.files)) if (name.startsWith('assets/') && !entry.dir) assets.set(name.slice(7), await entry.async('uint8array'));
  const metaFile = zip.file('asset-meta.json'); const assetMeta = AssetMetadataRecordSchema.parse(metaFile ? JSON.parse(await metaFile.async('text')) : {}) as ImportedGlobalBackup['assetMeta'];
  for (const assetId of assets.keys()) if (!assetMeta[assetId]) throw new Error(`全局备份中的资产 ${assetId} 缺少元数据。`);
  return { data, assets, assetMeta, hasSecrets: Boolean(manifest.includeSecrets || data.providers.some((item) => item.apiKey) || data.ttsConfigs.some((item) => item.apiKey)) };
}

function stripSecretHeaders(headers?: Record<string, string>): Record<string, string> | undefined { const kept = Object.entries(headers ?? {}).filter(([key]) => !/^(authorization|proxy-authorization|api-key|x-api-key|cookie|set-cookie)$/i.test(key)); return kept.length ? Object.fromEntries(kept) : undefined; }

const AssetMetadataRecordSchema = z.record(z.string().min(1), z.object({ mimeType: z.string().min(1), category: z.literal('voice').optional(), cacheFingerprint: z.string().optional(), audioFormat: z.string().optional(), durationMs: z.number().nonnegative().optional(), voiceRequestId: z.string().optional(), width: z.number().nonnegative().optional(), height: z.number().nonnegative().optional(), createdAt: z.string().datetime() }));

function parseGlobalBackupData(value: unknown): GlobalBackupData {
  const raw = z.object({
    currentSave: z.unknown().optional(), snapshots: z.array(z.object({ id: z.string().min(1), day: z.number().int().positive(), createdAt: z.string().datetime(), save: z.unknown() })),
    content: z.object({ characters: z.array(CharacterCardSchema), personas: z.array(PersonaSchema), worldbooks: z.array(WorldbookEntrySchema), presets: z.array(PresetSchema), presetBundles: z.array(PresetBundleSchema), storyScenePresets: z.array(StoryScenePresetSchema), chats: z.array(ChatRecordSchema), chatRecovery: z.array(ChatRecoveryRecordSchema), memoryVectors: z.array(MemoryVectorRecordSchema), musicStates: z.array(MusicStateSchema), terminalStickers: z.array(TerminalStickerRecordSchema) }),
    providers: z.array(ProviderConfigSchema), ttsConfigs: z.array(TtsConfigSchema), bindings: z.array(ProviderBindingSchema), characterBindings: z.array(CharacterProviderBindingSchema), settings: z.array(ProviderSettingSchema), localStorage: z.record(z.string(), z.string()),
  }).parse(value);
  return { ...raw, currentSave: raw.currentSave === undefined ? undefined : SaveFileSchema.parse(migrateSave(raw.currentSave)), snapshots: raw.snapshots.map((snapshot) => ({ ...snapshot, save: SaveFileSchema.parse(migrateSave(snapshot.save)) })) };
}
