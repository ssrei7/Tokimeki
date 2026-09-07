import type { CharacterCard } from '../../data/content';
import { FormalCharacterSchema, type FormalCharacter, type WorldState } from '../../data/schema/save';

export interface RosterResult {
  ok: boolean;
  character?: FormalCharacter;
  warning?: string;
}

export function formalCharacterFromCard(card: CharacterCard, homeNodeId: string): FormalCharacter {
  return FormalCharacterSchema.parse({
    id: card.id, name: card.name, tier: 'formal',
    card: { description: card.description, personality: card.personality, scenario: card.scenario, firstMes: card.firstMes, exampleDialogue: card.exampleDialogue },
    visuals: { portraits: [] }, homeNodeId, schedule: { grid: {}, overrides: {} }, source: 'user',
  });
}

export function addCharacterToWorld(world: WorldState, card: CharacterCard, homeNodeId = world.player.nodeId): RosterResult {
  if (!world.map.nodes[homeNodeId]) return { ok: false, warning: `Unknown home node: ${homeNodeId}.` };
  const existing = world.characters[card.id];
  const character = existing
    ? FormalCharacterSchema.parse({ ...existing, name: card.name, card: { ...existing.card, description: card.description, personality: card.personality, scenario: card.scenario, firstMes: card.firstMes, exampleDialogue: card.exampleDialogue } })
    : formalCharacterFromCard(card, homeNodeId);
  world.characters[card.id] = character;
  if (!world.relations[card.id]) world.relations[card.id] = { axes: {}, knots: [], memories: [] };
  return { ok: true, character };
}
