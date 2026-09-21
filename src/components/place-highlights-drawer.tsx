import { useState } from 'react';
import type { PlaceHighlight, SaveFile } from '../data/schema/save';
import type { PlaceHighlightDraft, PlaceHighlightInput } from '../core/place-highlights';

interface PlaceHighlightsDrawerProps {
  save: SaveFile;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: PlaceHighlightInput) => boolean;
  onUpdate: (id: string, input: PlaceHighlightInput) => boolean;
  onDelete: (id: string) => void;
  onGenerate: (input: { nodeId?: string; count: number; requirements: string }) => Promise<PlaceHighlightDraft[]>;
  onConfirmDrafts: (drafts: PlaceHighlightDraft[]) => boolean;
  onNavigate: (nodeId: string) => void;
  onStartActivity: (highlightId: string) => void;
}

const emptyInput = (nodeId: string): PlaceHighlightInput => ({ nodeId, kind: 'hotspot', title: '', body: '', allowsNewNpc: false });

export function PlaceHighlightsDrawer(props: PlaceHighlightsDrawerProps) {
  const nodes = Object.values(props.save.world.map.nodes);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<PlaceHighlightInput>(() => emptyInput(nodes[0]?.id ?? ''));
  const [requirements, setRequirements] = useState('');
  const [count, setCount] = useState('3');
  const [singleRequirements, setSingleRequirements] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<PlaceHighlightDraft[]>([]);

  if (!props.open) return null;

  const beginCreate = (nodeId = nodes[0]?.id ?? '') => { setEditingId(''); setForm(emptyInput(nodeId)); };
  const beginEdit = (item: PlaceHighlight) => {
    setEditingId(item.id);
    setForm({ nodeId: item.nodeId, kind: item.kind, title: item.title, body: item.body, allowsNewNpc: item.allowsNewNpc });
  };
  const saveForm = () => {
    const ok = editingId ? props.onUpdate(editingId, form) : props.onCreate(form);
    if (ok) beginCreate(form.nodeId);
  };
  const generate = async (nodeId?: string) => {
    const next = await props.onGenerate({
      nodeId,
      count: nodeId ? 1 : Math.max(1, Math.min(8, Number(count) || 3)),
      requirements: nodeId ? singleRequirements[nodeId] ?? '' : requirements,
    });
    if (next.length) setDrafts(next);
  };
  const confirmDrafts = () => {
    if (props.onConfirmDrafts(drafts)) setDrafts([]);
  };

  return <div className="place-highlights-overlay" role="presentation" onClick={props.onClose}>
    <aside className="place-highlights-drawer" role="dialog" aria-modal="true" aria-label="地点动态" onClick={(event) => event.stopPropagation()}>
      <header className="place-highlights-header"><div><span className="eyebrow">当前存档</span><h2>地点动态</h2></div><button type="button" className="secondary" onClick={props.onClose}>关闭</button></header>
      <p className="io-scope">热点用于展示与导航；活动可到场参加、独自进行或邀请当前在场者。手工编辑与确认草稿均不调用 API。</p>

      <section className="place-highlights-section">
        <div className="list-heading"><strong>AI 批量生成</strong><small>一次点击 = 1 次请求</small></div>
        <label>生成要求（可留空）<textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="留空时由本地随机选择地点并随机创作。" /></label>
        <div className="place-highlights-generate-row"><label>数量<input type="number" min="1" max="8" value={count} onChange={(event) => setCount(event.target.value)} /></label><button type="button" disabled={props.busy || nodes.length === 0} onClick={() => void generate()}>{props.busy ? '正在生成…' : '生成地点动态'}</button></div>
      </section>

      {drafts.length > 0 && <section className="place-highlights-section place-highlights-drafts">
        <div className="list-heading"><strong>待确认草稿</strong><small>确认前不会写入存档</small></div>
        {drafts.map((draft, index) => <div className="place-highlight-draft" key={`${draft.nodeId}-${index}`}>
          <div className="list-heading"><strong>{props.save.world.map.nodes[draft.nodeId]?.name ?? draft.nodeId}</strong><button type="button" className="danger" onClick={() => setDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div>
          <label>类型<select value={draft.kind} onChange={(event) => setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, kind: event.target.value as PlaceHighlightDraft['kind'] } : item))}><option value="hotspot">热点</option><option value="activity">活动</option></select></label>
          <label>标题<input maxLength={80} value={draft.title} onChange={(event) => setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} /></label>
          <label>内容<textarea maxLength={1000} value={draft.body} onChange={(event) => setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item))} /></label>
          <label className="map-editor-check"><input type="checkbox" checked={draft.allowsNewNpc} onChange={(event) => setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, allowsNewNpc: event.target.checked } : item))} />允许活动叙事提出临时新人</label>
        </div>)}
        <div className="button-row"><button type="button" onClick={confirmDrafts}>确认并保存全部</button><button type="button" className="secondary" onClick={() => setDrafts([])}>取消草稿</button></div>
      </section>}

      <section className="place-highlights-section">
        <div className="list-heading"><strong>{editingId ? '编辑地点动态' : '手工创建'}</strong>{editingId && <button type="button" className="secondary" onClick={() => beginCreate(form.nodeId)}>取消编辑</button>}</div>
        <label>地点<select value={form.nodeId} onChange={(event) => setForm((value) => ({ ...value, nodeId: event.target.value }))}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}{node.discovered ? '' : '（未发现）'}</option>)}</select></label>
        <label>类型<select value={form.kind} onChange={(event) => setForm((value) => ({ ...value, kind: event.target.value as PlaceHighlight['kind'] }))}><option value="hotspot">热点</option><option value="activity">活动</option></select></label>
        <label>标题<input maxLength={80} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} /></label>
        <label>内容<textarea maxLength={1000} value={form.body} onChange={(event) => setForm((value) => ({ ...value, body: event.target.value }))} /></label>
        <label className="map-editor-check"><input type="checkbox" checked={form.allowsNewNpc} onChange={(event) => setForm((value) => ({ ...value, allowsNewNpc: event.target.checked }))} />允许活动叙事提出临时新人</label>
        <button type="button" disabled={!form.nodeId || !form.title.trim() || !form.body.trim()} onClick={saveForm}>{editingId ? '保存修改' : '创建动态'}</button>
      </section>

      <section className="place-highlights-section">
        <div className="list-heading"><strong>按地点查看</strong><small>{props.save.world.placeHighlights.length} 条</small></div>
        {nodes.map((node) => {
          const entries = props.save.world.placeHighlights.filter((item) => item.nodeId === node.id);
          return <article className="place-highlight-group" key={node.id}>
            <div className="list-heading"><div><strong>{node.name}</strong><small>{node.discovered ? '已发现' : '未发现 · 仅管理抽屉可见'}</small></div><div className="button-row"><button type="button" className="secondary" onClick={() => beginCreate(node.id)}>新建</button><button type="button" className="secondary" disabled={!node.discovered || node.id === props.save.world.player.nodeId} onClick={() => props.onNavigate(node.id)}>{node.id === props.save.world.player.nodeId ? '当前位置' : '前往'}</button></div></div>
            <div className="place-highlight-single-gen"><input aria-label={`${node.name}生成要求`} value={singleRequirements[node.id] ?? ''} onChange={(event) => setSingleRequirements((value) => ({ ...value, [node.id]: event.target.value }))} placeholder="单地点生成要求，可留空" /><button type="button" className="secondary" disabled={props.busy} onClick={() => void generate(node.id)}>AI 生成 1 条</button></div>
            {entries.length === 0 ? <p className="empty">暂无动态。</p> : entries.map((item) => <div className="place-highlight-entry" key={item.id}><div className="list-heading"><div><strong>{item.title}</strong><small>{item.kind === 'hotspot' ? '热点' : '活动'} · {item.source === 'ai' ? 'AI 草稿确认' : '手工创建'} · 更新于第 {item.updatedDay} 天</small></div><div className="button-row"><button type="button" className="secondary" onClick={() => beginEdit(item)}>编辑</button>{item.kind === 'activity' && <button type="button" onClick={() => props.onStartActivity(item.id)}>参加</button>}<button type="button" className="danger" onClick={() => props.onDelete(item.id)}>删除</button></div></div><p>{item.body}</p>{item.allowsNewNpc && <small>允许活动叙事提出临时新人</small>}</div>)}
          </article>;
        })}
      </section>
    </aside>
  </div>;
}
