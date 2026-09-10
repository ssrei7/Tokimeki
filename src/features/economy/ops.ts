import { z } from 'zod';
import type { OpContext, OpResult } from '../../core/ops/types';
import { OpRegistry } from '../../core/ops/registry';
import { availableSlots } from '../../core/time';
import { formatCurrency, getJobQuote, getJobShiftStatus, getRentalQuote, jobWorkFlagKey } from './model';

const AcceptRentalSchema = z.object({
  op: z.literal('accept_rental'),
  nodeId: z.string().min(1),
  rentRuleId: z.string().min(1).default('standard'),
});

const SettleRentSchema = z.object({
  op: z.literal('settle_rent'),
});

const AcceptJobSchema = z.object({
  op: z.literal('accept_job'),
  nodeId: z.string().min(1),
  jobRuleId: z.string().min(1).default('standard'),
});

const WorkJobSchema = z.object({
  op: z.literal('work_job'),
});

const SettleJobWageSchema = z.object({
  op: z.literal('settle_job_wage'),
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
  registry.register({
    op: 'accept_job',
    schema: AcceptJobSchema,
    clamp: {},
    promptDoc: 'accept_job is a local user-confirmed command and is not exposed to narrative providers.',
    describe: (payload) => `accept job at ${payload.nodeId}`,
    apply: (payload, context) => acceptJob(payload, context),
  });
  registry.register({
    op: 'work_job',
    schema: WorkJobSchema,
    clamp: {},
    promptDoc: 'work_job is a local user command and is not exposed to narrative providers.',
    describe: () => 'work the current scheduled shift',
    apply: (_payload, context) => workJob(context),
  });
  registry.register({
    op: 'settle_job_wage',
    schema: SettleJobWageSchema,
    clamp: {},
    promptDoc: 'settle_job_wage is an internal onDaySettle command and is not exposed to narrative providers.',
    describe: () => 'settle earned job wage',
    apply: (_payload, context) => settleJobWage(context),
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

function acceptJob(payload: z.infer<typeof AcceptJobSchema>, context: OpContext): OpResult {
  if (context.world.player.job) return rejected('Only one active job is supported in this slice.');
  const quote = getJobQuote(context.world, payload.nodeId, payload.jobRuleId);
  if (!quote) return rejected('The job node, currency, or deterministic wage terms are invalid.');
  const activeSlots = context.calendar
    ? [...context.calendar.slots].sort((left, right) => left.order - right.order).slice(0, availableSlots(context.calendar))
    : [];
  if (!activeSlots.some((slot) => slot.id === quote.rule.shiftSlotId)) return rejected('The job shift is not available in the current calendar rhythm.');
  const job = { id: `job-${payload.nodeId}-${quote.rule.id}`, nodeId: payload.nodeId, jobRuleId: quote.rule.id };
  context.world.player.job = job;
  return { ok: true, changes: [
    { path: 'world.player.job', before: undefined, after: job, description: `Accepted ${quote.rule.name} at ${payload.nodeId}.` },
  ] };
}

function workJob(context: OpContext): OpResult {
  const job = context.world.player.job;
  if (!job) return rejected('The player has no active job.');
  if (!context.calendar || !context.actionCosts) return rejected('Calendar and action costs are required to work a shift.');
  const status = getJobShiftStatus(context.world, context.calendar);
  if (status !== 'ready') return rejected(jobStatusWarning(status));
  const slotCost = Math.max(0, Math.floor(context.actionCosts.work?.slotCost ?? 0));
  const remaining = Math.max(0, availableSlots(context.calendar) - context.world.slotsUsedToday);
  if (!context.calendar.unlimitedSlots && slotCost > remaining) return rejected('There are not enough remaining slots to complete this shift.');
  const flagKey = jobWorkFlagKey(job, context.day);
  context.world.player.flags[flagKey] = true;
  return { ok: true, changes: [
    { path: `world.player.flags.${flagKey}`, before: undefined, after: true, description: `Marked the day ${context.day} shift as worked.` },
  ] };
}

function settleJobWage(context: OpContext): OpResult {
  const job = context.world.player.job;
  const settlement = context.settlement;
  if (!job || !settlement) return { ok: true, changes: [] };
  const flagKey = jobWorkFlagKey(job, context.day);
  if (!context.world.player.flags[flagKey]) return { ok: true, changes: [] };
  const quote = getJobQuote(context.world, job.nodeId, job.jobRuleId, false);
  if (!quote) return rejected('The active job references invalid deterministic wage terms.');

  const balanceKey = quote.currency.statKey;
  const balanceBefore = context.world.player.stats[balanceKey] ?? 0;
  const balanceAfter = balanceBefore + quote.wage;
  const nodeName = context.world.map.nodes[job.nodeId]?.name ?? job.nodeId;
  const description = `${nodeName}${quote.rule.name}工资 ${formatCurrency(quote.wage, quote.currency)}`;
  const transaction = {
    id: `wage-${context.day}-${settlement.economyTransactions.length + 1}`,
    kind: 'wage' as const,
    currencyId: quote.currency.id,
    statKey: balanceKey,
    amount: quote.wage,
    balanceBefore,
    balanceAfter,
    description,
  };

  context.world.player.stats[balanceKey] = balanceAfter;
  delete context.world.player.flags[flagKey];
  settlement.economyTransactions.push(transaction);
  if (quote.currency.id === context.world.economy.defaultCurrencyId) settlement.income += quote.wage;
  settlement.diary = `${settlement.diary} 今日完成了${quote.rule.name}，获得${formatCurrency(quote.wage, quote.currency)}工资。`;
  const diary = context.world.diary.find((entry) => entry.day === context.day);
  if (diary && !diary.editedAt) diary.text = settlement.diary;

  return { ok: true, changes: [
    { path: `world.player.stats.${balanceKey}`, before: balanceBefore, after: balanceAfter, description: `Received ${description}.` },
    { path: `world.player.flags.${flagKey}`, before: true, after: undefined, description: `Cleared the settled shift marker.` },
    { path: `world.settlements.${settlement.day}.economyTransactions`, before: settlement.economyTransactions.length - 1, after: settlement.economyTransactions.length, description: `Recorded ${description}.` },
  ] };
}

function jobStatusWarning(status: ReturnType<typeof getJobShiftStatus>): string {
  if (status === 'wrong_node') return 'The player must be at the job node when the shift starts.';
  if (status === 'upcoming') return 'The scheduled shift has not started yet.';
  if (status === 'missed') return 'The scheduled shift has already been missed today.';
  if (status === 'worked') return 'Today\'s scheduled shift has already been worked.';
  if (status === 'invalid') return 'The active job or shift is invalid.';
  return 'The current shift cannot be worked.';
}

function rejected(warning: string): OpResult {
  return { ok: false, changes: [], warning };
}
