import { describe, expect, it, vi } from 'vitest';
import { buildImageRequest, generateImage, openAiImageUrl } from '../src/providers/image';
import type { ProviderConfig } from '../src/providers/types';

const config: ProviderConfig = { id: 'image', name: 'Image', kind: 'openai-compatible', endpoint: 'https://example.com/v1', apiKey: 'secret', model: 'gpt-image-1', contextWindow: 8192, maxOutputTokens: 1024, temperature: 0.7, headers: { 'X-Client': 'tokimeki' } };

describe('OpenAI-compatible image provider', () => {
  it('normalizes image generation endpoints and builds request body', () => {
    expect(openAiImageUrl('https://example.com/v1/chat/completions')).toBe('https://example.com/v1/images/generations');
    const request = buildImageRequest(config, '港口黄昏', { size: '512x512', quality: 'high', style: 'vivid' });
    expect(request.url).toBe('https://example.com/v1/images/generations');
    expect(request.init.headers).toMatchObject({ authorization: 'Bearer secret', 'X-Client': 'tokimeki' });
    expect(JSON.parse(String(request.init.body))).toMatchObject({ model: 'gpt-image-1', prompt: '港口黄昏', n: 1, size: '512x512', quality: 'high', style: 'vivid', response_format: 'url' });
  });

  it('parses URL and base64 response variants only after explicit call', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: 'abc', revised_prompt: 'revised' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(generateImage(config, '一盏灯', { responseFormat: 'b64_json' }, fetchImpl)).resolves.toEqual({ base64: 'abc', revisedPrompt: 'revised' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects empty prompts and malformed responses', async () => {
    expect(() => buildImageRequest(config, '  ')).toThrow('prompt');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{}] }), { status: 200 }));
    await expect(generateImage(config, 'x', {}, fetchImpl)).rejects.toThrow('没有可用图像');
  });
});

