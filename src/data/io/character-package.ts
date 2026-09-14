import { CharacterCardSchema, type CharacterCard } from '../content';
import type { AssetRef, FormalCharacter } from '../schema/save';

export function characterCardForPackage(card: CharacterCard | undefined, character: FormalCharacter, updatedAt: string): CharacterCard {
  return CharacterCardSchema.parse({
    id: character.id,
    name: character.name,
    description: card?.description ?? character.card.description,
    personality: card?.personality ?? character.card.personality,
    scenario: card?.scenario ?? character.card.scenario,
    firstMes: card?.firstMes ?? character.card.firstMes,
    exampleDialogue: card?.exampleDialogue ?? character.card.exampleDialogue,
    packageProfile: {
      visuals: character.visuals,
      ...(character.initialAxes ? { initialAxes: character.initialAxes } : {}),
      ...(character.giftPrefs ? { giftPrefs: character.giftPrefs } : {}),
      ...(character.worldbookIds ? { worldbookIds: character.worldbookIds } : {}),
    },
    updatedAt,
  });
}

export function remapCharacterCardAssetIds(card: CharacterCard, replacements: ReadonlyMap<string, string>): CharacterCard {
  const visuals = card.packageProfile?.visuals;
  if (!visuals || replacements.size === 0) return card;
  const remap = (reference: AssetRef | undefined): AssetRef | undefined => reference?.kind === 'stored' && replacements.has(reference.assetId)
    ? { kind: 'stored', assetId: replacements.get(reference.assetId)! }
    : reference;
  return CharacterCardSchema.parse({
    ...card,
    packageProfile: {
      ...card.packageProfile,
      visuals: {
        ...visuals,
        avatar: remap(visuals.avatar),
        portraits: visuals.portraits.map((portrait) => ({ ...portrait, image: remap(portrait.image)! })),
      },
    },
  });
}
