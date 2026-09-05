import Dexie, { type Table } from 'dexie';

export interface StoredAsset {
  id: string;
  blob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export class AssetDatabase extends Dexie {
  assets!: Table<StoredAsset, string>;

  constructor(name = 'tokimeki-assets') {
    super(name);
    this.version(1).stores({ assets: 'id, createdAt' });
  }
}

export const assetDb = new AssetDatabase();

export async function saveAsset(asset: StoredAsset): Promise<StoredAsset> {
  await assetDb.assets.put(asset);
  return asset;
}

export async function loadAsset(id: string): Promise<StoredAsset | undefined> {
  return assetDb.assets.get(id);
}

export async function deleteAsset(id: string): Promise<void> {
  await assetDb.assets.delete(id);
}
