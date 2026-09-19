import { z } from 'zod';
import { WorkshopPackageSchema, type WorkshopPackage } from '../data/workshop';

export const WORKSHOP_AGENT_PROTOCOL_VERSION = 1;

const WorkshopAgentToolCallIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, '工具调用 ID 只能使用 1–64 个 ASCII 字母、数字、点、下划线或连字符');

export const WorkshopAgentReplaceProjectCallSchema = z.object({
  id: WorkshopAgentToolCallIdSchema,
  name: z.literal('project.replace'),
  arguments: z.object({ package: WorkshopPackageSchema }).strict(),
}).strict();

export const WorkshopAgentProtocolResponseSchema = z.object({
  protocolVersion: z.literal(WORKSHOP_AGENT_PROTOCOL_VERSION),
  message: z.string().min(1).max(4000),
  toolCalls: z.array(WorkshopAgentReplaceProjectCallSchema).length(1),
}).strict();

export type WorkshopAgentProtocolResponse = z.infer<typeof WorkshopAgentProtocolResponseSchema>;

export interface WorkshopAgentProtocolResult {
  message: string;
  package: WorkshopPackage;
  toolCallId: string;
}

export function executeWorkshopAgentToolCalls(response: WorkshopAgentProtocolResponse): WorkshopAgentProtocolResult {
  const call = response.toolCalls[0];
  if (!call) throw new Error('工坊 Agent 没有提供可执行的工具调用。');
  return { message: response.message, package: call.arguments.package, toolCallId: call.id };
}
