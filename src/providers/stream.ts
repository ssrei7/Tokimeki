import { getAdapter } from './adapters';
import type { ChatMessage, ProviderConfig, TaskId } from './types';

export class StreamRequestError extends Error { constructor(message: string, public readonly status?: number) { super(message); this.name = 'StreamRequestError'; } }
export type StreamStatus = 'requesting' | 'generating' | 'success' | 'error';

export async function streamChat(config: ProviderConfig, messages: ChatMessage[], onDelta: (text: string) => void, options: { fetchImpl?: typeof fetch; signal?: AbortSignal; onStatus?: (status: StreamStatus) => void; taskId?: TaskId } = {}): Promise<string> {
  options.onStatus?.('requesting');
  try {
    const fetchImpl = options.fetchImpl ?? fetch; const adapter = getAdapter(config.kind); const request = { messages, stream: true, taskId: options.taskId };
    let hasStarted = false;
    const emit = (text: string) => { if (!hasStarted) { hasStarted = true; options.onStatus?.('generating'); } onDelta(text); };
    if (adapter.stream) {
      let full = '';
      for await (const chunk of adapter.stream(config, request)) {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const text = adapter.extractStreamText(config, chunk);
        if (text) { full += text; emit(text); }
      }
      if (!full.trim()) throw new StreamRequestError('Provider returned no readable text');
      options.onStatus?.('success'); return full;
    }
    const prepared = adapter.prepare(config, request);
    const response = await fetchImpl(prepared.url, { ...prepared.init, signal: options.signal });
    if (!response.ok) throw new StreamRequestError(`Provider returned HTTP ${response.status}`, response.status);
    if (!response.body) { const payload = await response.json(); const text = adapter.extractText(config, payload); if (!text) throw new StreamRequestError('Provider response format is invalid'); emit(text); options.onStatus?.('success'); return text; }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let full = ''; let raw = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break; const chunk = decoder.decode(value, { stream: true }); raw += chunk; buffer += chunk;
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? '';
      for (const line of lines) { const text = adapter.extractStreamText(config, line.trim()); if (text) { full += text; emit(text); } }
    }
    if (buffer.trim()) { const text = adapter.extractStreamText(config, buffer.trim()); if (text) { full += text; emit(text); } }
    if (!full.trim()) { try { const fallback = adapter.extractText(config, JSON.parse(raw)); if (fallback) { full = fallback; emit(fallback); } } catch { /* stream payload was not JSON */ } }
    if (!full.trim()) throw new StreamRequestError('Provider returned no readable text');
    options.onStatus?.('success'); return full;
  } catch (error) { options.onStatus?.('error'); throw error; }
}
