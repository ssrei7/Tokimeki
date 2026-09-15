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
