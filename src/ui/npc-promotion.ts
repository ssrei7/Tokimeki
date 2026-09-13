import type { CharacterCard } from '../data/content';
import type { CalendarConfig, FormalCharacter, NpcLite } from '../data/schema/save';

export interface NpcPromotionDraft {
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  exampleDialogue: string;
}

export interface PromoteNpcOpInput {
  op: 'promote_npc';
  target: string;
  description: string;
  personality: string;
  scenario?: string;
  firstMes?: string;
  exampleDialogue?: string;
}

export function createNpcPromotionDraft(npc: NpcLite): NpcPromotionDraft {
  return {
    description: npc.facts.map((fact) => fact.trim()).filter(Boolean).join('；') || `${npc.name} 是这个世界里有自己生活轨迹的人。`,
    personality: npc.tags.map((tag) => tag.trim()).filter(Boolean).join('、') || '还在逐渐显露自己的性格。',
    scenario: '',
    firstMes: '',
    exampleDialogue: '',
  };
}

export function buildPromoteNpcOp(npcId: string, draft: NpcPromotionDraft): PromoteNpcOpInput {
  const optional = (value: string) => value.trim() || undefined;
  return {
    op: 'promote_npc',
    target: npcId,
    description: draft.description.trim(),
    personality: draft.personality.trim(),
    ...(optional(draft.scenario) ? { scenario: optional(draft.scenario) } : {}),
    ...(optional(draft.firstMes) ? { firstMes: optional(draft.firstMes) } : {}),
    ...(optional(draft.exampleDialogue) ? { exampleDialogue: optional(draft.exampleDialogue) } : {}),
  };
}

export function characterCardFromPromotedCharacter(character: FormalCharacter, updatedAt: string): CharacterCard {
  return {
    id: character.id,
    name: character.name,
    description: character.card.description,
    personality: character.card.personality,
    ...(character.card.scenario ? { scenario: character.card.scenario } : {}),
    ...(character.card.firstMes ? { firstMes: character.card.firstMes } : {}),
    ...(character.card.exampleDialogue ? { exampleDialogue: character.card.exampleDialogue } : {}),
    updatedAt,
  };
}

export function summarizeNpcSchedule(
  npc: NpcLite,
  nodes: Record<string, { name: string }>,
  calendar: Pick<CalendarConfig, 'slots' | 'weekdayNames'>,
): string[] {
  if (!npc.schedule) return [];
  const slotNames = new Map(calendar.slots.map((slot) => [slot.id, slot.label ?? slot.name]));
  const location = (nodeId: string) => nodes[nodeId]?.name ?? nodeId;
  const weekly = Object.entries(npc.schedule.grid)
    .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => Boolean(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, cell]) => {
      const separator = key.indexOf(':');
      const weekday = Number(key.slice(0, separator));
      const slotId = key.slice(separator + 1);
      return `每周${calendar.weekdayNames[weekday] ?? `第 ${weekday + 1} 天`} · ${slotNames.get(slotId) ?? slotId}：${location(cell.nodeId)} · ${cell.activity}`;
    });
  const overrides = Object.entries(npc.schedule.overrides)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, cell]) => {
      const separator = key.indexOf(':');
      const day = key.slice(0, separator);
      const slotId = key.slice(separator + 1);
      return `D${day} · ${slotNames.get(slotId) ?? slotId}：${location(cell.nodeId)} · ${cell.activity}`;
    });
  return [...weekly, ...overrides];
}
