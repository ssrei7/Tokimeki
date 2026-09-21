import { useState } from 'react';
import type { PlaceHighlight } from '../data/schema/save';
import type { ActivityInviteCandidate, ActivityNarration, TemporaryNpcProposal } from '../core/place-activity';

interface PlaceActivityDialogProps {
  highlight: PlaceHighlight;
  candidates: ActivityInviteCandidate[];
  busy: boolean;
  narration?: ActivityNarration;
  onClose: () => void;
  onStart: (invitedIds: string[], requirements: string) => void | Promise<void>;
  onConfirmNpc: (proposal: TemporaryNpcProposal) => void;
  onDiscardNpc: () => void;
}

export function PlaceActivityDialog(props: PlaceActivityDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [requirements, setRequirements] = useState('');
  const [solo, setSolo] = useState(true);
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const confirmedNarration = props.narration;
  return <div className="place-activity-overlay" role="presentation" onClick={props.onClose}>
    <section className="place-activity-dialog" role="dialog" aria-modal="true" aria-label="参加地点活动" onClick={(event) => event.stopPropagation()}>
      <header className="place-highlights-header"><div><span className="eyebrow">地点活动</span><h2>{props.highlight.title}</h2></div><button type="button" className="secondary" onClick={props.onClose}>关闭</button></header>
      <p>{props.highlight.body}</p>
      {!confirmedNarration && <>
        <label>活动要求（可留空）<textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="例如：希望氛围轻松一些。" /></label>
        <fieldset><legend>参加方式</legend><label className="map-editor-check"><input type="radio" checked={solo} onChange={() => setSolo(true)} />独自参加</label><label className="map-editor-check"><input type="radio" checked={!solo} onChange={() => setSolo(false)} />邀请当前地点在场者</label></fieldset>
        {!solo && <div className="activity-invite-list">{props.candidates.length ? props.candidates.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={selected.includes(candidate.id)} onChange={() => toggle(candidate.id)} /><span>{candidate.name}<small>{candidate.tier === 'formal' ? '正式角色' : '半正式 NPC'} · {candidate.activity}</small></span></label>) : <p className="empty">当前地点没有可邀请的在场者。</p>}</div>}
        <button type="button" disabled={props.busy || (!solo && selected.length === 0)} onClick={() => props.onStart(solo ? [] : selected, requirements)}>{props.busy ? '正在描写活动…' : '确认参加'}</button>
        <small className="io-scope">活动可重复参加，不消耗行动点，不保存完成次数或奖励。</small>
      </>}
      {confirmedNarration && <div className="activity-narration"><p>{confirmedNarration.narrative}</p>{confirmedNarration.newNpc && <div className="activity-npc-proposal"><div className="list-heading"><strong>活动中遇见的新人物</strong><small>确认后才会保存为半正式 NPC</small></div><p><strong>{confirmedNarration.newNpc.name}</strong></p><p>{confirmedNarration.newNpc.facts.join('；') || '暂无事实摘要'}</p><div className="tag-row">{confirmedNarration.newNpc.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div><div className="button-row"><button type="button" onClick={() => props.onConfirmNpc(confirmedNarration.newNpc!)}>确认保存</button><button type="button" className="secondary" onClick={props.onDiscardNpc}>放弃</button></div></div>}<button type="button" className="secondary" onClick={props.onClose}>返回地点</button></div>}
    </section>
  </div>;
}
