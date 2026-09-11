import { describe, expect, it } from 'vitest';

import { createFriendRequest, listContactCandidates, resolveFriendRequest } from '../src/core/terminal';
import { migrateSave } from '../src/data/migrations';
import { CURRENT_SCHEMA_VERSION } from '../src/data/schema/save';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

function makeSave() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'terminal-contacts', title: 'Terminal contacts' }));
  save.world.characters.formal = {
    id: 'formal', name: '正式角色', tier: 'formal',
    card: { description: '正式', personality: '稳重' },
    visuals: { portraits: [], avatar: { kind: 'url', url: 'https://example.com/formal.png' } },
    homeNodeId: 'start',
    schedule: { grid: { '0:morning': { nodeId: 'start', activity: '在门口' } }, overrides: {} },
  };
  save.world.npcs.semi = { id: 'semi', name: '半正式角色', tier: 'semi', facts: [], tags: [], lightMemory: [], homeNodeId: 'start' };
  save.world.npcs.npc = { id: 'npc', name: '路人甲', tier: 'semi', facts: [], tags: [], lightMemory: [] };
  return save;
}

describe('terminal contacts', () => {
  it('migrates v38 saves to an empty v39 terminal container', () => {
    const save = makeSave();
    const legacy = structuredClone(save) as Record<string, unknown>;
    legacy.schemaVersion = 38;
    const world = legacy.world as Record<string, unknown>;
    delete world.terminal;
    const migrated = migrateSave(legacy);
    expect(CURRENT_SCHEMA_VERSION).toBe(39);
    expect(migrated.schemaVersion).toBe(39);
    expect(migrated.world.terminal).toEqual({ friendRequests: [], messageThreads: {}, transferRequests: [], callRecords: [] });
    expect(migrated.world.characters.formal.name).toBe('正式角色');
  });

  it('lists formal, semi-formal and npc candidates with local presence and avatar fallback', () => {
    const save = makeSave();
    const candidates = listContactCandidates(save.world, 1, 'morning', 7);
    expect(candidates.map((candidate) => candidate.id)).toEqual(['formal', 'npc', 'semi']);
    expect(candidates.find((candidate) => candidate.id === 'formal')?.location).toMatchObject({ nodeId: 'start', nodeName: '起点街区', activity: '在门口' });
    expect(candidates.find((candidate) => candidate.id === 'formal')?.avatar).toEqual({ kind: 'url', url: 'https://example.com/formal.png' });
    expect(candidates.find((candidate) => candidate.id === 'npc')?.fallbackInitial).toBe('路');
    expect(candidates.find((candidate) => candidate.id === 'npc')?.location).toBeUndefined();
  });

  it('keeps outgoing and incoming request transitions local and idempotent', () => {
    const save = makeSave();
    const before = JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory });
    const outgoing = createFriendRequest(save.world, 'formal', 'outgoing');
    expect(outgoing).toMatchObject({ ok: true, changed: true, request: { status: 'pending', direction: 'outgoing' } });
    const duplicate = createFriendRequest(save.world, 'formal', 'outgoing');
    expect(duplicate.changed).toBe(false);
    expect(resolveFriendRequest(save.world, outgoing.request!.id, 'accept').ok).toBe(false);
    expect(resolveFriendRequest(save.world, outgoing.request!.id, 'revoke')).toMatchObject({ ok: true, changed: true, request: { status: 'revoked' } });
    expect(resolveFriendRequest(save.world, outgoing.request!.id, 'revoke').changed).toBe(false);

    const incoming = createFriendRequest(save.world, 'semi', 'incoming');
    expect(resolveFriendRequest(save.world, incoming.request!.id, 'accept')).toMatchObject({ ok: true, changed: true, request: { status: 'accepted' } });
    expect(resolveFriendRequest(save.world, incoming.request!.id, 'accept').changed).toBe(false);
    expect(JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory })).toBe(before);
  });
});
