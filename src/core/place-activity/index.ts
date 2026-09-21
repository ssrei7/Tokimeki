import { z } from 'zod';
import type { PlaceHighlight, WorldState } from '../../data/schema/save';
import type { DirectorPreferences } from '../../data/schema/save';
import { buildNpcGenerationPreferencePrompt } from '../prompt/director';

export const TemporaryNpcProposalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  facts: z.array(z.string().trim().min(1).max(160)).max(5),
  tags: z.array(z.string().trim().min(1).max(40)).max(8),
}).strict();
export type TemporaryNpcProposal = z.infer<typeof TemporaryNpcProposalSchema>;

export interface ActivityInviteCandidate {
  id: string;
  name: string;
  tier: 'formal' | 'semi';
  activity: string;
}

export interface ActivityNarration {
  narrative: string;
  newNpc?: TemporaryNpcProposal;
}

export function activityInviteCandidates(world: WorldState, nodeId: string, day = world.clock.day, slotId = world.clock.slotId, daysPerWeek = 7): ActivityInviteCandidate[] {
  const people: ActivityInviteCandidate[] = [];
  const weekdayIndex = ((Math.max(1, Math.floor(day)) - 1) % Math.max(1, Math.floor(daysPerWeek)));
  for (const character of Object.values(world.characters)) {
    const cell = character.schedule?.overrides[`${day}:${slotId}`] ?? character.schedule?.grid[`${weekdayIndex}:${slotId}`] ?? (character.homeNodeId ? { nodeId: character.homeNodeId, activity: '在附近' } : undefined);
    if (cell?.nodeId === nodeId) people.push({ id: character.id, name: character.name, tier: 'formal', activity: cell.activity });
  }
  for (const npc of Object.values(world.npcs)) {
    const cell = npc.schedule?.overrides[`${day}:${slotId}`] ?? npc.schedule?.grid[`${weekdayIndex}:${slotId}`] ?? (npc.homeNodeId ? { nodeId: npc.homeNodeId, activity: '在附近' } : undefined);
    if (cell?.nodeId === nodeId) people.push({ id: npc.id, name: npc.name, tier: 'semi', activity: cell.activity });
  }
  return people.sort((left, right) => left.tier === right.tier ? left.id.localeCompare(right.id) : left.tier === 'formal' ? -1 : 1);
}

export function validateActivityInvites(world: WorldState, highlight: PlaceHighlight, invitedIds: readonly string[], day = world.clock.day, slotId = world.clock.slotId, daysPerWeek = 7): { ok: true; invitedIds: string[] } | { ok: false; warning: string } {
  if (highlight.kind !== 'activity') return { ok: false, warning: '只有活动动态可以参加。' };
  if (world.player.nodeId !== highlight.nodeId) return { ok: false, warning: '必须先到达活动地点才能参加。' };
  const available = new Map(activityInviteCandidates(world, highlight.nodeId, day, slotId, daysPerWeek).map((person) => [person.id, person]));
  const unique = [...new Set(invitedIds)];
  const missing = unique.find((id) => !available.has(id));
  if (missing) return { ok: false, warning: `邀请对象当前不在活动地点：${missing}。` };
  return { ok: true, invitedIds: unique };
}

export function buildActivityNarrationMessages(input: { playerName: string; day: number; slotId: string; nodeName: string; nodeDescription?: string; highlight: Pick<PlaceHighlight, 'title' | 'body' | 'allowsNewNpc'>; participants: readonly { id: string; name: string; tier: 'formal' | 'semi'; activity?: string }[]; requirements?: string; directorPreferences?: DirectorPreferences }): Array<{ role: 'system' | 'user'; content: string }> {
  const npcPreference = buildNpcGenerationPreferencePrompt(input.directorPreferences);
  return [
    {
      role: 'system',
      content: `你负责描写一次已经被内核确认的地点活动。只返回 JSON，不要 Markdown：{"narrative":"活动叙事文字","newNpc":{"name":"新人名字","facts":["有限事实"],"tags":["标签"]}}。narrative 必须是纯叙事，不得包含 ops、数值、坐标、时间修改、奖励或关系变化。只有活动允许新人且确实适合时才返回 newNpc；最多一个。新人只能提供 name、最多 5 条有限 facts 与最多 8 个 tags，不得提供 ID、地点、日程、关系、数值或状态。${npcPreference ? `\n${npcPreference}` : ''}`,
    },
    {
      role: 'user',
      content: JSON.stringify({ player: input.playerName, date: { day: input.day, slotId: input.slotId }, place: { name: input.nodeName, description: input.nodeDescription ?? '' }, activity: input.highlight, participants: input.participants, requirements: input.requirements?.trim() ?? '' }),
    },
  ];
}

export function parseActivityNarration(raw: string, allowNewNpc: boolean): ActivityNarration {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('活动叙事为空。');
  const json = extractJsonObject(trimmed);
  if (json) {
    const envelope = z.object({ narrative: z.string().trim().min(1).max(6000) }).passthrough().safeParse(json);
    if (envelope.success) {
      const candidate = typeof json === 'object' && json !== null ? (json as { newNpc?: unknown }).newNpc : undefined;
      const proposal = TemporaryNpcProposalSchema.safeParse(candidate);
      return proposal.success && allowNewNpc
        ? { narrative: envelope.data.narrative, newNpc: proposal.data }
        : { narrative: envelope.data.narrative };
    }
  }
  const narrative = trimmed.replace(/<ops>[\s\S]*?<\/ops>/gi, '').trim();
  if (!narrative) throw new Error('活动叙事为空。');
  return { narrative: narrative.slice(0, 6000) };
}

export function createConfirmedActivityNpc(proposal: TemporaryNpcProposal, world: WorldState, createId: () => string): { id: string; name: string; tier: 'semi'; facts: string[]; tags: string[]; lightMemory: []; homeNodeId: string } {
  const parsed = TemporaryNpcProposalSchema.parse(proposal);
  let id = createId();
  while (world.npcs[id] || world.characters[id]) id = createId();
  return { id, name: parsed.name, tier: 'semi', facts: parsed.facts, tags: parsed.tags, lightMemory: [], homeNodeId: world.player.nodeId };
}

function extractJsonObject(raw: string): unknown | undefined {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return undefined; }
}
