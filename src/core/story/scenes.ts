import type { CalendarConfig, StoryScene, StorySceneStage, WorldState } from '../../data/schema/save';
import { evaluateCondition, type ConditionScope } from '../expr';

export interface StorySceneDraftInput {
  id: string;
  title: string;
  intent: string;
  outline: string;
  participantIds: readonly string[];
  nodeId: string;
  startDay?: number;
  startSlotId?: string;
  currentStageId?: string;
  stages?: readonly StorySceneStage[];
  source?: StoryScene['source'];
}

export interface StorySceneResult {
  ok: boolean;
  scene?: StoryScene;
  warning?: string;
}

export interface StorySceneStageResult extends StorySceneResult {
  stage?: StorySceneStage;
}

/** Validate deterministic facts required to persist a scene draft. */
export function validateStorySceneDraft(world: WorldState, calendar: CalendarConfig, input: StorySceneDraftInput): string | undefined {
  if (!input.id.trim() || !input.title.trim() || !input.intent.trim() || !input.outline.trim()) return 'StoryScene 草案缺少必要文本。';
  if (input.participantIds.length === 0 || input.participantIds.length > 20) return 'StoryScene 参与者数量必须在 1 到 20 人之间。';
  if (new Set(input.participantIds).size !== input.participantIds.length) return 'StoryScene 参与者不能重复。';
  if (input.participantIds.some((charId) => !world.characters[charId])) return 'StoryScene 包含不存在的正式角色。';
  if (!world.map.nodes[input.nodeId]) return 'StoryScene 地点不存在。';
  const slotId = input.startSlotId ?? world.clock.slotId;
  if (!calendar.slots.some((slot) => slot.id === slotId)) return 'StoryScene 时段不存在。';
  const startDay = input.startDay ?? world.clock.day;
  if (!Number.isInteger(startDay) || startDay < world.clock.day) return 'StoryScene 开始日期不能早于当前日期。';
  if (input.currentStageId !== undefined && !input.currentStageId.trim()) return 'StoryScene 阶段 ID 不能为空。';
  const stages = input.stages?.length ? input.stages : defaultStages(input.outline, input.currentStageId);
  if (new Set(stages.map((stage) => stage.id)).size !== stages.length) return 'StoryScene 阶段 ID 不能重复。';
  const currentStageId = input.currentStageId?.trim() || stages[0]?.id;
  if (!currentStageId || !stages.some((stage) => stage.id === currentStageId)) return 'StoryScene 当前阶段不存在。';
  return undefined;
}

export function createStorySceneDraft(world: WorldState, calendar: CalendarConfig, input: StorySceneDraftInput): StorySceneResult {
  const warning = validateStorySceneDraft(world, calendar, input);
  if (warning) return { ok: false, warning };
  if ((world.storyScenes ?? []).some((scene) => scene.id === input.id)) return { ok: false, warning: 'StoryScene ID 已存在。' };
  const day = world.clock.day;
  const stages = input.stages?.length ? input.stages.map((stage) => ({ ...stage })) : defaultStages(input.outline, input.currentStageId);
  const scene: StoryScene = {
    id: input.id,
    title: input.title.trim(),
    intent: input.intent.trim(),
    outline: input.outline.trim(),
    participantIds: [...input.participantIds],
    nodeId: input.nodeId,
    startDay: input.startDay ?? day,
    startSlotId: input.startSlotId ?? world.clock.slotId,
    currentStageId: input.currentStageId?.trim() || stages[0].id,
    stages,
    readingStageId: stages[0].id,
    readStageIds: [],
    status: 'draft',
    source: input.source ?? 'manual',
    createdDay: day,
    updatedDay: day,
  };
  world.storyScenes = [...(world.storyScenes ?? []), scene].slice(-100);
  return { ok: true, scene };
}

