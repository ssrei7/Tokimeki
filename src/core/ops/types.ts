import type { z } from 'zod';
import type { WorldState } from '../../data/schema/save';
import type { CalendarConfig, ActionCostTable, EncounterConfig, AxisDef, StageRule } from '../../data/schema/save';
import type { EventBus } from '../events/bus';

export interface OpContext {
  world: WorldState;
  actorId?: string;
  day: number;
  slotId: string;
  nodeId: string;
  log(message: string): void;
  calendar?: CalendarConfig;
  actionCosts?: ActionCostTable;
  encounterConfig?: EncounterConfig;
  axisDefs?: AxisDef[];
  stageRules?: StageRule[];
  events?: EventBus;
  memorySource?: { chatCharacterId: string; messageIndex: number };
}

export interface Change {
  path: string;
  before: unknown;
  after: unknown;
  description: string;
}

export interface OpResult {
  ok: boolean;
  changes: Change[];
  warning?: string;
}

export interface NumericClamp {
  min: number;
  max: number;
}

export interface OpLimits {
  numeric?: Record<string, NumericClamp>;
}

export interface OpDefinition<P> {
  op: string;
  schema: z.ZodType<P>;
  apply(payload: P, context: OpContext): OpResult;
  describe(payload: P): string;
  promptDoc: string;
  clamp: OpLimits;
}

export interface RejectedOp {
  index: number;
  input: unknown;
  reason: string;
}

export interface ApplyOpsResult {
  applied: number;
  changes: Change[];
  warnings: string[];
  rejected: RejectedOp[];
  truncated: number;
}
