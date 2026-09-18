export interface ImagePromptParts {
  scenePrompt: string;
  stylePrompt?: string;
  appearancePrompt?: string;
}

export function buildCharacterImagePrompt(parts: ImagePromptParts): string {
  const sections = [
    parts.scenePrompt.trim(),
    parts.stylePrompt?.trim() ? `全局画风：${parts.stylePrompt.trim()}` : '',
    parts.appearancePrompt?.trim() ? `角色外貌：${parts.appearancePrompt.trim()}` : '',
  ].filter(Boolean);
  if (!sections.length) throw new Error('请先填写图像生成要求。');
  return sections.join('\n');
}

export interface ChatCgPromptParts {
  scenePrompt: string;
  locationName?: string;
  stylePrompt?: string;
  characters: Array<{ name: string; appearancePrompt?: string }>;
  player?: { name: string; appearancePrompt?: string };
}

export function buildChatCgPrompt(parts: ChatCgPromptParts): string {
  const scene = parts.scenePrompt.trim();
  if (!scene) throw new Error('请先填写 CG 画面描述。');
  if (!parts.characters.length) throw new Error('请至少选择一位入镜角色。');
  const sections = [
    `画面描述：${scene}`,
    parts.locationName?.trim() ? `地点：${parts.locationName.trim()}` : '',
    ...parts.characters.map((character) => character.appearancePrompt?.trim()
      ? `角色 ${character.name} 的固定外貌：${character.appearancePrompt.trim()}`
      : `入镜角色：${character.name}`),
    parts.player ? (parts.player.appearancePrompt?.trim()
      ? `用户 ${parts.player.name} 的固定外貌：${parts.player.appearancePrompt.trim()}`
      : `用户 ${parts.player.name} 入镜`) : '',
    parts.stylePrompt?.trim() ? `全局画风：${parts.stylePrompt.trim()}` : '',
  ].filter(Boolean);
  return sections.join('\n');
}