/** Replace a draft's editable content after running the same deterministic validation as creation. */
export function updateStorySceneDraft(world: WorldState, calendar: CalendarConfig, sceneId: string, input: StorySceneDraftInput): StorySceneResult {
  const scene = (world.storyScenes ?? []).find((entry) => entry.id === sceneId);
  if (!scene) return { ok: false, warning: 'StoryScene 不存在。' };
  if (scene.status !== 'draft') return { ok: false, warning: '只有草案可以编辑。' };
  if (input.id.trim() !== sceneId) return { ok: false, warning: 'StoryScene ID 创建后不能修改。' };
  const warning = validateStorySceneDraft(world, calendar, input);
  if (warning) return { ok: false, warning };
  const stages = input.stages?.length ? input.stages.map((stage) => ({ ...stage })) : defaultStages(input.outline, input.currentStageId);
  const updated: StoryScene = {
    ...scene,
    title: input.title.trim(),
    intent: input.intent.trim(),
    outline: input.outline.trim(),
    participantIds: [...input.participantIds],
    nodeId: input.nodeId,
    startDay: input.startDay ?? scene.startDay,
    startSlotId: input.startSlotId ?? scene.startSlotId,
    currentStageId: input.currentStageId?.trim() || stages[0].id,
    stages,
    readingStageId: stages.some((stage) => stage.id === scene.readingStageId) ? scene.readingStageId : stages[0].id,
    readStageIds: scene.readStageIds.filter((id) => stages.some((stage) => stage.id === id)),
    source: input.source ?? scene.source,
    updatedDay: world.clock.day,
  };
  world.storyScenes = world.storyScenes.map((entry) => entry.id === sceneId ? updated : entry);
  return { ok: true, scene: updated };
}

/** Delete only an unconfirmed local draft; started scenes remain in the save for history. */
export function deleteStorySceneDraft(world: WorldState, sceneId: string): StorySceneResult {
  const scene = (world.storyScenes ?? []).find((entry) => entry.id === sceneId);
  if (!scene) return { ok: false, warning: 'StoryScene 不存在。' };
  if (scene.status !== 'draft') return { ok: false, warning: '只有草案可以删除。' };
  world.storyScenes = world.storyScenes.filter((entry) => entry.id !== sceneId);
  return { ok: true, scene };
}

export interface StorySceneReadingResult extends StorySceneResult {
  stage?: StorySceneStage;
  nextUnreadStage?: StorySceneStage;
}

/** Read the persisted resume position without changing any world fact. */
export function getStorySceneReading(world: WorldState, sceneId: string): StorySceneReadingResult {
  const scene = (world.storyScenes ?? []).find((entry) => entry.id === sceneId);
  if (!scene) return { ok: false, warning: 'StoryScene 不存在。' };
  const stage = scene.stages.find((entry) => entry.id === scene.readingStageId);
  if (!stage) return { ok: false, scene, warning: 'StoryScene 阅读位置不存在。' };
  const nextUnreadStage = scene.stages.find((entry) => !scene.readStageIds.includes(entry.id));
  return { ok: true, scene, stage, nextUnreadStage };
}

/** Mark one stage as read in declaration order and update the resume pointer. */
export function readStorySceneStage(world: WorldState, sceneId: string, stageId: string): StorySceneReadingResult {
  const scene = (world.storyScenes ?? []).find((entry) => entry.id === sceneId);
  if (!scene) return { ok: false, warning: 'StoryScene 不存在。' };
  if (scene.status !== 'active' && scene.status !== 'completed') return { ok: false, scene, warning: '只有已启动的 StoryScene 可以阅读。' };
  const index = scene.stages.findIndex((entry) => entry.id === stageId);
  if (index < 0) return { ok: false, scene, warning: 'StoryScene 阅读阶段不存在。' };
  const previousIds = scene.stages.slice(0, index).map((entry) => entry.id);
  if (previousIds.some((id) => !scene.readStageIds.includes(id))) return { ok: false, scene, warning: '必须按顺序阅读 StoryScene 阶段。' };
  const readStageIds = scene.readStageIds.includes(stageId) ? [...scene.readStageIds] : [...scene.readStageIds, stageId];
  const updated: StoryScene = { ...scene, readingStageId: stageId, readStageIds, updatedDay: world.clock.day };
  world.storyScenes = world.storyScenes.map((entry) => entry.id === sceneId ? updated : entry);
  return { ok: true, scene: updated, stage: updated.stages[index], nextUnreadStage: updated.stages.find((entry) => !readStageIds.includes(entry.id)) };
}

