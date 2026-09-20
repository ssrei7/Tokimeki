import { deleteAsset, loadAsset, saveAsset } from './db/assets';
import { deleteWorkshopPackage, installWorkshopPackageRecord, listWorkshopBindings, listWorkshopPackages, loadWorkshopPackage, replaceWorkshopPackageRecord, setWorkshopBinding } from './db/content';
import { exportWorkshopPackage } from './io/workshop-package';
import { WorkshopBindingSchema, WorkshopPackageRecordSchema, workshopBindingId, type WorkshopBinding, type WorkshopPackageImport, type WorkshopPackageRecord } from './workshop';
import { analyzeWorkshopPackageDependencies, assertWorkshopPackageDependencies, listEnabledWorkshopPackageDependents, listWorkshopPackageDependents } from './workshop-dependencies';
import { analyzeWorkshopPackageUpdate, assertWorkshopPackageUpdate, type WorkshopPackageUpdateAnalysis } from './workshop-update';

function uniquePart(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function installWorkshopPackage(imported: WorkshopPackageImport, saveId: string, timestamp = new Date().toISOString()): Promise<WorkshopPackageRecord> {
  if (!imported.report.canInstall) throw new Error('工坊包未通过校验，不能安装。');
  const packageId = imported.package.manifest.id;
  const [records, bindings] = await Promise.all([listWorkshopPackages(), listWorkshopBindings()]);
  if (records.some((record) => record.id === packageId)) throw new Error(`已安装同 ID 工坊包：${packageId}。请提高版本号并使用更新流程。`);
  assertWorkshopPackageDependencies(analyzeWorkshopPackageDependencies(imported.package, records, bindings, [saveId]));
  const createdAssetIds: string[] = [];
  try {
    const assetBindings: WorkshopPackageRecord['assetBindings'] = {};
    for (const asset of imported.assets.values()) {
      const assetId = `workshop-${packageId}-${asset.id}-${uniquePart()}`;
      const copy = new ArrayBuffer(asset.bytes.byteLength);
      new Uint8Array(copy).set(asset.bytes);
      await saveAsset({
        id: assetId,
        blob: new Blob([copy], { type: asset.mimeType }),
        mimeType: asset.mimeType,
        category: 'image',
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
        createdAt: timestamp,
      });
      createdAssetIds.push(assetId);
      assetBindings[asset.id] = { kind: 'stored', assetId };
    }
    const record = WorkshopPackageRecordSchema.parse({ id: packageId, package: imported.package, assetBindings, installedAt: timestamp, updatedAt: timestamp });
    const binding = WorkshopBindingSchema.parse({ id: workshopBindingId(saveId, packageId), saveId, packageId, enabled: true, createdAt: timestamp, updatedAt: timestamp });
    return await installWorkshopPackageRecord(record, binding);
  } catch (error) {
    await Promise.all(createdAssetIds.map((assetId) => deleteAsset(assetId).catch(() => undefined)));
    throw error;
  }
}

export interface WorkshopPackageUpdateResult {
  record: WorkshopPackageRecord;
  analysis: WorkshopPackageUpdateAnalysis;
  retainedAssetIds: string[];
}

export async function updateWorkshopPackage(imported: WorkshopPackageImport, timestamp = new Date().toISOString()): Promise<WorkshopPackageUpdateResult> {
  if (!imported.report.canInstall) throw new Error('工坊包未通过校验，不能更新。');
  const packageId = imported.package.manifest.id;
  const current = await loadWorkshopPackage(packageId);
  if (!current) throw new Error(`尚未安装工坊包：${packageId}。请改用安装。`);
  const [records, bindings] = await Promise.all([listWorkshopPackages(), listWorkshopBindings()]);
  const analysis = analyzeWorkshopPackageUpdate(current, imported.package, bindings);
  assertWorkshopPackageUpdate(analysis);
  const enabledSaveIds = bindings.filter((binding) => binding.packageId === packageId && binding.enabled).map((binding) => binding.saveId);
  assertWorkshopPackageDependencies(analyzeWorkshopPackageDependencies(imported.package, records, bindings, enabledSaveIds));
  const createdAssetIds: string[] = [];
  try {
    const assetBindings: WorkshopPackageRecord['assetBindings'] = {};
    for (const asset of imported.assets.values()) {
      const assetId = `workshop-${packageId}-${asset.id}-${uniquePart()}`;
      const copy = new ArrayBuffer(asset.bytes.byteLength);
      new Uint8Array(copy).set(asset.bytes);
      await saveAsset({
        id: assetId,
        blob: new Blob([copy], { type: asset.mimeType }),
        mimeType: asset.mimeType,
        category: 'image',
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
        createdAt: timestamp,
      });
      createdAssetIds.push(assetId);
      assetBindings[asset.id] = { kind: 'stored', assetId };
    }
    const record = WorkshopPackageRecordSchema.parse({
      id: packageId,
      package: imported.package,
      assetBindings,
      installedAt: current.installedAt,
      updatedAt: timestamp,
    });
    const updated = await replaceWorkshopPackageRecord(record, current.package.manifest.version);
    return {
      record: updated,
      analysis,
      retainedAssetIds: [...new Set(Object.values(current.assetBindings).map((reference) => reference.assetId))],
    };
  } catch (error) {
    await Promise.all(createdAssetIds.map((assetId) => deleteAsset(assetId).catch(() => undefined)));
    throw error;
  }
}

export async function exportInstalledWorkshopPackage(record: WorkshopPackageRecord): Promise<Blob> {
  const assets = new Map<string, Uint8Array>();
  for (const [logicalId, reference] of Object.entries(record.assetBindings)) {
    const stored = await loadAsset(reference.assetId);
    if (!stored || stored.blob.size === 0) throw new Error(`工坊包资产缺失：${logicalId}`);
    assets.set(logicalId, new Uint8Array(await stored.blob.arrayBuffer()));
  }
  return exportWorkshopPackage(record.package, assets);
}

export async function setWorkshopPackageEnabled(saveId: string, packageId: string, enabled: boolean, timestamp = new Date().toISOString()): Promise<WorkshopBinding> {
  const [records, bindings] = await Promise.all([listWorkshopPackages(), listWorkshopBindings()]);
  const record = records.find((item) => item.id === packageId);
  if (!record) throw new Error(`工坊包不存在：${packageId}`);
  if (enabled) assertWorkshopPackageDependencies(analyzeWorkshopPackageDependencies(record.package, records, bindings, [saveId]));
  else {
    const dependents = listEnabledWorkshopPackageDependents(packageId, saveId, records, bindings);
    if (dependents.length) throw new Error(`当前世界仍有已启用包依赖它：${dependents.map((item) => item.id).join('、')}。请先停用这些包。`);
  }
  return setWorkshopBinding(saveId, packageId, enabled, timestamp);
}

export interface WorkshopUninstallResult {
  removedBindings: WorkshopBinding[];
  retainedAssetIds: string[];
}

export async function uninstallWorkshopPackage(packageId: string): Promise<WorkshopUninstallResult> {
  const record = await loadWorkshopPackage(packageId);
  if (!record) throw new Error(`工坊包不存在：${packageId}`);
  const dependents = listWorkshopPackageDependents(packageId, await listWorkshopPackages());
  if (dependents.length) throw new Error(`仍有已安装包依赖它：${dependents.map((item) => `${item.package.manifest.name}（${item.id}）`).join('、')}。请先卸载这些包。`);
  const removedBindings = await deleteWorkshopPackage(packageId);
  return { removedBindings, retainedAssetIds: Object.values(record.assetBindings).map((reference) => reference.assetId) };
}

export async function workshopPackageBindingSummary(packageId: string): Promise<WorkshopBinding[]> {
  return (await listWorkshopBindings()).filter((binding) => binding.packageId === packageId);
}

export async function workshopPackageDependentSummary(packageId: string): Promise<WorkshopPackageRecord[]> {
  return listWorkshopPackageDependents(packageId, await listWorkshopPackages());
}
