import { useEffect, useMemo, useRef, useState } from 'react';
import type { SaveFile } from '../data/schema/save';
import type { WorkshopAssetPayload, WorkshopBinding, WorkshopLocalValue, WorkshopPackageImport, WorkshopPackageRecord, WorkshopValidationIssue } from '../data/workshop';
import { analyzeWorkshopPackageDependencies, workshopDependencyLabel } from '../data/workshop-dependencies';
import { queryWorkshopProjectInspection } from '../data/workshop-inspection';
import type { WorkshopAgentContextReport, WorkshopAgentHistoryEntry, WorkshopAgentTurnInput, WorkshopAgentTurnResult } from '../providers/workshop-draft';
import { DEFAULT_WORKSHOP_AGENT_BUDGET, WORKSHOP_AGENT_MAX_REQUESTS, WORKSHOP_AGENT_MAX_SAFETY_MARGIN, WORKSHOP_AGENT_MAX_STEPS, WORKSHOP_AGENT_MAX_TOKEN_BUDGET, type WorkshopAgentBudget, type WorkshopAgentBudgetReport } from '../providers/workshop-agent-budget';
import { analyzeWorkshopDraft, createWorkshopEditorTemplate, WORKSHOP_EDITOR_SOURCE_LIMIT, workshopEditorSource } from '../ui/workshop-editor';
import { WorkshopPageRenderer } from './workshop-runtime';

function issueLabel(issue: WorkshopValidationIssue): string {
  return issue.severity === 'error' ? '错误' : issue.severity === 'warning' ? '警告' : '说明';
}

