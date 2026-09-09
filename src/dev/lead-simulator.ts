import { EventBus } from '../core/events/bus';
import { movePlayer } from '../core/map';
import { endDay } from '../core/time';
import { findMatchingHooks, settleHookPool, syncLeadHooks, triggerHook } from '../core/world/hooks';
import type { CalendarConfig, MorningBriefEntry, WorldState } from '../data/schema/save';

export interface LeadSimulationOptions {
  seeds?: readonly number[];
  days?: number;
  startDay?: number;
  followProbability?: number;
  nodeIds?: readonly string[];
  leadExpiresAfterDays?: number;
}

export interface LeadSeedReport {
  seed: number;
  days: number;
  generatedLeads: number;
  followedLeads: number;
  ignoredLeads: number;
  triggeredLeads: number;
  expiredLeads: number;
  pendingLeads: number;
  ignoredRate: number;
}

export interface LeadDistributionReport {
  days: number;
  seeds: number[];
  runs: LeadSeedReport[];
  aggregate: Omit<LeadSeedReport, 'seed' | 'days' | 'ignoredRate'> & { ignoredRate: number };
}

/** Runs a deterministic, provider-free lead-following simulation against cloned worlds. */
export function simulateLeadDistribution(world: WorldState, calendar: CalendarConfig, options: LeadSimulationOptions = {}): LeadDistributionReport {
  const days = Math.max(0, Math.floor(options.days ?? 60));
  const seeds = options.seeds?.length ? options.seeds.map((seed) => Math.floor(seed)) : Array.from({ length: 20 }, (_, index) => index + 1);
  const runs = seeds.map((seed) => simulateLeadSeed(world, calendar, { ...options, days, seed }));
  const aggregate = runs.reduce((total, run) => ({
    generatedLeads: total.generatedLeads + run.generatedLeads,
    followedLeads: total.followedLeads + run.followedLeads,
    ignoredLeads: total.ignoredLeads + run.ignoredLeads,
    triggeredLeads: total.triggeredLeads + run.triggeredLeads,
    expiredLeads: total.expiredLeads + run.expiredLeads,
    pendingLeads: total.pendingLeads + run.pendingLeads,
  }), { generatedLeads: 0, followedLeads: 0, ignoredLeads: 0, triggeredLeads: 0, expiredLeads: 0, pendingLeads: 0 });
  return { days, seeds, runs, aggregate: { ...aggregate, ignoredRate: aggregate.generatedLeads ? aggregate.ignoredLeads / aggregate.generatedLeads : 0 } };
}

function simulateLeadSeed(world: WorldState, calendar: CalendarConfig, options: LeadSimulationOptions & { seed: number }): LeadSeedReport {
  const copy = structuredClone(world);
  const days = Math.max(0, Math.floor(options.days ?? 0));
  const startDay = options.startDay ?? copy.clock.day;
  const targetDay = startDay + days;
  const followProbability = Math.max(0, Math.min(1, options.followProbability ?? 0.5));
  const expiresAfterDays = Math.max(0, Math.floor(options.leadExpiresAfterDays ?? 3));
  const nodeIds = (options.nodeIds?.length ? [...options.nodeIds] : Object.values(copy.map.nodes).filter((node) => node.discovered).map((node) => node.id)).filter((nodeId) => Boolean(copy.map.nodes[nodeId]?.discovered));
  let generatedLeads = 0;
  let followedLeads = 0;
  let ignoredLeads = 0;
  let triggeredLeads = 0;
  let state = (Math.abs(Math.floor(options.seed)) + 1) >>> 0;
  const nextRandom = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const events = new EventBus();
  let guard = 0;
  while (copy.clock.day < targetDay && guard < days * 4 + 8) {
    const day = copy.clock.day;
    settleHookPool(copy, day);
    if (nodeIds.length) {
      const nodeId = nodeIds[Math.floor(nextRandom() * nodeIds.length)];
      const lead: MorningBriefEntry = { id: `sim-lead-${options.seed}-${day}`, day, category: 'lead', title: `模拟线索 ${day}`, body: `固定 seed ${options.seed} 的测试线索。`, nodeId, charIds: [], source: 'local', expiresDay: day + expiresAfterDays };
      syncLeadHooks(copy, [lead]);
      generatedLeads += 1;
      if (nextRandom() < followProbability) {
        followedLeads += 1;
        const move = movePlayer(copy, calendar, nodeId, events);
        if (move.ok) {
          const matches = findMatchingHooks(copy, nodeId, copy.clock.slotId, copy.clock.day);
          matches.forEach(({ hook }) => { if (triggerHook(copy, hook.id).ok) triggeredLeads += 1; });
        }
      } else {
        ignoredLeads += 1;
      }
    }
    if (copy.clock.day === day) endDay(copy, calendar, events);
    guard += 1;
  }
  settleHookPool(copy, copy.clock.day);
  const prefix = `hook-sim-lead-${options.seed}-`;
  const expiredLeads = copy.hooks.filter((hook) => hook.status === 'expired' && hook.id.startsWith(prefix)).length;
  const pendingLeads = copy.hooks.filter((hook) => hook.status === 'available' && hook.id.startsWith(prefix)).length;
  return { seed: options.seed, days, generatedLeads, followedLeads, ignoredLeads, triggeredLeads, expiredLeads, pendingLeads, ignoredRate: generatedLeads ? ignoredLeads / generatedLeads : 0 };
}
