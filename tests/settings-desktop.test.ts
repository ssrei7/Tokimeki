import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BOTTOM_NAV_ITEMS, SETTINGS_PAGE_DEFINITIONS } from '../src/App';
import { DesktopLauncher, SubpageShell } from '../src/components/desktop-shell';

describe('settings desktop', () => {
  it('exposes nine unique reachable entries including vector memory', () => {
    const ids = SETTINGS_PAGE_DEFINITIONS.map((entry) => entry.id);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('vector-memory');
    expect(ids).toContain('privacy');
    expect(SETTINGS_PAGE_DEFINITIONS.map((entry) => entry.label)).toEqual(['身份', '模型', '向量', '路由', '显示', '规则', '隐私', '调试', '开发']);
    expect(SETTINGS_PAGE_DEFINITIONS.every((entry) => Array.from(entry.label).length <= 2)).toBe(true);
    expect(SETTINGS_PAGE_DEFINITIONS.find((entry) => entry.id === 'vector-memory')?.pageTitle).toBe('向量记忆');
  });

  it('renders every launcher as a named button', () => {
    const html = renderToStaticMarkup(createElement(DesktopLauncher, { title: '设置', entries: SETTINGS_PAGE_DEFINITIONS, onOpen: () => undefined }));
    for (const entry of SETTINGS_PAGE_DEFINITIONS) {
      expect(html).toContain(`aria-label="打开${entry.label}"`);
    }
    expect((html.match(/class="desktop-app-icon"/g) ?? [])).toHaveLength(9);
    expect(html).not.toContain(' title=');
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

  it('keeps system CSS achromatic and uses the requested bottom navigation order', () => {
    expect(BOTTOM_NAV_ITEMS.map(([, label]) => label)).toEqual(['日程', '聊天', '地图', '资料', '设置']);
    const themeCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    const appCss = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    const grayHexes = [...themeCss.matchAll(/--gray-[\w-]+:\s*#([\da-f]{6})/gi)].map((match) => match[1]);
    expect(grayHexes.length).toBeGreaterThan(0);
    expect(grayHexes.every((hex) => hex.slice(0, 2) === hex.slice(2, 4) && hex.slice(2, 4) === hex.slice(4, 6))).toBe(true);
    expect(appCss).not.toMatch(/#[\da-f]{3,8}\b/i);
    for (const match of appCss.matchAll(/rgb\((\d+)\s+(\d+)\s+(\d+)/g)) {
      expect(match[1]).toBe(match[2]);
      expect(match[2]).toBe(match[3]);
    }
  });
});
