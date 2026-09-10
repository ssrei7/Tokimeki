import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 34;

const IdSchema = z.string().min(1);

const SlotDefSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  label: z.string().optional(),
  order: z.number().int().nonnegative(),
});

export const DEFAULT_SLOT_DEFS = [
  { id: 'morning', name: '早晨', order: 0 },
  { id: 'noon', name: '中午', order: 1 },
  { id: 'evening', name: '晚上', order: 2 },
  { id: 'night', name: '深夜', order: 3 },
  { id: 'late-night', name: '午夜', order: 4 },
  { id: 'dawn', name: '黎明', order: 5 },
] satisfies z.input<typeof SlotDefSchema>[];

export const CalendarConfigSchema = z.object({
  slots: z.array(SlotDefSchema).min(1),
  daysPerWeek: z.number().int().positive(),
  weekdayNames: z.array(z.string().min(1)).min(1),
  preset: z.enum(['leisure', 'standard', 'tight', 'sandbox']),
  unlimitedSlots: z.boolean(),
});

export const ActionCostSchema = z.object({
  slotCost: z.number().nonnegative(),
  energyCost: z.number().nonnegative().optional(),
});

export const ActionCostTableSchema = z.record(z.string(), ActionCostSchema);

export const DEFAULT_ACTION_COSTS = {
  move_cross_region: { slotCost: 1 },
  move_within_region: { slotCost: 0 },
  work: { slotCost: 2 },
  explore: { slotCost: 1 },
  rest: { slotCost: 1 },
} satisfies z.input<typeof ActionCostTableSchema>;

export const AxisDefSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  min: z.number(),
  max: z.number(),
  initial: z.number(),
  clampPerTurn: z.number().nonnegative(),
  monotonic: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export const StageRuleSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  when: z.string().min(1),
  order: z.number().int(),
});

export const AssetRefSchema = z.union([
  z.object({ kind: z.literal('stored'), assetId: IdSchema }),
  z.object({ kind: z.literal('url'), url: z.string().url() }),
]);
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const ScheduleCellSchema = z.object({
  nodeId: IdSchema,
  activity: z.string().min(1),
});

export const ScheduleSchema = z.object({
  grid: z.record(z.string(), ScheduleCellSchema.nullable()),
  overrides: z.record(z.string(), ScheduleCellSchema),
});

export const PortraitSetSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  image: AssetRefSchema,
  transform: z.object({
    scale: z.number().finite().positive(),
    offsetX: z.number().finite(),
    offsetY: z.number().finite(),
  }).optional(),
});

export const CharacterVisualsSchema = z.object({
  avatar: AssetRefSchema.optional(),
  portraits: z.array(PortraitSetSchema),
  activePortraitId: IdSchema.optional(),
  accentColor: z.string().min(1).optional(),
});

export const FormalCharacterSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  tier: z.literal('formal'),
  card: z.object({
    description: z.string(),
    personality: z.string(),
    scenario: z.string().optional(),
    firstMes: z.string().optional(),
    exampleDialogue: z.string().optional(),
  }),
  visuals: CharacterVisualsSchema,
  homeNodeId: IdSchema.optional(),
  schedule: ScheduleSchema.optional(),
  initialAxes: z.record(z.string(), z.number()).optional(),
  giftPrefs: z.object({
    likeTags: z.array(z.string()),
    dislikeTags: z.array(z.string()),
    specialItems: z.record(z.string(), z.number()),
  }).optional(),
  worldbookIds: z.array(IdSchema).optional(),
  source: z.enum(['user', 'imported_st', 'promoted']).optional(),
});

export const NpcLiteSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  tier: z.literal('semi'),
  facts: z.array(z.string()).max(8),
  tags: z.array(z.string()),
  homeNodeId: IdSchema.optional(),
  lightMemory: z.array(z.string()).max(5),
  schedule: ScheduleSchema.optional(),
  seed: z.number().int().optional(),
  templateId: IdSchema.optional(),
  visuals: z.object({ avatar: AssetRefSchema.optional() }).optional(),
});

