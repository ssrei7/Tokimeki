import { describe, expect, it } from 'vitest';
import { MusicStateSchema, MusicTrackSchema } from '../src/data/content';
import { addMusicTrack, attachMusicOfflineAsset, createMusicState, detachMusicOfflineAsset, moveMusicTrack, nextMusicTrack, normalizeMusicState, removeMusicTrack, setMusicMode, setMusicVolume, updateMusicTrack } from '../src/features/music/model';

const updatedAt = '2026-01-01T00:00:00.000Z';

function stateWithTracks() {
  let state = createMusicState(updatedAt);
  for (const [id, title] of [['a', 'A'], ['b', 'B'], ['c', 'C']] as const) {
    const result = addMusicTrack(state, { id, title, artist: 'Artist', url: `https://example.com/${id}.mp3` }, updatedAt);
    expect(result.ok).toBe(true);
    state = result.state;
  }
  return state;
}

describe('music model', () => {
  it('validates http(s) tracks and state defaults', () => {
    expect(MusicTrackSchema.safeParse({ id: 'a', title: 'A', url: 'file:///tmp/a.mp3', updatedAt }).success).toBe(false);
    expect(MusicTrackSchema.safeParse({ id: 'local', title: 'Local', asset: { kind: 'stored', assetId: 'music-1' }, updatedAt }).success).toBe(true);
    expect(MusicTrackSchema.safeParse({ id: 'missing', title: 'Missing', updatedAt }).success).toBe(false);
    const state = MusicStateSchema.parse({ id: 'default', tracks: [], updatedAt });
    expect(state.mode).toBe('sequence');
    expect(state.volume).toBe(0.8);
    expect(state.positionSeconds).toBe(0);
  });

  it('adds, edits, reorders and removes tracks', () => {
    let state = stateWithTracks();
    expect(state.tracks.map((track) => track.id)).toEqual(['a', 'b', 'c']);
    const edited = updateMusicTrack(state, 'b', { title: 'B2', url: 'https://example.com/b2.ogg' }, updatedAt);
    expect(edited.ok).toBe(true);
    state = edited.state;
    state = moveMusicTrack(state, 'c', -1, updatedAt).state;
    expect(state.tracks.map((track) => track.id)).toEqual(['a', 'c', 'b']);
    state = removeMusicTrack(state, 'a', updatedAt).state;
    expect(state.currentTrackId).toBe('c');
    expect(state.tracks.map((track) => track.id)).toEqual(['c', 'b']);
  });

  it('rejects malformed track input without changing state', () => {
    const state = createMusicState(updatedAt);
    const result = addMusicTrack(state, { title: 'Nope', url: 'javascript:alert(1)' }, updatedAt);
    expect(result.ok).toBe(false);
    expect(result.state).toEqual(state);
  });

  it('keeps a local asset while editing metadata and allows a URL plus cached asset', () => {
    const initial = addMusicTrack(createMusicState(updatedAt), { id: 'local', title: 'Local', asset: { kind: 'stored', assetId: 'music-1' } }, updatedAt);
    expect(initial.ok).toBe(true);
    const edited = updateMusicTrack(initial.state, 'local', { title: 'Renamed', artist: 'Artist' }, updatedAt);
    expect(edited.ok).toBe(true);
    expect(edited.state.tracks[0]).toMatchObject({ title: 'Renamed', artist: 'Artist', asset: { kind: 'stored', assetId: 'music-1' } });
    expect(MusicTrackSchema.safeParse({ id: 'cached', title: 'Cached', url: 'https://example.com/a.mp3', asset: { kind: 'stored', assetId: 'music-2' }, updatedAt }).success).toBe(true);
  });

  it('attaches and detaches offline assets only for URL tracks', () => {
    const state = stateWithTracks();
    const attached = attachMusicOfflineAsset(state, 'a', { kind: 'stored', assetId: 'cache-a' }, updatedAt);
    expect(attached.ok).toBe(true);
    expect(attached.state.tracks[0]).toMatchObject({ url: 'https://example.com/a.mp3', asset: { kind: 'stored', assetId: 'cache-a' } });
    const detached = detachMusicOfflineAsset(attached.state, 'a', updatedAt);
    expect(detached.ok).toBe(true);
    expect(detached.state.tracks[0].url).toBe('https://example.com/a.mp3');
    expect(detached.state.tracks[0].asset).toBeUndefined();

    const local = addMusicTrack(createMusicState(updatedAt), { id: 'local', title: 'Local', asset: { kind: 'stored', assetId: 'local-a' } }, updatedAt).state;
    expect(detachMusicOfflineAsset(local, 'local', updatedAt).ok).toBe(false);
    expect(attachMusicOfflineAsset(local, 'local', { kind: 'stored', assetId: 'duplicate' }, updatedAt).ok).toBe(false);
  });

  it('advances sequence mode to the next track', () => {
    const state = stateWithTracks();
    const result = nextMusicTrack(state);
    expect(result.trackId).toBe('b');
  });

  it('builds shuffle mode without immediately repeating the current track', () => {
    const state = setMusicMode(stateWithTracks(), 'shuffle', updatedAt, () => 0);
    expect(state.shuffleQueue).toHaveLength(2);
    expect(state.shuffleQueue).not.toContain(state.currentTrackId);
    const result = nextMusicTrack(state, () => 0);
    expect(result.trackId).not.toBe(state.currentTrackId);
    expect(result.state.shuffleQueue).toHaveLength(1);
  });

  it('keeps the current track for repeat-one and clamps volume', () => {
    const state = setMusicMode(stateWithTracks(), 'repeat-one', updatedAt);
    expect(nextMusicTrack(state).trackId).toBe(state.currentTrackId);
    expect(setMusicVolume(state, 2, updatedAt).volume).toBe(1);
    expect(setMusicVolume(state, -1, updatedAt).volume).toBe(0);
  });

  it('normalizes stale selection and shuffle references', () => {
    const normalized = normalizeMusicState({ ...stateWithTracks(), currentTrackId: 'missing', shuffleQueue: ['missing', 'a'] }, updatedAt);
    expect(normalized.currentTrackId).toBe('a');
    expect(normalized.shuffleQueue).toEqual(['a']);
  });
});
