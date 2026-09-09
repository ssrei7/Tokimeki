import type { CharacterCard } from '../../data/content';
import { FormalCharacterSchema, type FormalCharacter, type WorldState } from '../../data/schema/save';

export interface RosterResult {
  ok: boolean;
  character?: FormalCharacter;
  warning?: string;
}

export interface PromoteNpcDetails {
  description?: string;
  personality?: string;
  scenario?: string;
  firstMes?: string;
  exampleDialogue?: string;
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

/** Promote one persisted semi-formal NPC without making a provider call. */
export function promoteNpc(world: WorldState, charId: string, details: PromoteNpcDetails = {}): RosterResult {
  const npc = world.npcs[charId];
  if (!npc) return { ok: false, warning: `Unknown semi-formal NPC: ${charId}.` };
  if (world.characters[charId]) return { ok: false, warning: `Character already exists: ${charId}.` };
  if (npc.homeNodeId && !world.map.nodes[npc.homeNodeId]) return { ok: false, warning: `Unknown home node: ${npc.homeNodeId}.` };
  const description = details.description?.trim() || npc.facts.join('；') || `${npc.name} 是这个世界里有自己生活轨迹的人。`;
  const personality = details.personality?.trim() || npc.tags.join('、') || '还在逐渐显露自己的性格。';
  const character = FormalCharacterSchema.parse({
    id: npc.id,
    name: npc.name,
    tier: 'formal',
    card: {
      description,
      personality,
      ...(details.scenario?.trim() ? { scenario: details.scenario.trim() } : {}),
      ...(details.firstMes?.trim() ? { firstMes: details.firstMes.trim() } : {}),
      ...(details.exampleDialogue?.trim() ? { exampleDialogue: details.exampleDialogue.trim() } : {}),
    },
    visuals: { portraits: [], ...(npc.visuals?.avatar ? { avatar: npc.visuals.avatar } : {}) },
    ...(npc.homeNodeId ? { homeNodeId: npc.homeNodeId } : {}),
    schedule: npc.schedule ?? { grid: {}, overrides: {} },
    source: 'promoted',
  });
  const relation = world.relations[charId] ?? { axes: {}, knots: [], memories: [] };
  const existingTexts = new Set(relation.memories.map((memory) => memory.text));
  npc.lightMemory.forEach((text, index) => {
    const trimmed = text.trim();
    if (!trimmed || existingTexts.has(trimmed)) return;
    relation.memories.push({ id: `memory-promoted-${charId}-${index + 1}`, text: trimmed, day: world.clock.day, type: 'observation', source: { kind: 'system' }, importance: 'normal', archived: false, inject: true });
  });
  world.characters[charId] = character;
  world.relations[charId] = relation;
  delete world.npcs[charId];
  return { ok: true, character };
}
