export interface AssetReferenceRoot {
  label: string;
  value: unknown;
}

export interface AuditedAsset {
  id: string;
  size: number;
  mimeType: string;
  category?: string;
}

export interface MissingAssetReference {
  assetId: string;
  sources: string[];
  empty: boolean;
}

export interface OrphanAsset {
  assetId: string;
  size: number;
  mimeType: string;
  category?: string;
}

export interface AssetIntegrityReport {
  referenceCount: number;
  referencedAssetCount: number;
  storedAssetCount: number;
  missing: MissingAssetReference[];
  orphaned: OrphanAsset[];
}

interface LocatedReference {
  assetId: string;
  source: string;
}

export function collectStoredAssetReferences(roots: readonly AssetReferenceRoot[]): LocatedReference[] {
  const references: LocatedReference[] = [];
  for (const root of roots) {
    const seen = new Set<object>();
    const visit = (candidate: unknown, path: string): void => {
      if (!candidate || typeof candidate !== 'object') return;
      if (seen.has(candidate)) return;
      seen.add(candidate);
      if ('kind' in candidate && 'assetId' in candidate && candidate.kind === 'stored' && typeof candidate.assetId === 'string') {
        references.push({ assetId: candidate.assetId, source: `${root.label}${path}` });
        return;
      }
      if (Array.isArray(candidate)) {
        candidate.forEach((child, index) => visit(child, `${path}[${index}]`));
        return;
      }
      for (const [key, child] of Object.entries(candidate)) visit(child, `${path}.${key}`);
    };
    visit(root.value, '');
  }
  return references;
}

export function auditAssetReferences(roots: readonly AssetReferenceRoot[], assets: readonly AuditedAsset[]): AssetIntegrityReport {
  const references = collectStoredAssetReferences(roots);
  const stored = new Map(assets.map((asset) => [asset.id, asset]));
  const sources = new Map<string, Set<string>>();
  for (const reference of references) {
    const current = sources.get(reference.assetId) ?? new Set<string>();
    current.add(reference.source);
    sources.set(reference.assetId, current);
  }
  const missing = [...sources.entries()]
    .filter(([assetId]) => !stored.get(assetId)?.size)
    .map(([assetId, locations]) => ({ assetId, sources: [...locations].sort(), empty: stored.has(assetId) }))
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
  const orphaned = assets
    .filter((asset) => !sources.has(asset.id))
    .map((asset) => ({ assetId: asset.id, size: asset.size, mimeType: asset.mimeType, ...(asset.category ? { category: asset.category } : {}) }))
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
  return {
    referenceCount: references.length,
    referencedAssetCount: sources.size,
    storedAssetCount: assets.length,
    missing,
    orphaned,
  };
}
