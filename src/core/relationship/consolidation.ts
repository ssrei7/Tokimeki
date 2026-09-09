import { z } from 'zod';
import type { ChatMessage } from '../../data/content';

export const MEMORY_CONSOLIDATION_THRESHOLD = 6;

export const MemoryConsolidationCandidateSchema = z.object({
  target: z.string().min(1),
  text: z.string().min(1).max(1000),
  type: z.enum(['interaction', 'promise', 'preference', 'event', 'observation', 'other']).default('interaction'),
  importance: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
});
export const MemoryConsolidationResponseSchema = z.array(MemoryConsolidationCandidateSchema).max(3);
export type MemoryConsolidationCandidate = z.infer<typeof MemoryConsolidationCandidateSchema>;

export function countConsolidationMessages(messages: readonly ChatMessage[]): number {
  return messages.filter((message) => message.role === 'user' || message.role === 'assistant').length;
}

/** Counts completed player/character exchanges; a topic selection is stored as the player half. */
export function countConsolidationRounds(messages: readonly ChatMessage[]): number {
  let rounds = 0;
  let awaitingReply = false;
  for (const message of messages) {
    if (message.role === 'user') awaitingReply = true;
    else if (message.role === 'assistant' && awaitingReply) { rounds += 1; awaitingReply = false; }
  }
  return rounds;
}

export function shouldConsolidateMemories(messages: readonly ChatMessage[]): boolean {
  return countConsolidationRounds(messages) >= MEMORY_CONSOLIDATION_THRESHOLD;
}

export function buildMemoryConsolidationPrompt(messages: readonly ChatMessage[], characterId: string, characterName: string): { role: 'system' | 'user'; content: string }[] {
  const transcript = messages.filter((message) => message.role === 'user' || message.role === 'assistant').map((message, index) => `${index + 1}. ${message.role === 'user' ? '玩家' : characterName}：${message.content}`).join('\n');
  return [
    { role: 'system', content: `你是关系记忆整理器。只根据提供的对话，返回严格 JSON 数组，最多 3 条。每条必须包含 target、text、type、importance。target 必须是 ${characterId}。只记录未来仍有用、可由对话直接支持的事实；不要记录寒暄、临时情绪、推测或没有依据的内容。type 只能是 interaction、promise、preference、event、observation、other；importance 只能是 low、normal、high、critical。没有值得保存的内容时返回 []。` },
    { role: 'user', content: transcript },
  ];
}

export function parseMemoryConsolidationResponse(raw: string): MemoryConsolidationCandidate[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { return []; }
  const result = MemoryConsolidationResponseSchema.safeParse(parsed);
  return result.success ? result.data : [];
}
