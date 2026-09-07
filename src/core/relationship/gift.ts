import type { FormalCharacter, ItemDef, RelationState } from '../../data/schema/save';

export type GiftReaction = 'special' | 'liked' | 'disliked' | 'neutral';

export interface GiftEvaluation {
  reaction: GiftReaction;
  score: number;
  itemId: string;
  stageId?: string;
  moodWord?: string;
  matchedLikeTags: string[];
  matchedDislikeTags: string[];
  specialItem: boolean;
}

export function evaluateGift(item: ItemDef, character: FormalCharacter, relation?: RelationState): GiftEvaluation {
  const prefs = character.giftPrefs;
  const matchedLikeTags = prefs?.likeTags.filter((tag) => item.tags.includes(tag)) ?? [];
  const matchedDislikeTags = prefs?.dislikeTags.filter((tag) => item.tags.includes(tag)) ?? [];
  const specialValue = prefs?.specialItems[item.id];
  const specialItem = typeof specialValue === 'number';
  const score = (specialValue ?? 0) + matchedLikeTags.length - matchedDislikeTags.length;
  const reaction: GiftReaction = specialItem ? 'special' : matchedDislikeTags.length > matchedLikeTags.length ? 'disliked' : matchedLikeTags.length ? 'liked' : 'neutral';
  return { reaction, score, itemId: item.id, stageId: relation?.stageId, moodWord: relation?.mood?.word, matchedLikeTags, matchedDislikeTags, specialItem };
}
