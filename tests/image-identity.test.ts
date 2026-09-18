import { describe, expect, it } from 'vitest';
import { currentImageIdentity, faceReferenceAssetIdForGeneration, imageCharacterConfigId, imageReferenceAssetIds, imageUserConfigId } from '../src/providers/image-identity';
import { ImageVisualConfigSchema } from '../src/providers/types';

describe('image identity configuration', () => {
  it('isolates character and user references by world and identity', () => {
    expect(imageCharacterConfigId('world-a', 'rin')).not.toBe(imageCharacterConfigId('world-b', 'rin'));
    expect(imageUserConfigId('world-a', currentImageIdentity('mask-a'))).toBe('world-a:persona:mask-a');
    expect(imageUserConfigId('world-a', currentImageIdentity())).toBe('world-a:player:player');
  });

  it('collects shared references once for safe asset cleanup', () => {
    const updatedAt = new Date().toISOString();
    const ids = imageReferenceAssetIds(
      [{ id: 'a', saveId: 'world', characterId: 'rin', appearancePrompt: '', lockFaceEnabled: true, referenceImage: { kind: 'stored', assetId: 'shared' }, updatedAt }],
      [{ id: 'b', saveId: 'world', identityId: 'mask', identityKind: 'persona', appearancePrompt: '', lockFaceEnabled: true, referenceImage: { kind: 'stored', assetId: 'shared' }, updatedAt }],
    );
    expect([...ids]).toEqual(['shared']);
  });

  it('uses a character reference only when both lock face and edits capability are enabled', () => {
    const config = ImageVisualConfigSchema.parse({ id: 'world:rin', saveId: 'world', characterId: 'rin', appearancePrompt: '', lockFaceEnabled: true, referenceImage: { kind: 'stored', assetId: 'face' }, updatedAt: new Date().toISOString() });
    expect(faceReferenceAssetIdForGeneration(config, 'openai-edits')).toBe('face');
    expect(faceReferenceAssetIdForGeneration(config, 'none')).toBeUndefined();
    expect(faceReferenceAssetIdForGeneration({ ...config, lockFaceEnabled: false }, 'openai-edits')).toBeUndefined();
  });

  it('keeps legacy appearance-only records compatible', () => {
    const config = ImageVisualConfigSchema.parse({ id: 'world:rin', saveId: 'world', characterId: 'rin', appearancePrompt: '黑发', updatedAt: new Date().toISOString() });
    expect(config.lockFaceEnabled).toBe(false);
    expect(config.referenceImage).toBeUndefined();
  });
});
