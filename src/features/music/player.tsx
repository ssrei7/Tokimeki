import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { loadMusicState, saveMusicState } from '../../data/db/content';
import { deleteAsset, loadAsset, saveAsset } from '../../data/db/assets';
import {
  addMusicTrack,
  attachMusicOfflineAsset,
  createMusicState,
  detachMusicOfflineAsset,
  moveMusicTrack,
  nextMusicTrack,
  normalizeMusicState,
  persistMusicPosition,
  previousMusicTrack,
  removeMusicTrack,
  selectMusicTrack,
  setMusicError,
  setMusicMode,
  setMusicVolume,
  updateMusicTrack,
  type MusicTrackInput,
} from './model';
import type { MusicPlaybackMode, MusicState, MusicTrack } from '../../data/content';
import { browserMediaSession, installMediaSessionHandlers, updateMediaSessionMetadata, updateMediaSessionPlaybackState, updateMediaSessionPosition } from './media-session';
import { isMusicAssetReferenced, resolveLocalMusicFile } from './local-assets';
import { downloadMusicAsset } from './offline-cache';

export type MusicPlayerController = {
  audioRef: RefObject<HTMLAudioElement | null>;
  state: MusicState;
  currentTrack?: MusicTrack;
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  cacheBusyTrackId?: string;
  addTrack: (input: MusicTrackInput) => { ok: boolean; warning?: string };
  addLocalTrack: (file?: File, metadata?: { title?: string; artist?: string }) => Promise<{ ok: boolean; warning?: string }>;
  cacheTrackOffline: (trackId: string) => Promise<{ ok: boolean; warning?: string }>;
  removeTrackOfflineCache: (trackId: string) => Promise<{ ok: boolean; warning?: string }>;
  clearOfflineCaches: () => Promise<{ ok: boolean; count: number; warning?: string }>;
  updateTrack: (trackId: string, input: MusicTrackInput) => { ok: boolean; warning?: string };
  removeTrack: (trackId: string) => Promise<void>;
  moveTrack: (trackId: string, direction: -1 | 1) => void;
  selectTrack: (trackId: string) => void;
  playTrack: (trackId: string) => void;
  play: () => Promise<void>;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  setMode: (mode: MusicPlaybackMode) => void;
};

const stamp = () => new Date().toISOString();

