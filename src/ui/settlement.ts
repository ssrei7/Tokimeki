import type { DailySettlement, EconomyState } from '../data/schema/save';
import { formatCurrency } from '../features/economy/model';

type RelationChange = DailySettlement['relationChanges'][number];

export function settlementRelationNumbers(change: RelationChange, showNumbers: boolean): string | null {
  if (!showNumbers || !change.raw || Object.keys(change.raw).length === 0) return null;
  return Object.entries(change.raw)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key} ${value >= 0 ? '+' : ''}${value}`)
    .join(' · ');
}

export function settlementFinancialSummary(settlement: DailySettlement, economy: EconomyState): string {
  if (settlement.economyTransactions.length) {
    return settlement.economyTransactions.map((transaction) => {
      const currency = economy.currencies[transaction.currencyId];
      if (!currency) return transaction.description;
      return transaction.kind === 'rent'
        ? `房租 -${formatCurrency(transaction.amount, currency)}`
        : `工资 +${formatCurrency(transaction.amount, currency)}`;
    }).join(' · ');
  }
  const currency = economy.currencies[economy.defaultCurrencyId];
  const balance = settlement.income - settlement.expense;
  return currency ? formatCurrency(balance, currency) : String(balance);
}
