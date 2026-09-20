import { z } from 'zod';
import { queryWorkshopCapabilityCatalog } from '../data/workshop-capabilities';
import { WorkshopPackageSchema, type WorkshopPackage, type WorkshopValidationIssue } from '../data/workshop';
import { streamChat, type StreamStatus } from './stream';
import type { ChatMessage, ProviderConfig } from './types';
import { executeWorkshopAgentToolCalls, WORKSHOP_AGENT_PROTOCOL_VERSION, WorkshopAgentProtocolResponseSchema } from './workshop-agent-protocol';

export const WORKSHOP_DRAFT_REQUIREMENT_LIMIT = 4000;
export const WORKSHOP_AGENT_SOURCE_LIMIT = 512 * 1024;
export const WORKSHOP_AGENT_HISTORY_LIMIT = 8;

const SYSTEM_PROMPT = `你是“小小地图”的声明式终端 App 草稿生成器。只输出一个 JSON 对象，不要 Markdown、解释或代码围栏。
输出必须是 workshop 包 v1，顶层只能包含 manifest、app、rules；不要输出 events、prompts、assetMeta，也不要引用图片。
manifest 固定 type="workshop"、packageVersion=1、runtimeVersion=1，id 只用 ASCII 字母、数字、点、下划线、连字符，version 使用 x.y.z。
页面组件只使用 title、text、fact、card（不得有 imageAssetId）、list、tabs、button、input、select、progress、confirm。
动作只使用 navigate 与 set-local。rules 必须是 {"rules":[]}。不得提交 op、触发事件、调用 Provider、生成 HTML/CSS/脚本或网络请求。
可读事实 resource 只能从 clock、world.stats、world.flags、player.identity、player.location、player.stats、player.flags、player.inventory、map、characters、relations、events、economy 中选择。
manifest.permissions 必须准确声明实际用到的 world.read resources、app.local-state 和 navigation.local，不要声明未使用权限。
所有数值只是界面展示常量或本地 App 状态，不能声称改变世界事实。若需求涉及尚未开放的确定性玩法，请制作记录/说明界面，并在正文中明确结果不会自动写入世界。
最小结构示例：{"manifest":{"type":"workshop","packageVersion":1,"runtimeVersion":1,"id":"sample.app","name":"示例","author":"AI Draft","version":"1.0.0","permissions":[]},"app":{"entryPageId":"home","pages":[{"id":"home","title":"首页","components":[{"kind":"text","text":"示例"}]}]},"rules":{"rules":[]}}`;

const AGENT_SYSTEM_PROMPT = `你是“小小地图”创意工坊内的 App 制作 Agent。用户会提供当前声明式工程源码、本地校验诊断、最近对话和本轮指令。
请求中的 capabilityQuery 是本地只读 capabilities.list 的权威结果。只使用其中标为已启用或满足条件后可用的运行能力；declaredOnly 内容可以编辑，但必须在 message 中说明当前不会运行。
你必须使用工坊 Agent v1 工具协议返回一个 JSON 对象：{"protocolVersion":1,"message":"给用户的简短说明","toolCalls":[{"id":"replace-project","name":"project.replace","arguments":{"package":{...完整 workshop 包 v1...}}}]}。不要输出 Markdown、代码围栏或额外字段。
当前只开放一次 project.replace 工具调用。它只替换内存中的编辑器草稿，不安装包、不写世界状态、不调用网络。不要请求未列出的工具，也不要返回多个工具调用。
你要在当前工程上增量修改，保留用户未要求删除的页面、规则、资产声明和其他内容。若原源码有误，根据 diagnostics 修复并返回完整合法工程。
组件、动作、世界只读资源、活动 hook、效果 op 和扩展运行状态严格以 capabilityQuery.result 为准。用户按钮触发活动时，按钮 op 使用目录给出的 dispatchOp，payload 为 {"ruleId":"规则-id"}。
条件只能使用安全表达式和 day、slotId、nodeId、stats、flags、player.nodeId、player.stats、player.flags、relations 事实。禁止任意 JavaScript、HTML、CSS、脚本 URL、base64 和任意网络请求。
不要虚构新的二进制资产载荷；可保留当前工程已有的 assetMeta 和引用。events、prompts 可作为工程内容编辑，但当前运行时仍不安装/注册它们，必须在 message 中说明。`;

const WorkshopAgentTurnResponseSchema = z.object({
  message: z.string().min(1).max(4000),
  package: WorkshopPackageSchema,
}).strict();

export interface WorkshopAgentHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface WorkshopAgentTurnInput {
  instruction: string;
  currentSource: string;
  diagnostics: Pick<WorkshopValidationIssue, 'severity' | 'code' | 'message' | 'path'>[];
  history?: WorkshopAgentHistoryEntry[];
}

export interface WorkshopAgentTurnResult {
  message: string;
  package: WorkshopPackage;
  toolCallId?: string;
}

export function buildWorkshopDraftMessages(requirement: string): ChatMessage[] {
  const value = requirement.trim();
  if (!value) throw new Error('请先填写 App 需求。');
  if (value.length > WORKSHOP_DRAFT_REQUIREMENT_LIMIT) throw new Error(`App 需求不能超过 ${WORKSHOP_DRAFT_REQUIREMENT_LIMIT} 个字符。`);
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ requirement: value }) },
  ];
}

