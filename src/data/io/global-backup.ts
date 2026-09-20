import JSZip from 'jszip';
import { z } from 'zod';
import { CharacterProviderBindingSchema, ImageConfigSchema, ImageUserVisualConfigSchema, ImageVisualConfigSchema, ProviderBindingSchema, ProviderConfigSchema, ProviderSettingSchema, TtsConfigSchema, type CharacterProviderBinding, type ImageConfig, type ImageUserVisualConfig, type ImageVisualConfig, type ProviderBinding, type ProviderConfig, type TtsConfig } from '../../providers/types';
import { CharacterCardSchema, ChatRecordSchema, ChatRecoveryRecordSchema, MemoryVectorRecordSchema, MusicStateSchema, PersonaSchema, PresetBundleSchema, PresetSchema, StoryScenePresetSchema, TerminalStickerRecordSchema, WorldbookEntrySchema, type CharacterCard, type ChatRecord, type ChatRecoveryRecord, type MemoryVectorRecord, type MusicState, type Persona, type Preset, type PresetBundle, type StoryScenePresetRecord, type TerminalStickerRecord, type WorldbookEntry } from '../content';
import { migrateSave } from '../migrations';
import { SaveFileSchema, type SaveFile } from '../schema/save';
import type { SaveSnapshot } from '../db/save';
import type { StoredAsset } from '../db/assets';
import { DEFAULT_THEME_APPEARANCE, parseDesktopIconOverrides, parseDesktopTitleOverrides, parseThemeAppearance, parseThemeMode, parseThemeTemplate, readCustomCss, type DesktopIconOverrides, type DesktopTitleOverrides, type ThemeAppearanceConfig, type ThemeMode, type ThemeTemplate } from '../../ui/theme/preferences';
import { WorkshopBindingSchema, WorkshopLocalStateSchema, WorkshopPackageRecordSchema, type WorkshopBinding, type WorkshopLocalState, type WorkshopPackageRecord } from '../workshop';
import { auditWorkshopIntegrity, type WorkshopIntegrityReport } from '../workshop-integrity';

export const GLOBAL_BACKUP_VERSION = 5;
export interface ThemeBackupData {
  mode: ThemeMode;
  template: ThemeTemplate;
  appearance: ThemeAppearanceConfig;
  customCss: string;
  desktopTitles: DesktopTitleOverrides;
  desktopIcons: DesktopIconOverrides;
}
export interface GlobalBackupData {
  currentSave?: SaveFile;
  snapshots: SaveSnapshot[];
  content: { characters: CharacterCard[]; personas: Persona[]; worldbooks: WorldbookEntry[]; presets: Preset[]; presetBundles: PresetBundle[]; storyScenePresets: StoryScenePresetRecord[]; chats: ChatRecord[]; chatRecovery: ChatRecoveryRecord[]; memoryVectors: MemoryVectorRecord[]; musicStates: MusicState[]; terminalStickers: TerminalStickerRecord[]; workshopPackages: WorkshopPackageRecord[]; workshopBindings: WorkshopBinding[]; workshopStates: WorkshopLocalState[] };
  providers: ProviderConfig[];
  ttsConfigs: TtsConfig[];
  bindings: ProviderBinding[];
  characterBindings: CharacterProviderBinding[];
  imageConfigs: ImageConfig[];
  imageVisualConfigs: ImageVisualConfig[];
  imageUserVisualConfigs: ImageUserVisualConfig[];
  settings: Array<{ key: 'defaultProviderId' | 'defaultTtsProviderId' | 'chatPlayerLabel'; value: string }>;
  localStorage: Record<string, string>;
  theme: ThemeBackupData;
}
export interface ImportedGlobalBackup { data: GlobalBackupData; assets: Map<string, Uint8Array>; assetMeta: Record<string, Omit<StoredAsset, 'blob' | 'id'>>; hasSecrets: boolean; workshopIntegrity: WorkshopIntegrityReport }
export interface GlobalBackupRestoreSelection { world: boolean; content: boolean; providers: boolean; assets: boolean; preferences: boolean }

