import type { ProviderConfig } from './types';

export interface ImageGenerationOptions {
  size?: string;
  quality?: string;
  style?: string;
  responseFormat?: 'url' | 'b64_json';
  user?: string;
  referenceImage?: Blob;
  referenceImages?: Blob[];
  referenceMode?: 'none' | 'openai-edits';
  editEndpoint?: string;
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

export function openAiImageEditUrl(endpoint: string, editEndpoint?: string): string {
  if (editEndpoint?.trim()) return editEndpoint.replace(/\/+$/, '');
  const value = endpoint.replace(/\/+$/, '');
  if (/\/images\/edits$/i.test(value)) return value;
  if (/\/images\/generations$/i.test(value)) return value.replace(/\/images\/generations$/i, '/images/edits');
  if (/\/chat\/completions$/i.test(value)) return value.replace(/\/chat\/completions$/i, '/images/edits');
  return `${value}/images/edits`;
}

function authHeaders(config: ProviderConfig): Record<string, string> {
  return { ...(config.headers ?? {}), ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) };
}

export function buildImageRequest(config: ProviderConfig, prompt: string, options: ImageGenerationOptions = {}): { url: string; init: RequestInit } {
  const input = prompt.trim();
  if (!input) throw new Error('Image prompt cannot be empty.');
  const body: Record<string, unknown> = { model: config.model, prompt: input, n: 1, size: options.size ?? '1024x1024', response_format: options.responseFormat ?? 'url' };
  if (options.quality) body.quality = options.quality;
  if (options.style) body.style = options.style;
  if (options.user) body.user = options.user;
  return { url: openAiImageUrl(config.endpoint), init: { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(config) }, body: JSON.stringify(body) } };
}

export function buildImageEditRequest(config: ProviderConfig, prompt: string, referenceImage: Blob | Blob[], options: ImageGenerationOptions = {}): { url: string; init: RequestInit } {
  const input = prompt.trim();
  const references = Array.isArray(referenceImage) ? referenceImage : [referenceImage];
  if (!input) throw new Error('Image prompt cannot be empty.');
  if (!references.length || references.some((reference) => !reference || reference.size <= 0)) throw new Error('Image reference cannot be empty.');
  const form = new FormData();
  form.set('model', config.model);
  form.set('prompt', input);
  form.set('n', '1');
  form.set('size', options.size ?? '1024x1024');
  form.set('response_format', options.responseFormat ?? 'url');
  if (options.quality) form.set('quality', options.quality);
  if (options.style) form.set('style', options.style);
  if (options.user) form.set('user', options.user);
  if (references.length === 1) form.set('image', references[0], 'reference-image');
  else references.forEach((reference, index) => form.append('image', reference, `reference-image-${index + 1}`));
  return { url: openAiImageEditUrl(config.endpoint, options.editEndpoint), init: { method: 'POST', headers: authHeaders(config), body: form } };
}

export async function generateImage(config: ProviderConfig, prompt: string, options: ImageGenerationOptions = {}, fetchImpl: typeof fetch = fetch): Promise<ImageGenerationResult> {
  const references = options.referenceImages?.length ? options.referenceImages : options.referenceImage ? [options.referenceImage] : [];
  const request = references.length && options.referenceMode === 'openai-edits'
    ? buildImageEditRequest(config, prompt, references, options)
    : buildImageRequest(config, prompt, options);
  const response = await fetchImpl(request.url, request.init);
  if (!response.ok) throw new Error(`图像生成请求失败（HTTP ${response.status}）`);
  const payload = await response.json() as { data?: Array<{ url?: unknown; b64_json?: unknown; revised_prompt?: unknown }> };
  const item = payload.data?.[0];
  if (!item || (typeof item.url !== 'string' && typeof item.b64_json !== 'string')) throw new Error('图像 Provider 返回中没有可用图像。');
  return { url: typeof item.url === 'string' ? item.url : undefined, base64: typeof item.b64_json === 'string' ? item.b64_json : undefined, revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined };
}
