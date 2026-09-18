import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Tauri desktop shell', () => {
  it('keeps the desktop build pointed at the static Vite output', () => {
    const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')) as {
      productName: string;
      identifier: string;
      build: { frontendDist: string; beforeBuildCommand: string };
      app: { security: { csp: string }; windows: Array<{ label: string; title: string }> };
    };
    expect(config.productName).toBe('小小地图');
    expect(config.identifier).toBe('app.tokimeki.desktop');
    expect(config.build.frontendDist).toBe('../dist');
    expect(config.build.beforeBuildCommand).toBe('npm run build');
    expect(config.app.windows[0]?.label).toBe('main');
    expect(config.app.windows[0]?.title).toBe('小小地图');
    expect(config.app.security.csp).toContain("connect-src 'self'");
  });

  it('does not grant native network, filesystem or shell permissions by default', () => {
    const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8')) as { permissions: string[] };
    expect(capability.permissions).toEqual(['core:default']);
  });
});
