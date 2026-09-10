import type { CurrencyDef, MorningBriefEntry, RentRule, WorldState } from '../../data/schema/save';

export interface RentalQuote {
  nodeId: string;
  rule: RentRule;
  currency: CurrencyDef;
  amount: number;
  intervalDays: number;
}

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

export function injectEconomyMorningAds(entries: readonly MorningBriefEntry[], world: WorldState, day: number): MorningBriefEntry[] {
  if (world.player.housing || entries.some((entry) => entry.category === 'ad' && entry.entryKind === 'housing')) return [...entries];
  const housingAd: MorningBriefEntry = {
    id: `morning-${day}-housing`,
    day,
    category: 'ad',
    entryKind: 'housing',
    title: '可入住的住所',
    body: '这里有一份由本地经济规则提供的租房方案；广告文字不决定租金，确认页显示的条款才是世界事实。',
    nodeId: world.player.nodeId,
    charIds: [],
    expiresDay: day + 3,
    source: 'local',
  };
  if (entries.length < 6) return [...entries, housingAd];
  const replaceIndex = [...entries].reverse().findIndex((entry) => entry.category === 'ad' && !entry.entryKind);
  if (replaceIndex < 0) return [...entries];
  const next = [...entries];
  next[entries.length - 1 - replaceIndex] = housingAd;
  return next;
}
