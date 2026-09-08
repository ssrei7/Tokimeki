import { PresetBundleSchema, type PresetBundle } from '../content';

export const BUILTIN_NARRATION_PRESET_BUNDLE_ID = 'builtin-narration-controls';

export function createBuiltinNarrationPresetBundle(): PresetBundle {
  return PresetBundleSchema.parse({
    id: BUILTIN_NARRATION_PRESET_BUNDLE_ID,
    name: '基础叙事控制',
    updatedAt: '2000-01-01T00:00:00.000Z',
    entries: [
      {
        id: 'builtin-player-authorship',
        name: '玩家代写方式',
        systemPrompt: '不要替玩家补写台词、行动、心理活动或决定。角色向玩家提问后停下来等待玩家输入；其他角色不得替玩家回答。',
        enabled: true,
        temperature: 0.7,
        maxOutputTokens: 1024,
        updatedAt: '2000-01-01T00:00:00.000Z',
      },
      {
        id: 'builtin-narration-person',
        name: '旁白人称',
        systemPrompt: '旁白使用玩家第一人称视角；角色台词仍按各自说话方式表达。',
        enabled: true,
        temperature: 0.7,
        maxOutputTokens: 1024,
        updatedAt: '2000-01-01T00:00:00.000Z',
      },
      {
        id: 'builtin-character-initiative',
        name: '角色主动性',
        systemPrompt: '默认让角色主动注意、记住并靠近玩家。普通聊天和轻互动不要以挫败式拒绝作为主要反馈；忙碌、低落或关系较浅时，优先改变回应方式、投入程度和距离感，并保留后续接触、邀约、提问或陪伴的空间。玩家不是需要不断答题讨好角色的攻略者，而是可以接受、拒绝或暂缓角色主动靠近的叙事主角。',
        enabled: true,
        temperature: 0.7,
        maxOutputTokens: 1024,
        updatedAt: '2000-01-01T00:00:00.000Z',
      },
    ],
  });
}

export function mergeBuiltinNarrationPresetBundle(stored?: PresetBundle): PresetBundle {
  const defaults = createBuiltinNarrationPresetBundle();
  if (!stored) return defaults;
  const defaultIds = new Set(defaults.entries.map((entry) => entry.id));
  return PresetBundleSchema.parse({
    ...stored,
    entries: [
      ...defaults.entries.map((entry) => stored.entries.find((candidate) => candidate.id === entry.id) ?? entry),
      ...stored.entries.filter((entry) => !defaultIds.has(entry.id)),
    ],
  });
}
