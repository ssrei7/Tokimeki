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

export const ProviderSettingSchema = z.object({ key: z.enum(['defaultProviderId', 'defaultTtsProviderId', 'chatPlayerLabel']), value: z.string().min(1) });
export type ProviderSetting = z.infer<typeof ProviderSettingSchema>;

export const ImageReferenceModeSchema = z.enum(['none', 'openai-edits']);
export type ImageReferenceMode = z.infer<typeof ImageReferenceModeSchema>;

export const ImageResponseFormatSchema = z.enum(['url', 'b64_json']);
export type ImageResponseFormat = z.infer<typeof ImageResponseFormatSchema>;

export const ImageConfigSchema = z.object({
  id: z.literal('image').default('image'),
  providerId: z.string().min(1).optional(),
  size: z.string().min(1).default('1024x1024'),
  quality: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  responseFormat: ImageResponseFormatSchema.default('b64_json'),
  referenceMode: ImageReferenceModeSchema.default('none'),
  editEndpoint: z.string().optional(),
  requestCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),
  lastStatus: z.enum(['idle', 'requesting', 'success', 'error']).default('idle'),
  lastError: z.string().optional(),
  lastCalledAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
}).superRefine((config, context) => {
  if (!config.editEndpoint?.trim()) return;
  try { new URL(config.editEndpoint); }
  catch { context.addIssue({ code: 'custom', path: ['editEndpoint'], message: '图像 edits 端点必须是有效 URL。' }); }
});
export type ImageConfig = z.infer<typeof ImageConfigSchema>;

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
  id: z.string().min(1).default('tts'),
  name: z.string().min(1).default('默认语音'),
  enabled: z.boolean().default(false),
  endpoint: z.string().default(''),
  apiKey: z.string().optional(),
  model: z.string().default(''),
  voice: z.string().default('alloy'),
  format: TtsFormatSchema.default('mp3'),
  headers: z.record(z.string(), z.string()).optional(),
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

export const CharacterProviderBindingSchema = z.object({
  id: z.string().min(1),
  saveId: z.string().min(1),
  characterId: z.string().min(1),
  providerId: z.string().min(1).optional(),
  ttsProviderId: z.string().min(1).optional(),
}).refine((binding) => Boolean(binding.providerId || binding.ttsProviderId), { message: 'Character binding must select at least one provider.' });
export type CharacterProviderBinding = z.infer<typeof CharacterProviderBindingSchema>;

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