export const NpcTemplateSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  nameParts: z.object({ given: z.array(z.string()), family: z.array(z.string()) }).optional(),
  traitPool: z.array(z.string()),
  occupationPool: z.array(z.string()),
  tagPool: z.array(z.string()),
});

export const EncounterLogEntrySchema = z.object({
  id: IdSchema,
  day: z.number().int().positive(),
  slotId: IdSchema,
  nodeId: IdSchema,
  characterIds: z.array(IdSchema).max(3),
  trigger: z.enum(['enter', 'leave', 'character_move']),
  scope: z.enum(['formal', 'peripheral']),
  outcome: z.enum(['continued', 'urgent_leave']),
  departure: z.object({
    kind: z.enum(['player_farewell', 'character_request']),
    status: z.enum(['pending', 'stayed', 'left']),
    speakerId: IdSchema.optional(),
    reason: z.string().max(300).optional(),
    requestedDay: z.number().int().positive(),
    resolvedDay: z.number().int().positive().optional(),
  }).optional(),
});

export const TopicSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  kind: z.enum(['daily', 'story']),
  terminal: z.boolean(),
  require: z.string().min(1).optional(),
  response: z.string(),
  usedResponse: z.string().optional(),
  ops: z.array(z.unknown()).optional(),
  unlocks: z.array(IdSchema).optional(),
  generatedDay: z.number().int().positive(),
});

export const TopicTreeSchema = z.object({
  charId: IdSchema,
  nodeId: IdSchema,
  topics: z.array(TopicSchema).min(1).max(8),
  generatedDay: z.number().int().positive(),
});

export const AppointmentSchema = z.object({
  id: IdSchema,
  charId: IdSchema,
  day: z.number().int().positive(),
  slotId: IdSchema,
  nodeId: IdSchema,
  status: z.enum(['pending', 'kept', 'late', 'missed']),
  note: z.string().optional(),
});

export const EventScopeSchema = z.enum(['formal', 'peripheral']);
export const EventTriggerSchema = z.object({
  nodeIds: z.array(IdSchema).max(200).optional(),
  slotIds: z.array(IdSchema).max(50).optional(),
  charIds: z.array(IdSchema).max(3).optional(),
  scope: EventScopeSchema.optional(),
});
export const EventChoiceSchema = z.object({
  id: IdSchema,
  label: z.string().min(1).max(200),
  resultSummary: z.string().max(2000).optional(),
  narrative: z.string().max(10000).optional(),
  ops: z.array(z.unknown()).max(32).optional(),
});
export const EventEvidenceRuleSchema = z.object({
  itemId: IdSchema.optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  charIds: z.array(IdSchema).max(3).optional(),
  when: z.string().min(1).optional(),
  response: z.string().min(1).max(2000),
  ops: z.array(z.unknown()).max(32).optional(),
}).refine((rule) => Boolean(rule.itemId || rule.tags?.length), { message: 'Evidence rule must match an item or at least one tag.' });
export const EventMilestoneSchema = z.object({
  text: z.string().min(1).max(2000),
  charIds: z.array(IdSchema).max(3).optional(),
});
export const EventStageRangeSchema = z.object({
  min: IdSchema.optional(),
  max: IdSchema.optional(),
});
export const EventTensionSchema = z.object({
  min: z.number().finite().min(0).max(100).optional(),
  max: z.number().finite().min(0).max(100).optional(),
  weightBoost: z.number().finite().min(0).max(20).optional(),
  delta: z.number().finite().min(-100).max(100).optional(),
}).refine((value) => value.min === undefined || value.max === undefined || value.min <= value.max, { message: 'Event tension min must not exceed max.' });
export const EventDefSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(160),
  trigger: EventTriggerSchema,
  when: z.string().min(1).optional(),
  cooldownDays: z.number().int().nonnegative().optional(),
  once: z.boolean().optional(),
  weight: z.number().finite().nonnegative().optional(),
  slotCost: z.number().finite().nonnegative().optional(),
  prompt: z.string().max(4000).optional(),
  content: z.string().max(10000).optional(),
  ops: z.array(z.unknown()).max(32).optional(),
  choices: z.array(EventChoiceSchema).max(8).optional(),
  evidenceRules: z.array(EventEvidenceRuleSchema).max(32).optional(),
  milestone: EventMilestoneSchema.optional(),
  stageRange: EventStageRangeSchema.optional(),
  tension: EventTensionSchema.optional(),
  packId: IdSchema.optional(),
}).refine((event) => Boolean(event.content?.trim() || event.prompt?.trim() || event.choices?.length), { message: 'Event must provide content, prompt, or choices.' });

