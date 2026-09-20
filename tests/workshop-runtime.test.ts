import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkshopPageRenderer } from '../src/components/workshop-runtime';
import { WorkshopLocalStateSchema, WorkshopPackageRecordSchema, WorkshopValueBindingSchema } from '../src/data/workshop';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { formatWorkshopBinding, hasWorkshopPermission, listWorkshopBinding, resolveWorkshopBinding, resolveWorkshopFact, workshopPackageIdFromRoute, workshopRoute } from '../src/ui/workshop-runtime';

function runtimeRecord() {
  return WorkshopPackageRecordSchema.parse({
    id: 'runtime.sample',
    package: {
      manifest: {
        type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'runtime.sample', name: '运行时示例', author: 'Tester', version: '1.0.0',
        permissions: [
          { capability: 'world.read', resources: ['clock'] },
          { capability: 'app.local-state' },
          { capability: 'navigation.local' },
          { capability: 'op.submit', resources: ['set_flag'] },
        ],
      },
      app: {
        entryPageId: 'home',
        pages: [{
          id: 'home', title: '本地活动', components: [
            { kind: 'title', text: '<script>never</script>', level: 2 },
            { kind: 'fact', resource: 'clock', label: '现在' },
            { kind: 'tabs', tabs: [{ id: 'detail-tab', label: '详情', pageId: 'detail' }] },
            { kind: 'input', key: 'note', label: '备注', maxLength: 50 },
            { kind: 'select', key: 'choice', label: '选择', options: [{ value: 'a', label: '甲' }] },
            { kind: 'button', label: '本地完成', action: { type: 'set-local', key: 'done', value: true } },
            { kind: 'button', label: '改世界状态', action: { type: 'submit-op', op: 'set_flag', payload: { key: 'x', value: true } } },
          ],
        }, { id: 'detail', title: '详情', components: [{ kind: 'text', text: '详情页' }] }],
      },
      rules: { rules: [] },
    },
    assetBindings: {}, installedAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z',
  });
}

