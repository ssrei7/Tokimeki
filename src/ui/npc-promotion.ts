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

export function buildNpcExpansionPrompt(npc: NpcLite, draft: NpcPromotionDraft): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content: '你是角色卡草稿助手。只根据用户提供的半正式 NPC 事实和当前草稿，只返回一个 JSON 对象，不要输出 Markdown、解释、ops 或任何世界状态变化。JSON 键只能是 description、personality、scenario、firstMes、exampleDialogue，值必须是字符串；不得编造具体经历、数值、地点或时间。',
    },
    {
      role: 'user',
      content: JSON.stringify({ npc: { id: npc.id, name: npc.name, facts: npc.facts, tags: npc.tags, lightMemory: npc.lightMemory }, draft }),
    },
  ];
}

export function parseNpcExpansionResponse(raw: string, fallback: NpcPromotionDraft): NpcPromotionDraft | undefined {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  let value: unknown;
  try { value = JSON.parse(trimmed.slice(start, end + 1)); } catch { return undefined; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const text = (key: keyof NpcPromotionDraft) => {
    if (typeof source[key] !== 'string') return fallback[key];
    const value = source[key].trim();
    return value || fallback[key];
  };
  const next = {
    description: text('description'),
    personality: text('personality'),
    scenario: text('scenario'),
    firstMes: text('firstMes'),
    exampleDialogue: text('exampleDialogue'),
  } satisfies NpcPromotionDraft;
  return next.description && next.personality ? next : undefined;
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