export const ScheduledEventSchema = z.object({
  id: IdSchema,
  eventId: IdSchema,
  day: z.number().int().positive(),
  slotId: IdSchema,
  nodeId: IdSchema,
  charIds: z.array(IdSchema).max(3).optional(),
  revealed: z.boolean().optional(),
});

export const DirectorStateSchema = z.object({
  scheduled: z.array(ScheduledEventSchema).max(500),
  lastFiredDay: z.record(IdSchema, z.number().int().positive()),
  tension: z.number().finite(),
  tensionOffset: z.number().finite().default(0),
  tensionUpdatedDay: z.number().int().positive().optional(),
  globalCooldownUntilDay: z.number().int().positive().optional(),
});

export const EventHistoryEntrySchema = z.object({
  id: IdSchema,
  eventId: IdSchema,
  title: z.string().min(1).max(160),
  day: z.number().int().positive(),
  slotId: IdSchema,
  nodeId: IdSchema,
  charIds: z.array(IdSchema).max(3),
  scope: EventScopeSchema,
  content: z.string().max(10000).optional(),
  choice: z.string().max(1000).optional(),
  resultSummary: z.string().max(2000).optional(),
  narrative: z.string().max(10000).optional(),
});

export const ChapterSummarySchema = z.object({
  id: IdSchema,
  fromDay: z.number().int().positive(),
  toDay: z.number().int().positive(),
  text: z.string().max(12000),
});

export const MilestoneSchema = z.object({
  id: IdSchema,
  day: z.number().int().positive(),
  text: z.string().min(1).max(2000),
  charIds: z.array(IdSchema).max(3),
});

export const StorySceneStageSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(160),
  content: z.string().min(1).max(10000),
  when: z.string().min(1).optional(),
});

export const StorySceneSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(160),
  intent: z.string().min(1).max(4000),
  outline: z.string().min(1).max(12000),
  participantIds: z.array(IdSchema).min(1).max(20),
  nodeId: IdSchema,
  startDay: z.number().int().positive(),
  startSlotId: IdSchema,
  currentStageId: IdSchema,
  stages: z.array(StorySceneStageSchema).min(1).max(50),
  readingStageId: IdSchema,
  readStageIds: z.array(IdSchema).max(50),
  status: z.enum(['draft', 'active', 'completed', 'cancelled']),
  source: z.enum(['keywords', 'outline', 'manual']),
  createdDay: z.number().int().positive(),
  updatedDay: z.number().int().positive(),
});

export const GiftHistoryEntrySchema = z.object({
  id: IdSchema,
  day: z.number().int().positive(),
  slotId: IdSchema,
  nodeId: IdSchema,
  charId: IdSchema,
  itemId: IdSchema,
  status: z.enum(['pending', 'resolved']),
  reaction: z.enum(['special', 'liked', 'disliked', 'neutral']).optional(),
  accepted: z.boolean().optional(),
  score: z.number().finite(),
  specialItem: z.boolean(),
  matchedLikeTags: z.array(z.string()),
  matchedDislikeTags: z.array(z.string()),
});

