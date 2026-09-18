import { describe, expect, it, vi } from 'vitest';

import type { MusicTrack } from '../src/data/content';
import { browserMediaSession, buildMusicMediaMetadata, installMediaSessionHandlers, updateMediaSessionMetadata, updateMediaSessionPlaybackState, updateMediaSessionPosition } from '../src/features/music/media-session';

const track: MusicTrack = { id: 'track-1', title: '夜航', artist: '测试歌手', url: 'https://example.com/night.mp3', updatedAt: '2026-09-14T00:00:00.000Z' };

function fakeSession(unsupported: MediaSessionAction[] = []) {
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
  const session = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      if (unsupported.includes(action)) throw new Error('unsupported');
      handlers.set(action, handler);
    }),
    setPositionState: vi.fn(),
  } as unknown as MediaSession;
  return { session, handlers };
}

describe('Media Session adapter', () => {
  it('returns no session when the browser API is unavailable', () => {
    expect(browserMediaSession()).toBeUndefined();
  });

  it('builds local metadata with title, artist, album and PWA artwork', () => {
    expect(buildMusicMediaMetadata(track, 'Tokimeki', 'https://example.com/app/')).toEqual({
      title: '夜航', artist: '测试歌手', album: 'Tokimeki',
      artwork: [
        { src: 'https://example.com/app/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'https://example.com/app/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  });

  it('uses the product display name by default', () => {
    expect(buildMusicMediaMetadata(track).album).toBe('小小地图');
  });

  it('binds supported controls, skips unsupported actions and cleans up', () => {
    const { session, handlers } = fakeSession(['previoustrack']);
    const controls = { play: vi.fn(), pause: vi.fn(), previous: vi.fn(), next: vi.fn() };
    const cleanup = installMediaSessionHandlers(session, controls);
    handlers.get('play')?.({ action: 'play' });
    handlers.get('nexttrack')?.({ action: 'nexttrack' });
    expect(controls.play).toHaveBeenCalledOnce();
    expect(controls.next).toHaveBeenCalledOnce();
    expect(handlers.has('previoustrack')).toBe(false);
    cleanup();
    expect(handlers.get('play')).toBeNull();
    expect(handlers.get('nexttrack')).toBeNull();
  });

  it('updates metadata, playback state and a bounded position without throwing', () => {
    const { session } = fakeSession();
    const metadata = { title: track.title } as MediaMetadata;
    expect(updateMediaSessionMetadata(session, track, 'Tokimeki', undefined, () => metadata)).toBe(true);
    expect(session.metadata).toBe(metadata);
    expect(updateMediaSessionPlaybackState(session, track, true)).toBe(true);
    expect(session.playbackState).toBe('playing');
    expect(updateMediaSessionPosition(session, 120, 999)).toBe(true);
    expect(session.setPositionState).toHaveBeenCalledWith({ duration: 120, playbackRate: 1, position: 120 });
    expect(updateMediaSessionPosition(session, 0, 0)).toBe(false);
    expect(session.setPositionState).toHaveBeenLastCalledWith();
    expect(updateMediaSessionMetadata(session, undefined)).toBe(true);
    expect(session.metadata).toBeNull();
  });
});
