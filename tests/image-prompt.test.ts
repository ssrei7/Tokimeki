import { describe, expect, it } from 'vitest';
import { buildCharacterImagePrompt, buildChatCgPrompt } from '../src/providers/image-prompt';

describe('character image prompt', () => {
  it('combines scene, global style and appearance locally', () => {
    expect(buildCharacterImagePrompt({ scenePrompt: '站在海边', stylePrompt: '电影感胶片', appearancePrompt: '短黑发、蓝眼睛' })).toBe('站在海边\n全局画风：电影感胶片\n角色外貌：短黑发、蓝眼睛');
  });

  it('rejects an empty prompt', () => {
    expect(() => buildCharacterImagePrompt({ scenePrompt: '  ' })).toThrow('图像生成要求');
  });

  it('combines dialogue/action scene text with participant identities locally', () => {
    expect(buildChatCgPrompt({ scenePrompt: '她握住我的手，低声说“别走”', locationName: '西码头', stylePrompt: '电影感', characters: [{ name: '凛', appearancePrompt: '短发' }], player: { name: '我', appearancePrompt: '戴眼镜' } })).toBe('画面描述：她握住我的手，低声说“别走”\n地点：西码头\n角色 凛 的固定外貌：短发\n用户 我 的固定外貌：戴眼镜\n全局画风：电影感');
  });
});
