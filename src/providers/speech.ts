import type { TtsConfig, TtsFormat } from './types';

export interface SpeechResult {
  blob: Blob;
  format: TtsFormat;
  mimeType: string;
}

export class SpeechProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeechProviderError';
  }
}

const MIME_TYPES: Record<TtsFormat, string> = {
  mp3: 'audio/mpeg', opus: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', pcm: 'audio/pcm',
};

/** Call an explicitly configured OpenAI-compatible speech endpoint once. */
export async function synthesizeSpeech(config: TtsConfig, text: string, options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<SpeechResult> {
  const input = text.trim();
  if (!config.enabled) throw new SpeechProviderError('语音 API 尚未启用。');
  if (!input) throw new SpeechProviderError('语音文本不能为空。');
  const parsed = new URL(config.endpoint);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(parsed.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({ model: config.model, input, voice: config.voice, response_format: config.format }),
    signal: options.signal,
  });
  if (!response.ok) throw new SpeechProviderError(`语音请求失败（HTTP ${response.status}）。`);
  const blob = await response.blob();
  if (!blob.size) throw new SpeechProviderError('语音响应为空。');
  return { blob: blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: MIME_TYPES[config.format] }), format: config.format, mimeType: blob.type || MIME_TYPES[config.format] };
}
