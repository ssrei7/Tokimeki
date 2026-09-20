import { getAdapter } from './adapters';
import { ProviderModelListConfigSchema, type EmbeddingConfig, type ProviderConfig } from './types';

export async function listProviderModels(config: ProviderConfig, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const parsed = ProviderModelListConfigSchema.parse(config);
  const adapter = getAdapter(parsed.kind);
  if (!adapter.listModels) throw new Error('此渠道不提供标准模型列表，请手动填写模型名。');
  return adapter.listModels(parsed, fetchImpl);
}

export async function listEmbeddingModels(config: Pick<EmbeddingConfig, 'endpoint' | 'apiKey' | 'headers'>, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  if (!config.endpoint.trim()) throw new Error('请先填写 Embedding 请求端点。');
  const parsed = ProviderModelListConfigSchema.parse({
    id: 'embedding-model-list',
    name: 'Embedding 模型列表',
    kind: 'openai-compatible',
    endpoint: config.endpoint.trim(),
    apiKey: config.apiKey,
    model: '',
    contextWindow: 1,
    maxOutputTokens: 1,
    temperature: 0,
    headers: config.headers,
  });
  const adapter = getAdapter(parsed.kind);
  if (!adapter.listModels) throw new Error('此端点不提供标准模型列表，请手动填写模型名。');
  return adapter.listModels(parsed, fetchImpl);
}
