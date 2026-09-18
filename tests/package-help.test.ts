import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PackageHelpButton } from '../src/components/package-help-dialog';

const helpSource = readFileSync(new URL('../src/components/package-help-dialog.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/components/desktop-shell.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const appCssSource = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');

describe('built-in package authoring help', () => {
  it('renders question-mark triggers with explicit accessible labels', () => {
    expect(renderToStaticMarkup(createElement(PackageHelpButton, { kind: 'world' }))).toContain('aria-label="查看世界包制作教程"');
    expect(renderToStaticMarkup(createElement(PackageHelpButton, { kind: 'event' }))).toContain('aria-label="查看事件包制作教程"');
    expect(renderToStaticMarkup(createElement(PackageHelpButton, { kind: 'world' }))).toContain('aria-label="下载世界包模板"');
    expect(renderToStaticMarkup(createElement(PackageHelpButton, { kind: 'event' }))).toContain('aria-label="下载事件包模板"');
  });

  it('places world and event help at their import/export pages', () => {
    expect(shellSource).toContain("pageId === 'save'");
    expect(shellSource).toContain('<PackageHelpPortal kind="world" targetSelector=".world-package-card > .list-heading" />');
    expect(appSource).toContain('<PackageHelpButton kind="event" />');
    expect(appCssSource).toContain(".subpage-content[data-page='event-packages'] > *");
    expect(appCssSource).toContain(".subpage-content[data-page='event-packages'] .library-legacy-content > *");
    expect(appCssSource).toContain(".library-subpage-content[data-page='save'] .library-legacy-content > :nth-child(5)");
  });

  it('documents package boundaries, event difficulty and recovery steps', () => {
    expect(helpSource).toContain('世界包与世界存档有什么区别');
    expect(helpSource).toContain('不会带走玩家时间、当前位置、关系进度');
    expect(helpSource).toContain('触发难度由什么决定');
    expect(helpSource).toContain('总是触发不了怎么办');
    expect(helpSource).toContain('完整可视化事件编辑器尚未提供');
    expect(helpSource).toContain('下载世界包模板');
    expect(helpSource).toContain('下载事件包模板');
    expect(helpSource).toContain('weight');
    expect(helpSource).toContain('charIds');
  });
});
