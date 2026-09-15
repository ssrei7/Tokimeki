import { describe, expect, it } from 'vitest';
import { buildCharacterImagePrompt } from '../src/providers/image-prompt';

describe('character image prompt', () => {
  it('combines scene, global style and appearance locally', () => {
    expect(buildCharacterImagePrompt({ scenePrompt: '站在海边', stylePrompt: '电影感胶片', appearancePrompt: '短黑发、蓝眼睛' })).toBe('站在海边\n全局画风：电影感胶片\n角色外貌：短黑发、蓝眼睛');
  });

  it('rejects an empty prompt', () => {
    expect(() => buildCharacterImagePrompt({ scenePrompt: '  ' })).toThrow('图像生成要求');
  });
});
