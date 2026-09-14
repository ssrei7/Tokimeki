export interface StorageEstimate {
  usage?: number;
  quota?: number;
  persisted?: boolean;
}

export function formatStorageBytes(value: number | undefined): string {
  if (!Number.isFinite(value) || value === undefined || value < 0) return '未知';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function storageUsagePercent(estimate: Pick<StorageEstimate, 'usage' | 'quota'>): number | undefined {
  if (!Number.isFinite(estimate.usage) || !Number.isFinite(estimate.quota) || !estimate.quota || estimate.quota <= 0) return undefined;
  return Math.min(100, Math.max(0, (estimate.usage! / estimate.quota!) * 100));
}

export async function readStorageEstimate(): Promise<StorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage) return {};
  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate().catch(() => ({} as StorageEstimate)),
    typeof navigator.storage.persisted === 'function' ? navigator.storage.persisted().catch(() => undefined) : Promise.resolve(undefined),
  ]);
  return { usage: estimate.usage, quota: estimate.quota, persisted };
}

export async function requestPersistentStorage(): Promise<boolean | undefined> {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.persist !== 'function') return undefined;
  return navigator.storage.persist().catch(() => false);
}
