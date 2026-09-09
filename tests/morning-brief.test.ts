import { describe, expect, it } from 'vitest';
import { applyMorningNpcMoves, buildLocalMorningBrief, buildMorningPrompt, hasMorningBrief, parseMorningResponse, parseMorningUpdate, resolveMorningAdDestination } from '../src/core/world/morning';
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

  it('resolves only discovered ad destinations for direct entry buttons', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'morning-ad', title: 'Morning ad' }));
    const entry = { id: 'ad', day: 1, category: 'ad' as const, title: '公告', body: '去看看。', nodeId: 'start', charIds: [], source: 'local' as const };
    expect(resolveMorningAdDestination(entry, save.world)).toEqual({ id: 'start', name: '起点街区' });
    save.world.map.nodes.start.discovered = false;
    expect(resolveMorningAdDestination(entry, save.world)).toBeUndefined();
  });

  it('echoes a triggered location event into the next local morning brief', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'morning-echo', title: 'Morning echo' }));
    save.world.map.nodes.start.memories.push({ id: 'node-memory-hook-1', text: '晨报线索「码头动静」在这里落地：有人留下了新的告示。', day: 1, charIds: [] });
    save.world.settlements.push({ day: 1, footprint: ['start'], met: [], relationChanges: [], income: 0, expense: 0, itemsGained: [], diary: '昨天去了起点街区。', appointmentsTomorrow: [] });
    const entries = buildLocalMorningBrief(save.world, 2);
    expect(entries.find((entry) => entry.category === 'lead')?.body).toContain('码头动静');
  });

  it('parses bounded AI entries and includes the previous diary as an echo', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'morning-prompt', title: 'Morning prompt' }));
    const prompt = buildMorningPrompt(save.world, 2, '昨天在码头遇见了凛。');
    expect(prompt[1].content).toContain('昨天在码头遇见了凛');
    expect(parseMorningResponse('[{"category":"ad","title":"公告","body":"去看看。"}]', 2)).toEqual([]);
    expect(parseMorningResponse('[{"category":"lead","title":"头条","body":"西码头有动静。","nodeId":"docks","slotId":"noon"},{"category":"ambience","title":"风","body":"海风。"},{"category":"ad","entryKind":"job","title":"招募","body":"找帮工。"}]', 2)).toHaveLength(3);
  });

  it('parses one merged update and filters untrusted references', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'morning-update', title: 'Morning update' }));
    save.world.map.nodes.docks = { ...save.world.map.nodes.start, id: 'docks', name: '西码头' };
    save.world.npcs['vendor-1'] = { id: 'vendor-1', name: '摊主', tier: 'semi', facts: [], tags: ['merchant'], homeNodeId: 'start', lightMemory: [] };
    const raw = JSON.stringify({
      news: [
        { category: 'lead', title: '无地点线索', body: '退回氛围。' },
        { category: 'ambience', title: '海风', body: '潮气沿街。' },
        { category: 'ad', title: '帮工', body: '码头招人。', nodeId: 'docks' },
        { category: 'character', title: '摊主', body: '有人在整理货物。', charIds: ['vendor-1'] },
        { category: 'lead', title: '伪造地点', body: '不应保留。', nodeId: 'moon' },
      ],
      weather: { id: 'drizzle', label: '细雨', tags: ['rain'] },
      npcMoves: [{ charId: 'vendor-1', slotId: 'noon', nodeId: 'docks', note: '整理货物' }, { charId: 'ghost', slotId: 'noon', nodeId: 'docks' }],
      worldNote: '港口晚了一刻报时。',
    });
    const update = parseMorningUpdate(raw, 2, save.world, ['morning', 'noon']);
    expect(update?.entries).toHaveLength(4);
    expect(update?.entries[0].category).toBe('ambience');
    expect(update?.npcMoves).toEqual([{ charId: 'vendor-1', slotId: 'noon', nodeId: 'docks', note: '整理货物' }]);
    expect(update?.weather.tags).toEqual(['rain']);
    expect(update?.worldNote).toContain('港口');
    expect(applyMorningNpcMoves(save.world, 2, update?.npcMoves ?? [])).toBe(1);
    expect(save.world.npcs['vendor-1'].schedule?.overrides['2:noon']).toEqual({ nodeId: 'docks', activity: '整理货物' });
  });

  it('keeps typed advertisement entry kinds only for ads', () => {
    const parsed = parseMorningResponse('[{"category":"lead","entryKind":"job","title":"错误类型","body":"应忽略该类型。"},{"category":"ambience","title":"风","body":"海风。"},{"category":"ad","entryKind":"job","title":"招聘","body":"找帮工。"}]', 2);
    expect(parsed.find((entry) => entry.category === 'lead')?.entryKind).toBeUndefined();
    expect(parsed.find((entry) => entry.category === 'ad')?.entryKind).toBe('job');
  });
});
