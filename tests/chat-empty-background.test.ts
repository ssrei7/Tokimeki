import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
const themeCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

describe('chat empty background', () => {
  it('uses a local default stage class only when no scene background is loaded', () => {
    expect(appSource).toContain("vn-stage ${sceneBackgroundUrl ? 'has-background' : 'default-background'}");
    expect(appSource).toContain('sceneBackgroundUrl ? { backgroundImage:');
  });

  it('keeps the empty stage neutral and image-free', () => {
    expect(themeCss).toContain('--chat-empty-surface: var(--gray-50);');
    expect(themeCss).toContain('--chat-empty-line: rgb(115 115 115 / 0.08);');
    expect(appCss).toContain('.vn-stage.default-background');
    expect(appCss).toContain('repeating-linear-gradient(135deg');
    expect(appCss).not.toMatch(/\.vn-stage\.default-background[^}]*url\(/i);
  });
});
