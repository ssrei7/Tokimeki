import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { formalCharacterFromCard } from '../src/core/encounter';
import { characterCardForPackage, remapCharacterCardAssetIds } from '../src/data/io/character-package';
import { CURRENT_CHARACTER_PACKAGE_SCHEMA_VERSION, exportCharacterPackage, importCharacterPackage } from '../src/data/io/zip';
import type { CharacterCard } from '../src/data/content';
import type { FormalCharacter } from '../src/data/schema/save';

const character: FormalCharacter = {
  id: 'mio', name: '澪', tier: 'formal', card: { description: '观察人群。', personality: '温和。' },
  visuals: { avatar: { kind: 'stored', assetId: 'avatar-a' }, portraits: [{ id: 'main', name: '默认', image: { kind: 'url', url: 'https://example.com/mio.png' } }] },
  homeNodeId: 'old-world', schedule: { grid: { '0:morning': { nodeId: 'old-world', activity: '散步' } }, overrides: {} },
  giftPrefs: { likeTags: ['flower'], dislikeTags: [], specialItems: {} }, source: 'user',
};

describe('character package IO', () => {
  it('round trips a reusable profile and embedded image without world-specific schedule', async () => {
    const card = characterCardForPackage(undefined, character, '2026-09-14T00:00:00.000Z');
    expect(card.packageProfile?.visuals?.avatar).toEqual({ kind: 'stored', assetId: 'avatar-a' });
    expect(card).not.toHaveProperty('homeNodeId');
    const blob = await exportCharacterPackage(card, { 'avatar-a': new Uint8Array([1, 2, 3]) }, { 'avatar-a': { mimeType: 'image/webp', width: 64, height: 64 } });
    const imported = await importCharacterPackage(blob);
    expect(imported.manifest).toMatchObject({ type: 'character', schemaVersion: CURRENT_CHARACTER_PACKAGE_SCHEMA_VERSION });
    expect(imported.card.packageProfile?.giftPrefs?.likeTags).toEqual(['flower']);
    expect([...imported.assets.get('avatar-a') ?? []]).toEqual([1, 2, 3]);
    expect(imported.assetMeta['avatar-a']).toEqual({ mimeType: 'image/webp', width: 64, height: 64 });
  });

  it('supports reference-only packages and remaps embedded asset ids before storage', async () => {
    const card = characterCardForPackage(undefined, character, '2026-09-14T00:00:00.000Z');
    const imported = await importCharacterPackage(await exportCharacterPackage(card));
    expect(imported.assets.size).toBe(0);
    const remapped = remapCharacterCardAssetIds(imported.card, new Map([['avatar-a', 'imported-avatar']]));
    expect(remapped.packageProfile?.visuals?.avatar).toEqual({ kind: 'stored', assetId: 'imported-avatar' });
    const worldCharacter = formalCharacterFromCard(remapped, 'new-home');
    expect(worldCharacter.homeNodeId).toBe('new-home');
    expect(worldCharacter.schedule).toEqual({ grid: {}, overrides: {} });
    expect(worldCharacter.visuals.avatar).toEqual({ kind: 'stored', assetId: 'imported-avatar' });
  });

  it('rejects future character package schemas', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ type: 'character', appVersion: '9.9.9', schemaVersion: 999 }));
    zip.file('character.json', JSON.stringify({ id: 'future', name: '未来', description: '', personality: '', updatedAt: '2026-09-14T00:00:00.000Z' } satisfies CharacterCard));
    await expect(importCharacterPackage(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('请升级 Tokimeki');
  });
});
