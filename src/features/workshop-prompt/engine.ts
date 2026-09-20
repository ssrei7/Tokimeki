import { evaluateCondition, type ConditionScope } from '../../core/expr';
import { estimateTokens, type PromptAssembler, type PromptBlock, type PromptFacts } from '../../core/prompt/assembler';
import {
  WorkshopPackageRecordSchema,
  validateWorkshopPackage,
  WORKSHOP_PROMPT_TASKS,
  type WorkshopPackageRecord,
} from '../../data/workshop';

const WORKSHOP_PROMPT_PREFIX = 'workshop:';
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function workshopPromptBlockId(packageId: string, blockId: string): string {
  return `${WORKSHOP_PROMPT_PREFIX}${packageId}:${blockId}`;
}

export function createWorkshopPromptBlocks(records: readonly WorkshopPackageRecord[]): PromptBlock[] {
  const blocks: PromptBlock[] = [];
  for (const candidate of records) {
    const parsed = WorkshopPackageRecordSchema.safeParse(candidate);
    if (!parsed.success || !validateWorkshopPackage(parsed.data.package).canInstall) continue;
    const record = parsed.data;
    if (record.id !== record.package.manifest.id) continue;
    const permissions = record.package.manifest.permissions.filter((permission) => permission.capability === 'prompt.register');
    const declaredBudget = permissions.reduce((total, permission) => total + permission.maxTokens, 0);
    const requestedBudget = (record.package.prompts?.blocks ?? []).reduce((total, block) => total + block.tokenBudget, 0);
    if (requestedBudget > declaredBudget) continue;

    for (const block of record.package.prompts?.blocks ?? []) {
      const tasks = block.tasks.filter((task): task is typeof WORKSHOP_PROMPT_TASKS[number] => (
        WORKSHOP_PROMPT_TASKS.includes(task as typeof WORKSHOP_PROMPT_TASKS[number])
        && permissions.some((permission) => permission.resources.includes(task))
      ));
      if (tasks.length !== block.tasks.length) continue;
      blocks.push({
        id: workshopPromptBlockId(record.id, block.id),
        role: block.role,
        priority: block.priority,
        order: block.order,
        tasks,
        maxTokens: block.tokenBudget,
        build: (facts) => {
          if (block.when && !matchesWorkshopPromptCondition(block.when, facts)) return null;
          return block.text;
        },
        truncate: (text, maxTokens) => truncateWorkshopPrompt(text, Math.min(block.tokenBudget, maxTokens)),
      });
    }
  }
  return blocks;
}

export function registerWorkshopPromptBlocks(assembler: PromptAssembler, records: readonly WorkshopPackageRecord[]): () => void {
  const blocks = createWorkshopPromptBlocks(records);
  for (const block of blocks) assembler.register(block);
  return () => { for (const block of blocks) assembler.unregister(block.id); };
}

export function truncateWorkshopPrompt(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const codePoints = Array.from(text);
  let low = 0;
  let high = codePoints.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimateTokens(codePoints.slice(0, middle).join('')) <= maxTokens) low = middle;
    else high = middle - 1;
  }
  return codePoints.slice(0, low).join('');
}

function matchesWorkshopPromptCondition(condition: string, facts: PromptFacts): boolean {
  const scope = workshopPromptConditionScope(facts);
  if (!scope) return false;
  try { return evaluateCondition(condition, scope); }
  catch { return false; }
}

function workshopPromptConditionScope(facts: PromptFacts): ConditionScope | undefined {
  const world = asRecord(facts.world);
  const clock = asRecord(world?.clock);
  const player = asRecord(world?.player);
  if (!world || !clock || !player || typeof clock.day !== 'number' || typeof clock.slotId !== 'string' || typeof player.nodeId !== 'string') return undefined;
  return {
    day: clock.day,
    slotId: clock.slotId,
    nodeId: player.nodeId,
    stats: numericRecord(world.stats),
    flags: booleanRecord(world.flags),
    player: {
      nodeId: player.nodeId,
      stats: numericRecord(player.stats),
      flags: booleanRecord(player.flags),
    },
    relations: relationRecord(world.relations),
  } as unknown as ConditionScope;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numericRecord(value: unknown): Record<string, number> {
  return scalarRecord(value, (item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function booleanRecord(value: unknown): Record<string, boolean> {
  return scalarRecord(value, (item): item is boolean => typeof item === 'boolean');
}

function scalarRecord<T>(value: unknown, accepts: (item: unknown) => item is T): Record<string, T> {
  const source = asRecord(value);
  if (!source) return {};
  const result: Record<string, T> = {};
  for (const [key, item] of Object.entries(source)) if (!UNSAFE_KEYS.has(key) && accepts(item)) result[key] = item;
  return result;
}

function relationRecord(value: unknown): Record<string, { stageId: string; axes: Record<string, number> }> {
  const source = asRecord(value);
  if (!source) return {};
  return Object.fromEntries(Object.entries(source).flatMap(([key, item]) => {
    const relation = asRecord(item);
    if (UNSAFE_KEYS.has(key) || !relation) return [];
    return [[key, { stageId: typeof relation.stageId === 'string' ? relation.stageId : '', axes: numericRecord(relation.axes) }]];
  }));
}
