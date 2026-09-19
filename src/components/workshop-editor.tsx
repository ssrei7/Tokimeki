import { useEffect, useMemo, useRef, useState } from 'react';
import type { SaveFile } from '../data/schema/save';
import type { WorkshopAssetPayload, WorkshopLocalValue, WorkshopPackageImport, WorkshopPackageRecord, WorkshopValidationIssue } from '../data/workshop';
import type { WorkshopAgentHistoryEntry, WorkshopAgentTurnInput, WorkshopAgentTurnResult } from '../providers/workshop-draft';
import { analyzeWorkshopDraft, createWorkshopEditorTemplate, WORKSHOP_EDITOR_SOURCE_LIMIT, workshopEditorSource } from '../ui/workshop-editor';
import { WorkshopPageRenderer } from './workshop-runtime';

function issueLabel(issue: WorkshopValidationIssue): string {
  return issue.severity === 'error' ? '错误' : issue.severity === 'warning' ? '警告' : '说明';
}

export function WorkshopEditor({ save, installedIds, initial, busy, agentConfigured, onAgentTurn, onInstall, onExport, onClose }: {
  save: SaveFile;
  installedIds: ReadonlySet<string>;
  initial?: WorkshopPackageImport;
  busy: boolean;
  agentConfigured: boolean;
  onAgentTurn: (input: WorkshopAgentTurnInput, signal?: AbortSignal) => Promise<WorkshopAgentTurnResult>;
  onInstall: (draft: WorkshopPackageImport) => Promise<void>;
  onExport: (draft: WorkshopPackageImport) => Promise<void>;
  onClose: () => void;
}) {
  const [source, setSource] = useState(() => workshopEditorSource(initial?.package ?? createWorkshopEditorTemplate()));
  const [assets] = useState<ReadonlyMap<string, WorkshopAssetPayload>>(() => new Map(initial?.assets ?? []));
  const [pageId, setPageId] = useState(initial?.package.app.entryPageId ?? 'home');
  const [values, setValues] = useState<Record<string, WorkshopLocalValue>>({});
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [agentInstruction, setAgentInstruction] = useState('');
  const [agentHistory, setAgentHistory] = useState<WorkshopAgentHistoryEntry[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState<string>();
  const [agentUndoSource, setAgentUndoSource] = useState<string>();
  const agentControllerRef = useRef<AbortController | null>(null);
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
  useEffect(() => () => agentControllerRef.current?.abort(), []);

  async function sendAgentInstruction(): Promise<void> {
    const instruction = agentInstruction.trim();
    if (!instruction || agentBusy || !agentConfigured) return;
    const controller = new AbortController();
    agentControllerRef.current = controller;
    setAgentBusy(true);
    setAgentError(undefined);
    try {
      const diagnostics = analysis.report.issues.filter((issue) => issue.code !== 'package-id-conflict');
      const result = await onAgentTurn({ instruction, currentSource: source, diagnostics, history: agentHistory }, controller.signal);
      if (controller.signal.aborted) return;
      setAgentUndoSource(source);
      setSource(workshopEditorSource(result.package));
      setAgentHistory((current) => [...current, { role: 'user' as const, content: instruction }, { role: 'assistant' as const, content: result.message }].slice(-8));
      setAgentInstruction('');
    } catch (error) {
      if (!controller.signal.aborted) setAgentError(error instanceof Error ? error.message : '工坊 Agent 调用失败。');
    } finally {
      if (agentControllerRef.current === controller) agentControllerRef.current = null;
      setAgentBusy(false);
    }
  }

  const draft = analysis.package ? { package: analysis.package, assets: draftAssets, report: analysis.report } : undefined;
  return <div className="list-card workshop-editor">
    <div className="list-heading"><div><h3>声明式包编辑器</h3><p className="io-scope">草稿仅保留在当前页面；请显式导出或安装。不执行任意代码；只有用户发送 Agent 指令时才调用已配置 API。</p></div><button type="button" className="secondary" disabled={busy || agentBusy} onClick={onClose}>关闭编辑器</button></div>
    <section className="workshop-agent-panel" aria-label="工坊 Agent">
      <div className="list-heading"><div><h4>工坊 Agent</h4><p className="io-scope">每次发送调用一次用户配置的 <code>workshop_draft</code> API；发送当前草稿、最近对话和校验诊断，不发送 SaveFile 或已安装包。</p></div><span className="io-scope">本轮最多 1 次 API</span></div>
      {agentHistory.length > 0 && <div className="workshop-agent-history" aria-label="Agent 最近对话">{agentHistory.map((entry, index) => <div className={`workshop-agent-message ${entry.role}`} key={`${entry.role}-${index}`}><strong>{entry.role === 'user' ? '你' : 'Agent'}</strong><p>{entry.content}</p></div>)}</div>}
      <label>告诉 Agent 要创建或修改什么<textarea aria-label="工坊 Agent 指令" maxLength={4000} placeholder="例如：增加一个鱼类图鉴页，保留现有首页，并修复当前权限错误。" value={agentInstruction} onChange={(event) => setAgentInstruction(event.target.value)} /></label>
      {!agentConfigured && <p className="io-scope" role="alert">尚未配置可用文本 Provider。请先在“设置 → 路由”配置“工坊 Agent”，或设置默认 Provider。</p>}
      {agentError && <p className="feedback error" role="alert">{agentError}</p>}
      <div className="button-row"><button type="button" disabled={busy || agentBusy || !agentConfigured || !agentInstruction.trim()} onClick={() => void sendAgentInstruction()}>{agentBusy ? 'Agent 正在修改…' : '发送给 Agent'}</button>{agentUndoSource !== undefined && <button type="button" className="secondary" disabled={busy || agentBusy} onClick={() => { const current = source; setSource(agentUndoSource); setAgentUndoSource(current); }}>撤销上次 Agent 修改</button>}</div>
    </section>
    <label className="workshop-editor-source">完整包 JSON<textarea aria-label="工坊包 JSON" spellCheck={false} maxLength={WORKSHOP_EDITOR_SOURCE_LIMIT} value={source} disabled={agentBusy} onChange={(event) => setSource(event.target.value)} /></label>
    <div className="workshop-editor-grid">
      <section className="workshop-editor-report">
        <h4>权限与冲突</h4>
        <div className="visual-asset-summary"><span>{analysis.report.requiredPermissions.length} 项所需权限</span><span>{analysis.report.issues.filter((issue) => issue.severity === 'error').length} 个错误</span><span>{assets.size} 个载入资产</span></div>
        <details open><summary>所需权限</summary>{analysis.report.requiredPermissions.length ? <ul>{analysis.report.requiredPermissions.map((permission) => <li key={permission}><code>{permission}</code></li>)}</ul> : <p className="empty">当前草稿不需要额外权限。</p>}</details>
        <details open><summary>校验与冲突</summary>{analysis.report.issues.length ? <ul>{analysis.report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issueLabel(issue)}</strong> · {issue.message}{issue.path ? <small> · {issue.path}</small> : null}</li>)}</ul> : <p className="empty">未发现问题。</p>}</details>
        <div className="button-row"><button type="button" disabled={busy || agentBusy || !draft || !analysis.report.canInstall} onClick={() => draft && void onInstall(draft)}>确认安装并启用</button><button type="button" className="secondary" disabled={busy || agentBusy || !draft || !analysis.canExport} onClick={() => draft && void onExport(draft)}>导出草稿 ZIP</button></div>
      </section>
      <section className="workshop-editor-preview" aria-label="工坊 App 实时预览">
        <div className="list-heading"><div><h4>实时预览</h4><p className="io-scope">只读世界事实来自当前存档；输入与按钮状态仅用于本次预览。</p></div></div>
        {previewRecord ? <WorkshopPageRenderer record={previewRecord} save={save} pageId={pageId} values={values} assetUrls={assetUrls} onPageChange={setPageId} onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} /> : <p className="empty">修复 JSON 或 schema 错误后显示预览。</p>}
      </section>
    </div>
  </div>;
}