export function useMusicPlayer(): MusicPlayerController {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<MusicState>(() => createMusicState(stamp()));
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cacheBusyTrackId, setCacheBusyTrackId] = useState<string | undefined>(undefined);
  const stateRef = useRef(state);
  const playingRef = useRef(false);
  const cacheBusyRef = useRef(false);
  const pendingAutoplayTrackIdRef = useRef<string | undefined>(undefined);
  const pendingPositionRef = useRef(0);
  const lastPositionSaveRef = useRef(0);
  const suppressPausePersistRef = useRef(false);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);

  const commit = useCallback((next: MusicState): void => {
    stateRef.current = next;
    setState(next);
    void saveMusicState(next).catch(() => undefined);
  }, []);

  const persistPosition = useCallback((seconds: number, force = false): void => {
    const nowMs = Date.now();
    setCurrentTime(seconds);
    if (!force && nowMs - lastPositionSaveRef.current < 1000) return;
    lastPositionSaveRef.current = nowMs;
    commit(persistMusicPosition(stateRef.current, seconds, stamp()));
  }, [commit]);

  useEffect(() => {
    let cancelled = false;
    void loadMusicState().then((stored) => {
      if (cancelled) return;
      const restored = normalizeMusicState(stored, stamp());
      stateRef.current = restored;
      setState(restored);
      setCurrentTime(restored.positionSeconds);
      setIsReady(true);
    }).catch(() => {
      if (!cancelled) setIsReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isReady) return undefined;
    const onTimeUpdate = () => persistPosition(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      const position = Math.min(pendingPositionRef.current, Number.isFinite(audio.duration) ? audio.duration : pendingPositionRef.current);
      if (position > 0) audio.currentTime = position;
      setCurrentTime(position);
    };
    const onPlay = () => { playingRef.current = true; setIsPlaying(true); };
    const onPause = () => { playingRef.current = false; setIsPlaying(false); if (suppressPausePersistRef.current) { suppressPausePersistRef.current = false; return; } persistPosition(audio.currentTime, true); };
    const onError = () => {
      const message = audio.error?.code === 4 ? '音频格式或跨域策略不支持播放。' : '音频加载失败，请替换或移除该链接。';
      commit(setMusicError(stateRef.current, message, stamp()));
    };
    const onEnded = () => {
      const current = stateRef.current;
      const next = nextMusicTrack(current);
      if (!next.trackId) return;
      const selected = selectMusicTrack({ ...next.state, currentTrackId: current.currentTrackId }, next.trackId, stamp());
      if (!selected.ok) return;
      if (next.trackId === current.currentTrackId) {
        commit(selected.state);
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
        return;
      }
      pendingAutoplayTrackIdRef.current = next.trackId;
      commit(selected.state);
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);
    const onPageHide = () => persistPosition(audio.currentTime, true);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [commit, isReady, persistPosition]);

  const currentTrack = state.tracks.find((track) => track.id === state.currentTrackId);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isReady) return;
    const track = stateRef.current.tracks.find((item) => item.id === stateRef.current.currentTrackId);
    let cancelled = false;
    let objectUrl: string | undefined;
    pendingPositionRef.current = stateRef.current.positionSeconds;
    suppressPausePersistRef.current = !audio.paused;
    audio.pause();
    if (!suppressPausePersistRef.current) window.setTimeout(() => { suppressPausePersistRef.current = false; }, 0);
    setIsPlaying(false);
    setDuration(0);
    setCurrentTime(stateRef.current.positionSeconds);
    if (!track) {
      audio.removeAttribute('src');
      audio.load();
      return () => { cancelled = true; };
    }
    const applySource = (source: string) => {
      if (cancelled) return;
      audio.src = source;
      audio.volume = stateRef.current.volume;
      audio.load();
      if (pendingAutoplayTrackIdRef.current === track.id) {
        pendingAutoplayTrackIdRef.current = undefined;
        window.setTimeout(() => { void audio.play().catch(() => undefined); }, 0);
      }
    };
    if (track.asset?.kind === 'stored') {
      void loadAsset(track.asset.assetId).then((asset) => {
        if (cancelled) return;
        if (!asset?.blob.size && track.url) {
          commit(setMusicError(stateRef.current, '离线缓存缺失，已回退外链播放。', stamp()));
          applySource(track.url);
          return;
        }
        if (!asset?.blob.size) { commit(setMusicError(stateRef.current, '本地音频资产缺失，请重新导入或移除该曲目。', stamp())); return; }
        objectUrl = URL.createObjectURL(asset.blob);
        applySource(objectUrl);
      }).catch(() => {
        if (cancelled) return;
        if (track.url) { commit(setMusicError(stateRef.current, '离线缓存读取失败，已回退外链播放。', stamp())); applySource(track.url); }
        else commit(setMusicError(stateRef.current, '本地音频读取失败。', stamp()));
      });
    } else if (track.url) applySource(track.url);
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [commit, isReady, state.currentTrackId, currentTrack?.url, currentTrack?.asset?.assetId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = state.volume;
  }, [state.volume]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (audio) persistPosition(audio.currentTime, true);
  }, [persistPosition]);

  const select = useCallback((trackId: string, resume = false) => {
    const selected = selectMusicTrack(stateRef.current, trackId, stamp());
    if (!selected.ok) return;
    pendingAutoplayTrackIdRef.current = resume ? trackId : undefined;
    commit(selected.state);
  }, [commit]);

  const play = useCallback(async (): Promise<void> => {
    const audio = audioRef.current;
    if (!audio || !stateRef.current.currentTrackId) return;
    const next = stateRef.current.lastError ? setMusicError(stateRef.current, undefined, stamp()) : stateRef.current;
    if (next !== stateRef.current) commit(next);
    try { await audio.play(); } catch (error) { commit(setMusicError(stateRef.current, error instanceof Error ? `无法开始播放：${error.message}` : '无法开始播放。', stamp())); }
  }, [commit]);

  const playTrack = useCallback((trackId: string): void => {
    if (stateRef.current.currentTrackId === trackId) {
      void play();
      return;
    }
    select(trackId, true);
  }, [play, select]);

  const pause = useCallback(() => { audioRef.current?.pause(); }, []);
  const next = useCallback(() => {
    const result = nextMusicTrack(stateRef.current);
    if (!result.trackId) return;
    select(result.trackId, playingRef.current);
  }, [select]);
  const previous = useCallback(() => {
    const trackId = previousMusicTrack(stateRef.current);
    if (trackId) select(trackId, playingRef.current);
  }, [select]);
  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    persistPosition(audio.currentTime, true);
  }, [persistPosition]);
  const setVolume = useCallback((volume: number) => commit(setMusicVolume(stateRef.current, volume, stamp())), [commit]);
  const setMode = useCallback((mode: MusicPlaybackMode) => commit(setMusicMode(stateRef.current, mode, stamp())), [commit]);

  useEffect(() => {
    const session = browserMediaSession();
    if (!session) return undefined;
    return installMediaSessionHandlers(session, { play, pause, previous, next });
  }, [next, pause, play, previous]);

  useEffect(() => {
    const session = browserMediaSession();
    if (!session) return;
    const assetBaseUrl = typeof document === 'undefined' ? undefined : new URL(import.meta.env.BASE_URL, document.baseURI).href;
    updateMediaSessionMetadata(session, currentTrack, 'Tokimeki', assetBaseUrl);
  }, [currentTrack?.artist, currentTrack?.id, currentTrack?.title]);

  useEffect(() => {
    const session = browserMediaSession();
    if (session) updateMediaSessionPlaybackState(session, currentTrack, isPlaying);
  }, [currentTrack?.id, isPlaying]);

  useEffect(() => {
    const session = browserMediaSession();
    if (session) updateMediaSessionPosition(session, currentTrack ? duration : 0, currentTime);
  }, [currentTime, currentTrack, duration]);

  const addTrack = useCallback((input: MusicTrackInput) => {
    const result = addMusicTrack(stateRef.current, input, stamp());
    if (result.ok) commit(result.state);
    return { ok: result.ok, warning: result.warning };
  }, [commit]);
  const addLocalTrack = useCallback(async (file?: File, metadata: { title?: string; artist?: string } = {}) => {
    const resolved = resolveLocalMusicFile(file);
    if (!resolved.ok) return resolved;
    const assetId = `music-audio-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
    try {
      await saveAsset({ id: assetId, blob: file!, mimeType: resolved.mimeType, category: 'music', createdAt: stamp() });
      const title = metadata.title?.trim() || resolved.fallbackTitle;
      const result = addMusicTrack(stateRef.current, { title, artist: metadata.artist, asset: { kind: 'stored', assetId } }, stamp());
      if (!result.ok) { await deleteAsset(assetId); return { ok: false, warning: result.warning }; }
      commit(result.state);
      return { ok: true };
    } catch (error) {
      await deleteAsset(assetId).catch(() => undefined);
      return { ok: false, warning: error instanceof Error ? `本地音频保存失败：${error.message}` : '本地音频保存失败。' };
    }
  }, [commit]);
  const updateTrack = useCallback((trackId: string, input: MusicTrackInput) => {
    const previous = stateRef.current.tracks.find((track) => track.id === trackId);
    const previousAssetId = previous?.asset?.assetId;
    const result = updateMusicTrack(stateRef.current, trackId, input, stamp());
    if (result.ok) {
      const updated = result.state.tracks.find((track) => track.id === trackId);
      const sourceChanged = previous?.url !== updated?.url || previousAssetId !== updated?.asset?.assetId;
      if (sourceChanged && playingRef.current && stateRef.current.currentTrackId === trackId) pendingAutoplayTrackIdRef.current = trackId;
      commit(result.state);
      if (previousAssetId && !isMusicAssetReferenced(result.state.tracks, previousAssetId)) void loadAsset(previousAssetId).then((asset) => asset?.category === 'music' ? deleteAsset(previousAssetId) : undefined).catch(() => undefined);
    }
    return { ok: result.ok, warning: result.warning };
  }, [commit]);
  const cacheTrackOffline = useCallback(async (trackId: string) => {
    if (cacheBusyRef.current) return { ok: false, warning: '已有曲目正在缓存，请稍候。' };
    const track = stateRef.current.tracks.find((item) => item.id === trackId);
    if (!track?.url) return { ok: false, warning: track ? '本地导入曲目不需要重复缓存。' : '曲目不存在。' };
    if (track.asset) return { ok: false, warning: '该曲目已经有离线缓存。' };
    cacheBusyRef.current = true; setCacheBusyTrackId(trackId);
    const assetId = `music-cache-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
    try {
      const downloaded = await downloadMusicAsset(track.url);
      await saveAsset({ id: assetId, blob: downloaded.blob, mimeType: downloaded.mimeType, category: 'music', createdAt: stamp() });
      const attached = attachMusicOfflineAsset(stateRef.current, trackId, { kind: 'stored', assetId }, stamp());
      if (!attached.ok) { await deleteAsset(assetId); return { ok: false, warning: attached.warning }; }
      if (playingRef.current && stateRef.current.currentTrackId === trackId) pendingAutoplayTrackIdRef.current = trackId;
      commit(attached.state);
      return { ok: true };
    } catch (error) {
      await deleteAsset(assetId).catch(() => undefined);
      return { ok: false, warning: error instanceof Error ? error.message : '离线缓存下载失败。' };
    } finally { cacheBusyRef.current = false; setCacheBusyTrackId(undefined); }
  }, [commit]);
  const removeTrackOfflineCache = useCallback(async (trackId: string) => {
    if (cacheBusyRef.current) return { ok: false, warning: '已有曲目正在缓存，请稍候。' };
    const track = stateRef.current.tracks.find((item) => item.id === trackId);
    const assetId = track?.asset?.assetId;
    const detached = detachMusicOfflineAsset(stateRef.current, trackId, stamp());
    if (!detached.ok || !assetId) return { ok: false, warning: detached.warning };
    if (playingRef.current && stateRef.current.currentTrackId === trackId) pendingAutoplayTrackIdRef.current = trackId;
    commit(detached.state);
    if (!isMusicAssetReferenced(detached.state.tracks, assetId)) {
      const asset = await loadAsset(assetId);
      if (asset?.category === 'music') await deleteAsset(assetId);
    }
    return { ok: true };
  }, [commit]);
  const clearOfflineCaches = useCallback(async () => {
    if (cacheBusyRef.current) return { ok: false, count: 0, warning: '已有曲目正在缓存，请稍候。' };
    const cached = stateRef.current.tracks.filter((track) => track.url && track.asset);
    if (!cached.length) return { ok: true, count: 0 };
    const assetIds = new Set(cached.flatMap((track) => track.asset ? [track.asset.assetId] : []));
    const stampValue = stamp();
    let next = stateRef.current;
    for (const track of cached) {
      const detached = detachMusicOfflineAsset(next, track.id, stampValue);
      if (!detached.ok) return { ok: false, count: 0, warning: detached.warning };
      next = detached.state;
    }
    if (playingRef.current && cached.some((track) => track.id === stateRef.current.currentTrackId)) pendingAutoplayTrackIdRef.current = stateRef.current.currentTrackId;
    commit(next);
    for (const assetId of assetIds) if (!isMusicAssetReferenced(next.tracks, assetId)) {
      const asset = await loadAsset(assetId);
      if (asset?.category === 'music') await deleteAsset(assetId);
    }
    return { ok: true, count: cached.length };
  }, [commit]);
  const removeTrack = useCallback(async (trackId: string) => {
    const removed = stateRef.current.tracks.find((track) => track.id === trackId);
    const result = removeMusicTrack(stateRef.current, trackId, stamp());
    if (result.ok) commit(result.state);
    const assetId = removed?.asset?.assetId;
    if (!result.ok || !assetId || isMusicAssetReferenced(result.state.tracks, assetId)) return;
    const asset = await loadAsset(assetId);
    if (asset?.category === 'music') await deleteAsset(assetId);
  }, [commit]);
  const moveTrack = useCallback((trackId: string, direction: -1 | 1) => {
    const result = moveMusicTrack(stateRef.current, trackId, direction, stamp());
    if (result.ok) commit(result.state);
  }, [commit]);

  return { audioRef, state, currentTrack, isReady, isPlaying, currentTime, duration, cacheBusyTrackId, addTrack, addLocalTrack, cacheTrackOffline, removeTrackOfflineCache, clearOfflineCaches, updateTrack, removeTrack, moveTrack, selectTrack: (trackId) => select(trackId, false), playTrack, play, pause, next, previous, seek, setVolume, setMode };
}

export function musicModeLabel(mode: MusicPlaybackMode): string {
  return mode === 'shuffle' ? '随机' : mode === 'repeat-one' ? '单曲循环' : '顺序';
}
