import { z } from 'zod';
import { estimateTokens } from '../core/prompt/assembler';
import type { ChatMessage, ProviderConfig } from './types';

export const WORKSHOP_AGENT_MAX_STEPS = 8;
export const WORKSHOP_AGENT_MAX_REQUESTS = 8;
export const WORKSHOP_AGENT_MAX_TOKEN_BUDGET = 65_536;
export const WORKSHOP_AGENT_MAX_SAFETY_MARGIN = 32_768;

export const WorkshopAgentBudgetSchema = z.object({
  maxSteps: z.number().int().min(1).max(WORKSHOP_AGENT_MAX_STEPS),
  maxRequests: z.number().int().min(1).max(WORKSHOP_AGENT_MAX_REQUESTS),
  maxOutputTokensPerRequest: z.number().int().min(1).max(WORKSHOP_AGENT_MAX_TOKEN_BUDGET),
  maxTotalOutputTokens: z.number().int().min(1).max(WORKSHOP_AGENT_MAX_TOKEN_BUDGET),
  safetyMarginTokens: z.number().int().min(0).max(WORKSHOP_AGENT_MAX_SAFETY_MARGIN),
}).strict();

export type WorkshopAgentBudget = z.infer<typeof WorkshopAgentBudgetSchema>;

export const DEFAULT_WORKSHOP_AGENT_BUDGET: WorkshopAgentBudget = {
  maxSteps: 4,
  maxRequests: 4,
  maxOutputTokensPerRequest: 2_048,
  maxTotalOutputTokens: 8_192,
  safetyMarginTokens: 512,
};

export const WorkshopAgentBudgetUsageSchema = z.object({
  stepsUsed: z.number().int().nonnegative(),
  requestsUsed: z.number().int().nonnegative(),
  estimatedOutputTokensUsed: z.number().int().nonnegative(),
}).strict();

export type WorkshopAgentBudgetUsage = z.infer<typeof WorkshopAgentBudgetUsageSchema>;

export interface WorkshopAgentBudgetReport extends WorkshopAgentBudgetUsage {
  estimatedInputTokens: number;
  inputTokenLimit: number;
  outputTokenLimit: number;
  estimatedOutputTokens: number;
}

interface WorkshopAgentRequestPlan {
  config: ProviderConfig;
  budget: WorkshopAgentBudget;
  previousUsage: WorkshopAgentBudgetUsage;
  estimatedInputTokens: number;
  inputTokenLimit: number;
  outputTokenLimit: number;
}

const EMPTY_USAGE: WorkshopAgentBudgetUsage = {
  stepsUsed: 0,
  requestsUsed: 0,
  estimatedOutputTokensUsed: 0,
};

export function estimateWorkshopAgentInputTokens(messages: readonly ChatMessage[]): number {
  return 2 + messages.reduce((total, message) => total + 4 + estimateTokens(message.content), 0);
}

export function prepareWorkshopAgentRequest(config: ProviderConfig, messages: readonly ChatMessage[], budgetInput: WorkshopAgentBudget, usageInput: WorkshopAgentBudgetUsage = EMPTY_USAGE): WorkshopAgentRequestPlan {
  const budget = WorkshopAgentBudgetSchema.parse(budgetInput);
  const previousUsage = WorkshopAgentBudgetUsageSchema.parse(usageInput);
  if (previousUsage.stepsUsed >= budget.maxSteps) throw new Error(`工坊 Agent 已达到 ${budget.maxSteps} 步运行预算，未发起 API 请求。`);
  if (previousUsage.requestsUsed >= budget.maxRequests) throw new Error(`工坊 Agent 已达到 ${budget.maxRequests} 次 API 请求预算，未发起新请求。`);

  const remainingOutputTokens = budget.maxTotalOutputTokens - previousUsage.estimatedOutputTokensUsed;
  if (remainingOutputTokens <= 0) throw new Error('工坊 Agent 已用尽总输出 token 预算，未发起 API 请求。');
  const outputTokenLimit = Math.min(config.maxOutputTokens, budget.maxOutputTokensPerRequest, remainingOutputTokens);
  const inputTokenLimit = config.contextWindow - outputTokenLimit - budget.safetyMarginTokens;
  const estimatedInputTokens = estimateWorkshopAgentInputTokens(messages);
  if (inputTokenLimit <= 0) throw new Error(`工坊 Agent 预算无法容纳请求：Provider 上下文 ${config.contextWindow}，输出预留 ${outputTokenLimit}，安全余量 ${budget.safetyMarginTokens}。`);
  if (estimatedInputTokens > inputTokenLimit) throw new Error(`工坊 Agent 上下文预检超限：预计输入 ${estimatedInputTokens} tokens，可用 ${inputTokenLimit} tokens。请精简工程、历史或降低输出/安全余量。`);

  return {
    config: { ...config, maxOutputTokens: outputTokenLimit },
    budget,
    previousUsage,
    estimatedInputTokens,
    inputTokenLimit,
    outputTokenLimit,
  };
}

export function completeWorkshopAgentRequest(plan: WorkshopAgentRequestPlan, rawResponse: string): WorkshopAgentBudgetReport {
  const estimatedOutputTokens = estimateTokens(rawResponse);
  if (estimatedOutputTokens > plan.outputTokenLimit) throw new Error(`Provider 返回内容超过工坊 Agent 单次输出预算：预计 ${estimatedOutputTokens} / ${plan.outputTokenLimit} tokens，结果未应用。`);
  return {
    stepsUsed: plan.previousUsage.stepsUsed + 1,
    requestsUsed: plan.previousUsage.requestsUsed + 1,
    estimatedOutputTokensUsed: plan.previousUsage.estimatedOutputTokensUsed + estimatedOutputTokens,
    estimatedInputTokens: plan.estimatedInputTokens,
    inputTokenLimit: plan.inputTokenLimit,
    outputTokenLimit: plan.outputTokenLimit,
    estimatedOutputTokens,
  };
}
