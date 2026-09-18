import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { GENERATION_COMPLETE_NOTIFICATION, readLocalNotificationSettings, requestLocalNotificationPermission, showGenerationCompleteNotification, writeLocalNotificationSettings, type LocalNotificationRuntime } from '../src/ui/local-notifications';

function runtime(overrides: Partial<LocalNotificationRuntime> = {}) {
  const showNotification = vi.fn(async () => undefined);
  const value: LocalNotificationRuntime = {
    secureContext: true,
    permission: 'granted',
    visibilityState: 'hidden',
    requestPermission: vi.fn(async () => 'granted'),
    ensureRegistration: vi.fn(async () => ({ scope: 'https://example.test/app/', showNotification })),
    ...overrides,
  };
  return { value, showNotification };
}

describe('local completion notifications', () => {
  it('reads safe defaults and persists only local display preferences', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    expect(readLocalNotificationSettings(storage)).toEqual({ enabled: false, generationComplete: true });
    writeLocalNotificationSettings({ enabled: true, generationComplete: true }, storage);
    expect(readLocalNotificationSettings(storage)).toEqual({ enabled: true, generationComplete: true });
    values.set('tokimeki.localNotifications.v1', '{broken');
    expect(readLocalNotificationSettings(storage)).toEqual({ enabled: false, generationComplete: true });
  });

  it('requests permission only through the explicit enable action', async () => {
    const current = runtime({ permission: 'default' });
    expect(await requestLocalNotificationPermission(current.value)).toBe('granted');
    expect(current.value.requestPermission).toHaveBeenCalledOnce();
    expect(current.value.ensureRegistration).toHaveBeenCalledOnce();
  });

  it('notifies only when enabled and hidden, using generic lock-screen text', async () => {
    const hidden = runtime();
    expect(await showGenerationCompleteNotification({ settings: { enabled: false, generationComplete: true }, runtime: hidden.value })).toBe('disabled');
    expect(await showGenerationCompleteNotification({ settings: { enabled: true, generationComplete: true }, runtime: { ...hidden.value, visibilityState: 'visible' } })).toBe('visible');
    expect(await showGenerationCompleteNotification({ settings: { enabled: true, generationComplete: true }, runtime: hidden.value })).toBe('shown');
    expect(hidden.showNotification).toHaveBeenCalledWith(GENERATION_COMPLETE_NOTIFICATION.title, expect.objectContaining({ body: GENERATION_COMPLETE_NOTIFICATION.body, tag: 'tokimeki-generation-complete' }));
    expect(GENERATION_COMPLETE_NOTIFICATION.body).not.toMatch(/角色|消息内容|prompt|API/i);
  });

  it('never falls back to sending when permission is unavailable', async () => {
    const denied = runtime({ permission: 'denied' });
    expect(await showGenerationCompleteNotification({ settings: { enabled: true, generationComplete: true }, runtime: denied.value })).toBe('not-granted');
    expect(denied.showNotification).not.toHaveBeenCalled();
  });

  it('keeps the notification worker free of Provider and background task handlers', () => {
    const worker = readFileSync(new URL('../public/notification-sw.js', import.meta.url), 'utf8');
    expect(worker).toContain("addEventListener('notificationclick'");
    expect(worker).not.toMatch(/addEventListener\(['"](?:fetch|push|sync|periodicsync)['"]/i);
    expect(worker).not.toContain('fetch(');
  });
});
