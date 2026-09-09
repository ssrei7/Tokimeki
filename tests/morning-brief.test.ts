import { describe, expect, it } from 'vitest';
import { buildLocalMorningBrief, buildMorningPrompt, hasMorningBrief, parseMorningResponse } from '../src/core/world/morning';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

describe('morning brief', () => {
  it('builds a local fact-only fallback and detects existing day entries', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'morning', title: 'Morning' }));
    save.world.settlements.push({ day: 1, footprint: ['start'], met: ['seir'], relationChanges: [], income: 0, expense: 0, itemsGained: [], diary: '昨天去了起点街区。', appointmentsTomorrow: [] });
    const entries = buildLocalMorningBrief(save.world, 2);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.every((entry) => entry.day === 2 && entry.source === 'local')).toBe(true);
    save.world.morningBriefs.push(entries[0]);
    expect(hasMorningBrief(save.world, 2)).toBe(true);
  });

  it('parses bounded AI entries and includes the previous diary as an echo', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'morning-prompt', title: 'Morning prompt' }));
    const prompt = buildMorningPrompt(save.world, 2, '昨天在码头遇见了凛。');
    expect(prompt[1].content).toContain('昨天在码头遇见了凛');
    expect(parseMorningResponse('[{"category":"ad","title":"公告","body":"去看看。"}]', 2)).toEqual([]);
    expect(parseMorningResponse('[{"category":"lead","title":"头条","body":"西码头有动静。","nodeId":"docks","slotId":"noon"},{"category":"ambience","title":"风","body":"海风。"},{"category":"ad","title":"招募","body":"找帮工。"}]', 2)).toHaveLength(3);
  });
});
