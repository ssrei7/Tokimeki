export type MobilePlatform = 'ios' | 'android' | 'other';
export type AppDisplayMode = 'standalone' | 'browser';

export type MobileCapabilityInputs = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  navigatorStandalone: boolean;
  displayModeStandalone: boolean;
  secureContext: boolean;
  notificationApi: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  serviceWorkerApi: boolean;
  serviceWorkerControlled: boolean;
  pushManagerApi: boolean;
  backgroundSyncApi: boolean;
  periodicSyncApi: boolean;
  mediaSessionApi: boolean;
  storagePersistApi: boolean;
  wakeLockApi: boolean;
};

export type MobileCapabilityReport = MobileCapabilityInputs & {
  platformFamily: MobilePlatform;
  displayMode: AppDisplayMode;
};

export function platformFamily(input: Pick<MobileCapabilityInputs, 'userAgent' | 'platform' | 'maxTouchPoints'>): MobilePlatform {
  if (/Android/i.test(input.userAgent)) return 'android';
  if (/iPad|iPhone|iPod/i.test(input.userAgent) || (input.platform === 'MacIntel' && input.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

export function assessMobileCapabilities(input: MobileCapabilityInputs): MobileCapabilityReport {
  return {
    ...input,
    platformFamily: platformFamily(input),
    displayMode: input.navigatorStandalone || input.displayModeStandalone ? 'standalone' : 'browser',
  };
}

export function readMobileCapabilities(): MobileCapabilityReport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return assessMobileCapabilities({
      userAgent: '', platform: '', maxTouchPoints: 0, navigatorStandalone: false, displayModeStandalone: false,
      secureContext: false, notificationApi: false, notificationPermission: 'unsupported', serviceWorkerApi: false,
      serviceWorkerControlled: false, pushManagerApi: false, backgroundSyncApi: false, periodicSyncApi: false,
      mediaSessionApi: false, storagePersistApi: false, wakeLockApi: false,
    });
  }
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return assessMobileCapabilities({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    navigatorStandalone: navigatorWithStandalone.standalone === true,
    displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    secureContext: window.isSecureContext,
    notificationApi: 'Notification' in window,
    notificationPermission: 'Notification' in window ? Notification.permission : 'unsupported',
    serviceWorkerApi: 'serviceWorker' in navigator,
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    pushManagerApi: 'PushManager' in window,
    backgroundSyncApi: 'SyncManager' in window,
    periodicSyncApi: 'PeriodicSyncManager' in window,
    mediaSessionApi: 'mediaSession' in navigator,
    storagePersistApi: typeof navigator.storage?.persist === 'function',
    wakeLockApi: 'wakeLock' in navigator,
  });
}

export function notificationCapabilityLabel(report: MobileCapabilityReport): string {
  if (!report.secureContext) return '需要 HTTPS / 安全上下文';
  if (!report.notificationApi) return '当前环境不支持';
  if (report.notificationPermission === 'granted') return '已授权';
  if (report.notificationPermission === 'denied') return '已拒绝';
  return '尚未请求';
}

export function serviceWorkerCapabilityLabel(report: MobileCapabilityReport): string {
  if (!report.serviceWorkerApi) return '当前环境不支持';
  return report.serviceWorkerControlled ? '当前页面已受控' : 'API 可用，当前页面未受控';
}
