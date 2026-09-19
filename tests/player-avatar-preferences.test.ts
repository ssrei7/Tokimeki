import { describe, expect, it } from 'vitest';
import { PLAYER_AVATAR_STORAGE_KEY, parsePlayerAvatarOverrides, readPlayerAvatar, writePlayerAvatar } from '../src/ui/player-avatar-preferences';

describe('player avatar preferences', () => {
  it('stores avatars by world without changing SaveFile', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
    writePlayerAvatar(storage, 'world-a', { kind: 'stored', assetId: 'avatar-a' });
    writePlayerAvatar(storage, 'world-b', { kind: 'url', url: 'https://example.com/avatar.png' });
    expect(readPlayerAvatar(storage, 'world-a')).toEqual({ kind: 'stored', assetId: 'avatar-a' });
    expect(readPlayerAvatar(storage, 'world-b')).toEqual({ kind: 'url', url: 'https://example.com/avatar.png' });
    writePlayerAvatar(storage, 'world-a');
    expect(readPlayerAvatar(storage, 'world-a')).toBeUndefined();
    expect(values.has(PLAYER_AVATAR_STORAGE_KEY)).toBe(true);
  });

  it('drops malformed entries while preserving valid references', () => {
    expect(parsePlayerAvatarOverrides({ good: { kind: 'stored', assetId: 'avatar' }, bad: { kind: 'url', url: 'ftp://example.com/a.png' } })).toEqual({ good: { kind: 'stored', assetId: 'avatar' } });
  });
});
