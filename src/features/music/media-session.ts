import type { MusicTrack } from '../../data/content';

export interface MediaSessionControls {
  play: () => void | Promise<void>;
  pause: () => void;
  previous: () => void;
  next: () => void;
}

export type MediaMetadataFactory = (init: MediaMetadataInit) => MediaMetadata;

export function browserMediaSession(): MediaSession | undefined {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return undefined;
  return navigator.mediaSession;
}

export function buildMusicMediaMetadata(track: MusicTrack, appName = 'Tokimeki', assetBaseUrl?: string): MediaMetadataInit {
  const artwork = assetBaseUrl ? [
    { src: new URL('icons/icon-192.png', assetBaseUrl).href, sizes: '192x192', type: 'image/png' },
    { src: new URL('icons/icon-512.png', assetBaseUrl).href, sizes: '512x512', type: 'image/png' },
  ] : undefined;
  return {
    title: track.title,
    artist: track.artist || '未填写艺术家',
    album: appName,
    ...(artwork ? { artwork } : {}),
  };
}

function invoke(action: () => void | Promise<void>): void {
  try {
    const result = action();
    if (result && typeof result.then === 'function') void result.catch(() => undefined);
  } catch { /* Platform media controls must not break the in-app player. */ }
}

export function installMediaSessionHandlers(session: MediaSession, controls: MediaSessionControls): () => void {
  const handlers: ReadonlyArray<[MediaSessionAction, () => void | Promise<void>]> = [
    ['play', controls.play],
    ['pause', controls.pause],
    ['previoustrack', controls.previous],
    ['nexttrack', controls.next],
  ];
  const installed: MediaSessionAction[] = [];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, () => invoke(handler));
      installed.push(action);
    } catch { /* Browsers may expose Media Session without every action. */ }
  }
  return () => {
    for (const action of installed) {
      try { session.setActionHandler(action, null); } catch { /* Ignore platform cleanup gaps. */ }
    }
  };
}

export function updateMediaSessionMetadata(session: MediaSession, track: MusicTrack | undefined, appName = 'Tokimeki', assetBaseUrl?: string, factory?: MediaMetadataFactory): boolean {
  if (!track) {
    try { session.metadata = null; return true; } catch { return false; }
  }
  const createMetadata = factory ?? (typeof MediaMetadata !== 'undefined' ? (init: MediaMetadataInit) => new MediaMetadata(init) : undefined);
  if (!createMetadata) return false;
  try {
    session.metadata = createMetadata(buildMusicMediaMetadata(track, appName, assetBaseUrl));
    return true;
  } catch { return false; }
}

export function updateMediaSessionPlaybackState(session: MediaSession, track: MusicTrack | undefined, isPlaying: boolean): boolean {
  try {
    session.playbackState = track ? (isPlaying ? 'playing' : 'paused') : 'none';
    return true;
  } catch { return false; }
}

export function updateMediaSessionPosition(session: MediaSession, duration: number, position: number): boolean {
  if (typeof session.setPositionState !== 'function') return false;
  try {
    if (!Number.isFinite(duration) || duration <= 0) {
      session.setPositionState();
      return false;
    }
    session.setPositionState({ duration, playbackRate: 1, position: Math.min(duration, Math.max(0, Number.isFinite(position) ? position : 0)) });
    return true;
  } catch { return false; }
}
