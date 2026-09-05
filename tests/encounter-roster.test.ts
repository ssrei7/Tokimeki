import { describe, expect, it } from 'vitest';
import { addCharacterToWorld, formalCharacterFromCard } from '../src/core/encounter';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import type { CharacterCard } from '../src/data/content';

const card: CharacterCard = {
  id: 'mio', name: '澪', description: '喜欢在街角观察人群。', personality: '温和。', firstMes: '你好。', updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('formal character roster', () => {
  it('converts a local character card into a home-based formal character', () => {
    const character = formalCharacterFromCard(card, 'start');
    expect(character).toMatchObject({ id: 'mio', name: '澪', tier: 'formal', homeNodeId: 'start', source: 'user' });
    expect(character.schedule).toEqual({ grid: {}, overrides: {} });
    expect(character.card.firstMes).toBe('你好。');
  });

  it('adds a character to the world without changing existing schedule data', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'roster', title: 'Roster' }));
    const result = addCharacterToWorld(save.world, card);
    expect(result.ok).toBe(true);
    expect(save.world.characters.mio.homeNodeId).toBe('start');
    const updated = addCharacterToWorld(save.world, { ...card, description: '更新后的描述。' });
    expect(updated.ok).toBe(true);
    expect(save.world.characters.mio.card.description).toBe('更新后的描述。');
    expect(save.world.characters.mio.schedule).toEqual({ grid: {}, overrides: {} });
  });

  it('rejects a home node that is not on the map', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'roster-invalid', title: 'Roster invalid' }));
    expect(addCharacterToWorld(save.world, card, 'missing').ok).toBe(false);
  });
});
