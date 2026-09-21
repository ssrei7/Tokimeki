import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { createWorldPackage, mergeWorldPackage } from '../src/data/io/world-package';
import { CURRENT_WORLD_PACKAGE_SCHEMA_VERSION, exportWorldPackage, importWorldPackage } from '../src/data/io/zip';
import { createDefaultMap, CURRENT_SCHEMA_VERSION } from '../src/data/schema/save';

describe('world package IO', () => {
  it('round trips static world content without dynamic progress', async () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'world-pack', title: 'World pack' }));
    save.world.map.nodes.harbor = { ...save.world.map.nodes.start, id: 'harbor', name: '港口' };
    save.world.items.flower = { id: 'flower', name: '花', tags: ['flower'], stackable: true, giftable: true };
    const pack = createWorldPackage({ id: 'harbor-world', name: '港口世界', map: save.world.map, characters: save.world.characters, npcs: save.world.npcs, npcTemplates: save.world.npcTemplates, items: save.world.items, eventDefs: save.world.eventDefs, worldbooks: [], characterCards: [] });
    const imported = await importWorldPackage(await exportWorldPackage(pack));
    expect(imported.manifest).toMatchObject({ type: 'world', schemaVersion: CURRENT_WORLD_PACKAGE_SCHEMA_VERSION });
    expect(imported.pack.map.nodes.harbor.name).toBe('港口');
    expect(imported.pack.items.flower.name).toBe('花');
    expect('placeHighlights' in imported.pack).toBe(false);
  });

  it('merges package static content while preserving unrelated dynamic state', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'merge', title: 'Merge' }));
    const map = createDefaultMap();
    map.nodes.harbor = { ...map.nodes.start, id: 'harbor', name: '港口' };
    const pack = createWorldPackage({ id: 'harbor-world', name: '港口世界', map, characters: {}, npcs: {}, npcTemplates: {}, items: { flower: { id: 'flower', name: '花', tags: [], stackable: true, giftable: true } }, eventDefs: {}, worldbooks: [], characterCards: [] });
    const day = save.world.clock.day;
    mergeWorldPackage(save.world, pack);
    expect(save.world.map.nodes.harbor.name).toBe('港口');
    expect(save.world.items.flower.name).toBe('花');
    expect(save.world.clock.day).toBe(day);
  });

  it('rejects future world package schemas', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ type: 'world', appVersion: '9.9.9', schemaVersion: 999 }));
    zip.file('world.json', JSON.stringify({ id: 'future', name: '未来', map: createDefaultMap(), characters: {}, npcs: {}, npcTemplates: {}, items: {}, eventDefs: {}, worldbooks: [], characterCards: [] }));
    await expect(importWorldPackage(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('请升级小小地图');
    expect(CURRENT_SCHEMA_VERSION).toBe(43);
  });
});
