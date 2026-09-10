import { describe, expect, it } from 'vitest';
import { settlementFinancialSummary, settlementRelationNumbers } from '../src/ui/settlement';
import { DEFAULT_ECONOMY_STATE, type DailySettlement } from '../src/data/schema/save';

const change = {
  charId: 'rin',
  prose: '凛似乎比昨天更愿意相信你。',
  raw: { trust: 2, affection: -1 },
};

describe('settlement relation display', () => {
  it('keeps numeric relation changes hidden by default', () => {
    expect(settlementRelationNumbers(change, false)).toBeNull();
  });

  it('shows deterministic numeric details only when enabled', () => {
    expect(settlementRelationNumbers(change, true)).toBe('affection -1 · trust +2');
  });

  it('formats rent using world currency metadata instead of a hard-coded name', () => {
    const settlement: DailySettlement = {
      day: 7, footprint: ['start'], met: [], relationChanges: [], income: 0, expense: 10, itemsGained: [], appointmentsTomorrow: [], diary: '',
      economyTransactions: [{ id: 'rent-7-1', kind: 'rent', currencyId: 'default', statKey: 'money', amount: 10, balanceBefore: 5, balanceAfter: -5, description: '起点街区房租 ¤10' }],
    };
    expect(settlementFinancialSummary(settlement, DEFAULT_ECONOMY_STATE)).toBe('房租 -¤10');
  });
});
