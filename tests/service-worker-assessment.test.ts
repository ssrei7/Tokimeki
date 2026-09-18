import { describe, expect, it } from 'vitest';

import { PROVIDER_PROXY_ASSESSMENT, providerProxyAssessmentLabel } from '../src/ui/service-worker-assessment';

describe('Service Worker Provider proxy assessment', () => {
  it('does not claim CORS bypass or background reliability', () => {
    expect(PROVIDER_PROXY_ASSESSMENT.decision).toBe('do-not-implement');
    expect(PROVIDER_PROXY_ASSESSMENT.canBypassCors).toBe(false);
    expect(PROVIDER_PROXY_ASSESSMENT.guaranteesBackgroundCompletion).toBe(false);
    expect(PROVIDER_PROXY_ASSESSMENT.automaticallyRetriesRequests).toBe(false);
  });

  it('keeps offline shell and notification display separate from Provider transport', () => {
    expect(PROVIDER_PROXY_ASSESSMENT.allowedFutureScopes).toEqual(['offline-shell', 'notification-display']);
    expect(providerProxyAssessmentLabel(true)).toContain('无法保证请求完成');
    expect(providerProxyAssessmentLabel(false)).toContain('不支持 Service Worker');
  });
});
