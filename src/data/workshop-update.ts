import { validateWorkshopPackage, type WorkshopBinding, type WorkshopPackage, type WorkshopPackageRecord } from './workshop';

export interface WorkshopPackageUpdateAnalysis {
  canUpdate: boolean;
  reason?: string;
  packageId: string;
  fromVersion: string;
  toVersion: string;
  affectedWorlds: number;
  enabledWorlds: number;
  addedPermissions: string[];
  removedPermissions: string[];
  authorChanged: boolean;
  nameChanged: boolean;
}

function versionParts(version: string): [bigint, bigint, bigint] {
  const parts = version.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) throw new Error(`无效的工坊包版本：${version}`);
  return [BigInt(parts[0]), BigInt(parts[1]), BigInt(parts[2])];
}

export function compareWorkshopVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] < rightParts[index]) return -1;
    if (leftParts[index] > rightParts[index]) return 1;
  }
  return 0;
}

export function analyzeWorkshopPackageUpdate(current: WorkshopPackageRecord, incoming: WorkshopPackage, bindings: readonly WorkshopBinding[]): WorkshopPackageUpdateAnalysis {
  const currentPermissions = new Set(validateWorkshopPackage(current.package).requiredPermissions);
  const incomingReport = validateWorkshopPackage(incoming);
  const incomingPermissions = new Set(incomingReport.requiredPermissions);
  const relevantBindings = bindings.filter((binding) => binding.packageId === current.id);
  const affectedWorldIds = new Set(relevantBindings.map((binding) => binding.saveId));
  const enabledWorldIds = new Set(relevantBindings.filter((binding) => binding.enabled).map((binding) => binding.saveId));
  const result: WorkshopPackageUpdateAnalysis = {
    canUpdate: true,
    packageId: incoming.manifest.id,
    fromVersion: current.package.manifest.version,
    toVersion: incoming.manifest.version,
    affectedWorlds: affectedWorldIds.size,
    enabledWorlds: enabledWorldIds.size,
    addedPermissions: [...incomingPermissions].filter((permission) => !currentPermissions.has(permission)).sort(),
    removedPermissions: [...currentPermissions].filter((permission) => !incomingPermissions.has(permission)).sort(),
    authorChanged: current.package.manifest.author !== incoming.manifest.author,
    nameChanged: current.package.manifest.name !== incoming.manifest.name,
  };
  if (current.id !== incoming.manifest.id || current.package.manifest.id !== incoming.manifest.id) {
    return { ...result, canUpdate: false, reason: '更新包 ID 必须与已安装包完全一致。' };
  }
  if (!incomingReport.canInstall) return { ...result, canUpdate: false, reason: '更新包未通过完整校验。' };
  const comparison = compareWorkshopVersions(incoming.manifest.version, current.package.manifest.version);
  if (comparison === 0) return { ...result, canUpdate: false, reason: `已安装版本也是 ${current.package.manifest.version}，必须提高 x.y.z 版本号。` };
  if (comparison < 0) return { ...result, canUpdate: false, reason: `不能从 ${current.package.manifest.version} 降级到 ${incoming.manifest.version}。` };
  return result;
}

export function assertWorkshopPackageUpdate(analysis: WorkshopPackageUpdateAnalysis): void {
  if (!analysis.canUpdate) throw new Error(analysis.reason ?? '工坊包不能更新。');
}
