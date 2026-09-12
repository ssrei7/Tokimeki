export const DESKTOP_ORDER_STORAGE_KEY = 'tokimeki.desktopOrder.v1';

export type DesktopOrderState = Record<string, string[]>;

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
