import { describe, expect, it } from 'vitest';
import { analyzeWorkshopPackageDependencies, listEnabledWorkshopPackageDependents, listWorkshopPackageDependents, resolveEnabledWorkshopPackages, workshopDependencyAcceptsVersion } from '../src/data/workshop-dependencies';
import { WorkshopPackageSchema, validateWorkshopPackage, type WorkshopBinding, type WorkshopPackage, type WorkshopPackageRecord } from '../src/data/workshop';

function pack(id: string, version = '1.0.0', dependencies: WorkshopPackage['manifest']['dependencies'] = undefined): WorkshopPackage {
  return WorkshopPackageSchema.parse({
    manifest: { type: 'workshop', packageVersion: 1, runtimeVersion: 1, id, name: id, author: 'Tester', version, permissions: [], ...(dependencies ? { dependencies } : {}) },
    app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'text', text: '本地内容' }] }] },
    rules: { rules: [] },
  });
}

function record(packageValue: WorkshopPackage): WorkshopPackageRecord {
  return { id: packageValue.manifest.id, package: packageValue, assetBindings: {}, installedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
}

function binding(saveId: string, packageId: string, enabled: boolean): WorkshopBinding {
  return { id: `${saveId}:${packageId}`, saveId, packageId, enabled, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
}

describe('workshop package dependencies', () => {
  it('uses inclusive minimum and exclusive maximum version bounds', () => {
    const dependency = { id: 'shared.core', minVersion: '1.2.0', maxVersionExclusive: '2.0.0' } as const;
    expect(workshopDependencyAcceptsVersion(dependency, '1.2.0')).toBe(true);
    expect(workshopDependencyAcceptsVersion(dependency, '1.9.9')).toBe(true);
    expect(workshopDependencyAcceptsVersion(dependency, '1.1.9')).toBe(false);
    expect(workshopDependencyAcceptsVersion(dependency, '2.0.0')).toBe(false);
  });

  it('rejects duplicate and self dependencies in the normal package report', () => {
    const self = pack('sample.self', '1.0.0', [{ id: 'sample.self' }, { id: 'shared.core' }, { id: 'shared.core', minVersion: '1.0.0' }]);
    const report = validateWorkshopPackage(self);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'self-dependency', severity: 'error' }),
      expect.objectContaining({ code: 'duplicate-dependency', severity: 'error' }),
    ]));
    expect(report.canInstall).toBe(false);
    expect(() => pack('sample.range', '1.0.0', [{ id: 'shared.core', minVersion: '2.0.0', maxVersionExclusive: '2.0.0' }])).toThrow('minVersion');
  });

  it('requires compatible installed dependencies to be enabled in every target world', () => {
    const shared = record(pack('shared.core', '1.5.0'));
    const candidate = pack('sample.app', '1.0.0', [{ id: 'shared.core', minVersion: '1.2.0', maxVersionExclusive: '2.0.0' }]);
    expect(analyzeWorkshopPackageDependencies(candidate, [shared], [binding('world-a', 'shared.core', true)], ['world-a']).canApply).toBe(true);
    expect(analyzeWorkshopPackageDependencies(candidate, [], [], ['world-a']).issues).toContainEqual(expect.stringContaining('缺少依赖'));
    expect(analyzeWorkshopPackageDependencies(candidate, [record(pack('shared.core', '2.0.0'))], [], ['world-a']).issues).toContainEqual(expect.stringContaining('版本不兼容'));
    expect(analyzeWorkshopPackageDependencies(candidate, [shared], [binding('world-a', 'shared.core', false)], ['world-a']).issues).toContainEqual(expect.stringContaining('依赖链尚未全部启用'));
  });

  it('blocks upgrades that violate dependents and rejects reachable dependency cycles', () => {
    const current = record(pack('shared.core', '1.5.0'));
    const dependent = record(pack('sample.app', '1.0.0', [{ id: 'shared.core', maxVersionExclusive: '2.0.0' }]));
    const incompatible = analyzeWorkshopPackageDependencies(pack('shared.core', '2.0.0'), [current, dependent]);
    expect(incompatible.issues).toContainEqual(expect.stringContaining('更新会破坏 sample.app'));

    const left = record(pack('cycle.left', '1.0.0', [{ id: 'cycle.right' }]));
    const right = pack('cycle.right', '1.0.0', [{ id: 'cycle.left' }]);
    expect(analyzeWorkshopPackageDependencies(right, [left]).issues).toContainEqual(expect.stringContaining('cycle.right → cycle.left → cycle.right'));
  });

  it('finds global and per-world enabled dependents for lifecycle protection', () => {
    const shared = record(pack('shared.core'));
    const dependent = record(pack('sample.app', '1.0.0', [{ id: 'shared.core' }]));
    expect(listWorkshopPackageDependents('shared.core', [shared, dependent]).map((item) => item.id)).toEqual(['sample.app']);
    expect(listEnabledWorkshopPackageDependents('shared.core', 'world-a', [shared, dependent], [binding('world-a', 'sample.app', true)])).toHaveLength(1);
    expect(listEnabledWorkshopPackageDependents('shared.core', 'world-b', [shared, dependent], [binding('world-a', 'sample.app', true)])).toHaveLength(0);
  });

  it('fails closed at runtime for missing, transitive or cyclic enabled dependencies', () => {
    const shared = record(pack('shared.core'));
    const middle = record(pack('shared.middle', '1.0.0', [{ id: 'shared.core' }]));
    const app = record(pack('sample.app', '1.0.0', [{ id: 'shared.middle' }]));
    const allEnabled = [binding('world-a', 'shared.core', true), binding('world-a', 'shared.middle', true), binding('world-a', 'sample.app', true)];
    expect(resolveEnabledWorkshopPackages('world-a', [shared, middle, app], allEnabled).map((item) => item.id)).toEqual(['shared.core', 'shared.middle', 'sample.app']);
    expect(resolveEnabledWorkshopPackages('world-a', [app, middle, shared], allEnabled).map((item) => item.id)).toEqual(['shared.core', 'shared.middle', 'sample.app']);
    expect(resolveEnabledWorkshopPackages('world-a', [shared, middle, app], allEnabled.filter((item) => item.packageId !== 'shared.core'))).toEqual([]);

    const left = record(pack('cycle.left', '1.0.0', [{ id: 'cycle.right' }]));
    const right = record(pack('cycle.right', '1.0.0', [{ id: 'cycle.left' }]));
    expect(resolveEnabledWorkshopPackages('world-a', [left, right], [binding('world-a', 'cycle.left', true), binding('world-a', 'cycle.right', true)])).toEqual([]);
  });
});
