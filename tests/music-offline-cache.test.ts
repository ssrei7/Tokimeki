import { describe, expect, it, vi } from 'vitest';
import { summarizeMusicAssets } from '../src/data/db/assets';
import { downloadMusicAsset } from '../src/features/music/offline-cache';

const updatedAt = '2026-09-19T00:00:00.000Z';

describe('music offline cache', () => {
  it('downloads only through the explicit helper without credentials', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['audio'], { type: 'audio/mpeg' }), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
    const result = await downloadMusicAsset('https://example.com/song.mp3', fetchMock as unknown as typeof fetch);
    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.blob.size).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/song.mp3', { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' });
  });

  it('rejects HTTP failures, empty bodies and non-audio document responses', async () => {
    const failed = vi.fn(async () => new Response('', { status: 404 }));
    await expect(downloadMusicAsset('https://example.com/missing.mp3', failed as unknown as typeof fetch)).rejects.toThrow('HTTP 404');
    const empty = vi.fn(async () => new Response(new Blob([]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
    await expect(downloadMusicAsset('https://example.com/empty.mp3', empty as unknown as typeof fetch)).rejects.toThrow('下载结果为空');
    const html = vi.fn(async () => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(downloadMusicAsset('https://example.com/login', html as unknown as typeof fetch)).rejects.toThrow('不是音频');
  });

  it('turns cross-origin fetch failures into a readable fallback message', async () => {
    const blocked = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(downloadMusicAsset('https://example.com/song.mp3', blocked as unknown as typeof fetch)).rejects.toThrow('可能不允许跨域读取');
  });

  it('separates imported music, external caches and orphaned assets in statistics', () => {
    const assets = [
      { id: 'local', blob: new Blob(['local']), mimeType: 'audio/mpeg', category: 'music' as const, createdAt: updatedAt },
      { id: 'cached', blob: new Blob(['cache']), mimeType: 'audio/mpeg', category: 'music' as const, createdAt: updatedAt },
      { id: 'orphan', blob: new Blob(['orphan']), mimeType: 'audio/mpeg', category: 'music' as const, createdAt: updatedAt },
      { id: 'voice', blob: new Blob(['voice']), mimeType: 'audio/mpeg', category: 'voice' as const, createdAt: updatedAt },
    ];
    const tracks = [
      { id: 'local-track', title: 'Local', artist: '', asset: { kind: 'stored' as const, assetId: 'local' }, updatedAt },
      { id: 'cached-track', title: 'Cached', artist: '', url: 'https://example.com/a.mp3', asset: { kind: 'stored' as const, assetId: 'cached' }, updatedAt },
    ];
    expect(summarizeMusicAssets(assets, tracks)).toEqual({ count: 3, totalBytes: 16, referenceCount: 2, importedCount: 1, offlineCacheCount: 1, orphanedCount: 1 });
  });
});