export function WorkshopEditor({ save, installedVersions, installedRecords, workshopBindings, initial, busy, agentConfigured, onAgentTurn, onInstall, onExport, onClose }: {
  save: SaveFile;
  installedVersions: ReadonlyMap<string, string>;
  installedRecords: readonly WorkshopPackageRecord[];
  workshopBindings: readonly WorkshopBinding[];
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
  const [agentBudget, setAgentBudget] = useState<WorkshopAgentBudget>(DEFAULT_WORKSHOP_AGENT_BUDGET);
  const [lastBudgetReport, setLastBudgetReport] = useState<WorkshopAgentBudgetReport>();
  const [lastRepairAttempts, setLastRepairAttempts] = useState(0);
  const [lastContextReport, setLastContextReport] = useState<WorkshopAgentContextReport>();
  const agentControllerRef = useRef<AbortController | null>(null);
  const analysis = useMemo(() => analyzeWorkshopDraft(source, installedVersions, assets), [assets, installedVersions, source]);
  const dependencyAnalysis = useMemo(() => {
    if (!analysis.package) return undefined;
    const installed = installedRecords.find((record) => record.id === analysis.package?.manifest.id);
    const enabledSaveIds = installed
      ? workshopBindings.filter((binding) => binding.packageId === installed.id && binding.enabled).map((binding) => binding.saveId)
      : [save.meta.id];
    return analyzeWorkshopPackageDependencies(analysis.package, installedRecords, workshopBindings, enabledSaveIds);
  }, [analysis.package, installedRecords, save.meta.id, workshopBindings]);
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
      const inspection = queryWorkshopProjectInspection(analysis);
      const result = await onAgentTurn({ instruction, currentSource: source, inspection, history: agentHistory, budget: agentBudget }, controller.signal);
      if (controller.signal.aborted) return;
      setAgentUndoSource(source);
      setSource(workshopEditorSource(result.package));
      setAgentHistory((current) => [...current, { role: 'user' as const, content: instruction }, { role: 'assistant' as const, content: result.message }].slice(-8));
      setLastBudgetReport(result.budgetReport);
      setLastRepairAttempts(result.repairAttempts ?? 0);
      setLastContextReport(result.contextReport);
      setAgentInstruction('');
    } catch (error) {
      if (!controller.signal.aborted) setAgentError(error instanceof Error ? error.message : '工坊 Agent 调用失败。');
    } finally {
      if (agentControllerRef.current === controller) agentControllerRef.current = null;
      setAgentBusy(false);
    }
  }

  const draft = analysis.package ? { package: analysis.package, assets: draftAssets, report: analysis.report } : undefined;
  const updatesInstalledPackage = analysis.package ? installedVersions.has(analysis.package.manifest.id) : false;
  return <div className="list-card workshop-editor">
    <div className="list-heading"><div><h3>声明式包编辑器</h3><p className="io-scope">草稿仅保留在当前页面；请显式导出或安装。不执行任意代码；只有用户发送 Agent 指令时才调用已配置 API。</p></div><button type="button" className="secondary" disabled={busy || agentBusy} onClick={onClose}>关闭编辑器</button></div>
    <section className="workshop-agent-panel" aria-label="工坊 Agent">
      <div className="list-heading"><div><h4>工坊 Agent</h4><p className="io-scope">每次发送先调用一次用户配置的 <code>workshop_draft</code> API，并携带当前草稿、最近对话、本地能力目录及校验/预览摘要；仅当返回结果未通过本地协议、patch 或 schema 校验时，才在预算内自动修复。不发送 SaveFile、世界事实值或已安装包。</p></div><span className="io-scope">最多 {Math.min(agentBudget.maxSteps, agentBudget.maxRequests)} 次 API</span></div>
      <details className="workshop-agent-budget">
        <summary>运行预算（仅当前编辑器）</summary>
        <div className="workshop-agent-budget-grid">
          <label>最大步骤数<input aria-label="工坊 Agent 最大步骤数" type="number" min={1} max={WORKSHOP_AGENT_MAX_STEPS} value={agentBudget.maxSteps} disabled={agentBusy} onChange={(event) => setAgentBudget((current) => ({ ...current, maxSteps: Number(event.target.value) }))} /></label>
          <label>最大 API 请求数<input aria-label="工坊 Agent 最大 API 请求数" type="number" min={1} max={WORKSHOP_AGENT_MAX_REQUESTS} value={agentBudget.maxRequests} disabled={agentBusy} onChange={(event) => setAgentBudget((current) => ({ ...current, maxRequests: Number(event.target.value) }))} /></label>
          <label>单次输出 token<input aria-label="工坊 Agent 单次输出 token" type="number" min={1} max={WORKSHOP_AGENT_MAX_TOKEN_BUDGET} step={128} value={agentBudget.maxOutputTokensPerRequest} disabled={agentBusy} onChange={(event) => setAgentBudget((current) => ({ ...current, maxOutputTokensPerRequest: Number(event.target.value) }))} /></label>
          <label>总输出 token<input aria-label="工坊 Agent 总输出 token" type="number" min={1} max={WORKSHOP_AGENT_MAX_TOKEN_BUDGET} step={128} value={agentBudget.maxTotalOutputTokens} disabled={agentBusy} onChange={(event) => setAgentBudget((current) => ({ ...current, maxTotalOutputTokens: Number(event.target.value) }))} /></label>
          <label>上下文安全余量<input aria-label="工坊 Agent 上下文安全余量" type="number" min={0} max={WORKSHOP_AGENT_MAX_SAFETY_MARGIN} step={128} value={agentBudget.safetyMarginTokens} disabled={agentBusy} onChange={(event) => setAgentBudget((current) => ({ ...current, safetyMarginTokens: Number(event.target.value) }))} /></label>
        </div>
        <p className="io-scope">一次发送最多执行设定的步骤和请求数；只有 Provider 输出被本地校验拒绝时才继续，不重试网络错误。联网前会无损压缩有效工程 JSON、按需移除最旧对话和截短失败输出摘录，再执行近似 token 预检。实际货币费用由用户端点定价决定。</p>
        {lastBudgetReport && <p className="io-scope" role="status">上次执行：{lastBudgetReport.stepsUsed} / {lastBudgetReport.maxSteps} 步，{lastBudgetReport.requestsUsed} / {lastBudgetReport.maxRequests} 次 API，自动修复 {lastRepairAttempts} 次；本步输入约 {lastBudgetReport.estimatedInputTokens} / {lastBudgetReport.inputTokenLimit} tokens，输出约 {lastBudgetReport.estimatedOutputTokens} / {lastBudgetReport.outputTokenLimit} tokens；累计输出约 {lastBudgetReport.estimatedOutputTokensUsed} / {lastBudgetReport.maxTotalOutputTokens} tokens。{lastContextReport?.sourceMinified ? '工程 JSON 已无损压缩。' : ''}{lastContextReport?.historyEntriesDropped ? `已移除 ${lastContextReport.historyEntriesDropped} 条最旧对话。` : ''}{lastContextReport?.diagnosticsDropped ? `已省略 ${lastContextReport.diagnosticsDropped} 条诊断正文并保留计数。` : ''}{lastContextReport?.repairResponseTruncated ? '失败输出摘录已截短。' : ''}</p>}
      </details>
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
        <details open={Boolean(dependencyAnalysis && !dependencyAnalysis.canApply)}><summary>包依赖（{analysis.package?.manifest.dependencies?.length ?? 0}）</summary>{analysis.package?.manifest.dependencies?.length ? <ul>{analysis.package.manifest.dependencies.map((dependency, index) => <li key={`${dependency.id}-${index}`}><code>{workshopDependencyLabel(dependency)}</code></li>)}</ul> : <p className="empty">没有包间依赖。</p>}{dependencyAnalysis && !dependencyAnalysis.canApply && <ul>{dependencyAnalysis.issues.map((issue) => <li key={issue}><strong>阻止</strong> · {issue}</li>)}</ul>}</details>
        <details open><summary>校验与冲突</summary>{analysis.report.issues.length ? <ul>{analysis.report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issueLabel(issue)}</strong> · {issue.message}{issue.path ? <small> · {issue.path}</small> : null}</li>)}</ul> : <p className="empty">未发现问题。</p>}</details>
        <div className="button-row"><button type="button" disabled={busy || agentBusy || !draft || !analysis.report.canInstall || (dependencyAnalysis !== undefined && !dependencyAnalysis.canApply)} onClick={() => draft && void onInstall(draft)}>{updatesInstalledPackage ? '确认更新已安装包' : '确认安装并启用'}</button><button type="button" className="secondary" disabled={busy || agentBusy || !draft || !analysis.canExport} onClick={() => draft && void onExport(draft)}>导出草稿 ZIP</button></div>
      </section>
      <section className="workshop-editor-preview" aria-label="工坊 App 实时预览">
        <div className="list-heading"><div><h4>实时预览</h4><p className="io-scope">只读世界事实来自当前存档；输入与按钮状态仅用于本次预览。</p></div></div>
        {previewRecord ? <WorkshopPageRenderer record={previewRecord} save={save} pageId={pageId} values={values} assetUrls={assetUrls} onPageChange={setPageId} onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} /> : <p className="empty">修复 JSON 或 schema 错误后显示预览。</p>}
      </section>
    </div>
  </div>;
}
