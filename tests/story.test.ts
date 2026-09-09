import { describe, expect, it } from 'vitest';
import { buildLocalChapterSummary, formatChatArchive, formatEventHistoryArchive, upsertChapterSummary, upsertMilestone } from '../src/core/story';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

describe('local chapter summaries and milestones', () => {
  it('builds a stable summary from diary and event facts', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'story', title: 'Story', day: 4 }));
    save.world.diary = [{ day: 2, text: '在码头等到潮声。' }];
    save.world.eventHistory = [{ id: 'event-history-1', eventId: 'dock-note', title: '码头的告示', day: 3, slotId: 'noon', nodeId: 'start', charIds: ['seir'], scope: 'formal', narrative: '你读完了告示。', resultSummary: '确认仓库开放。' }];
    const first = buildLocalChapterSummary(save.world, 1, 3);
    const second = buildLocalChapterSummary(save.world, 1, 3);
    expect(first).toEqual(second);
    expect(first.summary?.text).toContain('在码头等到潮声');
    expect(first.summary?.text).toContain('确认仓库开放');
  });

  it('upserts bounded milestone and chapter records', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'story-upsert', title: 'Story upsert' }));
    expect(upsertMilestone(save.world, { id: 'first-note', day: 2, text: '发现旧告示。', charIds: [] }).ok).toBe(true);
    expect(upsertMilestone(save.world, { id: 'first-note', day: 3, text: '确认告示来源。', charIds: ['seir'] }).ok).toBe(true);
    expect(save.world.milestones).toEqual([{ id: 'first-note', day: 3, text: '确认告示来源。', charIds: ['seir'] }]);
    const summary = buildLocalChapterSummary(save.world, 1, 3).summary!;
    expect(upsertChapterSummary(save.world, summary).ok).toBe(true);
    expect(save.world.chapters).toHaveLength(1);
    expect(upsertChapterSummary(save.world, { ...summary, text: '已修订摘要。' }).ok).toBe(true);
    expect(save.world.chapters[0].text).toBe('已修订摘要。');
  });

  it('renders a standalone readable event archive without internal package rules', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'story-archive', title: '我的故事', day: 4 }));
    save.world.eventHistory = [{ id: 'event-history-1', eventId: 'dock-note', title: '码头的告示', day: 3, slotId: 'noon', nodeId: 'start', charIds: ['seir'], scope: 'formal', narrative: '你读完了告示。', choice: '留下调查', resultSummary: '确认仓库开放。' }];
    const archive = formatEventHistoryArchive(save);
    expect(archive).toContain('# 我的故事 · 事件档案');
    expect(archive).toContain('## 1. 码头的告示');
    expect(archive).toContain('人物：');
    expect(archive).toContain('选择：留下调查');
    expect(archive).toContain('结果：确认仓库开放。');
    expect(archive).not.toContain('eventId');
  });

  it('renders chat messages verbatim without ops or provider metadata', () => {
    const archive = formatChatArchive({ title: '港口相遇', playerLabel: '小明', characterName: '星野', messages: [
      { role: 'user', content: '你今天也在这里。', kind: 'dialogue', speakerId: 'player' },
      { role: 'assistant', content: '嗯，风很舒服。', kind: 'dialogue', speakerId: 'seir' },
    ] });
    expect(archive).toContain('## 1. 小明');
    expect(archive).toContain('你今天也在这里。');
    expect(archive).toContain('## 2. 星野');
    expect(archive).toContain('嗯，风很舒服。');
    expect(archive).not.toContain('ops');
  });
});
