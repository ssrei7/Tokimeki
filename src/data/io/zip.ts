import JSZip from 'jszip';
import { migrateSave } from '../migrations';
import { SaveFileSchema, type SaveFile } from '../schema/save';
import { PresetSchema, type Preset } from '../content';

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

export async function exportPresetBundle(presets: readonly Preset[], appVersion = '0.0.1'): Promise<Blob> {
  const parsed = presets.map((preset) => PresetSchema.parse(preset));
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ type: 'preset', appVersion, schemaVersion: 1 }, null, 2));
  zip.file('presets.json', JSON.stringify(parsed, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

export async function importPresetBundle(input: Blob | ArrayBuffer | Uint8Array): Promise<Preset[]> {
  const source = typeof Blob !== 'undefined' && input instanceof Blob ? await input.arrayBuffer() : input;
  const zip = await JSZip.loadAsync(source);
  const manifestFile = zip.file('manifest.json');
  const presetsFile = zip.file('presets.json');
  if (!manifestFile || !presetsFile) throw new Error('Preset bundle must contain manifest.json and presets.json');
  const manifest = JSON.parse(await manifestFile.async('text')) as Partial<ZipManifest>;
  if (manifest.type !== 'preset') throw new Error('This zip is not a preset bundle.');
  const value: unknown = JSON.parse(await presetsFile.async('text'));
  if (!Array.isArray(value) || value.length === 0) throw new Error('Preset bundle must contain at least one preset.');
  return value.map((preset) => PresetSchema.parse(preset));
}
