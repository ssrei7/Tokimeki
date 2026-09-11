import type { LucideIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type DesktopEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'gray';
  badge?: string;
};

export function DesktopLauncher({ title, entries, onOpen }: { title: string; entries: readonly DesktopEntry[]; onOpen: (id: string) => void }) {
  return <section className="desktop-launcher" aria-label={title}>
    <PageHeader eyebrow="Tokimeki" title={title} />
    <div className="desktop-grid">
      {entries.map((entry) => <DesktopAppIcon key={entry.id} entry={entry} onOpen={onOpen} />)}
    </div>
  </section>;
}

export function DesktopAppIcon({ entry, onOpen }: { entry: DesktopEntry; onOpen: (id: string) => void }) {
  const Icon = entry.icon;
  return <button type="button" className="desktop-app-icon" onClick={() => onOpen(entry.id)} aria-label={`打开${entry.label}`}>
    <span className={cn('desktop-app-icon-glyph', `tone-${entry.tone ?? 'gray'}`)} aria-hidden="true"><Icon /></span>
    <span className="desktop-app-icon-label">{entry.label}</span>
    {entry.badge && <StatusBadge>{entry.badge}</StatusBadge>}
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

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'error' }) {
  return <span className={cn('status-badge', `status-${tone}`)}>{children}</span>;
}
