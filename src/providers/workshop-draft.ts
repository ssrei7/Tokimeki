import { z } from 'zod';
import { queryWorkshopCapabilityCatalog } from '../data/workshop-capabilities';
import { WorkshopProjectInspectionSchema, type WorkshopProjectInspection } from '../data/workshop-inspection';
import { validateWorkshopPackage, WorkshopPackageSchema, type WorkshopPackage } from '../data/workshop';
import { streamChat, type StreamStatus } from './stream';
import type { ChatMessage, ProviderConfig } from './types';
import { executeWorkshopAgentToolCalls, WORKSHOP_AGENT_PROTOCOL_VERSION, WorkshopAgentProtocolResponseSchema } from './workshop-agent-protocol';
import { completeWorkshopAgentRequest, DEFAULT_WORKSHOP_AGENT_BUDGET, prepareWorkshopAgentRequest, WorkshopAgentContextBudgetError, type WorkshopAgentBudget, type WorkshopAgentBudgetReport, type WorkshopAgentBudgetUsage } from './workshop-agent-budget';

export const WORKSHOP_DRAFT_REQUIREMENT_LIMIT = 4000;
export const WORKSHOP_AGENT_SOURCE_LIMIT = 512 * 1024;
export const WORKSHOP_AGENT_HISTORY_LIMIT = 8;
export const WORKSHOP_AGENT_REPAIR_RESPONSE_LIMIT = 16_000;

const SYSTEM_PROMPT = `你是“小小地图”的声明式终端 App 草稿生成器。只输出一个 JSON 对象，不要 Markdown、解释或代码围栏。
输出必须是 workshop 包 v1，顶层只能包含 manifest、app、rules；不要输出 events、prompts、assetMeta，也不要引用图片。
manifest 固定 type="workshop"、packageVersion=1、runtimeVersion=1，id 只用 ASCII 字母、数字、点、下划线、连字符，version 使用 x.y.z。
只有用户明确要求依赖其他已知工坊包时，才可在 manifest.dependencies 声明 {"id":"包-id","minVersion":"1.0.0","maxVersionExclusive":"2.0.0"}；不会自动安装依赖。
页面组件只使用 title、text、fact、card（不得有 imageAssetId）、list、tabs、button、input、select、progress、confirm。
动作只使用 navigate 与 set-local。rules 必须是 {"rules":[]}。不得提交 op、触发事件、调用 Provider、生成 HTML/CSS/脚本或网络请求。
可读事实 resource 只能从 clock、world.stats、world.flags、player.identity、player.location、player.stats、player.flags、player.inventory、map、characters、relations、events、economy 中选择。
manifest.permissions 必须准确声明实际用到的 world.read resources、app.local-state 和 navigation.local，不要声明未使用权限。
所有数值只是界面展示常量或本地 App 状态，不能声称改变世界事实。若需求涉及尚未开放的确定性玩法，请制作记录/说明界面，并在正文中明确结果不会自动写入世界。
最小结构示例：{"manifest":{"type":"workshop","packageVersion":1,"runtimeVersion":1,"id":"sample.app","name":"示例","author":"AI Draft","version":"1.0.0","permissions":[]},"app":{"entryPageId":"home","pages":[{"id":"home","title":"首页","components":[{"kind":"text","text":"示例"}]}]},"rules":{"rules":[]}}`;

