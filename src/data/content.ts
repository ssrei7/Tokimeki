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
