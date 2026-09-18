import { describe, expect, it, vi } from 'vitest';
import { buildImageEditRequest, buildImageRequest, generateImage, openAiImageEditUrl, openAiImageUrl } from '../src/providers/image';
import { ImageConfigSchema, type ProviderConfig } from '../src/providers/types';

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

  it('builds an OpenAI-compatible multipart edit request only when reference mode is enabled', () => {
    expect(openAiImageEditUrl('https://example.com/v1')).toBe('https://example.com/v1/images/edits');
    const reference = new Blob(['face'], { type: 'image/png' });
    const request = buildImageEditRequest(config, '角色立绘', reference, { responseFormat: 'b64_json', referenceMode: 'openai-edits', quality: 'high' });
    expect(request.url).toBe('https://example.com/v1/images/edits');
    expect(request.init.headers).toMatchObject({ authorization: 'Bearer secret', 'X-Client': 'tokimeki' });
    expect(request.init.headers).not.toHaveProperty('content-type');
    const body = request.init.body as FormData;
    expect(body.get('model')).toBe('gpt-image-1');
    expect(body.get('prompt')).toBe('角色立绘');
    expect(body.get('response_format')).toBe('b64_json');
    expect(body.get('quality')).toBe('high');
    expect(body.get('image')).toBeInstanceOf(Blob);
  });

  it('falls back to generations when a reference image is supplied without edit capability', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
      expect(init.body).toContain('角色立绘');
      return new Response(JSON.stringify({ data: [{ url: 'https://example.com/generated.png' }] }), { status: 200 });
    });
    await expect(generateImage(config, '角色立绘', { referenceImage: new Blob(['face']), referenceMode: 'none' }, fetchImpl)).resolves.toEqual({ url: 'https://example.com/generated.png' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the configured edits endpoint when reference capability is enabled', async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://images.example.com/custom-edits');
      expect(init.body).toBeInstanceOf(FormData);
      return new Response(JSON.stringify({ data: [{ b64_json: 'edited' }] }), { status: 200 });
    });
    await expect(generateImage(config, '锁定角色面部', { referenceImage: new Blob(['face']), referenceMode: 'openai-edits', editEndpoint: 'https://images.example.com/custom-edits', responseFormat: 'b64_json' }, fetchImpl)).resolves.toEqual({ base64: 'edited' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('submits multiple reference images as repeated image fields', () => {
    const request = buildImageEditRequest(config, '双人互动', [new Blob(['face-a']), new Blob(['face-b'])], { referenceMode: 'openai-edits' });
    const body = request.init.body as FormData;
    expect(body.getAll('image')).toHaveLength(2);
    expect(body.get('image')).toBeInstanceOf(Blob);
  });

  it('validates local image settings without changing SaveFile schema', () => {
    expect(ImageConfigSchema.parse({ id: 'image', size: '1024x1024', responseFormat: 'b64_json', referenceMode: 'none', requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: new Date().toISOString() }).id).toBe('image');
    expect(() => ImageConfigSchema.parse({ id: 'image', size: '1024x1024', responseFormat: 'url', referenceMode: 'openai-edits', editEndpoint: 'not-a-url', requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: new Date().toISOString() })).toThrow('端点');
  });

  it('rejects empty prompts and malformed responses', async () => {
    expect(() => buildImageRequest(config, '  ')).toThrow('prompt');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{}] }), { status: 200 }));
    await expect(generateImage(config, 'x', {}, fetchImpl)).rejects.toThrow('没有可用图像');
  });
});
