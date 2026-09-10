import { z } from 'zod';
import type { OpContext, OpResult } from '../../core/ops/types';
import { OpRegistry } from '../../core/ops/registry';
import { formatCurrency, getRentalQuote } from './model';

const AcceptRentalSchema = z.object({
  op: z.literal('accept_rental'),
  nodeId: z.string().min(1),
  rentRuleId: z.string().min(1).default('standard'),
});

const SettleRentSchema = z.object({
  op: z.literal('settle_rent'),
});

export function createEconomyOpRegistry(): OpRegistry {
  const registry = new OpRegistry();
  registerEconomyOps(registry);
  return registry;
}

export function registerEconomyOps(registry: OpRegistry): void {
  registry.register({
    op: 'accept_rental',
    schema: AcceptRentalSchema,
    clamp: {},
    promptDoc: 'accept_rental is a local user-confirmed command and is not exposed to narrative providers.',
    describe: (payload) => `accept rental at ${payload.nodeId}`,
    apply: (payload, context) => acceptRental(payload, context),
  });
  registry.register({
    op: 'settle_rent',
    schema: SettleRentSchema,
    clamp: {},
    promptDoc: 'settle_rent is an internal onDaySettle command and is not exposed to narrative providers.',
    describe: () => 'settle due rent',
    apply: (_payload, context) => settleRent(context),
  });
}

function acceptRental(payload: z.infer<typeof AcceptRentalSchema>, context: OpContext): OpResult {
  if (context.world.player.housing) return rejected('Only one active housing contract is supported in this slice.');
  const quote = getRentalQuote(context.world, payload.nodeId, payload.rentRuleId);
  if (!quote) return rejected('The rental node, currency, or deterministic rent terms are invalid.');
  const nextDueDayStatKey = 'economy.rent.next-due-day';
  const beforeHome = context.world.player.homeNodeId;
  const beforeDue = context.world.player.stats[nextDueDayStatKey];
  const nextDueDay = context.day + quote.intervalDays;
  const housing = { id: `rental-${payload.nodeId}`, nodeId: payload.nodeId, rentRuleId: quote.rule.id, nextDueDayStatKey };
  context.world.player.homeNodeId = payload.nodeId;
  context.world.player.housing = housing;
  context.world.player.stats[nextDueDayStatKey] = nextDueDay;
  return { ok: true, changes: [
    { path: 'world.player.homeNodeId', before: beforeHome, after: payload.nodeId, description: `Set player home to ${payload.nodeId}.` },
    { path: 'world.player.housing', before: undefined, after: housing, description: `Accepted ${quote.rule.name}.` },
    { path: `world.player.stats.${nextDueDayStatKey}`, before: beforeDue, after: nextDueDay, description: `Next rent is due on day ${nextDueDay}.` },
  ] };
}

function settleRent(context: OpContext): OpResult {
  const housing = context.world.player.housing;
  const settlement = context.settlement;
  if (!housing || !settlement) return { ok: true, changes: [] };
  const quote = getRentalQuote(context.world, housing.nodeId, housing.rentRuleId, false);
  if (!quote) return rejected('The active housing contract references invalid rent terms.');
  const dueDay = context.world.player.stats[housing.nextDueDayStatKey];
  if (!Number.isFinite(dueDay)) return rejected('The active housing contract has no valid next due day stat.');
  if (context.day < dueDay) return { ok: true, changes: [] };

  const balanceKey = quote.currency.statKey;
  const balanceBefore = context.world.player.stats[balanceKey] ?? 0;
  const balanceAfter = balanceBefore - quote.amount;
  const periods = Math.floor((context.day - dueDay) / quote.intervalDays) + 1;
  const nextDueDay = dueDay + periods * quote.intervalDays;
  const nodeName = context.world.map.nodes[housing.nodeId]?.name ?? housing.nodeId;
  const description = `${nodeName}房租 ${formatCurrency(quote.amount, quote.currency)}`;
  const transaction = {
    id: `rent-${context.day}-${settlement.economyTransactions.length + 1}`,
    kind: 'rent' as const,
    currencyId: quote.currency.id,
    statKey: balanceKey,
    amount: quote.amount,
    balanceBefore,
    balanceAfter,
    description,
  };

  context.world.player.stats[balanceKey] = balanceAfter;
  context.world.player.stats[housing.nextDueDayStatKey] = nextDueDay;
  settlement.economyTransactions.push(transaction);
  if (quote.currency.id === context.world.economy.defaultCurrencyId) settlement.expense += quote.amount;
  settlement.diary = `${settlement.diary} 今日支付了${description}。`;
  const diary = context.world.diary.find((entry) => entry.day === context.day);
  if (diary && !diary.editedAt) diary.text = settlement.diary;

  return { ok: true, changes: [
    { path: `world.player.stats.${balanceKey}`, before: balanceBefore, after: balanceAfter, description: `Paid ${description}.` },
    { path: `world.player.stats.${housing.nextDueDayStatKey}`, before: dueDay, after: nextDueDay, description: `Advanced the next rent due day.` },
    { path: `world.settlements.${settlement.day}.economyTransactions`, before: settlement.economyTransactions.length - 1, after: settlement.economyTransactions.length, description: `Recorded ${description}.` },
  ] };
}

function rejected(warning: string): OpResult {
  return { ok: false, changes: [], warning };
}
