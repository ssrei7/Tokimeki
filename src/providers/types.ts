import { z } from 'zod';

export const TASK_IDS = [
  'narrate_main', 'narrate_daily', 'topic_tree', 'world_morning', 'world_gen',
  'map_gen', 'npc_batch', 'extract_ops', 'summarize_memory', 'summarize_day', 'summarize_chapter', 'image', 'tts',
] as const;
export const TaskIdSchema = z.enum(TASK_IDS);
export type TaskId = z.infer<typeof TaskIdSchema>;

export const ProviderKindSchema = z.enum(['openai-compatible', 'anthropic', 'gemini', 'generic', 'mock']);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;
export const ProviderOutputModeSchema = z.enum(['auto', 'json_schema', 'json_object', 'off']);
export type ProviderOutputMode = z.infer<typeof ProviderOutputModeSchema>;

export const ProviderConfigSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), kind: ProviderKindSchema,
  endpoint: z.string().url(), apiKey: z.string().optional(), model: z.string().min(1),
  contextWindow: z.number().int().positive().default(8192), maxOutputTokens: z.number().int().positive().default(1024),
  temperature: z.number().min(0).max(2).default(0.7), headers: z.record(z.string(), z.string()).optional(),
  outputMode: ProviderOutputModeSchema.optional(),
  bodyTemplate: z.string().optional(), responsePath: z.string().optional(), streamFraming: z.enum(['sse', 'ndjson', 'json']).optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderModelListConfigSchema = ProviderConfigSchema.extend({
  model: z.string().default(''),
});

export const ProviderBindingSchema = z.object({ taskId: TaskIdSchema, providerId: z.string().min(1) });
export type ProviderBinding = z.infer<typeof ProviderBindingSchema>;

export const ProviderSettingSchema = z.object({ key: z.enum(['defaultProviderId', 'chatPlayerLabel']), value: z.string().min(1) });
export type ProviderSetting = z.infer<typeof ProviderSettingSchema>;

export const EmbeddingConfigSchema = z.object({
  id: z.literal('embedding').default('embedding'),
  enabled: z.boolean().default(false),
  endpoint: z.string().default(''),
  apiKey: z.string().optional(),
  model: z.string().default(''),
  headers: z.record(z.string(), z.string()).optional(),
  requestCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),
  lastStatus: z.enum(['idle', 'success', 'error']).default('idle'),
  lastError: z.string().optional(),
  lastCalledAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
}).superRefine((config, context) => {
  if (!config.enabled) return;
  if (!config.endpoint.trim()) context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Embedding endpoint is required.' });
  else { try { new URL(config.endpoint); } catch { context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Embedding endpoint must be a valid URL.' }); } }
  if (!config.model.trim()) context.addIssue({ code: 'custom', path: ['model'], message: 'Embedding model is required.' });
});
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;

export const TtsFormatSchema = z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']);
export type TtsFormat = z.infer<typeof TtsFormatSchema>;

export const TtsConfigSchema = z.object({
  id: z.literal('tts').default('tts'),
  enabled: z.boolean().default(false),
  endpoint: z.string().default(''),
  apiKey: z.string().optional(),
  model: z.string().default(''),
  voice: z.string().default('alloy'),
  format: TtsFormatSchema.default('mp3'),
  requestCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),
  lastStatus: z.enum(['idle', 'requesting', 'success', 'error']).default('idle'),
  lastError: z.string().optional(),
  lastCalledAt: z.string().datetime().optional(),
  pendingRequest: z.object({ requestId: z.string().min(1), characterId: z.string().min(1), text: z.string().min(1) }).optional(),
  updatedAt: z.string().datetime(),
}).superRefine((config, context) => {
  if (!config.enabled) return;
  if (!config.endpoint.trim()) context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Speech endpoint is required.' });
  else { try { new URL(config.endpoint); } catch { context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Speech endpoint must be a valid URL.' }); } }
  if (!config.model.trim()) context.addIssue({ code: 'custom', path: ['model'], message: 'Speech model is required.' });
  if (!config.voice.trim()) context.addIssue({ code: 'custom', path: ['voice'], message: 'Speech voice is required.' });
});
export type TtsConfig = z.infer<typeof TtsConfigSchema>;

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatRequest { messages: ChatMessage[]; stream?: boolean; taskId?: TaskId; outputMode?: ProviderOutputMode }
export interface PreparedRequest { url: string; init: RequestInit }

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  prepare(config: ProviderConfig, request: ChatRequest): PreparedRequest;
  extractText(config: ProviderConfig, payload: unknown): string | null;
  extractStreamText(config: ProviderConfig, chunk: string): string | null;
  stream?(config: ProviderConfig, request: ChatRequest): AsyncIterable<string>;
  listModels?(config: ProviderConfig, fetchImpl?: typeof fetch): Promise<string[]>;
}

export type ConnectionErrorKind = 'cors' | 'unauthorized' | 'not_found' | 'timeout' | 'format' | 'network' | 'unknown';
export interface ConnectionTestResult {
  ok: boolean; kind: 'ok' | ConnectionErrorKind; message: string; status?: number; suggestion?: string; latencyMs: number;
}
