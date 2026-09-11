import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { loadMusicState, saveMusicState } from '../../data/db/content';
import {
  addMusicTrack,
  createMusicState,
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

export type MusicPlayerController = {
  audioRef: RefObject<HTMLAudioElement | null>;
  state: MusicState;
  currentTrack?: MusicTrack;
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  addTrack: (input: MusicTrackInput) => { ok: boolean; warning?: string };
  updateTrack: (trackId: string, input: MusicTrackInput) => { ok: boolean; warning?: string };
  removeTrack: (trackId: string) => void;
  moveTrack: (trackId: string, direction: -1 | 1) => void;
  selectTrack: (trackId: string) => void;
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
  const stateRef = useRef(state);
  const playingRef = useRef(false);
  const loadedTrackIdRef = useRef<string | undefined>(undefined);
  const loadedUrlRef = useRef<string | undefined>(undefined);
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
      commit(selected.state);
      window.setTimeout(() => { void audio.play().catch(() => undefined); }, 0);
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
    if (loadedTrackIdRef.current === stateRef.current.currentTrackId && loadedUrlRef.current === track?.url) return;
    loadedTrackIdRef.current = stateRef.current.currentTrackId;
    loadedUrlRef.current = track?.url;
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
      return;
    }
    audio.src = track.url;
    audio.volume = stateRef.current.volume;
    audio.load();
  }, [isReady, state.currentTrackId, currentTrack?.url]);

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
    commit(selected.state);
    if (resume) window.setTimeout(() => { void audioRef.current?.play().catch(() => undefined); }, 0);
  }, [commit]);

  const play = useCallback(async (): Promise<void> => {
    const audio = audioRef.current;
    if (!audio || !stateRef.current.currentTrackId) return;
    const next = stateRef.current.lastError ? setMusicError(stateRef.current, undefined, stamp()) : stateRef.current;
    if (next !== stateRef.current) commit(next);
    try { await audio.play(); } catch (error) { commit(setMusicError(stateRef.current, error instanceof Error ? `无法开始播放：${error.message}` : '无法开始播放。', stamp())); }
  }, [commit]);

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

  const addTrack = useCallback((input: MusicTrackInput) => {
    const result = addMusicTrack(stateRef.current, input, stamp());
    if (result.ok) commit(result.state);
    return { ok: result.ok, warning: result.warning };
  }, [commit]);
  const updateTrack = useCallback((trackId: string, input: MusicTrackInput) => {
    const result = updateMusicTrack(stateRef.current, trackId, input, stamp());
    if (result.ok) commit(result.state);
    return { ok: result.ok, warning: result.warning };
  }, [commit]);
  const removeTrack = useCallback((trackId: string) => {
    const result = removeMusicTrack(stateRef.current, trackId, stamp());
    if (result.ok) commit(result.state);
  }, [commit]);
  const moveTrack = useCallback((trackId: string, direction: -1 | 1) => {
    const result = moveMusicTrack(stateRef.current, trackId, direction, stamp());
    if (result.ok) commit(result.state);
  }, [commit]);

  return { audioRef, state, currentTrack, isReady, isPlaying, currentTime, duration, addTrack, updateTrack, removeTrack, moveTrack, selectTrack: (trackId) => select(trackId, false), play, pause, next, previous, seek, setVolume, setMode };
}

export function musicModeLabel(mode: MusicPlaybackMode): string {
  return mode === 'shuffle' ? '随机' : mode === 'repeat-one' ? '单曲循环' : '顺序';
}