/** Move the local reading cursor to an already-read stage for review. */
export function selectStorySceneReadingStage(world: WorldState, sceneId: string, stageId: string): StorySceneReadingResult {
  const scene = (world.storyScenes ?? []).find((entry) => entry.id === sceneId);
  if (!scene) return { ok: false, warning: 'StoryScene 不存在。' };
  if (!scene.readStageIds.includes(stageId)) return { ok: false, scene, warning: '只能回看已经读过的 StoryScene 阶段。' };
  const stage = scene.stages.find((entry) => entry.id === stageId);
  if (!stage) return { ok: false, scene, warning: 'StoryScene 阅读阶段不存在。' };
  const updated: StoryScene = { ...scene, readingStageId: stageId, updatedDay: world.clock.day };
  world.storyScenes = world.storyScenes.map((entry) => entry.id === sceneId ? updated : entry);
  return { ok: true, scene: updated, stage, nextUnreadStage: updated.stages.find((entry) => !updated.readStageIds.includes(entry.id)) };
}

/** Advance to the next declared stage only when its safe expression condition is satisfied. */
export function advanceStorySceneStage(world: WorldState, sceneId: string): StorySceneStageResult {
  const scene = (world.storyScenes ?? []).find((entry) => entry.id === sceneId);
  if (!scene) return { ok: false, warning: 'StoryScene 不存在。' };
  if (scene.status !== 'active') return { ok: false, scene, warning: '只有进行中的 StoryScene 可以推进阶段。' };
  const currentIndex = scene.stages.findIndex((stage) => stage.id === scene.currentStageId);
  if (currentIndex < 0) return { ok: false, scene, warning: 'StoryScene 当前阶段定义不存在。' };
  const nextStage = scene.stages[currentIndex + 1];
  if (!nextStage) return { ok: false, scene, warning: 'StoryScene 已处于最后阶段。' };
  if (nextStage.when) {
    try {
      const eligible = evaluateCondition(nextStage.when, {
        stats: world.stats,
        flags: world.flags,
        playerStats: world.player.stats,
        playerFlags: world.player.flags,
        day: world.clock.day,
      } as unknown as ConditionScope);
      if (!eligible) return { ok: false, scene, warning: 'StoryScene 下一阶段条件尚未满足。' };
    } catch (error) {
      return { ok: false, scene, warning: error instanceof Error ? error.message : 'StoryScene 阶段条件无效。' };
    }
  }
  const updated: StoryScene = { ...scene, currentStageId: nextStage.id, updatedDay: world.clock.day };
  world.storyScenes = world.storyScenes.map((entry) => entry.id === sceneId ? updated : entry);
  return { ok: true, scene: updated, stage: nextStage };
}

function defaultStages(outline: string, currentStageId?: string): StorySceneStage[] {
  return [{ id: currentStageId?.trim() || 'opening', title: '开场', content: outline.trim() }];
}

/** Confirm a reviewed draft; re-check world facts because they may have changed since drafting. */
export function confirmStoryScene(world: WorldState, calendar: CalendarConfig, sceneId: string): StorySceneResult {
  const scene = (world.storyScenes ?? []).find((entry) => entry.id === sceneId);
  if (!scene) return { ok: false, warning: 'StoryScene 不存在。' };
  if (scene.status !== 'draft') return { ok: false, warning: '只有草案可以确认启动。' };
  const warning = validateStorySceneDraft(world, calendar, scene);
  if (warning) return { ok: false, warning };
  const updated: StoryScene = { ...scene, status: 'active', updatedDay: world.clock.day };
  world.storyScenes = world.storyScenes.map((entry) => entry.id === sceneId ? updated : entry);
  return { ok: true, scene: updated };
}

export function updateStorySceneStatus(world: WorldState, sceneId: string, status: Exclude<StoryScene['status'], 'draft'>): StorySceneResult {
  const scene = (world.storyScenes ?? []).find((entry) => entry.id === sceneId);
  if (!scene) return { ok: false, warning: 'StoryScene 不存在。' };
  if (scene.status !== 'active') return { ok: false, warning: '只有进行中的 StoryScene 可以结束或取消。' };
  const updated: StoryScene = { ...scene, status, updatedDay: world.clock.day };
  world.storyScenes = world.storyScenes.map((entry) => entry.id === sceneId ? updated : entry);
  return { ok: true, scene: updated };
}
