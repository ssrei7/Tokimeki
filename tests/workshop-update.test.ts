import { beforeEach, describe, expect, it, vi } from 'vitest';

const assetMocks = vi.hoisted(() => ({
  deleteAsset: vi.fn(),
  loadAsset: vi.fn(),
  saveAsset: vi.fn(),
}));

const contentMocks = vi.hoisted(() => ({
  deleteWorkshopPackage: vi.fn(),
  installWorkshopPackageRecord: vi.fn(),
  listWorkshopBindings: vi.fn(),
  loadWorkshopPackage: vi.fn(),
  replaceWorkshopPackageRecord: vi.fn(),
  setWorkshopBinding: vi.fn(),
}));

vi.mock('../src/data/db/assets', () => assetMocks);
vi.mock('../src/data/db/content', () => contentMocks);

import { updateWorkshopPackage } from '../src/data/workshop-install';
import { WorkshopPackageSchema, validateWorkshopPackage, type WorkshopPackage, type WorkshopPackageImport, type WorkshopPackageRecord } from '../src/data/workshop';
import { analyzeWorkshopPackageUpdate, compareWorkshopVersions } from '../src/data/workshop-update';

function pack(version: string, changes: Partial<WorkshopPackage> = {}): WorkshopPackage {
  const base = WorkshopPackageSchema.parse({
    manifest: { type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'sample.update', name: '更新示例', author: 'Tester', version, permissions: [] },
    app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'text', text: '本地内容' }] }] },
    rules: { rules: [] },
  });
  return WorkshopPackageSchema.parse({ ...base, ...changes });
}

function record(version = '1.0.0'): WorkshopPackageRecord {
  return {
    id: 'sample.update',
    package: pack(version),
    assetBindings: { old: { kind: 'stored', assetId: 'workshop-sample.update-old-kept' } },
    installedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function imported(next: WorkshopPackage): WorkshopPackageImport {
  return { package: next, assets: new Map(), report: validateWorkshopPackage(next) };
}

describe('workshop package updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contentMocks.loadWorkshopPackage.mockResolvedValue(record());
    contentMocks.listWorkshopBindings.mockResolvedValue([
      { id: 'world-a:sample.update', saveId: 'world-a', packageId: 'sample.update', enabled: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'world-b:sample.update', saveId: 'world-b', packageId: 'sample.update', enabled: false, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
    ]);
    contentMocks.replaceWorkshopPackageRecord.mockImplementation(async (next) => next);
    assetMocks.saveAsset.mockResolvedValue(undefined);
    assetMocks.deleteAsset.mockResolvedValue(undefined);
  });

  it('compares all three numeric version parts without Number precision loss', () => {
    expect(compareWorkshopVersions('1.10.0', '1.9.99')).toBe(1);
    expect(compareWorkshopVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareWorkshopVersions('9007199254740993.0.0', '9007199254740992.999.999')).toBe(1);
  });

  it('summarizes bindings, permission changes and identity changes before confirmation', () => {
    const next = pack('2.0.0', {
      manifest: { ...pack('2.0.0').manifest, name: '新名称', author: 'New Author', permissions: [{ capability: 'app.local-state' }] },
      app: { entryPageId: 'home', pages: [{ id: 'home', title: '首页', components: [{ kind: 'input', key: 'note', label: '笔记' }] }] },
    });
    const analysis = analyzeWorkshopPackageUpdate(record(), next, [
      { id: 'world-a:sample.update', saveId: 'world-a', packageId: 'sample.update', enabled: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'world-b:sample.update', saveId: 'world-b', packageId: 'sample.update', enabled: false, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
    ]);
    expect(analysis).toMatchObject({ canUpdate: true, affectedWorlds: 2, enabledWorlds: 1, authorChanged: true, nameChanged: true });
    expect(analysis.addedPermissions).toContain('app.local-state');
  });

  it('replaces only the package record and preserves install time, bindings, state and old assets', async () => {
    const next = pack('1.1.0');
    const result = await updateWorkshopPackage(imported(next), '2026-09-20T12:00:00.000Z');
    expect(contentMocks.replaceWorkshopPackageRecord).toHaveBeenCalledWith(expect.objectContaining({
      id: 'sample.update',
      package: next,
      installedAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-20T12:00:00.000Z',
    }), '1.0.0');
    expect(contentMocks.installWorkshopPackageRecord).not.toHaveBeenCalled();
    expect(contentMocks.setWorkshopBinding).not.toHaveBeenCalled();
    expect(result.analysis).toMatchObject({ affectedWorlds: 2, enabledWorlds: 1 });
    expect(result.retainedAssetIds).toEqual(['workshop-sample.update-old-kept']);
    expect(assetMocks.deleteAsset).not.toHaveBeenCalled();
  });

  it('rejects same-version and downgrade attempts before writing assets', async () => {
    await expect(updateWorkshopPackage(imported(pack('1.0.0')))).rejects.toThrow('必须提高');
    await expect(updateWorkshopPackage(imported(pack('0.9.9')))).rejects.toThrow('不能从 1.0.0 降级');
    expect(assetMocks.saveAsset).not.toHaveBeenCalled();
    expect(contentMocks.replaceWorkshopPackageRecord).not.toHaveBeenCalled();
  });

  it('deletes only newly written assets when the atomic package replacement fails', async () => {
    const next = WorkshopPackageSchema.parse({
      ...pack('1.1.0'),
      manifest: { ...pack('1.1.0').manifest, iconAssetId: 'icon' },
      assetMeta: { assets: [{ id: 'icon', path: 'assets/icon.png', mimeType: 'image/png', bytes: 4 }] },
    });
    const draft = imported(next);
    draft.assets.set('icon', { id: 'icon', path: 'assets/icon.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3, 4]) });
    contentMocks.replaceWorkshopPackageRecord.mockRejectedValueOnce(new Error('concurrent update'));
    await expect(updateWorkshopPackage(draft)).rejects.toThrow('concurrent update');
    const createdAssetId = assetMocks.saveAsset.mock.calls[0]?.[0].id as string;
    expect(createdAssetId).toMatch(/^workshop-sample\.update-icon-/);
    expect(assetMocks.deleteAsset).toHaveBeenCalledWith(createdAssetId);
    expect(assetMocks.deleteAsset).not.toHaveBeenCalledWith('workshop-sample.update-old-kept');
  });
});
