import type { ChapterSummary, EventHistoryEntry, Milestone, WorldState } from '../../data/schema/save';

export interface ChapterSummaryResult {
  ok: boolean;
  summary?: ChapterSummary;
  warning?: string;
}

/** Build a deterministic local summary from diaries and triggered event history. */
export function buildLocalChapterSummary(world: WorldState, fromDay: number, toDay: number): ChapterSummaryResult {
  if (!Number.isInteger(fromDay) || !Number.isInteger(toDay) || fromDay < 1 || toDay < fromDay) return { ok: false, warning: 'Chapter summary day range is invalid.' };
  const diaries = world.diary.filter((entry) => entry.day >= fromDay && entry.day <= toDay);
  const events = (world.eventHistory ?? []).filter((entry) => entry.day >= fromDay && entry.day <= toDay);
  const lines = [
    ...diaries.map((entry) => `第 ${entry.day} 天日记：${entry.text.trim()}`),
    ...events.map((entry) => formatEvent(entry, world)),
  ].filter((line) => line.length > 0);
  const text = (lines.length ? lines : [`第 ${fromDay}–${toDay} 天暂无可压缩的日记或事件记录。`]).join('\n').slice(0, 12000);
  return { ok: true, summary: { id: `chapter-${fromDay}-${toDay}`, fromDay, toDay, text } };
}

/** Insert or replace one chapter summary while keeping a bounded local archive. */
export function upsertChapterSummary(world: WorldState, summary: ChapterSummary): { ok: boolean; warning?: string } {
  if (!Number.isInteger(summary.fromDay) || !Number.isInteger(summary.toDay) || summary.fromDay < 1 || summary.toDay < summary.fromDay) return { ok: false, warning: 'Chapter summary day range is invalid.' };
  world.chapters = [...(world.chapters ?? []).filter((item) => item.id !== summary.id), structuredClone(summary)].slice(-100);
  return { ok: true };
}

/** Insert or replace a milestone; milestones are facts supplied by deterministic callers or event packages. */
export function upsertMilestone(world: WorldState, milestone: Milestone): { ok: boolean; warning?: string } {
  if (!Number.isInteger(milestone.day) || milestone.day < 1 || !milestone.text.trim()) return { ok: false, warning: 'Milestone data is invalid.' };
  world.milestones = [...(world.milestones ?? []).filter((item) => item.id !== milestone.id), structuredClone(milestone)].slice(-500);
  return { ok: true };
}

function formatEvent(entry: EventHistoryEntry, world: WorldState): string {
  const node = world.map.nodes[entry.nodeId]?.name ?? entry.nodeId;
  const narrative = entry.narrative ?? entry.content ?? entry.resultSummary ?? '无叙述';
  const result = entry.resultSummary ? ` 结果：${entry.resultSummary}` : '';
  return `第 ${entry.day} 天在${node}触发「${entry.title}」：${narrative}${result}`;
}
