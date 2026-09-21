import { useEffect, useState, type KeyboardEvent } from 'react';
import { DEFAULT_DIRECTOR_PREFERENCES, type DirectorPreferences, type FormalCharacter } from '../data/schema/save';

interface DirectorPreferencesViewProps {
  preferences: DirectorPreferences;
  characters: FormalCharacter[];
  onSave: (preferences: DirectorPreferences) => void;
}

type TagField = 'toneTags' | 'npcPreferenceTags' | 'avoidTags';

const PACE_OPTIONS: Array<{ id: DirectorPreferences['pace']; label: string }> = [
  { id: 'slice_of_life', label: '日常为主' },
  { id: 'slow_burn', label: '慢慢升温' },
  { id: 'plot_forward', label: '推进主线' },
  { id: 'high_drama', label: '高戏剧性' },
];

export function normalizeDirectorTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().slice(0, 40);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
    if (normalized.length === 20) break;
  }
  return normalized;
}

export function DirectorPreferencesView(props: DirectorPreferencesViewProps) {
  const [draft, setDraft] = useState(() => structuredClone(props.preferences));
  const [tagInputs, setTagInputs] = useState<Record<TagField, string>>({ toneTags: '', npcPreferenceTags: '', avoidTags: '' });
  useEffect(() => setDraft(structuredClone(props.preferences)), [props.preferences]);
  const update = <K extends keyof DirectorPreferences>(key: K, value: DirectorPreferences[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const addTags = (field: TagField) => {
    const additions = tagInputs[field].split(/[，,]/);
    update(field, normalizeDirectorTags([...draft[field], ...additions]));
    setTagInputs((current) => ({ ...current, [field]: '' }));
  };
  const tagKeyDown = (field: TagField, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ',' && event.key !== '，') return;
    event.preventDefault();
    addTags(field);
  };
  const tags = (field: TagField, label: string, placeholder: string) => <div className="director-tag-field">
    <label>{label}<span className="director-tag-input"><input value={tagInputs[field]} maxLength={200} placeholder={placeholder} onChange={(event) => setTagInputs((current) => ({ ...current, [field]: event.target.value }))} onKeyDown={(event) => tagKeyDown(field, event)} /><button type="button" className="secondary" onClick={() => addTags(field)} disabled={!tagInputs[field].trim() || draft[field].length >= 20}>添加</button></span></label>
    <div className="tag-row">{draft[field].map((tag) => <button type="button" className="tag director-tag" key={tag} aria-label={`删除${tag}`} onClick={() => update(field, draft[field].filter((item) => item !== tag))}>{tag} ×</button>)}</div>
    <small>{draft[field].length} / 20；按 Enter 或逗号添加。</small>
  </div>;
  const clear = () => {
    const empty = structuredClone(DEFAULT_DIRECTOR_PREFERENCES) as DirectorPreferences;
    setDraft(empty);
    setTagInputs({ toneTags: '', npcPreferenceTags: '', avoidTags: '' });
    props.onSave(empty);
  };
  return <div className="director-preferences-view">
    <section className="list-card director-intro"><div className="section-heading"><div><span className="eyebrow">当前世界</span><h2>剧情导演</h2></div></div><p>这些设置会影响后续叙事、话题和新人物的创作倾向，不会直接修改关系、金钱、时间、地点、日程或已有角色资料。保存与清空均为本地操作，不调用 API。</p></section>
    <section className="list-card director-form">
      <label>当前剧情方向<textarea maxLength={2000} value={draft.storyDirection} placeholder="例如：轻松的校园恋爱群像，角色会主动制造见面机会。" onChange={(event) => update('storyDirection', event.target.value)} /></label>
      {tags('toneTags', '剧情氛围', '甜、暧昧、治愈……')}
      <label>剧情节奏<select value={draft.pace} onChange={(event) => update('pace', event.target.value as DirectorPreferences['pace'])}>{PACE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label>玩家或角色设定<textarea maxLength={800} value={draft.playerRoleNotes} placeholder="例如：默认玩家是万人迷；或某个角色更容易成为众人关注的中心。" onChange={(event) => update('playerRoleNotes', event.target.value)} /></label>
      {tags('npcPreferenceTags', 'NPC 出现偏好', '帅气、男性青年、温柔、神秘……')}
      {tags('avoidTags', '希望减少的元素', '背叛、长期误会、过度冲突……')}
      <label>近期剧情目标<textarea maxLength={1200} value={draft.shortTermGoal} placeholder="例如：先让玩家逐渐认识三个新 NPC，不要立刻进入主线。" onChange={(event) => update('shortTermGoal', event.target.value)} /></label>
      <fieldset><legend>重点角色（最多 5 位）</legend><div className="director-focus-list">{props.characters.length ? props.characters.map((character) => <label key={character.id}><input type="checkbox" checked={draft.focusCharacterIds.includes(character.id)} disabled={!draft.focusCharacterIds.includes(character.id) && draft.focusCharacterIds.length >= 5} onChange={(event) => update('focusCharacterIds', event.target.checked ? [...draft.focusCharacterIds, character.id].slice(0, 5) : draft.focusCharacterIds.filter((id) => id !== character.id))} />{character.name}</label>) : <p className="empty">当前世界还没有正式角色。</p>}</div></fieldset>
      <div className="button-row"><button type="button" onClick={() => props.onSave({ ...draft, toneTags: normalizeDirectorTags(draft.toneTags), npcPreferenceTags: normalizeDirectorTags(draft.npcPreferenceTags), avoidTags: normalizeDirectorTags(draft.avoidTags) })}>保存导演设置</button><button type="button" className="danger" onClick={clear}>清空设置</button></div>
      <small className="io-scope">提示词预设负责长期文风与互动规则；剧情导演负责这个世界当前想往哪里发展。格式契约和状态安全边界始终优先。</small>
    </section>
  </div>;
}
