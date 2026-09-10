import type { StorySceneDraftInput } from './scenes';

export interface StoryScenePresetStage {
  id: string;
  title: string;
  contentTemplate: string;
}

export interface StoryScenePreset {
  id: string;
  name: string;
  titleTemplate: string;
  outlineTemplate: string;
  stages: StoryScenePresetStage[];
  builtin: boolean;
  sourcePresetId?: string;
}

export interface StorySceneDraftGenerationInput {
  id: string;
  intent: string;
  detailedOutline?: string;
  participantIds: readonly string[];
  participantNames?: readonly string[];
  nodeId: string;
  nodeName?: string;
  startDay?: number;
  startSlotId?: string;
  preset?: StoryScenePreset;
}

const BUILTIN_PRESETS: readonly StoryScenePreset[] = [
  {
    id: 'builtin-story-three-act',
    name: '三幕短篇',
    titleTemplate: '{intent}',
    outlineTemplate: '围绕“{intent}”，{participants}在{location}经历相遇、转折与收束。',
    stages: [
      { id: 'opening', title: '相遇', contentTemplate: '{participants}因“{intent}”在{location}聚到一起。' },
      { id: 'turn', title: '转折', contentTemplate: '围绕“{intent}”出现新的发现或分歧。' },
      { id: 'ending', title: '收束', contentTemplate: '众人回应这次经历，并为之后留下空间。' },
    ],
    builtin: true,
  },
  {
    id: 'builtin-story-quiet-night',
    name: '静夜谈心',
    titleTemplate: '{location}的夜话',
    outlineTemplate: '{participants}在{location}谈起“{intent}”，从试探走向坦诚。',
    stages: [
      { id: 'opening', title: '夜色', contentTemplate: '{participants}在{location}安静地坐下来。' },
      { id: 'conversation', title: '谈心', contentTemplate: '话题逐渐转向“{intent}”。' },
      { id: 'ending', title: '余韵', contentTemplate: '谈话告一段落，彼此留下新的理解。' },
    ],
    builtin: true,
  },
];

/** Return fresh copies so callers can never overwrite the built-in templates. */
export function createBuiltinStoryScenePresets(): StoryScenePreset[] {
  return BUILTIN_PRESETS.map(clonePreset);
}

/** Create an editable user copy while retaining its template origin. */
export function copyStoryScenePreset(preset: StoryScenePreset, id: string, name = `${preset.name} · 副本`): StoryScenePreset {
  return {
    ...clonePreset(preset),
    id: id.trim(),
    name: name.trim(),
    builtin: false,
    sourcePresetId: preset.sourcePresetId ?? preset.id,
  };
}

/** Build a deterministic, reviewable draft input without API calls or world mutations. */
export function generateStorySceneDraftInput(input: StorySceneDraftGenerationInput): StorySceneDraftInput {
  const intent = input.intent.trim();
  if (!intent) throw new Error('StoryScene 剧情意图不能为空。');
  const preset = input.preset ? clonePreset(input.preset) : createBuiltinStoryScenePresets()[0];
  const variables = {
    intent,
    participants: input.participantNames?.filter((name) => name.trim()).join('、') || input.participantIds.join('、'),
    location: input.nodeName?.trim() || input.nodeId,
  };
  const detailedOutline = input.detailedOutline?.trim();
  const outline = detailedOutline || renderTemplate(preset.outlineTemplate, variables);
  return {
    id: input.id.trim(),
    title: renderTemplate(preset.titleTemplate, variables).slice(0, 160),
    intent,
    outline,
    participantIds: [...input.participantIds],
    nodeId: input.nodeId,
    startDay: input.startDay,
    startSlotId: input.startSlotId,
    stages: detailedOutline
      ? [{ id: 'opening', title: '开场', content: detailedOutline }]
      : preset.stages.map((stage) => ({ id: stage.id, title: stage.title, content: renderTemplate(stage.contentTemplate, variables) })),
    source: detailedOutline ? 'outline' : 'keywords',
  };
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(intent|participants|location)\}/g, (_match, key: keyof typeof variables) => variables[key]);
}

function clonePreset(preset: StoryScenePreset): StoryScenePreset {
  return { ...preset, stages: preset.stages.map((stage) => ({ ...stage })) };
}