const AGENT_SYSTEM_PROMPT = `你是“小小地图”创意工坊内的 App 制作 Agent。用户会提供当前声明式工程源码、本地 project.inspect 结果、最近对话和本轮指令。
请求中的 capabilityQuery 是本地只读 capabilities.list 的权威结果。只使用其中标为已启用或满足条件后可用的运行能力；declaredOnly 内容可以编辑，但必须在 message 中说明当前不会运行。
inspectionQuery 是本地只读 project.inspect 的权威结果。先根据其中的 status、diagnostics、requiredPermissions 和 preview 理解当前工程；preview 只概括声明式结构，不代表任何世界事实。
你必须使用工坊 Agent v1 工具协议返回一个 JSON 对象，不要输出 Markdown、代码围栏或额外字段。每轮只能调用一次 project.patch 或 project.replace。
小范围修改优先使用 project.patch：{"protocolVersion":1,"message":"简短说明","toolCalls":[{"id":"patch-project","name":"project.patch","arguments":{"operations":[{"op":"replace","path":"/app/pages/0/title","value":"新标题"}]}}]}。仅可使用 add、replace、remove 和绝对 JSON Pointer，最多 100 项；不能访问工程六个根字段之外的路径。
当前工程不是有效 JSON、需要整体重构或无法安全定位路径时使用 project.replace，并在 arguments.package 返回完整 workshop v1 工程。这两个工具都只产生内存草稿，不安装包、不写世界状态、不调用网络。不要请求未列出的工具，也不要返回多个工具调用。
你要在当前工程上增量修改，保留用户未要求删除的页面、规则、资产声明和其他内容。若原源码有误，根据 inspectionQuery.result.diagnostics 修复并返回完整合法工程。
组件、动作、世界只读资源、活动 hook、效果 op 和扩展运行状态严格以 capabilityQuery.result 为准。用户按钮触发活动时，按钮 op 使用目录给出的 dispatchOp，payload 为 {"ruleId":"规则-id"}。
条件只能使用安全表达式和 day、slotId、nodeId、stats、flags、player.nodeId、player.stats、player.flags、relations 事实。禁止任意 JavaScript、HTML、CSS、脚本 URL、base64 和任意网络请求。
不要虚构新的二进制资产载荷；可保留当前工程已有的 assetMeta 和引用。events、prompts 与 Provider 动作是否可运行、支持哪些任务及所需权限，完全以 capabilityQuery.result 为准，不要沿用旧状态假设。
若请求包含 repair，它表示上一步输出被本地协议、patch 或 schema 校验拒绝。根据 validationError 和 previousResponseExcerpt 修正输出；不要争辩、重复错误格式或改变用户原始目标。`;

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
  inspection: WorkshopProjectInspection;
  history?: WorkshopAgentHistoryEntry[];
  budget?: WorkshopAgentBudget;
  budgetUsage?: WorkshopAgentBudgetUsage;
}

export interface WorkshopAgentTurnResult {
  message: string;
  package: WorkshopPackage;
  toolCallId?: string;
  toolName?: 'project.replace' | 'project.patch';
  budgetReport?: WorkshopAgentBudgetReport;
  repairAttempts?: number;
  contextReport?: WorkshopAgentContextReport;
}

export interface WorkshopAgentContextReport {
  sourceMinified: boolean;
  historyEntriesSent: number;
  historyEntriesDropped: number;
  diagnosticsDropped: number;
  repairResponseTruncated: boolean;
}

