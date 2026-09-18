import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_APPEARANCE } from '../src/ui/theme/preferences';
import { exportThemePackage, importThemePackage, listThemePackageConflicts, remapThemePackageAssetIds, themePackageAssetIds, type ThemeBackupData } from '../src/data/io/theme-package';

const theme: ThemeBackupData = {
  mode: 'dark', template: 'soft', appearance: { ...DEFAULT_THEME_APPEARANCE, cardRadius: 18 }, customCss: '.message { color: red; }',
  desktopTitles: { settings: { display: '外观中心' } }, desktopIcons: { settings: { display: { kind: 'stored', assetId: 'icon-1' }, migration: { kind: 'url', url: 'https://example.com/migration.png' } } },
};

describe('theme package IO', () => {
  it('exports only referenced local icon assets and round trips external URLs', async () => {
    expect(themePackageAssetIds(theme)).toEqual(new Set(['icon-1']));
    const blob = await exportThemePackage(theme, [
      { id: 'icon-1', blob: new Blob(['icon']), mimeType: 'image/png', category: 'image', width: 32, height: 32, createdAt: '2026-09-18T00:00:00.000Z' },
      { id: 'unused', blob: new Blob(['unused']), mimeType: 'image/png', category: 'image', createdAt: '2026-09-18T00:00:00.000Z' },
    ], '0.0.1');
    const imported = await importThemePackage(blob);
    expect(imported.assets.has('icon-1')).toBe(true);
    expect(imported.assets.has('unused')).toBe(false);
    expect(imported.theme.desktopIcons.settings.migration).toEqual({ kind: 'url', url: 'https://example.com/migration.png' });
  });

  it('remaps local assets and lists overwrite conflicts without network access', () => {
    const remapped = remapThemePackageAssetIds(theme, new Map([['icon-1', 'local-copy']]));
    expect(remapped.desktopIcons.settings.display).toEqual({ kind: 'stored', assetId: 'local-copy' });
    expect(listThemePackageConflicts({ ...theme, customCss: '' }, theme).map((item) => item.key)).toContain('customCss');
  });

  it('rejects unsafe custom CSS', async () => {
    await expect(exportThemePackage({ ...theme, customCss: '@import url(https://evil.example/theme.css);' }, [], '0.0.1')).rejects.toThrow();
  });
});
