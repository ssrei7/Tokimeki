import type { WorkshopBinding, WorkshopDependency, WorkshopPackage, WorkshopPackageRecord } from './workshop';
import { compareWorkshopVersions } from './workshop-version';

export interface WorkshopDependencyAnalysis {
  canApply: boolean;
  issues: string[];
}

export function workshopDependencyLabel(dependency: WorkshopDependency): string {
  if (dependency.minVersion && dependency.maxVersionExclusive) return `${dependency.id}（>= ${dependency.minVersion} 且 < ${dependency.maxVersionExclusive}）`;
  if (dependency.minVersion) return `${dependency.id}（>= ${dependency.minVersion}）`;
  if (dependency.maxVersionExclusive) return `${dependency.id}（< ${dependency.maxVersionExclusive}）`;
  return dependency.id;
}

export function workshopDependencyAcceptsVersion(dependency: WorkshopDependency, version: string): boolean {
  if (dependency.minVersion && compareWorkshopVersions(version, dependency.minVersion) < 0) return false;
  if (dependency.maxVersionExclusive && compareWorkshopVersions(version, dependency.maxVersionExclusive) >= 0) return false;
  return true;
}

export function listWorkshopPackageDependents(packageId: string, records: readonly WorkshopPackageRecord[]): WorkshopPackageRecord[] {
  return records.filter((record) => record.id !== packageId && (record.package.manifest.dependencies ?? []).some((dependency) => dependency.id === packageId));
}

export function listEnabledWorkshopPackageDependents(packageId: string, saveId: string, records: readonly WorkshopPackageRecord[], bindings: readonly WorkshopBinding[]): WorkshopPackageRecord[] {
  const enabled = new Set(bindings.filter((binding) => binding.saveId === saveId && binding.enabled).map((binding) => binding.packageId));
  return listWorkshopPackageDependents(packageId, records).filter((record) => enabled.has(record.id));
}

export function resolveEnabledWorkshopPackages(saveId: string, records: readonly WorkshopPackageRecord[], bindings: readonly WorkshopBinding[]): WorkshopPackageRecord[] {
  const packages = new Map(records.map((record) => [record.id, record]));
  const enabled = new Set(bindings.filter((binding) => binding.saveId === saveId && binding.enabled).map((binding) => binding.packageId));
  const remaining = new Map(records.filter((record) => enabled.has(record.id)).map((record) => [record.id, record]));
  const usable = new Map<string, WorkshopPackageRecord>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [packageId, record] of remaining) {
      const ready = (record.package.manifest.dependencies ?? []).every((dependency) => {
        const installed = packages.get(dependency.id);
        return Boolean(installed && enabled.has(dependency.id) && usable.has(dependency.id) && workshopDependencyAcceptsVersion(dependency, installed.package.manifest.version));
      });
      if (!ready) continue;
      usable.set(packageId, record);
      remaining.delete(packageId);
      changed = true;
    }
  }
  return records.filter((record) => usable.has(record.id));
}

function findReachableCycle(startId: string, packages: ReadonlyMap<string, WorkshopPackage>): string[] | undefined {
  const visited = new Set<string>();
  const active = new Map<string, number>();
  const path: string[] = [];
  const visit = (packageId: string): string[] | undefined => {
    const activeIndex = active.get(packageId);
    if (activeIndex !== undefined) return [...path.slice(activeIndex), packageId];
    if (visited.has(packageId)) return undefined;
    visited.add(packageId);
    active.set(packageId, path.length);
    path.push(packageId);
    for (const dependency of packages.get(packageId)?.manifest.dependencies ?? []) {
      if (!packages.has(dependency.id)) continue;
      const cycle = visit(dependency.id);
      if (cycle) return cycle;
    }
    path.pop();
    active.delete(packageId);
    return undefined;
  };
  return visit(startId);
}

function hasUsableDependencyChain(packageId: string, saveId: string, packages: ReadonlyMap<string, WorkshopPackage>, bindings: readonly WorkshopBinding[], active = new Set<string>()): boolean {
  if (active.has(packageId)) return false;
  const pack = packages.get(packageId);
  if (!pack || !bindings.some((binding) => binding.saveId === saveId && binding.packageId === packageId && binding.enabled)) return false;
  const nextActive = new Set(active).add(packageId);
  return (pack.manifest.dependencies ?? []).every((dependency) => {
    const installed = packages.get(dependency.id);
    return Boolean(installed && workshopDependencyAcceptsVersion(dependency, installed.manifest.version) && hasUsableDependencyChain(dependency.id, saveId, packages, bindings, nextActive));
  });
}

export function analyzeWorkshopPackageDependencies(candidate: WorkshopPackage, records: readonly WorkshopPackageRecord[], bindings: readonly WorkshopBinding[] = [], enabledSaveIds: readonly string[] = []): WorkshopDependencyAnalysis {
  const packages = new Map(records.map((record) => [record.id, record.package]));
  packages.set(candidate.manifest.id, candidate);
  const issues: string[] = [];
  for (const dependency of candidate.manifest.dependencies ?? []) {
    const installed = packages.get(dependency.id);
    if (!installed) {
      issues.push(`缺少依赖：${workshopDependencyLabel(dependency)}。`);
      continue;
    }
    if (!workshopDependencyAcceptsVersion(dependency, installed.manifest.version)) {
      issues.push(`依赖版本不兼容：${workshopDependencyLabel(dependency)}，当前已安装 ${installed.manifest.version}。`);
      continue;
    }
    for (const saveId of enabledSaveIds) {
      if (!hasUsableDependencyChain(dependency.id, saveId, packages, bindings)) issues.push(`世界 ${saveId} 中依赖 ${dependency.id} 或其依赖链尚未全部启用并满足版本。`);
    }
  }
  for (const dependent of records) {
    if (dependent.id === candidate.manifest.id) continue;
    const dependency = (dependent.package.manifest.dependencies ?? []).find((entry) => entry.id === candidate.manifest.id);
    if (dependency && !workshopDependencyAcceptsVersion(dependency, candidate.manifest.version)) {
      issues.push(`更新会破坏 ${dependent.id} 的版本依赖：${workshopDependencyLabel(dependency)}。`);
    }
  }
  const cycle = findReachableCycle(candidate.manifest.id, packages);
  if (cycle) issues.push(`检测到依赖环：${cycle.join(' → ')}。`);
  return { canApply: issues.length === 0, issues: [...new Set(issues)] };
}

export function assertWorkshopPackageDependencies(analysis: WorkshopDependencyAnalysis): void {
  if (!analysis.canApply) throw new Error(analysis.issues.join('；'));
}