export interface WorkshopAgentMessageOptions {
  historyLimit?: number;
  diagnosticLimit?: number;
  repair?: {
    failedStep: number;
    validationError: string;
    previousResponseExcerpt?: string;
  };
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

function compactWorkshopSource(source: string): { source: string; minified: boolean } {
  try {
    const compact = JSON.stringify(JSON.parse(source));
    return compact.length < source.length ? { source: compact, minified: true } : { source, minified: false };
  } catch {
    return { source, minified: false };
  }
}

export function buildWorkshopAgentMessages(input: WorkshopAgentTurnInput, options: WorkshopAgentMessageOptions = {}): ChatMessage[] {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error('请先填写工坊 Agent 指令。');
  if (instruction.length > WORKSHOP_DRAFT_REQUIREMENT_LIMIT) throw new Error(`Agent 指令不能超过 ${WORKSHOP_DRAFT_REQUIREMENT_LIMIT} 个字符。`);
  if (input.currentSource.length > WORKSHOP_AGENT_SOURCE_LIMIT) throw new Error(`当前工程超过 ${WORKSHOP_AGENT_SOURCE_LIMIT / 1024} KiB Agent 上下文限制，请先精简或拆分。`);
  const compacted = compactWorkshopSource(input.currentSource);
  const historyLimit = Math.max(0, Math.min(WORKSHOP_AGENT_HISTORY_LIMIT, options.historyLimit ?? WORKSHOP_AGENT_HISTORY_LIMIT));
  const availableHistory = input.history ?? [];
  const selectedHistory = historyLimit > 0 ? availableHistory.slice(-historyLimit) : [];
  const history = selectedHistory.map((entry) => ({ role: entry.role, content: entry.content.slice(0, 4000) }));
  const capabilityQuery = { name: 'capabilities.list' as const, result: queryWorkshopCapabilityCatalog() };
  const inspection = WorkshopProjectInspectionSchema.parse(input.inspection);
  const diagnosticLimit = Math.max(0, Math.min(inspection.diagnostics.length, options.diagnosticLimit ?? inspection.diagnostics.length));
  const inspectionQuery = { name: 'project.inspect' as const, result: {
    ...inspection,
    diagnostics: inspection.diagnostics.slice(0, diagnosticLimit),
    diagnosticsTruncated: inspection.diagnosticsTruncated || diagnosticLimit < inspection.diagnostics.length,
  } };
  return [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ protocolVersion: WORKSHOP_AGENT_PROTOCOL_VERSION, instruction, currentSource: compacted.source, history, capabilityQuery, inspectionQuery, ...(options.repair ? { repair: options.repair } : {}) }) },
  ];
}

function responseExcerpt(raw: string, limit: number): { text?: string; truncated: boolean } {
  if (limit <= 0) return { truncated: raw.length > 0 };
  if (raw.length <= limit) return { text: raw, truncated: false };
  const marker = '\n…[本地截断]…\n';
  const available = Math.max(1, limit - marker.length);
  const head = Math.ceil(available / 2);
  const tail = Math.floor(available / 2);
  return { text: `${raw.slice(0, head)}${marker}${raw.slice(-tail)}`, truncated: true };
}

function prepareWorkshopAgentAttempt(config: ProviderConfig, input: WorkshopAgentTurnInput, budget: WorkshopAgentBudget, usage: WorkshopAgentBudgetUsage, repair?: { failedStep: number; validationError: string; rawResponse: string }) {
  const historyTotal = Math.min(input.history?.length ?? 0, WORKSHOP_AGENT_HISTORY_LIMIT);
  const diagnosticTotal = input.inspection.diagnostics.length;
  const diagnosticLimits = [...new Set([diagnosticTotal, 50, 20, 10, 0].filter((limit) => limit <= diagnosticTotal))];
  const compacted = compactWorkshopSource(input.currentSource);
  const excerptLimits = repair ? [WORKSHOP_AGENT_REPAIR_RESPONSE_LIMIT, 8_000, 4_000, 2_000, 1_000, 0] : [0];
  let lastContextError: WorkshopAgentContextBudgetError | undefined;
  for (const diagnosticLimit of diagnosticLimits) {
    for (const excerptLimit of excerptLimits) {
      const excerpt = repair ? responseExcerpt(repair.rawResponse, excerptLimit) : { truncated: false };
      for (let historyLimit = historyTotal; historyLimit >= 0; historyLimit -= 1) {
        const messages = buildWorkshopAgentMessages(input, {
          historyLimit,
          diagnosticLimit,
          repair: repair ? {
            failedStep: repair.failedStep,
            validationError: repair.validationError.slice(0, 2_000),
            ...(excerpt.text ? { previousResponseExcerpt: excerpt.text } : {}),
          } : undefined,
        });
        try {
          return {
            messages,
            requestPlan: prepareWorkshopAgentRequest(config, messages, budget, usage),
            contextReport: {
              sourceMinified: compacted.minified,
              historyEntriesSent: historyLimit,
              historyEntriesDropped: historyTotal - historyLimit,
              diagnosticsDropped: diagnosticTotal - diagnosticLimit,
              repairResponseTruncated: excerpt.truncated,
            } satisfies WorkshopAgentContextReport,
          };
        } catch (error) {
          if (!(error instanceof WorkshopAgentContextBudgetError)) throw error;
          lastContextError = error;
        }
      }
    }
  }
  throw lastContextError ?? new WorkshopAgentContextBudgetError('工坊 Agent 上下文无法放入当前预算。');
}

