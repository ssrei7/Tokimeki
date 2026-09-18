import { describe, expect, it } from 'vitest';
import { auditAssetReferences, collectStoredAssetReferences } from '../src/data/reference-integrity';

describe('asset reference integrity', () => {
  const roots = [
    { label: '当前存档', value: { avatar: { kind: 'stored', assetId: 'shared' }, background: { kind: 'stored', assetId: 'missing' } } },
    { label: '聊天/alice', value: [{ voice: { asset: { kind: 'stored', assetId: 'shared' } } }, { asset: { kind: 'url', url: 'https://example.com/a.png' } }] },
    { label: '快照/day-1', value: { icon: { kind: 'stored', assetId: 'empty' } } },
    { label: '音乐/default', value: { tracks: [{ asset: { kind: 'stored', assetId: 'music-local' } }] } },
  ];

  it('collects repeated stored references with readable source paths and ignores URLs', () => {
    const references = collectStoredAssetReferences(roots);
    expect(references).toHaveLength(5);
    expect(references.filter((reference) => reference.assetId === 'shared')).toHaveLength(2);
    expect(references.some((reference) => reference.source.includes('聊天/alice[0].voice.asset'))).toBe(true);
  });

  it('reports missing, empty and orphaned assets without mutating inputs', () => {
    const assets = [
      { id: 'shared', size: 100, mimeType: 'image/png' },
      { id: 'empty', size: 0, mimeType: 'audio/mpeg', category: 'voice' },
      { id: 'orphan', size: 50, mimeType: 'image/webp' },
      { id: 'music-local', size: 200, mimeType: 'audio/mpeg', category: 'music' },
    ];
    const report = auditAssetReferences(roots, assets);
    expect(report).toMatchObject({ referenceCount: 5, referencedAssetCount: 4, storedAssetCount: 4 });
    expect(report.missing).toEqual([
      expect.objectContaining({ assetId: 'empty', empty: true }),
      expect.objectContaining({ assetId: 'missing', empty: false }),
    ]);
    expect(report.orphaned).toEqual([{ assetId: 'orphan', size: 50, mimeType: 'image/webp' }]);
    expect(assets).toHaveLength(4);
  });
});
