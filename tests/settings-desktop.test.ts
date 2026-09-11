import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SETTINGS_PAGE_DEFINITIONS } from '../src/App';
import { DesktopLauncher, SubpageShell } from '../src/components/desktop-shell';

describe('settings desktop', () => {
  it('exposes nine unique reachable entries including vector memory', () => {
    const ids = SETTINGS_PAGE_DEFINITIONS.map((entry) => entry.id);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('vector-memory');
    expect(ids).toContain('privacy');
  });

  it('renders every launcher as a named button', () => {
    const html = renderToStaticMarkup(createElement(DesktopLauncher, { title: '设置', entries: SETTINGS_PAGE_DEFINITIONS, onOpen: () => undefined }));
    for (const entry of SETTINGS_PAGE_DEFINITIONS) {
      expect(html).toContain(`aria-label="打开${entry.label}"`);
    }
    expect((html.match(/class="desktop-app-icon"/g) ?? [])).toHaveLength(9);
  });

  it('marks the active subpage while retaining its child content', () => {
    const input = createElement('input', { value: 'draft endpoint', readOnly: true });
    const html = renderToStaticMarkup(createElement(SubpageShell, { title: '向量记忆', pageId: 'vector-memory', onBack: () => undefined, children: input }));
    expect(html).toContain('data-page="vector-memory"');
    expect(html).toContain('draft endpoint');
    expect(html).toContain('返回桌面');
  });

  it('uses four mobile columns and six wide-screen columns', () => {
    const css = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.desktop-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)[^{]*\{[^}]*\.desktop-grid\s*\{[^}]*grid-template-columns:\s*repeat\(6,/s);
  });
});
