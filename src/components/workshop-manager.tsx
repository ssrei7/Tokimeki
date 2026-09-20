import { useEffect, useMemo, useRef, useState } from 'react';
import type { SaveFile } from '../data/schema/save';
import { listWorkshopBindings, listWorkshopPackages } from '../data/db/content';
import { exportWorkshopPackage, importWorkshopPackage } from '../data/io/workshop-package';
import { exportInstalledWorkshopPackage, installWorkshopPackage, setWorkshopPackageEnabled, uninstallWorkshopPackage, updateWorkshopPackage, workshopPackageBindingSummary, workshopPackageDependentSummary } from '../data/workshop-install';
import { validateWorkshopPackage, type WorkshopBinding, type WorkshopPackage, type WorkshopPackageImport, type WorkshopPackageRecord, type WorkshopValidationIssue } from '../data/workshop';
import { analyzeWorkshopPackageDependencies, workshopDependencyLabel } from '../data/workshop-dependencies';
import { analyzeWorkshopPackageUpdate, type WorkshopPackageUpdateAnalysis } from '../data/workshop-update';
import type { WorkshopAgentTurnInput, WorkshopAgentTurnResult } from '../providers/workshop-draft';
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

function updateConfirmation(analysis: WorkshopPackageUpdateAnalysis, pack: WorkshopPackage): string {
  const lines = [
    `确认更新“${pack.manifest.name}”吗？`,
    `版本：${analysis.fromVersion} → ${analysis.toVersion}`,
    `将保留 ${analysis.affectedWorlds} 个世界绑定（其中 ${analysis.enabledWorlds} 个已启用）和全部按世界隔离的本地 App 状态。`,
    '旧版二进制资产会保守保留，不会自动删除。',
  ];
  if (analysis.addedPermissions.length) lines.push(`新增权限：${analysis.addedPermissions.join('、')}`);
  else lines.push('没有新增权限。');
  if (analysis.removedPermissions.length) lines.push(`不再需要：${analysis.removedPermissions.join('、')}`);
  if (analysis.authorChanged) lines.push('警告：包作者名称发生变化。');
  if (analysis.nameChanged) lines.push('提示：包显示名称发生变化。');
  if (pack.manifest.dependencies?.length) lines.push(`依赖：${pack.manifest.dependencies.map(workshopDependencyLabel).join('、')}`);
  return lines.join('\n');
}

