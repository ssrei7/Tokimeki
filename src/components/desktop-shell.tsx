import type { LucideIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { desktopIconContrastForLuminance, readWallpaperLuminance, type DesktopIconContrast } from '@/ui/desktop-icon-contrast';

export type DesktopEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'gray';
};

const DESKTOP_PAGE_ROWS = 6;

export function DesktopLauncher({ title, entries, onOpen, wallpaperUrl, appName = 'Tokimeki' }: { title: string; entries: readonly DesktopEntry[]; onOpen: (id: string) => void; wallpaperUrl?: string; appName?: string }) {
  const [contrast, setContrast] = useState<DesktopIconContrast | null>(null);
  const [columns, setColumns] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 700px)').matches ? 6 : 4);
  const [page, setPage] = useState(0);
  const pageSize = columns * DESKTOP_PAGE_ROWS;
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const visibleEntries = entries.slice(page * pageSize, (page + 1) * pageSize);
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
  const style = contrast ? {
    '--desktop-icon-ink': contrast.ink,
    '--desktop-icon-label': contrast.label,
    '--desktop-icon-border': contrast.border,
    '--desktop-icon-shadow': contrast.shadow,
  } as CSSProperties : undefined;
  return <section className="desktop-launcher" aria-label={title} style={style}>
    <PageHeader eyebrow={appName} title={title} />
    <div className="desktop-grid">
      {visibleEntries.map((entry) => <DesktopAppIcon key={entry.id} entry={entry} onOpen={onOpen} />)}
    </div>
    {pageCount > 1 && <nav className="desktop-pagination" aria-label="桌面页码">{Array.from({ length: pageCount }, (_, index) => <button key={index} type="button" className={index === page ? 'active' : ''} aria-label={`第 ${index + 1} 页`} aria-current={index === page ? 'page' : undefined} onClick={() => setPage(index)}><span aria-hidden="true" /></button>)}</nav>}
  </section>;
}

export function DesktopAppIcon({ entry, onOpen }: { entry: DesktopEntry; onOpen: (id: string) => void }) {
  const Icon = entry.icon;
  return <button type="button" className="desktop-app-icon" onClick={() => onOpen(entry.id)} aria-label={`打开${entry.label}`}>
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
