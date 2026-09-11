import { Pause, Play, Plus, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SurfaceCard } from './desktop-shell';
import type { MusicTrack } from '../data/content';
import type { MusicPlayerController } from '../features/music/player';
import { musicModeLabel } from '../features/music/player';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function MusicApp({ player, onNotify }: { player: MusicPlayerController; onNotify?: (message: string, tone?: 'success' | 'error') => void }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [url, setUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!editingId) return;
    const track = player.state.tracks.find((item) => item.id === editingId);
    if (!track) { setEditingId(null); return; }
    setTitle(track.title); setArtist(track.artist); setUrl(track.url);
  }, [editingId, player.state.tracks]);

  const notify = (text: string, tone: 'success' | 'error' = 'success') => { setNotice({ text, tone }); onNotify?.(text, tone); };
  const clearForm = () => { setTitle(''); setArtist(''); setUrl(''); setEditingId(null); };
  const saveTrack = () => {
    const result = editingId
      ? player.updateTrack(editingId, { title, artist, url })
      : player.addTrack({ title, artist, url });
    if (!result.ok) { notify(result.warning ?? '曲目信息无效。', 'error'); return; }
    notify(editingId ? '曲目已更新。' : '曲目已添加。');
    clearForm();
  };
  const current = player.currentTrack;
  const max = Math.max(player.duration, player.currentTime, 1);

  return <div className="music-app" data-testid="music-app">
    {notice && <p className={`feedback ${notice.tone}`} role="status">{notice.text}<button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}>×</button></p>}
    <SurfaceCard className="music-now-playing">
      <div className="list-heading"><div><span className="eyebrow">当前播放</span><h3>{current?.title ?? '尚未选择曲目'}</h3><p className="io-scope">{current?.artist || '外链音频'}{player.isPlaying ? ' · 正在播放' : ' · 已暂停'}</p></div><span className="status-badge">{musicModeLabel(player.state.mode)}</span></div>
      <div className="music-progress"><input aria-label="播放进度" type="range" min="0" max={max} step="0.1" value={Math.min(player.currentTime, max)} onChange={(event) => player.seek(Number(event.target.value))} /><div><span>{formatTime(player.currentTime)}</span><span>{formatTime(player.duration)}</span></div></div>
      <div className="music-controls" aria-label="播放控制">
        <button type="button" className="icon-button" aria-label="上一首" onClick={player.previous}><SkipBack aria-hidden="true" /></button>
        <button type="button" className="music-play-button" aria-label={player.isPlaying ? '暂停' : '播放'} onClick={() => { if (player.isPlaying) player.pause(); else void player.play(); }}>{player.isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
        <button type="button" className="icon-button" aria-label="下一首" onClick={player.next}><SkipForward aria-hidden="true" /></button>
        <label className="music-volume">音量<input aria-label="音量" type="range" min="0" max="1" step="0.01" value={player.state.volume} onChange={(event) => player.setVolume(Number(event.target.value))} /></label>
      </div>
      {player.state.lastError && <p className="feedback error" role="alert">{player.state.lastError}</p>}
    </SurfaceCard>

    <SurfaceCard className="music-mode-card"><div className="list-heading"><h3>播放模式</h3><span className="io-scope">三选一</span></div><div className="music-mode-buttons">{([['sequence', '顺序', Play], ['shuffle', '随机', Shuffle], ['repeat-one', '单曲循环', Repeat1]] as const).map(([mode, label, Icon]) => <button key={mode} type="button" className={player.state.mode === mode ? 'selected' : ''} onClick={() => player.setMode(mode)}><Icon aria-hidden="true" />{label}</button>)}</div></SurfaceCard>

    <SurfaceCard className="music-list-card"><div className="list-heading"><div><h3>播放列表</h3><span className="io-scope">仅保存链接，不下载音频</span></div><span className="io-scope">{player.state.tracks.length} 首</span></div>{player.state.tracks.length === 0 ? <p className="empty">还没有曲目，请添加一个 http(s) 音频链接。</p> : <div className="music-track-list">{player.state.tracks.map((track, index) => <MusicTrackRow key={track.id} track={track} index={index} active={track.id === player.state.currentTrackId} playing={player.isPlaying && track.id === player.state.currentTrackId} onSelect={() => player.selectTrack(track.id)} onPlay={() => { player.selectTrack(track.id); window.setTimeout(() => void player.play(), 0); }} onEdit={() => setEditingId(track.id)} onDelete={() => { player.removeTrack(track.id); if (editingId === track.id) clearForm(); }} onMoveUp={() => player.moveTrack(track.id, -1)} onMoveDown={() => player.moveTrack(track.id, 1)} />)}</div>}</SurfaceCard>

    <SurfaceCard className="music-form-card"><div className="list-heading"><h3>{editingId ? '替换曲目' : '添加曲目'}</h3>{editingId && <button type="button" className="icon-button" aria-label="取消编辑" onClick={clearForm}><X aria-hidden="true" /></button>}</div><div className="music-form"><label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="曲目名称" /></label><label>艺术家<input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="可选" /></label><label className="music-url-field">音频 URL<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/audio.mp3" inputMode="url" /></label><button type="button" onClick={saveTrack}><Plus aria-hidden="true" />{editingId ? '保存替换' : '添加曲目'}</button></div></SurfaceCard>
  </div>;
}

function MusicTrackRow({ track, index, active, playing, onSelect, onPlay, onEdit, onDelete, onMoveUp, onMoveDown }: { track: MusicTrack; index: number; active: boolean; playing: boolean; onSelect: () => void; onPlay: () => void; onEdit: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void }) {
  return <div className={`music-track-row ${active ? 'active' : ''}`}><button type="button" className="music-track-main" onClick={onSelect}><span className="music-track-index">{playing ? '▶' : index + 1}</span><span><strong>{track.title}</strong><small>{track.artist || '未填写艺术家'}</small></span></button><div className="button-row music-track-actions"><button type="button" className="icon-button" aria-label={playing ? '暂停曲目' : '播放曲目'} onClick={onPlay}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button><button type="button" className="text-button" onClick={onMoveUp} disabled={index === 0}>上移</button><button type="button" className="text-button" onClick={onMoveDown}>下移</button><button type="button" className="text-button" onClick={onEdit}>编辑</button><button type="button" className="icon-button danger-icon" aria-label={`删除${track.title}`} onClick={onDelete}><Trash2 aria-hidden="true" /></button></div></div>;
}