export function collectTokimekiPreferences(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith('tokimeki.')) continue;
    const value = storage.getItem(key);
    if (value !== null) result[key] = value;
  }
  return result;
}

export function collectThemeBackup(storage: Pick<Storage, 'getItem'>): ThemeBackupData {
  const get = (key: string) => { try { return storage.getItem(key); } catch { return null; } };
  let appearance = { ...DEFAULT_THEME_APPEARANCE };
  try { const raw = get('tokimeki.theme-appearance'); if (raw) appearance = parseThemeAppearance(JSON.parse(raw)); } catch { /* use defaults */ }
  let desktopTitles: DesktopTitleOverrides = {};
  let desktopIcons: DesktopIconOverrides = {};
  try { const raw = get('tokimeki.desktop-titles'); if (raw) desktopTitles = parseDesktopTitleOverrides(JSON.parse(raw)); } catch { /* use defaults */ }
  try { const raw = get('tokimeki.desktop-icons'); if (raw) desktopIcons = parseDesktopIconOverrides(JSON.parse(raw)); } catch { /* use defaults */ }
  return {
    mode: parseThemeMode(get('tokimeki.theme-mode')),
    template: parseThemeTemplate(get('tokimeki.theme-template')),
    appearance,
    customCss: readCustomCss({ getItem: get }),
    desktopTitles,
    desktopIcons,
  };
}

export function themeBackupPreferences(theme: ThemeBackupData): Record<string, string> {
  return {
    'tokimeki.theme-mode': theme.mode,
    'tokimeki.theme-template': theme.template,
    'tokimeki.theme-appearance': JSON.stringify(parseThemeAppearance(theme.appearance)),
    'tokimeki.custom-css': theme.customCss,
    'tokimeki.desktop-titles': JSON.stringify(parseDesktopTitleOverrides(theme.desktopTitles)),
    'tokimeki.desktop-icons': JSON.stringify(parseDesktopIconOverrides(theme.desktopIcons)),
  };
}

export function restoreTokimekiPreferences(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>, preferences: Record<string, string>): void {
  const existing: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith('tokimeki.')) existing.push(key);
  }
  for (const key of existing) storage.removeItem(key);
  for (const [key, value] of Object.entries(preferences)) if (key.startsWith('tokimeki.')) storage.setItem(key, value);
}

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
  if (manifest.type !== 'global-backup') throw new Error('这不是小小地图全局备份。');
  if (typeof manifest.schemaVersion !== 'number' || manifest.schemaVersion < 1 || manifest.schemaVersion > GLOBAL_BACKUP_VERSION) throw new Error(`全局备份版本不受支持：v${manifest.schemaVersion ?? '未知'}。`);
  const data = parseGlobalBackupData(JSON.parse(await dataFile.async('text')));
  const assets = new Map<string, Uint8Array>(); for (const [name, entry] of Object.entries(zip.files)) if (name.startsWith('assets/') && !entry.dir) assets.set(name.slice(7), await entry.async('uint8array'));
  const metaFile = zip.file('asset-meta.json'); const assetMeta = AssetMetadataRecordSchema.parse(metaFile ? JSON.parse(await metaFile.async('text')) : {}) as ImportedGlobalBackup['assetMeta'];
  for (const assetId of assets.keys()) if (!assetMeta[assetId]) throw new Error(`全局备份中的资产 ${assetId} 缺少元数据。`);
  const availableAssetIds = new Set([...assets].filter(([, bytes]) => bytes.byteLength > 0).map(([id]) => id));
  const workshopIntegrity = auditWorkshopIntegrity(data.content.workshopPackages, data.content.workshopBindings, data.content.workshopStates, availableAssetIds);
  const lossyWorkshopIssues = workshopIntegrity.issues.filter((issue) => issue.code === 'duplicate-package-record' || issue.code === 'duplicate-binding-record' || issue.code === 'duplicate-state-record');
  if (lossyWorkshopIssues.length) throw new Error(`全局备份中的工坊数据包含重复主键，继续恢复会覆盖记录：${lossyWorkshopIssues.map((issue) => issue.message).join('；')}`);
  return { data, assets, assetMeta, hasSecrets: Boolean(manifest.includeSecrets || data.providers.some((item) => item.apiKey) || data.ttsConfigs.some((item) => item.apiKey)), workshopIntegrity };
}

