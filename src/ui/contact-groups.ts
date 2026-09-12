export const CONTACT_GROUPS_STORAGE_KEY = 'tokimeki.contactGroups.v1';
export const CONTACT_GROUP_COLLAPSED_STORAGE_KEY = 'tokimeki.contactGroupCollapsed.v1';
export const CALL_HISTORY_COLLAPSED_STORAGE_KEY = 'tokimeki.callHistoryCollapsed.v1';

export type ContactCustomGroup = { id: string; name: string };
export type ContactGroupPreferences = { groups: ContactCustomGroup[]; assignments: Record<string, string> };

function readJson(key: string): unknown {
  if (typeof window === 'undefined') return undefined;
  try { return JSON.parse(window.localStorage.getItem(key) ?? 'null'); } catch { return undefined; }
}

export function readContactGroupPreferences(): ContactGroupPreferences {
  const value = readJson(CONTACT_GROUPS_STORAGE_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { groups: [], assignments: {} };
  const groupsValue = (value as { groups?: unknown }).groups;
  const assignmentsValue = (value as { assignments?: unknown }).assignments;
  const groups = Array.isArray(groupsValue) ? groupsValue.filter((item): item is ContactCustomGroup => Boolean(item && typeof item === 'object' && typeof (item as ContactCustomGroup).id === 'string' && typeof (item as ContactCustomGroup).name === 'string' && (item as ContactCustomGroup).id.startsWith('custom-') && (item as ContactCustomGroup).name.trim().length > 0)).map((item) => ({ id: item.id, name: item.name.trim().slice(0, 24) })) : [];
  const validIds = new Set(groups.map((group) => group.id));
  const assignments = assignmentsValue && typeof assignmentsValue === 'object' && !Array.isArray(assignmentsValue)
    ? Object.fromEntries(Object.entries(assignmentsValue).filter(([characterId, groupId]) => typeof characterId === 'string' && typeof groupId === 'string' && validIds.has(groupId)))
    : {};
  return { groups, assignments };
}

export function writeContactGroupPreferences(preferences: ContactGroupPreferences): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CONTACT_GROUPS_STORAGE_KEY, JSON.stringify(preferences)); } catch { /* local preference unavailable */ }
}

export function readContactGroupCollapsed(): Record<string, boolean> {
  const value = readJson(CONTACT_GROUP_COLLAPSED_STORAGE_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, collapsed]) => typeof id === 'string' && typeof collapsed === 'boolean'));
}

export function writeContactGroupCollapsed(collapsed: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CONTACT_GROUP_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed)); } catch { /* local preference unavailable */ }
}

export function readCallHistoryCollapsed(): boolean {
  const value = readJson(CALL_HISTORY_COLLAPSED_STORAGE_KEY);
  return value === true;
}

export function writeCallHistoryCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CALL_HISTORY_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed)); } catch { /* local preference unavailable */ }
}
