import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BOTTOM_NAV_ITEMS, DAY_PAGE_DEFINITIONS, LIBRARY_PAGE_DEFINITIONS, SETTINGS_PAGE_DEFINITIONS } from '../src/App';
import { DesktopLauncher, SubpageShell } from '../src/components/desktop-shell';
import { desktopIconContrastForLuminance } from '../src/ui/desktop-icon-contrast';

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
    expect(css).toContain('@media (min-width: 700px)');
    expect(css).toContain('.desktop-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }');
    expect(css).toContain('@media (max-width: 399px)');
  });

  it('uses shared desktop and surface tokens for stable sizing', () => {
    const themeCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    const appCss = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(themeCss).toContain('--desktop-icon-size: 54px;');
    expect(themeCss).toContain('--desktop-icon-radius: 8px;');
    expect(themeCss).toContain('--surface-radius: 8px;');
    expect(appCss).toContain('min-height: calc(var(--desktop-icon-size) + 38px)');
    expect(appCss).toContain('width: var(--desktop-icon-size)');
    expect(appCss).toContain('box-shadow: var(--surface-shadow)');
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

  it('uses a shared grayscale glass treatment for desktop icons', () => {
    const themeCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    const appCss = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(themeCss).toContain('--desktop-icon-surface: rgb(255 255 255 / 0.68);');
    expect(appCss).toContain('backdrop-filter: blur(14px)');
    expect(appCss).toContain('.desktop-app-icon-glyph.tone-blue, .desktop-app-icon-glyph.tone-green');
    expect(appCss).not.toMatch(/desktop-app-icon-glyph\.tone-(blue|green|amber|rose|violet)\s*\{[^}]*#[0-9a-f]/i);
  });

  it('maps dark and light wallpaper luminance to non-extreme icon grays', () => {
    const dark = desktopIconContrastForLuminance(0.08);
    const light = desktopIconContrastForLuminance(0.92);
    expect(dark.ink).toBe('#eeeeee');
    expect(light.ink).toBe('#333333');
    expect(dark.ink).not.toBe('#ffffff');
    expect(light.ink).not.toBe('#000000');
    expect(dark.border).toContain('255 255 255');
    expect(light.border).toContain('23 23 23');
  });
});

describe('library desktop', () => {
  it('exposes twelve unique reachable entries with short launcher labels', () => {
    const ids = LIBRARY_PAGE_DEFINITIONS.map((entry) => entry.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LIBRARY_PAGE_DEFINITIONS.map((entry) => entry.label)).toEqual(['消息', '联系人', '通话', '音乐', '记忆', '收藏', '背包', '角色', '世界书', '预设', '多人剧情', '存档']);
    expect(LIBRARY_PAGE_DEFINITIONS.every((entry) => Array.from(entry.label).length <= 4)).toBe(true);
    expect(LIBRARY_PAGE_DEFINITIONS.find((entry) => entry.id === 'save')?.pageTitle).toBe('存档与导入导出');
    expect(LIBRARY_PAGE_DEFINITIONS.find((entry) => entry.id === 'memories')?.pageTitle).toBe('记忆库');
  });

  it('keeps terminal placeholders local and does not add API calls', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain("navigation.activePage === 'contacts'");
    expect(source).toContain('data-testid="terminal-contacts"');
    expect(source).toContain('data-testid="terminal-messages"');
    expect(source).toContain("['calls', 'music'].includes(navigation.activePage)");
    expect(source).toContain('world.terminal.messageThreads');
    expect(source).toContain('此入口将在终端功能切片中接入。');
  });

  it('exposes the local bidirectional transfer controls inside messages', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('onSendPlayerTransfer');
    expect(source).toContain('onCreateIncomingTransfer');
    expect(source).toContain('onResolveIncomingTransfer');
    expect(source).toContain('模拟TA转入');
    expect(source).toContain('待收款');
    expect(source).toContain('转账记录');
  });
});

describe('day desktop', () => {
  it('exposes the planned local schedule entries with short labels', () => {
    const ids = DAY_PAGE_DEFINITIONS.map((entry) => entry.id);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DAY_PAGE_DEFINITIONS.map((entry) => entry.label)).toEqual(['日历', '目标', '住所', '事业', '结算', '日记', '事件', '剧情', '快照']);
    expect(DAY_PAGE_DEFINITIONS.every((entry) => Array.from(entry.label).length <= 2)).toBe(true);
    expect(DAY_PAGE_DEFINITIONS.find((entry) => entry.id === 'career')?.pageTitle).toBe('工作与事业');
  });

  it('keeps schedule subpages local and schema-free', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('const renderDaySubpage = (page: DayPage)');
    expect(source).toContain('纯本地 · 不调用 API');
    expect(source).toContain('activePage={dayPage}');
  });
});
