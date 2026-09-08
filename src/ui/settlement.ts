import type { DailySettlement } from '../data/schema/save';

type RelationChange = DailySettlement['relationChanges'][number];

export function settlementRelationNumbers(change: RelationChange, showNumbers: boolean): string | null {
  if (!showNumbers || !change.raw || Object.keys(change.raw).length === 0) return null;
  return Object.entries(change.raw)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key} ${value >= 0 ? '+' : ''}${value}`)
    .join(' · ');
}