export const InventoryEntrySchema = z.object({
  itemId: IdSchema,
  count: z.number().int().positive(),
  gotDay: z.number().int().positive(),
  gotNodeId: IdSchema.optional(),
  fromCharId: IdSchema.optional(),
});

const StatKeySchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/, 'Stat keys must use ASCII letters, numbers, underscore, dot, or hyphen.');

export const CurrencyDefSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(80),
  symbol: z.string().max(16).optional(),
  decimals: z.number().int().min(0).max(6),
  statKey: StatKeySchema,
});

export const RentRuleSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  currencyId: IdSchema,
  amountStatKey: StatKeySchema,
  intervalDaysStatKey: StatKeySchema,
});

export const EconomyStateSchema = z.object({
  defaultCurrencyId: IdSchema,
  currencies: z.record(IdSchema, CurrencyDefSchema),
  rentRules: z.record(IdSchema, RentRuleSchema),
}).superRefine((economy, context) => {
  if (!economy.currencies[economy.defaultCurrencyId]) {
    context.addIssue({ code: 'custom', path: ['defaultCurrencyId'], message: 'Default currency must reference a configured currency.' });
  }
  for (const [id, currency] of Object.entries(economy.currencies)) {
    if (currency.id !== id) context.addIssue({ code: 'custom', path: ['currencies', id, 'id'], message: 'Currency record key must match its stable id.' });
  }
  for (const [id, rule] of Object.entries(economy.rentRules)) {
    if (rule.id !== id) context.addIssue({ code: 'custom', path: ['rentRules', id, 'id'], message: 'Rent rule record key must match its stable id.' });
    if (!economy.currencies[rule.currencyId]) context.addIssue({ code: 'custom', path: ['rentRules', id, 'currencyId'], message: 'Rent rule must reference a configured currency.' });
  }
});

export const DEFAULT_ECONOMY_STATE = {
  defaultCurrencyId: 'default',
  currencies: {
    default: { id: 'default', name: '通用货币', symbol: '¤', decimals: 0, statKey: 'money' },
  },
  rentRules: {
    standard: { id: 'standard', name: '标准租约', currencyId: 'default', amountStatKey: 'economy.rent.amount', intervalDaysStatKey: 'economy.rent.interval-days' },
  },
} satisfies z.input<typeof EconomyStateSchema>;

export const HousingContractSchema = z.object({
  id: IdSchema,
  nodeId: IdSchema,
  rentRuleId: IdSchema,
  nextDueDayStatKey: StatKeySchema,
});

export const EconomyTransactionSchema = z.object({
  id: IdSchema,
  kind: z.enum(['rent']),
  currencyId: IdSchema,
  statKey: StatKeySchema,
  amount: z.number().finite().nonnegative(),
  balanceBefore: z.number().finite(),
  balanceAfter: z.number().finite(),
  description: z.string().min(1).max(300),
});

export const PlayerStateSchema = z.object({
  name: z.string().min(1),
  persona: z.string().optional(),
  personaId: IdSchema.optional(),
  nodeId: IdSchema,
  homeNodeId: IdSchema.optional(),
  housing: HousingContractSchema.optional(),
  stats: z.record(z.string(), z.number()),
  flags: z.record(z.string(), z.boolean()),
  inventory: z.array(InventoryEntrySchema),
});

export const ClockSchema = z.object({
  day: z.number().int().positive(),
  slotId: IdSchema,
});

export const DiaryEntrySchema = z.object({
  day: z.number().int().positive(),
  text: z.string(),
  editedAt: z.string().datetime().optional(),
});