export function parseWorkshopAgentResponse(raw: string, currentSource?: string): WorkshopAgentTurnResult {
  const value = parseJsonResponse(raw, 'Provider 返回的 Agent 结果不是有效 JSON。');
  const protocol = WorkshopAgentProtocolResponseSchema.safeParse(value);
  if (protocol.success) {
    const call = protocol.data.toolCalls[0];
    if (call?.name === 'project.patch' && currentSource === undefined) throw new Error('project.patch 需要当前工程作为本地基线。');
    const currentProject = call?.name === 'project.patch'
      ? parseJsonResponse(currentSource!, '当前工程不是有效 JSON，无法应用局部 patch；请让 Agent 使用 project.replace。')
      : undefined;
    return executeWorkshopAgentToolCalls(protocol.data, currentProject);
  }
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
  const budget = input.budget ?? DEFAULT_WORKSHOP_AGENT_BUDGET;
  let usage: WorkshopAgentBudgetUsage = input.budgetUsage ?? { stepsUsed: 0, requestsUsed: 0, estimatedOutputTokensUsed: 0 };
  let repair: { failedStep: number; validationError: string; rawResponse: string } | undefined;
  let repairAttempts = 0;
  while (true) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let attempt: ReturnType<typeof prepareWorkshopAgentAttempt>;
    try {
      attempt = prepareWorkshopAgentAttempt(config, input, budget, usage, repair);
    } catch (error) {
      if (!repair) throw error;
      throw new Error(`工坊 Agent 自动修复在 ${usage.stepsUsed} 步、${usage.requestsUsed} 次 API 后停止：${error instanceof Error ? error.message : '预算不足。'}`);
    }
    const raw = await streamChat(attempt.requestPlan.config, attempt.messages, () => undefined, {
      taskId: 'workshop_draft',
      outputMode: config.outputMode === 'off' ? 'off' : 'json_object',
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      onStatus: options.onStatus,
    });
    const budgetReport = completeWorkshopAgentRequest(attempt.requestPlan, raw);
    usage = {
      stepsUsed: budgetReport.stepsUsed,
      requestsUsed: budgetReport.requestsUsed,
      estimatedOutputTokensUsed: budgetReport.estimatedOutputTokensUsed,
    };
    try {
      const result = parseWorkshopAgentResponse(raw, input.currentSource);
      const validation = validateWorkshopPackage(result.package);
      const errors = validation.issues.filter((issue) => issue.severity === 'error');
      if (errors.length) throw new Error(`Provider 返回工程未通过本地完整校验：${errors.slice(0, 10).map((issue) => `${issue.code}${issue.path ? `@${issue.path}` : ''}：${issue.message}`).join('；')}`);
      return { ...result, budgetReport, repairAttempts, contextReport: attempt.contextReport };
    } catch (error) {
      repairAttempts += 1;
      const message = error instanceof Error ? error.message : '本地校验拒绝了 Provider 输出。';
      if (usage.stepsUsed >= budget.maxSteps || usage.requestsUsed >= budget.maxRequests || usage.estimatedOutputTokensUsed >= budget.maxTotalOutputTokens) {
        throw new Error(`工坊 Agent 自动修复在 ${usage.stepsUsed} 步、${usage.requestsUsed} 次 API 后达到预算上限：${message}`);
      }
      repair = { failedStep: usage.stepsUsed, validationError: message, rawResponse: raw };
    }
  }
}
