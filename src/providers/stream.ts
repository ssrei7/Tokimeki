import { getAdapter } from './adapters';
import type { ChatMessage, ProviderConfig } from './types';

export class StreamRequestError extends Error { constructor(message: string, public readonly status?: number) { super(message); this.name = 'StreamRequestError'; } }

export async function streamChat(config: ProviderConfig, messages: ChatMessage[], onDelta: (text: string) => void, options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch; const adapter = getAdapter(config.kind); const prepared = adapter.prepare(config, { messages, stream: true });
  const response = await fetchImpl(prepared.url, { ...prepared.init, signal: options.signal });
  if (!response.ok) throw new StreamRequestError(`Provider returned HTTP ${response.status}`, response.status);
  if (!response.body) { const payload = await response.json(); const text = adapter.extractText(config, payload); if (!text) throw new StreamRequestError('Provider response format is invalid'); onDelta(text); return text; }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let full = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? '';
    for (const line of lines) { const text = adapter.extractStreamText(config, line.trim()); if (text) { full += text; onDelta(text); } }
  }
  if (buffer.trim()) { const text = adapter.extractStreamText(config, buffer.trim()); if (text) { full += text; onDelta(text); } }
  return full;
}
