import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BOTTOM_NAV_ITEMS, DAY_PAGE_DEFINITIONS, LIBRARY_PAGE_DEFINITIONS, ROUTING_TASK_IDS, SETTINGS_PAGE_DEFINITIONS } from '../src/App';
import { DesktopLauncher, SubpageShell } from '../src/components/desktop-shell';
import { clearDesktopOrder, clearDesktopPages, moveIdBefore, moveIdToPageEnd, readDesktopOrder, readDesktopPages, reconcileDesktopOrder, writeDesktopOrder, writeDesktopPage } from '../src/components/desktop-order';
import { desktopIconContrastForLuminance } from '../src/ui/desktop-icon-contrast';
import { readCallHistoryCollapsed, readContactGroupCollapsed, readContactGroupPreferences, writeCallHistoryCollapsed, writeContactGroupCollapsed, writeContactGroupPreferences } from '../src/ui/contact-groups';

describe('settings desktop', () => {
  it('persists and validates contact group preferences locally', () => {
    const originalWindow = globalThis.window;
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } } });
    try {
      writeContactGroupPreferences({ groups: [{ id: 'custom-close', name: '亲友' }], assignments: { alice: 'custom-close', ghost: 'missing' } });
      expect(readContactGroupPreferences()).toEqual({ groups: [{ id: 'custom-close', name: '亲友' }], assignments: { alice: 'custom-close' } });
      writeContactGroupCollapsed({ friends: true, 'custom-close': false });
      expect(readContactGroupCollapsed()).toEqual({ friends: true, 'custom-close': false });
      values.set('tokimeki.contactGroups.v1', '{broken');
      expect(readContactGroupPreferences()).toEqual({ groups: [], assignments: {} });
    } finally {
      if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
      else Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  });
  it('exposes unique reachable entries including vector memory, voice, image and migration', () => {
    const ids = SETTINGS_PAGE_DEFINITIONS.map((entry) => entry.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('vector-memory');
    expect(ids).toContain('privacy');
    expect(ids).toContain('voice');
    expect(ids).toContain('migration');
    expect(SETTINGS_PAGE_DEFINITIONS.map((entry) => entry.label)).toEqual(['身份', '模型', '向量', '语音', '图像', '路由', '迁移', '显示', '规则', '隐私', '调试', '开发']);
    expect(SETTINGS_PAGE_DEFINITIONS.every((entry) => Array.from(entry.label).length <= 2)).toBe(true);
    expect(SETTINGS_PAGE_DEFINITIONS.find((entry) => entry.id === 'vector-memory')?.pageTitle).toBe('向量记忆');
    expect(SETTINGS_PAGE_DEFINITIONS.find((entry) => entry.id === 'voice')?.pageTitle).toBe('语音生成');
    expect(SETTINGS_PAGE_DEFINITIONS.find((entry) => entry.id === 'image')?.pageTitle).toBe('图像生成');
    expect(ROUTING_TASK_IDS).not.toContain('image');
    expect(ROUTING_TASK_IDS).toContain('workshop_draft');
  });

  it('keeps standalone image and display settings visible without child-index drift', () => {
    const css = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('className="image-settings-content"');
    expect(css).toContain(".subpage-content[data-page='image'] > .image-settings-content");
    expect(css).toContain(".subpage-content[data-page='display'] > .settings-display-shortcut");
    expect(css).toContain(".subpage-content[data-page='display'] > details:nth-of-type(7)");
    expect(css).not.toContain(".subpage-content[data-page='display'] > :nth-child(7)");
  });

  it('mounts identity avatar controls only on the identity settings page', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("{props.activePage === 'player' && <PersonaAvatarSettings");
    expect(app).not.toMatch(/^\s*<PersonaAvatarSettings saveId=/m);
  });

  it('offers local custom CSS import and export without auto-applying imports', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('>导出 CSS</button>');
    expect(app).toContain('>导入 CSS<input type="file" accept=".css,text/css,text/plain"');
    expect(app).toContain('尚未应用。请先检查编辑器内容');
    expect(app).toContain('validateCustomCss(css)');
  });

  it('renders every launcher as a named button', () => {
    const html = renderToStaticMarkup(createElement(DesktopLauncher, { launcherId: 'settings', title: '设置', entries: SETTINGS_PAGE_DEFINITIONS, onOpen: () => undefined }));
    for (const entry of SETTINGS_PAGE_DEFINITIONS) {
      expect(html).toContain(`aria-label="打开${entry.label}"`);
    }
    expect((html.match(/class="desktop-app-icon"/g) ?? [])).toHaveLength(12);
    expect(html).not.toContain(' title=');
  });

  it('shows four rows per page on terminal and settings desktops', () => {
    const icon = SETTINGS_PAGE_DEFINITIONS[0].icon;
    const entries = Array.from({ length: 25 }, (_, index) => ({ id: `entry-${index}`, label: `项目${index}`, icon, tone: 'gray' as const }));
    for (const launcherId of ['terminal', 'settings']) {
      const html = renderToStaticMarkup(createElement(DesktopLauncher, { launcherId, title: launcherId === 'terminal' ? '终端' : '设置', appName: '我的世界', entries, onOpen: () => undefined }));
      expect(html).toContain('desktop-launcher swipe-enabled paginated');
      expect((html.match(/class="desktop-app-icon"/g) ?? [])).toHaveLength(16);
      expect((html.match(/class="desktop-pagination/g) ?? [])).toHaveLength(1);
      expect((html.match(/aria-label="第 [12] 页"/g) ?? [])).toHaveLength(2);
      expect(html).toContain('我的世界');
    }
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
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(css).toMatch(/\.desktop-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
    expect(css).toContain('.screen.desktop-screen-host { overscroll-behavior-y: none; }');
    expect(css).toContain('.desktop-launcher.swipe-enabled.paginated { touch-action: pan-y; }');
    expect(css).toContain('.desktop-launcher.swipe-enabled.paginated .desktop-grid { grid-template-rows: repeat(4, minmax(calc(var(--desktop-icon-size) + 38px), auto)); }');
    expect(app).toContain("desktopScreen ? 'desktop-screen-host' : ''");
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
    expect(ids).toHaveLength(21);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LIBRARY_PAGE_DEFINITIONS.map((entry) => entry.label)).toEqual(['消息', '联系人', '通话', '音乐', '工坊', '日历', '目标', '住所', '事业', '日记', '事件', '进展', '快照', '记忆', '收藏', '背包', '角色', '世界书', '预设', '多人剧情', '存档']);
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

  it('exposes collapsible contact groups and compact profile rows', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const groupSource = readFileSync(new URL('../src/ui/contact-groups.ts', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(groupSource).toContain('tokimeki.contactGroups.v1');
    expect(groupSource).toContain('tokimeki.contactGroupCollapsed.v1');
    expect(source).toContain('新朋友');
    expect(source).toContain('新建联系人分组');
    expect(source).toContain('移动${candidate.name}到分组');
    expect(css).toContain('.contact-group-heading');
    expect(css).toContain('.contact-name-line');
    expect(css).toContain('min-height: 56px');
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
    expect(source).toContain('加入图库');
    expect(source).toContain('terminal-sticker-grid');
    expect(source).toContain('aria-label="重回"');
    expect(source).toContain('aria-label="重回要求"');
    expect(source).toContain('onDeleteSticker');
    const contentDbSource = readFileSync(new URL('../src/data/db/content.ts', import.meta.url), 'utf8');
    expect(contentDbSource).toContain('this.version(12)');
    expect(contentDbSource).toContain('terminalStickers');
    expect(source).toContain('aria-label="打开更多功能"');
    expect(source).toContain('aria-label="转账"');
    expect(source).toContain('aria-label="远程约定"');
    expect(source).toContain('aria-label="引用这条消息"');
    expect(source).toContain('setQuoteId(message.id); cancelMessageMenu()');
    expect(source).toContain('onPointerDown={() => beginMessagePress(message.id)}');
    expect(source).toContain('aria-label="编辑消息"');
    expect(source).toContain('删除这条消息？');
    expect(source).toContain('onEditTerminalMessage');
    expect(source).toContain('onDeleteTerminalMessage');
    expect(source).not.toContain('第 {message.createdDay} 天 · {message.createdSlotId}');
    expect(source).not.toContain('你主动添加了对方');
    expect(source).not.toContain('合成并发送语音');
    expect(css).toContain('.terminal-conversation-row');
    expect(css).toContain('.terminal-conversation-row { width: 100%');
    expect(css).toContain('.terminal-more-panel { position: absolute');
    expect(css).toContain('.subpage-content[data-page=\'messages\'] > .terminal-thread-view { display: flex');
    expect(css).toContain('.terminal-more-actions { order: 2');
    expect(css).toContain('.terminal-thread-view { position: relative');
    expect(css).toContain('.terminal-message-row.mine');
    expect(css).toContain('.terminal-thread-header { position: relative');
  });

  it('exposes the local call shell without API wiring', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('data-testid="terminal-calls"');
    expect(source).toContain('让TA来电');
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

  it('uses compact call rows and persists collapsible call history locally', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(source).toContain('candidate.summary');
    expect(source).toContain("callAction('呼叫'");
    expect(source).toContain("callAction('让TA来电'");
    expect(source).toContain('terminal-call-history-heading');
    expect(source).toContain('readCallHistoryCollapsed');
    expect(source).toContain('writeCallHistoryCollapsed');
    expect(source).toContain('aria-expanded={!historyCollapsed}');
    expect(css).toContain('.terminal-call-contact, .terminal-call-record');
    expect(css).toContain('.terminal-call-history-heading');
    const originalWindow = globalThis.window;
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } } });
    try {
      expect(readCallHistoryCollapsed()).toBe(false);
      writeCallHistoryCollapsed(true);
      expect(readCallHistoryCollapsed()).toBe(true);
      values.set('tokimeki.callHistoryCollapsed.v1', '{broken');
      expect(readCallHistoryCollapsed()).toBe(false);
    } finally {
      if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
      else Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
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

  it('persists explicit terminal/settings page assignments independently', () => {
    const originalWindow = globalThis.window;
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } } });
    try {
      writeDesktopPage('terminal', 'music', 1);
      writeDesktopPage('settings', 'provider', 1);
      expect(readDesktopPages('terminal', ['music', 'contacts'])).toEqual({ music: 1 });
      expect(readDesktopPages('settings', ['provider'])).toEqual({ provider: 1 });
      clearDesktopPages('terminal');
      expect(readDesktopPages('terminal', ['music'])).toEqual({});
      expect(readDesktopPages('settings', ['provider'])).toEqual({ provider: 1 });
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
