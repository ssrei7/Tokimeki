import { z } from 'zod';
import { validateConditionSyntax } from '../core/expr';
import { EventDefSchema } from './schema/save';
import { TaskIdSchema } from '../providers/types';
import { compareWorkshopVersions } from './workshop-version';

export const CURRENT_WORKSHOP_PACKAGE_VERSION = 1;
export const CURRENT_WORKSHOP_RUNTIME_VERSION = 1;

const IdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'ID 只能使用 ASCII 字母、数字、点、下划线和连字符。');
const VersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/, '版本必须使用 x.y.z 格式。');
const TextSchema = z.string().max(10_000);
export const WORKSHOP_TEXT_TASKS = [
  'narrate_main', 'narrate_daily', 'topic_tree', 'world_morning', 'world_gen', 'map_gen', 'npc_batch',
  'extract_ops', 'summarize_memory', 'summarize_day', 'summarize_chapter',
] as const;
const WorkshopTextTaskSchema = z.enum(WORKSHOP_TEXT_TASKS);
export const WORKSHOP_PROMPT_TASKS = ['narrate_main', 'topic_tree'] as const;

export const WORKSHOP_ALLOWED_OPS = [
  'add_stat', 'set_stat', 'set_flag', 'give_item', 'take_item', 'add_memory', 'add_node_memory',
  'advance_time', 'move_player', 'reveal_node', 'move_npc', 'unlock_topic', 'mark_topic_used',
  'set_mood', 'adjust_relation_axis', 'add_knot', 'resolve_knot', 'offer_gift', 'resolve_gift',
  'make_appointment', 'queue_event', 'propose_departure', 'resolve_departure', 'run_workshop_activity',
] as const;

export const WORKSHOP_EVENT_EFFECT_OPS = [
  'add_stat', 'set_stat', 'set_flag', 'give_item', 'take_item', 'add_memory', 'add_node_memory',
  'reveal_node', 'unlock_topic', 'mark_topic_used', 'set_mood', 'adjust_relation_axis', 'add_knot',
  'resolve_knot', 'offer_gift', 'resolve_gift', 'make_appointment', 'propose_departure', 'resolve_departure',
] as const;

export const WORKSHOP_ACTIVITY_EFFECT_OPS = ['add_stat', 'set_flag', 'give_item', 'take_item'] as const;
export const WORKSHOP_ACTIVITY_HOOKS = ['manual', 'onEnterNode', 'onTimeAdvance', 'onDaySettle'] as const;
export const WorkshopActivityHookSchema = z.enum(WORKSHOP_ACTIVITY_HOOKS);
export const WORKSHOP_ACTIVITY_COST_KINDS = ['stat', 'item'] as const;

export const WorkshopOpNameSchema = z.enum(WORKSHOP_ALLOWED_OPS);
export const WORKSHOP_WORLD_READ_RESOURCES = [
  'clock', 'world.stats', 'world.flags', 'player.identity', 'player.location', 'player.stats', 'player.flags', 'player.inventory',
  'map', 'characters', 'relations', 'events', 'economy',
] as const;
export const WorkshopWorldReadResourceSchema = z.enum(WORKSHOP_WORLD_READ_RESOURCES);

export const WORKSHOP_COMPONENT_KINDS = ['title', 'text', 'fact', 'image', 'card', 'list', 'tabs', 'button', 'input', 'select', 'progress', 'confirm'] as const;
export const WORKSHOP_ACTION_TYPES = ['navigate', 'set-local', 'submit-op', 'trigger-event', 'provider-text'] as const;
export const WORKSHOP_BINDING_FORMATS = ['auto', 'text', 'number', 'boolean', 'json'] as const;

