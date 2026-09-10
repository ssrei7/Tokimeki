import { availableSlots } from '../../core/time';
import type { CalendarConfig, CurrencyDef, JobContract, JobRule, MorningBriefEntry, RentRule, WorldState } from '../../data/schema/save';

export interface RentalQuote {
  nodeId: string;
  rule: RentRule;
  currency: CurrencyDef;
  amount: number;
  intervalDays: number;
}

export interface JobQuote {
  nodeId: string;
  rule: JobRule;
  currency: CurrencyDef;
  wage: number;
}

export type JobShiftStatus = 'unemployed' | 'invalid' | 'upcoming' | 'ready' | 'wrong_node' | 'worked' | 'missed';

export function formatCurrency(amount: number, currency: CurrencyDef): string {
  const value = amount.toFixed(currency.decimals);
  return currency.symbol ? `${currency.symbol}${value}` : `${value} ${currency.name}`;
}

export function getRentalQuote(world: WorldState, nodeId: string, rentRuleId = 'standard', requireDiscovered = true): RentalQuote | undefined {
  const node = world.map.nodes[nodeId];
  if (!node || (requireDiscovered && !node.discovered)) return undefined;
  const rule = world.economy.rentRules[rentRuleId];
  if (!rule) return undefined;
  const currency = world.economy.currencies[rule.currencyId];
  const amount = world.player.stats[rule.amountStatKey];
  const intervalDays = world.player.stats[rule.intervalDaysStatKey];
  if (!currency || !Number.isFinite(amount) || amount < 0 || !Number.isInteger(intervalDays) || intervalDays <= 0) return undefined;
  return { nodeId, rule, currency, amount, intervalDays };
}

export function getJobQuote(world: WorldState, nodeId: string, jobRuleId = 'standard', requireDiscovered = true): JobQuote | undefined {
  const node = world.map.nodes[nodeId];
  if (!node || (requireDiscovered && !node.discovered)) return undefined;
  const rule = world.economy.jobRules[jobRuleId];
  if (!rule) return undefined;
  const currency = world.economy.currencies[rule.currencyId];
  const wage = world.player.stats[rule.wageStatKey];
  if (!currency || !Number.isFinite(wage) || wage < 0) return undefined;
  return { nodeId, rule, currency, wage };
}

export function jobWorkFlagKey(job: Pick<JobContract, 'id'>, day: number): string {
  return `economy.job.${job.id}.worked.${day}`;
}

export function getJobShiftStatus(world: WorldState, calendar: CalendarConfig): JobShiftStatus {
  const job = world.player.job;
  if (!job) return 'unemployed';
  const quote = getJobQuote(world, job.nodeId, job.jobRuleId, false);
  if (!quote) return 'invalid';
  if (world.player.flags[jobWorkFlagKey(job, world.clock.day)]) return 'worked';
  const activeSlots = [...calendar.slots].sort((left, right) => left.order - right.order).slice(0, availableSlots(calendar));
  const currentIndex = activeSlots.findIndex((slot) => slot.id === world.clock.slotId);
  const shiftIndex = activeSlots.findIndex((slot) => slot.id === quote.rule.shiftSlotId);
  if (currentIndex < 0 || shiftIndex < 0) return 'invalid';
  if (currentIndex < shiftIndex) return 'upcoming';
  if (currentIndex > shiftIndex) return 'missed';
  return world.player.nodeId === job.nodeId ? 'ready' : 'wrong_node';
}

export function injectEconomyMorningAds(entries: readonly MorningBriefEntry[], world: WorldState, day: number): MorningBriefEntry[] {
  const next = [...entries];
  if (!world.player.housing && !next.some((entry) => entry.category === 'ad' && entry.entryKind === 'housing')) {
    addLocalEconomyAd(next, {
      id: `morning-${day}-housing`, day, category: 'ad', entryKind: 'housing', title: '可入住的住所',
      body: '这里有一份由本地经济规则提供的租房方案；广告文字不决定租金，确认页显示的条款才是世界事实。',
      nodeId: world.player.nodeId, charIds: [], expiresDay: day + 3, source: 'local',
    });
  }
  if (!world.player.job && getJobQuote(world, world.player.nodeId) && !next.some((entry) => entry.category === 'ad' && entry.entryKind === 'job')) {
    addLocalEconomyAd(next, {
      id: `morning-${day}-job`, day, category: 'ad', entryKind: 'job', title: '街区正在招人',
      body: '这是一份由本地岗位规则提供的工作；招聘文字不决定班次或工资，确认页显示的条款才是世界事实。',
      nodeId: world.player.nodeId, charIds: [], expiresDay: day + 3, source: 'local',
    });
  }
  return next;
}

function addLocalEconomyAd(entries: MorningBriefEntry[], ad: MorningBriefEntry): void {
  if (entries.length < 6) {
    entries.push(ad);
    return;
  }
  const reverseIndex = [...entries].reverse().findIndex((entry) => (entry.category === 'ad' && !entry.entryKind) || entry.category === 'ambience');
  if (reverseIndex >= 0) entries[entries.length - 1 - reverseIndex] = ad;
}
