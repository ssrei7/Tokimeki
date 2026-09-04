import type { ProviderAdapter, ProviderKind } from '../types';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { genericAdapter } from './generic';
import { mockAdapter } from './mock';
import { openAiAdapter } from './openai';

export const adapters: Record<ProviderKind, ProviderAdapter> = { 'openai-compatible': openAiAdapter, anthropic: anthropicAdapter, gemini: geminiAdapter, generic: genericAdapter, mock: mockAdapter };
export function getAdapter(kind: ProviderKind): ProviderAdapter { return adapters[kind]; }