export const DailySettlementSchema = z.object({
  day: z.number().int().positive(),
  footprint: z.array(IdSchema),
  met: z.array(IdSchema),
  relationChanges: z.array(z.object({
    charId: IdSchema,
    prose: z.string(),
    raw: z.record(z.string(), z.number()).optional(),
  })),
  income: z.number(),
  expense: z.number(),
  economyTransactions: z.array(EconomyTransactionSchema).max(100).default([]),
  itemsGained: z.array(InventoryEntrySchema),
  diary: z.string(),
  appointmentsTomorrow: z.array(z.object({
    id: IdSchema,
    charId: IdSchema,
    day: z.number().int().positive(),
    slotId: IdSchema,
    nodeId: IdSchema,
    status: z.enum(['pending', 'kept', 'late', 'missed']),
    note: z.string().optional(),
  })),
});

export const ItemDefSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  tags: z.array(z.string()),
  description: z.string().optional(),
  icon: AssetRefSchema.optional(),
  stackable: z.boolean().optional(),
  giftable: z.boolean().optional(),
  value: z.number().optional(),
});

export const MemoryTypeSchema = z.enum(['interaction', 'promise', 'preference', 'event', 'observation', 'other']);
export const MemorySourceSchema = z.object({
  kind: z.enum(['chat', 'manual', 'system', 'legacy']),
  chatCharacterId: IdSchema.optional(),
  chatMessageIndex: z.number().int().nonnegative().optional(),
  chatMessageIndices: z.array(z.number().int().nonnegative()).max(200).optional(),
});

export const MemoryEntrySchema = z.object({
  id: IdSchema,
  text: z.string().min(1),
  day: z.number().int().positive(),
  nodeId: IdSchema.optional(),
  weight: z.number().optional(),
  sourceChatMessageIndex: z.number().int().nonnegative().optional(),
  sourceChatMessageIndices: z.array(z.number().int().nonnegative()).max(200).optional(),
  type: MemoryTypeSchema.default('interaction'),
  source: MemorySourceSchema.default({ kind: 'legacy' }),
  importance: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  archived: z.boolean().default(false),
  inject: z.boolean().default(true),
});

export const CollectionEntrySchema = z.object({
  id: IdSchema,
  itemId: IdSchema,
  title: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()),
  day: z.number().int().positive(),
  nodeId: IdSchema.optional(),
  sourceCharId: IdSchema.optional(),
});

export const MorningBriefCategorySchema = z.enum(['lead', 'ambience', 'character', 'ad']);
export const MorningAdEntryKindSchema = z.enum(['job', 'housing', 'shop_transfer']);
export const MorningBriefEntrySchema = z.object({
  id: IdSchema,
  day: z.number().int().positive(),
  category: MorningBriefCategorySchema,
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  entryKind: MorningAdEntryKindSchema.optional(),
  eventText: z.string().min(1).max(1000).optional(),
  nodeId: IdSchema.optional(),
  slotId: IdSchema.optional(),
  charIds: z.array(IdSchema).max(3).default([]),
  expiresDay: z.number().int().positive().optional(),
  source: z.enum(['local', 'ai']).default('local'),
});

export const HookPoolEntrySchema = z.object({
  id: IdSchema,
  sourceBriefId: IdSchema,
  category: z.literal('lead'),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  eventText: z.string().min(1).max(1000).optional(),
  nodeId: IdSchema,
  slotId: IdSchema.optional(),
  charIds: z.array(IdSchema).max(3).default([]),
  createdDay: z.number().int().positive(),
  expiresDay: z.number().int().positive().optional(),
  status: z.enum(['available', 'triggered', 'expired']).default('available'),
  triggerCount: z.number().int().nonnegative().default(0),
});

export const WeatherSchema = z.object({
  id: IdSchema,
  label: z.string().min(1).max(80),
  tags: z.array(z.string().min(1)).max(12),
});

export const MorningNpcMoveSchema = z.object({
  charId: IdSchema,
  slotId: IdSchema,
  nodeId: IdSchema,
  note: z.string().max(240).optional(),
});