export function parseWorkshopDraftResponse(raw: string): WorkshopPackage {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;
  let value: unknown;
  try { value = JSON.parse(candidate); }
  catch { throw new Error('Provider 返回的草稿不是有效 JSON。'); }
  const parsed = WorkshopPackageSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.length ? `（${first.path.map(String).join('.')}）` : '';
    throw new Error(`Provider 返回的草稿不符合工坊包 schema${path}：${first?.message ?? '未知错误'}`);
  }
  const pack = parsed.data;
  if (pack.events || pack.prompts || pack.assetMeta || pack.manifest.iconAssetId || pack.rules.rules.length) throw new Error('AI 草稿只能包含无资产的受限页面与空 rules，不能包含事件、Prompt、资产或规则。');
  const allowedPermissions = new Set(['world.read', 'app.local-state', 'navigation.local']);
  if (pack.manifest.permissions.some((permission) => !allowedPermissions.has(permission.capability))) throw new Error('AI 草稿声明了当前生成切片未开放的权限。');
  for (const page of pack.app.pages) for (const component of page.components) {
    if (component.kind === 'image' || (component.kind === 'card' && component.imageAssetId)) throw new Error('AI 草稿不能引用二进制图片资产。');
    if ((component.kind === 'button' || component.kind === 'confirm') && component.action.type !== 'navigate' && component.action.type !== 'set-local') throw new Error('AI 草稿包含当前生成切片未开放的动作。');
  }
  return pack;
}

function parseJsonResponse(raw: string, invalidMessage: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try { return JSON.parse(fenced?.[1] ?? trimmed); }
  catch { throw new Error(invalidMessage); }
}

export function buildWorkshopAgentMessages(input: WorkshopAgentTurnInput): ChatMessage[] {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error('请先填写工坊 Agent 指令。');
  if (instruction.length > WORKSHOP_DRAFT_REQUIREMENT_LIMIT) throw new Error(`Agent 指令不能超过 ${WORKSHOP_DRAFT_REQUIREMENT_LIMIT} 个字符。`);
  if (input.currentSource.length > WORKSHOP_AGENT_SOURCE_LIMIT) throw new Error(`当前工程超过 ${WORKSHOP_AGENT_SOURCE_LIMIT / 1024} KiB Agent 上下文限制，请先精简或拆分。`);
  const history = (input.history ?? []).slice(-WORKSHOP_AGENT_HISTORY_LIMIT).map((entry) => ({ role: entry.role, content: entry.content.slice(0, 4000) }));
  const diagnostics = input.diagnostics.slice(0, 100).map((issue) => ({ severity: issue.severity, code: issue.code, message: issue.message, ...(issue.path ? { path: issue.path } : {}) }));
  const capabilityQuery = { name: 'capabilities.list' as const, result: queryWorkshopCapabilityCatalog() };
  return [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ protocolVersion: WORKSHOP_AGENT_PROTOCOL_VERSION, instruction, currentSource: input.currentSource, diagnostics, history, capabilityQuery }) },
  ];
}

export function parseWorkshopAgentResponse(raw: string): WorkshopAgentTurnResult {
  const value = parseJsonResponse(raw, 'Provider 返回的 Agent 结果不是有效 JSON。');
  const protocol = WorkshopAgentProtocolResponseSchema.safeParse(value);
  if (protocol.success) return executeWorkshopAgentToolCalls(protocol.data);
  const parsed = WorkshopAgentTurnResponseSchema.safeParse(value);
  if (!parsed.success) {
    const legacyPackage = WorkshopPackageSchema.safeParse(value);
    if (legacyPackage.success) return { message: 'Agent 已更新当前声明式工程。', package: legacyPackage.data };
  }
  if (!parsed.success) {
    const first = protocol.error.issues[0] ?? parsed.error.issues[0];
    const path = first?.path.length ? `（${first.path.map(String).join('.')}）` : '';
    throw new Error(`Provider 返回的 Agent 结果不符合工具协议${path}：${first?.message ?? '未知错误'}`);
  }
  return parsed.data;
}

export async function generateWorkshopDraft(config: ProviderConfig, requirement: string, options: { fetchImpl?: typeof fetch; signal?: AbortSignal; onStatus?: (status: StreamStatus) => void } = {}): Promise<WorkshopPackage> {
  const raw = await streamChat(config, buildWorkshopDraftMessages(requirement), () => undefined, {
    taskId: 'workshop_draft',
    outputMode: config.outputMode === 'off' ? 'off' : 'json_object',
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    onStatus: options.onStatus,
  });
  return parseWorkshopDraftResponse(raw);
}

export async function runWorkshopAgentTurn(config: ProviderConfig, input: WorkshopAgentTurnInput, options: { fetchImpl?: typeof fetch; signal?: AbortSignal; onStatus?: (status: StreamStatus) => void } = {}): Promise<WorkshopAgentTurnResult> {
  const raw = await streamChat(config, buildWorkshopAgentMessages(input), () => undefined, {
    taskId: 'workshop_draft',
    outputMode: config.outputMode === 'off' ? 'off' : 'json_object',
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    onStatus: options.onStatus,
  });
  return parseWorkshopAgentResponse(raw);
}
