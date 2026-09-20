import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SaveFile } from '../data/schema/save';
import { loadAsset } from '../data/db/assets';
import { listWorkshopBindings, listWorkshopPackages, loadWorkshopLocalState, saveWorkshopLocalState } from '../data/db/content';
import type { AssetRef } from '../data/schema/save';
import { WorkshopLocalValueSchema, type WorkshopAction, type WorkshopComponent, type WorkshopLocalValue, type WorkshopPackageRecord } from '../data/workshop';
import { formatWorkshopBinding, hasWorkshopPermission, listWorkshopBinding, numberWorkshopBinding, resolveWorkshopBinding, resolveWorkshopFact, WORKSHOP_CHANGED_EVENT } from '../ui/workshop-runtime';

export function useEnabledWorkshopPackages(saveId: string): WorkshopPackageRecord[] | undefined {
  const [records, setRecords] = useState<WorkshopPackageRecord[]>();
  useEffect(() => {
    let cancelled = false;
    setRecords(undefined);
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

export interface WorkshopProviderRunResult { ok: boolean; message: string; text?: string; resultKey?: string }

function isRunnableAction(record: WorkshopPackageRecord, action: WorkshopAction, activityEnabled = false, eventEnabled = false, providerEnabled = false): boolean {
  if (action.type === 'navigate') return hasWorkshopPermission(record, 'navigation.local');
  if (action.type === 'set-local') return hasWorkshopPermission(record, 'app.local-state') && WorkshopLocalValueSchema.safeParse(action.value).success;
  if (action.type === 'submit-op') {
    const ruleId = activityRuleId(action);
    const rule = ruleId ? record.package.rules.rules.find((candidate) => candidate.id === ruleId) : undefined;
    return Boolean(activityEnabled && rule?.hook === 'manual' && hasWorkshopPermission(record, 'op.submit', 'run_workshop_activity'));
  }
  if (action.type === 'trigger-event') {
    const declared = record.package.events?.events.some((event) => event.id === action.eventId);
    return Boolean(eventEnabled && declared
      && hasWorkshopPermission(record, 'event.install', action.eventId)
      && hasWorkshopPermission(record, 'event.trigger', action.eventId));
  }
  if (action.type === 'provider-text') {
    const block = record.package.prompts?.blocks.find((candidate) => candidate.id === action.promptBlockId);
    const localStateAllowed = (!action.inputKey && !action.resultKey) || hasWorkshopPermission(record, 'app.local-state');
    return Boolean(providerEnabled && localStateAllowed && block?.tasks.includes(action.taskId)
      && hasWorkshopPermission(record, 'prompt.register', action.taskId)
      && hasWorkshopPermission(record, 'provider.explicit-text', action.taskId));
  }
  return false;
}

function blockedActionLabel(action: WorkshopAction): string {
  if (action.type === 'submit-op' && action.op === 'run_workshop_activity') return '活动只能在已安装且启用的包中运行，并必须声明 run_workshop_activity 权限';
  if (action.type === 'submit-op') return '该状态动作尚未开放';
  if (action.type === 'trigger-event') return '事件必须来自同包，并逐项声明 event.install 与 event.trigger 权限';
  if (action.type === 'provider-text') return 'Provider 动作必须引用同包 Prompt，并声明对应 prompt.register、provider.explicit-text 及所需本地状态权限';
  if (action.type === 'set-local' && !WorkshopLocalValueSchema.safeParse(action.value).success) return '本地状态值不符合运行时限制';
  return '当前包未声明所需权限';
}

export function WorkshopPageRenderer({ record, save, pageId, values, assetUrls = {}, activityBusy = false, onPageChange, onValueChange, onRunActivity, onTriggerEvent, onRunProviderText }: { record: WorkshopPackageRecord; save: SaveFile; pageId: string; values: Record<string, WorkshopLocalValue>; assetUrls?: Readonly<Record<string, string>>; activityBusy?: boolean; onPageChange: (pageId: string) => void; onValueChange: (key: string, value: WorkshopLocalValue) => void; onRunActivity?: (ruleId: string) => void; onTriggerEvent?: (eventId: string) => void; onRunProviderText?: (action: Extract<WorkshopAction, { type: 'provider-text' }>) => void }) {
  const pages = useMemo(() => new Map(record.package.app.pages.map((page) => [page.id, page])), [record]);
  const page = pages.get(pageId) ?? pages.get(record.package.app.entryPageId) ?? record.package.app.pages[0];
  const runAction = (action: WorkshopAction) => {
    if (!isRunnableAction(record, action, Boolean(onRunActivity), Boolean(onTriggerEvent), Boolean(onRunProviderText)) || activityBusy) return;
    if (action.type === 'navigate') {
      if (pages.has(action.pageId)) onPageChange(action.pageId);
    } else if (action.type === 'set-local') onValueChange(action.key, action.value);
    else if (action.type === 'submit-op') {
      const ruleId = activityRuleId(action);
      if (ruleId) onRunActivity?.(ruleId);
    } else if (action.type === 'trigger-event') onTriggerEvent?.(action.eventId);
    else if (action.type === 'provider-text') onRunProviderText?.(action);
  };
  const renderComponent = (component: WorkshopComponent, index: number): ReactNode => {
    const key = `${component.kind}-${index}`;
    if (component.kind === 'title') {
      const Tag = component.level === 1 ? 'h2' : component.level === 2 ? 'h3' : 'h4';
      const text = component.binding ? formatWorkshopBinding(component.binding, resolveWorkshopBinding(component.binding, record, save, values), component.text) : component.text;
      return <Tag key={key}>{text}</Tag>;
    }
    if (component.kind === 'text') {
      const text = component.binding ? formatWorkshopBinding(component.binding, resolveWorkshopBinding(component.binding, record, save, values), component.text) : component.text;
      return <p key={key}>{text}</p>;
    }
    if (component.kind === 'fact') {
      if (!hasWorkshopPermission(record, 'world.read', component.resource)) return <p className="empty" key={key}>未授权读取：{component.resource}</p>;
      const fact = resolveWorkshopFact(component.resource, save);
      return <section className="surface-card workshop-fact" key={key}><strong>{component.label || fact.label}</strong><ul>{fact.lines.map((line, lineIndex) => <li key={`${line}-${lineIndex}`}>{line}</li>)}</ul></section>;
    }
    if (component.kind === 'image') return <WorkshopAssetImage key={key} reference={record.assetBindings[component.assetId]} previewSrc={assetUrls[component.assetId]} alt={component.alt} className="workshop-content-image" />;
    if (component.kind === 'card') {
      const title = component.titleBinding ? formatWorkshopBinding(component.titleBinding, resolveWorkshopBinding(component.titleBinding, record, save, values), component.title ?? '') : component.title;
      const body = component.bodyBinding ? formatWorkshopBinding(component.bodyBinding, resolveWorkshopBinding(component.bodyBinding, record, save, values), component.body ?? '') : component.body;
      return <article className="surface-card workshop-content-card" key={key}>{component.imageAssetId && <WorkshopAssetImage reference={record.assetBindings[component.imageAssetId]} previewSrc={assetUrls[component.imageAssetId]} alt={title ?? ''} />}{title && <h3>{title}</h3>}{body && <p>{body}</p>}</article>;
    }
    if (component.kind === 'list') {
      const items = component.binding ? listWorkshopBinding(component.binding, resolveWorkshopBinding(component.binding, record, save, values), component.items) : component.items;
      return <ul key={key}>{items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}</ul>;
    }
    if (component.kind === 'tabs') return <nav className="button-row workshop-tabs" aria-label="App 页面" key={key}>{component.tabs.map((tab) => {
      const enabled = hasWorkshopPermission(record, 'navigation.local') && pages.has(tab.pageId);
      return <button type="button" className={pageId === tab.pageId ? 'selected' : 'secondary'} aria-current={pageId === tab.pageId ? 'page' : undefined} disabled={!enabled} title={!enabled ? '当前包未声明包内导航权限' : undefined} key={tab.id} onClick={() => { if (enabled) onPageChange(tab.pageId); }}>{tab.label}</button>;
    })}</nav>;
    if (component.kind === 'button') {
      const label = component.labelBinding ? formatWorkshopBinding(component.labelBinding, resolveWorkshopBinding(component.labelBinding, record, save, values), component.label) : component.label;
      return <button type="button" key={key} disabled={activityBusy || !isRunnableAction(record, component.action, Boolean(onRunActivity), Boolean(onTriggerEvent), Boolean(onRunProviderText))} title={!isRunnableAction(record, component.action, Boolean(onRunActivity), Boolean(onTriggerEvent), Boolean(onRunProviderText)) ? blockedActionLabel(component.action) : undefined} onClick={() => runAction(component.action)}>{label}</button>;
    }
    if (component.kind === 'input') return <label key={key}>{component.label}<input value={typeof values[component.key] === 'string' ? values[component.key] as string : ''} placeholder={component.placeholder} maxLength={component.maxLength} disabled={!hasWorkshopPermission(record, 'app.local-state')} onChange={(event) => onValueChange(component.key, event.target.value)} /></label>;
    if (component.kind === 'select') return <label key={key}>{component.label}<select value={typeof values[component.key] === 'string' ? values[component.key] as string : ''} disabled={!hasWorkshopPermission(record, 'app.local-state')} onChange={(event) => onValueChange(component.key, event.target.value)}><option value="">请选择</option>{component.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
    if (component.kind === 'progress') {
      const label = component.labelBinding ? formatWorkshopBinding(component.labelBinding, resolveWorkshopBinding(component.labelBinding, record, save, values), component.label ?? '') : component.label;
      const max = Math.max(Number.EPSILON, numberWorkshopBinding(component.maxBinding, component.maxBinding ? resolveWorkshopBinding(component.maxBinding, record, save, values) : undefined, component.max));
      const value = numberWorkshopBinding(component.valueBinding, component.valueBinding ? resolveWorkshopBinding(component.valueBinding, record, save, values) : undefined, component.value);
      return <label className="workshop-progress" key={key}>{label && <span>{label}</span>}<progress value={Math.max(0, Math.min(value, max))} max={max} /></label>;
    }
    if (component.kind === 'confirm') {
      const label = component.labelBinding ? formatWorkshopBinding(component.labelBinding, resolveWorkshopBinding(component.labelBinding, record, save, values), component.label) : component.label;
      const message = component.messageBinding ? formatWorkshopBinding(component.messageBinding, resolveWorkshopBinding(component.messageBinding, record, save, values), component.message) : component.message;
      return <button type="button" key={key} disabled={activityBusy || !isRunnableAction(record, component.action, Boolean(onRunActivity), Boolean(onTriggerEvent), Boolean(onRunProviderText))} title={!isRunnableAction(record, component.action, Boolean(onRunActivity), Boolean(onTriggerEvent), Boolean(onRunProviderText)) ? blockedActionLabel(component.action) : undefined} onClick={() => { if (window.confirm(message)) runAction(component.action); }}>{label}</button>;
    }
    return null;
  };

  return page ? <><div className="section-heading"><div><span className="eyebrow">{record.package.manifest.author}</span><h2>{page.title}</h2></div><span className="io-scope">只读事实 · 本地状态</span></div><div className="workshop-component-stack">{page.components.map(renderComponent)}</div></> : <p className="empty">包入口页面不可用。</p>;
}

export function WorkshopRuntimeView({ record, save, onRunActivity, onTriggerEvent, onRunProviderText }: { record: WorkshopPackageRecord; save: SaveFile; onRunActivity: (ruleId: string) => Promise<{ ok: boolean; message: string }>; onTriggerEvent: (eventId: string) => Promise<{ ok: boolean; message: string }>; onRunProviderText: (action: Extract<WorkshopAction, { type: 'provider-text' }>, values: Readonly<Record<string, WorkshopLocalValue>>, signal?: AbortSignal) => Promise<WorkshopProviderRunResult> }) {
  const [pageId, setPageId] = useState(record.package.app.entryPageId);
  const [values, setValues] = useState<Record<string, WorkshopLocalValue>>({});
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [activityBusy, setActivityBusy] = useState(false);
  const [providerOutput, setProviderOutput] = useState<string>();
  const providerAbortRef = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setPageId(record.package.app.entryPageId);
    setValues({});
    setProviderOutput(undefined);
    void loadWorkshopLocalState(save.meta.id, record.id).then((stored) => {
      if (!cancelled) { setValues(stored?.values ?? {}); setLoaded(true); }
    }).catch(() => { if (!cancelled) { setNotice('本地 App 状态读取失败，当前使用临时状态。'); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [record.id, record.package.app.entryPageId, save.meta.id]);
  useEffect(() => () => providerAbortRef.current?.abort(), []);
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
  const triggerEvent = async (eventId: string) => {
    if (activityBusy) return;
    setActivityBusy(true);
    try {
      const result = await onTriggerEvent(eventId);
      setNotice(result.message);
    } finally {
      setActivityBusy(false);
    }
  };
  const runProviderText = async (action: Extract<WorkshopAction, { type: 'provider-text' }>) => {
    if (activityBusy) return;
    const controller = new AbortController();
    providerAbortRef.current = controller;
    setActivityBusy(true);
    setProviderOutput(undefined);
    try {
      const result = await onRunProviderText(action, values, controller.signal);
      setNotice(result.message);
      if (result.ok && result.text !== undefined) {
        setProviderOutput(result.text.slice(0, 10_000));
        if (result.resultKey) setValues((current) => ({ ...current, [result.resultKey!]: result.text!.slice(0, 2000) }));
      }
    } finally {
      if (providerAbortRef.current === controller) providerAbortRef.current = undefined;
      setActivityBusy(false);
    }
  };
  return <div className="library-subpage-content workshop-runtime" data-workshop-package={record.id}>
    {notice && <div className="feedback info" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice(undefined)}>×</button></div>}
    <section className="workshop-content">{loaded ? <WorkshopPageRenderer record={record} save={save} pageId={pageId} values={values} activityBusy={activityBusy} onPageChange={setPageId} onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} onRunActivity={(ruleId) => { void runActivity(ruleId); }} onTriggerEvent={(eventId) => { void triggerEvent(eventId); }} onRunProviderText={(action) => { void runProviderText(action); }} /> : <p className="empty">正在读取本地 App 状态…</p>}</section>
    {providerOutput !== undefined && <section className="surface-card workshop-provider-output" aria-label="Provider 返回文本"><strong>Provider 返回</strong><p>{providerOutput}</p></section>}
  </div>;
}