function stripSecretHeaders(headers?: Record<string, string>): Record<string, string> | undefined { const kept = Object.entries(headers ?? {}).filter(([key]) => !/^(authorization|proxy-authorization|api-key|x-api-key|cookie|set-cookie)$/i.test(key)); return kept.length ? Object.fromEntries(kept) : undefined; }

const AssetMetadataRecordSchema = z.record(z.string().min(1), z.object({ mimeType: z.string().min(1), category: z.enum(['voice', 'image', 'music']).optional(), cacheFingerprint: z.string().optional(), audioFormat: z.string().optional(), durationMs: z.number().nonnegative().optional(), voiceRequestId: z.string().optional(), width: z.number().nonnegative().optional(), height: z.number().nonnegative().optional(), createdAt: z.string().datetime() }));

function parseGlobalBackupData(value: unknown): GlobalBackupData {
  const raw = z.object({
    currentSave: z.unknown().optional(), snapshots: z.array(z.object({ id: z.string().min(1), day: z.number().int().positive(), createdAt: z.string().datetime(), save: z.unknown() })),
    content: z.object({ characters: z.array(CharacterCardSchema), personas: z.array(PersonaSchema), worldbooks: z.array(WorldbookEntrySchema), presets: z.array(PresetSchema), presetBundles: z.array(PresetBundleSchema), storyScenePresets: z.array(StoryScenePresetSchema), chats: z.array(ChatRecordSchema), chatRecovery: z.array(ChatRecoveryRecordSchema), memoryVectors: z.array(MemoryVectorRecordSchema), musicStates: z.array(MusicStateSchema), terminalStickers: z.array(TerminalStickerRecordSchema), workshopPackages: z.array(WorkshopPackageRecordSchema).default([]), workshopBindings: z.array(WorkshopBindingSchema).default([]), workshopStates: z.array(WorkshopLocalStateSchema).default([]) }),
    providers: z.array(ProviderConfigSchema), ttsConfigs: z.array(TtsConfigSchema), bindings: z.array(ProviderBindingSchema), characterBindings: z.array(CharacterProviderBindingSchema), imageConfigs: z.array(ImageConfigSchema).default([]), imageVisualConfigs: z.array(ImageVisualConfigSchema).default([]), imageUserVisualConfigs: z.array(ImageUserVisualConfigSchema).default([]), settings: z.array(ProviderSettingSchema), localStorage: z.record(z.string(), z.string()), theme: z.object({ mode: z.enum(['system', 'light', 'dark']), template: z.enum(['default', 'soft', 'compact']), appearance: z.record(z.string(), z.unknown()), customCss: z.string(), desktopTitles: z.record(z.string(), z.record(z.string(), z.string())), desktopIcons: z.record(z.string(), z.record(z.string(), z.unknown())) }).optional(),
  }).parse(value);
  const fallbackTheme = collectThemeBackup({ getItem: (key) => raw.localStorage[key] ?? null });
  const theme = raw.theme ? {
    mode: parseThemeMode(raw.theme.mode), template: parseThemeTemplate(raw.theme.template), appearance: parseThemeAppearance(raw.theme.appearance), customCss: raw.theme.customCss.slice(0, 20000), desktopTitles: parseDesktopTitleOverrides(raw.theme.desktopTitles), desktopIcons: parseDesktopIconOverrides(raw.theme.desktopIcons),
  } : fallbackTheme;
  return { ...raw, theme, currentSave: raw.currentSave === undefined ? undefined : SaveFileSchema.parse(migrateSave(raw.currentSave)), snapshots: raw.snapshots.map((snapshot) => ({ ...snapshot, save: SaveFileSchema.parse(migrateSave(snapshot.save)) })) };
}
