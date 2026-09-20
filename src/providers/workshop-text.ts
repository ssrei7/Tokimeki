import { estimateTokens } from '../core/prompt/assembler';
import { streamChat, type StreamStatus } from './stream';
import type { ChatMessage, ProviderConfig, TaskId } from './types';

export const WORKSHOP_PROVIDER_CONTEXT_SAFETY_TOKENS = 64;
export const WORKSHOP_PROVIDER_DISPLAY_LIMIT = 10_000;

export async function requestWorkshopProviderText(
  config: ProviderConfig,
  messages: ChatMessage[],
  taskId: TaskId,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; onStatus?: (status: StreamStatus) => void } = {},
): Promise<string> {
  const inputTokens = messages.reduce((total, message) => total + estimateTokens(message.content), 0);
  const availableOutput = config.contextWindow - inputTokens - WORKSHOP_PROVIDER_CONTEXT_SAFETY_TOKENS;
  if (availableOutput < 1) throw new Error('工坊 Provider 请求在联网前被拒绝：Prompt 超过当前 Provider 上下文窗口。');
  const boundedConfig = { ...config, maxOutputTokens: Math.min(config.maxOutputTokens, availableOutput) };
  const text = await streamChat(boundedConfig, messages, () => undefined, {
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    onStatus: options.onStatus,
    taskId,
  });
  return text.slice(0, WORKSHOP_PROVIDER_DISPLAY_LIMIT);
}
