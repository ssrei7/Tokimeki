import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 1;

const IdSchema = z.string().min(1);

const SlotDefSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  label: z.string().optional(),
  order: z.number().int().nonnegative(),
});

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

const InventoryEntrySchema = z.object({
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

export const WorldV1Schema = z.object({
  clock: ClockSchema,
  player: PlayerStateSchema,
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
  world: WorldV1Schema,
});

export type SaveFile = z.infer<typeof SaveFileSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
