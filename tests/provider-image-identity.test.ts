import { describe, expect, it } from 'vitest';
import { faceReferenceAssetIdForGeneration, imageReferenceAssetIds } from '../src/providers/image-identity';
import { ImageUserVisualConfigSchema, ImageVisualConfigSchema, type ImageUserVisualConfig, type ImageVisualConfig } from '../src/providers/types';

const base = { saveId: 'save-1', appearancePrompt: '', lockFaceEnabled: true, updatedAt: '2026-09-18T00:00:00.000Z' };

describe('image identity references', () => {
  it('only includes locally stored references in asset scans', () => {
    const characters: ImageVisualConfig[] = [
      { ...base, id: 'character-local', characterId: 'local', referenceImage: { kind: 'stored', assetId: 'asset-1' } },
      { ...base, id: 'character-url', characterId: 'url', referenceImage: { kind: 'url', url: 'https://example.com/face.png' } },
    ];
    const users: ImageUserVisualConfig[] = [{ ...base, id: 'user-local', identityId: 'player', identityKind: 'player', referenceImage: { kind: 'stored', assetId: 'asset-2' } }];
    expect([...imageReferenceAssetIds(characters, users)]).toEqual(['asset-1', 'asset-2']);
  });

  it('never sends an external reference to images edits', () => {
    const local: ImageVisualConfig = { ...base, id: 'local', characterId: 'local', referenceImage: { kind: 'stored', assetId: 'asset-1' } };
    const external: ImageVisualConfig = { ...base, id: 'url', characterId: 'url', referenceImage: { kind: 'url', url: 'https://example.com/face.png' } };
    expect(faceReferenceAssetIdForGeneration(local, 'openai-edits')).toBe('asset-1');
    expect(faceReferenceAssetIdForGeneration(local, 'none')).toBeUndefined();
    expect(faceReferenceAssetIdForGeneration(external, 'openai-edits')).toBeUndefined();
  });

  it('keeps old stored references compatible while accepting external references', () => {
    expect(ImageVisualConfigSchema.parse({ ...base, id: 'local', characterId: 'local', referenceImage: { kind: 'stored', assetId: 'asset-1' } }).referenceImage?.kind).toBe('stored');
    expect(ImageUserVisualConfigSchema.parse({ ...base, id: 'url', identityId: 'player', identityKind: 'player', referenceImage: { kind: 'url', url: 'https://example.com/player.png' } }).referenceImage?.kind).toBe('url');
  });
});
