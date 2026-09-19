import { WorkshopPackageSchema, validateWorkshopPackage, type WorkshopAssetPayload, type WorkshopPackage, type WorkshopValidationIssue, type WorkshopValidationReport } from '../data/workshop';

export const WORKSHOP_EDITOR_SOURCE_LIMIT = 8 * 1024 * 1024;

export function createWorkshopEditorTemplate(): WorkshopPackage {
  return WorkshopPackageSchema.parse({
    manifest: {
      type: 'workshop',
      packageVersion: 1,
      runtimeVersion: 1,
      id: 'my.local-app',
      name: '我的本地 App',
      author: 'Player',
      version: '1.0.0',
      description: '由本地声明式编辑器创建。',
      permissions: [],
    },
    app: {
      entryPageId: 'home',
      pages: [{ id: 'home', title: '首页', components: [{ kind: 'title', text: '你好', level: 2 }, { kind: 'text', text: '这是一个纯本地声明式 App。' }] }],
    },
    rules: { rules: [] },
  });
}

export function workshopEditorSource(pack: WorkshopPackage): string {
  return JSON.stringify(pack, null, 2);
}

export interface WorkshopDraftAnalysis {
  package?: WorkshopPackage;
  report: WorkshopValidationReport;
  canExport: boolean;
}

function parseIssue(message: string, path?: string): WorkshopValidationIssue {
  return { severity: 'error', code: 'draft-parse', message, ...(path ? { path } : {}) };
}

export function analyzeWorkshopDraft(source: string, installedIds: ReadonlySet<string>, assets: ReadonlyMap<string, WorkshopAssetPayload>): WorkshopDraftAnalysis {
  if (source.length > WORKSHOP_EDITOR_SOURCE_LIMIT) {
    const issue = parseIssue(`编辑内容超过 ${WORKSHOP_EDITOR_SOURCE_LIMIT / 1024 / 1024} MiB 限制。`);
    return { report: { canInstall: false, issues: [issue], requiredPermissions: [] }, canExport: false };
  }
  let raw: unknown;
  try { raw = JSON.parse(source); }
  catch (error) {
    const issue = parseIssue(error instanceof Error ? `JSON 解析失败：${error.message}` : 'JSON 解析失败。');
    return { report: { canInstall: false, issues: [issue], requiredPermissions: [] }, canExport: false };
  }
  const parsed = WorkshopPackageSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => parseIssue(issue.message, issue.path.map(String).join('.')));
    return { report: { canInstall: false, issues, requiredPermissions: [] }, canExport: false };
  }

  const validation = validateWorkshopPackage(parsed.data);
  const issues = [...validation.issues];
  const declaredAssets = new Map((parsed.data.assetMeta?.assets ?? []).map((asset) => [asset.id, asset]));
  for (const [id, meta] of declaredAssets) {
    const payload = assets.get(id);
    if (!payload) issues.push({ severity: 'error', code: 'asset-payload-missing', message: `编辑草稿缺少资产载荷：${id}`, path: 'assetMeta.assets' });
    else {
      if (payload.bytes.byteLength !== meta.bytes) issues.push({ severity: 'error', code: 'asset-size-conflict', message: `资产 ${id} 的实际大小与 asset-meta 声明不一致。`, path: 'assetMeta.assets' });
      if (payload.mimeType !== meta.mimeType) issues.push({ severity: 'error', code: 'asset-type-conflict', message: `资产 ${id} 的实际类型与 asset-meta 声明不一致。`, path: 'assetMeta.assets' });
    }
  }
  for (const id of assets.keys()) if (!declaredAssets.has(id)) issues.push({ severity: 'warning', code: 'asset-payload-unused', message: `载入的资产 ${id} 未在 asset-meta 中声明，导出和安装时会忽略。` });
  const exportErrors = issues.some((issue) => issue.severity === 'error');
  if (installedIds.has(parsed.data.manifest.id)) issues.push({ severity: 'error', code: 'package-id-conflict', message: `本机已安装同 ID 包：${parsed.data.manifest.id}。当前不支持覆盖更新，请改用新 ID。`, path: 'manifest.id' });
  return {
    package: parsed.data,
    report: { canInstall: !issues.some((issue) => issue.severity === 'error'), issues, requiredPermissions: validation.requiredPermissions },
    canExport: !exportErrors,
  };
}
