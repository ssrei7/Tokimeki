import JSZip from 'jszip';
import { SaveFileSchema, type SaveFile } from '../schema/save';

export interface ZipManifest { type: 'save' | 'character' | 'world' | 'events'; appVersion: string; schemaVersion: number }
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
  const manifest = JSON.parse(await manifestFile.async('text')) as ZipManifest; const save = SaveFileSchema.parse(JSON.parse(await saveFile.async('text')));
  const assets = new Map<string, Uint8Array>();
  for (const [name, entry] of Object.entries(zip.files)) if (name.startsWith('assets/') && !entry.dir) assets.set(name.slice('assets/'.length), await entry.async('uint8array'));
  const extras: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(zip.files)) if (name.startsWith('data/') && name.endsWith('.json') && !entry.dir) extras[name.slice('data/'.length, -'.json'.length)] = JSON.parse(await entry.async('text'));
  return { manifest, save, assets, extras };
}
