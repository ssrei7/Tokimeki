import JSZip from 'jszip';
import {
  WorkshopAppSchema,
  WorkshopAssetMetaSchema,
  WorkshopEventsSchema,
  WorkshopManifestSchema,
  WorkshopPackageSchema,
  WorkshopPromptsSchema,
  WorkshopRulesSchema,
  validateWorkshopPackage,
  type WorkshopAssetPayload,
  type WorkshopPackage,
  type WorkshopPackageImport,
} from '../workshop';

const MAX_FILES = 110;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_TOTAL_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;
const REQUIRED_JSON_FILES = ['manifest.json', 'app.json', 'rules.json'] as const;
const OPTIONAL_JSON_FILES = ['events.json', 'prompts.json', 'asset-meta.json'] as const;
const ALLOWED_ROOT_FILES = new Set<string>([...REQUIRED_JSON_FILES, ...OPTIONAL_JSON_FILES]);

function safePath(path: string): boolean {
  return !path.startsWith('/') && !path.includes('\\') && !path.split('/').some((part) => part === '..' || part === '.');
}

function inputBytes(input: Blob | ArrayBuffer | Uint8Array): number {
  return input instanceof ArrayBuffer ? input.byteLength : input instanceof Uint8Array ? input.byteLength : input.size;
}

function declaredUncompressedBytes(file: JSZip.JSZipObject): number | undefined {
  const value = (file as unknown as { _data?: { uncompressedSize?: unknown } })._data?.uncompressedSize;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function readJsonFile(zip: JSZip, name: string, required: boolean): Promise<unknown | undefined> {
  const file = zip.file(name);
  if (!file) {
    if (required) throw new Error(`工坊包缺少 ${name}。`);
    return undefined;
  }
  const bytes = await file.async('uint8array');
  if (bytes.byteLength > MAX_JSON_BYTES) throw new Error(`${name} 超过 ${MAX_JSON_BYTES / 1024} KiB 限制。`);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error(`${name} 不是有效 JSON。`); }
}

export async function importWorkshopPackage(input: Blob | ArrayBuffer | Uint8Array): Promise<WorkshopPackageImport> {
  if (inputBytes(input) > MAX_ZIP_BYTES) throw new Error('工坊包压缩文件超过 25 MiB。');
  const zip = await JSZip.loadAsync(input);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  if (files.length > MAX_FILES) throw new Error(`工坊包文件数超过 ${MAX_FILES} 个。`);
  let declaredTotal = 0;
  for (const entry of files) {
    const originalName = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
    if (!safePath(originalName) || !safePath(entry.name)) throw new Error(`工坊包包含不安全路径：${originalName}`);
    if (!ALLOWED_ROOT_FILES.has(entry.name) && !entry.name.startsWith('assets/')) throw new Error(`工坊包包含不支持的文件：${entry.name}`);
    const declaredSize = declaredUncompressedBytes(entry);
    if (declaredSize !== undefined) {
      declaredTotal += declaredSize;
      if (ALLOWED_ROOT_FILES.has(entry.name) && declaredSize > MAX_JSON_BYTES) throw new Error(`${entry.name} 超过 ${MAX_JSON_BYTES / 1024} KiB 限制。`);
      if (entry.name.startsWith('assets/') && declaredSize > 5 * 1024 * 1024) throw new Error(`资产超过 5 MiB 限制：${entry.name}`);
    }
  }
  if (declaredTotal > MAX_TOTAL_UNCOMPRESSED_BYTES) throw new Error('工坊包解压后总大小超过 24 MiB。');

  const manifest = WorkshopManifestSchema.parse(await readJsonFile(zip, 'manifest.json', true));
  const app = WorkshopAppSchema.parse(await readJsonFile(zip, 'app.json', true));
  const rules = WorkshopRulesSchema.parse(await readJsonFile(zip, 'rules.json', true));
  const rawEvents = await readJsonFile(zip, 'events.json', false);
  const rawPrompts = await readJsonFile(zip, 'prompts.json', false);
  const rawAssetMeta = await readJsonFile(zip, 'asset-meta.json', false);
  const events = rawEvents === undefined ? undefined : WorkshopEventsSchema.parse(rawEvents);
  const prompts = rawPrompts === undefined ? undefined : WorkshopPromptsSchema.parse(rawPrompts);
  const assetMeta = rawAssetMeta === undefined ? undefined : WorkshopAssetMetaSchema.parse(rawAssetMeta);
  const pack = WorkshopPackageSchema.parse({ manifest, app, rules, ...(events ? { events } : {}), ...(prompts ? { prompts } : {}), ...(assetMeta ? { assetMeta } : {}) });

  const declaredPaths = new Set(assetMeta?.assets.map((asset) => asset.path) ?? []);
  for (const entry of files.filter((file) => file.name.startsWith('assets/'))) if (!declaredPaths.has(entry.name)) throw new Error(`资产文件未在 asset-meta.json 中声明：${entry.name}`);
  const assets = new Map<string, WorkshopAssetPayload>();
  let totalBytes = 0;
  for (const meta of assetMeta?.assets ?? []) {
    const file = zip.file(meta.path);
    if (!file) throw new Error(`asset-meta.json 声明的文件不存在：${meta.path}`);
    const bytes = await file.async('uint8array');
    if (bytes.byteLength !== meta.bytes) throw new Error(`资产大小与声明不符：${meta.path}`);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_ASSET_BYTES) throw new Error('工坊包资产总大小超过 20 MiB。');
    if (assets.has(meta.id)) throw new Error(`资产 ID 重复：${meta.id}`);
    assets.set(meta.id, { id: meta.id, path: meta.path, mimeType: meta.mimeType, bytes, ...(meta.width ? { width: meta.width } : {}), ...(meta.height ? { height: meta.height } : {}) });
  }
  return { package: pack, assets, report: validateWorkshopPackage(pack) };
}

export async function exportWorkshopPackage(pack: WorkshopPackage, assets: ReadonlyMap<string, Uint8Array | Blob>): Promise<Blob> {
  const parsed = WorkshopPackageSchema.parse(pack);
  const report = validateWorkshopPackage(parsed);
  if (!report.canInstall) throw new Error(`工坊包未通过校验：${report.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join('；')}`);
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(parsed.manifest, null, 2));
  zip.file('app.json', JSON.stringify(parsed.app, null, 2));
  zip.file('rules.json', JSON.stringify(parsed.rules, null, 2));
  if (parsed.events) zip.file('events.json', JSON.stringify(parsed.events, null, 2));
  if (parsed.prompts) zip.file('prompts.json', JSON.stringify(parsed.prompts, null, 2));
  if (parsed.assetMeta) {
    zip.file('asset-meta.json', JSON.stringify(parsed.assetMeta, null, 2));
    for (const meta of parsed.assetMeta.assets) {
      const data = assets.get(meta.id);
      if (!data) throw new Error(`无法导出缺失资产：${meta.id}`);
      zip.file(meta.path, data);
    }
  }
  return zip.generateAsync({ type: 'blob' });
}
