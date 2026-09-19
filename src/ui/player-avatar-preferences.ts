import { AssetRefSchema, type AssetRef } from '../data/schema/save';

export const PLAYER_AVATAR_STORAGE_KEY = 'tokimeki.player-avatars.v1';
export type PlayerAvatarOverrides = Record<string, AssetRef>;

export function parsePlayerAvatarOverrides(value: unknown): PlayerAvatarOverrides {
  if (!value || typeof value !== 'object') return {};
  const result: PlayerAvatarOverrides = {};
  for (const [saveId, reference] of Object.entries(value as Record<string, unknown>)) {
    if (!saveId) continue;
    const parsed = AssetRefSchema.safeParse(reference);
    if (parsed.success && (parsed.data.kind === 'stored' || /^https?:\/\//i.test(parsed.data.url))) result[saveId] = parsed.data;
  }
  return result;
}

export function readPlayerAvatarOverrides(storage: Pick<Storage, 'getItem'>): PlayerAvatarOverrides {
  try {
    const raw = storage.getItem(PLAYER_AVATAR_STORAGE_KEY);
    return raw ? parsePlayerAvatarOverrides(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function readPlayerAvatar(storage: Pick<Storage, 'getItem'>, saveId: string): AssetRef | undefined {
  return readPlayerAvatarOverrides(storage)[saveId];
}

export function writePlayerAvatar(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, saveId: string, avatar?: AssetRef): void {
  const next = readPlayerAvatarOverrides(storage);
  if (avatar) next[saveId] = AssetRefSchema.parse(avatar);
  else delete next[saveId];
  try {
    if (Object.keys(next).length) storage.setItem(PLAYER_AVATAR_STORAGE_KEY, JSON.stringify(next));
    else storage.removeItem(PLAYER_AVATAR_STORAGE_KEY);
  } catch {
    throw new Error('无法保存玩家头像偏好。');
  }
}
