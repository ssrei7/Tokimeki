import Dexie, { type Table } from 'dexie';

export interface StoredAsset {
  id: string;
  blob: Blob;
  mimeType: string;
  category?: 'voice' | 'image';
  cacheFingerprint?: string;
  audioFormat?: string;
  durationMs?: number;
  voiceRequestId?: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface VoiceCacheStats {
  count: number;
  totalBytes: number;
  referenceCount: number;
}

export class AssetDatabase extends Dexie {
  assets!: Table<StoredAsset, string>;

  constructor(name = 'tokimeki-assets') {
    super(name);
    this.version(1).stores({ assets: 'id, createdAt' });
    this.version(2).stores({ assets: 'id, createdAt, category, cacheFingerprint' }).upgrade((transaction) => transaction.table('assets').toCollection().modify((asset: StoredAsset) => {
      if ((asset.id.startsWith('terminal-voice-') || asset.id.startsWith('chat-voice-')) && asset.mimeType.startsWith('audio/')) asset.category = 'voice';
    }));
    this.version(3).stores({ assets: 'id, createdAt, category, cacheFingerprint' }).upgrade((transaction) => transaction.table('assets').toCollection().modify((asset: StoredAsset) => {
      if (!asset.category && asset.mimeType.startsWith('image/')) asset.category = 'image';
    }));
  }
}

export const assetDb = new AssetDatabase();

export async function saveAsset(asset: StoredAsset): Promise<StoredAsset> {
  const normalized = !asset.category && asset.mimeType.startsWith('image/')
    ? { ...asset, category: 'image' as const }
    : !asset.category && (asset.id.startsWith('terminal-voice-') || asset.id.startsWith('chat-voice-')) && asset.mimeType.startsWith('audio/')
      ? { ...asset, category: 'voice' as const }
      : asset;
  await assetDb.assets.put(normalized);
  return normalized;
}

export async function saveVoiceAsset(asset: StoredAsset & { category: 'voice'; cacheFingerprint: string; audioFormat: string; durationMs: number; voiceRequestId: string }): Promise<StoredAsset> {
  return saveAsset(asset);
}

export async function findVoiceAssetByFingerprint(cacheFingerprint: string): Promise<StoredAsset | undefined> {
  const matches = await assetDb.assets.where('cacheFingerprint').equals(cacheFingerprint).toArray();
  return matches.filter((asset) => asset.category === 'voice' && asset.blob.size > 0).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

export async function listVoiceAssets(): Promise<StoredAsset[]> {
  return assetDb.assets.where('category').equals('voice').toArray();
}

export async function listAssets(): Promise<StoredAsset[]> {
  return assetDb.assets.toArray();
}

export function summarizeVoiceCache(assets: StoredAsset[], referenceCounts: ReadonlyMap<string, number>): VoiceCacheStats {
  return assets.reduce<VoiceCacheStats>((stats, asset) => ({ count: stats.count + 1, totalBytes: stats.totalBytes + asset.blob.size, referenceCount: stats.referenceCount + (referenceCounts.get(asset.id) ?? 0) }), { count: 0, totalBytes: 0, referenceCount: 0 });
}

export async function unmarkVoiceAsset(id: string): Promise<void> {
  const asset = await assetDb.assets.get(id);
  if (!asset) return;
  const { category: _category, cacheFingerprint: _cacheFingerprint, audioFormat: _audioFormat, durationMs: _durationMs, voiceRequestId: _voiceRequestId, ...retained } = asset;
  await assetDb.assets.put(retained);
}

export async function loadAsset(id: string): Promise<StoredAsset | undefined> {
  return assetDb.assets.get(id);
}

export async function deleteAsset(id: string): Promise<void> {
  await assetDb.assets.delete(id);
}
