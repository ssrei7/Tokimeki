export const LOCAL_NOTIFICATION_STORAGE_KEY = 'tokimeki.localNotifications.v1';

export type LocalNotificationSettings = {
  enabled: boolean;
  generationComplete: boolean;
};

export type NotificationRegistrationLike = {
  scope: string;
  showNotification: (title: string, options?: NotificationOptions) => Promise<void>;
};

export type LocalNotificationRuntime = {
  secureContext: boolean;
  permission: NotificationPermission | 'unsupported';
  visibilityState: DocumentVisibilityState;
  requestPermission: () => Promise<NotificationPermission>;
  ensureRegistration: () => Promise<NotificationRegistrationLike>;
};

export type NotificationDelivery = 'shown' | 'disabled' | 'visible' | 'unsupported' | 'not-granted' | 'failed';

export const DEFAULT_LOCAL_NOTIFICATION_SETTINGS: LocalNotificationSettings = Object.freeze({ enabled: false, generationComplete: true });
export const GENERATION_COMPLETE_NOTIFICATION = Object.freeze({ title: 'Tokimeki', body: '回复已经生成，返回应用查看。' });

export function readLocalNotificationSettings(storage?: Pick<Storage, 'getItem'>): LocalNotificationSettings {
  if (!storage) {
    if (typeof window === 'undefined') return { ...DEFAULT_LOCAL_NOTIFICATION_SETTINGS };
    storage = window.localStorage;
  }
  try {
    const parsed = JSON.parse(storage.getItem(LOCAL_NOTIFICATION_STORAGE_KEY) ?? '{}') as Partial<LocalNotificationSettings>;
    return {
      enabled: parsed.enabled === true,
      generationComplete: parsed.generationComplete !== false,
    };
  } catch {
    return { ...DEFAULT_LOCAL_NOTIFICATION_SETTINGS };
  }
}

export function writeLocalNotificationSettings(settings: LocalNotificationSettings, storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  storage.setItem(LOCAL_NOTIFICATION_STORAGE_KEY, JSON.stringify(settings));
}

export function browserNotificationRuntime(): LocalNotificationRuntime | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined') return undefined;
  if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator)) return undefined;
  return {
    secureContext: window.isSecureContext,
    permission: Notification.permission,
    visibilityState: document.visibilityState,
    requestPermission: () => Notification.requestPermission(),
    ensureRegistration: async () => {
      await navigator.serviceWorker.register(new URL('notification-sw.js', document.baseURI).href);
      return navigator.serviceWorker.ready;
    },
  };
}

export async function requestLocalNotificationPermission(runtime = browserNotificationRuntime()): Promise<NotificationPermission | 'unsupported'> {
  if (!runtime?.secureContext || runtime.permission === 'unsupported') return 'unsupported';
  const permission = runtime.permission === 'default' ? await runtime.requestPermission() : runtime.permission;
  if (permission === 'granted') await runtime.ensureRegistration();
  return permission;
}

export async function showGenerationCompleteNotification(input: {
  settings?: LocalNotificationSettings;
  force?: boolean;
  runtime?: LocalNotificationRuntime;
} = {}): Promise<NotificationDelivery> {
  const settings = input.settings ?? readLocalNotificationSettings();
  const runtime = input.runtime ?? browserNotificationRuntime();
  if (!input.force && (!settings.enabled || !settings.generationComplete)) return 'disabled';
  if (!runtime?.secureContext || runtime.permission === 'unsupported') return 'unsupported';
  if (runtime.permission !== 'granted') return 'not-granted';
  if (!input.force && runtime.visibilityState !== 'hidden') return 'visible';
  try {
    const registration = await runtime.ensureRegistration();
    await registration.showNotification(GENERATION_COMPLETE_NOTIFICATION.title, {
      body: GENERATION_COMPLETE_NOTIFICATION.body,
      icon: new URL('icons/icon-192.png', registration.scope).href,
      badge: new URL('icons/icon-192.png', registration.scope).href,
      tag: 'tokimeki-generation-complete',
      data: { url: registration.scope },
    });
    return 'shown';
  } catch {
    return 'failed';
  }
}