describe('workshop restricted runtime', () => {
  it('uses stable dynamic routes without accepting empty package ids', () => {
    expect(workshopRoute('runtime.sample')).toBe('workshop-app:runtime.sample');
    expect(workshopPackageIdFromRoute('workshop-app:runtime.sample')).toBe('runtime.sample');
    expect(workshopPackageIdFromRoute('workshop-app:')).toBeUndefined();
    expect(workshopPackageIdFromRoute('messages')).toBeUndefined();
  });

  it('renders escaped declarative content, authorized facts and local controls only', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'runtime-world', title: 'Runtime', day: 4, slotId: 'noon' }));
    const record = runtimeRecord();
    const html = renderToStaticMarkup(createElement(WorkshopPageRenderer, { record, save, pageId: 'home', values: { note: '本地文字', choice: 'a' }, onPageChange: vi.fn(), onValueChange: vi.fn() }));
    expect(html).toContain('&lt;script&gt;never&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('第 4 天');
    expect(html).toContain('本地文字');
    expect(html).toMatch(/<button[^>]*>本地完成<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>改世界状态<\/button>/);
    expect(html).toContain('该状态动作尚未开放');
  });

  it('only enables the registered manual activity entry in an installed runtime', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'activity-runtime', title: 'Activity Runtime' }));
    const record = runtimeRecord();
    record.package.manifest.permissions = [{ capability: 'op.submit', resources: ['run_workshop_activity', 'add_stat'] }];
    record.package.rules.rules = [{ id: 'fish', hook: 'manual', actions: [{ type: 'submit-op', op: 'add_stat', payload: { target: 'player', key: 'fishing.skill', delta: 1 } }] }];
    record.package.app.pages[0]!.components = [{ kind: 'button', label: '开始钓鱼', action: { type: 'submit-op', op: 'run_workshop_activity', payload: { ruleId: 'fish' } } }];
    const html = renderToStaticMarkup(createElement(WorkshopPageRenderer, { record, save, pageId: 'home', values: {}, onPageChange: vi.fn(), onValueChange: vi.fn(), onRunActivity: vi.fn() }));
    expect(html).toMatch(/<button[^>]*>开始钓鱼<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>开始钓鱼<\/button>/);
  });

  it('only enables same-package events with install and trigger permissions', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'event-runtime', title: 'Event Runtime' }));
    const record = runtimeRecord();
    record.package.manifest.permissions = [
      { capability: 'event.install', resources: ['notice'] },
      { capability: 'event.trigger', resources: ['notice'] },
    ];
    record.package.events = { events: [{ id: 'notice', title: '告示', trigger: {}, content: '新告示。' }] };
    record.package.app.pages[0]!.components = [{ kind: 'button', label: '查看告示', action: { type: 'trigger-event', eventId: 'notice' } }];
    const enabled = renderToStaticMarkup(createElement(WorkshopPageRenderer, { record, save, pageId: 'home', values: {}, onPageChange: vi.fn(), onValueChange: vi.fn(), onTriggerEvent: vi.fn() }));
    expect(enabled).toMatch(/<button[^>]*>查看告示<\/button>/);
    expect(enabled).not.toMatch(/<button[^>]*disabled=""[^>]*>查看告示<\/button>/);
    const preview = renderToStaticMarkup(createElement(WorkshopPageRenderer, { record, save, pageId: 'home', values: {}, onPageChange: vi.fn(), onValueChange: vi.fn() }));
    expect(preview).toMatch(/<button[^>]*disabled=""[^>]*>查看告示<\/button>/);
  });

  it('rechecks declared permissions at render time', () => {
    const record = runtimeRecord();
    expect(hasWorkshopPermission(record, 'world.read', 'clock')).toBe(true);
    expect(hasWorkshopPermission(record, 'world.read', 'player.stats')).toBe(false);
    expect(hasWorkshopPermission(record, 'provider.explicit-text', 'narrate_main')).toBe(false);
    record.package.manifest.permissions = record.package.manifest.permissions.filter((permission) => permission.capability !== 'navigation.local');
    const save = seedScenario(createCurrentSaveScenario({ id: 'permission-world', title: 'Permission' }));
    const html = renderToStaticMarkup(createElement(WorkshopPageRenderer, { record, save, pageId: 'home', values: {}, onPageChange: vi.fn(), onValueChange: vi.fn() }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>详情<\/button>/);
  });

  it('resolves deterministic facts from the SaveFile snapshot', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'facts', title: 'Facts' }));
    save.world.stats.reputation = 7;
    save.world.player.stats.money = 12;
    expect(resolveWorkshopFact('world.stats', save).lines).toContain('reputation: 7');
    expect(resolveWorkshopFact('player.stats', save).lines).toContain('money: 12');
    expect(resolveWorkshopFact('player.location', save).lines[0]).toBe('起点街区');
  });

  it('binds local and authorized world values into declarative display components', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'bindings', title: 'Bindings', day: 6, slotId: 'night' }));
    save.world.player.stats.energy = 7;
    const record = runtimeRecord();
    record.package.manifest.permissions = [
      { capability: 'app.local-state' },
      { capability: 'world.read', resources: ['clock', 'player.stats', 'player.inventory'] },
    ];
    record.package.app.pages[0]!.components = [
      { kind: 'title', text: '无标题', binding: { source: 'local', key: 'headline', format: 'text' }, level: 2 },
      { kind: 'text', text: '无时间', binding: { source: 'world', resource: 'clock', path: ['day'], format: 'number', prefix: '第 ', suffix: ' 天' } },
      { kind: 'card', title: '体力', body: '未知', bodyBinding: { source: 'world', resource: 'player.stats', path: ['energy'], format: 'number', suffix: ' 点' } },
      { kind: 'list', items: ['空背包'], binding: { source: 'world', resource: 'player.inventory', format: 'json' } },
      { kind: 'progress', label: '进度', value: 0, valueBinding: { source: 'local', key: 'progress', format: 'number' }, max: 10 },
      { kind: 'button', label: '默认按钮', labelBinding: { source: 'local', key: 'buttonLabel', format: 'text' }, action: { type: 'set-local', key: 'done', value: true } },
    ];
    const html = renderToStaticMarkup(createElement(WorkshopPageRenderer, { record, save, pageId: 'home', values: { headline: '今晚计划', progress: 4, buttonLabel: '完成记录' }, onPageChange: vi.fn(), onValueChange: vi.fn() }));
    expect(html).toContain('今晚计划');
    expect(html).toContain('第 6 天');
    expect(html).toContain('7 点');
    expect(html).toContain('<progress value="4" max="10"></progress>');
    expect(html).toContain('完成记录');
    expect(html).not.toContain('默认按钮');
  });

  it('rechecks binding permissions, safe paths and deterministic formatting', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'binding-permissions', title: 'Bindings' }));
    save.world.stats.reputation = 9;
    const record = runtimeRecord();
    const worldBinding = WorkshopValueBindingSchema.parse({ source: 'world', resource: 'world.stats', path: ['reputation'], format: 'number', prefix: '+', fallback: 0 });
    expect(resolveWorkshopBinding(worldBinding, record, save, {}).status).toBe('unauthorized');
    record.package.manifest.permissions.push({ capability: 'world.read', resources: ['world.stats'] });
    const result = resolveWorkshopBinding(worldBinding, record, save, {});
    expect(formatWorkshopBinding(worldBinding, result, '未知')).toBe('+9');
    const missing = WorkshopValueBindingSchema.parse({ source: 'world', resource: 'world.stats', path: ['missing'], fallback: 3, format: 'number' });
    expect(formatWorkshopBinding(missing, resolveWorkshopBinding(missing, record, save, {}), '未知')).toBe('3');
    const list = WorkshopValueBindingSchema.parse({ source: 'world', resource: 'world.stats' });
    expect(listWorkshopBinding(list, resolveWorkshopBinding(list, record, save, {}), [])).toContain('reputation: 9');
    expect(() => WorkshopValueBindingSchema.parse({ source: 'world', resource: 'world.stats', path: ['__proto__'] })).toThrow('不安全字段');
  });

  it('limits local state to small scalar values', () => {
    const base = { id: 'world:runtime.sample', saveId: 'world', packageId: 'runtime.sample', updatedAt: '2026-09-19T00:00:00.000Z' };
    expect(WorkshopLocalStateSchema.parse({ ...base, values: { text: 'ok', count: 1, done: true, empty: null } }).values.done).toBe(true);
    expect(() => WorkshopLocalStateSchema.parse({ ...base, values: { nested: { unsafe: true } } })).toThrow();
    expect(() => WorkshopLocalStateSchema.parse({ ...base, values: { tooLong: 'x'.repeat(2001) } })).toThrow();
  });
});
