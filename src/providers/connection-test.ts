import { getAdapter } from './adapters';
import type { ConnectionTestResult, ProviderConfig } from './types';

export async function testProviderConnection(provider: ProviderConfig, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<ConnectionTestResult> {
  const fetchImpl = options.fetchImpl ?? fetch; const timeoutMs = options.timeoutMs ?? 10_000; const started = Date.now(); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const adapter = getAdapter(provider.kind);
    if (adapter.stream) {
      let text = '';
      for await (const chunk of adapter.stream(provider, { messages: [{ role: 'user', content: 'ping' }], stream: false, taskId: 'narrate_main' })) text += adapter.extractStreamText(provider, chunk) ?? '';
      const latencyMs = Date.now() - started;
      return text ? { ok: true, kind: 'ok', message: '连接成功', latencyMs } : failure('format', '响应格式不符合适配器预期', latencyMs);
    }
    const prepared = adapter.prepare(provider, { messages: [{ role: 'user', content: 'ping' }], stream: false }); const response = await fetchImpl(prepared.url, { ...prepared.init, signal: controller.signal }); const latencyMs = Date.now() - started;
    if (response.status === 401 || response.status === 403) return failure('unauthorized', '认证失败（401/403）', latencyMs, response.status, '检查 API key、权限和请求头。');
    if (response.status === 404) return failure('not_found', '端点不存在（404）', latencyMs, response.status, '检查 endpoint URL 和模型服务路径。');
    if (!response.ok) return failure('network', `服务返回 HTTP ${response.status}`, latencyMs, response.status, '检查服务状态与 endpoint 配置。');
    let payload: unknown; try { payload = await response.json(); } catch { return failure('format', '响应不是有效 JSON', latencyMs, response.status, '检查适配器类型或通用适配器响应路径。'); }
    if (!adapter.extractText(provider, payload)) return failure('format', '响应格式不符合适配器预期', latencyMs, response.status, '检查适配器类型、响应路径与模型返回格式。');
    return { ok: true, kind: 'ok', message: '连接成功', latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error instanceof DOMException && error.name === 'AbortError') return failure('timeout', '连接超时', latencyMs, undefined, '检查网络、endpoint 响应时间或增大超时。');
    if (error instanceof TypeError) return failure('cors', '请求被浏览器拦截，可能是 CORS', latencyMs, undefined, '确认服务允许浏览器直连，或使用支持 CORS 的中转/桌面版。');
    return failure('unknown', '连接测试失败', latencyMs, undefined, '检查 provider 配置与浏览器控制台。');
  } finally { clearTimeout(timeout); }
}

function failure(kind: ConnectionTestResult['kind'], message: string, latencyMs: number, status?: number, suggestion?: string): ConnectionTestResult { return { ok: false, kind, message, latencyMs, ...(status === undefined ? {} : { status }), ...(suggestion ? { suggestion } : {}) }; }