export const WorkshopPermissionSchema = z.discriminatedUnion('capability', [
  z.object({ capability: z.literal('world.read'), resources: z.array(WorkshopWorldReadResourceSchema).min(1).max(20) }).strict(),
  z.object({ capability: z.literal('app.local-state') }).strict(),
  z.object({ capability: z.literal('navigation.local') }).strict(),
  z.object({ capability: z.literal('op.submit'), resources: z.array(WorkshopOpNameSchema).min(1).max(WORKSHOP_ALLOWED_OPS.length) }).strict(),
  z.object({ capability: z.literal('event.install'), resources: z.array(IdSchema).min(1).max(500) }).strict(),
  z.object({ capability: z.literal('event.trigger'), resources: z.array(IdSchema).min(1).max(500) }).strict(),
  z.object({ capability: z.literal('prompt.register'), resources: z.array(TaskIdSchema).min(1).max(20), maxTokens: z.number().int().positive().max(4096) }).strict(),
  z.object({ capability: z.literal('provider.explicit-text'), resources: z.array(WorkshopTextTaskSchema).min(1).max(20) }).strict(),
]);

export const WorkshopDependencySchema = z.object({
  id: IdSchema,
  minVersion: VersionSchema.optional(),
  maxVersionExclusive: VersionSchema.optional(),
}).strict().superRefine((dependency, context) => {
  if (dependency.minVersion && dependency.maxVersionExclusive && compareWorkshopVersions(dependency.minVersion, dependency.maxVersionExclusive) >= 0) {
    context.addIssue({ code: 'custom', message: '依赖的 minVersion 必须低于 maxVersionExclusive。', path: ['maxVersionExclusive'] });
  }
});

export const WorkshopManifestSchema = z.object({
  type: z.literal('workshop'),
  packageVersion: z.literal(CURRENT_WORKSHOP_PACKAGE_VERSION),
  runtimeVersion: z.literal(CURRENT_WORKSHOP_RUNTIME_VERSION),
  id: IdSchema,
  name: z.string().min(1).max(120),
  author: z.string().min(1).max(120),
  version: VersionSchema,
  description: z.string().max(1000).optional(),
  iconAssetId: IdSchema.optional(),
  permissions: z.array(WorkshopPermissionSchema).max(50).default([]),
  dependencies: z.array(WorkshopDependencySchema).max(50).optional(),
}).strict();

const WorkshopNavigateActionSchema = z.object({ type: z.literal('navigate'), pageId: IdSchema }).strict();
const WorkshopSetLocalActionSchema = z.object({ type: z.literal('set-local'), key: IdSchema, value: z.union([z.string(), z.number(), z.boolean(), z.null()]) }).strict();
const WorkshopSubmitOpActionSchema = z.object({ type: z.literal('submit-op'), op: WorkshopOpNameSchema, payload: z.record(z.string(), z.unknown()).default({}) }).strict();
const WorkshopTriggerEventActionSchema = z.object({ type: z.literal('trigger-event'), eventId: IdSchema }).strict();
const WorkshopProviderTextActionSchema = z.object({
  type: z.literal('provider-text'),
  taskId: WorkshopTextTaskSchema,
  promptBlockId: IdSchema,
  inputKey: IdSchema.optional(),
  resultKey: IdSchema.optional(),
}).strict();

export const WorkshopActionSchema = z.discriminatedUnion('type', [
  WorkshopNavigateActionSchema,
  WorkshopSetLocalActionSchema,
  WorkshopSubmitOpActionSchema,
  WorkshopTriggerEventActionSchema,
  WorkshopProviderTextActionSchema,
]);

export const WorkshopLocalValueSchema = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
const WorkshopBindingPathSegmentSchema = z.union([z.string().min(1).max(120), z.number().int().nonnegative().max(10_000)]).refine((segment) => !['__proto__', 'prototype', 'constructor'].includes(String(segment)), '绑定路径包含不安全字段。');
const WorkshopBindingPresentationSchema = z.object({
  path: z.array(WorkshopBindingPathSegmentSchema).max(8).optional(),
  format: z.enum(WORKSHOP_BINDING_FORMATS).default('auto'),
  prefix: z.string().max(120).optional(),
  suffix: z.string().max(120).optional(),
  fallback: WorkshopLocalValueSchema.optional(),
}).strict();
export const WorkshopValueBindingSchema = z.discriminatedUnion('source', [
  WorkshopBindingPresentationSchema.extend({ source: z.literal('local'), key: IdSchema }).strict(),
  WorkshopBindingPresentationSchema.extend({ source: z.literal('world'), resource: WorkshopWorldReadResourceSchema }).strict(),
]);

