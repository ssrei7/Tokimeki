import type { ProviderConfig, ProviderOutputMode } from './types';

/** Many OpenAI-compatible endpoints reject strict JSON Schema response formats. */
export function topicTreeOutputMode(config: Pick<ProviderConfig, 'kind' | 'outputMode'>): ProviderOutputMode | undefined {
  if (config.kind === 'openai-compatible' && config.outputMode !== 'off') return 'json_object';
  return config.outputMode;
}
