import { describe, expect, it } from 'vitest';

import { buildTerminalReplyPrompt, createFriendRequest, createIncomingTransferProposal, createTerminalOpRegistry, deleteTerminalMessage, editTerminalMessage, listContactCandidates, listTerminalMessages, listTerminalMessageThreads, listTerminalTransfers, resolveFriendRequest, resolveIncomingTransfer, sendPlayerTransfer, sendTerminalReplyMessage, sendTerminalStickerMessage, sendTerminalTextMessage, simulateFriendAcceptance } from '../src/core/terminal';
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
  it('migrates v38 saves to the current terminal container', () => {
    const save = makeSave();
    const legacy = structuredClone(save) as Record<string, unknown>;
    legacy.schemaVersion = 38;
    const world = legacy.world as Record<string, unknown>;
    delete world.terminal;
    const migrated = migrateSave(legacy);
    expect(CURRENT_SCHEMA_VERSION).toBe(41);
    expect(migrated.schemaVersion).toBe(41);
    expect(migrated.world.terminal).toEqual({ friendRequests: [], messageThreads: {}, transferRequests: [], callRecords: [], appointmentRequests: [] });
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

  it('accepts new outgoing and incoming requests locally and keeps legacy incoming decisions idempotent', () => {
    const save = makeSave();
    const before = JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory });
    const outgoing = createFriendRequest(save.world, 'formal', 'outgoing');
    expect(outgoing).toMatchObject({ ok: true, changed: true, request: { status: 'accepted', direction: 'outgoing' } });
    const duplicate = createFriendRequest(save.world, 'formal', 'outgoing');
    expect(duplicate.changed).toBe(false);

    const incoming = createFriendRequest(save.world, 'semi', 'incoming');
    expect(incoming).toMatchObject({ ok: true, changed: true, request: { status: 'accepted', direction: 'incoming' } });
    expect(resolveFriendRequest(save.world, incoming.request!.id, 'accept').changed).toBe(false);
    save.world.terminal.friendRequests.push({ id: 'legacy-incoming', characterId: 'npc', direction: 'incoming', status: 'pending', createdDay: 1, updatedDay: 1 });
    expect(resolveFriendRequest(save.world, 'legacy-incoming', 'reject')).toMatchObject({ ok: true, changed: true, request: { status: 'rejected' } });
    expect(resolveFriendRequest(save.world, 'legacy-incoming', 'reject').changed).toBe(false);
    expect(JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory })).toBe(before);
  });

  it('accepts new requests immediately and gates terminal messages on friendship', () => {
    const save = makeSave();
    const blocked = sendTerminalTextMessage(save.world, 'formal', '还没加上');
    expect(blocked).toMatchObject({ ok: false, changed: false });
    const request = createFriendRequest(save.world, 'formal', 'outgoing');
    expect(request).toMatchObject({ ok: true, changed: true, request: { status: 'accepted' } });
    expect(simulateFriendAcceptance(save.world, request.request!.id).changed).toBe(false);
    const first = sendTerminalTextMessage(save.world, 'formal', '你好');
    expect(first).toMatchObject({ ok: true, changed: true, message: { type: 'text', text: '你好', senderId: 'player' } });
    expect(buildTerminalReplyPrompt(save.world, 'formal')[0]?.content).toContain('玩家主动添加了对方');
    expect(buildTerminalReplyPrompt(save.world, 'formal')[0]?.content).toContain('terminal_transfer_proposal');
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
    createFriendRequest(save.world, 'semi', 'incoming');
    sendTerminalTextMessage(save.world, 'semi', '在吗');
    const prompt = buildTerminalReplyPrompt(save.world, 'semi');
    expect(prompt[0]?.content).toContain('对方主动添加了玩家');
    expect(prompt.at(-1)).toEqual({ role: 'user', content: '在吗' });
  });

  it('edits and deletes either side of a terminal thread without changing world facts', () => {
    const save = makeSave();
    createFriendRequest(save.world, 'formal', 'outgoing');
    const playerMessage = sendTerminalTextMessage(save.world, 'formal', '原始玩家消息').message!;
    const reply = sendTerminalReplyMessage(save.world, 'formal', '原始对方消息').message!;
    const factsBefore = JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory });

    expect(editTerminalMessage(save.world, 'formal', playerMessage.id, '修改后的玩家消息')).toMatchObject({ ok: true, changed: true });
    expect(editTerminalMessage(save.world, 'formal', reply.id, '修改后的对方消息')).toMatchObject({ ok: true, changed: true });
    expect(listTerminalMessages(save.world, 'formal').map((message) => message.text)).toEqual(['修改后的玩家消息', '修改后的对方消息']);
    expect(editTerminalMessage(save.world, 'formal', reply.id, '   ')).toMatchObject({ ok: false, changed: false });
    expect(deleteTerminalMessage(save.world, 'formal', playerMessage.id)).toMatchObject({ ok: true, changed: true });
    expect(deleteTerminalMessage(save.world, 'formal', playerMessage.id)).toMatchObject({ ok: false, changed: false });
    expect(listTerminalMessages(save.world, 'formal').map((message) => message.id)).toEqual([reply.id]);
    expect(JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory })).toBe(factsBefore);
  });

  it('lists only existing terminal threads in deterministic most-recent order', () => {
    const save = makeSave();
    createFriendRequest(save.world, 'formal', 'outgoing');
    createFriendRequest(save.world, 'semi', 'incoming');
    createFriendRequest(save.world, 'npc', 'outgoing');
    sendTerminalTextMessage(save.world, 'formal', '较早', 2, 'morning');
    sendTerminalTextMessage(save.world, 'semi', '同日较晚', 2, 'night');
    expect(listTerminalMessageThreads(save.world, ['morning', 'afternoon', 'night']).map((thread) => thread.characterId)).toEqual(['semi', 'formal']);
    sendTerminalTextMessage(save.world, 'formal', '最新', 3, 'morning');
    expect(listTerminalMessageThreads(save.world, ['morning', 'afternoon', 'night']).map((thread) => thread.characterId)).toEqual(['formal', 'semi']);
    expect(listTerminalMessageThreads(save.world, ['morning', 'afternoon', 'night']).some((thread) => thread.characterId === 'npc')).toBe(false);
  });

  it('treats legacy outgoing pending requests as accepted without changing legacy incoming intent', () => {
    const save = makeSave();
    save.world.terminal.friendRequests.push(
      { id: 'legacy-outgoing', characterId: 'formal', direction: 'outgoing', status: 'pending', createdDay: 1, updatedDay: 1 },
      { id: 'legacy-incoming', characterId: 'semi', direction: 'incoming', status: 'pending', createdDay: 1, updatedDay: 1 },
    );
    expect(listContactCandidates(save.world).find((candidate) => candidate.id === 'formal')?.request?.status).toBe('accepted');
    expect(listContactCandidates(save.world).find((candidate) => candidate.id === 'semi')?.request?.status).toBe('pending');
    expect(buildTerminalReplyPrompt(save.world, 'formal')[0]?.content).toContain('玩家主动添加了对方');
    expect(sendTerminalTextMessage(save.world, 'formal', '旧存档也能聊天')).toMatchObject({ ok: true, changed: true });
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

  it('supports safe bidirectional transfers without changing relationship or time facts', () => {
    const save = makeSave();
    const request = createFriendRequest(save.world, 'formal', 'outgoing');
    simulateFriendAcceptance(save.world, request.request!.id);
    save.world.player.stats.money = 100;
    const before = JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory });

    expect(sendPlayerTransfer(save.world, 'formal', 'default', 25)).toMatchObject({ ok: true, changed: true, request: { direction: 'outgoing', status: 'accepted', amount: 25 } });
    expect(save.world.player.stats.money).toBe(75);
    expect(listTerminalTransfers(save.world, 'formal')).toHaveLength(1);

    const incoming = createIncomingTransferProposal(save.world, 'formal', 'default', 40);
    expect(incoming).toMatchObject({ ok: true, changed: true, request: { direction: 'incoming', status: 'pending', amount: 40 } });
    expect(save.world.player.stats.money).toBe(75);
    expect(resolveIncomingTransfer(save.world, incoming.request!.id, 'accept')).toMatchObject({ ok: true, changed: true, request: { status: 'accepted' } });
    expect(save.world.player.stats.money).toBe(115);
    expect(resolveIncomingTransfer(save.world, incoming.request!.id, 'accept').changed).toBe(false);
    expect(JSON.stringify({ relations: save.world.relations, clock: save.world.clock, events: save.world.eventHistory })).toBe(before);
  });

  it('applies only a validated terminal transfer proposal without directly changing balance', () => {
    const save = makeSave();
    createFriendRequest(save.world, 'formal', 'outgoing');
    save.world.player.stats.money = 100;
    const registry = createTerminalOpRegistry();
    const context = { world: save.world, actorId: 'formal', day: 1, slotId: 'morning', nodeId: 'start', log: () => undefined };
    const accepted = registry.applyAll([{ op: 'terminal_transfer_proposal', characterId: 'formal', currencyId: 'default', amount: 12 }], context, 1);
    expect(accepted).toMatchObject({ applied: 1, rejected: [], truncated: 0 });
    expect(save.world.player.stats.money).toBe(100);
    expect(listTerminalTransfers(save.world, 'formal').at(-1)).toMatchObject({ direction: 'incoming', status: 'pending', amount: 12 });

    const before = save.world.terminal.transferRequests.length;
    expect(registry.applyAll([{ op: 'terminal_transfer_proposal', characterId: 'semi', currencyId: 'default', amount: 5 }], context, 1).rejected).toHaveLength(1);
    expect(registry.applyAll([{ op: 'terminal_transfer_proposal', characterId: 'formal', currencyId: 'missing', amount: 5 }], context, 1).rejected).toHaveLength(1);
    expect(registry.applyAll([{ op: 'terminal_transfer_proposal', characterId: 'formal', currencyId: 'default', amount: 0.5 }], context, 1).rejected).toHaveLength(1);
    expect(registry.applyAll([{ op: 'adjust_relation_axis', target: 'formal', key: 'trust', delta: 1 }], context, 1).warnings).toContain('Unregistered op discarded: adjust_relation_axis');
    expect(save.world.terminal.transferRequests).toHaveLength(before);
    expect(save.world.player.stats.money).toBe(100);
  });

  it('rejects invalid, unsafe, insufficient and non-friend transfers', () => {
    const save = makeSave();
    save.world.player.stats.money = 10;
    expect(sendPlayerTransfer(save.world, 'formal', 'default', 1)).toMatchObject({ ok: false, changed: false });
    const request = createFriendRequest(save.world, 'formal', 'incoming');
    resolveFriendRequest(save.world, request.request!.id, 'accept');
    expect(sendPlayerTransfer(save.world, 'formal', 'missing', 1)).toMatchObject({ ok: false, changed: false });
    expect(sendPlayerTransfer(save.world, 'formal', 'default', 0)).toMatchObject({ ok: false, changed: false });
    expect(sendPlayerTransfer(save.world, 'formal', 'default', -1)).toMatchObject({ ok: false, changed: false });
    expect(sendPlayerTransfer(save.world, 'formal', 'default', 0.5)).toMatchObject({ ok: false, changed: false });
    expect(sendPlayerTransfer(save.world, 'formal', 'default', Number.NaN)).toMatchObject({ ok: false, changed: false });
    expect(sendPlayerTransfer(save.world, 'formal', 'default', Number.POSITIVE_INFINITY)).toMatchObject({ ok: false, changed: false });
    expect(sendPlayerTransfer(save.world, 'formal', 'default', 11)).toMatchObject({ ok: false, changed: false });
    const incoming = createIncomingTransferProposal(save.world, 'formal', 'default', 5);
    expect(incoming.ok).toBe(true);
    expect(resolveIncomingTransfer(save.world, incoming.request!.id, 'reject')).toMatchObject({ ok: true, changed: true, request: { status: 'rejected' } });
    expect(resolveIncomingTransfer(save.world, incoming.request!.id, 'reject').changed).toBe(false);
    expect(save.world.player.stats.money).toBe(10);
  });
});
