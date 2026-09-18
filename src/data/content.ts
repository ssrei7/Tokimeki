import { z } from 'zod';
import { AssetRefSchema, CharacterVisualsSchema, EventDefSchema } from './schema/save';

const Id = z.string().min(1);

export const CharacterCardSchema = z.object({
  id: Id, name: z.string().min(1), description: z.string().default(''), personality: z.string().default(''),
  scenario: z.string().optional(), firstMes: z.string().optional(), exampleDialogue: z.string().optional(),
  packageProfile: z.object({
    visuals: CharacterVisualsSchema.optional(),
    initialAxes: z.record(z.string(), z.number()).optional(),
    giftPrefs: z.object({ likeTags: z.array(z.string()), dislikeTags: z.array(z.string()), specialItems: z.record(z.string(), z.number()) }).optional(),
    worldbookIds: z.array(Id).optional(),
  }).optional(),
  updatedAt: z.string().datetime(),
});
export type CharacterCard = z.infer<typeof CharacterCardSchema>;

export const PersonaSchema = z.object({
  id: Id,
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().default(''),
  updatedAt: z.string().datetime(),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const WorldbookEntrySchema = z.object({
  id: Id, name: z.string().min(1), content: z.string(), keys: z.array(z.string()).default([]), enabled: z.boolean().default(true), priority: z.number().int().default(50),
});
export type WorldbookEntry = z.infer<typeof WorldbookEntrySchema>;

export const PresetSchema = z.object({
  id: Id, name: z.string().min(1), systemPrompt: z.string().default(''), temperature: z.number().min(0).max(2).default(0.7), maxOutputTokens: z.number().int().positive().default(1024),
  enabled: z.boolean().default(true),
  updatedAt: z.string().datetime(),
});
export type Preset = z.infer<typeof PresetSchema>;

export const PresetBundleSchema = z.object({
  id: Id,
  name: z.string().min(1),
  entries: z.array(PresetSchema),
  updatedAt: z.string().datetime(),
});
export type PresetBundle = z.infer<typeof PresetBundleSchema>;

export const StoryScenePresetStageSchema = z.object({ id: Id, title: z.string().min(1).max(160), contentTemplate: z.string().min(1).max(10000) });
export const StoryScenePresetSchema = z.object({
  id: Id,
  name: z.string().min(1).max(160),
  titleTemplate: z.string().min(1).max(1000),
  outlineTemplate: z.string().min(1).max(10000),
  stages: z.array(StoryScenePresetStageSchema).min(1).max(50),
  builtin: z.boolean(),
  sourcePresetId: Id.optional(),
});
export type StoryScenePresetStageRecord = z.infer<typeof StoryScenePresetStageSchema>;
export type StoryScenePresetRecord = z.infer<typeof StoryScenePresetSchema>;

export const DialogueKindSchema = z.enum(['dialogue', 'narration']);
export type DialogueKind = z.infer<typeof DialogueKindSchema>;
export const VoiceAttachmentSchema = z.object({
  asset: AssetRefSchema.optional(),
  audioFormat: z.string().min(1),
  durationMs: z.number().finite().nonnegative(),
  requestId: Id,
  cacheFingerprint: z.string().min(1),
});
export type VoiceAttachment = z.infer<typeof VoiceAttachmentSchema>;
export const ChatCgAttachmentSchema = z.object({
  asset: AssetRefSchema,
  prompt: z.string().min(1),
  requestId: Id,
  characterIds: z.array(Id).min(1).max(3),
  includesPlayer: z.boolean(),
  generatedAt: z.string().datetime(),
  revisedPrompt: z.string().optional(),
});
export type ChatCgAttachment = z.infer<typeof ChatCgAttachmentSchema>;
export const ChatMessageSchema = z.object({
  id: Id.optional(),
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  kind: DialogueKindSchema.optional(),
  speakerId: Id.optional(),
  voice: VoiceAttachmentSchema.optional(),
  cg: ChatCgAttachmentSchema.optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export const ChatRecordSchema = z.object({ characterId: Id, messages: z.array(ChatMessageSchema), updatedAt: z.string().datetime() });
export type ChatRecord = z.infer<typeof ChatRecordSchema>;

export function normalizeChatMessages(characterId: string, messages: ChatMessage[]): { messages: ChatMessage[]; changed: boolean } {
  let changed = false;
  const next = messages.map((message, index) => {
    if (message.id) return message;
    changed = true;
    const unique = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    return { ...message, id: `${characterId}-chat-${unique}` };
  });
  return { messages: next, changed };
}

export const ChatRecoveryRecordSchema = z.object({
  characterId: Id,
  requestId: Id,
  status: z.enum(['draft', 'requesting', 'generating', 'interrupted', 'error']),
  input: z.string(),
  messages: z.array(ChatMessageSchema),
  baseMessages: z.array(ChatMessageSchema),
  assistantText: z.string().default(''),
  raw: z.string().default(''),
  actorId: Id.optional(),
  messageIndex: z.number().int().nonnegative().optional(),
  opsApplied: z.boolean().default(false),
  error: z.string().optional(),
  updatedAt: z.string().datetime(),
});
export type ChatRecoveryRecord = z.infer<typeof ChatRecoveryRecordSchema>;

export const MemoryVectorRecordSchema = z.object({
  id: Id,
  saveId: Id,
  characterId: Id,
  memoryId: Id,
  text: z.string(),
  providerFingerprint: z.string().min(1),
  vector: z.array(z.number().finite()).min(1),
  updatedAt: z.string().datetime(),
});
export type MemoryVectorRecord = z.infer<typeof MemoryVectorRecordSchema>;

export const MusicPlaybackModeSchema = z.enum(['sequence', 'shuffle', 'repeat-one']);
export type MusicPlaybackMode = z.infer<typeof MusicPlaybackModeSchema>;

export const MusicTrackSchema = z.object({
  id: Id,
  title: z.string().min(1).max(200),
  artist: z.string().max(200).default(''),
  url: z.string().url().refine((value) => /^https?:\/\//i.test(value), '音频地址必须是 http(s) URL'),
  updatedAt: z.string().datetime(),
});
export type MusicTrack = z.infer<typeof MusicTrackSchema>;

export const MusicStateSchema = z.object({
  id: z.literal('default'),
  tracks: z.array(MusicTrackSchema).max(500),
  currentTrackId: Id.optional(),
  mode: MusicPlaybackModeSchema.default('sequence'),
  volume: z.number().finite().min(0).max(1).default(0.8),
  positionSeconds: z.number().finite().nonnegative().default(0),
  shuffleQueue: z.array(Id).default([]),
  lastError: z.string().max(500).optional(),
  updatedAt: z.string().datetime(),
});
export type MusicState = z.infer<typeof MusicStateSchema>;

export const TerminalStickerRecordSchema = z.object({
  id: Id,
  label: z.string().max(120).optional(),
  asset: AssetRefSchema,
  createdAt: z.string().datetime(),
});
export type TerminalStickerRecord = z.infer<typeof TerminalStickerRecordSchema>;

export const EventPackageSchema = z.object({
  id: Id,
  name: z.string().min(1),
  events: z.array(EventDefSchema).min(1).max(500),
  updatedAt: z.string().datetime().optional(),
});
export type EventPackage = z.infer<typeof EventPackageSchema>;
