import { z } from 'zod';
import { WorkshopPackageSchema, type WorkshopPackage } from '../data/workshop';

export const WORKSHOP_AGENT_PROTOCOL_VERSION = 1;
export const WORKSHOP_AGENT_PATCH_OPERATION_LIMIT = 100;

const WorkshopAgentToolCallIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, '工具调用 ID 只能使用 1–64 个 ASCII 字母、数字、点、下划线或连字符');
const WorkshopAgentPatchPathSchema = z.string().min(1).max(1000).startsWith('/', 'patch path 必须使用绝对 JSON Pointer');
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema),
]));

export const WorkshopAgentPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), path: WorkshopAgentPatchPathSchema, value: JsonValueSchema }).strict(),
  z.object({ op: z.literal('replace'), path: WorkshopAgentPatchPathSchema, value: JsonValueSchema }).strict(),
  z.object({ op: z.literal('remove'), path: WorkshopAgentPatchPathSchema }).strict(),
]);

export const WorkshopAgentReplaceProjectCallSchema = z.object({
  id: WorkshopAgentToolCallIdSchema,
  name: z.literal('project.replace'),
  arguments: z.object({ package: WorkshopPackageSchema }).strict(),
}).strict();

export const WorkshopAgentPatchProjectCallSchema = z.object({
  id: WorkshopAgentToolCallIdSchema,
  name: z.literal('project.patch'),
  arguments: z.object({ operations: z.array(WorkshopAgentPatchOperationSchema).min(1).max(WORKSHOP_AGENT_PATCH_OPERATION_LIMIT) }).strict(),
}).strict();

export const WorkshopAgentToolCallSchema = z.discriminatedUnion('name', [
  WorkshopAgentReplaceProjectCallSchema,
  WorkshopAgentPatchProjectCallSchema,
]);

export const WorkshopAgentProtocolResponseSchema = z.object({
  protocolVersion: z.literal(WORKSHOP_AGENT_PROTOCOL_VERSION),
  message: z.string().min(1).max(4000),
  toolCalls: z.array(WorkshopAgentToolCallSchema).length(1),
}).strict();

export type WorkshopAgentProtocolResponse = z.infer<typeof WorkshopAgentProtocolResponseSchema>;

export interface WorkshopAgentProtocolResult {
  message: string;
  package: WorkshopPackage;
  toolCallId: string;
  toolName: 'project.replace' | 'project.patch';
}

type WorkshopAgentPatchOperation = z.infer<typeof WorkshopAgentPatchOperationSchema>;
type JsonContainer = Record<string, unknown> | unknown[];

const WORKSHOP_PROJECT_ROOTS = new Set(['manifest', 'app', 'rules', 'events', 'prompts', 'assetMeta']);
const UNSAFE_POINTER_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function pointerSegments(path: string): string[] {
  const raw = path.slice(1).split('/');
  const segments = raw.map((segment) => {
    if (/~(?:[^01]|$)/.test(segment)) throw new Error(`局部 patch 包含无效 JSON Pointer 转义：${path}`);
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
  });
  if (!segments[0] || !WORKSHOP_PROJECT_ROOTS.has(segments[0])) throw new Error(`局部 patch 不能访问工程根字段：${segments[0] || '(root)'}`);
  if (segments.some((segment) => !segment || UNSAFE_POINTER_SEGMENTS.has(segment))) throw new Error(`局部 patch 包含不安全或空路径段：${path}`);
  return segments;
}

function arrayIndex(segment: string, length: number, allowAppend: boolean): number {
  if (allowAppend && segment === '-') return length;
  if (!/^(0|[1-9]\d*)$/.test(segment)) throw new Error(`局部 patch 数组索引无效：${segment}`);
  const index = Number(segment);
  if (!Number.isSafeInteger(index) || index < 0 || index >= length + (allowAppend ? 1 : 0)) throw new Error(`局部 patch 数组索引越界：${segment}`);
  return index;
}

function patchParent(document: unknown, segments: string[]): { parent: JsonContainer; key: string } {
  let cursor: unknown = document;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) cursor = cursor[arrayIndex(segment, cursor.length, false)];
    else if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, segment)) cursor = (cursor as Record<string, unknown>)[segment];
    else throw new Error(`局部 patch 路径不存在：/${segments.join('/')}`);
  }
  if (!cursor || typeof cursor !== 'object') throw new Error(`局部 patch 的父路径不是容器：/${segments.join('/')}`);
  return { parent: cursor as JsonContainer, key: segments.at(-1)! };
}

function applyOperation(document: unknown, operation: WorkshopAgentPatchOperation): void {
  const segments = pointerSegments(operation.path);
  const { parent, key } = patchParent(document, segments);
  if (Array.isArray(parent)) {
    const index = arrayIndex(key, parent.length, operation.op === 'add');
    if (operation.op === 'add') parent.splice(index, 0, operation.value);
    else if (operation.op === 'replace') parent[index] = operation.value;
    else parent.splice(index, 1);
    return;
  }
  if (operation.op === 'add') parent[key] = operation.value;
  else {
    if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new Error(`局部 patch 路径不存在：${operation.path}`);
    if (operation.op === 'replace') parent[key] = operation.value;
    else delete parent[key];
  }
}

export function applyWorkshopProjectPatch(currentProject: unknown, operations: WorkshopAgentPatchOperation[]): WorkshopPackage {
  let next: unknown;
  try { next = JSON.parse(JSON.stringify(currentProject)); }
  catch { throw new Error('当前工程无法复制，不能应用局部 patch。'); }
  for (const operation of operations) applyOperation(next, operation);
  const parsed = WorkshopPackageSchema.safeParse(next);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.length ? `（${first.path.map(String).join('.')}）` : '';
    throw new Error(`局部 patch 后的工程不符合工坊包 schema${path}：${first?.message ?? '未知错误'}`);
  }
  return parsed.data;
}

export function executeWorkshopAgentToolCalls(response: WorkshopAgentProtocolResponse, currentProject?: unknown): WorkshopAgentProtocolResult {
  const call = response.toolCalls[0];
  if (!call) throw new Error('工坊 Agent 没有提供可执行的工具调用。');
  if (call.name === 'project.replace') return { message: response.message, package: call.arguments.package, toolCallId: call.id, toolName: call.name };
  if (currentProject === undefined) throw new Error('project.patch 需要当前工程作为本地基线。');
  return { message: response.message, package: applyWorkshopProjectPatch(currentProject, call.arguments.operations), toolCallId: call.id, toolName: call.name };
}
