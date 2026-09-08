import { describe, expect, it } from 'vitest';
import { settlementRelationNumbers } from '../src/ui/settlement';

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
});
