import { collectStoredAssetReferences, type AssetReferenceRoot, type AuditedAsset } from './reference-integrity';

export interface ImageAssetStats {
  count: number;
  totalBytes: number;
  referenceCount: number;
}

export function isImageAsset(asset: Pick<AuditedAsset, 'mimeType'>): boolean {
  return asset.mimeType.toLowerCase().startsWith('image/');
}

export function summarizeImageAssets(assets: readonly AuditedAsset[], roots: readonly AssetReferenceRoot[]): ImageAssetStats {
  const images = new Set(assets.filter(isImageAsset).map((asset) => asset.id));
  const referenceCount = collectStoredAssetReferences(roots).filter((reference) => images.has(reference.assetId)).length;
  return assets.filter(isImageAsset).reduce<ImageAssetStats>((result, asset) => ({ count: result.count + 1, totalBytes: result.totalBytes + asset.size, referenceCount }), { count: 0, totalBytes: 0, referenceCount });
}

export function orphanedImageAssetIds(assets: readonly AuditedAsset[], roots: readonly AssetReferenceRoot[]): string[] {
  const referenced = new Set(collectStoredAssetReferences(roots).map((reference) => reference.assetId));
  return assets.filter((asset) => isImageAsset(asset) && !referenced.has(asset.id)).map((asset) => asset.id).sort();
}
