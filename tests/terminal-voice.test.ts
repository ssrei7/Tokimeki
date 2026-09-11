import { describe, expect, it } from 'vitest';

import { createFriendRequest, sendTerminalVoiceMessage, simulateFriendAcceptance } from '../src/core/terminal';
import { migrateSave } from '../src/data/migrations';
import { TtsConfigSchema, type TtsConfig } from '../src/providers/types';
import { synthesizeSpeech } from '../src/providers/speech';
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
    expect(migrated.schemaVersion).toBe(41);
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

  it('keeps speech disabled by default and reports failed responses', async () => {
    expect(TtsConfigSchema.parse({ id: 'tts', updatedAt: new Date().toISOString() }).enabled).toBe(false);
    await expect(synthesizeSpeech(config(), '你好', { fetchImpl: async () => new Response('bad', { status: 500 }) })).rejects.toThrow('HTTP 500');
  });
});