export const MorningWorldUpdateSchema = z.object({
  day: z.number().int().positive(),
  weather: WeatherSchema,
  npcMoves: z.array(MorningNpcMoveSchema).max(200).default([]),
  worldNote: z.string().max(1000).optional(),
});

export const RelationMemoryStateSchema = z.object({
  memories: z.array(MemoryEntrySchema),
});

export const MoodSchema = z.object({ word: z.string().min(1), setDay: z.number().int().positive(), decayDays: z.number().int().nonnegative() });
export const KnotSchema = z.object({ id: IdSchema, text: z.string().min(1), sinceDay: z.number().int().positive(), resolveCondition: z.string().min(1).optional() });
export const RelationStateSchema = z.object({
  axes: z.record(z.string(), z.number()).default({}),
  stageId: IdSchema.optional(),
  mood: MoodSchema.optional(),
  situation: z.string().optional(),
  lastSeenDay: z.number().int().positive().optional(),
  metDay: z.number().int().positive().optional(),
  knots: z.array(KnotSchema).default([]),
  memories: z.array(MemoryEntrySchema),
});

export const RegionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
});

export const NodeMemorySchema = z.object({
  id: IdSchema,
  text: z.string().min(1),
  day: z.number().int().positive(),
  charIds: z.array(IdSchema),
  pinned: z.boolean().optional(),
});

export const MapNodeSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  regionId: IdSchema,
  kind: z.array(z.string()),
  description: z.string().optional(),
  worldbookIds: z.array(IdSchema),
  openSlots: z.array(IdSchema).optional(),
  discovered: z.boolean(),
  visitCount: z.number().int().nonnegative(),
  memories: z.array(NodeMemorySchema),
  pos: z.object({ x: z.number().finite(), y: z.number().finite() }),
  parentNodeId: IdSchema.optional(),
  sceneBackground: AssetRefSchema.optional(),
});

export const MapEdgeSchema = z.object({
  from: IdSchema,
  to: IdSchema,
  travelSlots: z.number().int().nonnegative(),
  condition: z.string().min(1).optional(),
  oneWay: z.boolean().optional(),
});

export const MapViewSchema = z.object({
  mode: z.enum(['graph', 'hotspot']),
  background: AssetRefSchema.optional(),
  size: z.object({ w: z.number().finite().positive(), h: z.number().finite().positive() }),
});

export const MapSchema = z.object({
  regions: z.record(z.string(), RegionSchema),
  nodes: z.record(z.string(), MapNodeSchema),
  edges: z.array(MapEdgeSchema),
  view: MapViewSchema,
});

export function createDefaultMap(): z.infer<typeof MapSchema> {
  return {
    regions: { 'start-region': { id: 'start-region', name: '起点街区' } },
    nodes: {
      start: {
        id: 'start', name: '起点街区', regionId: 'start-region', kind: ['outdoor'], worldbookIds: [],
        discovered: true, visitCount: 0, memories: [], pos: { x: 500, y: 350 },
      },
    },
    edges: [],
    view: { mode: 'graph', size: { w: 1000, h: 700 } },
  };
}

export const WorldV3Schema = z.object({
  clock: ClockSchema,
  slotsUsedToday: z.number().int().nonnegative(),
  player: PlayerStateSchema,
  stats: z.record(z.string(), z.number()),
  flags: z.record(z.string(), z.boolean()),
  items: z.record(z.string(), ItemDefSchema),
  relations: z.record(z.string(), RelationMemoryStateSchema),
  diary: z.array(DiaryEntrySchema),
  settlements: z.array(DailySettlementSchema),
});

export const WorldV4Schema = WorldV3Schema.extend({ map: MapSchema });

export const WorldV5Schema = WorldV4Schema.extend({
  characters: z.record(z.string(), FormalCharacterSchema),
  npcs: z.record(z.string(), NpcLiteSchema),
  npcTemplates: z.record(z.string(), NpcTemplateSchema),
  encounterLog: z.array(EncounterLogEntrySchema),
});

