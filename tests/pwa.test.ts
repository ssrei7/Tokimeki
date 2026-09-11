import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA shell', () => {
  it('declares a standalone portrait manifest with an existing icon', () => {
    const manifestPath = resolve(process.cwd(), 'public/manifest.webmanifest');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      display?: string;
      orientation?: string;
      background_color?: string;
      icons?: Array<{ src: string }>;
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait-primary');
    expect(manifest.background_color).toBe('#fafafa');
    expect(manifest.icons?.length).toBeGreaterThan(0);
    expect(existsSync(resolve(process.cwd(), 'public', manifest.icons?.[0]?.src ?? ''))).toBe(true);
  });

  it('links the manifest and enables safe-area standalone metadata', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('maximum-scale=1.0');
    expect(html).toContain('user-scalable=no');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('theme-color');
  });

  it('keeps the app shell stable across standalone viewport heights', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/ui/theme/app.css'), 'utf8');
    const themeCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('min-height: 100svh');
    expect(css).toContain('height: 100dvh');
    expect(css).toContain('var(--safe-area-top)');
    expect(css).toContain('var(--safe-area-bottom)');
    expect(css).toContain('touch-action: pan-y');
    expect(css).toContain('@media (max-width: 699px)');
    expect(css).toContain('.screen input, .screen textarea, .screen select { font-size: 16px; }');
    expect(themeCss).toContain('--safe-area-top: env(safe-area-inset-top, 0px);');
    expect(themeCss).toContain('--safe-area-bottom: env(safe-area-inset-bottom, 0px);');
    expect(themeCss).toContain('background: var(--gray-25);');
  });
});
