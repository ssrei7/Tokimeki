import { describe, expect, it } from 'vitest';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { getSoftGoals } from '../src/features/life';

function setup() {
  return seedScenario(createCurrentSaveScenario({ id: 'soft-goals', title: 'Soft goals' }));
}

describe('stage 8 persistent soft goals', () => {
  it('always exposes housing, relationship, and career goals without extra state fields', () => {
    const save = setup();
    const goals = getSoftGoals(save.world, save.config.calendar);
    expect(goals.map((goal) => goal.id)).toEqual(['housing', 'relationship', 'career']);
    expect(goals.every((goal) => goal.status === 'open')).toBe(true);
    expect(goals[0].title).toContain('住所');
    expect(goals[2].title).toContain('事业');
  });

  it('derives completed housing and career progress from deterministic facts', () => {
    const save = setup();
    save.world.player.housing = { id: 'rental-start', nodeId: 'start', rentRuleId: 'standard', nextDueDayStatKey: 'economy.rent.next-due-day', tierId: 'settled' };
    save.world.player.job = { id: 'job-start', nodeId: 'start', jobRuleId: 'standard' };
    save.world.player.flags['economy.job.job-start.worked.1'] = true;
    const goals = getSoftGoals(save.world, save.config.calendar);
    expect(goals[0]).toMatchObject({ id: 'housing', status: 'complete', title: '维持住所生活' });
    expect(goals[2]).toMatchObject({ id: 'career', status: 'complete', title: '今日班次已完成' });
  });

  it('switches the relationship goal to completed after a same-day deterministic encounter', () => {
    const save = setup();
    save.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '测试角色', personality: '安静' }, visuals: { portraits: [] } };
    save.world.relations.seir = { axes: {}, knots: [], memories: [], lastSeenDay: 1, metDay: 1 };
    const goal = getSoftGoals(save.world, save.config.calendar).find((item) => item.id === 'relationship');
    expect(goal).toMatchObject({ status: 'complete', targetId: 'seir', title: '今天已见到塞伊尔' });
  });

  it('keeps at least one goal open when all three daily facts were completed', () => {
    const save = setup();
    save.world.player.housing = { id: 'rental-start', nodeId: 'start', rentRuleId: 'standard', nextDueDayStatKey: 'economy.rent.next-due-day', tierId: 'settled' };
    save.world.player.job = { id: 'job-start', nodeId: 'start', jobRuleId: 'standard' };
    save.world.player.flags['economy.job.job-start.worked.1'] = true;
    save.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '测试角色', personality: '安静' }, visuals: { portraits: [] } };
    save.world.relations.seir = { axes: {}, knots: [], memories: [], lastSeenDay: 1, metDay: 1 };
    const goals = getSoftGoals(save.world, save.config.calendar);
    expect(goals.some((goal) => goal.status === 'open')).toBe(true);
    expect(goals.find((goal) => goal.id === 'career')).toMatchObject({ title: '规划下一次事业行动', status: 'open' });
  });
});
