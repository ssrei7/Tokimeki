import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BOTTOM_NAV_ITEMS, DAY_PAGE_DEFINITIONS, LIBRARY_PAGE_DEFINITIONS, SETTINGS_PAGE_DEFINITIONS } from '../src/App';
import { DesktopLauncher, SubpageShell } from '../src/components/desktop-shell';
import { clearDesktopOrder, moveIdBefore, moveIdToPageEnd, readDesktopOrder, reconcileDesktopOrder, writeDesktopOrder } from '../src/components/desktop-order';
import { desktopIconContrastForLuminance } from '../src/ui/desktop-icon-contrast';

describe('settings desktop', () => {
  it('exposes ten unique reachable entries including vector memory and voice', () => {
    const ids = SETTINGS_PAGE_DEFINITIONS.map((entry) => entry.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('vector-memory');
    expect(ids).toContain('privacy');
    expect(ids).toContain('voice');
    expect(SETTINGS_PAGE_DEFINITIONS.map((entry) => entry.label)).toEqual(['身份', '模型', '向量', '语音', '路由', '显示', '规则', '隐私', '调试', '开发']);
    expect(SETTINGS_PAGE_DEFINITIONS.every((entry) => Array.from(entry.label).length <= 2)).toBe(true);
    expect(SETTINGS_PAGE_DEFINITIONS.find((entry) => entry.id === 'vector-memory')?.pageTitle).toBe('向量记忆');
    expect(SETTINGS_PAGE_DEFINITIONS.find((entry) => entry.id === 'voice')?.pageTitle).toBe('语音生成');
  });

  it('renders every launcher as a named button', () => {
    const html = renderToStaticMarkup(createElement(DesktopLauncher, { launcherId: 'settings', title: '设置', entries: SETTINGS_PAGE_DEFINITIONS, onOpen: () => undefined }));
    for (const entry of SETTINGS_PAGE_DEFINITIONS) {
      expect(html).toContain(`aria-label="打开${entry.label}"`);
    }
    expect((html.match(/class="desktop-app-icon"/g) ?? [])).toHaveLength(10);
    expect(html).not.toContain(' title=');
  });

  it('paginates launcher entries with short page bars and accepts a local app name', () => {
    const icon = SETTINGS_PAGE_DEFINITIONS[0].icon;
    const entries = Array.from({ length: 25 }, (_, index) => ({ id: `entry-${index}`, label: `项目${index}`, icon, tone: 'gray' as const }));
    const html = renderToStaticMarkup(createElement(DesktopLauncher, { launcherId: 'terminal', title: '终端', appName: '我的世界', entries, onOpen: () => undefined }));
    expect((html.match(/class="desktop-app-icon"/g) ?? [])).toHaveLength(24);
    expect((html.match(/class="desktop-pagination/g) ?? [])).toHaveLength(1);
    expect((html.match(/aria-label="第 [12] 页"/g) ?? [])).toHaveLength(2);
    expect(html).toContain('我的世界');
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

  it('exposes reorder controls and keeps stable launcher identifiers', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const appCss = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(source).toContain('DesktopLauncher launcherId="settings" title="设置"');
    expect(appCss).toContain('.desktop-app-icon.reorderable');
    expect(appCss).toContain('-webkit-user-select: none');
    expect(appCss).toContain('.desktop-reorder-actions');
  });

  it('keeps system CSS achromatic and uses the requested bottom navigation order', () => {
    expect(BOTTOM_NAV_ITEMS.map(([, label]) => label)).toEqual(['日程', '聊天', '地图', '终端', '设置']);
    expect(BOTTOM_NAV_ITEMS.every(([, , icon]) => typeof icon === 'object' || typeof icon === 'function')).toBe(true);
    const themeCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    const appCss = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(appCss).toContain('.bottom-nav button { min-height: 44px;');
    expect(appCss).toContain('.bottom-nav button svg { width: 25px; height: 25px; }');
    const grayHexes = [...themeCss.matchAll(/--gray-[\w-]+:\s*#([\da-f]{6})/gi)].map((match) => match[1]);
    expect(grayHexes.length).toBeGreaterThan(0);
    expect(grayHexes.every((hex) => hex.slice(0, 2) === hex.slice(2, 4) && hex.slice(2, 4) === hex.slice(4, 6))).toBe(true);
    expect(appCss).not.toMatch(/#[\da-f]{3,8}\b/i);
    for (const match of appCss.matchAll(/rgb\((\d+)\s+(\d+)\s+(\d+)/g)) {
      expect(match[1]).toBe(match[2]);
      expect(match[2]).toBe(match[3]);
    }
  });

  it('keeps face-to-face nameplates in the grayscale theme and pins subpage headers', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const appCss = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(source).toContain("const accentColor = 'var(--gray-600)';");
    expect(source).not.toContain("'--vn-line-accent': lineAccentColor");
    expect(appCss).toMatch(/\.subpage-shell\s*>\s*\.page-header\s*\{[^}]*position:\s*sticky/);
    expect(appCss).toContain('backdrop-filter: blur(12px)');
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
  it('exposes all terminal and moved schedule entries with short launcher labels', () => {
    const ids = LIBRARY_PAGE_DEFINITIONS.map((entry) => entry.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LIBRARY_PAGE_DEFINITIONS.map((entry) => entry.label)).toEqual(['消息', '联系人', '通话', '音乐', '日历', '目标', '住所', '事业', '日记', '事件', '进展', '快照', '记忆', '收藏', '背包', '角色', '世界书', '预设', '多人剧情', '存档']);
    expect(LIBRARY_PAGE_DEFINITIONS.every((entry) => Array.from(entry.label).length <= 4)).toBe(true);
    expect(LIBRARY_PAGE_DEFINITIONS.find((entry) => entry.id === 'save')?.pageTitle).toBe('存档与导入导出');
    expect(LIBRARY_PAGE_DEFINITIONS.find((entry) => entry.id === 'memories')?.pageTitle).toBe('记忆库');
  });

  it('does not attach desktop badges and uses the terminal desktop title', () => {
    expect(LIBRARY_PAGE_DEFINITIONS.every((entry) => !('badge' in entry))).toBe(true);
    expect(SETTINGS_PAGE_DEFINITIONS.every((entry) => !('badge' in entry))).toBe(true);
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const appCss = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(source).toContain('DesktopLauncher launcherId="terminal" title="终端"');
    expect(source).toContain('day-default-view');
    expect(appCss).toContain('.day-default-view .day-moved-content');
  });

  it('keeps terminal placeholders local and does not add API calls', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const musicSource = readFileSync(new URL('../src/components/music-app.tsx', import.meta.url), 'utf8');
    expect(source).toContain("navigation.activePage === 'contacts'");
    expect(source).toContain('data-testid="terminal-contacts"');
    expect(source).toContain('data-testid="terminal-messages"');
    expect(source).toContain("navigation.activePage === 'calls'");
    expect(source).toContain("navigation.activePage === 'music'");
    expect(source).toContain('world.terminal.messageThreads');
    expect(source).toContain('<MusicApp player={props.musicPlayer} />');
    expect(source).toContain('<audio ref={musicPlayer.audioRef}');
    expect(source).not.toContain('此入口将在音乐 App 切片中接入。');
    expect(musicSource).toContain('className="surface-card music-list-card"');
    expect(musicSource).toContain('const [playlistOpen, setPlaylistOpen] = useState(false);');
  });

  it('keeps player transfers and pending receipts while hiding counterpart simulation controls', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('onSendPlayerTransfer');
    expect(source).toContain('onResolveIncomingTransfer');
    expect(source).not.toContain('模拟TA转入');
    expect(source).not.toContain('模拟TA接受');
    expect(source).toContain('待收款');
    expect(source).toContain('转账记录');
    expect(source).toContain('createTerminalOpRegistry');
  });

  it('uses a recent-conversation list and icon-based terminal thread composer', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(source).toContain('data-testid="terminal-message-list"');
    expect(source).toContain('listTerminalMessageThreads');
    expect(source).toContain('TERMINAL_SELECTED_CONTACT_KEY');
    expect(source).toContain('TERMINAL_DRAFTS_KEY');
    expect(source).toContain('返回最近聊天');
    expect(source).toContain("event.key === 'Enter' && !event.shiftKey");
    expect(source).toContain('aria-label="发送消息"');
    expect(source).toContain('aria-label="生成回复"');
    expect(source).toContain('aria-label="打开表情包"');
    expect(source).toContain('aria-label="打开更多功能"');
    expect(source).not.toContain('合成并发送语音');
    expect(css).toContain('.terminal-conversation-row');
    expect(css).toContain('.terminal-message-row.mine');
    expect(css).toContain('.terminal-thread-header { position: sticky');
  });

  it('exposes the local call shell without API wiring', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('data-testid="terminal-calls"');
    expect(source).toContain('模拟来电');
    expect(source).toContain('模拟TA接听');
    expect(source).toContain('通话记录');
    expect(source).toContain('recordTerminalCall');
    expect(source).toContain('navigation.activePage === \'calls\'');
  });

  it('keeps remote appointment proposals separate from calendar confirmation', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('aria-label="远程约定"');
    expect(source).toContain('发起约定');
    expect(source).toContain('模拟TA提议');
    expect(source).toContain('模拟TA同意');
    expect(source).toContain('加入日历');
    expect(source).toContain('confirmTerminalAppointment');
  });
});

describe('desktop order preferences', () => {
  it('reconciles saved IDs while appending new entries', () => {
    expect(reconcileDesktopOrder(['b', 'missing', 'b', 1], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('moves entries within and across paginated pages', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    expect(moveIdBefore(order, 'e', 'b')).toEqual(['a', 'e', 'b', 'c', 'd']);
    expect(moveIdToPageEnd(order, 'a', 1, 2)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('persists each launcher order independently in local storage', () => {
    const originalWindow = globalThis.window;
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } } });
    try {
      writeDesktopOrder('terminal', ['b', 'a']);
      writeDesktopOrder('settings', ['y', 'x']);
      expect(readDesktopOrder('terminal', ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
      expect(readDesktopOrder('settings', ['x', 'y'])).toEqual(['y', 'x']);
      clearDesktopOrder('terminal');
      expect(readDesktopOrder('terminal', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
      expect(readDesktopOrder('settings', ['x', 'y'])).toEqual(['y', 'x']);
    } finally {
      if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
      else Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  });
});

describe('day desktop', () => {
  it('exposes the planned local schedule entries with short labels', () => {
    const ids = DAY_PAGE_DEFINITIONS.map((entry) => entry.id);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DAY_PAGE_DEFINITIONS.map((entry) => entry.label)).toEqual(['日历', '目标', '住所', '事业', '结算', '日记', '事件', '进展', '快照']);
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
