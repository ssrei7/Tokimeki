import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../src/core/expr';

describe('safe condition evaluator', () => {
  const scope = {
    player: { stats: { money: 120, trust: 20 }, flags: { invited: true } },
    world: { stats: { tension: 3 }, flags: { raining: false } },
  };

  it('evaluates member-based numeric and logical conditions', () => {
    expect(evaluateCondition('player.stats.money > 100', scope)).toBe(true);
    expect(evaluateCondition('player.flags.invited and player.stats.trust >= 20', scope)).toBe(true);
    expect(evaluateCondition('world.flags.raining or world.stats.tension > 5', scope)).toBe(false);
  });

  it('rejects unknown variables and non-boolean results', () => {
    expect(() => evaluateCondition('player.stats.unknown > 0', scope)).toThrow();
    expect(() => evaluateCondition('player.stats.money + 1', scope)).toThrow('boolean');
  });

  it('rejects function calls, unsafe members, and function values', () => {
    expect(() => evaluateCondition('max(player.stats.money, 1) > 2', scope)).toThrow('Function calls');
    expect(() => evaluateCondition('player.constructor.name == "Object"', scope)).toThrow('Unsafe member');
    expect(() => evaluateCondition('danger == 1', { danger: (() => 1) as unknown as number })).toThrow('Functions');
  });
});