export const WorldV8Schema = WorldV5Schema.extend({
  topicTrees: z.record(z.string(), TopicTreeSchema).default({}),
  usedTopics: z.record(z.string(), z.number().int().positive()).default({}),
  appointments: z.array(AppointmentSchema).default([]),
});

export const WorldV9Schema = WorldV5Schema.extend({
  topicTrees: z.record(z.string(), TopicTreeSchema).default({}),
  usedTopics: z.record(z.string(), z.number().int().positive()).default({}),
  appointments: z.array(AppointmentSchema).default([]),
  relations: z.record(z.string(), RelationStateSchema),
});

export const WorldV10Schema = WorldV9Schema;
export const WorldV11Schema = WorldV10Schema.extend({ giftHistory: z.array(GiftHistoryEntrySchema).default([]) });
export const WorldV12Schema = WorldV11Schema;
export const WorldV13Schema = WorldV12Schema.extend({ collection: z.array(CollectionEntrySchema).default([]) });
export const WorldV14Schema = WorldV13Schema;
export const WorldV15Schema = WorldV14Schema;
export const WorldV17Schema = WorldV15Schema.extend({ morningBriefs: z.array(MorningBriefEntrySchema).max(200).default([]) });
export const WorldV18Schema = WorldV17Schema.extend({ hooks: z.array(HookPoolEntrySchema).max(200).default([]) });
export const WorldV19Schema = WorldV18Schema.extend({ morningUpdates: z.array(MorningWorldUpdateSchema).max(200).default([]) });
export const WorldV20Schema = WorldV19Schema;
export const WorldV21Schema = WorldV20Schema;
export const WorldV22Schema = WorldV21Schema;
export const WorldV23Schema = WorldV22Schema.extend({
  eventDefs: z.record(IdSchema, EventDefSchema).default({}),
  director: DirectorStateSchema.default({ scheduled: [], lastFiredDay: {}, tension: 0, tensionOffset: 0, tensionUpdatedDay: 1 }),
  eventHistory: z.array(EventHistoryEntrySchema).max(500).default([]),
});
export const WorldV24Schema = WorldV23Schema;
export const WorldV25Schema = WorldV24Schema;
export const WorldV26Schema = WorldV25Schema;
export const WorldV27Schema = WorldV26Schema.extend({
  chapters: z.array(ChapterSummarySchema).max(100).default([]),
  milestones: z.array(MilestoneSchema).max(500).default([]),
});
export const WorldV28Schema = WorldV27Schema;
export const WorldV29Schema = WorldV28Schema;
export const WorldV30Schema = WorldV29Schema;
export const WorldV31Schema = WorldV30Schema.extend({
  storyScenes: z.array(StorySceneSchema).max(100).default([]),
});
export const WorldV32Schema = WorldV31Schema;
export const WorldV33Schema = WorldV32Schema;
export const WorldV34Schema = WorldV33Schema.extend({
  economy: EconomyStateSchema,
});

export const EncounterConfigSchema = z.object({
  enabled: z.boolean(),
  triggerOnLeave: z.boolean(),
  leaveProbability: z.number().min(0).max(1),
  guaranteeAfterDays: z.number().int().nonnegative(),
  maxParticipants: z.number().int().min(1).max(3),
  weights: z.record(z.string(), z.number().nonnegative()),
});

export const ConfigV1Schema = z.object({
  calendar: CalendarConfigSchema,
  actionCosts: ActionCostTableSchema,
  axisDefs: z.array(AxisDefSchema),
  stageRules: z.array(StageRuleSchema),
  showNumbers: z.boolean(),
  hiddenTopicStyle: z.enum(['hide', 'question_marks']),
  realTimeAwareness: z.boolean(),
  opsLimitPerTurn: z.number().int().positive(),
});

export const ConfigV5Schema = ConfigV1Schema.extend({
  encounter: EncounterConfigSchema,
  morningStyle: z.enum(['newspaper', 'notice_board', 'terminal', 'tavern']).default('newspaper'),
});

