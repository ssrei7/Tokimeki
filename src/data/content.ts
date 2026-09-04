import { z } from 'zod';

const Id = z.string().min(1);

export const CharacterCardSchema = z.object({
  id: Id, name: z.string().min(1), description: z.string().default(''), personality: z.string().default(''),
  scenario: z.string().optional(), firstMes: z.string().optional(), exampleDialogue: z.string().optional(),
  updatedAt: z.string().datetime(),
});
export type CharacterCard = z.infer<typeof CharacterCardSchema>;

export const WorldbookEntrySchema = z.object({
  id: Id, name: z.string().min(1), content: z.string(), keys: z.array(z.string()).default([]), enabled: z.boolean().default(true), priority: z.number().int().default(50),
});
export type WorldbookEntry = z.infer<typeof WorldbookEntrySchema>;

export const PresetSchema = z.object({
  id: Id, name: z.string().min(1), systemPrompt: z.string().default(''), temperature: z.number().min(0).max(2).default(0.7), maxOutputTokens: z.number().int().positive().default(1024),
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

export const ChatMessageSchema = z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string() });
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export const ChatRecordSchema = z.object({ characterId: Id, messages: z.array(ChatMessageSchema), updatedAt: z.string().datetime() });
export type ChatRecord = z.infer<typeof ChatRecordSchema>;
