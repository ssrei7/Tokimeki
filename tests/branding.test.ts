import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_NAME, PRODUCT_NAME, resolveAppDisplayName } from '../src/ui/branding';

describe('product branding', () => {
  it('uses 小小地图 as the default while preserving real user custom names', () => {
    expect(PRODUCT_NAME).toBe('小小地图');
    expect(DEFAULT_APP_NAME).toBe('小小地图');
    expect(resolveAppDisplayName()).toBe('小小地图');
    expect(resolveAppDisplayName('Tokimeki')).toBe('小小地图');
    expect(resolveAppDisplayName(' 我的标题 ')).toBe('我的标题');
  });

  it('publishes the same PWA, browser and desktop display name', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8')) as { name: string; short_name: string };
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const tauri = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')) as { productName: string; app: { windows: Array<{ title: string }> } };

    expect(manifest).toMatchObject({ name: '小小地图', short_name: '小小地图' });
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="小小地图" />');
    expect(html).toContain('<title>小小地图</title>');
    expect(tauri.productName).toBe('小小地图');
    expect(tauri.app.windows[0]?.title).toBe('小小地图');
  });
});
