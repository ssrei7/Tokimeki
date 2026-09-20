import { describe, expect, it } from 'vitest';

import { attachTerminalVoiceToMessage, createFriendRequest, editTerminalMessage, sendTerminalReplyMessage, sendTerminalTextMessage, sendTerminalVoiceMessage, simulateFriendAcceptance } from '../src/core/terminal';
import { migrateSave } from '../src/data/migrations';
import { TtsConfigSchema, type TtsConfig } from '../src/providers/types';
import { buildSpeechRequest, speechCacheFingerprint, synthesizeSpeech } from '../src/providers/speech';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

function makeSave() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'terminal-voice', title: 'Terminal voice' }));
  save.world.characters.formal = {
    id: 'formal', name: '正式角色', tier: 'formal',
    card: { description: '正式', personality: '稳重' },
    visuals: { portraits: [] }, homeNodeId: 'start', schedule: { grid: {}, overrides: {} },
  };
  return save;
}

function config(overrides: Partial<TtsConfig> = {}): TtsConfig {
  return TtsConfigSchema.parse({ id: 'tts', enabled: true, endpoint: 'https://speech.test/v1/audio/speech', model: 'voice-model', voice: 'alloy', format: 'mp3', requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: new Date().toISOString(), ...overrides });
}

describe('terminal voice', () => {
  it('migrates v39 terminal messages through the current schema without changing existing facts', () => {
    const save = makeSave();
    const legacy = structuredClone(save) as Record<string, unknown>;
    legacy.schemaVersion = 39;
    const migrated = migrateSave(legacy);
    expect(migrated.schemaVersion).toBe(42);
    expect(migrated.world.terminal.messageThreads).toEqual({});
    expect(migrated.world.player.stats.money).toBe(save.world.player.stats.money);
  });

  it('stores voice asset metadata and prevents duplicate request insertion', () => {
    const save = makeSave();
    const request = createFriendRequest(save.world, 'formal', 'outgoing');
    simulateFriendAcceptance(save.world, request.request!.id);
    const first = sendTerminalVoiceMessage(save.world, 'formal', '你好', { kind: 'stored', assetId: 'voice-1' }, 'mp3', 1200, 'request-1');
    expect(first).toMatchObject({ ok: true, changed: true, message: { type: 'voice', audioFormat: 'mp3', durationMs: 1200, voiceRequestId: 'request-1' } });
    const duplicate = sendTerminalVoiceMessage(save.world, 'formal', '你好', { kind: 'stored', assetId: 'voice-2' }, 'mp3', 1200, 'request-1');
    expect(duplicate).toMatchObject({ ok: true, changed: false, message: { asset: { assetId: 'voice-1' } } });
  });

  it('attaches audio to one character text message without inserting a duplicate', () => {
    const save = makeSave();
    const request = createFriendRequest(save.world, 'formal', 'outgoing');
    simulateFriendAcceptance(save.world, request.request!.id);
    sendTerminalTextMessage(save.world, 'formal', '玩家消息');
    const reply = sendTerminalReplyMessage(save.world, 'formal', '角色消息');
    const before = save.world.terminal.messageThreads['terminal-thread-formal'].length;
    const attached = attachTerminalVoiceToMessage(save.world, 'formal', reply.message!.id, { kind: 'stored', assetId: 'voice-attachment' }, 'mp3', 900, 'request-attachment');
    expect(attached).toMatchObject({ ok: true, changed: true, message: { type: 'text', text: '角色消息', asset: { assetId: 'voice-attachment' } } });
    expect(save.world.terminal.messageThreads['terminal-thread-formal']).toHaveLength(before);
    expect(attachTerminalVoiceToMessage(save.world, 'formal', 'terminal-thread-formal-1', { kind: 'stored', assetId: 'invalid' }, 'mp3', 900, 'invalid')).toMatchObject({ ok: false, changed: false });
    editTerminalMessage(save.world, 'formal', reply.message!.id, '修改后的角色消息');
    expect(reply.message).not.toHaveProperty('asset');
    expect(reply.message).not.toHaveProperty('voiceRequestId');
  });

  it('sends one explicit OpenAI-compatible speech request and returns audio', async () => {
    const calls: Request[] = [];
    const result = await synthesizeSpeech(config(), '你好', {
      fetchImpl: async (input, init) => {
        calls.push(new Request(input, init));
        return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://speech.test/v1/audio/speech');
    expect(await calls[0].json()).toEqual({ model: 'voice-model', input: '你好', voice: 'alloy', response_format: 'mp3' });
    expect(result.format).toBe('mp3');
    expect(result.blob.size).toBe(3);
  });

  it('supports named configs, custom headers, and keeps the API key out of the request body', () => {
    const named = config({ id: 'azure-like', name: '工作室语音', apiKey: 'secret', headers: { 'x-client': 'tokimeki', Authorization: 'custom' } });
    const request = buildSpeechRequest(named, '  你好  ');
    expect(request.url).toBe('https://speech.test/v1/audio/speech');
    expect(request.init.headers).toMatchObject({ 'x-client': 'tokimeki', Authorization: 'Bearer ' + 'secret' });
    expect(String(request.init.body)).not.toContain('secret');
    expect(JSON.parse(String(request.init.body))).toEqual({ model: 'voice-model', input: '你好', voice: 'alloy', response_format: 'mp3' });
  });

  it('builds a stable cache fingerprint without including the API key', () => {
    const first = speechCacheFingerprint(config({ id: 'voice-a', apiKey: 'secret-one', headers: { 'x-client': 'tokimeki' } }), '  你好   世界 ');
    const same = speechCacheFingerprint(config({ id: 'voice-a', apiKey: 'secret-two', headers: { 'x-client': 'tokimeki' } }), '你好 世界');
    const changed = speechCacheFingerprint(config({ id: 'voice-a', apiKey: 'secret-two', voice: 'nova', headers: { 'x-client': 'tokimeki' } }), '你好 世界');
    expect(first).toBe(same);
    expect(changed).not.toBe(first);
    expect(first).not.toContain('secret');
  });

  it('accepts legacy singleton config data without a name and defaults it for migration', () => {
    const legacy = TtsConfigSchema.parse({ id: 'tts', enabled: false, endpoint: '', model: '', voice: 'alloy', format: 'mp3', requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: new Date().toISOString() });
    expect(legacy.name).toBe('默认语音');
    expect(legacy.id).toBe('tts');
  });

  it('keeps speech disabled by default and reports failed responses', async () => {
    expect(TtsConfigSchema.parse({ id: 'tts', updatedAt: new Date().toISOString() }).enabled).toBe(false);
    await expect(synthesizeSpeech(config(), '你好', { fetchImpl: async () => new Response('bad', { status: 500 }) })).rejects.toThrow('HTTP 500');
  });
});
