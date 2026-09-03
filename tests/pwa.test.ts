import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA shell', () => {
  it('declares a standalone portrait manifest with an existing icon', () => {
    const manifestPath = resolve(process.cwd(), 'public/manifest.webmanifest');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      display?: string;
      orientation?: string;
      icons?: Array<{ src: string }>;
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait-primary');
    expect(manifest.icons?.length).toBeGreaterThan(0);
    expect(existsSync(resolve(process.cwd(), 'public', manifest.icons?.[0]?.src ?? ''))).toBe(true);
  });

  it('links the manifest and enables safe-area standalone metadata', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('theme-color');
  });
});
