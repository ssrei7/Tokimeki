import { describe, expect, it } from 'vitest';
import { isMusicAssetReferenced, resolveLocalMusicFile } from '../src/features/music/local-assets';

const updatedAt = '2026-09-19T00:00:00.000Z';

describe('local music assets', () => {
  it('accepts known audio MIME types and extension fallbacks', () => {
    expect(resolveLocalMusicFile({ name: 'song.bin', type: 'audio/mpeg', size: 10 })).toEqual({ ok: true, mimeType: 'audio/mpeg', fallbackTitle: 'song' });
    expect(resolveLocalMusicFile({ name: 'recording.FLAC', type: '', size: 10 })).toEqual({ ok: true, mimeType: 'audio/flac', fallbackTitle: 'recording' });
  });

  it('rejects empty and unsupported files without reading their bytes', () => {
    expect(resolveLocalMusicFile({ name: 'empty.mp3', type: 'audio/mpeg', size: 0 }).ok).toBe(false);
    expect(resolveLocalMusicFile({ name: 'notes.txt', type: 'text/plain', size: 10 }).ok).toBe(false);
  });

  it('detects shared music asset references before reclamation', () => {
    const tracks = [
      { id: 'a', title: 'A', artist: '', asset: { kind: 'stored' as const, assetId: 'shared' }, updatedAt },
      { id: 'b', title: 'B', artist: '', asset: { kind: 'stored' as const, assetId: 'shared' }, updatedAt },
    ];
    expect(isMusicAssetReferenced(tracks, 'shared')).toBe(true);
    expect(isMusicAssetReferenced(tracks.slice(1), 'other')).toBe(false);
  });
});
