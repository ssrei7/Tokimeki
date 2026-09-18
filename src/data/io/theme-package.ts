import JSZip from 'jszip';
import { z } from 'zod';
import { AssetRefSchema, type AssetRef } from '../schema/save';
import type { StoredAsset } from '../db/assets';
import { parseDesktopIconOverrides, parseDesktopTitleOverrides, parseThemeAppearance, parseThemeMode, parseThemeTemplate, validateCustomCss, type DesktopIconOverrides, type DesktopTitleOverrides, type ThemeAppearanceConfig, type ThemeMode, type ThemeTemplate } from '../../ui/theme/preferences';
import type { ThemeBackupData } from './global-backup';

export const THEME_PACKAGE_VERSION = 1;

const ThemePackageThemeSchema = z.object({
  mode: z.enum(['system', 'light', 'dark']),
  template: z.enum(['default', 'soft', 'compact']),
  appearance: z.record(z.string(), z.unknown()),
  customCss: z.string(),
  desktopTitles: z.record(z.string(), z.record(z.string(), z.string())),
  desktopIcons: z.record(z.string(), z.record(z.string(), AssetRefSchema)),
});
const ThemePackageManifestSchema = z.object({ type: z.literal('theme'), packageVersion: z.literal(THEME_PACKAGE_VERSION), appVersion: z.string().min(1), exportedAt: z.string().datetime() });
const ThemePackageAssetMetaSchema = z.record(z.string().min(1), z.object({ mimeType: z.string().min(1), category: z.enum(['image']).optional(), width: z.number().nonnegative().optional(), height: z.number().nonnegative().optional(), createdAt: z.string().datetime() }));

export interface ThemePackageManifest { type: 'theme'; packageVersion: number; appVersion: string; exportedAt: string }
export interface ImportedThemePackage { manifest: ThemePackageManifest; theme: ThemeBackupData; assets: Map<string, Uint8Array>; assetMeta: Record<string, Omit<StoredAsset, 'blob' | 'id'>> }

export function themePackageAssetIds(theme: Pick<ThemeBackupData, 'desktopIcons'>): Set<string> {
  return new Set(Object.values(theme.desktopIcons).flatMap((entries) => Object.values(entries).flatMap((ref) => ref.kind === 'stored' ? [ref.assetId] : [])));
}

export function normalizeThemePackageTheme(value: unknown): ThemeBackupData {
  const parsed = ThemePackageThemeSchema.parse(value);
  const customCss = parsed.customCss.slice(0, 20000);
  if (validateCustomCss(customCss).length) throw new Error('主题包包含不允许的自定义 CSS。');
  return {
    mode: parseThemeMode(parsed.mode),
    template: parseThemeTemplate(parsed.template),
    appearance: parseThemeAppearance(parsed.appearance),
    customCss,
    desktopTitles: parseDesktopTitleOverrides(parsed.desktopTitles),
    desktopIcons: parseDesktopIconOverrides(parsed.desktopIcons),
  };
}

export async function exportThemePackage(theme: ThemeBackupData, assets: readonly StoredAsset[], appVersion: string): Promise<Blob> {
  const normalized = normalizeThemePackageTheme(theme);
  const assetIds = themePackageAssetIds(normalized);
  const included = assets.filter((asset) => assetIds.has(asset.id) && asset.blob.size > 0);
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ type: 'theme', packageVersion: THEME_PACKAGE_VERSION, appVersion, exportedAt: new Date().toISOString() }, null, 2));
  zip.file('theme.json', JSON.stringify(normalized, null, 2));
  zip.file('asset-meta.json', JSON.stringify(Object.fromEntries(included.map(({ id, blob: _blob, ...meta }) => [id, { ...meta, category: 'image' }])), null, 2));
  for (const asset of included) zip.file(`assets/${asset.id}`, await asset.blob.arrayBuffer());
  return zip.generateAsync({ type: 'blob' });
}

export async function importThemePackage(input: Blob | ArrayBuffer | Uint8Array): Promise<ImportedThemePackage> {
  const source = typeof Blob !== 'undefined' && input instanceof Blob ? await input.arrayBuffer() : input;
  const zip = await JSZip.loadAsync(source);
  const manifestFile = zip.file('manifest.json');
  const themeFile = zip.file('theme.json');
  if (!manifestFile || !themeFile) throw new Error('主题包缺少 manifest.json 或 theme.json。');
  const manifest = ThemePackageManifestSchema.parse(JSON.parse(await manifestFile.async('text')));
  const theme = normalizeThemePackageTheme(JSON.parse(await themeFile.async('text')));
  const assets = new Map<string, Uint8Array>();
  for (const [name, entry] of Object.entries(zip.files)) if (name.startsWith('assets/') && !entry.dir) assets.set(name.slice(7), await entry.async('uint8array'));
  const assetMetaFile = zip.file('asset-meta.json');
  const assetMeta = ThemePackageAssetMetaSchema.parse(assetMetaFile ? JSON.parse(await assetMetaFile.async('text')) : {}) as ImportedThemePackage['assetMeta'];
  for (const assetId of assets.keys()) if (!assetMeta[assetId]) throw new Error(`主题包中的资产 ${assetId} 缺少元数据。`);
  for (const assetId of themePackageAssetIds(theme)) if (!assets.has(assetId) && !Object.values(theme.desktopIcons).some((entries) => Object.values(entries).some((ref) => ref.kind === 'stored' && ref.assetId === assetId))) throw new Error(`主题包引用了未知资产 ${assetId}。`);
  return { manifest, theme, assets, assetMeta };
}

export function remapThemePackageAssetIds(theme: ThemeBackupData, replacements: ReadonlyMap<string, string>): ThemeBackupData {
  const desktopIcons: DesktopIconOverrides = Object.fromEntries(Object.entries(theme.desktopIcons).map(([launcherId, entries]) => [launcherId, Object.fromEntries(Object.entries(entries).map(([entryId, ref]) => [entryId, ref.kind === 'stored' ? { kind: 'stored', assetId: replacements.get(ref.assetId) ?? ref.assetId } : ref]))]));
  return normalizeThemePackageTheme({ ...theme, desktopIcons });
}

export interface ThemePackageConflict { key: string; label: string }
export function listThemePackageConflicts(current: ThemeBackupData, incoming: ThemeBackupData): ThemePackageConflict[] {
  const conflicts: ThemePackageConflict[] = [];
  if (current.mode !== 'system' || incoming.mode !== 'system') conflicts.push({ key: 'mode', label: '主题模式' });
  if (current.template !== 'default' || incoming.template !== 'default') conflicts.push({ key: 'template', label: '组件模板' });
  if (current.customCss || incoming.customCss) conflicts.push({ key: 'customCss', label: '自定义 CSS' });
  if (Object.keys(current.desktopTitles).length || Object.keys(incoming.desktopTitles).length) conflicts.push({ key: 'desktopTitles', label: '桌面入口标题' });
  if (Object.keys(current.desktopIcons).length || Object.keys(incoming.desktopIcons).length) conflicts.push({ key: 'desktopIcons', label: '桌面入口图标' });
  return conflicts;
}
