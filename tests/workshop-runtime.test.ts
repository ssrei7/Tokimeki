import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkshopPageRenderer } from '../src/components/workshop-runtime';
import { WorkshopLocalStateSchema, WorkshopPackageRecordSchema } from '../src/data/workshop';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { hasWorkshopPermission, resolveWorkshopFact, workshopPackageIdFromRoute, workshopRoute } from '../src/ui/workshop-runtime';

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
    expect(html).toContain('状态动作将在确定性活动切片开放');
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

  it('limits local state to small scalar values', () => {
    const base = { id: 'world:runtime.sample', saveId: 'world', packageId: 'runtime.sample', updatedAt: '2026-09-19T00:00:00.000Z' };
    expect(WorkshopLocalStateSchema.parse({ ...base, values: { text: 'ok', count: 1, done: true, empty: null } }).values.done).toBe(true);
    expect(() => WorkshopLocalStateSchema.parse({ ...base, values: { nested: { unsafe: true } } })).toThrow();
    expect(() => WorkshopLocalStateSchema.parse({ ...base, values: { tooLong: 'x'.repeat(2001) } })).toThrow();
  });
});
