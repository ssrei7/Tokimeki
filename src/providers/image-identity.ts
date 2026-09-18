import type { ImageUserVisualConfig, ImageVisualConfig } from './types';

export interface ImageIdentity {
  id: string;
  kind: 'player' | 'persona';
}

export function currentImageIdentity(personaId?: string): ImageIdentity {
  return personaId ? { id: personaId, kind: 'persona' } : { id: 'player', kind: 'player' };
}

export function imageCharacterConfigId(saveId: string, characterId: string): string {
  return `${saveId}:${characterId}`;
}

export function imageUserConfigId(saveId: string, identity: ImageIdentity): string {
  return `${saveId}:${identity.kind}:${identity.id}`;
}

export function imageReferenceAssetIds(characterConfigs: readonly ImageVisualConfig[], userConfigs: readonly ImageUserVisualConfig[]): Set<string> {
  return new Set([...characterConfigs, ...userConfigs].flatMap((config) => config.referenceImage?.kind === 'stored' ? [config.referenceImage.assetId] : []));
}

export function faceReferenceAssetIdForGeneration(config: ImageVisualConfig | undefined, referenceMode: 'none' | 'openai-edits'): string | undefined {
  return config?.lockFaceEnabled && referenceMode === 'openai-edits' && config.referenceImage?.kind === 'stored' ? config.referenceImage.assetId : undefined;
}
