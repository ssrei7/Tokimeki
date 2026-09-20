import { z } from 'zod';
import {
  CURRENT_WORKSHOP_PACKAGE_VERSION,
  CURRENT_WORKSHOP_RUNTIME_VERSION,
  WORKSHOP_ACTION_TYPES,
  WORKSHOP_ACTIVITY_EFFECT_OPS,
  WORKSHOP_ACTIVITY_HOOKS,
  WORKSHOP_BINDING_FORMATS,
  WORKSHOP_COMPONENT_KINDS,
  WORKSHOP_TEXT_TASKS,
  WORKSHOP_WORLD_READ_RESOURCES,
} from './workshop';

export const WORKSHOP_CAPABILITY_CATALOG_VERSION = 2;

export const WorkshopCapabilityCatalogSchema = z.object({
  catalogVersion: z.literal(WORKSHOP_CAPABILITY_CATALOG_VERSION),
  packageVersion: z.number().int().positive(),
  runtimeVersion: z.number().int().positive(),
  ui: z.object({
    components: z.array(z.string()),
    bindings: z.object({
      sources: z.array(z.string()),
      formats: z.array(z.string()),
      targets: z.array(z.string()),
      maxPathDepth: z.number().int().positive(),
      syntax: z.object({ local: z.string(), world: z.string() }).strict(),
      note: z.string(),
    }).strict(),
    actions: z.object({
      enabled: z.array(z.string()),
      conditional: z.array(z.object({ name: z.string(), requirement: z.string() }).strict()),
      disabled: z.array(z.string()),
    }).strict(),
  }).strict(),
  worldRead: z.object({ resources: z.array(z.string()), requirement: z.string() }).strict(),
  activities: z.object({
    hooks: z.array(z.string()),
    dispatchOp: z.literal('run_workshop_activity'),
    effectOps: z.array(z.string()),
    requirement: z.string(),
  }).strict(),
  declaredOnly: z.object({
    events: z.boolean(),
    prompts: z.boolean(),
    providerText: z.boolean(),
    providerTextTasks: z.array(z.string()),
  }).strict(),
  assets: z.object({ acceptedMimeTypes: z.array(z.string()), agentMayCreateBinary: z.literal(false), note: z.string() }).strict(),
  prohibited: z.array(z.string()),
}).strict();

export type WorkshopCapabilityCatalog = z.infer<typeof WorkshopCapabilityCatalogSchema>;

const CATALOG: WorkshopCapabilityCatalog = WorkshopCapabilityCatalogSchema.parse({
  catalogVersion: WORKSHOP_CAPABILITY_CATALOG_VERSION,
  packageVersion: CURRENT_WORKSHOP_PACKAGE_VERSION,
  runtimeVersion: CURRENT_WORKSHOP_RUNTIME_VERSION,
  ui: {
    components: [...WORKSHOP_COMPONENT_KINDS],
    bindings: {
      sources: ['local', 'world'],
      formats: [...WORKSHOP_BINDING_FORMATS],
      targets: ['title.text', 'text.text', 'card.title', 'card.body', 'list.items', 'button.label', 'progress.label', 'progress.value', 'progress.max', 'confirm.label', 'confirm.message'],
      maxPathDepth: 8,
      syntax: {
        local: '{"source":"local","key":"note","format":"text","fallback":"暂无"}',
        world: '{"source":"world","resource":"player.stats","path":["energy"],"format":"number","suffix":" 点","fallback":0}',
      },
      note: '绑定只替换显示值。local 读取包内本地标量；world 只能读取已声明 world.read 资源的安全快照。路径使用字符串/非负整数数组，不执行表达式或模板。',
    },
    actions: {
      enabled: ['navigate', 'set-local'],
      conditional: [{ name: 'submit-op', requirement: '仅允许按钮以 run_workshop_activity 调度同包 manual 规则；规则效果由确定性内核复核。' }],
      disabled: WORKSHOP_ACTION_TYPES.filter((action) => action === 'trigger-event' || action === 'provider-text'),
    },
  },
  worldRead: { resources: [...WORKSHOP_WORLD_READ_RESOURCES], requirement: '必须在 manifest.permissions 中逐项声明 world.read 资源。' },
  activities: {
    hooks: [...WORKSHOP_ACTIVITY_HOOKS],
    dispatchOp: 'run_workshop_activity',
    effectOps: [...WORKSHOP_ACTIVITY_EFFECT_OPS],
    requirement: 'manual 规则由用户按钮触发；onEnterNode 规则由到场钩子触发。效果整组原子校验，AI 不能直接写世界事实。',
  },
  declaredOnly: { events: true, prompts: true, providerText: true, providerTextTasks: [...WORKSHOP_TEXT_TASKS] },
  assets: { acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'], agentMayCreateBinary: false, note: '可保留当前工程已有 assetMeta 和引用；Agent 不能虚构或生成二进制载荷。' },
  prohibited: ['javascript', 'typescript', 'react', 'html', 'css', 'eval', 'script-url', 'base64', 'arbitrary-network'],
});

export function queryWorkshopCapabilityCatalog(): WorkshopCapabilityCatalog {
  return WorkshopCapabilityCatalogSchema.parse(CATALOG);
}