export const SaveFileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  meta: z.object({
    id: IdSchema,
    title: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    appVersion: z.string().min(1),
  }),
  config: ConfigV5Schema,
  world: WorldV34Schema,
});

export type SaveFile = z.infer<typeof SaveFileSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type WorldState = z.infer<typeof WorldV34Schema>;
export type MorningBriefEntry = z.infer<typeof MorningBriefEntrySchema>;
export type HookPoolEntry = z.infer<typeof HookPoolEntrySchema>;
export type Weather = z.infer<typeof WeatherSchema>;
export type MorningNpcMove = z.infer<typeof MorningNpcMoveSchema>;
export type MorningWorldUpdate = z.infer<typeof MorningWorldUpdateSchema>;
export type WorldV5State = z.infer<typeof WorldV5Schema>;
export type Topic = z.infer<typeof TopicSchema>;
export type TopicTree = z.infer<typeof TopicTreeSchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;
export type GiftHistoryEntry = z.infer<typeof GiftHistoryEntrySchema>;
export type ScheduleCell = z.infer<typeof ScheduleCellSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type FormalCharacter = z.infer<typeof FormalCharacterSchema>;
export type NpcLite = z.infer<typeof NpcLiteSchema>;
export type NpcTemplate = z.infer<typeof NpcTemplateSchema>;
export type EncounterLogEntry = z.infer<typeof EncounterLogEntrySchema>;
export type EncounterDeparture = NonNullable<EncounterLogEntry['departure']>;
export type EncounterConfig = z.infer<typeof EncounterConfigSchema>;
export type MapState = z.infer<typeof MapSchema>;
export type Region = z.infer<typeof RegionSchema>;
export type MapNode = z.infer<typeof MapNodeSchema>;
export type MapEdge = z.infer<typeof MapEdgeSchema>;
export type MapView = z.infer<typeof MapViewSchema>;
export type ItemDef = z.infer<typeof ItemDefSchema>;
export type CollectionEntry = z.infer<typeof CollectionEntrySchema>;
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;
export type ActionCostTable = z.infer<typeof ActionCostTableSchema>;
export type DailySettlement = z.infer<typeof DailySettlementSchema>;
export type CurrencyDef = z.infer<typeof CurrencyDefSchema>;
export type EconomyState = z.infer<typeof EconomyStateSchema>;
export type EconomyTransaction = z.infer<typeof EconomyTransactionSchema>;
export type HousingContract = z.infer<typeof HousingContractSchema>;
export type RentRule = z.infer<typeof RentRuleSchema>;
export type StageRule = z.infer<typeof StageRuleSchema>;
export type AxisDef = z.infer<typeof AxisDefSchema>;
export type RelationState = z.infer<typeof RelationStateSchema>;
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
export type EventScope = z.infer<typeof EventScopeSchema>;
export type EventTrigger = z.infer<typeof EventTriggerSchema>;
export type EventDef = z.infer<typeof EventDefSchema>;
export type EventChoice = z.infer<typeof EventChoiceSchema>;
export type EventEvidenceRule = z.infer<typeof EventEvidenceRuleSchema>;
export type EventMilestone = z.infer<typeof EventMilestoneSchema>;
export type EventStageRange = z.infer<typeof EventStageRangeSchema>;
export type ScheduledEvent = z.infer<typeof ScheduledEventSchema>;
export type DirectorState = z.infer<typeof DirectorStateSchema>;
export type EventHistoryEntry = z.infer<typeof EventHistoryEntrySchema>;
export type ChapterSummary = z.infer<typeof ChapterSummarySchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type StoryScene = z.infer<typeof StorySceneSchema>;
export type StorySceneStage = z.infer<typeof StorySceneStageSchema>;
export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export type MemorySource = z.infer<typeof MemorySourceSchema>;
