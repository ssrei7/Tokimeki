import { MusicPlaybackModeSchema, MusicStateSchema, MusicTrackSchema, type MusicPlaybackMode, type MusicState, type MusicTrack } from '../../data/content';

export const MUSIC_STATE_ID = 'default' as const;

export interface MusicTrackInput {
  title: string;
  artist?: string;
  url: string;
  id?: string;
}

export interface MusicMutationResult {
  ok: boolean;
  state: MusicState;
  warning?: string;
}

export function createMusicState(updatedAt: string): MusicState {
  return MusicStateSchema.parse({ id: MUSIC_STATE_ID, tracks: [], mode: 'sequence', volume: 0.8, positionSeconds: 0, shuffleQueue: [], updatedAt });
}

export function normalizeMusicState(input: unknown, updatedAt: string): MusicState {
  const parsed = MusicStateSchema.safeParse(input);
  if (!parsed.success) return createMusicState(updatedAt);
  const tracks = parsed.data.tracks.filter((track) => MusicTrackSchema.safeParse(track).success);
  const currentTrackId = parsed.data.currentTrackId && tracks.some((track) => track.id === parsed.data.currentTrackId) ? parsed.data.currentTrackId : tracks[0]?.id;
  const shuffleQueue = parsed.data.shuffleQueue.filter((id) => tracks.some((track) => track.id === id));
  return MusicStateSchema.parse({ ...parsed.data, tracks, ...(currentTrackId ? { currentTrackId } : { currentTrackId: undefined }), shuffleQueue, updatedAt });
}

function withTimestamp(state: MusicState, updatedAt: string): MusicState {
  return MusicStateSchema.parse({ ...state, updatedAt });
}

function validUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
}

export function addMusicTrack(state: MusicState, input: MusicTrackInput, updatedAt: string): MusicMutationResult {
  const title = input.title.trim();
  const url = input.url.trim();
  if (!title) return { ok: false, state, warning: '曲目标题不能为空。' };
  if (!validUrl(url)) return { ok: false, state, warning: '音频地址必须是有效的 http(s) URL。' };
  const track = MusicTrackSchema.safeParse({ id: input.id?.trim() || `music-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, artist: input.artist?.trim() ?? '', url, updatedAt });
  if (!track.success) return { ok: false, state, warning: '曲目信息无效。' };
  const next = withTimestamp({ ...state, tracks: [...state.tracks, track.data], currentTrackId: state.currentTrackId ?? track.data.id, lastError: undefined }, updatedAt);
  return { ok: true, state: next };
}

export function updateMusicTrack(state: MusicState, trackId: string, input: MusicTrackInput, updatedAt: string): MusicMutationResult {
  const index = state.tracks.findIndex((track) => track.id === trackId);
  if (index < 0) return { ok: false, state, warning: '曲目不存在。' };
  const title = input.title.trim();
  const url = input.url.trim();
  if (!title) return { ok: false, state, warning: '曲目标题不能为空。' };
  if (!validUrl(url)) return { ok: false, state, warning: '音频地址必须是有效的 http(s) URL。' };
  const parsed = MusicTrackSchema.safeParse({ id: trackId, title, artist: input.artist?.trim() ?? '', url, updatedAt });
  if (!parsed.success) return { ok: false, state, warning: '曲目信息无效。' };
  const tracks = state.tracks.slice(); tracks[index] = parsed.data;
  return { ok: true, state: withTimestamp({ ...state, tracks, lastError: undefined }, updatedAt), };
}

export function removeMusicTrack(state: MusicState, trackId: string, updatedAt: string): MusicMutationResult {
  const index = state.tracks.findIndex((track) => track.id === trackId);
  if (index < 0) return { ok: false, state, warning: '曲目不存在。' };
  const tracks = state.tracks.filter((track) => track.id !== trackId);
  const nextCurrent = state.currentTrackId === trackId ? tracks[Math.min(index, Math.max(0, tracks.length - 1))]?.id : state.currentTrackId;
  return { ok: true, state: withTimestamp({ ...state, tracks, ...(nextCurrent ? { currentTrackId: nextCurrent } : { currentTrackId: undefined }), positionSeconds: state.currentTrackId === trackId ? 0 : state.positionSeconds, shuffleQueue: state.shuffleQueue.filter((id) => id !== trackId) }, updatedAt) };
}

export function moveMusicTrack(state: MusicState, trackId: string, direction: -1 | 1, updatedAt: string): MusicMutationResult {
  const index = state.tracks.findIndex((track) => track.id === trackId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.tracks.length) return { ok: false, state, warning: '曲目已经在列表边界。' };
  const tracks = state.tracks.slice(); [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
  return { ok: true, state: withTimestamp({ ...state, tracks }, updatedAt) };
}

export function setMusicMode(state: MusicState, mode: MusicPlaybackMode, updatedAt: string, random = Math.random): MusicState {
  const parsedMode = MusicPlaybackModeSchema.parse(mode);
  return withTimestamp({ ...state, mode: parsedMode, shuffleQueue: parsedMode === 'shuffle' ? buildShuffleQueue(state.tracks, state.currentTrackId, random) : [] }, updatedAt);
}

export function setMusicVolume(state: MusicState, volume: number, updatedAt: string): MusicState {
  return withTimestamp({ ...state, volume: Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : state.volume)) }, updatedAt);
}

export function selectMusicTrack(state: MusicState, trackId: string, updatedAt: string): MusicMutationResult {
  if (!state.tracks.some((track) => track.id === trackId)) return { ok: false, state, warning: '曲目不存在。' };
  return { ok: true, state: withTimestamp({ ...state, currentTrackId: trackId, positionSeconds: 0, lastError: undefined }, updatedAt) };
}

export function persistMusicPosition(state: MusicState, positionSeconds: number, updatedAt: string): MusicState {
  return withTimestamp({ ...state, positionSeconds: Math.max(0, Number.isFinite(positionSeconds) ? positionSeconds : 0) }, updatedAt);
}

export function setMusicError(state: MusicState, error: string | undefined, updatedAt: string): MusicState {
  return withTimestamp({ ...state, ...(error ? { lastError: error.slice(0, 500) } : { lastError: undefined }) }, updatedAt);
}

export function buildShuffleQueue(tracks: MusicTrack[], currentTrackId: string | undefined, random = Math.random): string[] {
  const ids = tracks.map((track) => track.id).filter((id) => id !== currentTrackId);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [ids[index], ids[target]] = [ids[target], ids[index]];
  }
  return ids;
}

export function nextMusicTrack(state: MusicState, random = Math.random): { state: MusicState; trackId?: string } {
  if (!state.tracks.length || !state.currentTrackId) return { state, trackId: undefined };
  if (state.mode === 'repeat-one') return { state, trackId: state.currentTrackId };
  if (state.mode === 'shuffle') {
    const queue = state.shuffleQueue.length ? state.shuffleQueue.slice() : buildShuffleQueue(state.tracks, state.currentTrackId, random);
    const [trackId, ...rest] = queue;
    return { state: { ...state, shuffleQueue: rest }, trackId: trackId ?? state.currentTrackId };
  }
  const index = state.tracks.findIndex((track) => track.id === state.currentTrackId);
  const trackId = state.tracks[(index + 1) % state.tracks.length]?.id ?? state.currentTrackId;
  return { state, trackId };
}

export function previousMusicTrack(state: MusicState): string | undefined {
  if (!state.tracks.length || !state.currentTrackId) return undefined;
  const index = state.tracks.findIndex((track) => track.id === state.currentTrackId);
  return state.tracks[(index - 1 + state.tracks.length) % state.tracks.length]?.id;
}
