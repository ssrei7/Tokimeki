import { z } from 'zod';
import { EventDefSchema } from './schema/save';

const Id = z.string().min(1);

export const CharacterCardSchema = z.object({
  id: Id, name: z.string().min(1), description: z.string().default(''), personality: z.string().default(''),
  scenario: z.string().optional(), firstMes: z.string().optional(), exampleDialogue: z.string().optional(),
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

export const DialogueKindSchema = z.enum(['dialogue', 'narration']);
export type DialogueKind = z.infer<typeof DialogueKindSchema>;
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  kind: DialogueKindSchema.optional(),
  speakerId: Id.optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export const ChatRecordSchema = z.object({ characterId: Id, messages: z.array(ChatMessageSchema), updatedAt: z.string().datetime() });
export type ChatRecord = z.infer<typeof ChatRecordSchema>;

export const EventPackageSchema = z.object({
  id: Id,
  name: z.string().min(1),
  events: z.array(EventDefSchema).min(1).max(500),
  updatedAt: z.string().datetime().optional(),
});
export type EventPackage = z.infer<typeof EventPackageSchema>;
