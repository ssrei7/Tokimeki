import { describe, expect, it } from 'vitest';
import { advanceStorySceneStage, buildLocalChapterSummary, confirmStoryScene, copyStoryScenePreset, createBuiltinStoryScenePresets, createStorySceneDraft, formatChatArchive, formatEventHistoryArchive, generateStorySceneDraftInput, getStorySceneReading, readStorySceneStage, selectStorySceneReadingStage, updateStorySceneStatus, upsertChapterSummary, upsertMilestone } from '../src/core/story';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

describe('local chapter summaries and milestones', () => {
  it('generates a deterministic reviewable StoryScene draft from a short intent without API calls', () => {
    const generated = generateStorySceneDraftInput({
      id: 'generated-draft', intent: '寻找失踪的信件', participantIds: ['seir', 'rin'], participantNames: ['塞伊尔', '凛'], nodeId: 'start', nodeName: '旧码头',
    });
    expect(generated).toMatchObject({ id: 'generated-draft', source: 'keywords', title: '寻找失踪的信件', participantIds: ['seir', 'rin'] });
    expect(generated.outline).toContain('寻找失踪的信件');
    expect(generated.outline).toContain('旧码头');
    expect(generated.stages).toHaveLength(3);
    expect(generateStorySceneDraftInput({ id: 'generated-draft', intent: '寻找失踪的信件', participantIds: ['seir', 'rin'], participantNames: ['塞伊尔', '凛'], nodeId: 'start', nodeName: '旧码头' })).toEqual(generated);
  });

  it('lets a detailed outline override the keyword template', () => {
    const generated = generateStorySceneDraftInput({
      id: 'outline-draft', intent: '码头重逢', detailedOutline: '第一幕在雨中重逢，第二幕共同寻找避雨处。', participantIds: ['seir'], nodeId: 'start',
    });
    expect(generated.source).toBe('outline');
    expect(generated.outline).toBe('第一幕在雨中重逢，第二幕共同寻找避雨处。');
    expect(generated.stages).toEqual([{ id: 'opening', title: '开场', content: '第一幕在雨中重逢，第二幕共同寻找避雨处。' }]);
  });

  it('copies local StoryScene presets without mutating the built-in original', () => {
    const originals = createBuiltinStoryScenePresets();
    const copy = copyStoryScenePreset(originals[0], 'my-three-act');
    copy.name = '我的三幕故事';
    copy.stages[0].title = '自定义开场';
    expect(copy).toMatchObject({ id: 'my-three-act', builtin: false, sourcePresetId: originals[0].id });
    expect(createBuiltinStoryScenePresets()[0]).toEqual(originals[0]);
    expect(originals[0].stages[0].title).toBe('相遇');
  });

  it('passes generated StoryScene drafts through the existing deterministic validator', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'generated-story-scene', title: 'Generated story scene' }));
    save.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '码头青年', personality: '安静' }, visuals: { portraits: [] } };
    const generated = generateStorySceneDraftInput({ id: 'generated-valid', intent: '一起等待日出', participantIds: ['seir'], nodeId: 'start' });
    expect(createStorySceneDraft(save.world, save.config.calendar, generated)).toMatchObject({ ok: true, scene: { status: 'draft', source: 'keywords' } });
  });

  it('persists StoryScene reading progress separately from plot stage progression', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'story-scene-reading', title: 'Story scene reading' }));
    save.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '码头青年', personality: '安静' }, visuals: { portraits: [] } };
    createStorySceneDraft(save.world, save.config.calendar, {
      id: 'reading-scene', title: '阅读测试', intent: '阅读', outline: '三段故事。', participantIds: ['seir'], nodeId: 'start',
      stages: [
        { id: 'opening', title: '开场', content: '第一段。' },
        { id: 'middle', title: '中段', content: '第二段。' },
        { id: 'ending', title: '结尾', content: '第三段。' },
      ],
    });
    expect(confirmStoryScene(save.world, save.config.calendar, 'reading-scene').ok).toBe(true);
    expect(getStorySceneReading(save.world, 'reading-scene')).toMatchObject({ ok: true, stage: { id: 'opening' }, nextUnreadStage: { id: 'opening' } });
    expect(readStorySceneStage(save.world, 'reading-scene', 'middle')).toMatchObject({ ok: false });
    expect(readStorySceneStage(save.world, 'reading-scene', 'opening')).toMatchObject({ ok: true, stage: { id: 'opening' }, nextUnreadStage: { id: 'middle' } });
    expect(readStorySceneStage(save.world, 'reading-scene', 'middle')).toMatchObject({ ok: true, stage: { id: 'middle' }, nextUnreadStage: { id: 'ending' } });
    expect(selectStorySceneReadingStage(save.world, 'reading-scene', 'opening')).toMatchObject({ ok: true, stage: { id: 'opening' } });
    expect(save.world.storyScenes[0].currentStageId).toBe('opening');
    expect(save.world.storyScenes[0].readingStageId).toBe('opening');
    expect(save.world.storyScenes[0].readStageIds).toEqual(['opening', 'middle']);
  });

  it('persists a reviewable StoryScene draft and confirms it only after deterministic validation', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'story-scene', title: 'Story scene' }));
    save.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '码头青年', personality: '安静' }, visuals: { portraits: [] } };
    save.world.characters.rin = { id: 'rin', name: '凛', tier: 'formal', card: { description: '花店女孩', personality: '爽朗' }, visuals: { portraits: [] } };
    save.world.characters.aya = { id: 'aya', name: '绫', tier: 'formal', card: { description: '记者', personality: '好奇' }, visuals: { portraits: [] } };
    save.world.characters.ren = { id: 'ren', name: '莲', tier: 'formal', card: { description: '修理师', personality: '沉稳' }, visuals: { portraits: [] } };
    const created = createStorySceneDraft(save.world, save.config.calendar, {
      id: 'scene-dock-secret', title: '码头的秘密', intent: '调查旧仓库', outline: '玩家与两位角色在夜晚调查旧仓库。',
      participantIds: ['seir', 'rin', 'aya', 'ren'], nodeId: 'start', startSlotId: 'night', source: 'outline',
    });
    expect(created.ok).toBe(true);
    expect(created.scene?.status).toBe('draft');
    expect(confirmStoryScene(save.world, save.config.calendar, 'scene-dock-secret').scene?.status).toBe('active');
    expect(updateStorySceneStatus(save.world, 'scene-dock-secret', 'completed').scene?.status).toBe('completed');
  });

  it('rejects invalid participants, duplicate IDs, and stale drafts without mutating facts', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'story-scene-invalid', title: 'Story scene invalid' }));
    save.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '码头青年', personality: '安静' }, visuals: { portraits: [] } };
    expect(createStorySceneDraft(save.world, save.config.calendar, { id: 'bad', title: '坏草案', intent: '意图', outline: '大纲', participantIds: ['seir', 'seir'], nodeId: 'start' })).toMatchObject({ ok: false });
    expect(createStorySceneDraft(save.world, save.config.calendar, { id: 'missing', title: '缺人', intent: '意图', outline: '大纲', participantIds: ['unknown'], nodeId: 'start' })).toMatchObject({ ok: false });
    const draft = createStorySceneDraft(save.world, save.config.calendar, { id: 'stale', title: '会变化的草案', intent: '意图', outline: '大纲', participantIds: ['seir'], nodeId: 'start' });
    expect(draft.ok).toBe(true);
    delete save.world.characters.seir;
    expect(confirmStoryScene(save.world, save.config.calendar, 'stale')).toMatchObject({ ok: false });
    expect(save.world.storyScenes[0].status).toBe('draft');
  });

  it('advances only through declared StoryScene stages whose deterministic conditions pass', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'story-scene-stages', title: 'Story scene stages' }));
    save.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '码头青年', personality: '安静' }, visuals: { portraits: [] } };
    expect(createStorySceneDraft(save.world, save.config.calendar, {
      id: 'staged-scene', title: '分阶段调查', intent: '查清真相', outline: '三段式调查。', participantIds: ['seir'], nodeId: 'start',
      stages: [
        { id: 'opening', title: '开场', content: '来到仓库门前。' },
        { id: 'clue', title: '线索', content: '发现隐藏记号。', when: 'flags.clueFound == true' },
        { id: 'ending', title: '收束', content: '确认事情的真相。', when: 'playerStats.resolve >= 2' },
      ],
    }).ok).toBe(true);
    expect(confirmStoryScene(save.world, save.config.calendar, 'staged-scene').ok).toBe(true);
    expect(advanceStorySceneStage(save.world, 'staged-scene')).toMatchObject({ ok: false });
    expect(save.world.storyScenes[0].currentStageId).toBe('opening');
    save.world.flags.clueFound = true;
    expect(advanceStorySceneStage(save.world, 'staged-scene')).toMatchObject({ ok: true, stage: { id: 'clue' } });
    save.world.player.stats.resolve = 2;
    expect(advanceStorySceneStage(save.world, 'staged-scene')).toMatchObject({ ok: true, stage: { id: 'ending' } });
    expect(advanceStorySceneStage(save.world, 'staged-scene')).toMatchObject({ ok: false });
  });

  it('rejects duplicate or unknown current StoryScene stage definitions', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'story-scene-stage-invalid', title: 'Story scene stage invalid' }));
    save.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '码头青年', personality: '安静' }, visuals: { portraits: [] } };
    const base = { id: 'invalid-stage', title: '无效阶段', intent: '测试', outline: '测试大纲', participantIds: ['seir'], nodeId: 'start' };
    expect(createStorySceneDraft(save.world, save.config.calendar, { ...base, stages: [{ id: 'same', title: '一', content: '一' }, { id: 'same', title: '二', content: '二' }] })).toMatchObject({ ok: false });
    expect(createStorySceneDraft(save.world, save.config.calendar, { ...base, id: 'unknown-current', currentStageId: 'missing', stages: [{ id: 'opening', title: '一', content: '一' }] })).toMatchObject({ ok: false });
  });

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
