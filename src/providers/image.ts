import type { ProviderConfig } from './types';

export interface ImageGenerationOptions {
  size?: string;
  quality?: string;
  style?: string;
  responseFormat?: 'url' | 'b64_json';
  user?: string;
}

export interface ImageGenerationResult {
  url?: string;
  base64?: string;
  revisedPrompt?: string;
}

export function openAiImageUrl(endpoint: string): string {
  const value = endpoint.replace(/\/+$/, '');
  if (/\/images\/generations$/i.test(value)) return value;
  if (/\/chat\/completions$/i.test(value)) return value.replace(/\/chat\/completions$/i, '/images/generations');
  return `${value}/images/generations`;
}

export function buildImageRequest(config: ProviderConfig, prompt: string, options: ImageGenerationOptions = {}): { url: string; init: RequestInit } {
  const input = prompt.trim();
  if (!input) throw new Error('Image prompt cannot be empty.');
  const body: Record<string, unknown> = { model: config.model, prompt: input, n: 1, size: options.size ?? '1024x1024', response_format: options.responseFormat ?? 'url' };
  if (options.quality) body.quality = options.quality;
  if (options.style) body.style = options.style;
  if (options.user) body.user = options.user;
  return { url: openAiImageUrl(config.endpoint), init: { method: 'POST', headers: { 'content-type': 'application/json', ...(config.headers ?? {}), ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) }, body: JSON.stringify(body) } };
}

export async function generateImage(config: ProviderConfig, prompt: string, options: ImageGenerationOptions = {}, fetchImpl: typeof fetch = fetch): Promise<ImageGenerationResult> {
  const request = buildImageRequest(config, prompt, options);
  const response = await fetchImpl(request.url, request.init);
  if (!response.ok) throw new Error(`图像生成请求失败（HTTP ${response.status}）`);
  const payload = await response.json() as { data?: Array<{ url?: unknown; b64_json?: unknown; revised_prompt?: unknown }> };
  const item = payload.data?.[0];
  if (!item || (typeof item.url !== 'string' && typeof item.b64_json !== 'string')) throw new Error('图像 Provider 返回中没有可用图像。');
  return { url: typeof item.url === 'string' ? item.url : undefined, base64: typeof item.b64_json === 'string' ? item.b64_json : undefined, revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined };
}

