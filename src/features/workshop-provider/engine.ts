import type { ChatMessage, TaskId } from '../../providers/types';
import type { PromptFacts } from '../../core/prompt/assembler';
import {
  validateWorkshopPackage,
  type WorkshopAction,
  type WorkshopLocalValue,
  type WorkshopPackageRecord,
} from '../../data/workshop';
import { resolveWorkshopPromptText } from '../workshop-prompt';

export type WorkshopProviderTextAction = Extract<WorkshopAction, { type: 'provider-text' }>;

export interface PreparedWorkshopProviderText {
  taskId: TaskId;
  messages: ChatMessage[];
  resultKey?: string;
}

const DISPLAY_ONLY_CONTRACT = '你正在响应一个用户显式触发的创意工坊 App 请求。你的输出只会作为文本返回给该 App；它不能直接改变游戏时间、位置、数值、flags、物品、关系或其他世界事实。不要声称任何状态提议已经由游戏执行。';

export function prepareWorkshopProviderText(
  record: WorkshopPackageRecord,
  action: WorkshopProviderTextAction,
  facts: PromptFacts,
  values: Readonly<Record<string, WorkshopLocalValue>>,
): PreparedWorkshopProviderText {
  if (record.id !== record.package.manifest.id || !validateWorkshopPackage(record.package).canInstall) throw new Error('工坊包未通过运行时校验。');
  if (!hasPermission(record, 'provider.explicit-text', action.taskId)) throw new Error(`工坊包未声明 Provider 任务权限：${action.taskId}。`);
  if ((action.inputKey || action.resultKey) && !hasPermission(record, 'app.local-state')) throw new Error('工坊包未声明本地 App 状态权限。');
  const prompt = resolveWorkshopPromptText(record, action.promptBlockId, action.taskId, facts);
  if (!prompt) throw new Error('Provider 动作引用的 Prompt 当前不可用、条件不成立或权限不足。');

  const messages: ChatMessage[] = [
    { role: 'system', content: DISPLAY_ONLY_CONTRACT },
    { role: prompt.role, content: prompt.text },
  ];
  if (action.inputKey) {
    const input = localInput(values[action.inputKey]);
    if (!input) throw new Error(`请先填写本地输入：${action.inputKey}。`);
    messages.push({ role: 'user', content: input });
  } else if (prompt.role === 'system') messages.push({ role: 'user', content: '请根据以上指令返回结果。' });
  return { taskId: action.taskId, messages, ...(action.resultKey ? { resultKey: action.resultKey } : {}) };
}

function localInput(value: WorkshopLocalValue | undefined): string {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, 2000);
}

function hasPermission(record: WorkshopPackageRecord, capability: 'provider.explicit-text' | 'app.local-state', resource?: string): boolean {
  return record.package.manifest.permissions.some((permission) => permission.capability === capability
    && (resource === undefined || ('resources' in permission && (permission.resources as readonly string[]).includes(resource))));
}
