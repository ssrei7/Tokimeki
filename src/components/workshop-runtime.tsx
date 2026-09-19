import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SaveFile } from '../data/schema/save';
import { loadAsset } from '../data/db/assets';
import { listWorkshopBindings, listWorkshopPackages, loadWorkshopLocalState, saveWorkshopLocalState } from '../data/db/content';
import type { AssetRef } from '../data/schema/save';
import { WorkshopLocalValueSchema, type WorkshopAction, type WorkshopComponent, type WorkshopLocalValue, type WorkshopPackageRecord } from '../data/workshop';
import { hasWorkshopPermission, resolveWorkshopFact, WORKSHOP_CHANGED_EVENT } from '../ui/workshop-runtime';

export function useEnabledWorkshopPackages(saveId: string): WorkshopPackageRecord[] {
  const [records, setRecords] = useState<WorkshopPackageRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [packages, bindings] = await Promise.all([listWorkshopPackages(), listWorkshopBindings(saveId)]);
      if (cancelled) return;
      const enabled = new Set(bindings.filter((binding) => binding.enabled).map((binding) => binding.packageId));
      setRecords(packages.filter((record) => enabled.has(record.id)).sort((left, right) => left.package.manifest.name.localeCompare(right.package.manifest.name, 'zh-CN')));
    };
    void refresh().catch(() => { if (!cancelled) setRecords([]); });
    const onChange = () => { void refresh(); };
    window.addEventListener(WORKSHOP_CHANGED_EVENT, onChange);
    return () => { cancelled = true; window.removeEventListener(WORKSHOP_CHANGED_EVENT, onChange); };
  }, [saveId]);
  return records;
}

function WorkshopAssetImage({ reference, previewSrc, alt, className }: { reference?: AssetRef; previewSrc?: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setSrc(undefined);
    if (previewSrc) { setSrc(previewSrc); return () => undefined; }
    if (!reference || reference.kind !== 'stored') return () => undefined;
    void loadAsset(reference.assetId).then((asset) => {
      if (cancelled || !asset || asset.blob.size === 0) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setSrc(objectUrl);
    }).catch(() => undefined);
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [previewSrc, reference]);
  return src ? <img className={className} src={src} alt={alt} /> : <div className="empty workshop-image-fallback" role="img" aria-label={alt || '图片不可用'}>图片不可用</div>;
}

function activityRuleId(action: WorkshopAction): string | undefined {
  return action.type === 'submit-op' && action.op === 'run_workshop_activity' && typeof action.payload.ruleId === 'string' ? action.payload.ruleId : undefined;
}

function isRunnableAction(record: WorkshopPackageRecord, action: WorkshopAction, activityEnabled = false): boolean {
  if (action.type === 'navigate') return hasWorkshopPermission(record, 'navigation.local');
  if (action.type === 'set-local') return hasWorkshopPermission(record, 'app.local-state') && WorkshopLocalValueSchema.safeParse(action.value).success;
  if (action.type === 'submit-op') {
    const ruleId = activityRuleId(action);
    const rule = ruleId ? record.package.rules.rules.find((candidate) => candidate.id === ruleId) : undefined;
    return Boolean(activityEnabled && rule?.hook === 'manual' && hasWorkshopPermission(record, 'op.submit', 'run_workshop_activity'));
  }
  return false;
}

function blockedActionLabel(action: WorkshopAction): string {
  if (action.type === 'submit-op' && action.op === 'run_workshop_activity') return '活动只能在已安装且启用的包中运行，并必须声明 run_workshop_activity 权限';
  if (action.type === 'submit-op') return '该状态动作尚未开放';
  if (action.type === 'trigger-event') return '事件动作当前未开放';
  if (action.type === 'provider-text') return 'Provider 动作当前未开放';
  if (action.type === 'set-local' && !WorkshopLocalValueSchema.safeParse(action.value).success) return '本地状态值不符合运行时限制';
  return '当前包未声明所需权限';
}

