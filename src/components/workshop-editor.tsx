import { useEffect, useMemo, useState } from 'react';
import type { SaveFile } from '../data/schema/save';
import type { WorkshopAssetPayload, WorkshopLocalValue, WorkshopPackageImport, WorkshopPackageRecord, WorkshopValidationIssue } from '../data/workshop';
import { analyzeWorkshopDraft, createWorkshopEditorTemplate, WORKSHOP_EDITOR_SOURCE_LIMIT, workshopEditorSource } from '../ui/workshop-editor';
import { WorkshopPageRenderer } from './workshop-runtime';

function issueLabel(issue: WorkshopValidationIssue): string {
  return issue.severity === 'error' ? '错误' : issue.severity === 'warning' ? '警告' : '说明';
}

export function WorkshopEditor({ save, installedIds, initial, busy, onInstall, onExport, onClose }: {
  save: SaveFile;
  installedIds: ReadonlySet<string>;
  initial?: WorkshopPackageImport;
  busy: boolean;
  onInstall: (draft: WorkshopPackageImport) => Promise<void>;
  onExport: (draft: WorkshopPackageImport) => Promise<void>;
  onClose: () => void;
}) {
  const [source, setSource] = useState(() => workshopEditorSource(initial?.package ?? createWorkshopEditorTemplate()));
  const [assets] = useState<ReadonlyMap<string, WorkshopAssetPayload>>(() => new Map(initial?.assets ?? []));
  const [pageId, setPageId] = useState(initial?.package.app.entryPageId ?? 'home');
  const [values, setValues] = useState<Record<string, WorkshopLocalValue>>({});
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const analysis = useMemo(() => analyzeWorkshopDraft(source, installedIds, assets), [assets, installedIds, source]);
  const draftAssets = useMemo(() => {
    const declared = new Set(analysis.package?.assetMeta?.assets.map((asset) => asset.id) ?? []);
    return new Map([...assets].filter(([id]) => declared.has(id)));
  }, [analysis.package?.assetMeta?.assets, assets]);
  const previewRecord = useMemo<WorkshopPackageRecord | undefined>(() => analysis.package ? {
    id: analysis.package.manifest.id,
    package: analysis.package,
    assetBindings: {},
    installedAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
  } : undefined, [analysis.package]);

  useEffect(() => {
    setPageId(analysis.package?.app.entryPageId ?? 'home');
    setValues({});
  }, [analysis.package?.app.entryPageId, analysis.package?.manifest.id]);
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const [id, asset] of assets) urls[id] = URL.createObjectURL(new Blob([asset.bytes.slice().buffer], { type: asset.mimeType }));
    setAssetUrls(urls);
    return () => { for (const url of Object.values(urls)) URL.revokeObjectURL(url); };
  }, [assets]);

  const draft = analysis.package ? { package: analysis.package, assets: draftAssets, report: analysis.report } : undefined;
  return <div className="list-card workshop-editor">
    <div className="list-heading"><div><h3>声明式包编辑器</h3><p className="io-scope">草稿仅保留在当前页面；请显式导出或安装。不会执行代码，也不会调用 API。</p></div><button type="button" className="secondary" disabled={busy} onClick={onClose}>关闭编辑器</button></div>
    <label className="workshop-editor-source">完整包 JSON<textarea aria-label="工坊包 JSON" spellCheck={false} maxLength={WORKSHOP_EDITOR_SOURCE_LIMIT} value={source} onChange={(event) => setSource(event.target.value)} /></label>
    <div className="workshop-editor-grid">
      <section className="workshop-editor-report">
        <h4>权限与冲突</h4>
        <div className="visual-asset-summary"><span>{analysis.report.requiredPermissions.length} 项所需权限</span><span>{analysis.report.issues.filter((issue) => issue.severity === 'error').length} 个错误</span><span>{assets.size} 个载入资产</span></div>
        <details open><summary>所需权限</summary>{analysis.report.requiredPermissions.length ? <ul>{analysis.report.requiredPermissions.map((permission) => <li key={permission}><code>{permission}</code></li>)}</ul> : <p className="empty">当前草稿不需要额外权限。</p>}</details>
        <details open><summary>校验与冲突</summary>{analysis.report.issues.length ? <ul>{analysis.report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issueLabel(issue)}</strong> · {issue.message}{issue.path ? <small> · {issue.path}</small> : null}</li>)}</ul> : <p className="empty">未发现问题。</p>}</details>
        <div className="button-row"><button type="button" disabled={busy || !draft || !analysis.report.canInstall} onClick={() => draft && void onInstall(draft)}>确认安装并启用</button><button type="button" className="secondary" disabled={busy || !draft || !analysis.canExport} onClick={() => draft && void onExport(draft)}>导出草稿 ZIP</button></div>
      </section>
      <section className="workshop-editor-preview" aria-label="工坊 App 实时预览">
        <div className="list-heading"><div><h4>实时预览</h4><p className="io-scope">只读世界事实来自当前存档；输入与按钮状态仅用于本次预览。</p></div></div>
        {previewRecord ? <WorkshopPageRenderer record={previewRecord} save={save} pageId={pageId} values={values} assetUrls={assetUrls} onPageChange={setPageId} onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} /> : <p className="empty">修复 JSON 或 schema 错误后显示预览。</p>}
      </section>
    </div>
  </div>;
}
