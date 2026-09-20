import { describe, expect, it } from 'vitest';
import { WorkshopBindingSchema, WorkshopLocalStateSchema, WorkshopPackageRecordSchema } from '../src/data/workshop';
import { auditWorkshopIntegrity } from '../src/data/workshop-integrity';

const timestamp = '2026-09-20T00:00:00.000Z';

function record() {
  return WorkshopPackageRecordSchema.parse({
    id: 'integrity.app',
    package: {
      manifest: { type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'integrity.app', name: '完整性', author: 'Tester', version: '1.0.0', permissions: [], iconAssetId: 'icon' },
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'image', assetId: 'icon', alt: '图标' }] }] },
      rules: { rules: [] },
      assetMeta: { assets: [{ id: 'icon', path: 'assets/icon.png', mimeType: 'image/png', bytes: 4 }] },
    },
    assetBindings: { icon: { kind: 'stored', assetId: 'stored-icon' } },
    installedAt: timestamp,
    updatedAt: timestamp,
  });
}

describe('workshop integrity audit', () => {
  it('accepts coherent packages, bindings, states and stored assets', () => {
    const binding = WorkshopBindingSchema.parse({ id: 'world:integrity.app', saveId: 'world', packageId: 'integrity.app', enabled: true, createdAt: timestamp, updatedAt: timestamp });
    const state = WorkshopLocalStateSchema.parse({ id: 'world:integrity.app', saveId: 'world', packageId: 'integrity.app', values: { note: '用户数据' }, updatedAt: timestamp });
    expect(auditWorkshopIntegrity([record()], [binding], [state], new Set(['stored-icon']))).toEqual({
      packageCount: 1,
      bindingCount: 1,
      localStateCount: 1,
      retainedLocalStateCount: 0,
      referencedAssetCount: 1,
      issues: [],
    });
  });

  it('reports dangling bindings, invalid ids and missing package assets', () => {
    const binding = WorkshopBindingSchema.parse({ id: 'wrong-binding-id', saveId: 'world', packageId: 'missing.package', enabled: true, createdAt: timestamp, updatedAt: timestamp });
    const state = WorkshopLocalStateSchema.parse({ id: 'wrong-state-id', saveId: 'world', packageId: 'integrity.app', values: {}, updatedAt: timestamp });
    const report = auditWorkshopIntegrity([record()], [binding], [state], new Set());
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-stored-asset', packageId: 'integrity.app' }),
      expect.objectContaining({ code: 'dangling-binding', packageId: 'missing.package' }),
      expect.objectContaining({ code: 'binding-id-mismatch' }),
      expect.objectContaining({ code: 'state-id-mismatch' }),
    ]));
  });

  it('counts uninstall-retained local state without treating user data as corruption', () => {
    const retained = WorkshopLocalStateSchema.parse({ id: 'world:removed.app', saveId: 'world', packageId: 'removed.app', values: { note: '不要删除' }, updatedAt: timestamp });
    const report = auditWorkshopIntegrity([], [], [retained], new Set());
    expect(report.retainedLocalStateCount).toBe(1);
    expect(report.issues).toEqual([]);
  });

  it('reports incomplete asset mappings and missing declared dependencies', () => {
    const dependent = record();
    dependent.id = 'dependent.app';
    dependent.package.manifest.id = 'dependent.app';
    dependent.package.manifest.dependencies = [{ id: 'missing.library', minVersion: '1.0.0' }];
    dependent.assetBindings = {};
    const report = auditWorkshopIntegrity([dependent], [], [], new Set());
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-asset-binding', packageId: 'dependent.app' }),
      expect.objectContaining({ code: 'invalid-dependency', packageId: 'dependent.app' }),
    ]));
  });
});