export function WorkshopPageRenderer({ record, save, pageId, values, assetUrls = {}, activityBusy = false, onPageChange, onValueChange, onRunActivity }: { record: WorkshopPackageRecord; save: SaveFile; pageId: string; values: Record<string, WorkshopLocalValue>; assetUrls?: Readonly<Record<string, string>>; activityBusy?: boolean; onPageChange: (pageId: string) => void; onValueChange: (key: string, value: WorkshopLocalValue) => void; onRunActivity?: (ruleId: string) => void }) {
  const pages = useMemo(() => new Map(record.package.app.pages.map((page) => [page.id, page])), [record]);
  const page = pages.get(pageId) ?? pages.get(record.package.app.entryPageId) ?? record.package.app.pages[0];
  const runAction = (action: WorkshopAction) => {
    if (!isRunnableAction(record, action, Boolean(onRunActivity)) || activityBusy) return;
    if (action.type === 'navigate') {
      if (pages.has(action.pageId)) onPageChange(action.pageId);
    } else if (action.type === 'set-local') onValueChange(action.key, action.value);
    else if (action.type === 'submit-op') {
      const ruleId = activityRuleId(action);
      if (ruleId) onRunActivity?.(ruleId);
    }
  };
  const renderComponent = (component: WorkshopComponent, index: number): ReactNode => {
    const key = `${component.kind}-${index}`;
    if (component.kind === 'title') {
      const Tag = component.level === 1 ? 'h2' : component.level === 2 ? 'h3' : 'h4';
      return <Tag key={key}>{component.text}</Tag>;
    }
    if (component.kind === 'text') return <p key={key}>{component.text}</p>;
    if (component.kind === 'fact') {
      if (!hasWorkshopPermission(record, 'world.read', component.resource)) return <p className="empty" key={key}>未授权读取：{component.resource}</p>;
      const fact = resolveWorkshopFact(component.resource, save);
      return <section className="surface-card workshop-fact" key={key}><strong>{component.label || fact.label}</strong><ul>{fact.lines.map((line, lineIndex) => <li key={`${line}-${lineIndex}`}>{line}</li>)}</ul></section>;
    }
    if (component.kind === 'image') return <WorkshopAssetImage key={key} reference={record.assetBindings[component.assetId]} previewSrc={assetUrls[component.assetId]} alt={component.alt} className="workshop-content-image" />;
    if (component.kind === 'card') return <article className="surface-card workshop-content-card" key={key}>{component.imageAssetId && <WorkshopAssetImage reference={record.assetBindings[component.imageAssetId]} previewSrc={assetUrls[component.imageAssetId]} alt={component.title ?? ''} />}{component.title && <h3>{component.title}</h3>}{component.body && <p>{component.body}</p>}</article>;
    if (component.kind === 'list') return <ul key={key}>{component.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}</ul>;
    if (component.kind === 'tabs') return <nav className="button-row workshop-tabs" aria-label="App 页面" key={key}>{component.tabs.map((tab) => {
      const enabled = hasWorkshopPermission(record, 'navigation.local') && pages.has(tab.pageId);
      return <button type="button" className={pageId === tab.pageId ? 'selected' : 'secondary'} aria-current={pageId === tab.pageId ? 'page' : undefined} disabled={!enabled} title={!enabled ? '当前包未声明包内导航权限' : undefined} key={tab.id} onClick={() => { if (enabled) onPageChange(tab.pageId); }}>{tab.label}</button>;
    })}</nav>;
    if (component.kind === 'button') return <button type="button" key={key} disabled={activityBusy || !isRunnableAction(record, component.action, Boolean(onRunActivity))} title={!isRunnableAction(record, component.action, Boolean(onRunActivity)) ? blockedActionLabel(component.action) : undefined} onClick={() => runAction(component.action)}>{component.label}</button>;
    if (component.kind === 'input') return <label key={key}>{component.label}<input value={typeof values[component.key] === 'string' ? values[component.key] as string : ''} placeholder={component.placeholder} maxLength={component.maxLength} disabled={!hasWorkshopPermission(record, 'app.local-state')} onChange={(event) => onValueChange(component.key, event.target.value)} /></label>;
    if (component.kind === 'select') return <label key={key}>{component.label}<select value={typeof values[component.key] === 'string' ? values[component.key] as string : ''} disabled={!hasWorkshopPermission(record, 'app.local-state')} onChange={(event) => onValueChange(component.key, event.target.value)}><option value="">请选择</option>{component.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
    if (component.kind === 'progress') return <label className="workshop-progress" key={key}>{component.label && <span>{component.label}</span>}<progress value={Math.max(0, Math.min(component.value, component.max))} max={component.max} /></label>;
    if (component.kind === 'confirm') return <button type="button" key={key} disabled={activityBusy || !isRunnableAction(record, component.action, Boolean(onRunActivity))} title={!isRunnableAction(record, component.action, Boolean(onRunActivity)) ? blockedActionLabel(component.action) : undefined} onClick={() => { if (window.confirm(component.message)) runAction(component.action); }}>{component.label}</button>;
    return null;
  };

  return page ? <><div className="section-heading"><div><span className="eyebrow">{record.package.manifest.author}</span><h2>{page.title}</h2></div><span className="io-scope">只读事实 · 本地状态</span></div><div className="workshop-component-stack">{page.components.map(renderComponent)}</div></> : <p className="empty">包入口页面不可用。</p>;
}

export function WorkshopRuntimeView({ record, save, onRunActivity }: { record: WorkshopPackageRecord; save: SaveFile; onRunActivity: (ruleId: string) => Promise<{ ok: boolean; message: string }> }) {
  const [pageId, setPageId] = useState(record.package.app.entryPageId);
  const [values, setValues] = useState<Record<string, WorkshopLocalValue>>({});
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [activityBusy, setActivityBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setPageId(record.package.app.entryPageId);
    setValues({});
    void loadWorkshopLocalState(save.meta.id, record.id).then((stored) => {
      if (!cancelled) { setValues(stored?.values ?? {}); setLoaded(true); }
    }).catch(() => { if (!cancelled) { setNotice('本地 App 状态读取失败，当前使用临时状态。'); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [record.id, record.package.app.entryPageId, save.meta.id]);
  useEffect(() => {
    if (!loaded) return undefined;
    const timer = window.setTimeout(() => { void saveWorkshopLocalState(save.meta.id, record.id, values).catch(() => setNotice('本地 App 状态保存失败。')); }, 250);
    return () => window.clearTimeout(timer);
  }, [loaded, record.id, save.meta.id, values]);
  const runActivity = async (ruleId: string) => {
    if (activityBusy) return;
    setActivityBusy(true);
    try {
      const result = await onRunActivity(ruleId);
      setNotice(result.message);
    } finally {
      setActivityBusy(false);
    }
  };
  return <div className="library-subpage-content workshop-runtime" data-workshop-package={record.id}>
    {notice && <div className="feedback info" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice(undefined)}>×</button></div>}
    <section className="workshop-content">{loaded ? <WorkshopPageRenderer record={record} save={save} pageId={pageId} values={values} activityBusy={activityBusy} onPageChange={setPageId} onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} onRunActivity={(ruleId) => { void runActivity(ruleId); }} /> : <p className="empty">正在读取本地 App 状态…</p>}</section>
  </div>;
}
