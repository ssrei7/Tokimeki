import { useEffect, useMemo, useState } from 'react';
import type { SaveFile } from '../data/schema/save';
import { listWorkshopBindings, listWorkshopPackages } from '../data/db/content';
import { exportWorkshopPackage, importWorkshopPackage } from '../data/io/workshop-package';
import { exportInstalledWorkshopPackage, installWorkshopPackage, setWorkshopPackageEnabled, uninstallWorkshopPackage, workshopPackageBindingSummary } from '../data/workshop-install';
import type { WorkshopBinding, WorkshopPackageImport, WorkshopPackageRecord, WorkshopValidationIssue } from '../data/workshop';
import { notifyWorkshopChanged } from '../ui/workshop-runtime';
import { WorkshopEditor } from './workshop-editor';

type Notice = { tone: 'info' | 'success' | 'error'; text: string } | null;

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slug(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'package';
}

function issueLabel(issue: WorkshopValidationIssue): string {
  return issue.severity === 'error' ? '错误' : issue.severity === 'warning' ? '警告' : '说明';
}

export function WorkshopManager({ save }: { save: SaveFile }) {
  const saveId = save.meta.id;
  const [records, setRecords] = useState<WorkshopPackageRecord[]>([]);
  const [bindings, setBindings] = useState<WorkshopBinding[]>([]);
  const [preview, setPreview] = useState<WorkshopPackageImport | null>(null);
  const [editor, setEditor] = useState<{ key: number; initial?: WorkshopPackageImport } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const installedIds = useMemo(() => new Set(records.map((record) => record.id)), [records]);
  const bindingByPackage = useMemo(() => new Map(bindings.filter((binding) => binding.saveId === saveId).map((binding) => [binding.packageId, binding])), [bindings, saveId]);

  async function refresh(): Promise<void> {
    const [nextRecords, nextBindings] = await Promise.all([listWorkshopPackages(), listWorkshopBindings()]);
    setRecords(nextRecords.sort((left, right) => left.package.manifest.name.localeCompare(right.package.manifest.name, 'zh-CN')));
    setBindings(nextBindings);
  }

  useEffect(() => { void refresh().catch((error) => setNotice({ tone: 'error', text: errorText(error, '读取工坊包失败。') })); }, [saveId]);

  async function readPackage(file?: File): Promise<void> {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const imported = await importWorkshopPackage(file);
      setPreview(imported);
      setNotice({ tone: imported.report.canInstall ? 'info' : 'error', text: imported.report.canInstall ? '包已在本地读取。请检查权限和报告后确认安装。' : '包未通过本地校验，不能安装。' });
    } catch (error) {
      setPreview(null);
      setNotice({ tone: 'error', text: errorText(error, '无法读取工坊包。') });
    } finally { setBusy(false); }
  }

  async function installPreview(): Promise<void> {
    if (!preview) return;
    setBusy(true);
    try {
      await installWorkshopPackage(preview, saveId);
      setPreview(null);
      await refresh();
      notifyWorkshopChanged();
      setNotice({ tone: 'success', text: '工坊包已安装并为当前世界启用。受限 App 可从终端桌面打开；规则、事件和 Provider 动作仍不会执行。' });
    } catch (error) { setNotice({ tone: 'error', text: errorText(error, '安装工坊包失败。') }); }
    finally { setBusy(false); }
  }

  async function installDraft(draft: WorkshopPackageImport): Promise<void> {
    setBusy(true);
    try {
      await installWorkshopPackage(draft, saveId);
      setEditor(null);
      setPreview(null);
      await refresh();
      notifyWorkshopChanged();
      setNotice({ tone: 'success', text: '编辑草稿已安装并为当前世界启用。受限 App 已出现在终端桌面。' });
    } catch (error) { setNotice({ tone: 'error', text: errorText(error, '安装编辑草稿失败。') }); }
    finally { setBusy(false); }
  }

  async function exportDraft(draft: WorkshopPackageImport): Promise<void> {
    setBusy(true);
    try {
      const assets = new Map([...draft.assets].map(([id, asset]) => [id, asset.bytes]));
      const blob = await exportWorkshopPackage(draft.package, assets);
      downloadBlob(blob, `tokimeki-workshop-${slug(draft.package.manifest.name)}-${draft.package.manifest.version}.zip`);
      setNotice({ tone: 'success', text: '编辑草稿已导出；不包含 Provider、API key、存档或预览状态。' });
    } catch (error) { setNotice({ tone: 'error', text: errorText(error, '导出编辑草稿失败。') }); }
    finally { setBusy(false); }
  }

  async function toggle(record: WorkshopPackageRecord): Promise<void> {
    const enabled = bindingByPackage.get(record.id)?.enabled ?? false;
    setBusy(true);
    try {
      await setWorkshopPackageEnabled(saveId, record.id, !enabled);
      await refresh();
      notifyWorkshopChanged();
      setNotice({ tone: 'success', text: enabled ? '已为当前世界停用；包定义、资产和本地 App 状态均保留。' : '已为当前世界启用；受限 App 图标会出现在终端桌面。' });
    } catch (error) { setNotice({ tone: 'error', text: errorText(error, '更新世界绑定失败。') }); }
    finally { setBusy(false); }
  }

  async function exportRecord(record: WorkshopPackageRecord): Promise<void> {
    setBusy(true);
    try {
      const blob = await exportInstalledWorkshopPackage(record);
      downloadBlob(blob, `tokimeki-workshop-${slug(record.package.manifest.name)}-${record.package.manifest.version}.zip`);
      setNotice({ tone: 'success', text: '工坊包已在本地导出；不包含 Provider、API key、存档或游玩状态。' });
    } catch (error) { setNotice({ tone: 'error', text: errorText(error, '导出工坊包失败。') }); }
    finally { setBusy(false); }
  }

  async function remove(record: WorkshopPackageRecord): Promise<void> {
    const linked = await workshopPackageBindingSummary(record.id);
    const worlds = new Set(linked.map((binding) => binding.saveId));
    if (!window.confirm(`确认全局卸载“${record.package.manifest.name}”吗？将移除 ${worlds.size} 个世界绑定。为保护用户资源，按世界隔离的本地 App 状态和二进制资产都会保留。`)) return;
    setBusy(true);
    try {
      const result = await uninstallWorkshopPackage(record.id);
      await refresh();
      notifyWorkshopChanged();
      setNotice({ tone: 'success', text: `已卸载并移除 ${result.removedBindings.length} 条世界绑定；本地 App 状态与 ${result.retainedAssetIds.length} 个二进制资产均保留。` });
    } catch (error) { setNotice({ tone: 'error', text: errorText(error, '卸载工坊包失败。') }); }
    finally { setBusy(false); }
  }

  const previewInstalled = preview ? installedIds.has(preview.package.manifest.id) : false;
  return <div className="library-subpage-content workshop-manager">
    {notice && <div className={`feedback ${notice.tone}`} role="status">{notice.text}<button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}>×</button></div>}
    <section className="workshop-content">
      <div className="section-heading"><div><span className="eyebrow">声明式本地包</span><h2>创意工坊</h2></div><span className="io-scope">零 API · 不执行代码</span></div>
      <div className="list-card">
        <div className="list-heading"><div><h3>导入、编辑与预览</h3><p className="io-scope">受限页面可读取已授权世界事实并保存本地 App 状态；规则、事件、op、Prompt 与 Provider 动作暂不运行。</p></div></div>
        <div className="button-row"><label className="file-button">选择工坊包<input type="file" accept=".zip,application/zip" disabled={busy} onChange={(event) => { void readPackage(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><button type="button" className="secondary" disabled={busy} onClick={() => setEditor((current) => ({ key: (current?.key ?? 0) + 1 }))}>新建本地草稿</button></div>
      </div>
      {preview && <div className="list-card workshop-preview">
        <div className="list-heading"><div><h3>{preview.package.manifest.name}</h3><p>{preview.package.manifest.id} · v{preview.package.manifest.version} · {preview.package.manifest.author}</p></div><span className="io-scope">包格式 v{preview.package.manifest.packageVersion}</span></div>
        {preview.package.manifest.description && <p>{preview.package.manifest.description}</p>}
        <div className="visual-asset-summary"><span>{preview.package.app.pages.length} 个页面</span><span>{preview.package.rules.rules.length} 条规则</span><span>{preview.package.events?.events.length ?? 0} 个事件</span><span>{preview.assets.size} 个资产</span></div>
        <details open><summary>权限清单（{preview.report.requiredPermissions.length}）</summary>{preview.report.requiredPermissions.length ? <ul>{preview.report.requiredPermissions.map((permission) => <li key={permission}><code>{permission}</code></li>)}</ul> : <p className="empty">不需要额外权限。</p>}</details>
        <details open={!preview.report.canInstall}><summary>校验报告（{preview.report.issues.length}）</summary>{preview.report.issues.length ? <ul>{preview.report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issueLabel(issue)}</strong> · {issue.message}{issue.path ? <small> · {issue.path}</small> : null}</li>)}</ul> : <p className="empty">未发现问题。</p>}</details>
        {previewInstalled && <p role="alert" className="io-scope">本机已安装相同包 ID。首版不支持覆盖更新，请保留现有包或先卸载。</p>}
        <div className="button-row"><button type="button" disabled={busy || !preview.report.canInstall || previewInstalled} onClick={() => void installPreview()}>确认安装并启用</button><button type="button" className="secondary" disabled={busy} onClick={() => setEditor((current) => ({ key: (current?.key ?? 0) + 1, initial: preview }))}>在编辑器中打开</button><button type="button" className="secondary" disabled={busy} onClick={() => setPreview(null)}>取消</button></div>
      </div>}
      {editor && <WorkshopEditor key={editor.key} save={save} installedIds={installedIds} initial={editor.initial} busy={busy} onInstall={installDraft} onExport={exportDraft} onClose={() => setEditor(null)} />}
      <div className="list-card">
        <div className="list-heading"><div><h3>已安装包</h3><p className="io-scope">启用状态和 App 本地状态按世界隔离。停用不会删除包；全局卸载会保留本地状态和二进制资产。</p></div><span className="io-scope">{records.length} 个</span></div>
        {records.length ? <div className="event-package-list">{records.map((record) => {
          const binding = bindingByPackage.get(record.id);
          return <div className="list-row workshop-package-row" key={record.id}><span><strong>{record.package.manifest.name}</strong><small>{record.id} · v{record.package.manifest.version} · {binding?.enabled ? '当前世界已启用' : '当前世界未启用'}</small></span><div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={() => void toggle(record)}>{binding?.enabled ? '停用' : '启用'}</button><button type="button" className="secondary" disabled={busy} onClick={() => void exportRecord(record)}>导出</button><button type="button" className="danger" disabled={busy} onClick={() => void remove(record)}>全局卸载</button></div></div>;
        })}</div> : <p className="empty">尚未安装工坊包。</p>}
      </div>
    </section>
  </div>;
}
