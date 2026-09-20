import { validateWorkshopPackage, workshopBindingId, type WorkshopBinding, type WorkshopLocalState, type WorkshopPackageRecord } from './workshop';
import { analyzeWorkshopPackageDependencies } from './workshop-dependencies';

export interface WorkshopIntegrityIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  packageId?: string;
  recordId?: string;
}

export interface WorkshopIntegrityReport {
  packageCount: number;
  bindingCount: number;
  localStateCount: number;
  retainedLocalStateCount: number;
  referencedAssetCount: number;
  issues: WorkshopIntegrityIssue[];
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

export function auditWorkshopIntegrity(records: readonly WorkshopPackageRecord[], bindings: readonly WorkshopBinding[], states: readonly WorkshopLocalState[], storedAssetIds?: ReadonlySet<string>): WorkshopIntegrityReport {
  const issues: WorkshopIntegrityIssue[] = [];
  const packages = new Map(records.map((record) => [record.id, record]));
  const add = (issue: WorkshopIntegrityIssue) => issues.push(issue);

  for (const id of duplicates(records.map((record) => record.id))) add({ severity: 'error', code: 'duplicate-package-record', message: `工坊包记录 ID 重复：${id}`, packageId: id });
  for (const id of duplicates(bindings.map((binding) => binding.id))) add({ severity: 'error', code: 'duplicate-binding-record', message: `工坊世界绑定 ID 重复：${id}`, recordId: id });
  for (const id of duplicates(states.map((state) => state.id))) add({ severity: 'error', code: 'duplicate-state-record', message: `工坊本地状态 ID 重复：${id}`, recordId: id });

  let referencedAssetCount = 0;
  for (const record of records) {
    if (record.id !== record.package.manifest.id) add({ severity: 'error', code: 'package-id-mismatch', message: `包记录 ID ${record.id} 与 manifest ID ${record.package.manifest.id} 不一致。`, packageId: record.id });
    const validation = validateWorkshopPackage(record.package);
    const validationErrors = validation.issues.filter((issue) => issue.severity === 'error');
    if (validationErrors.length) add({ severity: 'error', code: 'invalid-package', message: `已安装包未通过完整校验：${validationErrors.slice(0, 3).map((issue) => issue.message).join('；')}`, packageId: record.id });

    const declaredAssets = new Set(record.package.assetMeta?.assets.map((asset) => asset.id) ?? []);
    for (const logicalId of declaredAssets) {
      const reference = record.assetBindings[logicalId];
      if (!reference) add({ severity: 'error', code: 'missing-asset-binding', message: `资产 ${logicalId} 缺少本地映射。`, packageId: record.id });
      else {
        referencedAssetCount += 1;
        if (storedAssetIds && !storedAssetIds.has(reference.assetId)) add({ severity: 'error', code: 'missing-stored-asset', message: `资产 ${logicalId} 指向不存在的本地二进制 ${reference.assetId}。`, packageId: record.id });
      }
    }
    for (const logicalId of Object.keys(record.assetBindings)) if (!declaredAssets.has(logicalId)) add({ severity: 'warning', code: 'unused-asset-binding', message: `本地资产映射 ${logicalId} 未在 asset-meta 中声明。`, packageId: record.id });

    const enabledSaveIds = bindings.filter((binding) => binding.packageId === record.id && binding.enabled).map((binding) => binding.saveId);
    const dependencyAnalysis = analyzeWorkshopPackageDependencies(record.package, records, bindings, enabledSaveIds);
    for (const message of dependencyAnalysis.issues) add({ severity: 'error', code: 'invalid-dependency', message, packageId: record.id });
  }

  for (const binding of bindings) {
    if (!packages.has(binding.packageId)) add({ severity: 'error', code: 'dangling-binding', message: `世界绑定指向不存在的工坊包：${binding.packageId}`, recordId: binding.id, packageId: binding.packageId });
    if (binding.id !== workshopBindingId(binding.saveId, binding.packageId)) add({ severity: 'error', code: 'binding-id-mismatch', message: `世界绑定 ID 与 saveId + packageId 不一致：${binding.id}`, recordId: binding.id, packageId: binding.packageId });
  }

  let retainedLocalStateCount = 0;
  for (const state of states) {
    if (!packages.has(state.packageId)) retainedLocalStateCount += 1;
    if (state.id !== workshopBindingId(state.saveId, state.packageId)) add({ severity: 'error', code: 'state-id-mismatch', message: `本地 App 状态 ID 与 saveId + packageId 不一致：${state.id}`, recordId: state.id, packageId: state.packageId });
  }

  const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}:${issue.packageId ?? ''}:${issue.recordId ?? ''}:${issue.message}`, issue])).values()];
  return {
    packageCount: records.length,
    bindingCount: bindings.length,
    localStateCount: states.length,
    retainedLocalStateCount,
    referencedAssetCount,
    issues: uniqueIssues.sort((left, right) => left.severity.localeCompare(right.severity) || (left.packageId ?? left.recordId ?? '').localeCompare(right.packageId ?? right.recordId ?? '')),
  };
}
