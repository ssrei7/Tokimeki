import type { LucideIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { desktopIconContrastForLuminance, readWallpaperLuminance, type DesktopIconContrast } from '@/ui/desktop-icon-contrast';
import { clearDesktopOrder, moveIdBefore, moveIdToPageEnd, readDesktopOrder, reconcileDesktopOrder, writeDesktopOrder } from './desktop-order';

export type DesktopEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'gray';
};

const DESKTOP_PAGE_ROWS = 6;

export function DesktopLauncher({ launcherId, title, entries, onOpen, wallpaperUrl, appName = 'Tokimeki' }: { launcherId: string; title: string; entries: readonly DesktopEntry[]; onOpen: (id: string) => void; wallpaperUrl?: string; appName?: string }) {
  const [contrast, setContrast] = useState<DesktopIconContrast | null>(null);
  const [columns, setColumns] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 700px)').matches ? 6 : 4);
  const [page, setPage] = useState(0);
  const [reorderMode, setReorderMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const entryIds = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const entryIdsKey = entryIds.join('\u0001');
  const [orderedIds, setOrderedIds] = useState(() => readDesktopOrder(launcherId, entryIds));
  const longPressRef = useRef<{ id: string; timer: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const pageSize = columns * DESKTOP_PAGE_ROWS;
  const orderedEntries = useMemo(() => { const byId = new Map(entries.map((entry) => [entry.id, entry])); return orderedIds.map((id) => byId.get(id)).filter((entry): entry is DesktopEntry => Boolean(entry)); }, [entries, orderedIds]);
  const pageCount = Math.max(1, Math.ceil(orderedEntries.length / pageSize));
  const visibleEntries = orderedEntries.slice(page * pageSize, (page + 1) * pageSize);
  const commitOrder = (next: readonly string[], movedId?: string) => {
    const reconciled = reconcileDesktopOrder(next, entryIds);
    setOrderedIds(reconciled);
    writeDesktopOrder(launcherId, reconciled);
    if (movedId) {
      const index = reconciled.indexOf(movedId);
      setAnnouncement(`${entries.find((entry) => entry.id === movedId)?.label ?? '图标'}已移动到第 ${Math.floor(index / pageSize) + 1} 页、第 ${index % pageSize + 1} 个位置`);
    }
  };
  const enterReorderMode = (id: string) => { setReorderMode(true); setFocusedId(id); setDraggedId(id); suppressClickRef.current = true; navigator.vibrate?.(12); setAnnouncement('已进入排列模式'); };
  const stopLongPress = () => { if (longPressRef.current) { window.clearTimeout(longPressRef.current.timer); longPressRef.current = null; } };
  const handlePointerDown = (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    if (reorderMode) { setDraggedId(id); setFocusedId(id); suppressClickRef.current = true; return; }
    stopLongPress();
    const timer = window.setTimeout(() => enterReorderMode(id), 500);
    longPressRef.current = { id, timer, moved: false };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = longPressRef.current;
    if (!pending) return;
    if (Math.abs(event.movementX) > 6 || Math.abs(event.movementY) > 6) { pending.moved = true; stopLongPress(); }
  };
  const handlePointerUp = () => { stopLongPress(); window.setTimeout(() => { setDraggedId(null); suppressClickRef.current = false; }, 0); };
  const handleIconClick = (id: string) => { if (reorderMode || suppressClickRef.current) return; onOpen(id); };
  const moveByOffset = (id: string, offset: number) => {
    const index = orderedIds.indexOf(id);
    if (index < 0) return;
    const targetIndex = Math.max(0, Math.min(orderedIds.length - 1, index + offset));
    if (targetIndex === index) return;
    const next = [...orderedIds];
    next.splice(index, 1);
    next.splice(targetIndex, 0, id);
    commitOrder(next, id);
    setFocusedId(id);
  };
  const moveToPage = (targetPage: number) => {
    if (!draggedId) return;
    commitOrder(moveIdToPageEnd(orderedIds, draggedId, targetPage, pageSize), draggedId);
    setPage(targetPage);
    setDraggedId(null);
  };
  useEffect(() => {
    let cancelled = false;
    if (!wallpaperUrl) { setContrast(null); return () => { cancelled = true; }; }
    void readWallpaperLuminance(wallpaperUrl).then((luminance) => {
      if (!cancelled) setContrast(luminance === null ? null : desktopIconContrastForLuminance(luminance));
    });
    return () => { cancelled = true; };
  }, [wallpaperUrl]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 700px)');
    const updateColumns = () => setColumns(media.matches ? 6 : 4);
    updateColumns();
    media.addEventListener?.('change', updateColumns);
    return () => media.removeEventListener?.('change', updateColumns);
  }, []);
  useEffect(() => { setPage((current) => Math.min(current, pageCount - 1)); }, [pageCount]);
  useEffect(() => {
    setOrderedIds((current) => {
      const next = reconcileDesktopOrder(current, entryIds);
      if (next.join('\u0001') !== current.join('\u0001')) writeDesktopOrder(launcherId, next);
      return next;
    });
  }, [launcherId, entryIdsKey]);
  useEffect(() => () => stopLongPress(), []);
  const style = contrast ? {
    '--desktop-icon-ink': contrast.ink,
    '--desktop-icon-label': contrast.label,
    '--desktop-icon-border': contrast.border,
    '--desktop-icon-shadow': contrast.shadow,
  } as CSSProperties : undefined;
  return <section className={cn('desktop-launcher', reorderMode && 'reorder-mode')} aria-label={title} style={style} onPointerDown={(event) => { if (event.target === event.currentTarget && reorderMode) setReorderMode(false); }}>
    <PageHeader eyebrow={appName} title={title} action={reorderMode ? <div className="desktop-reorder-actions"><button type="button" className="secondary" onClick={() => { clearDesktopOrder(launcherId); setOrderedIds([...entryIds]); setAnnouncement('已恢复默认排列'); }}>恢复默认</button><button type="button" onClick={() => { setReorderMode(false); setDraggedId(null); setAnnouncement('已退出排列模式'); }}>完成</button></div> : undefined} />
    <div className="desktop-grid" onPointerDown={(event) => { if (event.target === event.currentTarget && reorderMode) setReorderMode(false); }}>
      {visibleEntries.map((entry) => <DesktopAppIcon key={entry.id} entry={entry} reorderMode={reorderMode} dragged={draggedId === entry.id} focused={focusedId === entry.id} onOpen={handleIconClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerEnter={(id) => { if (reorderMode && draggedId && draggedId !== id) commitOrder(moveIdBefore(orderedIds, draggedId, id), draggedId); }} onDragStart={(id) => { setDraggedId(id); suppressClickRef.current = true; }} onDrop={(id) => { if (draggedId) commitOrder(moveIdBefore(orderedIds, draggedId, id), draggedId); setDraggedId(null); }} onKeyDown={(id, event) => { if (!reorderMode && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); enterReorderMode(id); return; } if (!reorderMode) return; const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowDown' ? columns : 0; if (offset) { event.preventDefault(); moveByOffset(id, offset); } }} />)}
    </div>
    {pageCount > 1 && <nav className="desktop-pagination" aria-label="桌面页码">{Array.from({ length: pageCount }, (_, index) => <button key={index} type="button" className={cn(index === page && 'active', reorderMode && draggedId && 'drop-target')} aria-label={`第 ${index + 1} 页`} aria-current={index === page ? 'page' : undefined} onClick={() => setPage(index)} onPointerEnter={() => { if (reorderMode && draggedId) setPage(index); }} onPointerUp={() => { if (reorderMode && draggedId) moveToPage(index); }} onDragOver={(event) => { if (reorderMode && draggedId) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); moveToPage(index); }}><span aria-hidden="true" /></button>)}</nav>}
    {reorderMode && <p className="desktop-reorder-hint">拖动图标或使用方向键重新排列；拖到页码可移动到其他页。</p>}
    <p className="sr-only" aria-live="polite">{announcement}</p>
  </section>;
}

export function DesktopAppIcon({ entry, reorderMode, dragged, focused, onOpen, onPointerDown, onPointerMove, onPointerUp, onPointerEnter, onDragStart, onDrop, onKeyDown }: { entry: DesktopEntry; reorderMode: boolean; dragged: boolean; focused: boolean; onOpen: (id: string) => void; onPointerDown: (id: string, event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerUp: () => void; onPointerEnter: (id: string) => void; onDragStart: (id: string) => void; onDrop: (id: string) => void; onKeyDown: (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => void }) {
  const Icon = entry.icon;
  return <button type="button" className={cn('desktop-app-icon', reorderMode && 'reorderable', dragged && 'dragged', focused && 'reorder-focused')} draggable={reorderMode} onClick={() => onOpen(entry.id)} onPointerDown={(event) => onPointerDown(entry.id, event)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerEnter={() => onPointerEnter(entry.id)} onDragStart={() => onDragStart(entry.id)} onDragOver={(event) => { if (reorderMode) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); onDrop(entry.id); }} onKeyDown={(event) => onKeyDown(entry.id, event)} onContextMenu={(event) => { if (reorderMode) event.preventDefault(); }} aria-label={reorderMode ? `排列${entry.label}` : `打开${entry.label}`} aria-grabbed={dragged}>
    <span className={cn('desktop-app-icon-glyph', `tone-${entry.tone ?? 'gray'}`)} aria-hidden="true"><Icon /></span>
    <span className="desktop-app-icon-label">{entry.label}</span>
  </button>;
}

export function SubpageShell({ title, eyebrow = '设置', pageId, onBack, children }: { title: string; eyebrow?: string; pageId?: string; onBack: () => void; children: ReactNode }) {
  return <section className="subpage-shell">
    <PageHeader eyebrow={eyebrow} title={title} action={<button type="button" className="subpage-back" onClick={onBack}><ChevronLeft aria-hidden="true" />返回桌面</button>} />
    <div className="subpage-content" data-page={pageId}>{children}</div>
  </section>;
}

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <header className="page-header">
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
    {action}
  </header>;
}

export function SurfaceCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('surface-card', className)}>{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
