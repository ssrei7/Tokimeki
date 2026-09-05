import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 3;

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

export const InventoryEntrySchema = z.object({
  itemId: IdSchema,
  count: z.number().int().positive(),
  gotDay: z.number().int().positive(),
  gotNodeId: IdSchema.optional(),
  fromCharId: IdSchema.optional(),
});

export const PlayerStateSchema = z.object({
  name: z.string().min(1),
  persona: z.string().optional(),
  nodeId: IdSchema,
  homeNodeId: IdSchema.optional(),
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

export const MemoryEntrySchema = z.object({
  id: IdSchema,
  text: z.string().min(1),
  day: z.number().int().positive(),
  nodeId: IdSchema.optional(),
  weight: z.number().optional(),
});

export const RelationMemoryStateSchema = z.object({
  memories: z.array(MemoryEntrySchema),
});

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

export const SaveFileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  meta: z.object({
    id: IdSchema,
    title: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    appVersion: z.string().min(1),
  }),
  config: ConfigV1Schema,
  world: WorldV3Schema,
});

export type SaveFile = z.infer<typeof SaveFileSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type WorldState = z.infer<typeof WorldV3Schema>;
export type ItemDef = z.infer<typeof ItemDefSchema>;
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;
export type ActionCostTable = z.infer<typeof ActionCostTableSchema>;
export type DailySettlement = z.infer<typeof DailySettlementSchema>;