const WorkshopTitleComponentSchema = z.object({ kind: z.literal('title'), text: z.string().min(1).max(240), binding: WorkshopValueBindingSchema.optional(), level: z.number().int().min(1).max(3).default(2) }).strict();
const WorkshopTextComponentSchema = z.object({ kind: z.literal('text'), text: TextSchema, binding: WorkshopValueBindingSchema.optional() }).strict();
const WorkshopFactComponentSchema = z.object({ kind: z.literal('fact'), resource: WorkshopWorldReadResourceSchema, label: z.string().max(120).optional() }).strict();
const WorkshopImageComponentSchema = z.object({ kind: z.literal('image'), assetId: IdSchema, alt: z.string().max(240).default('') }).strict();
const WorkshopCardComponentSchema = z.object({ kind: z.literal('card'), title: z.string().max(240).optional(), titleBinding: WorkshopValueBindingSchema.optional(), body: TextSchema.optional(), bodyBinding: WorkshopValueBindingSchema.optional(), imageAssetId: IdSchema.optional() }).strict();
const WorkshopListComponentSchema = z.object({ kind: z.literal('list'), items: z.array(z.string().max(1000)).max(100), binding: WorkshopValueBindingSchema.optional() }).strict();
const WorkshopTabsComponentSchema = z.object({ kind: z.literal('tabs'), tabs: z.array(z.object({ id: IdSchema, label: z.string().min(1).max(80), pageId: IdSchema }).strict()).min(1).max(12) }).strict();
const WorkshopButtonComponentSchema = z.object({ kind: z.literal('button'), label: z.string().min(1).max(120), labelBinding: WorkshopValueBindingSchema.optional(), action: WorkshopActionSchema }).strict();
const WorkshopInputComponentSchema = z.object({ kind: z.literal('input'), key: IdSchema, label: z.string().min(1).max(120), placeholder: z.string().max(240).optional(), maxLength: z.number().int().positive().max(2000).default(500) }).strict();
const WorkshopSelectComponentSchema = z.object({ kind: z.literal('select'), key: IdSchema, label: z.string().min(1).max(120), options: z.array(z.object({ value: z.string().max(240), label: z.string().min(1).max(120) }).strict()).min(1).max(100) }).strict();
const WorkshopProgressComponentSchema = z.object({ kind: z.literal('progress'), label: z.string().max(120).optional(), labelBinding: WorkshopValueBindingSchema.optional(), value: z.number().finite(), valueBinding: WorkshopValueBindingSchema.optional(), max: z.number().finite().positive(), maxBinding: WorkshopValueBindingSchema.optional() }).strict();
const WorkshopConfirmComponentSchema = z.object({ kind: z.literal('confirm'), label: z.string().min(1).max(120), labelBinding: WorkshopValueBindingSchema.optional(), message: z.string().min(1).max(1000), messageBinding: WorkshopValueBindingSchema.optional(), action: WorkshopActionSchema }).strict();

export const WorkshopComponentSchema = z.discriminatedUnion('kind', [
  WorkshopTitleComponentSchema,
  WorkshopTextComponentSchema,
  WorkshopFactComponentSchema,
  WorkshopImageComponentSchema,
  WorkshopCardComponentSchema,
  WorkshopListComponentSchema,
  WorkshopTabsComponentSchema,
  WorkshopButtonComponentSchema,
  WorkshopInputComponentSchema,
  WorkshopSelectComponentSchema,
  WorkshopProgressComponentSchema,
  WorkshopConfirmComponentSchema,
]);

export const WorkshopAppSchema = z.object({
  entryPageId: IdSchema,
  pages: z.array(z.object({ id: IdSchema, title: z.string().min(1).max(120), components: z.array(WorkshopComponentSchema).max(100) }).strict()).min(1).max(50),
}).strict();

