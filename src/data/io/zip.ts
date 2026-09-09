import JSZip from 'jszip';
import { migrateSave } from '../migrations';
import { CURRENT_SCHEMA_VERSION, SaveFileSchema, type SaveFile } from '../schema/save';
import { EventPackageSchema, PresetBundleSchema, PresetSchema, type EventPackage, type Preset, type PresetBundle } from '../content';
import { CURRENT_PRESET_BUNDLE_SCHEMA_VERSION, migratePresetBundle } from '../migrations/preset-bundle';

export interface ZipManifest { type: 'save' | 'character' | 'world' | 'events' | 'preset'; appVersion: string; schemaVersion: number }
export interface ImportedSaveZip { manifest: ZipManifest; save: SaveFile; assets: Map<string, Uint8Array>; extras: Record<string, unknown> }

export async function exportSaveZip(save: SaveFile, assets: Record<string, Uint8Array | Blob> = {}, extras: Record<string, unknown> = {}): Promise<Blob> {
  const parsed = SaveFileSchema.parse(save); const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ type: 'save', appVersion: parsed.meta.appVersion, schemaVersion: parsed.schemaVersion }, null, 2));
  zip.file('save.json', JSON.stringify(parsed, null, 2));
  for (const [name, value] of Object.entries(extras)) zip.file(`data/${name}.json`, JSON.stringify(value, null, 2));
  for (const [id, data] of Object.entries(assets)) zip.file(`assets/${id}`, data);
  return zip.generateAsync({ type: 'blob' });
}

export async function importSaveZip(input: Blob | ArrayBuffer | Uint8Array): Promise<ImportedSaveZip> {
  const source = typeof Blob !== 'undefined' && input instanceof Blob ? await input.arrayBuffer() : input;
  const zip = await JSZip.loadAsync(source); const manifestFile = zip.file('manifest.json'); const saveFile = zip.file('save.json');
  if (!manifestFile || !saveFile) throw new Error('Zip must contain manifest.json and save.json');
  const manifest = JSON.parse(await manifestFile.async('text')) as ZipManifest; const save = migrateSave(JSON.parse(await saveFile.async('text')));
  const assets = new Map<string, Uint8Array>();
  for (const [name, entry] of Object.entries(zip.files)) if (name.startsWith('assets/') && !entry.dir) assets.set(name.slice('assets/'.length), await entry.async('uint8array'));
  const extras: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(zip.files)) if (name.startsWith('data/') && name.endsWith('.json') && !entry.dir) extras[name.slice('data/'.length, -'.json'.length)] = JSON.parse(await entry.async('text'));
  return { manifest, save, assets, extras };
}

export async function exportPresetBundle(bundle: PresetBundle | readonly Preset[], appVersion = '0.0.1'): Promise<Blob> {
  const parsedBundle: PresetBundle = Array.isArray(bundle)
    ? { id: 'imported-bundle', name: 'Imported preset bundle', entries: bundle.map((preset) => PresetSchema.parse(preset)), updatedAt: new Date().toISOString() }
    : PresetBundleSchema.parse(bundle);
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ type: 'preset', appVersion, schemaVersion: CURRENT_PRESET_BUNDLE_SCHEMA_VERSION }, null, 2));
  zip.file('preset-bundle.json', JSON.stringify(parsedBundle, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

export async function importPresetBundle(input: Blob | ArrayBuffer | Uint8Array): Promise<PresetBundle> {
  const source = typeof Blob !== 'undefined' && input instanceof Blob ? await input.arrayBuffer() : input;
  const zip = await JSZip.loadAsync(source);
  const manifestFile = zip.file('manifest.json');
  const bundleFile = zip.file('preset-bundle.json');
  const legacyFile = zip.file('presets.json');
  if (!manifestFile || (!bundleFile && !legacyFile)) throw new Error('Preset bundle must contain manifest.json and preset-bundle.json');
  const manifest = JSON.parse(await manifestFile.async('text')) as Partial<ZipManifest>;
  if (manifest.type !== 'preset') throw new Error('This zip is not a preset bundle.');
  const value: unknown = JSON.parse(await (bundleFile ?? legacyFile!).async('text'));
  if (bundleFile) return migratePresetBundle(value, typeof manifest.schemaVersion === 'number' ? manifest.schemaVersion : 1);
  if (!Array.isArray(value) || value.length === 0) throw new Error('Preset bundle must contain at least one preset.');
  return PresetBundleSchema.parse({ id: 'imported-bundle', name: 'Imported preset bundle', entries: value.map((preset) => PresetSchema.parse(preset)), updatedAt: new Date().toISOString() });
}

export async function exportEventPackage(pack: EventPackage, appVersion = '0.0.1', schemaVersion = CURRENT_SCHEMA_VERSION): Promise<Blob> {
  const parsed = EventPackageSchema.parse(pack);
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ type: 'events', appVersion, schemaVersion }, null, 2));
  zip.file('events.json', JSON.stringify(parsed, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

export async function importEventPackage(input: Blob | ArrayBuffer | Uint8Array): Promise<{ manifest: ZipManifest; pack: EventPackage }> {
  const source = typeof Blob !== 'undefined' && input instanceof Blob ? await input.arrayBuffer() : input;
  const zip = await JSZip.loadAsync(source);
  const manifestFile = zip.file('manifest.json');
  const eventsFile = zip.file('events.json') ?? zip.file('event-package.json');
  if (!manifestFile || !eventsFile) throw new Error('Event package must contain manifest.json and events.json.');
  const manifest = JSON.parse(await manifestFile.async('text')) as ZipManifest;
  if (manifest.type !== 'events') throw new Error('This zip is not an event package.');
  const schemaVersion = typeof manifest.schemaVersion === 'number' ? manifest.schemaVersion : CURRENT_SCHEMA_VERSION;
  if (schemaVersion > CURRENT_SCHEMA_VERSION) throw new Error(`事件包 schema v${schemaVersion} 高于当前支持版本 v${CURRENT_SCHEMA_VERSION}，请升级 Tokimeki。`);
  const pack = EventPackageSchema.parse(JSON.parse(await eventsFile.async('text')));
  return { manifest, pack };
}
