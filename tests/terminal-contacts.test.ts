import { describe, expect, it } from 'vitest';

import { buildTerminalReplyPrompt, createFriendRequest, listContactCandidates, listTerminalMessages, resolveFriendRequest, sendTerminalReplyMessage, sendTerminalStickerMessage, sendTerminalTextMessage, simulateFriendAcceptance } from '../src/core/terminal';
import { migrateSave } from '../src/data/migrations';
import { exportSaveZip, importSaveZip } from '../src/data/io/zip';
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

  it('supports simulated acceptance and gates terminal messages on accepted friendship', () => {
    const save = makeSave();
    const blocked = sendTerminalTextMessage(save.world, 'formal', '还没加上');
    expect(blocked).toMatchObject({ ok: false, changed: false });
    const request = createFriendRequest(save.world, 'formal', 'outgoing');
    expect(simulateFriendAcceptance(save.world, request.request!.id)).toMatchObject({ ok: true, changed: true, request: { status: 'accepted' } });
    expect(simulateFriendAcceptance(save.world, request.request!.id).changed).toBe(false);
    const first = sendTerminalTextMessage(save.world, 'formal', '你好');
    expect(first).toMatchObject({ ok: true, changed: true, message: { type: 'text', text: '你好', senderId: 'player' } });
    expect(buildTerminalReplyPrompt(save.world, 'formal')[0]?.content).toContain('玩家主动添加了对方');
    expect(buildTerminalReplyPrompt(save.world, 'formal')[0]?.content).toContain('不要输出 JSON、ops');
    expect(sendTerminalReplyMessage(save.world, 'formal', '收到').message).toMatchObject({ senderId: 'formal', text: '收到' });
    const quoted = sendTerminalTextMessage(save.world, 'formal', '引用这句', 1, 'morning', first.message!.id);
    expect(quoted.message).toMatchObject({ quoteMessageId: first.message!.id, quotePreview: '你好' });
    const sticker = sendTerminalStickerMessage(save.world, 'formal', { kind: 'url', url: 'https://example.com/sticker.webp' });
    expect(sticker.message).toMatchObject({ type: 'sticker', asset: { kind: 'url' } });
    expect(listTerminalMessages(save.world, 'formal')).toHaveLength(4);
    expect(sendTerminalTextMessage(save.world, 'formal', '坏引用', 1, 'morning', 'missing')).toMatchObject({ ok: false, changed: false });
  });

  it('describes an incoming request separately in the terminal reply prompt', () => {
    const save = makeSave();
    const request = createFriendRequest(save.world, 'semi', 'incoming');
    resolveFriendRequest(save.world, request.request!.id, 'accept');
    sendTerminalTextMessage(save.world, 'semi', '在吗');
    const prompt = buildTerminalReplyPrompt(save.world, 'semi');
    expect(prompt[0]?.content).toContain('对方主动添加了玩家');
    expect(prompt.at(-1)).toEqual({ role: 'user', content: '在吗' });
  });

  it('round-trips stored sticker references and assets without base64 save data', async () => {
    const save = makeSave();
    const request = createFriendRequest(save.world, 'formal', 'incoming');
    resolveFriendRequest(save.world, request.request!.id, 'accept');
    expect(sendTerminalStickerMessage(save.world, 'formal', { kind: 'stored', assetId: 'sticker-1.webp' })).toMatchObject({ ok: true, changed: true });
    expect(listTerminalMessages(save.world, 'formal').at(-1)?.asset).toEqual({ kind: 'stored', assetId: 'sticker-1.webp' });
    const blob = await exportSaveZip(save, { 'sticker-1.webp': new Uint8Array([1, 2, 3]) });
    const imported = await importSaveZip(blob);
    expect(listTerminalMessages(imported.save.world, 'formal').at(-1)?.asset).toEqual({ kind: 'stored', assetId: 'sticker-1.webp' });
    expect(Array.from(imported.assets.get('sticker-1.webp') ?? [])).toEqual([1, 2, 3]);
    expect(JSON.stringify(imported.save)).not.toContain('data:image');
  });
});