export const WorkshopRulesSchema = z.object({
  rules: z.array(z.object({
    id: IdSchema,
    hook: WorkshopActivityHookSchema.default('manual'),
    when: z.string().min(1).max(1000).optional(),
    costs: z.array(z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('stat'), target: z.enum(['player', 'world']), key: z.string().min(1).max(120), amount: z.number().positive().max(10), minimumAfter: z.number().finite().default(0) }).strict(),
      z.object({ kind: z.literal('item'), id: IdSchema, count: z.number().int().positive().max(99) }).strict(),
    ])).max(16).default([]),
    actions: z.array(WorkshopActionSchema).min(1).max(32),
    result: z.object({ success: z.string().min(1).max(500), failure: z.string().min(1).max(500).optional() }).strict().optional(),
    once: z.boolean().optional(),
    cooldownDays: z.number().int().nonnegative().max(100_000).optional(),
  }).strict()).max(200),
}).strict();

export const WorkshopEventsSchema = z.object({ events: z.array(EventDefSchema).max(500) }).strict();

export const WorkshopPromptsSchema = z.object({
  blocks: z.array(z.object({
    id: IdSchema,
    role: z.enum(['system', 'user']),
    priority: z.number().int().min(0).max(100),
    order: z.number().int().min(-10_000).max(10_000),
    tokenBudget: z.number().int().positive().max(1024),
    tasks: z.array(TaskIdSchema).min(1).max(20),
    text: z.string().min(1).max(10_000),
    when: z.string().min(1).max(1000).optional(),
  }).strict()).max(50),
}).strict();

export const WorkshopAssetMetaSchema = z.object({
  assets: z.array(z.object({
    id: IdSchema,
    path: z.string().regex(/^assets\/[A-Za-z0-9][A-Za-z0-9._/-]*$/, '资产路径必须位于 assets/ 下。'),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    bytes: z.number().int().positive().max(5 * 1024 * 1024),
    width: z.number().int().positive().max(16_384).optional(),
    height: z.number().int().positive().max(16_384).optional(),
  }).strict()).max(100),
}).strict();

export const WorkshopPackageSchema = z.object({
  manifest: WorkshopManifestSchema,
  app: WorkshopAppSchema,
  rules: WorkshopRulesSchema,
  events: WorkshopEventsSchema.optional(),
  prompts: WorkshopPromptsSchema.optional(),
  assetMeta: WorkshopAssetMetaSchema.optional(),
}).strict();

