export const DESKTOP_ORDER_STORAGE_KEY = 'tokimeki.desktopOrder.v1';
export const DESKTOP_PAGE_STORAGE_KEY = 'tokimeki.desktopPages.v1';

export type DesktopOrderState = Record<string, string[]>;
export type DesktopPageState = Record<string, Record<string, number>>;

export function reconcileDesktopOrder(saved: unknown, entryIds: readonly string[]): string[] {
  const allowed = new Set(entryIds);
  const seen = new Set<string>();
  const persisted = Array.isArray(saved) ? saved : [];
  const ordered = persisted.filter((id): id is string => {
    if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return [...ordered, ...entryIds.filter((id) => !seen.has(id))];
}

function readState(): DesktopOrderState {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DESKTOP_ORDER_STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => Array.isArray(value) && value.every((id) => typeof id === 'string'))) as DesktopOrderState;
  } catch {
    return {};
  }
}

function readPageState(): DesktopPageState {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DESKTOP_PAGE_STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([launcher, value]) => [launcher, value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, page]) => typeof page === 'number' && Number.isInteger(page) && page >= 0)) as Record<string, number> : {}])) as DesktopPageState;
  } catch { return {}; }
}

export function readDesktopPages(launcherId: string, entryIds: readonly string[]): Record<string, number> {
  const allowed = new Set(entryIds);
  return Object.fromEntries(Object.entries(readPageState()[launcherId] ?? {}).filter(([id]) => allowed.has(id)));
}

export function writeDesktopPage(launcherId: string, entryId: string, page: number): void {
  if (typeof window === 'undefined') return;
  try { const state = readPageState(); state[launcherId] = { ...(state[launcherId] ?? {}), [entryId]: Math.max(0, Math.floor(page)) }; window.localStorage.setItem(DESKTOP_PAGE_STORAGE_KEY, JSON.stringify(state)); } catch { /* local preference unavailable */ }
}

export function clearDesktopPages(launcherId: string): void {
  if (typeof window === 'undefined') return;
  try { const state = readPageState(); delete state[launcherId]; window.localStorage.setItem(DESKTOP_PAGE_STORAGE_KEY, JSON.stringify(state)); } catch { /* local preference unavailable */ }
}

export function readDesktopOrder(launcherId: string, entryIds: readonly string[]): string[] {
  return reconcileDesktopOrder(readState()[launcherId], entryIds);
}

export function writeDesktopOrder(launcherId: string, order: readonly string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const state = readState();
    state[launcherId] = [...order];
    window.localStorage.setItem(DESKTOP_ORDER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local UI preferences may be unavailable; the in-memory order still works.
  }
}

export function clearDesktopOrder(launcherId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const state = readState();
    delete state[launcherId];
    window.localStorage.setItem(DESKTOP_ORDER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local UI preferences may be unavailable.
  }
}

export function moveIdBefore(order: readonly string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId || !order.includes(draggedId) || !order.includes(targetId)) return [...order];
  const next = order.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex < 0 ? next.length : targetIndex, 0, draggedId);
  return next;
}

export function moveIdToPageEnd(order: readonly string[], draggedId: string, page: number, pageSize: number): string[] {
  if (!order.includes(draggedId) || pageSize < 1) return [...order];
  const next = order.filter((id) => id !== draggedId);
  const insertionIndex = Math.min(Math.max(0, (page + 1) * pageSize), next.length);
  next.splice(insertionIndex, 0, draggedId);
  return next;
}
