import { describe, expect, it } from 'vitest';
import { mapPresenceVisual } from '../src/ui/map-presence';
import { PLAYER_ACCENT_COLOR, resolveCharacterAccentColors, resolveSpeakerAccentColor } from '../src/ui/character-color';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

describe('map presence visuals', () => {
  it('uses a formal character avatar, accent color, and first character fallback', () => {
    const world = seedScenario(createCurrentSaveScenario({ id: 'map-presence', title: 'Map presence' })).world;
    world.characters.seir = {
      id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '', personality: '' },
      visuals: { avatar: { kind: 'url', url: 'https://example.test/avatar.webp' }, portraits: [], accentColor: '#315efb' },
    };
    expect(mapPresenceVisual(world, { id: 'seir', name: '塞伊尔', tier: 'formal', nodeId: 'start', activity: '在附近', source: 'home' })).toEqual({
      id: 'seir', name: '塞伊尔', initial: '塞', accentColor: '#315efb', avatar: { kind: 'url', url: 'https://example.test/avatar.webp' },
    });
  });

  it('uses the neutral first-character fallback for a semi-formal NPC', () => {
    const world = seedScenario(createCurrentSaveScenario({ id: 'map-presence-semi', title: 'Map presence semi' })).world;
    expect(mapPresenceVisual(world, { id: 'vendor', name: '摊主', tier: 'semi', nodeId: 'start', activity: '在附近', source: 'home' })).toEqual({
      id: 'vendor', name: '摊主', initial: '摊', accentColor: '#667085', avatar: undefined,
    });
  });

  it('assigns stable distinct defaults while preserving explicit formal character colors', () => {
    const world = seedScenario(createCurrentSaveScenario({ id: 'map-presence-colors', title: 'Map presence colors' })).world;
    world.characters = {
      rin: { id: 'rin', name: '凛', tier: 'formal', card: { description: '', personality: '' }, visuals: { portraits: [] } },
      seir: { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '', personality: '' }, visuals: { portraits: [] } },
      cecil: { id: 'cecil', name: '塞西尔', tier: 'formal', card: { description: '', personality: '' }, visuals: { portraits: [], accentColor: '#123456' } },
    };

    const first = resolveCharacterAccentColors(world.characters);
    const second = resolveCharacterAccentColors(world.characters);

    expect(first).toEqual(second);
    expect(first.cecil).toBe('#123456');
    expect(new Set(Object.values(first)).size).toBe(3);
    expect(mapPresenceVisual(world, { id: 'rin', name: '凛', tier: 'formal', nodeId: 'start', activity: '在附近', source: 'home' }, first).accentColor).toBe(first.rin);
    expect(resolveSpeakerAccentColor('rin', first)).toBe(first.rin);
    expect(resolveSpeakerAccentColor('player', first)).toBe(PLAYER_ACCENT_COLOR);
    expect(resolveSpeakerAccentColor('vendor', first)).toBe('#667085');
  });
});
