import { getAdapter } from './adapters';
import { ProviderModelListConfigSchema, type ProviderConfig } from './types';

export async function listProviderModels(config: ProviderConfig, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const parsed = ProviderModelListConfigSchema.parse(config);
  const adapter = getAdapter(parsed.kind);
  if (!adapter.listModels) throw new Error('此渠道不提供标准模型列表，请手动填写模型名。');
  return adapter.listModels(parsed, fetchImpl);
}
