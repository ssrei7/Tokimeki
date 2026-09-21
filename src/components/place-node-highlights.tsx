import { useEffect, useState } from 'react';
import type { PlaceHighlight, SaveFile } from '../data/schema/save';
import type { PlaceHighlightDraft, PlaceHighlightInput } from '../core/place-highlights';

interface PlaceNodeHighlightsProps {
  save: SaveFile;
  nodeId: string;
  busy: boolean;
  onCreate: (input: PlaceHighlightInput) => boolean;
  onUpdate: (id: string, input: PlaceHighlightInput) => boolean;
  onDelete: (id: string) => void;
  onGenerate: (input: { nodeId?: string; count: number; requirements: string }) => Promise<PlaceHighlightDraft[]>;
  onConfirmDrafts: (drafts: PlaceHighlightDraft[]) => boolean;
  onStartActivity: (highlightId: string) => void;
}

const emptyInput = (nodeId: string): PlaceHighlightInput => ({ nodeId, kind: 'hotspot', title: '', body: '', allowsNewNpc: false });

export function PlaceNodeHighlights(props: PlaceNodeHighlightsProps) {
  const entries = props.save.world.placeHighlights.filter((item) => item.nodeId === props.nodeId);
  const [requirements, setRequirements] = useState('');
  const [draft, setDraft] = useState<PlaceHighlightDraft>();
  const [editing, setEditing] = useState<PlaceHighlight>();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PlaceHighlightInput>(() => emptyInput(props.nodeId));

  useEffect(() => {
    setRequirements('');
    setDraft(undefined);
    setEditing(undefined);
    setFormOpen(false);
    setForm(emptyInput(props.nodeId));
  }, [props.nodeId]);

  const beginCreate = () => { setEditing(undefined); setDraft(undefined); setFormOpen(true); setForm(emptyInput(props.nodeId)); };
  const cancelForm = () => { setEditing(undefined); setFormOpen(false); setForm(emptyInput(props.nodeId)); };
  const beginEdit = (item: PlaceHighlight) => { setDraft(undefined); setEditing(item); setFormOpen(true); setForm({ nodeId: item.nodeId, kind: item.kind, title: item.title, body: item.body, allowsNewNpc: item.allowsNewNpc }); };
  const updateForm = <K extends keyof PlaceHighlightInput>(key: K, value: PlaceHighlightInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const saveForm = () => {
    const saved = editing ? props.onUpdate(editing.id, form) : props.onCreate(form);
    if (saved) cancelForm();
  };
  const generate = async () => {
    const next = await props.onGenerate({ nodeId: props.nodeId, count: 1, requirements });
    setDraft(next[0]);
  };
  const confirmDraft = () => { if (draft && props.onConfirmDrafts([draft])) setDraft(undefined); };

  return <section className="place-node-highlights" aria-label="当前地点动态">
    <div className="list-heading"><div><span className="eyebrow">当前地点</span><strong>地点动态</strong></div><button type="button" className="secondary" onClick={beginCreate}>新建</button></div>
    <div className="place-node-highlight-generate"><input value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="生成要求，可留空" aria-label="当前地点动态生成要求" /><button type="button" className="secondary" disabled={props.busy} onClick={() => void generate()}>{props.busy ? '生成中…' : 'AI 生成 1 条'}</button></div>
    {draft && <div className="place-node-highlight-draft">
      <div className="list-heading"><strong>待确认草稿</strong><button type="button" className="secondary" onClick={() => setDraft(undefined)}>取消</button></div>
      <label>类型<select value={draft.kind} onChange={(event) => setDraft((current) => current ? { ...current, kind: event.target.value as PlaceHighlightDraft['kind'] } : current)}><option value="hotspot">热点</option><option value="activity">活动</option></select></label>
      <label>标题<input maxLength={80} value={draft.title} onChange={(event) => setDraft((current) => current ? { ...current, title: event.target.value } : current)} /></label>
      <label>内容<textarea maxLength={1000} value={draft.body} onChange={(event) => setDraft((current) => current ? { ...current, body: event.target.value } : current)} /></label>
      <label className="map-editor-check"><input type="checkbox" checked={draft.allowsNewNpc} onChange={(event) => setDraft((current) => current ? { ...current, allowsNewNpc: event.target.checked } : current)} />允许活动提出临时新人</label>
      <button type="button" onClick={confirmDraft}>确认保存草稿</button>
    </div>}
    {formOpen && <div className="place-node-highlight-form">
      <div className="list-heading"><strong>{editing ? '编辑地点动态' : '新建地点动态'}</strong><button type="button" className="secondary" onClick={cancelForm}>取消</button></div>
      <label>类型<select value={form.kind} onChange={(event) => updateForm('kind', event.target.value as PlaceHighlightInput['kind'])}><option value="hotspot">热点</option><option value="activity">活动</option></select></label>
      <label>标题<input maxLength={80} value={form.title} onChange={(event) => updateForm('title', event.target.value)} /></label>
      <label>内容<textarea maxLength={1000} value={form.body} onChange={(event) => updateForm('body', event.target.value)} /></label>
      <label className="map-editor-check"><input type="checkbox" checked={form.allowsNewNpc} onChange={(event) => updateForm('allowsNewNpc', event.target.checked)} />允许活动提出临时新人</label>
      <button type="button" disabled={!form.title.trim() || !form.body.trim()} onClick={saveForm}>{editing ? '保存修改' : '保存新动态'}</button>
    </div>}
    {entries.length ? <div className="place-node-highlight-list">{entries.map((item) => <article className="place-node-highlight-entry" key={item.id}>
      <div className="list-heading"><div><strong>{item.title}</strong><small>{item.kind === 'hotspot' ? '热点' : '活动'} · {item.source === 'ai' ? 'AI' : '手工'} · 第 {item.updatedDay} 天更新</small></div><div className="button-row"><button type="button" className="secondary" onClick={() => beginEdit(item)}>编辑</button>{item.kind === 'activity' && <button type="button" onClick={() => props.onStartActivity(item.id)}>参加</button>}<button type="button" className="danger" onClick={() => props.onDelete(item.id)}>删除</button></div></div>
      <p>{item.body}</p>
      {item.allowsNewNpc && <small>允许活动提出临时新人</small>}
    </article>)}</div> : <p className="empty">此地点暂无动态，可以手工新建或让 AI 生成。</p>}
  </section>;
}
