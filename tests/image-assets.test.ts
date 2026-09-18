import { describe, expect, it } from 'vitest';
import { orphanedImageAssetIds, summarizeImageAssets } from '../src/data/image-assets';

describe('image asset accounting', () => {
  const assets = [
    { id: 'avatar', size: 120, mimeType: 'image/webp' },
    { id: 'face', size: 80, mimeType: 'image/png' },
    { id: 'unused', size: 50, mimeType: 'image/jpeg' },
    { id: 'voice', size: 500, mimeType: 'audio/mpeg' },
  ];
  const roots = [{ label: 'world', value: { avatar: { kind: 'stored', assetId: 'avatar' }, lock: { kind: 'stored', assetId: 'face' }, repeated: { kind: 'stored', assetId: 'face' } } }];

  it('counts only image binaries and all image references', () => {
    expect(summarizeImageAssets(assets, roots)).toEqual({ count: 3, totalBytes: 250, referenceCount: 3 });
  });

  it('returns only unreferenced images for safe cleanup', () => {
    expect(orphanedImageAssetIds(assets, roots)).toEqual(['unused']);
  });
});
