import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportWorkshopPackage, importWorkshopPackage } from '../src/data/io/workshop-package';
import { WorkshopPackageSchema, validateWorkshopPackage, workshopBindingId } from '../src/data/workshop';

function minimalPackage() {
  return WorkshopPackageSchema.parse({
    manifest: { type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'sample.activity', name: '示例活动', author: 'Tester', version: '1.0.0', permissions: [] },
    app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'text', text: '纯本地内容' }] }] },
    rules: { rules: [] },
  });
}

describe('workshop package protocol', () => {
  it('round-trips a valid inert package without network or save data', async () => {
    const blob = await exportWorkshopPackage(minimalPackage(), new Map());
    const imported = await importWorkshopPackage(await blob.arrayBuffer());
    expect(imported.package.manifest).toMatchObject({ type: 'workshop', id: 'sample.activity', version: '1.0.0' });
    expect(imported.report.canInstall).toBe(true);
    expect(imported.assets.size).toBe(0);
  });

  it('round-trips declared local assets without embedding base64 in JSON', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const pack = WorkshopPackageSchema.parse({
      ...minimalPackage(),
      manifest: { ...minimalPackage().manifest, iconAssetId: 'icon' },
      assetMeta: { assets: [{ id: 'icon', path: 'assets/icon.png', mimeType: 'image/png', bytes: bytes.byteLength }] },
    });
    const blob = await exportWorkshopPackage(pack, new Map([['icon', bytes]]));
    const imported = await importWorkshopPackage(await blob.arrayBuffer());
    expect(imported.report.canInstall).toBe(true);
    expect([...imported.assets.get('icon')!.bytes]).toEqual([...bytes]);
    expect(JSON.stringify(imported.package)).not.toContain('base64');
  });

  it('rejects undeclared files and arbitrary code payloads', async () => {
    const pack = minimalPackage();
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(pack.manifest));
    zip.file('app.json', JSON.stringify(pack.app));
    zip.file('rules.json', JSON.stringify(pack.rules));
    zip.file('plugin.js', 'globalThis.pwned = true');
    await expect(importWorkshopPackage(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('不支持的文件');
  });

  it('derives scoped permissions and blocks undeclared navigation', () => {
    const pack = WorkshopPackageSchema.parse({
      ...minimalPackage(),
      app: {
        entryPageId: 'home',
        pages: [
          { id: 'home', title: '首页', components: [{ kind: 'button', label: '下一页', action: { type: 'navigate', pageId: 'detail' } }] },
          { id: 'detail', title: '详情', components: [] },
        ],
      },
    });
    const report = validateWorkshopPackage(pack);
    expect(report.canInstall).toBe(false);
    expect(report.requiredPermissions).toContain('navigation.local');
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'permission-missing', severity: 'error' }));
  });

  it('accepts declared permissions and rejects unsafe condition syntax', () => {
    const pack = WorkshopPackageSchema.parse({
      ...minimalPackage(),
      manifest: { ...minimalPackage().manifest, permissions: [{ capability: 'app.local-state' }] },
      rules: { rules: [{ id: 'bad-rule', when: 'max(player.stats.money, 1) > 2', actions: [{ type: 'set-local', key: 'seen', value: true }] }] },
    });
    const report = validateWorkshopPackage(pack);
    expect(report.requiredPermissions).toContain('app.local-state');
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'invalid-condition' }));
    expect(report.canInstall).toBe(false);
  });

  it('derives world-read permissions from safe condition variables', () => {
    const pack = WorkshopPackageSchema.parse({
      ...minimalPackage(),
      manifest: { ...minimalPackage().manifest, permissions: [{ capability: 'app.local-state' }] },
      rules: { rules: [{ id: 'money-rule', when: 'player.stats.money > 10 and flags.market_open', actions: [{ type: 'set-local', key: 'seen', value: true }] }] },
    });
    const report = validateWorkshopPackage(pack);
    expect(report.requiredPermissions).toEqual(expect.arrayContaining(['world.read:player.stats', 'world.read:world.flags']));
    expect(report.issues.filter((issue) => issue.code === 'permission-missing')).toHaveLength(3);
    expect(report.requiredPermissions).toContain('op.submit:run_workshop_activity');
  });

  it('derives scoped permissions from generic UI bindings', () => {
    const pack = WorkshopPackageSchema.parse({
      ...minimalPackage(),
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [
        { kind: 'text', text: '未填写', binding: { source: 'local', key: 'note' } },
        { kind: 'progress', label: '声望', value: 0, valueBinding: { source: 'world', resource: 'world.stats', path: ['reputation'], format: 'number' }, max: 100 },
      ] }] },
    });
    const report = validateWorkshopPackage(pack);
    expect(report.requiredPermissions).toEqual(expect.arrayContaining(['app.local-state', 'world.read:world.stats']));
    expect(report.issues.filter((issue) => issue.code === 'permission-missing')).toHaveLength(2);
    const declared = WorkshopPackageSchema.parse({
      ...pack,
      manifest: { ...pack.manifest, permissions: [{ capability: 'app.local-state' }, { capability: 'world.read', resources: ['world.stats'] }] },
    });
    expect(validateWorkshopPackage(declared).canInstall).toBe(true);
  });

  it('accepts only manual or onEnterNode activity rules composed from the restricted effect ops', () => {
    const pack = WorkshopPackageSchema.parse({
      ...minimalPackage(),
      manifest: { ...minimalPackage().manifest, permissions: [{ capability: 'op.submit', resources: ['run_workshop_activity', 'add_stat'] }] },
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'button', label: '开始', action: { type: 'submit-op', op: 'run_workshop_activity', payload: { ruleId: 'fish' } } }] }] },
      rules: { rules: [{ id: 'fish', actions: [{ type: 'submit-op', op: 'add_stat', payload: { target: 'player', key: 'fishing.skill', delta: 1 } }] }] },
    });
    expect(validateWorkshopPackage(pack).canInstall).toBe(true);
    const unsafe = WorkshopPackageSchema.parse({ ...pack, rules: { rules: [{ id: 'fish', actions: [{ type: 'submit-op', op: 'move_player', payload: { nodeId: 'elsewhere' } }] }] } });
    expect(validateWorkshopPackage(unsafe).issues).toContainEqual(expect.objectContaining({ code: 'unsupported-activity-op', severity: 'error' }));
  });

  it('keeps world bindings deterministic and isolated by save id', () => {
    expect(workshopBindingId('world-a', 'sample.activity')).toBe('world-a:sample.activity');
    expect(workshopBindingId('world-b', 'sample.activity')).not.toBe(workshopBindingId('world-a', 'sample.activity'));
  });

  it('rejects local-state actions that cannot be persisted by the restricted runtime', () => {
    const pack = WorkshopPackageSchema.parse({
      ...minimalPackage(),
      manifest: { ...minimalPackage().manifest, permissions: [{ capability: 'app.local-state' }] },
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'button', label: '保存', action: { type: 'set-local', key: 'note', value: 'x'.repeat(2001) } }] }] },
    });
    const report = validateWorkshopPackage(pack);
    expect(report.canInstall).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'invalid-local-state', severity: 'error' }));
  });
});