export function WorkshopManager({ save, draftProviderConfigured, onGenerateDraft, onAgentTurn }: { save: SaveFile; draftProviderConfigured: boolean; onGenerateDraft: (requirement: string, signal?: AbortSignal) => Promise<WorkshopPackage>; onAgentTurn: (input: WorkshopAgentTurnInput, signal?: AbortSignal) => Promise<WorkshopAgentTurnResult> }) {
  const saveId = save.meta.id;
  const [records, setRecords] = useState<WorkshopPackageRecord[]>([]);
  const [bindings, setBindings] = useState<WorkshopBinding[]>([]);
  const [preview, setPreview] = useState<WorkshopPackageImport | null>(null);
  const [editor, setEditor] = useState<{ key: number; initial?: WorkshopPackageImport } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [draftRequirement, setDraftRequirement] = useState('');
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const generationControllerRef = useRef<AbortController | null>(null);
  const installedVersions = useMemo(() => new Map(records.map((record) => [record.id, record.package.manifest.version])), [records]);
  const recordById = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  const bindingByPackage = useMemo(() => new Map(bindings.filter((binding) => binding.saveId === saveId).map((binding) => [binding.packageId, binding])), [bindings, saveId]);

  async function refresh(): Promise<void> {
    const [nextRecords, nextBindings] = await Promise.all([listWorkshopPackages(), listWorkshopBindings()]);
    setRecords(nextRecords.sort((left, right) => left.package.manifest.name.localeCompare(right.package.manifest.name, 'zh-CN')));
    setBindings(nextBindings);
  }

  useEffect(() => { void refresh().catch((error) => setNotice({ tone: 'error', text: errorText(error, '读取工坊包失败。') })); }, [saveId]);
  useEffect(() => () => generationControllerRef.current?.abort(), []);

  async function generateDraft(): Promise<void> {
    const requirement = draftRequirement.trim();
    if (!requirement || generatingDraft) return;
    if (editor && !window.confirm('生成成功后会用新结果替换当前页面中的编辑草稿。请先导出或安装需要保留的内容。是否继续？')) return;
    const controller = new AbortController();
    generationControllerRef.current = controller;
    setGeneratingDraft(true);
    setNotice({ tone: 'info', text: '正在请求一次工坊草稿生成；返回后仍需本地校验和确认。' });
    try {
      const pack = await onGenerateDraft(requirement, controller.signal);
      if (controller.signal.aborted) return;
      const imported: WorkshopPackageImport = { package: pack, assets: new Map(), report: validateWorkshopPackage(pack) };
      setEditor((current) => ({ key: (current?.key ?? 0) + 1, initial: imported }));
      setNotice({ tone: 'success', text: 'AI 草稿已进入本地编辑器；尚未安装，也未写入世界状态。' });
    } catch (error) {
      if (!controller.signal.aborted) setNotice({ tone: 'error', text: errorText(error, 'AI 草稿生成失败，现有内容未改变。') });
    } finally {
      if (generationControllerRef.current === controller) generationControllerRef.current = null;
      setGeneratingDraft(false);
    }
  }

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
    const current = recordById.get(preview.package.manifest.id);
    if (current) {
      const analysis = analyzeWorkshopPackageUpdate(current, preview.package, bindings);
      if (!analysis.canUpdate) { setNotice({ tone: 'error', text: analysis.reason ?? '工坊包不能更新。' }); return; }
      if (!window.confirm(updateConfirmation(analysis, preview.package))) return;
    }
    setBusy(true);
    try {
      const result = current ? await updateWorkshopPackage(preview) : undefined;
      if (!current) await installWorkshopPackage(preview, saveId);
      setPreview(null);
      await refresh();
      notifyWorkshopChanged();
      setNotice({ tone: 'success', text: current && result
        ? `工坊包已更新到 v${result.record.package.manifest.version}；${result.analysis.affectedWorlds} 个世界绑定、启用状态和本地 App 状态均已保留，${result.retainedAssetIds.length} 个旧资产保守保留。`
        : '工坊包已安装并为当前世界启用。受限 App 可从终端桌面打开；声明式活动、事件、Prompt 与用户显式 Provider 动作会按权限运行。' });
    } catch (error) { setNotice({ tone: 'error', text: errorText(error, '安装工坊包失败。') }); }
    finally { setBusy(false); }
  }

  async function installDraft(draft: WorkshopPackageImport): Promise<void> {
    const current = recordById.get(draft.package.manifest.id);
    if (current) {
      const analysis = analyzeWorkshopPackageUpdate(current, draft.package, bindings);
      if (!analysis.canUpdate) { setNotice({ tone: 'error', text: analysis.reason ?? '编辑草稿不能更新已安装包。' }); return; }
      if (!window.confirm(updateConfirmation(analysis, draft.package))) return;
    }
    setBusy(true);
    try {
      const result = current ? await updateWorkshopPackage(draft) : undefined;
      if (!current) await installWorkshopPackage(draft, saveId);
      setEditor(null);
      setPreview(null);
      await refresh();
      notifyWorkshopChanged();
      setNotice({ tone: 'success', text: current && result
        ? `编辑草稿已更新到 v${result.record.package.manifest.version}；世界绑定、启用状态、本地 App 状态和旧资产均已保留。`
        : '编辑草稿已安装并为当前世界启用。受限 App 已出现在终端桌面。' });
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
    const [linked, dependents] = await Promise.all([workshopPackageBindingSummary(record.id), workshopPackageDependentSummary(record.id)]);
    if (dependents.length) {
      setNotice({ tone: 'error', text: `不能卸载：${dependents.map((item) => `${item.package.manifest.name}（${item.id}）`).join('、')} 仍依赖此包。请先卸载这些包。` });
      return;
    }
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

  const previewInstalledRecord = preview ? recordById.get(preview.package.manifest.id) : undefined;
  const previewUpdate = preview && previewInstalledRecord ? analyzeWorkshopPackageUpdate(previewInstalledRecord, preview.package, bindings) : undefined;
  const previewEnabledSaveIds = previewInstalledRecord
    ? bindings.filter((binding) => binding.packageId === previewInstalledRecord.id && binding.enabled).map((binding) => binding.saveId)
    : [saveId];
  const previewDependencies = preview ? analyzeWorkshopPackageDependencies(preview.package, records, bindings, previewEnabledSaveIds) : undefined;
  return <div className="library-subpage-content workshop-manager">
    {notice && <div className={`feedback ${notice.tone}`} role="status">{notice.text}<button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}>×</button></div>}
    <section className="workshop-content">
      <div className="section-heading"><div><span className="eyebrow">声明式本地包</span><h2>创意工坊</h2></div><span className="io-scope">用户显式 API · 不执行代码</span></div>
      <div className="list-card">
        <div className="list-heading"><div><h3>导入、编辑与预览</h3><p className="io-scope">受限页面可读取已授权世界事实并保存本地 App 状态；已安装包可运行声明式活动、事件、Prompt，以及用户点击后才联网的 Provider 动作。</p></div></div>
        <div className="button-row"><label className="file-button">选择工坊包<input type="file" accept=".zip,application/zip" disabled={busy} onChange={(event) => { void readPackage(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><button type="button" className="secondary" disabled={busy} onClick={() => setEditor((current) => ({ key: (current?.key ?? 0) + 1 }))}>新建本地草稿</button></div>
      </div>
      <div className="list-card workshop-ai-draft">
        <div className="list-heading"><div><h3>Agent 新建工程</h3><p className="io-scope">仅在点击后调用一次 <code>workshop_draft</code> Provider；初稿进入编辑器后，可继续用多轮 Agent 指令增量修改。</p></div><span className="io-scope">用户 API</span></div>
        <label>描述想制作的终端 App<textarea aria-label="工坊 App 需求" maxLength={4000} placeholder="例如：制作一个旅行清单 App，可以记录本地备注，并只读显示当前日期和位置。" value={draftRequirement} onChange={(event) => setDraftRequirement(event.target.value)} /></label>
        {!draftProviderConfigured && <p className="io-scope" role="alert">尚未配置可用文本 Provider。请先在“设置 → 路由”配置“工坊 Agent”，或设置默认 Provider。</p>}
        <div className="button-row"><button type="button" disabled={busy || generatingDraft || !draftProviderConfigured || !draftRequirement.trim()} onClick={() => void generateDraft()}>{generatingDraft ? '正在生成…' : '生成并送入编辑器'}</button></div>
      </div>
      {preview && <div className="list-card workshop-preview">
        <div className="list-heading"><div><h3>{preview.package.manifest.name}</h3><p>{preview.package.manifest.id} · v{preview.package.manifest.version} · {preview.package.manifest.author}</p></div><span className="io-scope">包格式 v{preview.package.manifest.packageVersion}</span></div>
        {preview.package.manifest.description && <p>{preview.package.manifest.description}</p>}
        <div className="visual-asset-summary"><span>{preview.package.app.pages.length} 个页面</span><span>{preview.package.rules.rules.length} 条规则</span><span>{preview.package.events?.events.length ?? 0} 个事件</span><span>{preview.assets.size} 个资产</span></div>
        <details open><summary>权限清单（{preview.report.requiredPermissions.length}）</summary>{preview.report.requiredPermissions.length ? <ul>{preview.report.requiredPermissions.map((permission) => <li key={permission}><code>{permission}</code></li>)}</ul> : <p className="empty">不需要额外权限。</p>}</details>
        <details open={Boolean(previewDependencies && !previewDependencies.canApply)}><summary>包依赖（{preview.package.manifest.dependencies?.length ?? 0}）</summary>{preview.package.manifest.dependencies?.length ? <ul>{preview.package.manifest.dependencies.map((dependency, index) => <li key={`${dependency.id}-${index}`}><code>{workshopDependencyLabel(dependency)}</code></li>)}</ul> : <p className="empty">没有包间依赖。</p>}{previewDependencies && !previewDependencies.canApply && <ul>{previewDependencies.issues.map((issue) => <li key={issue}><strong>阻止</strong> · {issue}</li>)}</ul>}</details>
        <details open={!preview.report.canInstall}><summary>校验报告（{preview.report.issues.length}）</summary>{preview.report.issues.length ? <ul>{preview.report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issueLabel(issue)}</strong> · {issue.message}{issue.path ? <small> · {issue.path}</small> : null}</li>)}</ul> : <p className="empty">未发现问题。</p>}</details>
        {previewUpdate && <p role={previewUpdate.canUpdate ? 'status' : 'alert'} className="io-scope">{previewUpdate.canUpdate ? `可从 v${previewUpdate.fromVersion} 更新到 v${previewUpdate.toVersion}；确认前会显示世界绑定、权限变化与资源保留范围。` : previewUpdate.reason}</p>}
        <div className="button-row"><button type="button" disabled={busy || !preview.report.canInstall || (previewUpdate !== undefined && !previewUpdate.canUpdate) || (previewDependencies !== undefined && !previewDependencies.canApply)} onClick={() => void installPreview()}>{previewInstalledRecord ? '确认更新已安装包' : '确认安装并启用'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setEditor((current) => ({ key: (current?.key ?? 0) + 1, initial: preview }))}>在编辑器中打开</button><button type="button" className="secondary" disabled={busy} onClick={() => setPreview(null)}>取消</button></div>
      </div>}
      {editor && <WorkshopEditor key={editor.key} save={save} installedVersions={installedVersions} installedRecords={records} workshopBindings={bindings} initial={editor.initial} busy={busy} agentConfigured={draftProviderConfigured} onAgentTurn={onAgentTurn} onInstall={installDraft} onExport={exportDraft} onClose={() => setEditor(null)} />}
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
