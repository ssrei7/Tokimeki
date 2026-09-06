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
    ],
  });
}