export const WorkshopPackageRecordSchema = z.object({
  id: IdSchema,
  package: WorkshopPackageSchema,
  assetBindings: z.record(IdSchema, z.object({ kind: z.literal('stored'), assetId: IdSchema }).strict()),
  installedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const WorkshopBindingSchema = z.object({
  id: z.string().min(1),
  saveId: IdSchema,
  packageId: IdSchema,
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const WorkshopLocalStateSchema = z.object({
  id: z.string().min(1),
  saveId: IdSchema,
  packageId: IdSchema,
  values: z.record(IdSchema, WorkshopLocalValueSchema),
  updatedAt: z.string().datetime(),
}).strict();

export type WorkshopManifest = z.infer<typeof WorkshopManifestSchema>;
export type WorkshopPermission = z.infer<typeof WorkshopPermissionSchema>;
export type WorkshopDependency = z.infer<typeof WorkshopDependencySchema>;
export type WorkshopAction = z.infer<typeof WorkshopActionSchema>;
export type WorkshopActivityHook = z.infer<typeof WorkshopActivityHookSchema>;
export type WorkshopRule = z.infer<typeof WorkshopRulesSchema>['rules'][number];
export type WorkshopActivityCost = WorkshopRule['costs'][number];
export type WorkshopComponent = z.infer<typeof WorkshopComponentSchema>;
export type WorkshopPackage = z.infer<typeof WorkshopPackageSchema>;
export type WorkshopPackageRecord = z.infer<typeof WorkshopPackageRecordSchema>;
export type WorkshopBinding = z.infer<typeof WorkshopBindingSchema>;
export type WorkshopLocalValue = z.infer<typeof WorkshopLocalValueSchema>;
export type WorkshopValueBinding = z.infer<typeof WorkshopValueBindingSchema>;
export type WorkshopLocalState = z.infer<typeof WorkshopLocalStateSchema>;

export interface WorkshopAssetPayload {
  id: string;
  path: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: Uint8Array;
  width?: number;
  height?: number;
}

export interface WorkshopPackageImport {
  package: WorkshopPackage;
  assets: Map<string, WorkshopAssetPayload>;
  report: WorkshopValidationReport;
}

export interface WorkshopValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  path?: string;
}

export interface WorkshopValidationReport {
  canInstall: boolean;
  issues: WorkshopValidationIssue[];
  requiredPermissions: string[];
}

function actionList(pack: WorkshopPackage): Array<{ action: WorkshopAction; path: string }> {
  const actions: Array<{ action: WorkshopAction; path: string }> = [];
  for (const [pageIndex, page] of pack.app.pages.entries()) {
    for (const [componentIndex, component] of page.components.entries()) {
      if (component.kind === 'button' || component.kind === 'confirm') actions.push({ action: component.action, path: `app.pages[${pageIndex}].components[${componentIndex}].action` });
    }
  }
  for (const [ruleIndex, rule] of pack.rules.rules.entries()) rule.actions.forEach((action, actionIndex) => actions.push({ action, path: `rules.rules[${ruleIndex}].actions[${actionIndex}]` }));
  return actions;
}

function componentBindings(component: WorkshopComponent): WorkshopValueBinding[] {
  if (component.kind === 'title' || component.kind === 'text' || component.kind === 'list') return component.binding ? [component.binding] : [];
  if (component.kind === 'card') return [component.titleBinding, component.bodyBinding].filter((binding): binding is WorkshopValueBinding => Boolean(binding));
  if (component.kind === 'button') return component.labelBinding ? [component.labelBinding] : [];
  if (component.kind === 'progress') return [component.labelBinding, component.valueBinding, component.maxBinding].filter((binding): binding is WorkshopValueBinding => Boolean(binding));
  if (component.kind === 'confirm') return [component.labelBinding, component.messageBinding].filter((binding): binding is WorkshopValueBinding => Boolean(binding));
  return [];
}

function eventOps(pack: WorkshopPackage): Array<{ op: string; path: string }> {
  const found: Array<{ op: string; path: string }> = [];
  const inspect = (ops: unknown[] | undefined, path: string) => {
    for (const [index, value] of (ops ?? []).entries()) {
      const op = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).op : undefined;
      if (typeof op === 'string') found.push({ op, path: `${path}[${index}]` });
      else found.push({ op: '', path: `${path}[${index}]` });
    }
  };
  for (const [eventIndex, event] of (pack.events?.events ?? []).entries()) {
    inspect(event.ops, `events.events[${eventIndex}].ops`);
    event.choices?.forEach((choice, choiceIndex) => inspect(choice.ops, `events.events[${eventIndex}].choices[${choiceIndex}].ops`));
    event.evidenceRules?.forEach((rule, ruleIndex) => inspect(rule.ops, `events.events[${eventIndex}].evidenceRules[${ruleIndex}].ops`));
  }
  return found;
}

function permissionLabel(capability: WorkshopPermission['capability'], resource?: string): string {
  return resource ? `${capability}:${resource}` : capability;
}

export function workshopBindingId(saveId: string, packageId: string): string {
  return `${saveId}:${packageId}`;
}

export function collectWorkshopAssetIds(pack: WorkshopPackage): Set<string> {
  const ids = new Set<string>();
  if (pack.manifest.iconAssetId) ids.add(pack.manifest.iconAssetId);
  for (const page of pack.app.pages) for (const component of page.components) {
    if (component.kind === 'image') ids.add(component.assetId);
    if (component.kind === 'card' && component.imageAssetId) ids.add(component.imageAssetId);
  }
  return ids;
}

export function validateWorkshopPackage(pack: WorkshopPackage): WorkshopValidationReport {
  const issues: WorkshopValidationIssue[] = [];
  const required = new Set<string>();
  const pages = new Set<string>();
  const rules = new Map<string, WorkshopRule>();
  const events = new Set<string>();
  const promptBlocks = new Map<string, NonNullable<WorkshopPackage['prompts']>['blocks'][number]>();
  const providerPromptUses = new Set<string>();
  const assets = new Set(pack.assetMeta?.assets.map((asset) => asset.id) ?? []);
  const addIssue = (severity: WorkshopValidationIssue['severity'], code: string, message: string, path?: string) => issues.push({ severity, code, message, ...(path ? { path } : {}) });
  const addConditionPermissions = (condition: string) => {
    if (/\b(day|slotId)\b/.test(condition)) required.add(permissionLabel('world.read', 'clock'));
    if (/\b(nodeId|player\.nodeId)\b/.test(condition)) required.add(permissionLabel('world.read', 'player.location'));
    if (/(^|[^A-Za-z0-9_.])stats\./.test(condition)) required.add(permissionLabel('world.read', 'world.stats'));
    if (/(^|[^A-Za-z0-9_.])flags\./.test(condition)) required.add(permissionLabel('world.read', 'world.flags'));
    if (/\bplayer\.stats\./.test(condition)) required.add(permissionLabel('world.read', 'player.stats'));
    if (/\bplayer\.flags\./.test(condition)) required.add(permissionLabel('world.read', 'player.flags'));
    if (/\b(relations|axes)\./.test(condition)) required.add(permissionLabel('world.read', 'relations'));
  };
  const unique = (id: string, set: Set<string>, label: string, path: string) => { if (set.has(id)) addIssue('error', 'duplicate-id', `${label} ID 重复：${id}`, path); else set.add(id); };

  const dependencyIds = new Set<string>();
  pack.manifest.dependencies?.forEach((dependency, index) => {
    const path = `manifest.dependencies[${index}].id`;
    if (dependency.id === pack.manifest.id) addIssue('error', 'self-dependency', '工坊包不能依赖自身。', path);
    if (dependencyIds.has(dependency.id)) addIssue('error', 'duplicate-dependency', `依赖包 ID 重复：${dependency.id}`, path);
    dependencyIds.add(dependency.id);
  });

  pack.app.pages.forEach((page, index) => unique(page.id, pages, '页面', `app.pages[${index}].id`));
  pack.rules.rules.forEach((rule, index) => {
    if (rules.has(rule.id)) addIssue('error', 'duplicate-id', `活动规则 ID 重复：${rule.id}`, `rules.rules[${index}].id`);
    else rules.set(rule.id, rule);
  });
  if (!pages.has(pack.app.entryPageId)) addIssue('error', 'missing-entry-page', `入口页面不存在：${pack.app.entryPageId}`, 'app.entryPageId');
  pack.events?.events.forEach((event, index) => unique(event.id, events, '事件', `events.events[${index}].id`));
  pack.prompts?.blocks.forEach((block, index) => {
    if (promptBlocks.has(block.id)) addIssue('error', 'duplicate-id', `Prompt block ID 重复：${block.id}`, `prompts.blocks[${index}].id`);
    else promptBlocks.set(block.id, block);
  });
  const assetPaths = new Set<string>();
  pack.assetMeta?.assets.forEach((asset, index) => {
    if (assetPaths.has(asset.path)) addIssue('error', 'duplicate-asset-path', `资产路径重复：${asset.path}`, `assetMeta.assets[${index}].path`);
    assetPaths.add(asset.path);
  });
  for (const assetId of collectWorkshopAssetIds(pack)) if (!assets.has(assetId)) addIssue('error', 'missing-asset', `引用的资产未在 asset-meta.json 中声明：${assetId}`);

  for (const [pageIndex, page] of pack.app.pages.entries()) for (const [componentIndex, component] of page.components.entries()) {
    if (component.kind === 'tabs') {
      required.add('navigation.local');
      component.tabs.forEach((tab, tabIndex) => { if (!pages.has(tab.pageId)) addIssue('error', 'missing-page', `标签页引用了不存在的页面：${tab.pageId}`, `app.pages[${pageIndex}].components[${componentIndex}].tabs[${tabIndex}].pageId`); });
    }
    if (component.kind === 'input' || component.kind === 'select') required.add('app.local-state');
    if (component.kind === 'fact') required.add(permissionLabel('world.read', component.resource));
    for (const binding of componentBindings(component)) {
      if (binding.source === 'local') required.add('app.local-state');
      else required.add(permissionLabel('world.read', binding.resource));
    }
  }

  for (const { action, path } of actionList(pack)) {
    if (action.type === 'navigate') {
      required.add('navigation.local');
      if (!pages.has(action.pageId)) addIssue('error', 'missing-page', `动作引用了不存在的页面：${action.pageId}`, `${path}.pageId`);
    } else if (action.type === 'set-local') {
      required.add('app.local-state');
      if (!WorkshopLocalValueSchema.safeParse(action.value).success) addIssue('error', 'invalid-local-state', '本地 App 状态只允许最多 2000 字符的字符串、有限数值、布尔值或 null。', `${path}.value`);
    }
    else if (action.type === 'submit-op') {
      required.add(permissionLabel('op.submit', action.op));
      if (action.op === 'run_workshop_activity') {
        const ruleId = typeof action.payload.ruleId === 'string' ? action.payload.ruleId : undefined;
        const rule = ruleId ? rules.get(ruleId) : undefined;
        if (!ruleId) addIssue('error', 'invalid-activity-reference', '活动按钮必须在 payload.ruleId 中指定规则。', `${path}.payload.ruleId`);
        else if (!rule) addIssue('error', 'missing-activity-rule', `活动按钮引用了不存在的规则：${ruleId}`, `${path}.payload.ruleId`);
        else if (rule.hook !== 'manual') addIssue('error', 'activity-hook-mismatch', `按钮只能触发 manual 规则：${ruleId}`, `${path}.payload.ruleId`);
      }
    }
    else if (action.type === 'trigger-event') {
      required.add(permissionLabel('event.trigger', action.eventId));
      if (!events.has(action.eventId)) addIssue('error', 'missing-event', `动作引用了不存在的包内事件：${action.eventId}`, `${path}.eventId`);
    } else if (action.type === 'provider-text') {
      required.add(permissionLabel('provider.explicit-text', action.taskId));
      if (action.inputKey || action.resultKey) required.add('app.local-state');
      const promptBlock = promptBlocks.get(action.promptBlockId);
      if (!promptBlock) addIssue('error', 'missing-prompt-block', `Provider 动作引用了不存在的 prompt block：${action.promptBlockId}`, `${path}.promptBlockId`);
      else if (!promptBlock.tasks.includes(action.taskId)) addIssue('error', 'provider-prompt-task-mismatch', `Prompt block ${action.promptBlockId} 未声明任务 ${action.taskId}。`, `${path}.taskId`);
      else providerPromptUses.add(`${action.promptBlockId}:${action.taskId}`);
    }
  }

  pack.rules.rules.forEach((rule, ruleIndex) => {
    required.add(permissionLabel('op.submit', 'run_workshop_activity'));
    rule.costs.forEach((cost) => required.add(permissionLabel('op.submit', cost.kind === 'stat' ? 'add_stat' : 'take_item')));
    rule.actions.forEach((action, actionIndex) => {
      const path = `rules.rules[${ruleIndex}].actions[${actionIndex}]`;
      if (action.type !== 'submit-op') addIssue('error', 'unsupported-activity-action', '活动规则只能组合已开放的确定性 op。', path);
      else if (!WORKSHOP_ACTIVITY_EFFECT_OPS.includes(action.op as typeof WORKSHOP_ACTIVITY_EFFECT_OPS[number])) addIssue('error', 'unsupported-activity-op', `活动规则包含未开放的效果 op：${action.op}`, `${path}.op`);
    });
  });

  for (const event of pack.events?.events ?? []) required.add(permissionLabel('event.install', event.id));
  for (const { op, path } of eventOps(pack)) {
    if (!WORKSHOP_EVENT_EFFECT_OPS.includes(op as typeof WORKSHOP_EVENT_EFFECT_OPS[number])) addIssue('error', 'unsupported-op', op ? `事件包含未开放或非原子安全的 op：${op}` : '事件 op 缺少字符串 op 名。', path);
    else required.add(permissionLabel('op.submit', op));
  }

  const conditionEntries: Array<{ value?: string; path: string }> = [];
  pack.rules.rules.forEach((rule, index) => conditionEntries.push({ value: rule.when, path: `rules.rules[${index}].when` }));
  pack.events?.events.forEach((event, eventIndex) => {
    conditionEntries.push({ value: event.when, path: `events.events[${eventIndex}].when` });
    event.evidenceRules?.forEach((rule, ruleIndex) => conditionEntries.push({ value: rule.when, path: `events.events[${eventIndex}].evidenceRules[${ruleIndex}].when` }));
  });
  pack.prompts?.blocks.forEach((block, index) => conditionEntries.push({ value: block.when, path: `prompts.blocks[${index}].when` }));
  for (const condition of conditionEntries) if (condition.value) {
    addConditionPermissions(condition.value);
    try { validateConditionSyntax(condition.value); }
    catch (error) { addIssue('error', 'invalid-condition', error instanceof Error ? error.message : String(error), condition.path); }
  }

  const promptTokenTotal = (pack.prompts?.blocks ?? []).reduce((total, block) => total + block.tokenBudget, 0);
  if (promptTokenTotal > 4096) addIssue('error', 'prompt-budget-exceeded', `Prompt block 总预算 ${promptTokenTotal} 超过 4096。`, 'prompts.blocks');
  if (pack.prompts?.blocks.length) {
    const tasks = new Set(pack.prompts.blocks.flatMap((block) => block.tasks));
    tasks.forEach((task) => {
      required.add(permissionLabel('prompt.register', task));
    });
    pack.prompts.blocks.forEach((block, blockIndex) => block.tasks.forEach((task) => {
      if (!WORKSHOP_PROMPT_TASKS.includes(task as typeof WORKSHOP_PROMPT_TASKS[number]) && !providerPromptUses.has(`${block.id}:${task}`)) {
        addIssue('error', 'unsupported-prompt-task', `Prompt 任务 ${task} 既不能自动注册，也没有同包显式 Provider 动作使用。`, `prompts.blocks[${blockIndex}].tasks`);
      }
    }));
  }

  const declared = new Set<string>();
  let declaredPromptBudget = 0;
  for (const permission of pack.manifest.permissions) {
    if ('resources' in permission) permission.resources.forEach((resource) => declared.add(permissionLabel(permission.capability, resource)));
    else declared.add(permission.capability);
    if (permission.capability === 'prompt.register') declaredPromptBudget += permission.maxTokens;
  }
  for (const permission of required) if (!declared.has(permission)) addIssue('error', 'permission-missing', `缺少权限声明：${permission}`, 'manifest.permissions');
  for (const permission of declared) if (!required.has(permission)) addIssue('warning', 'permission-unused', `声明了当前包未使用的权限：${permission}`, 'manifest.permissions');
  if (promptTokenTotal > declaredPromptBudget) addIssue('error', 'prompt-permission-budget', `Prompt 实际预算 ${promptTokenTotal} 超过权限声明预算 ${declaredPromptBudget}。`, 'manifest.permissions');
  if (required.size) addIssue('info', 'runtime-boundary', '受限页面可运行包内导航、本地 App 状态、已授权的世界事实读取、白名单活动、用户显式触发的包内声明式事件、narrate_main/topic_tree 的自动 Prompt block，以及用户点击后单次调用的文本 Provider 动作；其他直接 op 仍不运行。');

  return { canInstall: !issues.some((issue) => issue.severity === 'error'), issues, requiredPermissions: [...required].sort() };
}
