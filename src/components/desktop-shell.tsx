import type { LucideIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { desktopIconContrastForLuminance, readWallpaperLuminance, type DesktopIconContrast } from '@/ui/desktop-icon-contrast';
import { clearDesktopOrder, clearDesktopPages, moveIdBefore, moveIdToPageEnd, readDesktopOrder, readDesktopPages, reconcileDesktopOrder, writeDesktopOrder, writeDesktopPage } from './desktop-order';
import { readDesktopIconOverrides, readDesktopTitleOverrides } from '@/ui/theme/preferences';
import { loadAsset } from '@/data/db/assets';
import type { AssetRef } from '@/data/schema/save';
import { DEFAULT_APP_NAME } from '@/ui/branding';
import { desktopSwipeTargetPage } from '@/ui/desktop-swipe';
import { PackageHelpPortal } from './package-help-dialog';

export type DesktopEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  iconAsset?: AssetRef;
  tone?: 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'gray';
};

const DEFAULT_DESKTOP_PAGE_ROWS = 6;
const SWIPE_DESKTOP_PAGE_ROWS = 4;

export function DesktopLauncher({ launcherId, title, entries, onOpen, wallpaperUrl, appName = DEFAULT_APP_NAME }: { launcherId: string; title: string; entries: readonly DesktopEntry[]; onOpen: (id: string) => void; wallpaperUrl?: string; appName?: string }) {
  const [contrast, setContrast] = useState<DesktopIconContrast | null>(null);
  const [columns, setColumns] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 700px)').matches ? 6 : 4);
  const [page, setPage] = useState(0);
  const [reorderMode, setReorderMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [titleOverrides, setTitleOverrides] = useState(() => typeof window === 'undefined' ? {} : readDesktopTitleOverrides(window.localStorage));
  const [iconOverrides, setIconOverrides] = useState(() => typeof window === 'undefined' ? {} : readDesktopIconOverrides(window.localStorage));
  const entryIds = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const entryIdsKey = entryIds.join('\u0001');
  const [orderedIds, setOrderedIds] = useState(() => readDesktopOrder(launcherId, entryIds));
  const [pageAssignments, setPageAssignments] = useState<Record<string, number>>(() => readDesktopPages(launcherId, entryIds));
  const longPressRef = useRef<{ id: string; timer: number; x: number; y: number } | null>(null);
  const dragPageRef = useRef<number | null>(null);
  const swipeRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const swipeEnabled = launcherId === 'terminal' || launcherId === 'settings';
  const pageSize = columns * (swipeEnabled ? SWIPE_DESKTOP_PAGE_ROWS : DEFAULT_DESKTOP_PAGE_ROWS);
  const orderedEntries = useMemo(() => { const byId = new Map(entries.map((entry) => [entry.id, entry])); return orderedIds.map((id) => byId.get(id)).filter((entry): entry is DesktopEntry => Boolean(entry)); }, [entries, orderedIds]);
  const assignedPage = (id: string, index: number) => pageAssignments[id] ?? Math.floor(index / pageSize);
  const pageCount = Math.max(1, ...orderedEntries.map((entry, index) => assignedPage(entry.id, index) + 1));
  const visibleEntries = orderedEntries.filter((entry, index) => assignedPage(entry.id, index) === page).slice(0, pageSize);
  const titledEntries = visibleEntries.map((entry) => ({ ...entry, label: titleOverrides[launcherId]?.[entry.id]?.trim() || entry.label, iconAsset: iconOverrides[launcherId]?.[entry.id] ?? entry.iconAsset }));
  const commitOrder = (next: readonly string[], movedId?: string) => {
    const reconciled = reconcileDesktopOrder(next, entryIds);
    setOrderedIds(reconciled);
    writeDesktopOrder(launcherId, reconciled);
    if (movedId) {
      const index = reconciled.indexOf(movedId);
      setAnnouncement(`${entries.find((entry) => entry.id === movedId)?.label ?? '图标'}已移动到第 ${Math.floor(index / pageSize) + 1} 页、第 ${index % pageSize + 1} 个位置`);
    }
  };
  const enterReorderMode = (id: string) => { setReorderMode(true); setFocusedId(id); setDraggedId(id); dragPageRef.current = null; suppressClickRef.current = true; navigator.vibrate?.(12); setAnnouncement('已进入排列模式'); };
  const stopLongPress = () => { if (longPressRef.current) { window.clearTimeout(longPressRef.current.timer); longPressRef.current = null; } };
  const handlePointerDown = (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    if (reorderMode) { setDraggedId(id); setFocusedId(id); suppressClickRef.current = true; return; }
    stopLongPress();
    const timer = window.setTimeout(() => enterReorderMode(id), 500);
    longPressRef.current = { id, timer, x: event.clientX, y: event.clientY };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = longPressRef.current;
    if (!pending) return;
    if (Math.abs(event.clientX - pending.x) > 8 || Math.abs(event.clientY - pending.y) > 8) stopLongPress();
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
    if (launcherId === 'terminal' || launcherId === 'settings') {
      setPageAssignments((current) => ({ ...current, [draggedId]: targetPage }));
      writeDesktopPage(launcherId, draggedId, targetPage);
    }
    setPage(targetPage);
    setDraggedId(null);
  };
  const handleLauncherPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && reorderMode) setReorderMode(false);
    if (!swipeEnabled || reorderMode || pageCount <= 1 || event.button !== 0) return;
    swipeRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const handleLauncherPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!reorderMode || !draggedId) {
      const swipe = swipeRef.current;
      if (swipe?.pointerId === event.pointerId && Math.abs(event.clientX - swipe.x) > 8) stopLongPress();
      return;
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-desktop-entry-id], [data-desktop-page]');
    const targetEntryId = target?.dataset.desktopEntryId;
    if (targetEntryId && targetEntryId !== draggedId) {
      dragPageRef.current = null;
      commitOrder(moveIdBefore(orderedIds, draggedId, targetEntryId), draggedId);
      if (launcherId === 'terminal' || launcherId === 'settings') {
        const targetIndex = orderedIds.indexOf(targetEntryId);
        const targetPageIndex = targetIndex >= 0 ? assignedPage(targetEntryId, targetIndex) : page;
        setPageAssignments((current) => ({ ...current, [draggedId]: targetPageIndex }));
        writeDesktopPage(launcherId, draggedId, targetPageIndex);
      }
      return;
    }
    const targetPage = target?.dataset.desktopPage;
    if (targetPage !== undefined) {
      dragPageRef.current = Number(targetPage);
      setPage(Number(targetPage));
    }
    if ((launcherId === 'terminal' || launcherId === 'settings') && event.clientX >= window.innerWidth - 32) {
      const nextPage = pageCount;
      dragPageRef.current = nextPage;
      setPage(nextPage);
    }
  };
  const handleLauncherPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (reorderMode && draggedId !== null && dragPageRef.current !== null) moveToPage(dragPageRef.current);
    else {
      const swipe = swipeRef.current;
      if (swipe?.pointerId === event.pointerId) {
        const targetPage = desktopSwipeTargetPage(page, pageCount, event.clientX - swipe.x, event.clientY - swipe.y);
        if (targetPage !== null) {
          suppressClickRef.current = true;
          setPage(targetPage);
          setAnnouncement(`已切换到第 ${targetPage + 1} 页`);
          window.setTimeout(() => { suppressClickRef.current = false; }, 0);
        }
      }
    }
    swipeRef.current = null;
    dragPageRef.current = null;
  };
  const handleLauncherPointerCancel = () => { swipeRef.current = null; dragPageRef.current = null; stopLongPress(); };
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
    setPageAssignments((current) => {
      const allowed = new Set(entryIds);
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => allowed.has(id) && Number.isInteger(current[id]) && current[id] >= 0));
      if (Object.keys(next).length !== Object.keys(current).length) {
        clearDesktopPages(launcherId);
        for (const [id, pageIndex] of Object.entries(next)) writeDesktopPage(launcherId, id, pageIndex);
      }
      return next;
    });
  }, [launcherId, entryIdsKey]);
  useEffect(() => () => stopLongPress(), []);
  useEffect(() => { const refresh = () => { setTitleOverrides(readDesktopTitleOverrides(window.localStorage)); setIconOverrides(readDesktopIconOverrides(window.localStorage)); }; window.addEventListener('tokimeki:theme-change', refresh); return () => window.removeEventListener('tokimeki:theme-change', refresh); }, []);
  const style = contrast ? {
    '--desktop-icon-ink': contrast.ink,
    '--desktop-icon-label': contrast.label,
    '--desktop-icon-border': contrast.border,
    '--desktop-icon-shadow': contrast.shadow,
  } as CSSProperties : undefined;
  return <section className={cn('desktop-launcher', swipeEnabled && 'swipe-enabled', pageCount > 1 && 'paginated', reorderMode && 'reorder-mode')} aria-label={title} style={style} onPointerDown={handleLauncherPointerDown} onPointerMove={handleLauncherPointerMove} onPointerUp={handleLauncherPointerUp} onPointerCancel={handleLauncherPointerCancel}>
    <PageHeader eyebrow={appName} title={title} action={reorderMode ? <div className="desktop-reorder-actions"><button type="button" className="secondary" onClick={() => { clearDesktopOrder(launcherId); clearDesktopPages(launcherId); setOrderedIds([...entryIds]); setPageAssignments({}); setAnnouncement('已恢复默认排列'); }}>恢复默认</button><button type="button" onClick={() => { setReorderMode(false); setDraggedId(null); setAnnouncement('已退出排列模式'); }}>完成</button></div> : undefined} />
    <div className="desktop-grid" onPointerDown={(event) => { if (event.target === event.currentTarget && reorderMode) setReorderMode(false); }}>
      {titledEntries.map((entry) => <DesktopAppIcon key={entry.id} entry={entry} reorderMode={reorderMode} dragged={draggedId === entry.id} focused={focusedId === entry.id} onOpen={handleIconClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onKeyDown={(id, event) => { if (!reorderMode && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); enterReorderMode(id); return; } if (!reorderMode) return; const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowDown' ? columns : 0; if (offset) { event.preventDefault(); moveByOffset(id, offset); } }} />)}
    </div>
    {pageCount > 1 && <nav className="desktop-pagination" aria-label="桌面页码">{Array.from({ length: pageCount }, (_, index) => <button key={index} type="button" data-desktop-page={index} className={cn(index === page && 'active', reorderMode && draggedId && 'drop-target')} aria-label={`第 ${index + 1} 页`} aria-current={index === page ? 'page' : undefined} onClick={() => setPage(index)}><span aria-hidden="true" /></button>)}</nav>}
    {reorderMode && <p className="desktop-reorder-hint">拖动图标或使用方向键重新排列；拖到页码可移动到其他页。</p>}
    <p className="sr-only" aria-live="polite">{announcement}</p>
  </section>;
}

export function DesktopAppIcon({ entry, reorderMode, dragged, focused, onOpen, onPointerDown, onPointerMove, onPointerUp, onKeyDown }: { entry: DesktopEntry & { iconAsset?: AssetRef }; reorderMode: boolean; dragged: boolean; focused: boolean; onOpen: (id: string) => void; onPointerDown: (id: string, event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerUp: () => void; onKeyDown: (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => void }) {
  const Icon = entry.icon;
  const [src, setSrc] = useState<string>();
  useEffect(() => { let objectUrl: string | undefined; let cancelled = false; setSrc(undefined); if (!entry.iconAsset) return () => undefined; if (entry.iconAsset.kind === 'url') { setSrc(entry.iconAsset.url); return () => undefined; } void loadAsset(entry.iconAsset.assetId).then((asset) => { if (!cancelled && asset) { objectUrl = URL.createObjectURL(asset.blob); setSrc(objectUrl); } }); return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [entry.iconAsset]);
  return <button type="button" data-desktop-entry-id={entry.id} className={cn('desktop-app-icon', reorderMode && 'reorderable', dragged && 'dragged', focused && 'reorder-focused')} draggable={false} onClick={() => onOpen(entry.id)} onPointerDown={(event) => onPointerDown(entry.id, event)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={(event) => onKeyDown(entry.id, event)} onContextMenu={(event) => { if (reorderMode) event.preventDefault(); }} aria-label={reorderMode ? `排列${entry.label}` : `打开${entry.label}`} aria-grabbed={dragged}>
    <span className={cn('desktop-app-icon-glyph', `tone-${entry.tone ?? 'gray'}`)} aria-hidden="true">{src ? <img src={src} alt="" onError={() => setSrc(undefined)} /> : <Icon />}</span>
    <span className="desktop-app-icon-label">{entry.label}</span>
  </button>;
}

export function SubpageShell({ title, eyebrow = '设置', pageId, onBack, children }: { title: string; eyebrow?: string; pageId?: string; onBack: () => void; children: ReactNode }) {
  const packageHelp = pageId === 'save' ? <PackageHelpPortal kind="world" targetSelector=".world-package-card > .list-heading" /> : undefined;
  return <section className="subpage-shell">
    <PageHeader eyebrow={eyebrow} title={title} action={<div className="subpage-header-actions">{packageHelp}<button type="button" className="subpage-back" onClick={onBack}><ChevronLeft aria-hidden="true" />返回桌面</button></div>} />
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
