import { z } from 'zod';
import { TopicTreeSchema, type TopicTree } from '../../data/schema/save';

export function parseGeneratedTopicTree(text: string, charId: string, nodeId: string, day: number): TopicTree {
  const raw = extractJson(text);
  const candidate = normalizePayload(raw, charId, nodeId, day);
  const parsed = TopicTreeSchema.parse(candidate);
  if (parsed.topics.length < 4 || parsed.topics.length > 8) throw new Error(`话题数量必须在 4–8 个之间，当前为 ${parsed.topics.length} 个。`);
  if (parsed.charId !== charId || parsed.nodeId !== nodeId) throw new Error('话题树角色或地点与当前场景不一致。');
  if (parsed.generatedDay !== day) throw new Error('话题树生成日期与当前游戏日不一致。');
  const ids = new Set<string>();
  for (const topic of parsed.topics) {
    if (ids.has(topic.id)) throw new Error(`话题 ID 重复：${topic.id}。`);
    ids.add(topic.id);
    for (const unlockId of topic.unlocks ?? []) if (!ids.has(unlockId) && !parsed.topics.some((candidateTopic) => candidateTopic.id === unlockId)) throw new Error(`话题 ${topic.id} 解锁了不存在的话题 ${unlockId}。`);
  }
  return parsed;
}

function normalizePayload(raw: unknown, charId: string, nodeId: string, day: number): unknown {
  if (Array.isArray(raw)) return { charId, nodeId, topics: raw, generatedDay: day };
  if (!raw || typeof raw !== 'object') return raw;
  const record = raw as Record<string, unknown>;
  for (const key of ['topicTree', 'tree', 'result', 'data', 'output']) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) return normalizePayload(nested, charId, nodeId, day);
  }
  const topics = Array.isArray(record.topics) ? record.topics.map((topic) => {
    if (!topic || typeof topic !== 'object' || Array.isArray(topic)) return topic;
    const candidate = topic as Record<string, unknown>;
    return { ...candidate, ...(candidate.require === null ? { require: undefined } : {}), ...(candidate.usedResponse === null ? { usedResponse: undefined } : {}) };
  }) : record.topics;
  return { ...record, ...(topics ? { topics } : {}), charId: record.charId ?? charId, nodeId: record.nodeId ?? nodeId, generatedDay: record.generatedDay ?? day };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(trimmed); } catch {
    const objectStart = trimmed.indexOf('{'); const objectEnd = trimmed.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
    const arrayStart = trimmed.indexOf('['); const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
    throw new Error('话题树生成结果不是有效 JSON。');
  }
}
