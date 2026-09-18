export type ProviderProxyAssessment = {
  decision: 'do-not-implement';
  canBypassCors: false;
  guaranteesBackgroundCompletion: false;
  automaticallyRetriesRequests: false;
  allowedFutureScopes: readonly ['offline-shell', 'notification-display'];
  reasons: readonly string[];
};

export const PROVIDER_PROXY_ASSESSMENT: ProviderProxyAssessment = Object.freeze({
  decision: 'do-not-implement',
  canBypassCors: false,
  guaranteesBackgroundCompletion: false,
  automaticallyRetriesRequests: false,
  allowedFutureScopes: ['offline-shell', 'notification-display'] as const,
  reasons: [
    'Service Worker 的跨域 fetch 仍受 CORS 限制。',
    'Android 与 iOS 都可能终止 Service Worker，waitUntil 不是长期后台保证。',
    '自动重放生成请求可能造成重复计费、重复文本或重复应用 ops。',
    '持久化完整请求会扩大 API key 和敏感 prompt 的本地暴露面。',
  ] as const,
});

export function providerProxyAssessmentLabel(serviceWorkerAvailable: boolean): string {
  return serviceWorkerAvailable ? '不启用：API 存在但无法保证请求完成' : '不启用：当前环境也不支持 Service Worker';
}
