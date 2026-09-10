import type { CalendarConfig, WorldState } from '../../data/schema/save';
import { getHousingTier, getHousingUpgradeOffer, getJobShiftStatus, getShopStatus, jobWorkFlagKey, shopOpenFlagKey } from '../economy/model';

export type SoftGoalKind = 'housing' | 'relationship' | 'career';
export type SoftGoalStatus = 'open' | 'complete';

export interface SoftGoal {
  id: SoftGoalKind;
  kind: SoftGoalKind;
  title: string;
  detail: string;
  status: SoftGoalStatus;
  targetId?: string;
}

/** Derive the three always-visible life goals from deterministic world facts. */
export function getSoftGoals(world: WorldState, calendar: CalendarConfig): SoftGoal[] {
  const goals = [deriveHousingGoal(world), deriveRelationshipGoal(world), deriveCareerGoal(world, calendar)];
  if (!goals.some((goal) => goal.status === 'open')) {
    const career = goals.find((goal) => goal.id === 'career');
    if (career) {
      career.status = 'open';
      career.title = '规划下一次事业行动';
      career.detail = '今天的生活目标已经推进，下一次班次或营业仍可继续安排。';
    }
  }
  return goals;
}

function deriveHousingGoal(world: WorldState): SoftGoal {
  const housing = world.player.housing;
  if (!housing) return { id: 'housing', kind: 'housing', title: '找到一处住所', detail: '查看今日晨报中的住房方案，先让生活有一个落脚点。', status: 'open' };
  const tier = getHousingTier(world);
  const upgrade = getHousingUpgradeOffer(world);
  if (upgrade) return {
    id: 'housing', kind: 'housing',
    title: upgrade.requested ? `等待升级完成：${upgrade.nextTier.name}` : `安排住所升级：${upgrade.nextTier.name}`,
    detail: `${tier?.name ?? housing.tierId} → ${upgrade.nextTier.name} · ${upgrade.requested ? '今日结算时完成' : '回到住所后可安排'}`,
    status: upgrade.requested ? 'complete' : 'open', targetId: upgrade.rule.id,
  };
  return { id: 'housing', kind: 'housing', title: '维持住所生活', detail: `${tier?.name ?? housing.tierId} · 按规则关注下次租金结算。`, status: 'complete' };
}

function deriveRelationshipGoal(world: WorldState): SoftGoal {
  const character = Object.values(world.characters).filter((item) => item.tier === 'formal').sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!character) return { id: 'relationship', kind: 'relationship', title: '等待一段关系开始', detail: '遇见正式角色后，这条目标会跟随最近的关系事实更新。', status: 'open' };
  const relation = world.relations[character.id];
  const seenToday = relation?.lastSeenDay === world.clock.day || relation?.metDay === world.clock.day;
  const stage = relation?.stageId ? `当前阶段：${relation.stageId}` : '关系仍在初始阶段';
  return {
    id: 'relationship', kind: 'relationship',
    title: seenToday ? `今天已见到${character.name}` : `与${character.name}再见一面`,
    detail: `${stage} · ${seenToday ? '今天的关系推进已留下事实' : '前往可见地点或等待一次确定性相遇'}`,
    status: seenToday ? 'complete' : 'open', targetId: character.id,
  };
}

function deriveCareerGoal(world: WorldState, calendar: CalendarConfig): SoftGoal {
  const shop = world.player.shop;
  if (shop) {
    const status = getShopStatus(world, calendar);
    const opened = Boolean(world.player.flags[shopOpenFlagKey(shop, world.clock.day)]);
    return { id: 'career', kind: 'career', title: opened ? '今日营业已完成' : '经营一次自己的店铺', detail: opened ? '营业事实会在日结时累计事业进度。' : describeShopStatus(status), status: opened ? 'complete' : 'open', targetId: shop.shopRuleId };
  }
  const job = world.player.job;
  if (job) {
    const status = getJobShiftStatus(world, calendar);
    const worked = Boolean(world.player.flags[jobWorkFlagKey(job, world.clock.day)]);
    return { id: 'career', kind: 'career', title: worked ? '今日班次已完成' : status === 'missed' ? '准备下一次工作班次' : '完成今日工作班次', detail: worked ? '工资会在日结时按规则结算。' : describeJobStatus(status), status: worked ? 'complete' : 'open', targetId: job.jobRuleId };
  }
  return { id: 'career', kind: 'career', title: '开始一条事业线', detail: '从晨报查看招聘或店铺转让；接受与否由你决定，不会阻断其他玩法。', status: 'open' };
}

function describeJobStatus(status: ReturnType<typeof getJobShiftStatus>): string {
  if (status === 'upcoming') return '班次尚未开始，按时到岗即可。';
  if (status === 'wrong_node') return '需要前往岗位绑定的地点。';
  if (status === 'missed') return '今天的班次已错过，明天仍可继续。';
  if (status === 'invalid') return '岗位配置暂不可用，其他生活目标不受影响。';
  return '按岗位规则到岗并完成班次。';
}

function describeShopStatus(status: ReturnType<typeof getShopStatus>): string {
  if (status === 'closed') return '当前不在营业时段，之后仍可回到店铺营业。';
  if (status === 'wrong_node') return '需要前往店铺绑定的地点。';
  if (status === 'invalid') return '店铺营业规则暂不可用，其他生活目标不受影响。';
  return '在配置的营业时段回到店铺即可开始营业。';
}
