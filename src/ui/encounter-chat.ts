import type { CharacterCard } from '../data/content';
import type { SaveFile } from '../data/schema/save';
import type { EncounterPromptParticipant } from '../core/prompt/default-blocks';

export const OPENING_USER_PROMPT = '请根据以上规则生成这次相遇的开场叙述。';

export function appendOpeningUserPrompt(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return [...messages, { role: 'user', content: OPENING_USER_PROMPT }];
}

export type EncounterSceneMode = 'opening' | 'choice' | 'topics' | 'manual' | 'ended';

export type EncounterChatSession = {
  characterId: string;
  participantIds: string[];
  nodeId: string;
  mode: EncounterSceneMode;
  entryId?: string;
  lastResponseSource?: 'topic' | 'manual';
};

export function parseEncounterChatSession(raw: string | null): EncounterChatSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EncounterChatSession>;
    if (
      typeof parsed.characterId !== 'string'
      || !Array.isArray(parsed.participantIds)
      || typeof parsed.nodeId !== 'string'
      || !['opening', 'choice', 'topics', 'manual', 'ended'].includes(parsed.mode ?? '')
    ) return null;
    const participantIds = [...new Set(parsed.participantIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))];
    if (!participantIds.length || !participantIds.includes(parsed.characterId)) return null;
    return {
      characterId: parsed.characterId,
      participantIds,
      nodeId: parsed.nodeId,
      mode: parsed.mode as EncounterSceneMode,
      ...(typeof parsed.entryId === 'string' ? { entryId: parsed.entryId } : {}),
      ...(parsed.lastResponseSource === 'topic' || parsed.lastResponseSource === 'manual' ? { lastResponseSource: parsed.lastResponseSource } : {}),
    };
  } catch {
    return null;
  }
}

export function encounterPromptParticipant(world: SaveFile['world'], cards: CharacterCard[], id: string): EncounterPromptParticipant | undefined {
  const formal = world.characters[id];
  if (formal) {
    const card = cards.find((item) => item.id === id);
    return {
      id,
      name: card?.name ?? formal.name,
      tier: 'formal',
      description: card?.description ?? formal.card.description,
      personality: card?.personality ?? formal.card.personality,
      scenario: card?.scenario ?? formal.card.scenario,
      firstMes: card?.firstMes ?? formal.card.firstMes,
    };
  }
  const npc = world.npcs[id];
  if (!npc) return undefined;
  return { id, name: npc.name, tier: 'semi', facts: npc.facts, tags: npc.tags, lightMemory: npc.lightMemory };
}

export function encounterPromptParticipants(world: SaveFile['world'], cards: CharacterCard[], ids: string[]): EncounterPromptParticipant[] {
  return [...new Set(ids)].flatMap((id) => {
    const participant = encounterPromptParticipant(world, cards, id);
    return participant ? [participant] : [];
  });
}

export function localEncounterOpening(world: SaveFile['world'], participantIds: string[]): string {
  const node = world.map.nodes[world.player.nodeId];
  const names = participantIds.map((id) => world.characters[id]?.name ?? world.npcs[id]?.name ?? id).join('、');
  const place = node?.name ?? world.player.nodeId;
  return `[旁白] 第 ${world.clock.day} 天的${world.clock.slotId}，${world.player.name}在${place}停下脚步。${names ? `${names}也在这里，这次相遇有了继续交谈的余地。` : '四周的动静渐渐清晰起来。'}`;
}

export function isFormalEncounterParticipant(world: SaveFile['world'], id: string): boolean {
  return Boolean(world.characters[id]);
}

export function rejectNpcTargetedOps(ops: unknown[], npcIds: string[]): { ops: unknown[]; rejected: number } {
  const blocked = new Set(npcIds);
  if (!blocked.size) return { ops, rejected: 0 };
  const referencesNpc = (op: unknown): boolean => {
    if (!op || typeof op !== 'object' || Array.isArray(op)) return false;
    const record = op as Record<string, unknown>;
    for (const key of ['target', 'from', 'charId', 'characterId', 'actorId']) {
      if (typeof record[key] === 'string' && blocked.has(record[key])) return true;
    }
    return Array.isArray(record.charIds) && record.charIds.some((id) => typeof id === 'string' && blocked.has(id));
  };
  const safe = ops.filter((op) => !referencesNpc(op));
  return { ops: safe, rejected: ops.length - safe.length };
}
