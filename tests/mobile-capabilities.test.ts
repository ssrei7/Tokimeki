import { describe, expect, it } from 'vitest';

import { assessMobileCapabilities, notificationCapabilityLabel, platformFamily, serviceWorkerCapabilityLabel, type MobileCapabilityInputs } from '../src/ui/mobile-capabilities';

const base: MobileCapabilityInputs = {
  userAgent: '', platform: '', maxTouchPoints: 0, navigatorStandalone: false, displayModeStandalone: false,
  secureContext: true, notificationApi: true, notificationPermission: 'default', serviceWorkerApi: true,
  serviceWorkerControlled: false, pushManagerApi: true, backgroundSyncApi: false, periodicSyncApi: false,
  mediaSessionApi: true, storagePersistApi: true, wakeLockApi: false,
};

describe('mobile capability report', () => {
  it('recognizes Android, iPhone and touch iPad without treating desktop Mac as iOS', () => {
    expect(platformFamily({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe('android');
    expect(platformFamily({ userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', maxTouchPoints: 5 })).toBe('ios');
    expect(platformFamily({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios');
    expect(platformFamily({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe('other');
  });

  it('uses either standards or iOS standalone signals', () => {
    expect(assessMobileCapabilities({ ...base, displayModeStandalone: true }).displayMode).toBe('standalone');
    expect(assessMobileCapabilities({ ...base, navigatorStandalone: true }).displayMode).toBe('standalone');
    expect(assessMobileCapabilities(base).displayMode).toBe('browser');
  });

  it('reports API availability separately from permission and active control', () => {
    const report = assessMobileCapabilities(base);
    expect(notificationCapabilityLabel(report)).toBe('尚未请求');
    expect(notificationCapabilityLabel({ ...report, secureContext: false })).toBe('需要 HTTPS / 安全上下文');
    expect(notificationCapabilityLabel({ ...report, notificationPermission: 'denied' })).toBe('已拒绝');
    expect(serviceWorkerCapabilityLabel(report)).toBe('API 可用，当前页面未受控');
    expect(serviceWorkerCapabilityLabel({ ...report, serviceWorkerControlled: true })).toBe('当前页面已受控');
  });
});
