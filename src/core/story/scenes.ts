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
    status: 'draft',
    source: input.source ?? 'manual',
    createdDay: day,
    updatedDay: day,
  };
  world.storyScenes = [...(world.storyScenes ?? []), scene].slice(-100);
  return { ok: true, scene };
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
