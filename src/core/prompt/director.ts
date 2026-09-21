import type { DirectorPreferences, WorldState } from '../../data/schema/save';

const PACE_LABELS: Record<DirectorPreferences['pace'], string> = {
  slice_of_life: '日常为主',
  slow_burn: '慢慢升温',
  plot_forward: '推进主线',
  high_drama: '高戏剧性',
};

export function directorPreferencesAreEmpty(preferences?: DirectorPreferences): boolean {
  if (!preferences) return true;
  return !preferences.storyDirection.trim()
    && preferences.toneTags.length === 0
    && preferences.pace === 'slice_of_life'
    && !preferences.playerRoleNotes.trim()
    && preferences.npcPreferenceTags.length === 0
    && preferences.avoidTags.length === 0
    && !preferences.shortTermGoal.trim()
    && preferences.focusCharacterIds.length === 0;
}

export function buildNpcGenerationPreferencePrompt(preferences?: DirectorPreferences): string | null {
  if (!preferences) return null;
  const storyDirection = preferences.storyDirection.trim();
  const positive = preferences.npcPreferenceTags.map((tag) => tag.trim()).filter(Boolean);
  const avoid = preferences.avoidTags.map((tag) => tag.trim()).filter(Boolean);
  if (!storyDirection && positive.length === 0 && avoid.length === 0) return null;
  const lines = [
    '[当前世界 NPC / 新人生成偏好]',
    '以下只是当前世界对 NPC 出现和描写的软性倾向。请优先参考，但不要保证每次都命中，不要改写已有 NPC 资料，也不要把偏好写成已经成立的关系或世界事实。输出仍必须遵守当前任务的 JSON/字段白名单与事实安全边界。',
    storyDirection ? `相关剧情方向：${storyDirection}` : '',
    positive.length ? `优先考虑的 NPC 倾向：${positive.join('、')}` : '',
    avoid.length ? `尽量减少的 NPC/元素倾向：${avoid.join('、')}（不是绝对禁止）` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export function buildDirectorPreferencesPrompt(world?: WorldState): string | null {
  if (!world) return null;
  const preferences = world.director?.preferences;
  if (directorPreferencesAreEmpty(preferences)) return null;
  const focusNames = (preferences?.focusCharacterIds ?? [])
    .map((id) => world.characters[id]?.name)
    .filter((name): name is string => Boolean(name));
  const lines = [
    '[当前世界导演偏好]',
    '以下内容是玩家对当前世界后续叙事的偏好，不是已经成立的世界事实。请尽量体现在叙事倾向、出场侧重和氛围上，但不要把它们写成确定发生的关系、数值、时间、地点、日程或其他状态。',
    preferences?.storyDirection.trim() ? `剧情方向：${preferences.storyDirection.trim()}` : '',
    preferences?.toneTags.length ? `氛围标签：${preferences.toneTags.join('、')}` : '',
    preferences ? `剧情节奏：${PACE_LABELS[preferences.pace]}` : '',
    preferences?.playerRoleNotes.trim() ? `玩家/角色设定：${preferences.playerRoleNotes.trim()}` : '',
    preferences?.npcPreferenceTags.length ? `NPC 出现偏好：优先考虑 ${preferences.npcPreferenceTags.join('、')} 等倾向，但不要保证每次出现都符合，也不要改写已有 NPC 资料。` : '',
    preferences?.avoidTags.length ? `希望减少的元素：${preferences.avoidTags.join('、')}；这是软性叙事偏好，不是绝对禁止。` : '',
    preferences?.shortTermGoal.trim() ? `近期剧情目标：${preferences.shortTermGoal.trim()}` : '',
    focusNames.length ? `重点关注角色：${focusNames.join('、')}` : '',
    '长期文风和互动规则以启用的提示词预设为准；格式契约、确定性内核和状态操作安全边界优先于以上偏好。',
  ];
  return lines.filter(Boolean).join('\n');
}
