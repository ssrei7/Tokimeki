import { z } from 'zod';
import {
  CURRENT_WORKSHOP_PACKAGE_VERSION,
  CURRENT_WORKSHOP_RUNTIME_VERSION,
  WORKSHOP_ACTION_TYPES,
  WORKSHOP_ACTIVITY_EFFECT_OPS,
  WORKSHOP_ACTIVITY_HOOKS,
  WORKSHOP_COMPONENT_KINDS,
  WORKSHOP_TEXT_TASKS,
  WORKSHOP_WORLD_READ_RESOURCES,
} from './workshop';

export const WORKSHOP_CAPABILITY_CATALOG_VERSION = 1;

export const WorkshopCapabilityCatalogSchema = z.object({
  catalogVersion: z.literal(WORKSHOP_CAPABILITY_CATALOG_VERSION),
  packageVersion: z.number().int().positive(),
  runtimeVersion: z.number().int().positive(),
  ui: z.object({
    components: z.array(z.string()),
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
